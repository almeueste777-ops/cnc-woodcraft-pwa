import type { CNCStatus } from '../types/cnc'

export type MessageListener = (line: string, direction: 'in' | 'out') => void
export type StatusListener = (status: CNCStatus) => void
export type ProgressListener = (current: number, total: number) => void

// grbl09 = GRBL 0.9: alt format de stare și fără jog $J=
type Firmware = 'grbl' | 'grbl09' | 'marlin' | 'unknown'

// Buffer-ul de recepție GRBL are 128 de octeți; păstrăm o marjă
const GRBL_RX_BUFFER = 120

export class CNCSerialManager {
  private port: SerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  // un singur writer pe toată durata conexiunii: scrierile se pun automat la coadă,
  // așa că interogarea de stare '?' nu se mai bate cu liniile de G-code
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private keepReading = false
  private pollIntervalId: ReturnType<typeof setInterval> | null = null
  private firmware: Firmware = 'unknown'
  private wco = { x: 0, y: 0, z: 0 }
  private encoder = new TextEncoder()
  // înălțimea Z (coordonate de lucru) la care e sigur să te deplasezi peste piesă;
  // aplicația o setează din job (Z siguranță + grosimea lemnului dacă Z0 e pe masă)
  public safeRetractZ = 5
  private rawState = ''

  private get isGrbl() { return this.firmware === 'grbl' || this.firmware === 'grbl09' }

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
  private nextToSend = 0
  private acknowledged = 0
  private inFlight: number[] = [] // lungimile liniilor trimise și neconfirmate încă
  private simTimer: ReturnType<typeof setTimeout> | null = null

  private messageListeners: Set<MessageListener> = new Set()
  private statusListeners: Set<StatusListener> = new Set()
  private progressListeners: Set<ProgressListener> = new Set()

  public addMessageListener(l: MessageListener) { this.messageListeners.add(l) }
  public removeMessageListener(l: MessageListener) { this.messageListeners.delete(l) }

  public addStatusListener(l: StatusListener) {
    this.statusListeners.add(l)
    l({ ...this.status })
  }
  public removeStatusListener(l: StatusListener) { this.statusListeners.delete(l) }

  public addProgressListener(l: ProgressListener) { this.progressListeners.add(l) }
  public removeProgressListener(l: ProgressListener) { this.progressListeners.delete(l) }

  public get streaming() { return this.isStreaming }

  private notifyStatus() {
    this.statusListeners.forEach(l => l({ ...this.status }))
  }

  private notifyMessage(msg: string, dir: 'in' | 'out') {
    this.messageListeners.forEach(l => l(msg, dir))
  }

  private notifyProgress() {
    this.progressListeners.forEach(l => l(this.acknowledged, this.gcodeQueue.length))
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
      this.writer = this.port.writable!.getWriter()

      this.keepReading = true
      this.firmware = 'unknown'
      this.wco = { x: 0, y: 0, z: 0 }
      this.status.connected = true
      this.status.isSimulated = false
      this.status.state = 'Idle'
      this.notifyStatus()
      this.notifyMessage(`Conectat la CNC (Baud rate: ${baudRate}). Se așteaptă mesajul controlerului...`, 'in')

      this.startReading()
      this.startPolling()

      // Deschiderea portului resetează majoritatea plăcilor Arduino; cerem informații
      // despre firmware. Alarma NU se deblochează automat: dacă mașina cere homing,
      // utilizatorul decide ($H sau $X).
      // plăcile cu USB nativ nu se resetează la conectare și nu trimit mesajul de pornire:
      // le întrebăm noi (linie goală întâi, ca să curețe orice rest din bufferul lor)
      setTimeout(() => {
        if (this.firmware === 'unknown') this.write('\n$I\n')
      }, 2000)
      setTimeout(() => {
        if (this.firmware === 'unknown') this.write('M115\n')
      }, 3000)

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
    this.firmware = 'grbl'
    this.status = {
      connected: true,
      isSimulated: true,
      state: 'Idle',
      mPos: { x: 0, y: 0, z: 0 },
      wPos: { x: 0, y: 0, z: 0 },
      feedRate: 0,
      spindleSpeed: 0
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
    this.abortStream()

    if (this.reader) {
      try { await this.reader.cancel() } catch { /* ignore */ }
      try { this.reader.releaseLock() } catch { /* ignore */ }
      this.reader = null
    }

    if (this.writer) {
      try { this.writer.releaseLock() } catch { /* ignore */ }
      this.writer = null
    }

    if (this.port) {
      try { await this.port.close() } catch { /* ignore */ }
      this.port = null
    }

    this.status.connected = false
    this.status.isSimulated = false
    this.status.state = 'Disconnected'
    this.notifyStatus()
    this.notifyMessage('Deconectat de la utilaj.', 'in')
  }

  private async write(text: string) {
    if (!this.writer) return
    try {
      await this.writer.write(this.encoder.encode(text))
    } catch (err: any) {
      this.notifyMessage(`Eroare scriere port: ${err.message}`, 'in')
    }
  }

  /**
   * Trimite o linie de comandă sau G-code (manual, din consolă/jog)
   */
  public async sendCommand(cmd: string) {
    const trimmed = cmd.trim()
    if (!trimmed) return
    if (this.isStreaming) {
      // și în pauză: bufferul GRBL e plin cu liniile lucrării; o comandă în plus l-ar
      // depăși, iar răspunsul ei ar fi numărat drept confirmarea unei linii din lucrare
      this.notifyMessage('Comandă ignorată: o lucrare e în curs (și în pauză). Opriți lucrarea întâi.', 'in')
      return
    }

    this.notifyMessage(trimmed, 'out')

    if (this.status.isSimulated) {
      this.handleSimulatedCommand(trimmed)
      return
    }
    await this.write(trimmed + '\n')
  }

  /**
   * Trimitere caracter de control în timp real (Feed Hold '!', Resume '~', Soft Reset 0x18)
   */
  public async sendRealtimeChar(char: string) {
    if (this.status.isSimulated) {
      if (char === '!') {
        this.status.state = 'Hold'
        this.isPaused = true
        this.notifyMessage('[Virtual] Pauză activată (!)', 'in')
      } else if (char === '~') {
        this.status.state = this.isStreaming ? 'Run' : 'Idle'
        this.isPaused = false
        this.notifyMessage('[Virtual] Reluare lucru (~)', 'in')
        this.scheduleSimStream()
      } else if (char === '\x18') {
        this.abortStream()
        this.status.state = 'Idle'
        this.notifyMessage('[Virtual] Reset — mișcare oprită, arbore oprit', 'in')
      }
      this.notifyStatus()
      return
    }

    if (char === '\x18' && this.isStreaming) {
      // resetul golește bufferul controlerului: liniile din el nu vor mai fi confirmate
      this.abortStream()
      this.status.state = 'Idle'
      this.notifyStatus()
      this.notifyMessage('STOP DE URGENȚĂ — lucrarea a fost anulată. Refaceți originea înainte de o nouă pornire.', 'in')
    }
    if (this.firmware === 'marlin') {
      // Marlin nu are caractere în timp real: pauza/reluarea se fac doar oprind
      // trimiterea; oprirea de urgență e M112 (cere apoi reset la placă)
      if (char === '\x18') await this.write('M112\n')
      return
    }
    if (char === '?' && !this.isGrbl) return
    await this.write(char)
  }

  /**
   * Jogging (Mișcare manuală axe)
   */
  public async jog(axis: 'X' | 'Y' | 'Z', distanceMm: number, feedRateMmMin = 1000) {
    if (this.firmware === 'marlin' || this.firmware === 'grbl09') {
      // fără $J=: mișcare relativă într-o singură linie, ca nimic să nu se intercaleze
      await this.sendCommand(`G91 G0 ${axis}${distanceMm.toFixed(2)} F${feedRateMmMin}`)
      await this.sendCommand(`G90`)
      return
    }
    await this.sendCommand(`$J=G21G91${axis}${distanceMm.toFixed(2)}F${feedRateMmMin}`)
  }

  /**
   * Setare Origine Lucru (X0 Y0 Z0)
   */
  public async zeroWorkCoordinates(axis?: 'X' | 'Y' | 'Z' | 'XY') {
    const axes = axis === 'XY' ? 'X0 Y0' : axis ? `${axis}0` : 'X0 Y0 Z0'
    await this.sendCommand(this.firmware === 'marlin' ? `G92 ${axes}` : `G10 L20 P1 ${axes}`)
  }

  /**
   * Revenire la Origine (ridicare Z apoi X0 Y0)
   */
  public async goToZero() {
    // ridicare la înălțimea sigură a lucrării (cu Z0 pe masă, „Z5” ar fi în lemn)
    await this.sendCommand(`G90 G0 Z${this.safeRetractZ.toFixed(2)}`)
    await this.sendCommand('G0 X0 Y0')
  }

  /**
   * Pornire streaming G-Code
   */
  public startStreaming(gcodeText: string) {
    this.gcodeQueue = gcodeText
      .split('\n')
      .map(l => l.replace(/;.*$/, '').replace(/\([^)]*\)/g, '').trim())
      .filter(l => l.length > 0 && l !== '%')

    if (this.gcodeQueue.length === 0) return

    this.isStreaming = true
    this.isPaused = false
    this.nextToSend = 0
    this.acknowledged = 0
    this.inFlight = []
    this.status.state = 'Run'
    this.notifyStatus()
    this.notifyProgress()
    this.notifyMessage(`Pornit streaming G-Code: ${this.gcodeQueue.length} linii de trimis...`, 'in')

    if (this.status.isSimulated) this.scheduleSimStream()
    else this.pumpStream()
  }

  public pauseStreaming() {
    this.sendRealtimeChar('!')
    this.isPaused = true
  }

  public resumeStreaming() {
    this.isPaused = false
    this.sendRealtimeChar('~')
    if (!this.status.isSimulated) this.pumpStream()
  }

  /**
   * STOP: oprește mișcarea imediat (feed hold), apoi resetează controlerul ca să
   * golească bufferul și să oprească arborele. Doar golirea cozii din aplicație nu
   * ar opri mașina — ea ar executa în continuare ce are deja în buffer.
   */
  public async stopStreaming() {
    const wasStreaming = this.isStreaming
    this.abortStream()
    if (this.status.connected && !this.status.isSimulated) {
      if (this.firmware === 'marlin') {
        await this.write('M410\n') // oprire rapidă, golește planificatorul
        await this.write('M5\n')
      } else {
        // resetul în timpul mișcării pierde poziția (ALARM:3): așteptăm întâi să termine
        // frânarea (GRBL raportează „Hold:0”), cel mult 3 secunde
        await this.write('!')
        const t0 = Date.now()
        while (this.rawState !== 'Hold:0' && this.rawState.split(':')[0] !== 'Idle' && Date.now() - t0 < 3000) {
          await new Promise(r => setTimeout(r, 50))
        }
        await this.write('\x18')
      }
    }
    if (wasStreaming) this.notifyMessage('Lucrare oprită. Verificați poziția și refaceți originea dacă e nevoie.', 'in')
    if (this.status.connected) {
      this.status.state = 'Idle'
      this.notifyStatus()
    }
  }

  private abortStream() {
    this.isStreaming = false
    this.isPaused = false
    this.gcodeQueue = []
    this.nextToSend = 0
    this.acknowledged = 0
    this.inFlight = []
    if (this.simTimer) { clearTimeout(this.simTimer); this.simTimer = null }
    this.notifyProgress()
  }

  /** Trimite câte linii încap: GRBL — numărare de caractere; altele — o linie odată */
  private pumpStream() {
    if (!this.isStreaming || this.isPaused) return
    while (this.nextToSend < this.gcodeQueue.length) {
      const line = this.gcodeQueue[this.nextToSend]
      const len = line.length + 1
      if (this.isGrbl) {
        const used = this.inFlight.reduce((a, b) => a + b, 0)
        if (this.inFlight.length > 0 && used + len > GRBL_RX_BUFFER) break
      } else if (this.inFlight.length > 0) {
        break
      }
      this.inFlight.push(len)
      this.nextToSend++
      this.write(line + '\n')
    }
  }

  private onAck(isError: boolean, text: string) {
    if (!this.isStreaming) return
    this.inFlight.shift()
    this.acknowledged++
    this.notifyProgress()

    if (isError) {
      // Ca UGS/Candle: la eroare ne oprim, nu trimitem mai departe la întâmplare
      const lineNo = this.acknowledged
      this.notifyMessage(`EROARE la linia ${lineNo} (${this.gcodeQueue[lineNo - 1]}): ${text}. Trimiterea s-a oprit — mașina termină ce are în buffer. Linia cu eroare NU s-a executat: Reluare sare peste ea (freza merge drept la punctul următor); de obicei e mai sigur Stop.`, 'in')
      this.isPaused = true
      this.status.state = 'Hold'
      this.notifyStatus()
      return
    }

    if (this.acknowledged >= this.gcodeQueue.length) {
      this.notifyMessage('Execuție G-Code finalizată cu succes!', 'in')
      this.isStreaming = false
      this.gcodeQueue = []
      this.inFlight = []
      this.notifyProgress()
      return
    }
    this.pumpStream()
  }

  /** Simulatorul execută liniile în loturi, ca o lucrare mare să nu dureze ore */
  private scheduleSimStream() {
    if (this.simTimer || !this.isStreaming || this.isPaused) return
    this.simTimer = setTimeout(() => {
      this.simTimer = null
      if (!this.isStreaming || this.isPaused) return
      const end = Math.min(this.gcodeQueue.length, this.acknowledged + 200)
      for (; this.acknowledged < end; this.acknowledged++) this.applySimulatedMotion(this.gcodeQueue[this.acknowledged])
      this.notifyProgress()
      this.notifyStatus()
      if (this.acknowledged >= this.gcodeQueue.length) {
        this.notifyMessage('[Virtual] Execuție G-Code finalizată cu succes!', 'in')
        this.isStreaming = false
        this.status.state = 'Idle'
        this.notifyStatus()
        return
      }
      this.scheduleSimStream()
    }, 30)
  }

  /**
   * Bucla continuă de citire de pe portul serial
   */
  private async startReading() {
    if (!this.port || !this.port.readable) return
    let buffer = ''
    const decoder = new TextDecoder()

    while (this.port && this.port.readable && this.keepReading) {
      this.reader = this.port.readable.getReader()
      try {
        while (true) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (value) {
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split(/\r?\n/)
            buffer = lines.pop() || ''
            for (const rawLine of lines) {
              const line = rawLine.trim()
              if (line) this.handleIncomingLine(line)
            }
          }
        }
      } catch (err: any) {
        // erorile de linie (BufferOverrun, Framing, Parity) nu închid portul: după ele
        // port.readable există din nou și citim mai departe cu un reader nou
        this.notifyMessage(`Eroare de citire port (${err?.name || 'necunoscută'}) — continuăm.`, 'in')
      } finally {
        try { this.reader?.releaseLock() } catch { /* ignore */ }
        this.reader = null
      }
    }
    // port pierdut de tot (cablu scos)
    if (this.keepReading) {
      this.notifyMessage('Conexiunea USB s-a întrerupt! Mașina se oprește când își golește bufferul.', 'in')
      this.disconnect()
    }
  }

  private handleIncomingLine(line: string) {
    if (line.startsWith('<') && line.endsWith('>')) {
      this.parseGrblStatus(line)
      return
    }
    this.notifyMessage(line, 'in')

    const banner = /^Grbl\s|^\[?FluidNC|grblHAL/i.test(line)
    if (banner || line.startsWith('[VER:')) {
      this.firmware = /^Grbl 0\.|\[VER:0\./.test(line) ? 'grbl09' : 'grbl'
      if (banner && this.isStreaming) {
        // controlerul s-a resetat singur în timpul lucrării: bufferul lui e pierdut
        this.abortStream()
        this.status.state = 'Idle'
        this.notifyStatus()
        this.notifyMessage('Controlerul s-a RESETAT în timpul lucrării (alimentare/zgomot electric?) — lucrarea a fost anulată.', 'in')
      }
    } else if (/Marlin|FIRMWARE_NAME/i.test(line)) {
      this.firmware = 'marlin'
    }

    if (line === 'ok' || line.startsWith('ok ')) {
      this.onAck(false, line)
    } else if (this.firmware === 'marlin' && /^Error/i.test(line)) {
      // Marlin trimite „Error:” și apoi oricum „ok”: oprim trimiterea, confirmarea vine separat
      if (this.isStreaming) {
        this.isPaused = true
        this.notifyMessage(`EROARE Marlin: ${line}. Trimiterea s-a oprit; Reluare sau Stop.`, 'in')
      }
    } else if (/^error/i.test(line)) {
      this.onAck(true, line)
    } else if (line.startsWith('ALARM:')) {
      this.status.state = 'Alarm'
      this.notifyStatus()
      if (this.isStreaming) {
        this.notifyMessage(`ALARMĂ în timpul lucrării (${line}) — lucrarea a fost oprită.`, 'in')
        this.abortStream()
      }
    }
  }

  private parseGrblStatus(line: string) {
    let body = line.slice(1, -1)
    if (!body.includes('|')) {
      // GRBL 0.9: <Idle,MPos:1.000,2.000,3.000,WPos:1.000,2.000,3.000> -> format 1.1
      body = body.replace(/,(?=[A-Za-z]+:)/g, '|')
    }
    const parts = body.split('|')
    this.rawState = parts[0]
    const stateStr = parts[0].split(':')[0] // ex. "Hold:0" -> "Hold"
    this.status.state = stateStr as CNCStatus['state']

    let gotM = false, gotW = false
    for (let i = 1; i < parts.length; i++) {
      const p = parts[i]
      const nums = (s: string) => {
        const c = s.split(',').map(Number)
        return { x: c[0] || 0, y: c[1] || 0, z: c[2] || 0 }
      }
      if (p.startsWith('WPos:')) { this.status.wPos = nums(p.slice(5)); gotW = true }
      else if (p.startsWith('MPos:')) { this.status.mPos = nums(p.slice(5)); gotM = true }
      else if (p.startsWith('WCO:')) this.wco = nums(p.slice(4))
      else if (p.startsWith('FS:')) {
        const fs = p.slice(3).split(',').map(Number)
        this.status.feedRate = fs[0] || 0
        this.status.spindleSpeed = fs[1] || 0
      } else if (p.startsWith('F:')) {
        this.status.feedRate = Number(p.slice(2)) || 0
      }
    }
    // GRBL 1.1 trimite implicit doar MPos și, din când în când, WCO: WPos = MPos - WCO
    if (gotM && !gotW) {
      const m = this.status.mPos
      this.status.wPos = { x: m.x - this.wco.x, y: m.y - this.wco.y, z: m.z - this.wco.z }
    } else if (gotW && !gotM) {
      const w = this.status.wPos
      this.status.mPos = { x: w.x + this.wco.x, y: w.y + this.wco.y, z: w.z + this.wco.z }
    }
    this.notifyStatus()
  }

  private startPolling() {
    this.stopPolling()
    this.pollIntervalId = setInterval(() => {
      // doar pe GRBL confirmat: pe Marlin (sau necunoscut) „?” s-ar lipi de linia următoare
      if (this.status.connected && !this.status.isSimulated && this.isGrbl) {
        this.write('?')
      }
    }, 250)
  }

  private stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId)
      this.pollIntervalId = null
    }
  }

  private simModal = { relative: false }

  private applySimulatedMotion(cmd: string) {
    if (/G91/.test(cmd)) this.simModal.relative = true
    if (/G90/.test(cmd)) this.simModal.relative = false
    const rel = this.simModal.relative || cmd.startsWith('$J=')
    for (const axis of ['X', 'Y', 'Z'] as const) {
      const m = cmd.match(new RegExp(axis + '(-?[\\d.]+)'))
      if (!m) continue
      const key = axis.toLowerCase() as 'x' | 'y' | 'z'
      const v = parseFloat(m[1])
      this.status.wPos[key] = rel ? this.status.wPos[key] + v : v
    }
    const f = cmd.match(/F(\d+)/)
    if (f) this.status.feedRate = Number(f[1])
    const s = cmd.match(/S(\d+)/)
    if (s) this.status.spindleSpeed = Number(s[1])
    if (/M0?5\b/.test(cmd)) this.status.spindleSpeed = 0
    this.status.mPos = { ...this.status.wPos }
  }

  private handleSimulatedCommand(cmd: string) {
    setTimeout(() => {
      if (cmd === '$H') {
        this.status.mPos = { x: 0, y: 0, z: 0 }
        this.status.wPos = { x: 0, y: 0, z: 0 }
        this.status.state = 'Idle'
        this.notifyMessage('ok (Homing complet)', 'in')
      } else if (cmd === '$X') {
        this.status.state = 'Idle'
        this.notifyMessage('[MSG:Caution: Unlocked]', 'in')
        this.notifyMessage('ok', 'in')
      } else if (cmd.includes('G10 L20') || cmd.startsWith('G92')) {
        if (cmd.includes('X0')) this.status.wPos.x = 0
        if (cmd.includes('Y0')) this.status.wPos.y = 0
        if (cmd.includes('Z0')) this.status.wPos.z = 0
        this.notifyMessage('ok (Origine setata)', 'in')
      } else {
        this.applySimulatedMotion(cmd)
        this.notifyMessage('ok', 'in')
      }
      this.notifyStatus()
    }, 20)
  }
}

// Instanță unică (Singleton) pentru toată aplicația
export const cncController = new CNCSerialManager()
