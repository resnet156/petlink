import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Camera, Check, CircleAlert, Clock3, Download, FileImage, Film, LoaderCircle, Play, RefreshCw, Upload, X } from 'lucide-react'
import { apiUrl } from '@/store/useCollar'
import { artifactUrl, jobStatusLabels, parseJobs, parseLayout, validateMedia, type MediaMode, type ReconstructionJob, type ReconstructionJobs, type ReconstructionKind, type ReconstructionLayout } from '@/domain/reconstruction'
import { validateGlb } from '@/domain/collar'
import { PetScene } from './PetScene'

type Props = {
  kind: ReconstructionKind
  token: string
  onApplyPet: (data: ArrayBuffer, name: string, method: string, limitations: string[]) => void
}

async function checked(response: Response) {
  if (response.ok) return response
  let message = ''
  try { const body = await response.json(); message = typeof body.detail === 'string' ? body.detail : typeof body.error === 'string' ? body.error : '' } catch { /* Gateway errors may not contain JSON. */ }
  if (response.status === 401 || response.status === 403) throw new Error('访问令牌无效或权限不足，请在上方重新连接')
  if (response.status === 413) throw new Error('文件超过服务器大小限制，请缩小素材后重试')
  if (response.status === 404) throw new Error('重建服务尚未部署到当前服务器')
  throw new Error(message.slice(0, 400) || `重建服务暂不可用（${response.status}）`)
}

async function fetchArtifact(path: string, token: string, signal: AbortSignal) {
  const url = artifactUrl(path, window.location.origin, import.meta.env.BASE_URL)
  return checked(await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal }))
}

function PrivateImage({ url, token, alt }: { url: string; token: string; alt: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    let disposed = false
    setSrc('')
    void fetchArtifact(url, token, controller.signal).then((response) => response.blob()).then((blob) => {
      if (disposed || !blob.type.startsWith('image/')) return
      objectUrl = URL.createObjectURL(blob)
      setSrc(objectUrl)
    }).catch(() => {})
    return () => { disposed = true; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, token])
  return src ? <img src={src} alt={alt} loading="lazy" /> : <div className="reconstruction-image-placeholder"><FileImage size={22} /><span>受保护照片</span></div>
}

function SourceMedia({ inputs, token }: { inputs: NonNullable<ReconstructionJob['inputs']>; token: string }) {
  const [open, setOpen] = useState(false)
  return <details className="reconstruction-sources" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>查看原始素材 · {inputs.length} 份</summary>
    {open && <div className="reconstruction-source-grid">{inputs.map((input, index) => <figure key={input.url}>
      {input.mime.startsWith('image/') ? <PrivateImage url={input.url} token={token} alt={`原始${index + 1}号照片：${input.name}`} /> : <div className="reconstruction-source-video"><Film size={24} /><span>视频原始素材</span></div>}
      <figcaption>{input.name}</figcaption>
    </figure>)}</div>}
  </details>
}

function LayoutPreview({ layout }: { layout: ReconstructionLayout }) {
  const points = layout.rooms.flatMap((room) => room.polygon)
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const width = Math.max(.001, Math.max(...points.map((point) => point.x)) - minX)
  const height = Math.max(.001, Math.max(...points.map((point) => point.y)) - minY)
  const scale = Math.min(520 / width, 220 / height)
  return <div className="reconstruction-layout"><div className="collar-card-heading"><span>服务端生成的 2D 结构</span><span className="collar-neutral-tag">{layout.unit === 'relative' ? '相对尺度 · 无绝对米数' : '模型坐标为米 · 未测量确认'}</span></div>
    <svg viewBox="0 0 600 290" role="img" aria-label="服务端重建的二维空间轮廓">
      {layout.rooms.map((room, index) => {
        const x = room.polygon.reduce((sum, point) => sum + point.x, 0) / room.polygon.length
        const y = room.polygon.reduce((sum, point) => sum + point.y, 0) / room.polygon.length
        const offsetX = (600 - width * scale) / 2
        const offsetY = (290 - height * scale) / 2
        return <g key={index}><polygon points={room.polygon.map((point) => `${offsetX + (point.x - minX) * scale},${offsetY + (point.y - minY) * scale}`).join(' ')} fill={['#e0eada', '#dcebea', '#ece6d4', '#e8e3d9'][index % 4]} stroke="#688b68" strokeWidth="2" /><text x={offsetX + (x - minX) * scale} y={offsetY + (y - minY) * scale} fill="#5c7957" textAnchor="middle" fontSize="12">{room.name}</text></g>
      })}
    </svg>
    <p className="collar-footnote">方法：{layout.method}。{layout.unit === 'relative' ? '未转换成手动房间的米数，也不用于宠物定位。' : '该结果尚未经过人工尺寸核验。'}</p>
    {layout.limitations.length > 0 && <ul className="reconstruction-limitations">{layout.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>}
  </div>
}

function ResultPreview({ model, layout }: { model: ArrayBuffer | null; layout: ReconstructionLayout | null }) {
  const [info, setInfo] = useState<{ loaded?: boolean; error: string }>({ error: '' })
  const onInfo = useCallback((next: typeof info) => setInfo(next), [])
  return <div className="reconstruction-result-preview">
    {model && <div className={`reconstruction-model-preview ${info.loaded ? 'is-ready' : ''}`}><PetScene activity="unknown" color="#c39459" room={null} model={model} onModelInfo={onInfo} />{!info.loaded && <div className="reconstruction-preview-cover">{info.error || '正在解析真实重建结果…'}</div>}<span className="reconstruction-preview-caption">真实结果静态预览 · 拖动旋转</span></div>}
    {layout && <LayoutPreview layout={layout} />}
  </div>
}

export function ReconstructionPanel({ kind, token, onApplyPet }: Props) {
  const [data, setData] = useState<ReconstructionJobs>({ jobs: [] })
  const [serviceError, setServiceError] = useState('')
  const [message, setMessage] = useState('')
  const [selection, setSelection] = useState<{ mode: MediaMode; files: File[] } | null>(null)
  const [busy, setBusy] = useState('')
  const [preview, setPreview] = useState<{ jobId: string; model: ArrayBuffer | null; layout: ReconstructionLayout | null } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const actionRequest = useRef<AbortController | null>(null)
  const authRef = useRef(token)
  const activeRef = useRef(true)
  authRef.current = token

  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false; actionRequest.current?.abort() }
  }, [])

  useEffect(() => {
    setData({ jobs: [] }); setServiceError(''); setPreview(null)
    actionRequest.current?.abort()
    setBusy('')
  }, [token])

  useEffect(() => {
    if (!token) return
    let disposed = false
    let timer = 0
    let timeout = 0
    let controller: AbortController | null = null
    const poll = async () => {
      controller = new AbortController()
      timeout = window.setTimeout(() => controller?.abort(), 12_000)
      try {
        const response = await checked(await fetch(apiUrl('jobs'), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal }))
        const next = parseJobs(await response.json())
        if (!disposed) { setData(next); setServiceError('') }
      } catch (error) {
        if (!disposed) setServiceError(error instanceof Error && error.name !== 'AbortError' ? error.message : '任务列表连接超时，正在重试')
      } finally {
        clearTimeout(timeout)
        if (!disposed) timer = window.setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer); clearTimeout(timeout); controller?.abort() }
  }, [token, refresh])

  const selectFiles = (files: File[], mode: MediaMode) => {
    try { validateMedia(files, kind, mode); setSelection({ files, mode }); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : '素材无法读取') }
  }

  const submit = async () => {
    if (!token || !selection) return
    const controller = new AbortController()
    actionRequest.current = controller
    setBusy('upload'); setMessage('')
    const form = new FormData()
    form.append('kind', kind)
    selection.files.forEach((file) => form.append('files[]', file))
    try {
      const response = await checked(await fetch(apiUrl('jobs'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: controller.signal }))
      const job = parseJobs({ jobs: [await response.json()] }).jobs[0]
      if (!activeRef.current || authRef.current !== token) return
      setData((current) => ({ ...current, jobs: [job, ...current.jobs.filter((item) => item.id !== job.id)] }))
      setSelection(null)
      setMessage('素材已上传，任务已由服务端接收。处理阶段会在下方更新。')
    } catch (error) {
      if (activeRef.current && authRef.current === token) setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : '已停止上传。若服务器已接收任务，可在下方取消。')
    } finally { if (activeRef.current && authRef.current === token) setBusy('') }
  }

  const jobAction = async (job: ReconstructionJob, action: 'cancel' | 'retry') => {
    const controller = new AbortController()
    actionRequest.current = controller
    setBusy(job.id); setMessage('')
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await checked(await fetch(apiUrl(`jobs/${encodeURIComponent(job.id)}/${action}`), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: controller.signal }))
      const updated = parseJobs({ jobs: [await response.json()] }).jobs[0]
      if (!activeRef.current || authRef.current !== token) return
      setData((current) => ({ ...current, jobs: [updated, ...current.jobs.filter((item) => item.id !== updated.id && item.id !== job.id)] }))
      setMessage(action === 'cancel' ? '取消请求已由服务端接收。' : '重试请求已由服务端接收。')
    } catch (error) { if (activeRef.current && authRef.current === token) setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : '请求超时，请刷新任务状态后重试') }
    finally { clearTimeout(timeout); if (activeRef.current && authRef.current === token) setBusy('') }
  }

  const viewResult = async (job: ReconstructionJob) => {
    if (!job.result) return
    const controller = new AbortController()
    actionRequest.current = controller
    setBusy(job.id); setMessage('')
    const timeout = window.setTimeout(() => controller.abort(), 90_000)
    try {
      let model: ArrayBuffer | null = null
      let layout: ReconstructionLayout | null = null
      if (job.result.modelUrl) {
        const response = await fetchArtifact(job.result.modelUrl, token, controller.signal)
        if (Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw new Error('模型超过当前浏览器预览的 25 MB 限制，请下载后处理')
        model = await response.arrayBuffer()
        validateGlb(model)
      }
      if (job.result.layoutUrl) layout = parseLayout(await (await fetchArtifact(job.result.layoutUrl, token, controller.signal)).json())
      if (!activeRef.current || authRef.current !== token) return
      if (kind === 'pet' && model) {
        onApplyPet(model, `pet-${job.id.slice(0, 8)}.glb`, job.result.method, job.result.limitations ?? [])
        setMessage('已载入真实 GLB。优先使用内置动作；无匹配动画时展示整体动作反馈，离线冻结。')
      } else if (model || layout) setPreview({ jobId: job.id, model, layout })
      else throw new Error('这个任务没有可预览的模型或结构文件')
    } catch (error) { if (activeRef.current && authRef.current === token) setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : '结果下载超时，请重试') }
    finally { clearTimeout(timeout); if (activeRef.current && authRef.current === token) setBusy('') }
  }

  const downloadResult = async (job: ReconstructionJob) => {
    const path = job.result?.modelUrl || job.result?.layoutUrl
    if (!path) return
    const controller = new AbortController()
    actionRequest.current = controller
    setBusy(job.id); setMessage('')
    try {
      const blob = await (await fetchArtifact(path, token, controller.signal)).blob()
      if (!activeRef.current || authRef.current !== token) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a'); link.href = url; link.download = `petlink-${kind}-${job.id}.${job.result?.modelUrl ? 'glb' : 'json'}`; link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { if (activeRef.current && authRef.current === token) setMessage(error instanceof Error && error.name !== 'AbortError' ? error.message : '下载已停止') }
    finally { if (activeRef.current && authRef.current === token) setBusy('') }
  }

  const jobs = data.jobs.filter((job) => job.kind === kind).sort((a, b) => b.createdAt - a.createdAt)
  return <section className="reconstruction-panel" aria-label={kind === 'pet' ? '宠物 AI 重建任务' : '室内 AI 重建任务'}>
    <div className="collar-section-heading"><div><div className="collar-kicker">OPEN MODEL / RECONSTRUCTION</div><h3>{kind === 'pet' ? '用它的真实影像，建立 3D 形象。' : '把家里的照片和视频，交给重建任务。'}</h3><p>上传原始素材，使用服务端实际可用的开源模型。真实阶段、结果和限制都会保留。</p></div><span className={`reconstruction-worker ${data.worker?.online ? 'is-online' : ''}`}><span />{!token ? '等待连接' : data.worker ? data.worker.online ? '推理节点在线' : '推理节点离线' : '正在检查服务'}</span></div>
    <div className="reconstruction-upload-grid">
      {(['image', 'video'] as const).map((mode) => <label key={mode} className={`reconstruction-upload ${selection?.mode === mode ? 'is-selected' : ''} ${busy ? 'is-disabled' : ''}`}>
        <span className="reconstruction-upload-icon">{mode === 'image' ? <Camera size={25} /> : <Film size={25} />}</span><div><b>{kind === 'pet' ? '宠物' : '室内'}{mode === 'image' ? '照片' : '视频'}{mode === 'image' && kind === 'room' ? ' · 支持多张' : ''}</b><p>{mode === 'image' ? kind === 'pet' ? '清晰主体、完整身体，一张照片开始' : '同一空间的重叠视角，可一次选择多张' : kind === 'pet' ? '一段围绕宠物拍摄的视频' : '一段连续、缓慢环拍室内的视频'}</p><small>{mode === 'image' ? '每张 ≤ 15 MB' : '单个 ≤ 100 MB'} · {mode === 'image' && kind === 'room' ? '合计 ≤ 150 MB' : '选择文件'}</small></div><Upload size={16} /><input type="file" accept={mode === 'image' ? 'image/*' : 'video/*'} multiple={mode === 'image' && kind === 'room'} disabled={!!busy} aria-label={`上传${kind === 'pet' ? '宠物' : '室内'}${mode === 'image' ? '照片' : '视频'}用于真实重建`} onChange={(event) => { selectFiles(Array.from(event.target.files || []), mode); event.target.value = '' }} />
      </label>)}
    </div>
    {selection && <div className="reconstruction-selection"><div><b>{selection.mode === 'image' ? `${selection.files.length} 张照片` : '1 个视频'}已选择</b><span>{selection.files.map((file) => file.name).join(' · ')}</span><small>{(selection.files.reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(1)} MB · 将上传到当前服务器</small></div><button type="button" className="collar-button is-primary" disabled={!token || !!busy} onClick={() => void submit()}>{busy === 'upload' ? <LoaderCircle size={15} className="reconstruction-spin" /> : <Upload size={15} />}{busy === 'upload' ? '上传中…' : '上传并创建任务'}</button><button type="button" className="collar-button" disabled={!!busy && busy !== 'upload'} onClick={() => busy === 'upload' ? actionRequest.current?.abort() : setSelection(null)}>{busy === 'upload' ? '停止上传' : '移除'}</button></div>}
    {!token && <p className="reconstruction-service-note">先在上方输入 Web 访问令牌，即可上传素材并查看已有重建任务。</p>}
    {token && data.worker && !data.worker.online && <p className="reconstruction-service-note"><Clock3 size={14} />推理节点当前离线。服务器接收后的任务会排队等待，不会显示虚构的生成进度。</p>}
    {data.worker?.online && <p className="reconstruction-service-note">节点报告的能力：{data.worker.capabilities.length ? data.worker.capabilities.join(' · ') : '尚未报告可执行任务类型'}</p>}
    {serviceError && <div className="collar-message is-error" role="alert"><CircleAlert size={15} />{serviceError}<button type="button" onClick={() => setRefresh((v) => v + 1)}>重试连接</button></div>}
    {message && <div className="collar-message" role="status">{message}</div>}
    <div className="reconstruction-history-heading"><span>真实重建任务 <b>{jobs.length}</b></span><button type="button" className="collar-button" disabled={!token || !!busy} onClick={() => setRefresh((v) => v + 1)}><RefreshCw size={12} />刷新</button></div>
    {!jobs.length ? <div className="reconstruction-no-jobs"><Box size={21} /><span>{token ? '还没有此类任务。上传后，处理过程与结果会保存在这里。' : '连接后载入任务历史。'}</span></div> : <div className="reconstruction-jobs">{jobs.map((job) => {
      const thumbnail = job.result?.previewUrl || job.inputs?.find((item) => item.mime.startsWith('image/'))?.url
      return <article className="reconstruction-job" key={job.id} data-testid={`reconstruction-job-${job.id}`}><div className="reconstruction-job-main">{thumbnail ? <div className="reconstruction-job-photo"><PrivateImage url={thumbnail} token={token} alt={`${kind === 'pet' ? '宠物' : '室内'}任务的真实素材或结果`} /></div> : <div className="reconstruction-job-symbol">{job.inputs?.some((item) => item.mime.startsWith('video/')) ? <Film size={26} /> : <Box size={26} />}</div>}<div className="reconstruction-job-info"><div><b>{kind === 'pet' ? '宠物 3D 重建' : '室内结构重建'}</b><span className={`reconstruction-job-status is-${job.status}`}>{job.status === 'running' && <LoaderCircle size={11} className="reconstruction-spin" />}{job.status === 'succeeded' && <Check size={11} />}{jobStatusLabels[job.status]}</span></div><p>{job.stage || jobStatusLabels[job.status]}</p><small>{new Date(job.createdAt).toLocaleString('zh-CN', { hour12: false })} · #{job.id.slice(0, 8)}{job.inputs?.length ? ` · ${job.inputs.length} 份素材` : ''}</small>{job.error && <p className="reconstruction-job-error">{job.error}</p>}</div><div className="reconstruction-job-actions">{(job.status === 'queued' || job.status === 'running') && <button type="button" className="collar-button" disabled={!!busy} onClick={() => void jobAction(job, 'cancel')}><X size={13} />取消</button>}{(job.status === 'failed' || job.status === 'cancelled') && <button type="button" className="collar-button" disabled={!!busy} onClick={() => void jobAction(job, 'retry')}><RefreshCw size={13} />重试</button>}{job.status === 'succeeded' && (job.result?.modelUrl || job.result?.layoutUrl) && <><button type="button" className="collar-button is-primary" disabled={!!busy} onClick={() => void viewResult(job)}>{busy === job.id ? <LoaderCircle size={13} className="reconstruction-spin" /> : <Play size={13} />}{kind === 'pet' ? '应用 3D 形象' : '查看空间结果'}</button><button type="button" className="collar-button" disabled={!!busy} onClick={() => void downloadResult(job)}><Download size={13} />下载</button></>}</div></div>
        {job.result && <div className="reconstruction-job-result"><span>实际方法：{job.result.method}</span>{job.result.limitations?.length > 0 && <ul className="reconstruction-limitations">{job.result.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>}</div>}
        {!!job.inputs?.length && <SourceMedia inputs={job.inputs} token={token} />}
        {preview?.jobId === job.id && <ResultPreview model={preview.model} layout={preview.layout} />}
      </article>
    })}</div>}
  </section>
}
