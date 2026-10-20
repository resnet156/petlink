import type { PetBehavior } from './types'

export type CollarActivity = 'rest' | 'walk' | 'run' | 'shake' | 'unknown'
export type MotionEvent = {
  id: string
  deviceId: string
  bootId: string
  seq: number
  receivedAt: number
  capturedAt: number
  activity: CollarActivity
  confidence: number
  features: { accelRms: number; gyroRms: number }
  sample: { ax: number; ay: number; az: number; gx: number; gy: number; gz: number }
}
export type CollarLive = {
  device: null | { deviceId: string; firmware: string; source: string; sampleRate: number; receivedAt: number; sequence: number }
  latest: MotionEvent | null
  events: MotionEvent[]
  online: boolean
}
export type RoomDimensions = { width: number; depth: number; height: number }

export const activityLabels: Record<CollarActivity, string> = {
  rest: '静止', walk: '步行样活动', run: '跑动样活动', shake: '抖动', unknown: '等待动作',
}
export const activityDescriptions: Record<CollarActivity, string> = {
  rest: '传感器处于低运动状态',
  walk: '检测到中等强度运动',
  run: '检测到较高强度运动',
  shake: '检测到快速角速度变化',
  unknown: '收到新鲜遥测后，模型跟随动作',
}
export const activityToBehavior: Record<CollarActivity, PetBehavior> = {
  rest: 'idle', walk: 'walking', run: 'running', shake: 'shaking', unknown: 'unknown',
}
export const STALE_MS = 10_000

export function liveActivity(live: CollarLive | null, now: number, connected: boolean): CollarActivity {
  const age = live?.latest ? now - live.latest.receivedAt : Infinity
  return connected && live?.online && live.latest && age >= -60_000 && age <= STALE_MS
    ? live.latest.activity : 'unknown'
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const timestamp = (v: unknown) => typeof v === 'string' ? Date.parse(v) : v

function parseEvent(value: unknown): MotionEvent {
  if (!object(value) || !object(value.features) || !object(value.sample)) throw new Error('服务返回的遥测格式不完整')
  const receivedAt = timestamp(value.receivedAt)
  const capturedAt = timestamp(value.capturedAt)
  if (!finite(receivedAt) || !finite(capturedAt) || !finite(value.seq) || !finite(value.confidence)
    || !['rest', 'walk', 'run', 'shake', 'unknown'].includes(String(value.activity))
    || !['ax', 'ay', 'az', 'gx', 'gy', 'gz'].every((key) => finite((value.sample as Record<string, unknown>)[key]))
    || !finite(value.features.accelRms) || !finite(value.features.gyroRms)
    || !(typeof value.id === 'string' || (finite(value.id) && Number.isInteger(value.id))) || typeof value.deviceId !== 'string') throw new Error('服务返回了无效的遥测数据')
  return { ...value, id: String(value.id), receivedAt, capturedAt } as MotionEvent
}

export function parseLive(value: unknown): CollarLive {
  if (!object(value) || typeof value.online !== 'boolean' || !Array.isArray(value.events)) throw new Error('服务返回格式不正确')
  if (value.device !== null && (!object(value.device) || typeof value.device.deviceId !== 'string')) throw new Error('设备信息格式不正确')
  return { device: value.device as CollarLive['device'], online: value.online,
    latest: value.latest === null ? null : parseEvent(value.latest), events: value.events.map(parseEvent) }
}

export function validRoom(room: RoomDimensions) {
  return Number.isFinite(room.width) && room.width >= 1 && room.width <= 20
    && Number.isFinite(room.depth) && room.depth >= 1 && room.depth <= 20
    && Number.isFinite(room.height) && room.height >= 1.5 && room.height <= 6
}

/** A GLB must be self-contained; do not silently fetch external model resources. */
export function validateGlb(buffer: ArrayBuffer) {
  if (buffer.byteLength < 20 || buffer.byteLength > 25 * 1024 * 1024) throw new Error('请选择小于 25 MB 的 GLB 模型')
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('仅支持 GLB 2.0 格式')
  const length = view.getUint32(12, true)
  if (length + 20 > buffer.byteLength) throw new Error('GLB 文件不完整')
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)))
  if (!object(json) || !object(json.asset) || json.asset.version !== '2.0') throw new Error('模型缺少有效的 glTF 2.0 asset 信息')
  if (json.buffers !== undefined && !Array.isArray(json.buffers)) throw new Error('模型 buffers 格式无效')
  if (json.images !== undefined && !Array.isArray(json.images)) throw new Error('模型 images 格式无效')
  const resources = [...(json.buffers || []), ...(json.images || [])]
  if (resources.some((r: unknown) => !object(r) || (r.uri !== undefined && (typeof r.uri !== 'string' || !r.uri.startsWith('data:'))))) throw new Error('请导出贴图内嵌的 GLB；不加载外部资源')
}
