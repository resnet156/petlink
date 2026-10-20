export type ReconstructionKind = 'pet' | 'room' | 'pet_avatar'
export type MediaMode = 'image' | 'video'
export type ReconstructionJob = {
  id: string
  kind: ReconstructionKind
  petId?: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  createdAt: number
  updatedAt: number
  stage: string
  error?: string
  inputs?: { name: string; mime: string; url: string }[]
  result?: { modelUrl?: string; layoutUrl?: string; previewUrl?: string; method: string; limitations: string[]; rigged?: boolean; animated?: boolean; animations?: string[] }
}
export type ReconstructionJobs = { jobs: ReconstructionJob[]; worker?: { online: boolean; capabilities: string[] } }
export type ReconstructionLayout = {
  version: number
  unit: 'm' | 'relative'
  method: string
  rooms: { name: string; polygon: { x: number; y: number }[]; height?: number }[]
  limitations: string[]
}
export const jobStatusLabels: Record<ReconstructionJob['status'], string> = {
  queued: '排队中', running: '处理中', succeeded: '已完成', failed: '失败', cancelled: '已取消',
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'

export function validateMedia(files: Pick<File, 'name' | 'size' | 'type'>[], kind: ReconstructionKind, mode: MediaMode) {
  if (!files.length) throw new Error('请先选择照片或视频')
  if ((mode === 'video' || kind !== 'room') && files.length !== 1) throw new Error(mode === 'video' ? '每个任务请选择一个视频' : '宠物照片任务请选择一张清晰照片')
  let total = 0
  for (const file of files) {
    if (file.size <= 0) throw new Error(`${file.name} 是空文件`)
    if (!file.type.startsWith(`${mode}/`)) throw new Error(`${file.name} 不是支持的${mode === 'image' ? '照片' : '视频'}类型`)
    if (file.size > (mode === 'image' ? 15 : 100) * 1024 * 1024) throw new Error(`${mode === 'image' ? '单张照片' : '单个视频'}不能超过 ${mode === 'image' ? 15 : 100} MB`)
    total += file.size
  }
  if (total > 150 * 1024 * 1024) throw new Error('一个任务的素材总大小不能超过 150 MB')
}

export function parseJobs(value: unknown): ReconstructionJobs {
  if (!object(value) || !Array.isArray(value.jobs)) throw new Error('任务服务返回格式不正确')
  const jobs = value.jobs.map((job: unknown) => {
    if (!object(job) || typeof job.id !== 'string' || !['pet', 'room', 'pet_avatar'].includes(String(job.kind))
      || !Object.prototype.hasOwnProperty.call(jobStatusLabels, String(job.status)) || typeof job.stage !== 'string') throw new Error('任务数据格式不正确')
    if (typeof job.createdAt !== 'number' || !Number.isFinite(job.createdAt) || typeof job.updatedAt !== 'number' || !Number.isFinite(job.updatedAt)) throw new Error('任务时间格式不正确')
    const result = object(job.result) ? {
      method: typeof job.result.method === 'string' ? job.result.method : '服务端未报告方法',
      limitations: Array.isArray(job.result.limitations) ? job.result.limitations.filter((item): item is string => typeof item === 'string') : [],
      modelUrl: typeof job.result.modelUrl === 'string' ? job.result.modelUrl : undefined,
      layoutUrl: typeof job.result.layoutUrl === 'string' ? job.result.layoutUrl : undefined,
      previewUrl: typeof job.result.previewUrl === 'string' ? job.result.previewUrl : undefined,
      rigged: job.result.rigged === true,
      animated: job.result.animated === true,
      animations: Array.isArray(job.result.animations) ? job.result.animations.filter((item): item is string => typeof item === 'string') : [],
    } : undefined
    const inputs = Array.isArray(job.inputs) ? job.inputs.filter((input): input is { name: string; mime: string; url: string } => object(input) && typeof input.name === 'string' && typeof input.mime === 'string' && typeof input.url === 'string') : []
    return { ...job, petId: typeof job.petId === 'string' ? job.petId : undefined, result, inputs, error: typeof job.error === 'string' ? job.error : undefined } as ReconstructionJob
  })
  const worker = object(value.worker) && typeof value.worker.online === 'boolean' && Array.isArray(value.worker.capabilities)
    ? { online: value.worker.online, capabilities: value.worker.capabilities.filter((v): v is string => typeof v === 'string') } : undefined
  return { jobs, worker }
}

/** Never attach bearer credentials to external or unrelated same-origin services. */
export function artifactUrl(value: string, origin: string, basePath: string) {
  const url = new URL(value, origin)
  if (url.origin !== origin || !url.pathname.startsWith(`${basePath}api/jobs/`) || url.username || url.password) throw new Error('结果文件地址不属于当前重建服务')
  return url.href
}

export function parseLayout(value: unknown): ReconstructionLayout {
  if (!object(value) || !['m', 'relative'].includes(String(value.unit)) || !Array.isArray(value.rooms) || !value.rooms.length || value.rooms.length > 100) throw new Error('空间结构格式无效或缺少坐标单位')
  const rooms = value.rooms.map((room: unknown) => {
    if (!object(room) || !Array.isArray(room.polygon) || room.polygon.length < 3 || room.polygon.length > 10000) throw new Error('空间结构缺少有效的轮廓')
    const polygon = room.polygon.map((point: unknown) => {
      if (!object(point) || typeof point.x !== 'number' || typeof point.y !== 'number' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e6 || Math.abs(point.y) > 1e6) throw new Error('空间轮廓包含无效坐标')
      return { x: point.x, y: point.y }
    })
    return { name: typeof room.name === 'string' ? room.name : '重建区域', polygon, height: typeof room.height === 'number' && Number.isFinite(room.height) ? room.height : undefined }
  })
  if (rooms.reduce((sum, room) => sum + room.polygon.length, 0) > 10000) throw new Error('空间轮廓超过浏览器预览的复杂度限制')
  return { version: Number(value.version) || 1, unit: value.unit as ReconstructionLayout['unit'], method: typeof value.method === 'string' ? value.method : '服务端重建', rooms,
    limitations: Array.isArray(value.limitations) ? value.limitations.filter((item): item is string => typeof item === 'string') : [] }
}
