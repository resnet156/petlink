import { encodeWifiCommand, parseSerialLine, SERIAL_LINE_LIMIT, type WifiDeviceStatus, type WifiSerialMessage } from '@/domain/serialWifi'

// Minimal interfaces keep the adapter testable without accessing any real USB device.
export type WifiSerialPort = {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; bufferSize: number }): Promise<void>
  close(): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
  setSignals?(signals: { dataTerminalReady: boolean; requestToSend: boolean }): Promise<void>
}
export type WifiSerialApi = {
  requestPort(options: { filters: { usbVendorId: number; usbProductId: number }[] }): Promise<WifiSerialPort>
  getPorts(): Promise<WifiSerialPort[]>
}
export const COLLAR_USB_FILTER = { usbVendorId: 0x303a, usbProductId: 0x1001 }
export function wifiSerialApi(): WifiSerialApi | null {
  return window.isSecureContext ? (navigator as Navigator & { serial?: WifiSerialApi }).serial ?? null : null
}

type Waiter = { accept: (message: WifiSerialMessage) => boolean; finish: (message?: WifiSerialMessage, error?: Error) => void }
const abortError = () => new DOMException('操作已取消', 'AbortError')

/** Uses direct streams as documented by Chrome. Never logs input or raw serial lines.
 * https://developer.chrome.com/docs/capabilities/serial#close-port
 */
export class WifiSerialConnection {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private readTask: Promise<void> | null = null
  private writeTask: Promise<void> | null = null
  private closeTask: Promise<void> | null = null
  private buffer = ''
  private discarding = false
  private closing = false
  private opened = false
  private waiters = new Set<Waiter>()

  constructor(readonly port: WifiSerialPort) {}

  async open() {
    await this.port.open({ baudRate: 115200, bufferSize: 16_384 })
    this.opened = true
    if (this.closing) { await this.port.close(); this.opened = false; throw abortError() }
    await this.port.setSignals?.({ dataTerminalReady: false, requestToSend: false })
    if (!this.port.readable || !this.port.writable) throw new Error('串口没有可用的数据通道')
    this.reader = this.port.readable.getReader()
    this.readTask = this.read()
  }

  private async read() {
    const decoder = new TextDecoder()
    const reader = this.reader!
    try {
      while (!this.closing) {
        const { value, done } = await reader.read()
        if (done) break
        for (const character of decoder.decode(value, { stream: true })) {
          if (character === '\n') {
            if (!this.discarding) {
              const message = parseSerialLine(this.buffer)
              if (message) for (const waiter of [...this.waiters]) if (waiter.accept(message)) waiter.finish(message)
            }
            this.buffer = ''; this.discarding = false
          } else if (!this.discarding) {
            this.buffer += character
            if (this.buffer.length > SERIAL_LINE_LIMIT) { this.buffer = ''; this.discarding = true }
          }
        }
      }
    } catch { /* Disconnects and cancelled reads are reported without raw device output. */ }
    finally {
      reader.releaseLock()
      if (this.reader === reader) this.reader = null
      this.failWaiters(new Error('USB 串口已断开，请重新选择设备'))
    }
  }

  private failWaiters(error: Error) { for (const waiter of [...this.waiters]) waiter.finish(undefined, error) }

  private async write(command: string) {
    if (this.closing || !this.port.writable || this.writer) throw new Error('串口暂不可写，请重新连接')
    const writer = this.port.writable.getWriter()
    this.writer = writer
    const task = writer.write(new TextEncoder().encode(command))
    this.writeTask = task
    try { await task }
    finally { writer.releaseLock(); if (this.writer === writer) { this.writer = null; this.writeTask = null } }
  }

  private async request(command: string, kind: WifiSerialMessage['kind'], signal: AbortSignal, timeout: number, resetBuffer = false) {
    if (signal.aborted || this.closing) throw abortError()
    if (this.waiters.size) throw new Error('设备正在处理上一条指令')
    if (resetBuffer) { this.buffer = ''; this.discarding = false }
    let pending: Waiter
    const response = new Promise<WifiSerialMessage>((resolve, reject) => {
      const finish = (message?: WifiSerialMessage, error?: Error) => {
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        this.waiters.delete(pending)
        if (error) reject(error)
        else if (message) resolve(message)
      }
      const onAbort = () => finish(undefined, abortError())
      const timer = setTimeout(() => finish(undefined, new Error('设备响应超时，请确认 USB 连接和固件版本')), timeout)
      pending = { accept: (message) => message.kind === kind, finish }
      this.waiters.add(pending)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      // Both handlers are attached immediately, even if cancellation beats a slow write.
      const [message] = await Promise.all([response, this.write(command)])
      return message
    } finally { pending!.finish(undefined, abortError()) }
  }

  async status(signal: AbortSignal, timeout = 2500): Promise<WifiDeviceStatus> {
    const result = await this.request('STATUS\n', 'status', signal, timeout)
    if (result.kind !== 'status') throw new Error('设备状态格式无效')
    return result.status
  }

  async saveWifi(ssid: string, password: string, signal: AbortSignal) {
    return this.request(encodeWifiCommand(ssid, password), 'config', signal, 8000, true)
  }

  close(): Promise<void> {
    if (this.closeTask) return this.closeTask
    this.closing = true
    this.failWaiters(abortError())
    this.closeTask = (async () => {
      await Promise.allSettled([this.reader?.cancel(), this.writer?.abort()])
      await Promise.allSettled([this.readTask, this.writeTask])
      if (this.opened) { try { await this.port.close() } catch { /* Already unplugged. */ } }
      this.opened = false
      this.buffer = ''
    })()
    return this.closeTask
  }
}

export function waitForSerial(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return }
    const onAbort = () => { clearTimeout(timer); reject(abortError()) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
