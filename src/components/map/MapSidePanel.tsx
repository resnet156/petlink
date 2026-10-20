import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useStore, currentRoom, deviceById } from '@/store/useStore'
import { PetSvg } from '@/components/PetSvg'
import { behaviorLabel, roomDevices, roomHasDevice, trackingSourceLabel } from '@/lib/tracking'
import { relativeTime } from '@/lib/time'
import { eventsForPet, filterByRange, roomStay } from '@/lib/diary'
import { cameraView, locateState } from '@/lib/status'

/** 地图右侧固定信息面板（实时/历史/设备三模式内容不同）。替代原右上角覆盖式浮层。 */
export function MapSidePanel() {
  const pet = useStore((s) => s.pet)
  const pets = useStore((s) => s.pets)
  const activePetId = useStore((s) => s.activePetId)
  const setActivePet = useStore((s) => s.setActivePet)
  const room = useStore(currentRoom)
  const mapMode = useStore((s) => s.mapMode)
  const handoff = useStore((s) => s.handoff)
  const activeCameraId = useStore((s) => s.activeCameraId)
  const cam = useStore((s) => deviceById(s, activeCameraId))
  const camRoom = useStore((s) => s.homeMap.rooms.find((r) => r.id === cam?.roomId))
  const devices = useStore((s) => s.devices)
  const events = useStore((s) => s.events)
  const home = useStore((s) => s.homeMap)
  const refreshTracking = useStore((s) => s.refreshTracking)
  const simulateNextRoom = useStore((s) => s.simulateNextRoom)
  const demoMode = useStore((s) => s.demoMode)
  const openCameraFloat = useStore((s) => s.openCameraFloat)
  const sendCommand = useStore((s) => s.sendCommand)
  const setDeviceControlTarget = useStore((s) => s.setDeviceControlTarget)

  // 让“最近更新时间”随时间刷新
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 3000)
    return () => clearInterval(t)
  }, [])

  const srcLabel = trackingSourceLabel(pet.trackingSources)
  const hasCamInRoom = !!room && roomHasDevice(devices, room.id, 'camera')
  const view = cameraView(pet, cam, handoff)
  const locate = locateState(pet, handoff, hasCamInRoom)
  const chain =
    handoff.phase !== 'idle'
      ? handoff.message
      : cam
      ? `${cam.name}持续识别 · ${room?.environment.temperature.toFixed(1)}℃ / 湿度 ${room?.environment.humidity}%`
      : '项圈信号持续定位 · 当前房间暂无摄像头'

  const petEvents = eventsForPet(events, pet.id, pets[0]?.id)
  const lastEvent = [...filterByRange(petEvents, 'today', Date.now())].sort((a, b) => b.timestamp - a.timestamp)[0]
  const roomDevs = room ? roomDevices(devices, room.id) : []
  const speaker = roomDevs.find((d) => d.type === 'speaker')
  const feeder = devices.find((d) => d.type === 'feeder')

  if (mapMode === 'history') {
    const shares = roomStay(petEvents, home, Date.now())
    return (
      <Panel title="今日停留热点" badge="历史">
        {shares.length ? (
          <div className="flex flex-col gap-2.5">
            {shares.map((s) => (
              <div key={s.roomName} className="grid grid-cols-[52px_1fr_64px] items-center gap-2 text-xs">
                <span className="text-muted">{s.roomName}</span>
                <span className="h-2 overflow-hidden rounded-full bg-[#edf2ef]"><i className="block h-full rounded-full bg-gradient-to-r from-orange to-[#e0a878]" style={{ width: `${s.pct}%` }} /></span>
                <b className="text-right">{s.pct}% · {s.minutes}分</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted">今日暂无跨房间记录。</div>
        )}
        <div className="mt-3 text-[11px] leading-relaxed text-muted">点击地图上的编号节点可查看该次迁移事件。</div>
      </Panel>
    )
  }

  if (mapMode === 'devices') {
    return (
      <Panel title="设备总览" badge="设备">
        <div className="flex flex-col gap-2">
          {devices.map((d) => {
            const r = home.rooms.find((x) => x.id === d.roomId)
            return (
              <button key={d.id} onClick={() => setDeviceControlTarget({ deviceId: d.id })} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2 text-left hover:border-[#cde3dc]">
                <span className="min-w-0"><b className="block truncate text-xs">{d.name}</b><span className="text-[11px] text-muted">{r?.name ?? '未分配'}</span></span>
                <span className={`flex items-center gap-1 text-[11px] font-bold ${d.online ? 'text-teal' : 'text-[#c0564e]'}`}><i className={`h-2 w-2 rounded-full ${d.online ? 'bg-teal-2' : 'bg-[#c0564e]'}`} />{d.online ? '在线' : '离线'}</span>
              </button>
            )
          })}
        </div>
      </Panel>
    )
  }

  // live
  return (
    <Panel
      title="实时追踪"
      live
      switcher={
        pets.length > 1 ? (
          <div className="mb-2 flex flex-wrap gap-1.5" data-testid="pet-switcher">
            {pets.map((p) => (
              <button key={p.id} onClick={() => setActivePet(p.id)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${p.id === activePetId ? 'border-teal bg-teal text-white' : 'border-line bg-white text-[#5d6e68]'}`}>{p.name}</button>
            ))}
          </div>
        ) : null
      }
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-muted">{pet.name}当前在</div>
          <div data-testid="tracking-room" className="text-2xl font-extrabold tracking-tight">{room?.name ?? '定位中'}</div>
        </div>
        <div className="text-right text-[11px] text-muted">{behaviorLabel[pet.behavior]}<br />{relativeTime(pet.lastUpdatedAt)}</div>
      </div>

      {/* 摄像头预览（点击放大）；当前无真实视频源，标注“演示画面”，连接中/离线/无画面不展示伪画面 */}
      <button
        className="relative mt-3 flex h-[120px] w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#d9e4dc] via-[#c7d4cc] to-[#aebeb5]"
        data-testid="side-camera-preview"
        onClick={() => openCameraFloat()}
        aria-label="查看画面"
      >
        <span className="absolute left-2.5 top-2.5 rounded-md bg-[rgba(30,50,45,.72)] px-2 py-0.5 text-[11px] font-bold text-white">
          {view.badge}{view.showScene ? ` · ${camRoom?.name ?? ''}` : ''}
        </span>
        {view.showScene ? (
          <PetSvg behavior={pet.behavior} size={72} />
        ) : (
          <span className="px-4 text-center text-xs font-bold text-[#3f514b]">
            {view.kind === 'connecting' ? '画面连接中…' : view.kind === 'offline' ? '摄像头离线' : '当前房间无摄像头 · 辅助定位中'}
          </span>
        )}
        <span className="absolute bottom-2 right-2.5 text-[11px] text-[#3f514b]">{view.showScene ? '点击放大 ›' : '查看其他摄像头 ›'}</span>
      </button>
      {view.showScene && !view.detected && (
        <div className="mt-1 text-[11px] text-[#a9731f]">当前画面未检测到{pet.name}，展示最近摄像头的示例画面</div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        <Cell b={locate.label} s="定位状态" />
        <Cell b={cam?.name ?? '无摄像头'} s="当前画面" />
        <Cell b={srcLabel} s="定位来源" />
      </div>
      <div className="mt-2.5 rounded-xl border border-dashed border-[#c9d9d2] px-2.5 py-2 text-[11px] leading-relaxed text-[#5d726a]">{chain}</div>

      {/* 快捷操作 */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <button className="btn !py-2 !text-[11px]" onClick={() => openCameraFloat()}>👁 看视频</button>
        <button className="btn !py-2 !text-[11px]" onClick={() => sendCommand(speaker?.id ?? pet.id, `呼叫${pet.name}`)}>🔊 呼叫</button>
        <button className="btn !py-2 !text-[11px]" onClick={() => setDeviceControlTarget({ deviceId: feeder?.id ?? '' })} disabled={!feeder}>🍽 投喂</button>
      </div>

      {/* 最近一条关键事件 */}
      {lastEvent && (
        <div className="mt-2.5 rounded-xl border border-line bg-white p-2.5">
          <div className="text-[11px] font-bold text-[#4c5f59]">最近事件</div>
          <div className="mt-0.5 text-xs"><b>{lastEvent.title}</b></div>
          <div className="text-[11px] text-muted">{relativeTime(lastEvent.timestamp)} · {lastEvent.detail}</div>
        </div>
      )}

      <div className="mt-2.5 flex gap-1.5">
        <button className="btn flex-1" onClick={refreshTracking}>刷新定位</button>
        {demoMode && <button data-testid="sim-next-room" className="btn btn-primary flex-1" onClick={simulateNextRoom}>模拟跨房间</button>}
      </div>
    </Panel>
  )
}

function Panel({ title, badge, live, switcher, children }: { title: string; badge?: string; live?: boolean; switcher?: React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div data-testid="map-side-panel" className="rounded-[20px] border border-[#dce6e1] bg-white/95 p-4 shadow-softsm">
      <div className="mb-2.5 flex items-center justify-between">
        <b className="flex items-center gap-1.5 text-sm">{title}
          {live && <span className="flex items-center gap-1.5 text-[11px] font-extrabold text-teal"><i className="h-2 w-2 rounded-full bg-teal-2 shadow-[0_0_0_5px_rgba(76,160,146,.12)]" /> LIVE</span>}
          {badge && <span className="badge">{badge}</span>}
        </b>
        <button className="grid h-6 w-6 place-items-center rounded-lg text-[#8aa39b] hover:bg-[#eef3f0] max-[1000px]:hidden" aria-label={collapsed ? '展开' : '收起'} onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {switcher}
      {!collapsed && children}
    </div>
  )
}

function Cell({ b, s }: { b: string; s: string }) {
  return (
    <div className="rounded-xl bg-[#f2f7f4] px-2.5 py-2">
      <b className="block truncate text-[11px]">{b}</b>
      <span className="text-[11px] text-muted">{s}</span>
    </div>
  )
}
