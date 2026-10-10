import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, Box, Check, ChevronRight, CircleHelp, Eye, House, Link2, LockKeyhole, Radio, RotateCcw, Upload, WifiOff } from 'lucide-react'
import { get, set, del } from 'idb-keyval'
import { PetScene } from '@/components/collar/PetScene'
import { ReconstructionPanel } from '@/components/collar/ReconstructionPanel'
import { activityDescriptions, activityLabels, STALE_MS, validRoom, validateGlb, type MotionEvent, type RoomDimensions } from '@/domain/collar'
import { matchingClip } from '@/domain/petMotion'
import { artifactUrl, parseJobs } from '@/domain/reconstruction'
import { apiUrl, useCollar } from '@/store/useCollar'
import { useStore } from '@/store/useStore'
import { blobToDataUrl, downscaleDataUrl } from '@/lib/image'
import './collar.css'

const ROOM_KEY = 'petlink-collar-room-v1'
const AVATAR_KEY = 'petlink-collar-avatar-v1'
const MODEL_KEY = 'petlink-collar-glb-v1'
const time = (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
const number = (value: number | undefined, digits = 2) => Number.isFinite(value) ? value!.toFixed(digits) : '—'

function localRead<T,>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback } catch { return fallback }
}
async function photo(file: File) {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) throw new Error('请选择小于 15 MB 的照片')
  const raw = await blobToDataUrl(file)
  // Decode explicitly: malformed files must not become a successful reference image.
  await new Promise<void>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(); img.onerror = () => reject(new Error('照片无法读取，请换一张')); img.src = raw })
  return downscaleDataUrl(raw, 960, .75)
}
function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Sparkline({ events }: { events: MotionEvent[] }) {
  const points = [...events].sort((a, b) => a.receivedAt - b.receivedAt).slice(-40)
  const high = Math.max(.1, ...points.map((e) => e.features.accelRms))
  const path = points.map((e, i) => `${i * 580 / Math.max(points.length - 1, 1)},${96 - e.features.accelRms / high * 80}`).join(' ')
  return <div className="collar-chart">
    <div className="collar-card-heading"><span>运动强度</span><span className="collar-mono">ACC RMS · g</span></div>
    {points.length > 1 ? <svg viewBox="0 0 580 112" role="img" aria-label={`最近 ${points.length} 个真实遥测窗口的加速度强度`}>
      {[16, 56, 96].map((y) => <line key={y} x1="0" x2="580" y1={y} y2={y} stroke="#dfe6dc" strokeDasharray="3 5" />)}
      <polygon points={`0,105 ${path} 580,105`} fill="#d5e9de" opacity=".65" />
      <polyline points={path} fill="none" stroke="#317966" strokeWidth="2.4" strokeLinejoin="round" />
    </svg> : <div className="collar-empty-chart">等待至少两个真实数据窗口</div>}
    <div className="collar-chart-label"><span>{points.length ? time(points[0].receivedAt) : '—'}</span><span>范围 0–{high.toFixed(2)} g · {points.length} 个窗口</span><span>{points.length ? time(points[points.length - 1].receivedAt) : '—'}</span></div>
  </div>
}

export function CollarPage() {
  const { live, phase, activity, error, token, now, health, setToken } = useCollar()
  const pet = useStore((s) => s.pet)
  const [tokenInput, setTokenInput] = useState('')
  const [tab, setTab] = useState<'motion' | 'room' | 'avatar'>('motion')
  const [roomState, setRoomState] = useState(() => {
    const saved = localRead<{ dimensions: RoomDimensions | null; photo: string }>(ROOM_KEY, { dimensions: null, photo: '' })
    return { dimensions: saved.dimensions && validRoom(saved.dimensions) ? saved.dimensions : null, photo: typeof saved.photo === 'string' ? saved.photo : '' }
  })
  const [roomDraft, setRoomDraft] = useState<RoomDimensions>(roomState.dimensions ?? { width: 4.8, depth: 3.6, height: 2.7 })
  const [roomPhoto, setRoomPhoto] = useState(roomState.photo)
  const [roomConfirmed, setRoomConfirmed] = useState(false)
  const [roomMessage, setRoomMessage] = useState('')
  const [avatar, setAvatar] = useState(() => localRead(AVATAR_KEY, { photo: '', color: '#c39459' }))
  const [model, setModel] = useState<ArrayBuffer | null>(null)
  const [modelName, setModelName] = useState('')
  const [modelMethod, setModelMethod] = useState('')
  const [modelLimitations, setModelLimitations] = useState<string[]>([])
  const [modelInfo, setModelInfo] = useState<{ clips: string[]; error: string; loaded?: boolean }>({ clips: [], error: '' })
  const [avatarMessage, setAvatarMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [modelCacheReady, setModelCacheReady] = useState(false)
  const [autoModelStatus, setAutoModelStatus] = useState('')
  const modelChosen = useRef(false)
  const pendingModel = useRef<{ name: string; data: ArrayBuffer; method?: string; limitations?: string[] } | null>(null)
  const modelInfoCallback = useCallback((info: typeof modelInfo) => {
    setModelInfo(info)
    if (info.error) { pendingModel.current = null; setUploading(false) }
    if (info.loaded && pendingModel.current) {
      const pending = pendingModel.current
      pendingModel.current = null
      void set(MODEL_KEY, pending).then(() => {
        setAvatarMessage('模型已保存。优先使用内置动作；无匹配动画时仅对整体模型做动作反馈，离线冻结。')
      }).catch(() => setAvatarMessage('模型可预览，但浏览器无法保存；重新打开后需要再次导入。')).finally(() => setUploading(false))
    }
  }, [])
  const modelLoadGeneration = useRef(0)

  useEffect(() => {
    let active = true
    const generation = modelLoadGeneration.current
    get<{ name: string; data: ArrayBuffer; method?: string; limitations?: string[] }>(MODEL_KEY).then((saved) => {
      if (!active || generation !== modelLoadGeneration.current || !saved) return
      try { validateGlb(saved.data); setModel(saved.data); setModelName(saved.name); setModelMethod(saved.method || ''); setModelLimitations(saved.limitations || []) } catch { void del(MODEL_KEY).catch(() => {}) }
    }).catch(() => {}).finally(() => { if (active) setModelCacheReady(true) })
    return () => { active = false }
  }, [])

  const latest = live?.latest
  const age = latest ? Math.max(0, Math.floor((now - latest.receivedAt) / 1000)) : null
  const fresh = phase === 'connected' && live?.online && latest && now - latest.receivedAt >= -60_000 && now - latest.receivedAt <= STALE_MS
  const status = phase === 'locked' ? '尚未连接' : phase === 'connecting' ? '正在连接' : phase === 'error' ? '连接中断' : fresh ? '正在接收' : '设备离线'
  const events = live?.events ?? []
  const source = live?.device?.source
  const sourceLabel = source === 'serial-bridge' || source === 'usb-serial' ? 'USB 串口桥接 · 需要 Mac 在线' : source === 'wifi' || source === 'device-wifi' ? '设备 Wi-Fi 直连' : source || '等待设备'
  const handlePhoto = async (file: File | undefined, type: 'room' | 'avatar') => {
    if (!file) return
    try {
      const value = await photo(file)
      if (type === 'room') { setRoomPhoto(value); setRoomMessage('参考照片已载入，请确认房间尺寸后保存。') }
      else {
        const next = { ...avatar, photo: value }
        localStorage.setItem(AVATAR_KEY, JSON.stringify(next))
        setAvatar(next)
        setAvatarMessage('已保存为外观参考。不会自动生成 3D 模型。')
      }
    } catch (err) { (type === 'room' ? setRoomMessage : setAvatarMessage)(err instanceof Error ? err.message : '照片处理失败') }
  }
  const saveRoom = () => {
    if (!validRoom(roomDraft)) { setRoomMessage('长、宽需为 1–20 米，高需为 1.5–6 米。'); return }
    if (!roomConfirmed) { setRoomMessage('请先确认尺寸来自你的测量。'); return }
    const next = { dimensions: { ...roomDraft }, photo: roomPhoto }
    try { localStorage.setItem(ROOM_KEY, JSON.stringify(next)); setRoomState(next); setRoomMessage('房间已保存到此浏览器，2D 与 3D 结构已更新。') }
    catch { setRoomMessage('浏览器存储已满，未能保存。请缩小参考照片后重试。') }
  }
  const loadModel = async (file?: File) => {
    if (!file) return
    modelChosen.current = true
    modelLoadGeneration.current += 1
    setUploading(true)
    setAvatarMessage('')
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('请选择小于 25 MB 的 GLB 模型')
      const data = await file.arrayBuffer()
      validateGlb(data)
      pendingModel.current = { name: file.name, data }
      setModel(data)
      setModelName(file.name)
      setModelMethod('')
      setModelLimitations([])
      setAvatarMessage('正在解析模型与材质…')
    } catch (err) { setAvatarMessage(err instanceof Error ? err.message : '模型无法读取，请重试'); setUploading(false) }
  }
  const removeModel = async () => {
    modelChosen.current = true
    try { await del(MODEL_KEY); modelLoadGeneration.current += 1; pendingModel.current = null; setModel(null); setModelName(''); setModelMethod(''); setModelLimitations([]); setUploading(false); setAvatarMessage('已恢复模板形象。') }
    catch { setAvatarMessage('无法清除已保存的模型，请重试。') }
  }
  const applyGeneratedPet = useCallback((data: ArrayBuffer, name: string, method: string, limitations: string[]) => {
    modelLoadGeneration.current += 1
    pendingModel.current = { data, name, method, limitations }
    setUploading(true); setModel(data); setModelName(name); setModelMethod(method); setModelLimitations(limitations)
    setAvatarMessage('正在解析服务端生成的真实 GLB 模型…')
  }, [])

  useEffect(() => {
    if (!token || !modelCacheReady || model || modelChosen.current) { setAutoModelStatus(''); return }
    let controller: AbortController | null = null
    const generation = modelLoadGeneration.current
    let disposed = false
    let timer = 0
    const loadLatest = async () => {
      controller = new AbortController()
      const timeout = window.setTimeout(() => controller?.abort(), 120_000)
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const response = await fetch(apiUrl('jobs'), { headers, cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error('暂未取得模型任务')
        const { jobs } = parseJobs(await response.json())
        const latestModel = jobs.filter((job) => job.kind === 'pet' && job.status === 'succeeded' && job.result?.modelUrl).sort((a, b) => b.updatedAt - a.updatedAt)[0]
        if (latestModel?.result?.modelUrl) {
          if (!disposed) setAutoModelStatus('正在下载真实宠物模型…')
          const url = artifactUrl(latestModel.result.modelUrl, window.location.origin, import.meta.env.BASE_URL)
          const artifact = await fetch(url, { headers, cache: 'no-store', signal: controller.signal })
          if (!artifact.ok) throw new Error('暂未取得模型文件')
          const data = await artifact.arrayBuffer()
          validateGlb(data)
          if (!disposed && !modelChosen.current && generation === modelLoadGeneration.current) {
            applyGeneratedPet(data, `pet-${latestModel.id.slice(0, 8)}.glb`, latestModel.result.method, latestModel.result.limitations)
            return
          }
        }
      } catch { if (!disposed) setAutoModelStatus('模型服务暂不可用，正在重试…') }
      finally { clearTimeout(timeout) }
      if (!disposed) timer = window.setTimeout(() => void loadLatest(), 4000)
    }
    void loadLatest()
    return () => { disposed = true; controller?.abort(); clearTimeout(timer) }
  }, [token, modelCacheReady, model, applyGeneratedPet])

  const hasMatchingAnimation = !!matchingClip(modelInfo.clips.map((name) => ({ name })), activity)

  return <div className="collar-page" data-testid="collar-page">
    <header className="collar-page-heading">
      <div><div className="collar-kicker"><span /> PETLINK / LIVE COLLAR</div><h1>每个小动作，都有回应。</h1><p>一枚真实项圈，一位同步动作的 3D 伙伴。</p></div>
      <div className={`collar-live-pill ${fresh ? 'is-live' : ''}`} data-testid="collar-connection-status"><span />{status}</div>
    </header>

    <div className="collar-top-grid">
      <section className="collar-stage-card" aria-label="真实动作与 3D 宠物">
        <div className="collar-stage-heading"><div><span className="collar-small-label">YOUR LITTLE COMPANION</span><h2>{pet.name}<span>的数字伙伴</span></h2></div><span className="collar-model-tag"><Box size={13} />{model && modelInfo.loaded ? modelMethod ? '真实重建 GLB' : '导入 GLB' : '程序模板'}</span></div>
        <PetScene activity={activity} color={avatar.color} room={roomState.dimensions} model={model} viewAzimuth={/triposr/i.test(modelMethod) ? 2.16 : undefined} onModelInfo={modelInfoCallback} />
        <div className="collar-stage-hint" role="status">{autoModelStatus || '拖动旋转 · 滚轮 / 双指缩放'}</div>
        <div className="collar-stage-footer"><div className={`collar-activity-icon ${fresh ? 'is-live' : ''}`}><Activity size={25} /></div><div><h3 data-testid="collar-activity">{activityLabels[activity]}</h3><p>{activityDescriptions[activity]}</p></div><div className="collar-confidence"><b>{fresh && latest ? `${Math.round(latest.confidence * 100)}%` : '—'}</b><span>规则分类置信度</span></div></div>
        <div className="collar-stage-note"><CircleHelp size={13} /><span>{model && modelInfo.loaded ? `${modelMethod || '导入模型'} · ${activity === 'unknown' ? '离线冻结。' : hasMatchingAnimation ? '正在播放模型内置动作。' : '整体模型动作反馈，无骨骼步态。'}项圈不提供室内位置。` : roomState.dimensions ? '房间为手动确认结构；宠物在房间中的位置仅为展示。' : '待真实模型载入，当前为程序模板。项圈只提供动作，不提供室内位置。'}</span></div>
      </section>

      <aside className="collar-connect-card">
        <div className="collar-card-heading"><span><Radio size={17} /> 连接真实项圈</span><span className="collar-mono">01 / LIVE</span></div>
        <div className="collar-link-visual"><div><Radio size={25} /></div><span /><div><Link2 size={21} /></div><span /><div className={fresh ? 'is-live' : ''}><Box size={24} /></div></div>
        <p className="collar-connect-copy">板子采集六轴数据，服务端识别运动，数字伙伴跟随真实动作。</p>
        <form onSubmit={(event) => { event.preventDefault(); if (tokenInput.trim()) { setToken(tokenInput); setTokenInput('') } }}>
          <label className="collar-input-label" htmlFor="collar-token"><LockKeyhole size={13} /> Web 访问令牌</label>
          <input className="collar-field" id="collar-token" data-testid="collar-token" type="password" autoComplete="off" spellCheck={false} value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder={token ? '已保存到本次浏览器会话' : '输入部署时提供的 viewer token'} />
          <div className="collar-connect-buttons"><button className="collar-button is-primary" disabled={!tokenInput.trim()} data-testid="collar-connect" type="submit">{token ? '更新令牌' : '连接项圈'}<ChevronRight size={16} /></button>{token && <button className="collar-button" type="button" onClick={() => setToken('')}>断开</button>}</div>
        </form>
        {error && <div className="collar-message is-error" role="alert">{error}</div>}
        {phase === 'connected' && !fresh && <div className="collar-message"><WifiOff size={15} />云端已连接，等待板子上传新数据。模型已停止动作。</div>}
        <dl className="collar-device-details"><div><dt>设备</dt><dd title={live?.device?.deviceId}>{live?.device?.deviceId || '—'}</dd></div><div><dt>连接方式</dt><dd>{sourceLabel}</dd></div><div><dt>固件版本</dt><dd>{live?.device?.firmware || '—'}</dd></div><div><dt>最新窗口</dt><dd>{latest ? `#${latest.seq} · ${age}s 前` : '—'}</dd></div><div><dt>采样率</dt><dd>{live?.device?.sampleRate ? `${live.device.sampleRate} Hz` : '—'}</dd></div></dl>
        <div className="collar-privacy"><LockKeyhole size={12} />令牌只保存在当前浏览器会话，不会写入链接。</div>
      </aside>
    </div>

    <section className="collar-workbench">
      <div className="collar-tabs" role="tablist" aria-label="项圈工作台">
        {([{ key: 'motion', label: '动作与遥测', icon: Activity }, { key: 'room', label: '室内建模', icon: House }, { key: 'avatar', label: '宠物形象', icon: Box }] as const).map(({ key, label, icon: Icon }) => <button type="button" key={key} id={`collar-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`collar-panel-${key}`} onClick={() => setTab(key)} className={tab === key ? 'is-active' : ''}><Icon size={17} />{label}</button>)}
      </div>

      {tab === 'motion' && <div className="collar-tab-panel" id="collar-panel-motion" role="tabpanel" aria-labelledby="collar-tab-motion">
        <div className="collar-section-heading"><div><h3>六个轴，一段真实运动。</h3><p>{fresh ? '实时更新中' : '下方保留最近一次收到的数据；离线时不生成新数据。'} · 加速度含重力分量</p></div><button type="button" className="collar-button" disabled={!events.length} onClick={() => downloadJson('petlink-motion-events.json', { exportedAt: new Date().toISOString(), source: 'authenticated-server-events', events })}><ArrowDownToLine size={14} />导出窗口</button></div>
        <div className={`collar-axes ${fresh ? '' : 'is-stale'}`}>
          {(['ax', 'ay', 'az', 'gx', 'gy', 'gz'] as const).map((axis, index) => <div key={axis} className={index < 3 ? 'is-accel' : 'is-gyro'}><span>{axis.toUpperCase()}<i>{index < 3 ? 'g' : '°/s'}</i></span><b data-testid={`axis-${axis}`}>{number(latest?.sample[axis], index < 3 ? 3 : 1)}</b><div><span style={{ width: `${latest ? Math.min(100, Math.abs(latest.sample[axis]) / (index < 3 ? 2 : 360) * 100) : 0}%` }} /></div></div>)}
        </div>
        <Sparkline events={events} />
        <div className="collar-card-heading collar-events-heading"><span>最近动作窗口</span><span className="collar-mono">{events.length} RECEIVED</span></div>
        {events.length ? <div className="collar-event-scroll"><table className="collar-events"><thead><tr><th>接收时间</th><th>动作</th><th>规则置信度</th><th>加速度 RMS</th><th>角速度 RMS</th><th>窗口</th></tr></thead><tbody>{events.slice(0, 20).map((event) => <tr key={event.id}><td className="collar-mono">{time(event.receivedAt)}</td><td><span className={`collar-event-activity activity-${event.activity}`}>{activityLabels[event.activity]}</span></td><td>{Math.round(event.confidence * 100)}%</td><td className="collar-mono">{number(event.features.accelRms, 3)} g</td><td className="collar-mono">{number(event.features.gyroRms, 1)} °/s</td><td className="collar-mono">#{event.seq}</td></tr>)}</tbody></table></div> : <div className="collar-empty"><Radio size={27} /><b>这里会留下它的真实动作。</b><p>连接项圈后，静置、轻晃或转动板子，观察数据和 3D 动作同步。</p></div>}
        <p className="collar-footnote">当前为运动阈值分类，需佩戴实测后校准。静止不等于睡眠；手持板子测试不等于宠物行为准确率。未采集室内定位、电量、进食或情绪。</p>
      </div>}

      {tab === 'room' && <div className="collar-tab-panel" id="collar-panel-room" role="tabpanel" aria-labelledby="collar-tab-room">
        <ReconstructionPanel kind="room" token={token} onApplyPet={applyGeneratedPet} />
        <details className="collar-local-tools"><summary>照片辅助建房 · 手动测量与本地预览</summary>
        <div className="collar-section-heading"><div><h3>从一张照片，搭好它的小天地。</h3><p>照片作为参考，尺寸由你测量确认。当前支持一个矩形房间。</p></div><span className="collar-neutral-tag">手动确认建房</span></div>
        <div className="collar-room-grid"><div><label className={`collar-photo-drop ${roomPhoto ? 'has-image' : ''}`}>
          {roomPhoto ? <img src={roomPhoto} alt="房间参考照片，仅保存在本机浏览器" /> : <><Upload size={26} /><b>添加房间参考照片</b><span>JPG / PNG / WebP · 15 MB 以内</span></>}
          <input type="file" accept="image/*" aria-label="上传房间参考照片" onChange={(e) => { void handlePhoto(e.target.files?.[0], 'room'); e.target.value = '' }} />
          {roomPhoto && <span className="collar-photo-replace"><Upload size={13} />更换参考照片</span>}
        </label><p className="collar-footnote">照片和尺寸只保存在此浏览器。单张照片无法确定真实尺度，当前不提供自动空间重建。</p></div>
        <div className="collar-room-form"><div className="collar-dimensions">{([{ key: 'width', label: '宽度', min: 1, max: 20 }, { key: 'depth', label: '进深', min: 1, max: 20 }, { key: 'height', label: '层高', min: 1.5, max: 6 }] as const).map(({ key, label, min, max }) => <label key={key}>{label}<span><input type="number" min={min} max={max} step="0.1" value={Number.isFinite(roomDraft[key]) ? roomDraft[key] : ''} onChange={(e) => { setRoomDraft({ ...roomDraft, [key]: e.target.value === '' ? NaN : Number(e.target.value) }); setRoomConfirmed(false) }} />m</span></label>)}</div>
          <div className="collar-plan"><span className="collar-small-label">2D / PLAN</span>{validRoom(roomDraft) ? <svg viewBox="0 0 380 150" role="img" aria-label={`矩形平面图：宽 ${roomDraft.width} 米，深 ${roomDraft.depth} 米`}><defs><pattern id="room-grid" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M14 0H0V14" fill="none" stroke="#d9e4d7" strokeWidth=".7" /></pattern></defs><rect width="380" height="150" fill="url(#room-grid)" />{(() => { const scale = Math.min(260 / roomDraft.width, 92 / roomDraft.depth); const w = roomDraft.width * scale; const h = roomDraft.depth * scale; return <g><rect x={(380 - w) / 2} y={(150 - h) / 2} width={w} height={h} fill="#dfebdf" stroke="#438370" strokeWidth="4" /><text x="190" y={(150 - h) / 2 - 10} textAnchor="middle" fill="#456357" fontSize="11">{roomDraft.width} m</text><text x={(380 + w) / 2 + 12} y="80" fill="#456357" fontSize="11">{roomDraft.depth} m</text><text x="190" y="81" textAnchor="middle" fill="#547b68" fontSize="17">{(roomDraft.width * roomDraft.depth).toFixed(1)} m²</text></g> })()}</svg> : <div className="collar-message">请输入范围内的房间尺寸</div>}</div>
          <label className="collar-checkbox"><input type="checkbox" checked={roomConfirmed} onChange={(e) => setRoomConfirmed(e.target.checked)} />尺寸由我测量确认；照片仅作为外观参考。</label>
          <div className="collar-inline-buttons"><button className="collar-button is-primary" type="button" disabled={!roomConfirmed || !validRoom(roomDraft)} onClick={saveRoom}><Check size={15} />保存并预览 3D 房间</button>{roomState.dimensions && <button className="collar-button" type="button" onClick={() => { try { localStorage.removeItem(ROOM_KEY); setRoomState({ dimensions: null, photo: '' }); setRoomPhoto(''); setRoomMessage('已清除保存的房间。') } catch { setRoomMessage('无法清除本地房间，请重试。') } }}><RotateCcw size={14} />清除</button>}</div>
          {roomMessage && <div className="collar-message" role="status">{roomMessage}</div>}
        </div></div>
        <div className="collar-capability-note"><House size={19} /><div><b>手动房间与重建结果分别保留</b><p>此处使用你确认的尺寸。AI 重建的相对坐标不会被自动当作真实米数，也不会替换你的测量结果。</p></div></div>
        </details>
      </div>}

      {tab === 'avatar' && <div className="collar-tab-panel" id="collar-panel-avatar" role="tabpanel" aria-labelledby="collar-tab-avatar">
        <ReconstructionPanel kind="pet" token={token} onApplyPet={applyGeneratedPet} />
        {modelMethod && <div className="collar-capability-note"><Box size={20} /><div><b>当前真实模型 · {modelMethod}</b>{modelLimitations.length > 0 && <ul className="reconstruction-limitations">{modelLimitations.map((item, index) => <li key={index}>{item}</li>)}</ul>}<p>{modelInfo.clips.length ? `模型包含 ${modelInfo.clips.length} 段动画。` : '这是实际生成的静态网格；动作以整体起伏或转向反馈，并非骨骼步态。未观测到的背面与腿部由模型估计。'}</p></div></div>}
        <details className="collar-local-tools"><summary>本地照片参考、模板颜色与已有 GLB 导入</summary>
        <div className="collar-section-heading"><div><h3>让数字伙伴，更像它一点。</h3><p>先保存照片作为外观参考；已有精细模型可直接导入 GLB。</p></div><span className="collar-neutral-tag">本地模型工作台</span></div>
        <div className="collar-avatar-grid"><div><label className={`collar-photo-drop collar-pet-photo ${avatar.photo ? 'has-image' : ''}`}>{avatar.photo ? <img src={avatar.photo} alt="宠物外观参考照片" /> : <><Eye size={27} /><b>添加宠物照片</b><span>保存参考，不自动生成模型</span></>}<input type="file" accept="image/*" aria-label="上传宠物参考照片" onChange={(e) => { void handlePhoto(e.target.files?.[0], 'avatar'); e.target.value = '' }} />{avatar.photo && <span className="collar-photo-replace"><Upload size={13} />更换照片</span>}</label><div className="collar-color-picker"><label htmlFor="pet-fur-color">模板毛色</label><input id="pet-fur-color" type="color" disabled={!!model} value={avatar.color} onChange={(e) => { const next = { ...avatar, color: e.target.value }; setAvatar(next); try { localStorage.setItem(AVATAR_KEY, JSON.stringify(next)) } catch { setAvatarMessage('颜色预览已更新，但浏览器未能保存。') } }} /><span>{model ? '导入模型使用自带材质' : '手动选择 · 不是照片建模'}</span></div></div>
        <div className="collar-model-import"><div className="collar-card-heading"><span><Box size={19} /> 导入精细 3D 模型</span><span className="collar-mono">GLB 2.0</span></div><p>导入已有的宠物模型。支持贴图内嵌的 GLB，保留模型网格、材质与骨骼动画。</p><label className={`collar-button is-primary collar-file-button ${uploading ? 'is-disabled' : ''}`}><Upload size={16} />{uploading ? '正在读取…' : '选择 GLB 模型'}<input type="file" accept=".glb,model/gltf-binary" disabled={uploading} aria-label="导入 GLB 宠物模型" onChange={(e) => { void loadModel(e.target.files?.[0]); e.target.value = '' }} /></label><small>最大 25 MB · 不支持 Draco 压缩 · 文件仅存本机浏览器</small>
          {modelName && <div className="collar-model-file"><Box size={18} /><div><b>{modelName}</b><span>{modelInfo.error ? '导入未成功，仍显示模板' : modelInfo.loaded ? `${modelInfo.clips.length} 段内置动画` : '正在读取模型'}</span></div><button type="button" className="collar-button" disabled={uploading} onClick={() => void removeModel()}>移除</button></div>}
          <div className="collar-animation-tags">{['Idle / Rest', 'Walk', 'Run', 'Shake'].map((name) => <span key={name}>{name}</span>)}</div>
          <p className="collar-footnote">优先匹配内置动作；缺少对应动画时仅整体起伏或转向，不伪造骨骼步态和位置。断线冻结当前姿态。</p>
          {modelInfo.clips.length > 0 && <p className="collar-footnote">模型动画：{modelInfo.clips.join(' · ')}</p>}
          {(avatarMessage || modelInfo.error) && <div className={`collar-message ${modelInfo.error ? 'is-error' : ''}`} role="status">{modelInfo.error || avatarMessage}</div>}
        </div></div>
        <div className="collar-capability-note"><Box size={20} /><div><b>本地参考不会触发 AI 任务</b><p>此处照片只在浏览器保存。需要真实生成时，请使用上方的宠物照片或视频上传入口。</p></div></div>
        </details>
      </div>}
    </section>
    <footer className="collar-footer"><span>PETLINK · HARDWARE MVP</span><span>{health ? `服务 ${health.version} · ${(health.commit || 'local').slice(0, 8)}` : '服务版本暂不可用'}</span><span>真实遥测 / 本地形象 / 明确边界</span></footer>
  </div>
}
