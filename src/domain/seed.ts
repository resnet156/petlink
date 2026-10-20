import type {
  AutomationRule,
  ChatMessage,
  Device,
  HomeMap,
  PetEvent,
  PetState,
  Room,
} from './types'
import { makeId, rectPoints } from './geometry'
import { defaultFurniture } from '@/components/map/furnitureLib'

export const SCHEMA_VERSION = 7

function room(
  id: string,
  name: string,
  kind: Room['kind'],
  poly: Room['polygon'],
  devices: string[],
  temperature: number,
  humidity: number,
): Room {
  const r: Room = {
    id,
    name,
    kind,
    polygon: poly,
    devices,
    environment: { temperature, humidity, updatedAt: Date.now() },
  }
  r.furniture = defaultFurniture(r)
  return r
}

// 固定 id，便于 seed 设备双向绑定
const R = {
  living: 'room_living',
  bedroom: 'room_bedroom',
  study: 'room_study',
  balcony: 'room_balcony',
  dining: 'room_dining',
}

export function seedDevices(): Device[] {
  const on = (id: string, name: string, type: Device['type'], roomId: string, status: Device['status'] = {}): Device => ({
    id,
    name,
    type,
    roomId,
    online: true,
    status,
  })
  return [
    on('dev_cam_living', '客厅摄像头', 'camera', R.living, { recording: true }),
    on('dev_spk_living', '客厅小度音箱', 'speaker', R.living, { volume: 48 }),
    on('dev_ac_living', '客厅空调', 'ac', R.living, { power: false, target: 26, mode: '制冷' }),
    on('dev_cam_bedroom', '卧室摄像头', 'camera', R.bedroom, { recording: true }),
    on('dev_screen_bedroom', '卧室智能屏', 'smart_screen', R.bedroom, { brightness: 65 }),
    on('dev_cam_study', '书房摄像头', 'camera', R.study, { recording: true }),
    on('dev_cam_balcony', '阳台摄像头', 'camera', R.balcony, { recording: true }),
    on('dev_feeder_dining', '智能喂食器', 'feeder', R.dining, { food: 68, lastPortion: 18 }),
    on('dev_water_dining', '智能饮水器', 'water', R.dining, { level: 72 }),
    on('dev_sensor_dining', '温湿度传感器', 'temp_humidity', R.dining, {}),
  ]
}

export function seedHomeMap(): HomeMap {
  return {
    id: 'home_default',
    name: '我的家',
    version: 1,
    rooms: [
      // 紧贴成一套完整户型（共享墙，无缝隙）
      room(R.dining, '餐厅', 'dining', rectPoints(40, 40, 260, 260), ['dev_feeder_dining', 'dev_water_dining', 'dev_sensor_dining'], 26.9, 58),
      room(R.study, '书房', 'study', rectPoints(300, 40, 220, 260), ['dev_cam_study'], 26.8, 55),
      room(R.bedroom, '卧室', 'bedroom', rectPoints(520, 40, 440, 280), ['dev_cam_bedroom', 'dev_screen_bedroom'], 25.6, 53),
      room(R.living, '客厅', 'living', rectPoints(40, 300, 480, 260), ['dev_cam_living', 'dev_spk_living', 'dev_ac_living'], 26.4, 56),
      room(R.balcony, '阳台', 'balcony', rectPoints(520, 320, 440, 240), ['dev_cam_balcony'], 27.5, 60),
    ],
  }
}

export function seedPet(): PetState {
  return {
    id: 'pet_maoqiu',
    name: '毛球',
    roomId: R.living,
    behavior: 'sleeping',
    confidence: 0.96,
    lastUpdatedAt: Date.now(),
    trackingSources: ['camera', 'ble'],
    collarBattery: 85,
    species: '橘猫',
    furColor: '橘白',
    collarColor: '青绿色',
  }
}

/** 默认两只宠物，用于展示多宠物能力 */
export function seedPets(): PetState[] {
  return [
    seedPet(),
    {
      id: 'pet_tuanzi',
      name: '团子',
      roomId: R.bedroom,
      behavior: 'idle',
      confidence: 0.93,
      lastUpdatedAt: Date.now(),
      trackingSources: ['ble', 'imu'],
      collarBattery: 78,
      species: '英短',
      furColor: '蓝灰',
      collarColor: '奶黄色',
    },
  ]
}

export function seedRules(): AutomationRule[] {
  return [
    {
      id: makeId('rule'),
      name: '高温开空调',
      trigger: 'temp_above',
      threshold: 29,
      targetRoomId: 'current',
      targetDeviceType: 'ac',
      action: '建议将空调设为 26℃',
      mode: 'suggest',
      enabled: true,
    },
    {
      id: makeId('rule'),
      name: '跨房间摄像头接力',
      trigger: 'enter_room',
      targetRoomId: 'current',
      targetDeviceType: 'camera',
      action: '切换至最近摄像头',
      mode: 'suggest',
      enabled: true,
    },
    {
      id: makeId('rule'),
      name: '找主人铃铛通知',
      trigger: 'bell',
      targetRoomId: 'current',
      targetDeviceType: 'speaker',
      action: 'App 推送并提供一键回应 / 看一眼',
      mode: 'notify',
      enabled: true,
    },
  ]
}

/** 生成当日历史事件，供踪迹 / 历史轨迹 / 日记使用（相对当前时间回填） */
export function seedEvents(): PetEvent[] {
  const now = Date.now()
  const min = 60 * 1000
  const ev = (
    offsetMin: number,
    type: PetEvent['type'],
    title: string,
    detail: string,
    extra: Partial<PetEvent> = {},
  ): PetEvent => ({
    id: makeId('evt'),
    timestamp: now - offsetMin * min,
    type,
    title,
    detail,
    petId: 'pet_maoqiu',
    ...extra,
  })
  return [
    ev(360, 'room_change', '客厅 → 卧室', '多摄像头与项圈 BLE 共同判断位置迁移', {
      fromRoomId: 'room_living',
      toRoomId: 'room_bedroom',
      roomId: 'room_bedroom',
      source: ['camera', 'ble'],
      media: { type: 'image' },
    }),
    ev(300, 'drink', '喝水', '饮水器检测到饮水事件 37 秒', { roomId: 'room_dining', deviceId: 'dev_water_dining' }),
    ev(240, 'eat', '完成进食', '智能喂食器记录 18g', { roomId: 'room_dining', deviceId: 'dev_feeder_dining', media: { type: 'image' } }),
    ev(180, 'owner_interaction', '主人远程陪伴', '通过卧室智能屏视频互动 4 分 12 秒', { roomId: 'room_bedroom', deviceId: 'dev_screen_bedroom' }),
    ev(120, 'play', '玩耍', '识别到毛球持续玩耍 11 分钟', { roomId: 'room_living', media: { type: 'video' } }),
    ev(60, 'room_change', '卧室 → 客厅', '客厅摄像头检测到毛球进入画面', {
      fromRoomId: 'room_bedroom',
      toRoomId: 'room_living',
      roomId: 'room_living',
      source: ['camera'],
    }),
    // 团子（第二只宠物）当日事件，用于演示多宠物各自的日记
    ev(210, 'room_change', '客厅 → 卧室', '项圈 BLE 判断团子进入卧室', {
      fromRoomId: 'room_living',
      toRoomId: 'room_bedroom',
      roomId: 'room_bedroom',
      petId: 'pet_tuanzi',
      source: ['ble'],
    }),
    ev(150, 'play', '玩耍', '卧室摄像头识别到团子追逐玩具 6 分钟', { roomId: 'room_bedroom', petId: 'pet_tuanzi', media: { type: 'video' } }),
    ev(80, 'drink', '喝水', '饮水器检测到团子饮水 20 秒', { roomId: 'room_bedroom', petId: 'pet_tuanzi' }),
    // 往期事件（用于演示“今天 / 近7天 / 本月”时间筛选产生不同结果）
    ev(2 * 24 * 60, 'play', '玩耍', '2 天前客厅玩耍 9 分钟', { roomId: 'room_living', media: { type: 'video' } }),
    ev(5 * 24 * 60, 'eat', '完成进食', '5 天前喂食器记录 16g', { roomId: 'room_dining', deviceId: 'dev_feeder_dining' }),
    ev(20 * 24 * 60, 'room_change', '客厅 → 书房', '20 天前的跨房间记录', { fromRoomId: 'room_living', toRoomId: 'room_study', roomId: 'room_study', source: ['ble'] }),
  ]
}

export function seedChat(): ChatMessage[] {
  const now = Date.now()
  return [
    {
      id: makeId('msg'),
      role: 'pet_event',
      kind: 'bell',
      text: '毛球拨动了「找主人铃铛」，客厅摄像头确认毛球停留在铃铛旁。',
      timestamp: now - 40 * 60 * 1000,
    },
    { id: makeId('msg'), role: 'owner', kind: 'text', text: '毛球，我马上回家～', timestamp: now - 39 * 60 * 1000, played: true },
    { id: makeId('msg'), role: 'system', text: '已通过客厅小度音箱播放 · 建议打开摄像头确认响应', timestamp: now - 39 * 60 * 1000 },
  ]
}
