import { get, set } from 'idb-keyval'
import { validateGlb } from '@/domain/collar'

export type PetAvatarModel = {
  jobId: string
  data: ArrayBuffer
  method: string
  animations: string[]
}

// v2 deliberately does not read the old unscoped keys: they could belong to
// another signed-in account on this browser.
const INDEX_KEY = 'petlink-pet-avatar-jobs-v2'
const UPDATE_KEY = 'petlink-pet-avatar-updated-v2'
const scopedKey = (base: string, scope: string) => `${base}:${encodeURIComponent(scope)}`
const modelKey = (scope: string, petId: string) => `${scopedKey('petlink-pet-avatar-glb-v2', scope)}:${encodeURIComponent(petId)}`

export function latestPetAvatarJob(scope: string, petId: string) {
  if (!scope) return ''
  try {
    const values = JSON.parse(localStorage.getItem(scopedKey(INDEX_KEY, scope)) || '{}') as Record<string, unknown>
    return typeof values[petId] === 'string' ? values[petId] : ''
  } catch { return '' }
}

export function rememberPetAvatarJob(scope: string, petId: string, jobId: string) {
  if (!scope) throw new Error('账户尚未就绪，无法保存桌宠任务')
  try {
    const key = scopedKey(INDEX_KEY, scope)
    const raw = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
    const values = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    localStorage.setItem(key, JSON.stringify({ ...values, [petId]: jobId }))
  } catch { /* The current session can still show the job from the API. */ }
}

/** The service's result flags alone are insufficient: reject static GLBs before caching. */
export function assertAnimatedRig(data: ArrayBuffer) {
  validateGlb(data)
  const view = new DataView(data)
  if (view.byteLength < 20) throw new Error('桌宠模型文件不完整')
  const jsonLength = view.getUint32(12, true)
  if (jsonLength < 2 || jsonLength > 4 * 1024 * 1024 || 20 + jsonLength > view.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw new Error('桌宠模型缺少有效结构')
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as Record<string, unknown>
  if (!Array.isArray(document.skins) || !document.skins.length || !Array.isArray(document.animations) || !document.animations.length) {
    throw new Error('模型缺少骨骼或动画，仍处于待绑定阶段')
  }
}

export async function loadPetAvatarModel(scope: string, petId: string): Promise<PetAvatarModel | null> {
  if (!scope) return null
  const saved = await get<PetAvatarModel>(modelKey(scope, petId))
  if (!saved || !(saved.data instanceof ArrayBuffer) || typeof saved.jobId !== 'string') return null
  assertAnimatedRig(saved.data)
  return saved
}

export async function savePetAvatarModel(scope: string, petId: string, model: PetAvatarModel) {
  if (!scope) throw new Error('账户尚未就绪，无法保存桌宠模型')
  assertAnimatedRig(model.data)
  await set(modelKey(scope, petId), model)
  try { localStorage.setItem(UPDATE_KEY, JSON.stringify({ scope, petId, jobId: model.jobId, at: Date.now() })) } catch { /* local same-window event still works */ }
  window.dispatchEvent(new CustomEvent('petlink:avatar-updated', { detail: { scope, petId, jobId: model.jobId } }))
}

export function isPetAvatarUpdate(event: StorageEvent, scope: string, petId: string) {
  if (event.key !== UPDATE_KEY || !event.newValue) return false
  try { const detail = JSON.parse(event.newValue) as { scope?: string; petId?: string }; return !!scope && detail.scope === scope && detail.petId === petId } catch { return false }
}
