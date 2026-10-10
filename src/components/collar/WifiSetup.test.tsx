import { ReadableStream as NodeReadableStream, WritableStream as NodeWritableStream } from 'node:stream/web'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WifiSerialPort } from '@/lib/wifiSerial'
import { WifiSetup } from './WifiSetup'

class ConnectingPort implements WifiSerialPort {
  readable: WifiSerialPort['readable'] = null
  writable: WifiSerialPort['writable'] = null
  private emit: (frame: string) => void = () => {}
  openCount = 0
  closeCount = 0
  statusRequests = 0
  wifiCommands: { ssid: string; password: string }[] = []

  async open() {
    this.openCount++
    this.readable = new NodeReadableStream<Uint8Array>({
      start: (controller) => { this.emit = (frame) => controller.enqueue(new TextEncoder().encode(frame)) },
    }) as unknown as ReadableStream<Uint8Array>
    this.writable = new NodeWritableStream<Uint8Array>({ write: (bytes) => {
      const command = new TextDecoder().decode(bytes)
      if (command === 'STATUS\n') {
        this.statusRequests++
        this.emit(`STATUS ${JSON.stringify({
          deviceId: 'collar-test', bootId: `boot-${this.openCount}`, firmware: '0.2.1',
          protocolVersion: 2, capabilities: ['wifi-update'], cloudConfigured: true,
          wifiConfigured: true, wifiState: 'connecting', wifi: false, timeSynced: false,
          acceptedBatches: 0, lastHttp: 0, wifiConnectAttempts: 3, wifiLastDisconnectReason: 202,
        })}\n`)
      } else if (command.startsWith('WIFI ')) {
        this.wifiCommands.push(JSON.parse(command.slice(5)))
        this.emit('CFG {"command":"WIFI","ok":true,"wifiSaved":true,"restart":true}\n')
      } else throw new Error('Unexpected serial command')
    } }) as unknown as WritableStream<Uint8Array>
  }
  async close() {
    if (this.readable?.locked || this.writable?.locked) throw new Error('USB closed before stream locks were released')
    this.closeCount++
    this.readable = null
    this.writable = null
  }
  getInfo() { return { usbVendorId: 0x303a, usbProductId: 0x1001 } }
}

const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve() }
const originalSerial = Object.getOwnPropertyDescriptor(navigator, 'serial')
const originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext')
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal')
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close')
const restore = (object: object, key: string, descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) Object.defineProperty(object, key, descriptor)
  else Reflect.deleteProperty(object, key)
}

describe('Wi-Fi setup recovery after saving an unreachable network', () => {
  let root: Root
  let container: HTMLDivElement
  let port: ConnectingPort
  let requestPort: ReturnType<typeof vi.fn>
  let fetchSpy: ReturnType<typeof vi.fn>
  let storageSpy: ReturnType<typeof vi.spyOn>

  const button = (text: string) => {
    const result = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text))
    if (!result) throw new Error(`Missing button: ${text}`)
    return result
  }
  const input = (name: string) => {
    const result = container.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`)
    if (!result) throw new Error(`Missing input: ${name}`)
    return result
  }
  const phase = () => container.querySelector('.collar-wifi-state')?.textContent
  const click = async (text: string) => {
    expect(button(text).disabled).toBe(false)
    await act(async () => { button(text).click(); await flush() })
  }
  const advance = async (ms: number) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); await flush() })
  }
  const credentials = async (ssid: string, password: string) => {
    await act(async () => {
      for (const [name, value] of [['Wi-Fi 名称', ssid], ['Wi-Fi 密码', password]]) {
        const element = input(name)
        expect(element.disabled).toBe(false)
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
      }
      await flush()
    })
  }
  const saveUnreachableNetwork = async () => {
    await act(async () => { root.render(<WifiSetup />); await flush() })
    await click('设备配网')
    await click('选择 USB 板子')
    expect(phase()).toContain('USB 已连接，可以更新 Wi-Fi')
    await credentials('Wrong network', 'wrong-password')
    await click('保存 Wi-Fi 并重启')
    expect(phase()).toContain('Wi-Fi 已保存，等待板子重启')
    expect(container.innerHTML).not.toContain('wrong-password')
    await advance(1500)
    expect(phase()).toContain('正在确认实际联网状态')
    expect(phase()).not.toContain('设备已连接 Wi-Fi')
    expect(port.openCount).toBe(2)
    expect(port.closeCount).toBe(1)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    port = new ConnectingPort()
    requestPort = vi.fn(async () => port)
    Object.defineProperty(navigator, 'serial', { configurable: true, value: { requestPort, getPorts: vi.fn(async () => [port]) } })
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true } })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false } })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => { root.unmount(); await flush() })
    container.remove()
    restore(navigator, 'serial', originalSerial)
    restore(window, 'isSecureContext', originalSecureContext)
    restore(HTMLDialogElement.prototype, 'showModal', originalShowModal)
    restore(HTMLDialogElement.prototype, 'close', originalClose)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('stops polling without releasing USB and immediately allows corrected credentials to be saved', async () => {
    await saveUnreachableNetwork()
    expect(input('Wi-Fi 密码').value).toBe('')
    expect(input('Wi-Fi 名称').disabled).toBe(true)
    await click('修改网络')
    expect(phase()).toContain('USB 已连接，可以更新 Wi-Fi')
    expect(input('Wi-Fi 名称').disabled).toBe(false)
    expect(input('Wi-Fi 密码').disabled).toBe(false)
    const requestsBefore = port.statusRequests
    await advance(3000)
    expect(port.statusRequests).toBe(requestsBefore)
    expect(port.openCount).toBe(2)
    expect(port.closeCount).toBe(1)
    expect(requestPort).toHaveBeenCalledTimes(1)
    await credentials('Correct network', 'correct-password')
    await click('保存 Wi-Fi 并重启')
    expect(port.wifiCommands).toEqual([
      { ssid: 'Wrong network', password: 'wrong-password' },
      { ssid: 'Correct network', password: 'correct-password' },
    ])
    expect(phase()).toContain('Wi-Fi 已保存，等待板子重启')
    expect(container.innerHTML).not.toContain('correct-password')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
  })

  it('returns to editable inputs after 60 seconds while USB STATUS remains responsive', async () => {
    await saveUnreachableNetwork()
    await advance(60_000)
    expect(phase()).toContain('USB 已连接，可以更新 Wi-Fi')
    expect(container.textContent).toContain('60 秒内未连接 Wi-Fi')
    expect(input('Wi-Fi 名称').disabled).toBe(false)
    expect(input('Wi-Fi 密码').disabled).toBe(false)
    expect(port.statusRequests).toBeGreaterThan(50)
    expect(port.openCount).toBe(2)
    expect(port.closeCount).toBe(1)
    expect(requestPort).toHaveBeenCalledTimes(1)
    await credentials('Correct network', 'correct-password')
    expect(button('保存 Wi-Fi 并重启').disabled).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(storageSpy).not.toHaveBeenCalled()
  })
})
