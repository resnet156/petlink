import { useEffect, useRef, useState } from 'react'
import { apiUrl, useCollar } from '@/store/useCollar'
import { useStore } from '@/store/useStore'
import { artifactUrl, jobStatusLabels, parseJobs, validateMedia, type MediaMode, type ReconstructionJobs } from '@/domain/reconstruction'
import { latestPetAvatarJob, loadPetAvatarModel, rememberPetAvatarJob, savePetAvatarModel } from '@/lib/petAvatar'
import { usePetAvatarScope } from '@/lib/usePetAvatarScope'
import { Icon } from '@/components/Icon'

type Props = {
  petId: string
  petName: string
  photoFile: File | null
  onPhoto: (file: File) => Promise<boolean>
}

async function checked(response: Response) {
  if (response.ok) return response
  let detail = ''
  try { const body = await response.json(); detail = typeof body.detail === 'string' ? body.detail : '' } catch { /* HTML gateway errors */ }
  if (response.status === 401 || response.status === 403) throw new Error('Web 访问令牌无效，请在真实项圈页重新连接')
  if (response.status === 404) throw new Error('自动骨骼建模服务未就绪，请稍后重试')
  if (response.status === 413) throw new Error('素材超过服务器大小限制，请压缩后重试')
  if (response.status === 422) throw new Error(detail.slice(0, 180) || '素材未通过服务端校验，请换一份清晰照片或视频')
  throw new Error(detail.slice(0, 180) || `素材服务暂不可用（${response.status}）`)
}

export function PetAvatarStudio({ petId, petName, photoFile, onPhoto }: Props) {
  const goPage = useStore((s) => s.goPage)
  const token = useCollar((s) => s.token)
  const scope = usePetAvatarScope(token)
  const [selection, setSelection] = useState<{ file: File; mode: MediaMode } | null>(null)
  const [data, setData] = useState<ReconstructionJobs>({ jobs: [] })
  const [checkedWorker, setCheckedWorker] = useState(false)
  const [checkedToken, setCheckedToken] = useState('')
  const [uploading, setUploading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [cachedJobId, setCachedJobId] = useState('')
  const [cacheChecked, setCacheChecked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [downloadRevision, setDownloadRevision] = useState(0)
  const uploadLock = useRef(false)
  const downloadAttempted = useRef('')
  const autoAttempted = useRef<File | null>(null)
  const handledFile = useRef<File | null>(null)
  const previousScope = useRef(scope)
  const previousPetId = useRef(petId)

  const isInstalledDesktop = window.location.protocol === 'file:'
  const ready = !isInstalledDesktop && !!scope && !!token && checkedToken === token && !!data.worker?.online && data.worker.capabilities.includes('pet_avatar')
  const indexedJobId = latestPetAvatarJob(scope, petId)
  const matchingJobs = data.jobs.filter((job) => job.kind === 'pet_avatar' && job.id === indexedJobId && job.petId === petId)
  const job = matchingJobs.sort((left, right) => right.createdAt - left.createdAt)[0]

  useEffect(() => {
    if ((previousScope.current && previousScope.current !== scope) || previousPetId.current !== petId) {
      setSelection(null)
      autoAttempted.current = null
      handledFile.current = null
    }
    previousScope.current = scope
    previousPetId.current = petId
    setCachedJobId('')
    setCacheChecked(false)
    setMessage('')
    downloadAttempted.current = ''
    let active = true
    void loadPetAvatarModel(scope, petId).then((model) => { if (active) setCachedJobId(model?.jobId || '') }).catch(() => {}).finally(() => { if (active) setCacheChecked(true) })
    return () => { active = false }
  }, [scope, petId])

  useEffect(() => {
    if (!photoFile || handledFile.current === photoFile) return
    void pick(photoFile, 'image', true)
  }, [photoFile, petId])

  useEffect(() => {
    if (!token) { setData({ jobs: [] }); setCheckedWorker(true); setCheckedToken(''); return }
    let active = true
    let pending = false
    let controller: AbortController | null = null
    const load = async () => {
      if (pending) return
      pending = true
      controller = new AbortController()
      try {
        const response = await checked(await fetch(apiUrl('jobs'), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal }))
        const next = parseJobs(await response.json())
        if (active) { setData(next); setCheckedToken(token) }
      } catch (error) {
        if (active && !(error instanceof Error && error.name === 'AbortError')) setMessage(error instanceof Error ? error.message : '任务状态暂时不可用')
      } finally { pending = false; if (active) setCheckedWorker(true) }
    }
    void load()
    const timer = window.setInterval(() => void load(), 4500)
    return () => { active = false; controller?.abort(); clearInterval(timer) }
  }, [token])

  useEffect(() => {
    if (!scope || !cacheChecked || !job || job.status !== 'succeeded' || !job.result?.modelUrl || !job.result.rigged || !job.result.animated || !token || cachedJobId === job.id) return
    const attemptKey = `${scope}|${token}|${job.id}|${job.result.modelUrl}`
    if (downloadAttempted.current === attemptKey) return
    downloadAttempted.current = attemptKey
    const controller = new AbortController()
    let active = true
    setSaving(true)
    void (async () => {
      const url = artifactUrl(job.result!.modelUrl!, window.location.origin, import.meta.env.BASE_URL)
      const response = await checked(await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal }))
      if (Number(response.headers.get('content-length')) > 25 * 1024 * 1024) throw new Error('桌宠模型超过浏览器 25 MB 限制')
      const model = await response.arrayBuffer()
      if (model.byteLength > 25 * 1024 * 1024) throw new Error('桌宠模型超过浏览器 25 MB 限制')
      if (!active) return
      await savePetAvatarModel(scope, petId, { jobId: job.id, data: model, method: job.result!.method, animations: job.result!.animations || [] })
      if (active) { setCachedJobId(job.id); setMessage('骨骼模型已保存到本浏览器，打开网页浮窗即可查看。') }
    })().catch((error) => { if (active && !(error instanceof Error && error.name === 'AbortError')) setMessage(error instanceof Error ? error.message : '模型读取失败') }).finally(() => { if (active) setSaving(false) })
    return () => { active = false; controller.abort(); if (downloadAttempted.current === attemptKey) downloadAttempted.current = '' }
  }, [cacheChecked, job?.id, job?.status, job?.result?.modelUrl, job?.result?.rigged, job?.result?.animated, token, scope, petId, cachedJobId, downloadRevision])

  const submit = async (file = selection?.file, mode = selection?.mode) => {
    if (!file || !mode || !ready || uploadLock.current) return
    try { validateMedia([file], 'pet_avatar', mode) } catch (error) { setMessage(error instanceof Error ? error.message : '素材不符合要求'); return }
    uploadLock.current = true
    setUploading(true)
    setMessage('素材上传中…')
    const form = new FormData()
    form.append('kind', 'pet_avatar')
    form.append('petId', petId)
    form.append('files[]', file)
    try {
      const response = await checked(await fetch(apiUrl('jobs'), { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }))
      const created = parseJobs({ jobs: [await response.json()] }).jobs[0]
      if (created.kind !== 'pet_avatar' || created.petId !== petId) throw new Error('服务端未按当前宠物建立任务，请检查服务版本')
      rememberPetAvatarJob(scope, petId, created.id)
      setData((current) => ({ ...current, jobs: [created, ...current.jobs.filter((item) => item.id !== created.id)] }))
      setSelection((current) => current?.file === file ? null : current)
      setMessage('素材已接收，正在等待骨骼建模；进度以服务端任务为准。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '上传失败，请重试') }
    finally { uploadLock.current = false; setUploading(false) }
  }

  useEffect(() => {
    if (!selection || !ready || uploading || uploadLock.current || autoAttempted.current === selection.file) return
    autoAttempted.current = selection.file
    void submit(selection.file, selection.mode)
  }, [selection, ready, uploading, scope, petId])

  const jobAction = async (target: 'cancel' | 'retry') => {
    if (!job || !token || actionBusy) return
    setActionBusy(true)
    setMessage('')
    try {
      const response = await checked(await fetch(apiUrl(`jobs/${encodeURIComponent(job.id)}/${target}`), { method: 'POST', headers: { Authorization: `Bearer ${token}` } }))
      const updated = parseJobs({ jobs: [await response.json()] }).jobs[0]
      if (updated.id !== job.id) throw new Error('服务端任务编号不一致')
      setData((current) => ({ ...current, jobs: [updated, ...current.jobs.filter((item) => item.id !== updated.id)] }))
      setMessage(target === 'retry' ? '任务已重新排队，状态会自动更新。' : '取消请求已由服务端接收。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败，请重试') }
    finally { setActionBusy(false) }
  }

  const pick = async (file: File | undefined, mode: MediaMode, alreadySaved = false) => {
    if (!file) return
    handledFile.current = file
    if (mode === 'image' && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setMessage('头像已更新；自动建模请选 JPG、PNG 或 WebP。')
      return
    }
    if (mode === 'video' && !['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) {
      setMessage('自动建模的视频请使用 MP4、MOV 或 WebM。')
      return
    }
    try { validateMedia([file], 'pet_avatar', mode) } catch (error) { setMessage(error instanceof Error ? error.message : '素材不符合要求'); return }
    if (mode === 'image' && !alreadySaved && !(await onPhoto(file))) return
    setSelection({ file, mode })
    setMessage(ready ? '素材已选择，正在自动提交…' : '素材已选择；服务就绪后会自动提交。')
  }

  const status = !job ? '' : job.status === 'succeeded' && (!job.result?.rigged || !job.result?.animated || !job.result?.modelUrl)
    ? '已建模 · 待绑定骨骼' : cachedJobId === job.id ? '骨骼桌宠可用' : saving ? '正在载入骨骼模型' : jobStatusLabels[job.status]

  return <section className="card" aria-label={`${petName}的 Q 版桌宠`} data-testid="home-avatar-studio">
    <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-lg font-bold">{petName}的桌宠</h3><span className="badge">{status || '照片 / 视频生成'}</span></div>
    <p className="text-xs leading-relaxed text-muted">上传清晰全身照或环拍视频，为当前宠物建立 Q 版骨骼角色。服务就绪后自动提交；只有包含骨骼和动画的结果才会进入网页浮窗。</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <label className="btn btn-ghost relative cursor-pointer" data-testid="home-avatar-photo"><Icon name="camera" size={15} /> 上传宠物照片<input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传宠物照片生成桌宠" onChange={(event) => { void pick(event.target.files?.[0], 'image'); event.target.value = '' }} /></label>
      <label className="btn btn-ghost relative cursor-pointer" data-testid="home-avatar-video">上传宠物视频<input className="absolute inset-0 cursor-pointer opacity-0" type="file" accept="video/mp4,video/quicktime,video/webm" aria-label="上传宠物视频生成桌宠" onChange={(event) => { void pick(event.target.files?.[0], 'video'); event.target.value = '' }} /></label>
    </div>
    {selection && <div className="mt-3 rounded-xl border border-line bg-[#f4f8f5] p-2.5 text-xs text-muted">待生成：{selection.file.name} · {(selection.file.size / 1024 / 1024).toFixed(1)} MB</div>}
    {selection && ready && autoAttempted.current === selection.file && !uploading && <button type="button" className="btn btn-primary mt-3 w-full" data-testid="home-generate-avatar" onClick={() => void submit()}>重新提交 Q 版桌宠</button>}
    {!token && <button type="button" className="mt-2 text-xs font-bold text-teal" onClick={() => goPage('collar')}>先连接真实项圈的 Web 访问令牌 →</button>}
    {isInstalledDesktop && <p className="mt-2 text-xs text-muted" role="status">安装版暂不支持读取网页生成的骨骼模型；请在同一网站打开网页浮窗（?mini=1）。</p>}
    {token && checkedWorker && !ready && <p className="mt-2 text-xs text-muted" role="status">自动骨骼建模服务未就绪；照片可先作为宠物头像保存。</p>}
    {job && <div className="mt-3 rounded-2xl border border-line bg-[#f7faf8] p-3 text-xs" data-testid="home-avatar-job"><div className="flex items-center justify-between gap-2"><b>{status}</b><span className="text-muted">#{job.id.slice(0, 8)}</span></div><p className="mt-1 text-muted">{job.stage || status}</p>{job.error && <p className="mt-1 text-[#b05e4c]">{job.error}</p>}{job.status === 'succeeded' && !job.result?.rigged && <p className="mt-1 text-muted">当前只有静态网格，不会显示为骨骼桌宠。</p>}{(job.status === 'queued' || job.status === 'running') && <button type="button" className="btn btn-ghost mt-2" disabled={actionBusy || uploading} onClick={() => void jobAction('cancel')}>取消任务</button>}{(job.status === 'failed' || job.status === 'cancelled') && <button type="button" className="btn btn-ghost mt-2" disabled={actionBusy || uploading} onClick={() => void jobAction('retry')}>重试任务</button>}{job.status === 'succeeded' && job.result?.rigged && job.result?.animated && cachedJobId !== job.id && !saving && downloadAttempted.current === `${scope}|${token}|${job.id}|${job.result.modelUrl}` && <button type="button" className="btn btn-ghost mt-2" onClick={() => { downloadAttempted.current = ''; setDownloadRevision((value) => value + 1) }}>重新载入模型</button>}</div>}
    {message && <p className="mt-2 text-xs text-muted" role="status">{message}</p>}
  </section>
}
