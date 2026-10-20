import type { Device, HandoffPhase, Room } from '@/domain/types'

/** 房间是否拥有某类型的在线设备 */
export function roomHasDevice(devices: Device[], roomId: string, type: Device['type']): boolean {
  return devices.some((d) => d.roomId === roomId && d.type === type && d.online)
}

export function roomDevices(devices: Device[], roomId: string): Device[] {
  return devices.filter((d) => d.roomId === roomId)
}

export function camerasOf(devices: Device[]): Device[] {
  return devices.filter((d) => d.type === 'camera' && d.online)
}

/** 接力阶段 → 人类可读文案 */
export function handoffMessage(
  phase: HandoffPhase,
  fromRoom?: Room,
  toRoom?: Room,
  hasCamera = true,
): string {
  const from = fromRoom?.name ?? 'A 房间'
  const to = toRoom?.name ?? 'B 房间'
  switch (phase) {
    case 'lost':
      return `${from}摄像头已失去目标`
    case 'transit':
      return `项圈信号正在保持连续定位`
    case 'searching':
      return `正在寻找${to}房间摄像头…`
    case 'detected':
      return `${to}摄像头已识别，画面与位置重新对齐`
    case 'completed':
      return `接力完成：已自动切换至${to}摄像头`
    case 'no_camera':
      return `当前位置仍确认在${to}；该房间暂无直接摄像头，项圈信号继续追踪`
    default:
      return hasCamera ? `${to}摄像头持续识别` : `项圈信号持续定位`
  }
}

/** 追踪来源标签（面向用户，不用 BLE/IMU 术语） */
export function trackingSourceLabel(sources: string[]): string {
  const has = (s: string) => sources.includes(s)
  if (has('camera') && has('ble')) return '视觉 + 项圈'
  if (has('ble') && has('imu')) return '项圈信号'
  if (has('camera')) return '视觉'
  if (has('ble')) return '项圈信号'
  return '连续定位'
}

export const behaviorLabel: Record<string, string> = {
  walking: '步行样活动',
  shaking: '抖动',
  unknown: '暂无动作数据',
  idle: '静止',
  looking: '摇头 / 张望',
  running: '奔跑',
  sleeping: '睡觉',
  eating: '进食',
  drinking: '喝水',
  playing: '玩耍',
  litter: '如厕 / 停留',
}

export const behaviorMeta: Record<string, string> = {
  walking: '项圈运动阈值分类 · 待宠物实测校准',
  shaking: '项圈检测到快速转动',
  unknown: '等待新鲜项圈遥测',
  sleeping: '姿态稳定 · 正在休息',
  idle: '当前位置稳定',
  looking: '正在观察周围',
  running: '活动增强 · 连续跑动',
  eating: '喂食器事件 · 本次约 18g',
  drinking: '饮水事件进行中',
  playing: '活跃度正常 · 玩耍中',
  litter: '区域停留中',
}

/** 行为对应的状态色（用于头像状态环/徽标） */
export const behaviorColor: Record<string, string> = {
  walking: '#419d88',
  shaking: '#d38738',
  unknown: '#8b9591',
  sleeping: '#7f93c0',
  idle: '#9aa8a3',
  looking: '#4ca092',
  running: '#2e7f75',
  eating: '#c5793f',
  drinking: '#5aa6e0',
  playing: '#d98fb0',
  litter: '#b0a06a',
}

/** 行为对应的小图标（emoji），用于头像右上角悬浮状态徽标 */
export const behaviorBadge: Record<string, string> = {
  walking: '🐾',
  shaking: '↔',
  unknown: '—',
  sleeping: '💤',
  idle: '●',
  looking: '👀',
  running: '🐾',
  eating: '🍽',
  drinking: '💧',
  playing: '🧶',
  litter: '◫',
}
