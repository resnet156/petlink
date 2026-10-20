import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type {
  AutomationRule,
  ChatMessage,
  Device,
  DeviceType,
  Fence,
  FindOwnerState,
  HandoffState,
  HomeMap,
  LostMode,
  PetBehavior,
  PetEvent,
  PetState,
  Room,
  ToastKind,
  TransitionRoute,
  VoicePreset,
} from '@/domain/types'
import { buildWalkPath, fitFenceRect, makeId, nearestRoomIdWith, roomCentroid } from '@/domain/geometry'
import {
  SCHEMA_VERSION,
  seedChat,
  seedDevices,
  seedEvents,
  seedHomeMap,
  seedPets,
  seedRules,
} from '@/domain/seed'
import { camerasOf, roomHasDevice } from '@/lib/tracking'
import { mockHardwareAdapter } from '@/adapters/mock'
import { timeHM } from '@/lib/time'

export type PageKey = 'collar' | 'home' | 'map' | 'records' | 'me'
export type MapMode = 'live' | 'history' | 'devices'
export type ModalKey =
  | 'mapBuilder'
  | 'avatar'
  | 'camera'
  | 'event'
  | 'action'
  | 'sound'
  | 'fence'
  | 'lost'
  | 'voice'
  | 'chat'
  | 'friends'
  | 'automation'
  | 'ruleEditor'
  | 'device'
  | 'deviceControl'
  | 'shareCard'
  | 'liveLocate'
  | 'desktopWidget'
  | 'auth'
  | null

export type Toast = { id: string; kind: ToastKind; text: string }

type DeviceControlTarget = { deviceId: string } | null

export type StoreState = {
  schemaVersion: number
  // ---- 领域数据（持久化） ----
  homeMap: HomeMap
  devices: Device[]
  pets: PetState[]
  activePetId: string
  /** 当前选中宠物的镜像（始终等于 pets 中 activePetId 那只），便于组件直接读取 */
  pet: PetState
  events: PetEvent[]
  fence: Fence
  rules: AutomationRule[]
  chat: ChatMessage[]
  voice: VoicePreset | null
  lost: LostMode
  findOwner: FindOwnerState
  companionEnabled: boolean
  moodSignal: boolean
  diarySeed: number
  /** 演示模式：开启后才在正式界面显示模拟按钮/演示控制台（持久化） */
  demoMode: boolean

  // ---- UI / 瞬态（不持久化） ----
  page: PageKey
  /** 桌面组件/浮窗视图开关（与完整应用共享同一 store，可运行时切换、天然同步位置） */
  widgetMode: boolean
  mapMode: MapMode
  modal: ModalKey
  drawerOpen: boolean
  demoOpen: boolean
  toasts: Toast[]
  handoff: HandoffState
  transitionRoute: TransitionRoute
  walkIndex: number
  activeCameraId: string | null
  /** 地图上的摄像头观看浮窗是否打开（复用：双击摄像头图标 / 宠物气泡“看看它”都走这里） */
  cameraFloatOpen: boolean
  selectedEvent: PetEvent | null
  deviceControlTarget: DeviceControlTarget
  /** 当前设备操作的执行状态（统一反馈：发送中/成功/失败/离线） */
  deviceOp: { deviceId: string; phase: 'sending' | 'success' | 'failed' | 'offline'; message: string } | null
  editingRuleId: string | null

  // ---- actions ----
  toast: (kind: ToastKind, text: string) => void
  dismissToast: (id: string) => void
  goPage: (page: PageKey) => void
  setWidgetMode: (v: boolean) => void
  toggleWidgetMode: () => void
  setMapMode: (mode: MapMode) => void
  openModal: (m: Exclude<ModalKey, null>) => void
  closeModal: () => void
  toggleDrawer: (v?: boolean) => void
  toggleDemo: (v?: boolean) => void
  setDemoMode: (v: boolean) => void

  applyHomeMap: (rooms: Room[], name?: string, backgroundImage?: string) => void
  moveToRoom: (roomId: string) => void
  simulateNextRoom: () => void
  setBehavior: (b: PetBehavior) => void
  refreshTracking: () => void
  setActivePet: (id: string) => void
  addPet: (name: string) => void
  removePet: (id: string) => void
  renamePet: (id: string, name: string) => void
  setPetPhoto: (id: string, photo: string | undefined) => void
  setRoomEnvironment: (roomId: string, temperature: number, humidity: number) => void
  resolveCameraId: (roomId: string) => string | null
  setActiveCamera: (deviceId: string) => void
  openCamera: (video?: boolean) => void
  /** 打开摄像头浮窗：传 cameraId 看指定摄像头；不传则看离当前宠物最近的摄像头 */
  openCameraFloat: (cameraId?: string, video?: boolean) => void
  closeCameraFloat: () => void

  addDevice: (d: Omit<Device, 'id'>) => string
  updateDevice: (id: string, patch: Partial<Device>) => void
  removeDevice: (id: string) => void
  bindDeviceToRoom: (deviceId: string, roomId: string) => void
  sendCommand: (deviceId: string, command: string, payload?: unknown) => Promise<void>
  turnOnAC: (roomId?: string) => Promise<void>
  /** 统一设备操作：待机→发送中→执行成功/失败/离线，并落事件 */
  execDevice: (deviceId: string, command: string, opts?: { apply?: () => void; eventType?: PetEvent['type']; eventDetail?: string }) => Promise<void>
  /** 远程投喂（先确认克数再执行），成功后生成进食/投喂事件 */
  feed: (deviceId: string, grams: number) => Promise<void>
  clearDeviceOp: () => void

  addEvent: (e: Omit<PetEvent, 'id' | 'timestamp'> & { timestamp?: number }) => void
  openEvent: (e: PetEvent) => void

  addRule: (r: Omit<AutomationRule, 'id'>) => void
  updateRule: (id: string, patch: Partial<AutomationRule>) => void
  removeRule: (id: string) => void
  toggleRule: (id: string) => void
  setEditingRule: (id: string | null) => void

  setFencePoints: (pts: Fence['points']) => void
  fitFence: () => void
  saveFence: () => boolean
  triggerFenceAlert: () => void

  sendChat: (text: string, kind?: ChatMessage['kind']) => void
  triggerBell: () => void
  clearFindOwner: () => void

  saveVoicePreset: (preset: VoicePreset) => void

  setCompanionEnabled: (v: boolean) => void
  triggerLowMood: () => void
  regenerateDiary: () => void

  setLost: (active: boolean) => void
  setDeviceControlTarget: (t: DeviceControlTarget) => void

  resetDemo: () => void
}

function freshDomain() {
  const homeMap = seedHomeMap()
  const devices = seedDevices()
  const pets = seedPets()
  const events = seedEvents()
  const fence: Fence = { points: fitFenceRect(homeMap.rooms), mapVersion: homeMap.version, enabled: true }
  return {
    homeMap,
    devices,
    pets,
    activePetId: pets[0].id,
    pet: pets[0],
    events,
    fence,
    rules: seedRules(),
    chat: seedChat(),
    voice: null as VoicePreset | null,
    lost: { active: false } as LostMode,
    findOwner: { active: false, step: 0, deviceName: '', roomName: '', petName: '' } as FindOwnerState,
    companionEnabled: false,
    moodSignal: false,
    diarySeed: 1,
  }
}

// 一致地更新“当前选中宠物”：同时更新 pets 数组与 pet 镜像
function patchActive(
  s: Pick<StoreState, 'pets' | 'activePetId'>,
  updater: (p: PetState) => PetState,
): { pets: PetState[]; pet: PetState } {
  const pets = s.pets.map((p) => (p.id === s.activePetId ? updater(p) : p))
  const pet = pets.find((p) => p.id === s.activePetId) ?? pets[0]
  return { pets, pet }
}

// 计时器句柄，reset 时清理，避免竞态
let handoffTimers: number[] = []
function clearHandoffTimers() {
  handoffTimers.forEach((t) => clearTimeout(t))
  handoffTimers = []
}

/** 两套房间的整体外接框是否发生较大变化（用于判断自定义围栏是否需复核） */
function roomsBoundsChanged(a: Room[], b: Room[], threshold = 60): boolean {
  if (a.length !== b.length) return true
  const box = (rooms: Room[]) => {
    const pts = rooms.flatMap((r) => r.polygon)
    if (!pts.length) return { x1: 0, y1: 0, x2: 0, y2: 0 }
    return {
      x1: Math.min(...pts.map((p) => p.x)),
      y1: Math.min(...pts.map((p) => p.y)),
      x2: Math.max(...pts.map((p) => p.x)),
      y2: Math.max(...pts.map((p) => p.y)),
    }
  }
  const A = box(a)
  const B = box(b)
  return (
    Math.abs(A.x1 - B.x1) > threshold ||
    Math.abs(A.y1 - B.y1) > threshold ||
    Math.abs(A.x2 - B.x2) > threshold ||
    Math.abs(A.y2 - B.y2) > threshold
  )
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      schemaVersion: SCHEMA_VERSION,
      ...freshDomain(),

      page: 'home',
      widgetMode: typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mini') === '1',
      mapMode: 'live',
      modal: null,
      drawerOpen: false,
      demoOpen: false,
      demoMode: false,
      toasts: [],
      handoff: { phase: 'idle', message: '' },
      transitionRoute: null,
      walkIndex: 0,
      activeCameraId: 'dev_cam_living',
      cameraFloatOpen: false,
      selectedEvent: null,
      deviceControlTarget: null,
      deviceOp: null,
      editingRuleId: null,

      toast: (kind, text) => {
        const id = makeId('toast')
        set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
        window.setTimeout(() => get().dismissToast(id), 2600)
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      goPage: (page) => set({ page }),
      setWidgetMode: (v) => set({ widgetMode: v }),
      toggleWidgetMode: () => set((s) => ({ widgetMode: !s.widgetMode })),
      setMapMode: (mode) => set({ mapMode: mode }),
      openModal: (m) => set({ modal: m }),
      closeModal: () => set({ modal: null }),
      toggleDrawer: (v) => set((s) => ({ drawerOpen: typeof v === 'boolean' ? v : !s.drawerOpen })),
      toggleDemo: (v) => set((s) => ({ demoOpen: typeof v === 'boolean' ? v : !s.demoOpen })),
      setDemoMode: (v) => set({ demoMode: v, demoOpen: v }),

      resolveCameraId: (roomId) => {
        const { devices, homeMap } = get()
        const local = devices.find((d) => d.roomId === roomId && d.type === 'camera' && d.online)
        if (local) return local.id
        const nid = nearestRoomIdWith(homeMap.rooms, roomId, (r) => roomHasDevice(devices, r.id, 'camera'))
        if (!nid) return null
        return devices.find((d) => d.roomId === nid && d.type === 'camera')?.id ?? null
      },

  applyHomeMap: (rooms, name, backgroundImage) => {
    const s = get()
    const version = s.homeMap.version + 1
    const roomIds = new Set(rooms.map((r) => r.id))
    // 解绑已删除房间的设备（保留设备，roomId 置空以便重新绑定）
    const devices = s.devices.map((d) =>
      roomIds.has(d.roomId) ? d : { ...d, roomId: rooms[0]?.id ?? d.roomId },
    )
    // 房间的 devices 列表按设备 roomId 重算，保持双向一致
    const rooms2 = rooms.map((r) => ({
      ...r,
      devices: devices.filter((d) => d.roomId === r.id).map((d) => d.id),
    }))
    const homeMap: HomeMap = {
      ...s.homeMap,
      name: name ?? s.homeMap.name,
      version,
      rooms: rooms2,
      backgroundImage: backgroundImage !== undefined ? backgroundImage : s.homeMap.backgroundImage,
    }
    const fallbackRoom = rooms2[0]?.id
    const pets = s.pets.map((p) => (roomIds.has(p.roomId) ? p : { ...p, roomId: fallbackRoom ?? p.roomId }))
    const activePet = pets.find((p) => p.id === s.activePetId) ?? pets[0]
    // 围栏：用户自定义过的不被静默覆盖；仅在户型大改时标记需复核，否则沿用
    const prevFence = s.fence
    let fence: Fence
    let fenceWarn = false
    if (prevFence.custom && prevFence.points.length >= 3) {
      const major = roomsBoundsChanged(s.homeMap.rooms, rooms2)
      fence = { ...prevFence, needsReview: major }
      fenceWarn = major
    } else {
      // 非自定义围栏才自动贴合新户型
      fence = { points: fitFenceRect(rooms2), mapVersion: version, enabled: prevFence.enabled, custom: false, needsReview: false }
    }
    set({
      homeMap,
      devices,
      pets,
      pet: activePet,
      fence,
      activeCameraId: get().resolveCameraId(activePet.roomId),
    })
    get().toast('success', `户型已应用：${rooms2.length} 个房间 · 追踪/摄像头已同步 (V${version})`)
    if (fenceWarn) get().toast('warn', '地图已更新，请到安全区域检查围栏是否仍然适用')
  },

  setActiveCamera: (deviceId) => set({ activeCameraId: deviceId }),

  openCamera: (video) => {
    const id = get().resolveCameraId(get().pet.roomId)
    set({ activeCameraId: id, modal: 'camera' })
    if (video) window.setTimeout(() => get().toast('info', '已向最近智能屏发送视频互动邀请'), 400)
  },

  openCameraFloat: (cameraId, video) => {
    const id = cameraId ?? get().resolveCameraId(get().pet.roomId)
    set({ activeCameraId: id, cameraFloatOpen: true })
    if (video) window.setTimeout(() => get().toast('info', '已向最近智能屏发送视频互动邀请'), 400)
  },

  closeCameraFloat: () => set({ cameraFloatOpen: false }),

  setActivePet: (id) =>
    set((s) => {
      const pet = s.pets.find((p) => p.id === id)
      if (!pet) return {}
      return { activePetId: id, pet, activeCameraId: get().resolveCameraId(pet.roomId) }
    }),

  addPet: (name) => {
    const id = makeId('pet')
    set((s) => {
      const roomId = s.homeMap.rooms[0]?.id ?? s.pet.roomId
      const np: PetState = {
        id,
        name: name.trim() || `新宠物 ${s.pets.length + 1}`,
        roomId,
        behavior: 'idle',
        confidence: 0.9,
        lastUpdatedAt: Date.now(),
        trackingSources: ['ble'],
        collarBattery: 90,
      }
      const pets = [...s.pets, np]
      return { pets, activePetId: id, pet: np }
    })
    get().toast('success', `已添加宠物：${name.trim() || '新宠物'}`)
  },

  removePet: (id) =>
    set((s) => {
      if (s.pets.length <= 1) {
        get().toast('warn', '至少保留一只宠物')
        return {}
      }
      const pets = s.pets.filter((p) => p.id !== id)
      const active = s.activePetId === id ? pets[0] : s.pets.find((p) => p.id === s.activePetId)!
      return { pets, activePetId: active.id, pet: active }
    }),

  renamePet: (id, name) =>
    set((s) => {
      const pets = s.pets.map((p) => (p.id === id ? { ...p, name: name || p.name } : p))
      const pet = pets.find((p) => p.id === s.activePetId) ?? pets[0]
      return { pets, pet }
    }),

  setPetPhoto: (id, photo) =>
    set((s) => {
      const pets = s.pets.map((p) => (p.id === id ? { ...p, photo } : p))
      const pet = pets.find((p) => p.id === s.activePetId) ?? pets[0]
      return { pets, pet }
    }),

  setBehavior: (b) => {
    set((s) => patchActive(s, (p) => ({ ...p, behavior: b, lastUpdatedAt: Date.now() })))
  },

  refreshTracking: () => {
    const s = get()
    const hasCam = roomHasDevice(s.devices, s.pet.roomId, 'camera')
    // 置信度按定位来源取稳定值（视觉优于纯项圈信号），不随刷新随机抖动
    const confidence = hasCam ? 0.97 : 0.9
    set(
      patchActive(s, (p) => ({
        ...p,
        confidence,
        lastUpdatedAt: Date.now(),
        trackingSources: hasCam ? ['camera', 'ble'] : ['ble', 'imu'],
      })),
    )
    const room = s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
    get().toast('success', `定位已刷新：${room?.name ?? ''} · ${hasCam ? '视觉 + 项圈 · 视觉已确认' : '项圈信号 · 辅助定位中'}`)
  },

      setRoomEnvironment: (roomId, temperature, humidity) => {
        set((s) => ({
          homeMap: {
            ...s.homeMap,
            rooms: s.homeMap.rooms.map((r) =>
              r.id === roomId
                ? { ...r, environment: { temperature, humidity, updatedAt: Date.now() } }
                : r,
            ),
          },
        }))
      },

      addEvent: (e) =>
        set((s) => ({
          events: [{ ...e, id: makeId('evt'), timestamp: e.timestamp ?? Date.now() }, ...s.events],
        })),

      openEvent: (e) => set({ selectedEvent: e, modal: 'event' }),

      addDevice: (d) => {
        const id = makeId('dev')
        set((s) => {
          const devices = [...s.devices, { ...d, id }]
          const rooms = s.homeMap.rooms.map((r) =>
            r.id === d.roomId ? { ...r, devices: [...r.devices, id] } : r,
          )
          return { devices, homeMap: { ...s.homeMap, rooms } }
        })
        return id
      },

      updateDevice: (id, patch) =>
        set((s) => ({ devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),

      removeDevice: (id) =>
        set((s) => ({
          devices: s.devices.filter((d) => d.id !== id),
          homeMap: {
            ...s.homeMap,
            rooms: s.homeMap.rooms.map((r) => ({ ...r, devices: r.devices.filter((x) => x !== id) })),
          },
        })),

      bindDeviceToRoom: (deviceId, roomId) =>
        set((s) => {
          const devices = s.devices.map((d) => (d.id === deviceId ? { ...d, roomId } : d))
          const rooms = s.homeMap.rooms.map((r) => ({
            ...r,
            devices: devices.filter((d) => d.roomId === r.id).map((d) => d.id),
          }))
          return { devices, homeMap: { ...s.homeMap, rooms } }
        }),

      setEditingRule: (id) => set({ editingRuleId: id }),
      addRule: (r) => set((s) => ({ rules: [...s.rules, { ...r, id: makeId('rule') }] })),
      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      toggleRule: (id) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) })),

      setFencePoints: (pts) => set((s) => ({ fence: { ...s.fence, points: pts, custom: true, needsReview: false } })),
      fitFence: () =>
        set((s) => ({ fence: { ...s.fence, points: fitFenceRect(s.homeMap.rooms), mapVersion: s.homeMap.version, custom: false, needsReview: false } })),
      saveFence: () => {
        const s = get()
        if (s.fence.points.length < 3) {
          s.toast('error', '至少需要 3 个点才能形成围栏')
          return false
        }
        set({ fence: { ...s.fence, enabled: true, custom: true, needsReview: false, mapVersion: s.homeMap.version } })
        s.toast('success', `虚拟栅栏已保存 · 与当前 V${s.homeMap.version} 家庭地图同步`)
        return true
      },

      setCompanionEnabled: (v) => {
        set({ companionEnabled: v })
        get().toast('info', v ? '已开启情绪陪伴：仅生成温和陪伴提醒，不作健康判断' : '已关闭情绪陪伴')
      },
      regenerateDiary: () => set((s) => ({ diarySeed: s.diarySeed + 1 })),

      setLost: (active) => {
        const s = get()
        set({
          lost: { active, lastRoomId: s.pet.roomId, lastUpdatedAt: Date.now() },
        })
        s.toast(active ? 'warn' : 'info', active ? '走失模式已开启，位置将持续广播' : '走失模式已关闭')
      },
      setDeviceControlTarget: (t) => set({ deviceControlTarget: t, deviceOp: null, modal: t ? 'deviceControl' : get().modal }),
      clearDeviceOp: () => set({ deviceOp: null }),

      resetDemo: () => {
        clearHandoffTimers()
        set({
          schemaVersion: SCHEMA_VERSION,
          ...freshDomain(),
          handoff: { phase: 'idle', message: '' },
          transitionRoute: null,
          walkIndex: 0,
          activeCameraId: 'dev_cam_living',
          modal: null,
          cameraFloatOpen: false,
          selectedEvent: null,
          deviceControlTarget: null,
          deviceOp: null,
          findOwner: { active: false, step: 0, deviceName: '', roomName: '', petName: '' },
        })
        get().toast('success', '已恢复演示数据')
      },

      // 下列动作在 initComplexActions 中通过 set 覆盖实现（含时序）
      moveToRoom: () => {},
      simulateNextRoom: () => {},
      sendCommand: async () => {},
      turnOnAC: async () => {},
      execDevice: async () => {},
      feed: async () => {},
      sendChat: () => {},
      triggerBell: () => {},
      clearFindOwner: () => {},
      triggerLowMood: () => {},
      triggerFenceAlert: () => {},
      saveVoicePreset: () => {},
    }),
    {
      name: 'petlink-store',
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        schemaVersion: s.schemaVersion,
        homeMap: s.homeMap,
        devices: s.devices,
        pets: s.pets,
        activePetId: s.activePetId,
        pet: s.pet,
        events: s.events,
        fence: s.fence,
        rules: s.rules,
        chat: s.chat,
        voice: s.voice,
        lost: s.lost,
        companionEnabled: s.companionEnabled,
        moodSignal: s.moodSignal,
        diarySeed: s.diarySeed,
        demoMode: s.demoMode,
      }),
      migrate: (persisted: any, version) => {
        // schema 版本不一致时丢弃旧数据，回到 seed，避免结构错乱
        if (!persisted || version !== SCHEMA_VERSION) return undefined as any
        return persisted
      },
    },
  ),
)

// 复杂时序动作（跨房间 / 接力 / 硬件指令 / 对话 / 铃铛 / 情绪 / 围栏告警）
initComplexActions()

// 同源多窗口（完整应用 ↔ 浏览器浮窗）实时同步：另一窗口写入持久化后，本窗口重新水合
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'petlink-store') void useStore.persist.rehydrate()
  })
}

function initComplexActions() {
  const set = (patch: Partial<StoreState> | ((s: StoreState) => Partial<StoreState>)) =>
    useStore.setState(patch as any)
  const get = useStore.getState

  useStore.setState({
    moveToRoom: (roomId: string) => {
      const s = get()
      const from = s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
      const to = s.homeMap.rooms.find((r) => r.id === roomId)
      if (!to) return
      if (from?.id === to.id) {
        s.refreshTracking()
        return
      }
      clearHandoffTimers()
      const fromName = from?.name ?? '出发房间'
      const petName = s.pet.name
      const walkPath = buildWalkPath(from, to)
      // 1) 过渡路径（沿真实门口折线）+ 奔跑（作用于当前选中宠物）
      set({
        transitionRoute: from
          ? { from: roomCentroid(from), to: roomCentroid(to), fromRoomId: from.id, toRoomId: to.id, petId: s.activePetId, path: walkPath }
          : null,
        walkIndex: 0,
        ...patchActive(s, (p) => ({ ...p, roomId, behavior: 'running', confidence: 0.9, trackingSources: ['ble', 'imu'], lastUpdatedAt: Date.now() })),
        handoff: { phase: 'lost', message: `${fromName}摄像头已失去目标`, fromRoomId: from?.id, toRoomId: to.id, startedAt: Date.now() },
      })
      // 沿折线逐段行走
      for (let i = 1; i < walkPath.length; i++) {
        handoffTimers.push(window.setTimeout(() => set({ walkIndex: i }), 420 * i))
      }
      // 2) room_change 事件
      s.addEvent({
        type: 'room_change',
        title: `${petName}：${fromName} → ${to.name}`,
        detail: '跨房间追踪中 · 项圈信号保持连续定位',
        petId: s.activePetId,
        fromRoomId: from?.id,
        toRoomId: to.id,
        roomId: to.id,
        source: ['ble', 'imu'],
      })
      s.toast('info', `已识别${petName}从${fromName}进入${to.name}`)

      // 3) 接力时序
      handoffTimers.push(
        window.setTimeout(() => set({ handoff: { phase: 'transit', message: '项圈信号正在保持连续定位', fromRoomId: from?.id, toRoomId: to.id } }), 500),
      )
      handoffTimers.push(
        window.setTimeout(() => set({ handoff: { phase: 'searching', message: `正在寻找${to.name}房间摄像头…`, fromRoomId: from?.id, toRoomId: to.id } }), 950),
      )
      handoffTimers.push(
        window.setTimeout(() => {
          const st = get()
          const hasCam = roomHasDevice(st.devices, to.id, 'camera')
          const camId = st.resolveCameraId(to.id)
          if (hasCam) {
            set({
              handoff: { phase: 'completed', message: `接力完成：已切换至${to.name}摄像头`, fromRoomId: from?.id, toRoomId: to.id, activeCameraDeviceId: camId ?? undefined },
              ...patchActive(st, (p) => ({ ...p, confidence: 0.97, trackingSources: ['camera', 'ble'], lastUpdatedAt: Date.now() })),
              activeCameraId: camId,
            })
            st.toast('success', `摄像头接力完成：${fromName} → ${to.name}`)
          } else {
            set({
              handoff: { phase: 'no_camera', message: `${to.name}暂无直接摄像头，项圈信号继续追踪；保留最近摄像头画面`, fromRoomId: from?.id, toRoomId: to.id, activeCameraDeviceId: camId ?? undefined },
              ...patchActive(st, (p) => ({ ...p, confidence: 0.93, trackingSources: ['ble', 'imu'], lastUpdatedAt: Date.now() })),
              activeCameraId: camId,
            })
            st.toast('warn', `${to.name}无摄像头，已保持连续定位`)
          }
        }, 1500),
      )
      // 4) 结束奔跑 & 清除路径
      handoffTimers.push(
        window.setTimeout(() => {
          const st = get()
          set({
            transitionRoute: null,
            ...(st.pet.behavior === 'running' ? patchActive(st, (p) => ({ ...p, behavior: 'idle', lastUpdatedAt: Date.now() })) : {}),
          })
        }, 1900),
      )
      handoffTimers.push(
        window.setTimeout(() => set((st) => (st.handoff.phase === 'completed' || st.handoff.phase === 'no_camera' ? { handoff: { phase: 'idle', message: '' } } : {})), 4600),
      )
    },

    simulateNextRoom: () => {
      const s = get()
      const rooms = s.homeMap.rooms
      if (rooms.length < 2) {
        s.toast('warn', '至少需要两个房间才能演示跨房间追踪')
        return
      }
      const i = Math.max(0, rooms.findIndex((r) => r.id === s.pet.roomId))
      s.moveToRoom(rooms[(i + 1) % rooms.length].id)
    },

    sendCommand: async (deviceId: string, command: string, payload?: unknown) => {
      const s = get()
      const dev = s.devices.find((d) => d.id === deviceId)
      const res = await mockHardwareAdapter.sendCommand(deviceId, command, payload)
      if (!res.accepted) {
        s.toast('error', res.message)
        return
      }
      s.toast('success', `指令已发送：${command}${dev ? ` · ${dev.name}` : ''}`)
      s.addEvent({ type: 'device_command', title: command, detail: `${dev?.name ?? '设备'} · 指令已发送（未必执行成功）`, roomId: dev?.roomId, deviceId })
    },

    execDevice: async (deviceId, command, opts) => {
      const s = get()
      const dev = s.devices.find((d) => d.id === deviceId)
      if (!dev) return
      if (!dev.online) {
        set({ deviceOp: { deviceId, phase: 'offline', message: `${dev.name}当前离线，指令未发送` } })
        s.toast('error', `${dev.name}离线，无法执行`)
        return
      }
      set({ deviceOp: { deviceId, phase: 'sending', message: `${command} · 发送中…` } })
      const res = await mockHardwareAdapter.sendCommand(deviceId, command)
      if (!res.accepted) {
        set({ deviceOp: { deviceId, phase: 'failed', message: res.message } })
        get().addEvent({ type: 'device_command', title: command, detail: `${dev.name} · 执行失败：${res.message}（模拟）`, roomId: dev.roomId, deviceId })
        get().toast('error', `执行失败：${res.message}`)
        return
      }
      // 已受理 → 模拟设备执行耗时后返回“执行成功”（Demo 模拟反馈）
      await new Promise((r) => window.setTimeout(r, 650))
      opts?.apply?.()
      set({ deviceOp: { deviceId, phase: 'success', message: `${command} · 执行成功（模拟）` } })
      get().addEvent({
        type: opts?.eventType ?? 'device_command',
        title: command,
        detail: opts?.eventDetail ?? `${dev.name} · 执行成功（模拟反馈）`,
        petId: get().activePetId,
        roomId: dev.roomId,
        deviceId,
      })
      get().toast('success', `${dev.name}：${command} 执行成功（模拟）`)
    },

    feed: async (deviceId, grams) => {
      const s = get()
      const dev = s.devices.find((d) => d.id === deviceId)
      if (!dev) return
      await get().execDevice(deviceId, `远程投喂 ${grams}g`, {
        eventType: 'eat',
        eventDetail: `${dev.name} · 远程投喂 ${grams}g 执行成功（模拟反馈）`,
        apply: () => {
          const cur = get().devices.find((d) => d.id === deviceId)
          const food = Math.max(0, Number(cur?.status.food ?? 68) - Math.round(grams / 2))
          get().updateDevice(deviceId, { status: { ...cur?.status, food, lastPortion: grams } })
        },
      })
    },

    turnOnAC: async (roomId?: string) => {
      const s = get()
      const targetRoom = roomId ?? s.pet.roomId
      let acRoomId = targetRoom
      let ac = s.devices.find((d) => d.roomId === targetRoom && d.type === 'ac')
      if (!ac) {
        const nid = nearestRoomIdWith(s.homeMap.rooms, targetRoom, (r) => roomHasDevice(s.devices, r.id, 'ac'))
        if (!nid) {
          s.toast('error', '目标房间及附近都没有空调设备')
          return
        }
        acRoomId = nid
        ac = s.devices.find((d) => d.roomId === nid && d.type === 'ac')
      }
      if (!ac) return
      const roomName = s.homeMap.rooms.find((r) => r.id === acRoomId)?.name ?? ''
      s.updateDevice(ac.id, { status: { ...ac.status, power: true, target: 26 } })
      const res = await mockHardwareAdapter.sendCommand(ac.id, '开启空调 26℃')
      if (res.accepted) {
        s.toast('success', `已向${roomName}空调发送开启指令 · 目标 26℃`)
        s.addEvent({ type: 'device_command', title: '开启空调', detail: `${roomName}空调 · 目标 26℃（指令已发送）`, roomId: acRoomId, deviceId: ac.id })
      }
    },

    sendChat: (text: string, kind: ChatMessage['kind'] = 'text') => {
      const s = get()
      if (!text.trim()) return
      const room = s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
      const msg: ChatMessage = { id: makeId('msg'), role: 'owner', text: text.trim(), timestamp: Date.now(), kind, played: false }
      set({ chat: [...s.chat, msg] })
      window.setTimeout(() => {
        const st = get()
        set({
          chat: [
            ...st.chat.map((m) => (m.id === msg.id ? { ...m, played: true } : m)),
            { id: makeId('msg'), role: 'system', text: `已通过${room?.name ?? '当前房间'}最近的小度设备播放`, timestamp: Date.now() },
          ],
        })
        st.addEvent({ type: 'owner_interaction', title: '远程消息', detail: `发送到${room?.name ?? '当前房间'}小度设备：${text.trim()}`, petId: s.activePetId, roomId: s.pet.roomId })
        st.toast('success', `消息已播放，可立即打开摄像头确认${s.pet.name}反应`)
      }, 350)
    },

    triggerBell: () => {
      clearHandoffTimers()
      const s = get()
      const room = s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
      const roomName = room?.name ?? '当前房间'
      const name = s.pet.name
      // 就近选择可播报设备：优先智能屏，其次音箱
      const roomDevs = s.devices.filter((d) => d.roomId === s.pet.roomId && d.online)
      const announcer =
        roomDevs.find((d) => d.type === 'smart_screen') ??
        roomDevs.find((d) => d.type === 'speaker') ??
        s.devices.find((d) => d.type === 'smart_screen' || d.type === 'speaker')
      const deviceName = announcer?.name ?? '最近的小度设备'

      const bellMsg: ChatMessage = {
        id: makeId('msg'),
        role: 'pet_event',
        kind: 'bell',
        text: `${name}拨动了「找主人铃铛」，${roomName}摄像头确认${name}停留在铃铛旁。`,
        timestamp: Date.now(),
      }
      // 第 1 步：宠物拨铃，摄像头确认
      set({
        chat: [...s.chat, bellMsg],
        modal: 'chat',
        findOwner: { active: true, step: 1, deviceName, roomName, petName: name, startedAt: Date.now() },
      })
      s.addEvent({ type: 'bell', title: `${name}拨动找人铃铛`, detail: `${roomName}摄像头确认事件`, petId: s.activePetId, roomId: s.pet.roomId, source: ['camera'] })
      s.toast('warn', `${name}正在找你 · 已进入宠物对话框`)

      // 第 2 步：最近音箱/智能屏播报
      handoffTimers.push(
        window.setTimeout(() => {
          set((st) => ({ findOwner: { ...st.findOwner, step: 2 } }))
          get().addEvent({ type: 'device_command', title: `${deviceName}播报提示`, detail: `${deviceName}播放：“主人，我在${roomName}找你～”`, petId: get().activePetId, roomId: get().pet.roomId })
        }, 500),
      )
      // 第 3 步：App 推送已送达主人
      handoffTimers.push(
        window.setTimeout(() => {
          set((st) => ({ findOwner: { ...st.findOwner, step: 3 } }))
          get().toast('info', `📲 已推送到你的手机：${name}在${roomName}找你`)
        }, 1200),
      )
      // 第 4 步：等待主人回应
      handoffTimers.push(window.setTimeout(() => set((st) => ({ findOwner: { ...st.findOwner, step: 4 } })), 1900))
    },

    clearFindOwner: () => set((st) => ({ findOwner: { ...st.findOwner, active: false, step: 0 } })),

    triggerLowMood: () => {
      const s = get()
      set({ moodSignal: true, diarySeed: get().diarySeed + 1 })
      s.addEvent({ type: 'companion', title: `${s.pet.name}发来陪伴提醒`, detail: '“带我出去走走吧？” · 情绪陪伴已触发', petId: s.activePetId, roomId: s.pet.roomId })
      s.toast('info', '已生成宠物口吻陪伴提醒：带我出去走走吧～')
    },

    triggerFenceAlert: () => {
      const s = get()
      const room = s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
      const name = s.pet.name
      s.addEvent({ type: 'fence_alert', title: '围栏告警', detail: `${name}可能已离开安全区域（最后位置：${room?.name ?? '未知'}）`, petId: s.activePetId, roomId: s.pet.roomId })
      set({ lost: { active: true, lastRoomId: s.pet.roomId, lastUpdatedAt: Date.now() }, modal: 'lost' })
      s.toast('warn', `⚠ ${name}已离开安全区域，最后位置：${room?.name ?? '未知'}（${timeHM(Date.now())}）`)
    },

    saveVoicePreset: (preset: VoicePreset) => {
      set({ voice: preset })
      get().toast(preset.cloned ? 'success' : 'info', preset.cloned ? '主人声线已克隆并保存' : '录音已保存为主人语音预设（当前未做声线克隆）')
    },
  })
}

// selector helpers
export function useRoomById(id: string | undefined): Room | undefined {
  return useStore((s) => s.homeMap.rooms.find((r) => r.id === id))
}
export function currentRoom(s: StoreState): Room | undefined {
  return s.homeMap.rooms.find((r) => r.id === s.pet.roomId)
}
/** 当前选中宠物 */
export function activePet(s: StoreState): PetState {
  return s.pets.find((p) => p.id === s.activePetId) ?? s.pets[0]
}
export function deviceById(s: StoreState, id: string | null | undefined): Device | undefined {
  return s.devices.find((d) => d.id === id)
}
export function camerasList(s: StoreState): Device[] {
  return camerasOf(s.devices)
}
export type { DeviceType }

// ---- 云端同步用：可持久化领域快照（与 persist.partialize 字段一致）----
export type PersistSlice = Pick<
  StoreState,
  | 'schemaVersion'
  | 'homeMap'
  | 'devices'
  | 'pets'
  | 'activePetId'
  | 'pet'
  | 'events'
  | 'fence'
  | 'rules'
  | 'chat'
  | 'voice'
  | 'lost'
  | 'companionEnabled'
  | 'moodSignal'
  | 'diarySeed'
  | 'demoMode'
>

export function getSnapshot(): PersistSlice {
  const s = useStore.getState()
  return {
    schemaVersion: s.schemaVersion,
    homeMap: s.homeMap,
    devices: s.devices,
    pets: s.pets,
    activePetId: s.activePetId,
    pet: s.pet,
    events: s.events,
    fence: s.fence,
    rules: s.rules,
    chat: s.chat,
    voice: s.voice,
    lost: s.lost,
    companionEnabled: s.companionEnabled,
    moodSignal: s.moodSignal,
    diarySeed: s.diarySeed,
    demoMode: s.demoMode,
  }
}

export function applySnapshot(data: Partial<PersistSlice>) {
  // schema 不一致的云端数据忽略，避免结构错乱
  if (data.schemaVersion !== undefined && data.schemaVersion !== SCHEMA_VERSION) return
  // 重建 pet 镜像，保证与 pets/activePetId 一致
  const patch: Partial<StoreState> = { ...(data as Partial<StoreState>) }
  if (data.pets && data.activePetId) {
    patch.pet = data.pets.find((p) => p.id === data.activePetId) ?? data.pets[0]
  }
  useStore.setState(patch)
}
