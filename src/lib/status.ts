import type { Device, HandoffState, PetState } from '@/domain/types'

/** 摄像头画面状态（统一供预览/放大/切换列表使用）。当前无真实视频源，一律标注“演示画面”。 */
export type CamViewKind = 'connecting' | 'offline' | 'none' | 'demo-detected' | 'demo-nearby'
export type CamView = {
  kind: CamViewKind
  /** 顶部角标文案 */
  badge: string
  /** 是否已在画面中识别到该宠物 */
  detected: boolean
  /** 画面是否可展示（连接中/离线/无画面时为 false） */
  showScene: boolean
  /** 是否真实视频（当前恒为 false，接入真实源后才 true） */
  live: boolean
}

export function cameraView(pet: PetState, cam: Device | undefined, handoff: HandoffState): CamView {
  if (handoff.phase === 'transit' || handoff.phase === 'searching' || handoff.phase === 'lost') {
    return { kind: 'connecting', badge: '连接中…', detected: false, showScene: false, live: false }
  }
  if (!cam) return { kind: 'none', badge: '无可用画面', detected: false, showScene: false, live: false }
  if (!cam.online) return { kind: 'offline', badge: '设备离线', detected: false, showScene: false, live: false }
  if (cam.roomId === pet.roomId) {
    return { kind: 'demo-detected', badge: '演示画面', detected: true, showScene: true, live: false }
  }
  return { kind: 'demo-nearby', badge: '演示画面 · 未检测到', detected: false, showScene: true, live: false }
}

/** 定位状态（定性，替代随机百分比）。 */
export type LocateLevel = 'confirmed' | 'assist' | 'switching'
export type LocateState = { label: string; level: LocateLevel; tone: 'ok' | 'warn' | 'muted' }

export function locateState(pet: PetState, handoff: HandoffState, hasCamInRoom: boolean): LocateState {
  if (handoff.phase === 'transit' || handoff.phase === 'searching' || handoff.phase === 'lost') {
    return { label: '定位切换中', level: 'switching', tone: 'warn' }
  }
  if (hasCamInRoom && pet.trackingSources.includes('camera')) {
    return { label: '视觉已确认', level: 'confirmed', tone: 'ok' }
  }
  return { label: '辅助定位中', level: 'assist', tone: 'muted' }
}
