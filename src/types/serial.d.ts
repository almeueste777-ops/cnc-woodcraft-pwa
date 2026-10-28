// Web Serial API types
export interface SerialPortFilter {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

export interface SerialOptions {
  baudRate: number
  dataBits?: number
  stopBits?: number
  parity?: 'none' | 'even' | 'odd'
  bufferSize?: number
  flowControl?: 'none' | 'hardware'
}

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>
      getPorts(): Promise<SerialPort[]>
    }
  }

  interface SerialPort {
    open(options: SerialOptions): Promise<void>
    close(): Promise<void>
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
    getInfo(): SerialPortInfo
  }
}
