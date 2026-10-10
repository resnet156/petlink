import { ReadableStream as NodeReadableStream, WritableStream as NodeWritableStream } from 'node:stream/web'
import { describe, expect, it } from 'vitest'
import { WifiSerialConnection, type WifiSerialPort } from './wifiSerial'

const utf8 = new TextEncoder()
const status = {
  protocolVersion: 2, capabilities: ['wifi-update'], deviceId: 'collar-123', bootId: 'boot-1',
  cloudConfigured: true, wifiConfigured: true, wifiState: 'connecting', wifi: false,
  timeSynced: false, acceptedBatches: 0, lastHttp: 0, firmware: '0.2.1',
  wifiConnectAttempts: 1, wifiLastDisconnectReason: 0,
}
const ack = 'CFG {"command":"WIFI","ok":true,"wifiSaved":true,"restart":true}\n'
const flushMicrotasks = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

class FakePort implements WifiSerialPort {
  private controller!: ReadableStreamDefaultController<Uint8Array>
  readable: WifiSerialPort['readable']
  writable: WifiSerialPort['writable']
  writes: string[] = []
  openOptions?: { baudRate: number; bufferSize: number }
  closeCount = 0
  readCanceled = false
  writeAborted = false
  onWrite?: (line: string, signal: AbortSignal) => void | Promise<void>

  constructor() {
    this.readable = new NodeReadableStream<Uint8Array>({
      start: (controller) => { this.controller = controller as unknown as ReadableStreamDefaultController<Uint8Array> },
      cancel: () => { this.readCanceled = true },
    }) as unknown as ReadableStream<Uint8Array>
    this.writable = new NodeWritableStream<Uint8Array>({
      write: (bytes, controller) => {
        const line = new TextDecoder().decode(bytes)
        this.writes.push(line)
        return this.onWrite?.(line, (controller as unknown as { signal: AbortSignal }).signal)
      },
      abort: () => { this.writeAborted = true },
    }) as unknown as WritableStream<Uint8Array>
  }

  async open(options: { baudRate: number; bufferSize: number }) { this.openOptions = options }
  async close() {
    if (this.readable?.locked || this.writable?.locked) throw new Error('port.close called while streams were locked')
    this.closeCount++
  }
  getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 } }
  emit(line: string) { this.controller.enqueue(utf8.encode(line)) }
  emitBytes(bytes: Uint8Array) { this.controller.enqueue(bytes) }
}

describe('USB Wi-Fi serial transport', () => {
  it('reads fragmented UTF-8 status and ignores boot logs, telemetry, and oversized frames', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    try {
      const pending = connection.status(new AbortController().signal)
      port.emit('ESP-ROM:esp32\nPL1 {"wifi":true}\nCLOUD {"token":"hidden"}\n')
      port.emit('x'.repeat(9000))
      port.emit('STATUS {"wifi":true}\n')
      const frame = utf8.encode(`STATUS ${JSON.stringify({ ...status, ignored: '中文🦴' })}\r\n`)
      // Byte-sized chunks exercise the decoder across multibyte UTF-8 boundaries.
      for (const byte of frame) port.emitBytes(new Uint8Array([byte]))
      expect(await pending).toEqual(status)
      expect(port.writes).toEqual(['STATUS\n'])
      expect(port.openOptions).toEqual({ baudRate: 115200, bufferSize: 16_384 })
    } finally { await connection.close() }
    expect(port.readCanceled).toBe(true)
    expect(port.closeCount).toBe(1)
  })

  it('writes only a WIFI frame with exact credentials and resolves save separately from network status', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    const ssid = ' 家中"Wi-Fi '
    const password = ' pa\\ss"word '
    try {
      let settled = false
      const pending = connection.saveWifi(ssid, password, new AbortController().signal)
      void pending.then(() => { settled = true })
      port.emit(`STATUS ${JSON.stringify({ ...status, wifi: true, wifiState: 'connected' })}\n`)
      port.emit('CFG {"command":"SET","ok":true,"wifiSaved":true,"restart":true}\n')
      await flushMicrotasks()
      expect(settled).toBe(false)
      expect(port.writes).toHaveLength(1)
      expect(port.writes[0].startsWith('WIFI ')).toBe(true)
      expect(port.writes[0].match(/\n/g)).toHaveLength(1)
      expect(JSON.parse(port.writes[0].slice(5))).toEqual({ ssid, password })
      port.emit(ack)
      expect(await pending).toEqual({ kind: 'config', ok: true, wifiSaved: true, restart: true })
    } finally { await connection.close() }
    expect(port.writable?.locked).toBe(false)
    expect(port.closeCount).toBe(1)
  })

  it('waits for STATUS truth when a save ACK is received during a status request', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    try {
      let settled = false
      const pending = connection.status(new AbortController().signal)
      void pending.then(() => { settled = true })
      port.emit(ack)
      await flushMicrotasks()
      expect(settled).toBe(false)
      port.emit(`STATUS ${JSON.stringify(status)}\n`)
      expect(await pending).toMatchObject({ wifi: false, wifiState: 'connecting' })
    } finally { await connection.close() }
  })

  it('rejects an overlapping command without writing a second command', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    try {
      const pending = connection.status(new AbortController().signal)
      await expect(connection.status(new AbortController().signal)).rejects.toThrow(/上一条/)
      port.emit(`STATUS ${JSON.stringify(status)}\n`)
      await pending
      expect(port.writes).toEqual(['STATUS\n'])
    } finally { await connection.close() }
  })

  it('removes an aborted waiter so a fresh request can complete', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    try {
      const cancel = new AbortController()
      const pending = connection.status(cancel.signal)
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await flushMicrotasks()
      cancel.abort()
      await rejected
      const next = connection.status(new AbortController().signal)
      port.emit(`STATUS ${JSON.stringify(status)}\n`)
      expect(await next).toEqual(status)
    } finally { await connection.close() }
  })

  it('preserves a fragmented in-flight STATUS response when rejecting an overlapping WIFI command', async () => {
    const port = new FakePort()
    const connection = new WifiSerialConnection(port)
    await connection.open()
    try {
      const pending = connection.status(new AbortController().signal, 100)
      const frame = `STATUS ${JSON.stringify(status)}\n`
      const cut = Math.floor(frame.length / 2)
      port.emit(frame.slice(0, cut))
      await flushMicrotasks()
      await expect(connection.saveWifi('home', 'password', new AbortController().signal)).rejects.toThrow(/上一条/)
      port.emit(frame.slice(cut))
      expect(await pending).toEqual(status)
      expect(port.writes).toEqual(['STATUS\n'])
    } finally { await connection.close() }
  })

  it('cancels pending read and write, releases both locks, and closes only once', async () => {
    const port = new FakePort()
    port.onWrite = (_line, signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
    })
    const connection = new WifiSerialConnection(port)
    await connection.open()
    const cancel = new AbortController()
    const pending = connection.saveWifi('home', 'password', cancel.signal)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await flushMicrotasks()
    expect(port.readable?.locked).toBe(true)
    expect(port.writable?.locked).toBe(true)
    cancel.abort()
    await rejected
    const closing = connection.close()
    expect(connection.close()).toBe(closing)
    await closing
    expect(port.readCanceled).toBe(true)
    expect(port.writeAborted).toBe(true)
    expect(port.readable?.locked).toBe(false)
    expect(port.writable?.locked).toBe(false)
    expect(port.closeCount).toBe(1)
  })
})
