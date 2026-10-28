import type { CNCStatus } from '../types/cnc'

export type MessageListener = (line: string, direction: 'in' | 'out') => void
export type StatusListener = (status: CNCStatus) => void
export type ProgressListener = (current: number, total: number) => void

export class CNCSerialManager {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private keepReading = false
  private pollIntervalId: any = null

  private status: CNCStatus = {
    connected: false,
    isSimulated: false,
    state: 'Disconnected',
    mPos: { x: 0, y: 0, z: 0 },
    wPos: { x: 0, y: 0, z: 0 },
    feedRate: 0,
    spindleSpeed: 0
  }

  // Coadă de streaming G-Code
  private isStreaming = false
  private isPaused = false
  private gcodeQueue: string[] = []
  private currentLineIndex = 0
  private awaitingOk = false

  private messageListeners: Set<MessageListener> = new Set()
  private statusListeners: Set<StatusListener> = new Set()
  private progressListeners: Set<ProgressListener> = new Set()

  public addMessageListener(l: MessageListener) { this.messageListeners.add(l) }
  public removeMessageListener(l: MessageListener) { this.messageListeners.delete(l) }

  public addStatusListener(l: StatusListener) {
    this.statusListeners.add(l)
    l(this.status)
  }
  public removeStatusListener(l: StatusListener) { this.statusListeners.delete(l) }

  public addProgressListener(l: ProgressListener) { this.progressListeners.add(l) }
  public removeProgressListener(l: ProgressListener) { this.progressListeners.delete(l) }

  private notifyStatus() {
    this.statusListeners.forEach(l => l({ ...this.status }))
  }

  private notifyMessage(msg: string, dir: 'in' | 'out') {
    this.messageListeners.forEach(l => l(msg, dir))
  }

  private notifyProgress() {
    this.progressListeners.forEach(l => l(this.currentLineIndex, this.gcodeQueue.length))
  }

  /**
   * Conectare fizică prin Web Serial USB
   */
  public async connectSerial(baudRate = 115200): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API nu este suportat în acest browser. Folosiți Google Chrome, Microsoft Edge sau Opera.')
    }

    try {
      this.port = await navigator.serial!.requestPort()
      await this.port.open({ baudRate })

      this.keepReading = true
      this.status.connected = true
      this.status.isSimulated = false
      this.status.state = 'Idle'
      this.notifyStatus()
      this.notifyMessage(`Conectat la CNC (Baud rate: ${baudRate})`, 'in')

      this.startReading()
      this.startPolling()

      // Reset soft inițial pentru GRBL
      await this.sendCommand('\x18')
      await this.sendCommand('$X') // Deblocare alarmă inițială

      return true
    } catch (err: any) {
      this.notifyMessage(`Eroare conectare: ${err.message}`, 'in')
      await this.disconnect()
      return false
    }
  }

  /**
   * Activează modul Virtual / Simulator pentru teste fără CNC fizic
   */
  public connectSimulation() {
    this.status = {
      connected: true,
      isSimulated: true,
      state: 'Idle',
      mPos: { x: 0, y: 0, z: 0 },
      wPos: { x: 0, y: 0, z: 0 },
      feedRate: 1500,
      spindleSpeed: 12000
    }
    this.notifyStatus()
    this.notifyMessage('CNC Virtual Activat (Mod Simulare Offline). Puteți testa comenzi, mișcări și streaming.', 'in')
    this.notifyMessage('Grbl 1.1h [\'$\' for help]', 'in')
  }

  /**
   * Deconectare port serial
   */
  public async disconnect() {
    this.keepReading = false
    this.stopPolling()
    this.stopStreaming()

    if (this.reader) {
      try {
        await this.reader.cancel()
        this.reader.releaseLock()
      } catch (e) { /* ignore */ }
      this.reader = null
    }

    if (this.writer) {
      try {
        await this.writer.close()
        this.writer.releaseLock()
      } catch (e) { /* ignore */ }
      this.writer = null
    }

    if (this.port) {
      try {
        await this.port.close()
      } catch (e) { /* ignore */ }
      this.port = null
    }

    this.status.connected = false
    this.status.isSimulated = false
    this.status.state = 'Disconnected'
    this.notifyStatus()
    this.notifyMessage('Deconectat de la utilaj.', 'in')
  }

  /**
   * Trimite o linie de comandă sau G-code
   */
  public async sendCommand(cmd: string) {
    const trimmed = cmd.trim()
    if (!trimmed) return

    this.notifyMessage(trimmed, 'out')

    if (this.status.isSimulated) {
      this.handleSimulatedCommand(trimmed)
      return
    }

    if (!this.port || !this.port.writable) return

    const encoder = new TextEncoder()
    const data = encoder.encode(trimmed + '\n')

    if (!this.writer) {
      this.writer = this.port.writable.getWriter()
    }

    await this.writer.write(data)
    this.writer.releaseLock()
    this.writer = null
  }

  /**
   * Trimitere caracter de control în timp real (Feed Hold '!', Resume '~', Soft Reset 0x18)
   */
  public async sendRealtimeChar(char: string) {
    if (this.status.isSimulated) {
      if (char === '!') {
        this.status.state = 'Hold'
        this.isPaused = true
        this.notifyStatus()
        this.notifyMessage('[Virtual] Pauză activată (!)', 'in')
      } else if (char === '~') {
        this.status.state = 'Run'
        this.isPaused = false
        this.notifyStatus()
        this.notifyMessage('[Virtual] Reluare lucru (~)', 'in')
        this.processNextStreamLine()
      } else if (char === '\x18') {
        this.stopStreaming()
        this.status.state = 'Alarm'
        this.notifyStatus()
        this.notifyMessage('[Virtual] STOP DE URGENȚĂ (Reset)', 'in')
      }
      return
    }

    if (!this.port || !this.port.writable) return
    const encoder = new TextEncoder()
    const writer = this.port.writable.getWriter()
    await writer.write(encoder.encode(char))
    writer.releaseLock()
  }

  /**
   * Jogging (Mișcare manuală axe)
   */
  public async jog(axis: 'X' | 'Y' | 'Z', distanceMm: number, feedRateMmMin = 1000) {
    // Comandă GRBL jog sau deplasare relativă
    const cmd = `$J=G21G91${axis}${distanceMm.toFixed(2)}F${feedRateMmMin}`
    await this.sendCommand(cmd)
  }

  /**
   * Setare Origine Lucru (X0 Y0 Z0)
   */
  public async zeroWorkCoordinates(axis?: 'X' | 'Y' | 'Z') {
    if (axis) {
      await this.sendCommand(`G10 L20 P1 ${axis}0`)
    } else {
      await this.sendCommand('G10 L20 P1 X0 Y0 Z0')
    }
  }

  /**
   * Revenire la Origine (G0 X0 Y0 Z5)
   */
  public async goToZero() {
    await this.sendCommand('G0 Z5')
    await this.sendCommand('G0 X0 Y0')
  }

  /**
   * Pornire streaming G-Code
   */
  public startStreaming(gcodeText: string) {
    const rawLines = gcodeText.split('\n')
    // Curățare linii goale și comentarii curate
    this.gcodeQueue = rawLines
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith(';'))

    if (this.gcodeQueue.length === 0) return

    this.isStreaming = true
    this.isPaused = false
    this.currentLineIndex = 0
    this.awaitingOk = false
    this.status.state = 'Run'
    this.notifyStatus()
    this.notifyProgress()
    this.notifyMessage(`Pornit streaming G-Code: ${this.gcodeQueue.length} linii de trimis...`, 'in')

    this.processNextStreamLine()
  }

  public pauseStreaming() {
    this.isPaused = true
    this.sendRealtimeChar('!')
  }

  public resumeStreaming() {
    this.isPaused = false
    this.sendRealtimeChar('~')
  }

  public stopStreaming() {
    this.isStreaming = false
    this.isPaused = false
    this.gcodeQueue = []
    this.currentLineIndex = 0
    this.awaitingOk = false
    this.notifyProgress()
    if (this.status.connected) {
      this.status.state = 'Idle'
      this.notifyStatus()
    }
  }

  private async processNextStreamLine() {
    if (!this.isStreaming || this.isPaused) return

    if (this.currentLineIndex >= this.gcodeQueue.length) {
      this.notifyMessage('Execuție G-Code finalizată cu succes!', 'in')
      this.stopStreaming()
      return
    }

    const line = this.gcodeQueue[this.currentLineIndex]
    this.awaitingOk = true
    await this.sendCommand(line)

    if (this.status.isSimulated) {
      // Simulează timp de răspuns ok și avans
      setTimeout(() => {
        this.onOkReceived()
      }, 15)
    }
  }

  private onOkReceived() {
    if (!this.isStreaming || !this.awaitingOk) return
    this.awaitingOk = false
    this.currentLineIndex++
    this.notifyProgress()

    if (!this.isPaused) {
      this.processNextStreamLine()
    }
  }

  /**
   * Bucla continuă de citire de pe portul serial
   */
  private async startReading() {
    if (!this.port || !this.port.readable) return
    let buffer = ''

    try {
      while (this.port.readable && this.keepReading) {
        this.reader = this.port.readable.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value) {
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const rawLine of lines) {
              const line = rawLine.trim()
              if (!line) continue
              this.handleIncomingLine(line)
            }
          }
        }
      }
    } catch (e) {
      // Port deconectat
    } finally {
      if (this.reader) {
        try { this.reader.releaseLock() } catch (e) {}
        this.reader = null
      }
    }
  }

  private handleIncomingLine(line: string) {
    this.notifyMessage(line, 'in')

    // Parse status line: <Idle|MPos:0.000,0.000,0.000|WPos:0.000,0.000,0.000|FS:0,0>
    if (line.startsWith('<') && line.endsWith('>')) {
      this.parseGrblStatus(line)
      return
    }

    if (line === 'ok') {
      this.onOkReceived()
    } else if (line.startsWith('error:')) {
      this.notifyMessage(`AVERTIZARE CNC: ${line}`, 'in')
      this.onOkReceived() // Continua dar raporteaza
    } else if (line.startsWith('ALARM:')) {
      this.status.state = 'Alarm'
      this.notifyStatus()
    }
  }

  private parseGrblStatus(line: string) {
    const content = line.slice(1, -1)
    const parts = content.split('|')
    const stateStr = parts[0] as any

    this.status.state = stateStr

    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]
      if (p.startsWith('WPos:')) {
        const coords = p.slice(5).split(',').map(Number)
        this.status.wPos = { x: coords[0] || 0, y: coords[1] || 0, z: coords[2] || 0 }
      } else if (p.startsWith('MPos:')) {
        const coords = p.slice(5).split(',').map(Number)
        this.status.mPos = { x: coords[0] || 0, y: coords[1] || 0, z: coords[2] || 0 }
      } else if (p.startsWith('FS:')) {
        const fs = p.slice(3).split(',').map(Number)
        this.status.feedRate = fs[0] || 0
        this.status.spindleSpeed = fs[1] || 0
      }
    }
    this.notifyStatus()
  }

  private startPolling() {
    this.stopPolling()
    this.pollIntervalId = setInterval(() => {
      if (this.status.connected && !this.status.isSimulated) {
        // Trimite interogare de stare GRBL în timp real fara newline
        this.sendRealtimeChar('?')
      }
    }, 250)
  }

  private stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  private handleSimulatedCommand(cmd: string) {
    setTimeout(() => {
      if (cmd === '$H') {
        this.status.mPos = { x: 0, y: 0, z: 0 }
        this.status.wPos = { x: 0, y: 0, z: 0 }
        this.notifyMessage('ok (Homing complet)', 'in')
      } else if (cmd.startsWith('$J=') || cmd.startsWith('G0') || cmd.startsWith('G1')) {
        // Extrage coordonate
        const matchX = cmd.match(/X([-\d.]+)/)
        const matchY = cmd.match(/Y([-\d.]+)/)
        const matchZ = cmd.match(/Z([-\d.]+)/)
        if (cmd.includes('G91')) {
          if (matchX) this.status.wPos.x += parseFloat(matchX[1])
          if (matchY) this.status.wPos.y += parseFloat(matchY[1])
          if (matchZ) this.status.wPos.z += parseFloat(matchZ[1])
        } else {
          if (matchX) this.status.wPos.x = parseFloat(matchX[1])
          if (matchY) this.status.wPos.y = parseFloat(matchY[1])
          if (matchZ) this.status.wPos.z = parseFloat(matchZ[1])
        }
        this.notifyStatus()
        this.notifyMessage('ok', 'in')
      } else if (cmd.includes('G10 L20')) {
        if (cmd.includes('X0')) this.status.wPos.x = 0
        if (cmd.includes('Y0')) this.status.wPos.y = 0
        if (cmd.includes('Z0')) this.status.wPos.z = 0
        this.notifyStatus()
        this.notifyMessage('ok (Origine setata)', 'in')
      } else {
        this.notifyMessage('ok', 'in')
      }
    }, 20)
  }
}

// Instanță unică (Singleton) pentru toată aplicația
export const cncController = new CNCSerialManager()
