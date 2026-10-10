import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, LoaderCircle, LockKeyhole, Plug, Radio, ShieldCheck, Usb, Wifi, X } from 'lucide-react'
import { validateWifi, type WifiDeviceStatus } from '@/domain/serialWifi'
import { COLLAR_USB_FILTER, waitForSerial, WifiSerialConnection, wifiSerialApi, type WifiSerialPort } from '@/lib/wifiSerial'

type Phase = 'idle' | 'choosing' | 'connecting' | 'ready' | 'saving' | 'restarting' | 'checking' | 'success' | 'error'
const phaseText: Record<Phase, string> = {
  idle: '通过 USB 连接项圈', choosing: '请在浏览器弹窗中选择板子', connecting: '正在读取设备状态',
  ready: 'USB 已连接，可以更新 Wi-Fi', saving: '正在将配置写入板子', restarting: 'Wi-Fi 已保存，等待板子重启',
  checking: '正在确认实际联网状态', success: '设备已连接 Wi-Fi', error: '需要检查连接',
}
const configErrors: Record<string, string> = {
  invalid_wifi: '设备未接受 Wi-Fi 参数，请检查名称与密码格式。',
  cloud_not_configured: '设备尚未完成云端初始化，请先完成固件部署。',
  nvs_write: '设备未能保存配置，请重新连接板子后重试。',
}
class SetupError extends Error {}

export function WifiSetup() {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<WifiDeviceStatus | null>(null)
  const [statusAt, setStatusAt] = useState(0)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const session = useRef<WifiSerialConnection | null>(null)
  const operation = useRef<AbortController | null>(null)
  const selectedPort = useRef<WifiSerialPort | null>(null)
  const expectedDevice = useRef('')
  const savedRef = useRef(false)
  const serial = wifiSerialApi()
  const busy = ['choosing', 'connecting', 'saving', 'restarting', 'checking'].includes(phase)
  const available = !!status && status.protocolVersion >= 2 && status.capabilities.includes('wifi-update') && status.cloudConfigured
  const pageLink = `${location.origin}${location.pathname}`

  const stop = () => {
    operation.current?.abort()
    operation.current = null
    const previous = session.current
    session.current = null
    return previous?.close() ?? Promise.resolve()
  }
  const close = () => {
    void stop()
    setOpen(false); setPassword(''); setSsid(''); setStatus(null); setPhase('idle'); setMessage(''); setCopied(false)
    savedRef.current = false; setSaved(false); selectedPort.current = null; expectedDevice.current = ''
  }
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  useEffect(() => () => { operation.current?.abort(); void session.current?.close() }, [])

  const report = (next: WifiDeviceStatus, signal: AbortSignal) => {
    if (signal.aborted) return
    setStatus(next); setStatusAt(Date.now())
  }
  const handshake = async (connection: WifiSerialConnection, signal: AbortSignal, expected = '') => {
    const deadline = Date.now() + 12_000
    while (!signal.aborted && Date.now() < deadline) {
      try {
        const next = await connection.status(signal, 1800)
        if (expected && next.deviceId !== expected) throw new SetupError('当前 USB 设备与刚才保存配置的项圈不一致，请选择原来的板子。')
        report(next, signal)
        return next
      } catch (error) {
        if (error instanceof SetupError || signal.aborted) throw error
        await waitForSerial(300, signal)
      }
    }
    throw new SetupError('未读到设备状态。请确认板子已启动、没有其他串口工具占用，并使用支持配网的固件。')
  }
  const checkWifi = async (connection: WifiSerialConnection, signal: AbortSignal, initial?: WifiDeviceStatus) => {
    if (signal.aborted) return
    setPhase('checking')
    const deadline = Date.now() + 60_000
    let current = initial
    let lastResponseAt = initial ? Date.now() : 0
    while (!signal.aborted && Date.now() < deadline) {
      if (current) {
        if (expectedDevice.current && current.deviceId !== expectedDevice.current) throw new SetupError('重新连接的不是原来的项圈，请选择同一块板子。')
        report(current, signal)
        lastResponseAt = Date.now()
        if (current.wifi === true && current.wifiState === 'connected') {
          setPhase('success'); setMessage('设备已通过串口确认 Wi-Fi 连接。云端上传状态见下方设备报告。')
          return
        }
      }
      await waitForSerial(1000, signal)
      try { current = await connection.status(signal, 1800) }
      catch { if (signal.aborted) return; current = undefined }
    }
    if (signal.aborted) return
    if (Date.now() - lastResponseAt < 5000) {
      setPhase('ready')
      setMessage('配置已保存，但 60 秒内未连接 Wi-Fi。USB 仍已连接，请检查 2.4 GHz WPA2 网络、信号和密码后，直接修改并重新保存。')
      return
    }
    throw new SetupError('配置已保存，但未能持续读取设备状态。请重新选择 USB 板子检查连接。')
  }
  const fail = async (error: unknown, controller: AbortController, fallback: string) => {
    if (controller.signal.aborted) return
    const previous = session.current
    session.current = null
    await previous?.close()
    if (controller.signal.aborted) return
    setPhase('error')
    setMessage(error instanceof SetupError ? error.message : fallback)
  }

  const choose = async () => {
    if (!serial || busy) return
    // requestPort MUST remain directly inside this user-click handler, before any await.
    const selection = serial.requestPort({ filters: [COLLAR_USB_FILTER] }).then((port) => ({ port, error: null }), (error: unknown) => ({ port: null, error }))
    const old = stop()
    const controller = new AbortController()
    operation.current = controller
    setPhase('choosing'); setMessage(''); setPassword(''); setStatus(null)
    await old
    const result = await selection
    if (controller.signal.aborted) return
    if (!result.port) {
      setPhase('idle')
      setMessage(result.error instanceof DOMException && result.error.name === 'NotFoundError' ? '未选择设备。准备好后可再次点击选择板子。' : '浏览器未允许访问串口。请使用桌面 Chrome / Edge，并在权限弹窗中选择 USB 板子。')
      return
    }
    try {
      selectedPort.current = result.port
      const connection = new WifiSerialConnection(result.port)
      session.current = connection
      setPhase('connecting')
      await connection.open()
      if (controller.signal.aborted) { await connection.close(); return }
      const next = await handshake(connection, controller.signal, savedRef.current ? expectedDevice.current : '')
      if (controller.signal.aborted) return
      if (!savedRef.current) expectedDevice.current = next.deviceId
      if (next.protocolVersion < 2 || !next.capabilities.includes('wifi-update')) {
        setMessage(`当前固件 ${next.firmware || '版本未知'} 尚不支持仅更新 Wi-Fi，请先升级到支持 wifi-update 的固件。`)
        setPhase('ready'); return
      }
      if (!next.cloudConfigured) {
        setMessage('板子尚未配置云端连接。此入口仅更新 Wi-Fi，请先完成设备首次部署。')
        setPhase('ready'); return
      }
      if (savedRef.current && next.wifi && next.wifiState === 'connected') {
        setPhase('success'); setMessage('设备已通过串口确认 Wi-Fi 连接。')
      } else {
        setPhase('ready')
        if (savedRef.current) setMessage('USB 已重新连接，设备尚未连上 Wi-Fi。可以直接修改网络后保存，或刷新设备状态。')
      }
    } catch (error) { await fail(error, controller, '无法打开 USB 串口。请关闭占用板子的串口工具，检查数据线后重新选择。') }
  }

  const save = async () => {
    const invalid = validateWifi(ssid, password)
    if (invalid) { setMessage(invalid); return }
    const connection = session.current
    if (!connection || !serial || !available || busy) return
    const controller = new AbortController()
    operation.current?.abort(); operation.current = controller
    setPhase('saving'); setMessage('')
    // No browser storage or cloud request receives either credential.
    let secret = password
    setPassword('')
    try {
      const saving = connection.saveWifi(ssid, secret, controller.signal)
      secret = ''
      const result = await saving
      if (controller.signal.aborted) return
      if (result.kind !== 'config' || !result.ok || !result.wifiSaved || !result.restart) throw new SetupError(configErrors[result.kind === 'config' ? result.error || '' : ''] || '设备没有确认配置保存，请重新选择板子后重试。')
      savedRef.current = true; setSaved(true); setPhase('restarting'); setStatus(null)
      await connection.close()
      if (session.current === connection) session.current = null
      if (controller.signal.aborted) return
      await waitForSerial(1500, controller.signal)
      const deadline = Date.now() + 15_000
      let reconnected: WifiSerialConnection | null = null
      while (!controller.signal.aborted && Date.now() < deadline) {
        const ports = await serial.getPorts()
        if (controller.signal.aborted) return
        const matching = ports.filter((port) => {
          const info = port.getInfo()
          return info.usbVendorId === COLLAR_USB_FILTER.usbVendorId && info.usbProductId === COLLAR_USB_FILTER.usbProductId
        })
        const candidate = ports.includes(selectedPort.current!) ? selectedPort.current : matching.length === 1 ? matching[0] : null
        if (candidate) {
          const retry = new WifiSerialConnection(candidate)
          session.current = retry
          try { await retry.open(); reconnected = retry; break }
          catch { await retry.close(); if (session.current === retry) session.current = null }
        }
        await waitForSerial(1000, controller.signal)
      }
      if (controller.signal.aborted) { await reconnected?.close(); return }
      if (!reconnected) throw new SetupError('Wi-Fi 配置已保存。设备重启后需要重新选择 USB，请点击下方按钮继续确认联网。')
      const next = await handshake(reconnected, controller.signal, expectedDevice.current)
      await checkWifi(reconnected, controller.signal, next)
    } catch (error) { await fail(error, controller, savedRef.current ? 'Wi-Fi 已保存，但尚未确认联网。请重新选择原来的 USB 板子继续检查。' : '尚未收到设备保存确认，请检查 USB 连接并重新选择板子。') }
  }

  const refresh = async () => {
    const connection = session.current
    if (!connection || busy) return
    const controller = new AbortController()
    operation.current?.abort(); operation.current = controller
    setPhase('connecting'); setMessage('')
    try {
      const next = await handshake(connection, controller.signal, expectedDevice.current)
      if (controller.signal.aborted) return
      setPhase(savedRef.current && next.wifi && next.wifiState === 'connected' ? 'success' : 'ready')
    } catch (error) { await fail(error, controller, '设备已断开，请重新选择 USB 板子。') }
  }

  return <>
    <button className="collar-wifi-entry" type="button" onClick={() => setOpen(true)}><span><Wifi size={16} /><span>设备配网<small>通过 USB 更新项圈 Wi-Fi</small></span></span><ChevronRight size={16} /></button>
    <dialog ref={dialog} className="collar-wifi-dialog" onCancel={(event) => { event.preventDefault(); close() }} aria-labelledby="wifi-setup-title">
      <div className="collar-wifi-header"><div><div className="collar-kicker">COLLAR / WI-FI SETUP</div><h2 id="wifi-setup-title">让项圈连接家里的网络。</h2><p>通过 USB 设置 2.4 GHz WPA2 Wi-Fi。</p></div><button type="button" aria-label="关闭设备配网" className="collar-wifi-close" onClick={close}><X size={20} /></button></div>
      {!serial ? <div className="collar-wifi-fallback"><Usb size={32} /><h3>请使用桌面 Chrome / Edge</h3><p>当前浏览器没有可用的 Web Serial。请在桌面 Chrome / Edge 打开此页面，并通过 USB 数据线连接板子。</p><button className="collar-button is-primary" type="button" onClick={() => { if (!navigator.clipboard) { setMessage('请手动复制下方地址。'); return } void navigator.clipboard.writeText(pageLink).then(() => setCopied(true)).catch(() => setMessage('无法自动复制，请手动复制下方地址。')) }}><Copy size={15} />{copied ? '链接已复制' : '复制当前页面链接'}</button><input aria-label="设备配网页面链接" value={pageLink} readOnly onFocus={(event) => event.currentTarget.select()} /></div> : <>
        <div className="collar-wifi-steps"><span className={status || saved ? 'is-done' : 'is-current'}><Usb size={15} />选择板子</span><ChevronRight size={13} /><span className={saved ? 'is-done' : available ? 'is-current' : ''}><LockKeyhole size={15} />保存网络</span><ChevronRight size={13} /><span className={phase === 'success' ? 'is-done' : saved ? 'is-current' : ''}><Radio size={15} />确认联网</span></div>
        <div className={`collar-wifi-state ${phase === 'success' ? 'is-success' : ''}`} role="status">{busy ? <LoaderCircle size={18} className="reconstruction-spin" /> : phase === 'success' ? <Check size={18} /> : <Plug size={18} />}<div><b>{phaseText[phase]}</b>{saved && <small>设备已确认保存；联网以 STATUS 实际返回为准。</small>}</div></div>
        {!busy && (!session.current || phase === 'idle' || phase === 'error') && <button type="button" className="collar-button is-primary collar-wifi-select" onClick={() => void choose()}><Usb size={16} />{saved ? '重新选择板子，确认联网' : '选择 USB 板子'}</button>}
        {status && <div className="collar-wifi-device"><div><span>设备 / 固件</span><b>{status.deviceId || '未报告'} · {status.firmware || '未知'}</b></div><div><span>设备 Wi-Fi</span><b>{status.wifi && status.wifiState === 'connected' ? '已连接' : status.wifiState === 'connecting' ? '连接中' : '未配置 / 未连接'}</b></div><div><span>云端上传</span><b>{status.acceptedBatches > 0 && status.lastHttp >= 200 && status.lastHttp < 300 ? `已确认 ${status.acceptedBatches} 个窗口` : '尚未确认'}</b></div>{status.wifiConnectAttempts > 0 && !status.wifi && <div><span>连接尝试 / 断开原因码</span><b>{status.wifiConnectAttempts} / {status.wifiLastDisconnectReason}</b></div>}<small>来自设备串口 · {new Date(statusAt).toLocaleTimeString('zh-CN', { hour12: false })}</small></div>}
        {available && <form onSubmit={(event) => { event.preventDefault(); void save() }} className="collar-wifi-form" autoComplete="off"><label htmlFor="wifi-ssid">Wi-Fi 名称（SSID）</label><input id="wifi-ssid" aria-label="Wi-Fi 名称" className="collar-field" value={ssid} onChange={(event) => setSsid(event.target.value)} disabled={busy || !session.current} autoComplete="off" placeholder="输入家里的 2.4 GHz 网络名称" /><label htmlFor="wifi-password">Wi-Fi 密码</label><input id="wifi-password" aria-label="Wi-Fi 密码" className="collar-field" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy || !session.current} type="password" autoComplete="new-password" placeholder="密码只经 USB 发送到板子" /><p>保存后板子会重启；尚未上传的临时采样可能丢失。</p><button className="collar-button is-primary" type="submit" disabled={busy || !session.current || !ssid || !password}><Wifi size={15} />保存 Wi-Fi 并重启</button></form>}
        {phase === 'checking' && available && session.current && <button className="collar-button collar-wifi-cancel" type="button" onClick={() => { operation.current?.abort(); operation.current = null; setPassword(''); setPhase('ready'); setMessage('已停止联网检查，USB 保持连接。请修改网络后重新保存。') }}>修改网络</button>}
        {busy ? <button className="collar-button collar-wifi-cancel" type="button" onClick={() => { void stop(); setPassword(''); setPhase('idle'); setMessage(savedRef.current ? '已停止网页检查。已保存的配置不会撤销，可重新选择板子确认联网。' : '已停止操作。若板子已收到保存指令，可重新选择设备检查状态。') }}>停止操作并释放 USB</button> : session.current && <button className="collar-button collar-wifi-cancel" type="button" onClick={() => void refresh()}><Radio size={14} />刷新设备状态</button>}
      </>}
      {message && <div className={`collar-message ${phase === 'error' ? 'is-error' : ''}`} role="status">{message}</div>}
      <div className="collar-wifi-privacy"><ShieldCheck size={16} /><span>密码不写入浏览器存储、不上传云端、不写日志。现有云端地址和设备令牌保留。</span></div>
      <button className="collar-button collar-wifi-done" type="button" onClick={close}>{phase === 'success' ? '完成并释放 USB' : '关闭并释放 USB'}</button>
    </dialog>
  </>
}
