import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { MAP_W, MAP_H, roomBounds, roomCentroid } from '@/domain/geometry'
import { defaultFurniture } from './furnitureLib'
import { DeviceGlyph } from './DeviceGlyph'
import { PetFace } from '@/components/PetFace'
import { behaviorLabel, roomDevices, behaviorColor, behaviorBadge } from '@/lib/tracking'
import { relativeTime, timeHM } from '@/lib/time'
import { ambianceFor } from '@/lib/ambiance'
import { eventsForPet } from '@/lib/diary'
import { SLAB_H, FURN_UNIT, SIN, darken, isoFloor, makeHomeProjector, isoPoints } from './iso'
import { drawIsoFurniture } from './isoFurniture'
import type { PetBehavior, Device, Room } from '@/domain/types'

const behaviorAnim: Partial<Record<PetBehavior, string>> = {
  running: 'pet-run',
  looking: 'pet-look',
  sleeping: 'pet-sleep',
  eating: 'pet-eat',
  drinking: 'pet-eat',
  playing: 'pet-play',
}

function deviceStatusText(dev: Device, room?: Room): string {
  if (!dev.online) return '离线'
  const st = dev.status
  switch (dev.type) {
    case 'ac': return st.power ? `制冷 ${Number(st.target ?? 26)}℃` : '待机'
    case 'feeder': return `余粮 ${Number(st.food ?? 68)}%`
    case 'water': return `水位 ${Number(st.level ?? 72)}%`
    case 'temp_humidity': return room ? `${room.environment.temperature.toFixed(0)}℃` : '在线'
    default: return '在线'
  }
}

/** 整屋 2.5D 等距视图：房间抬升为地台、家具立体化、宠物实时移动。比平面图更立体柔和。 */
export function HomeIso() {
  const rooms = useStore((s) => s.homeMap.rooms)
  const devices = useStore((s) => s.devices)
  const pets = useStore((s) => s.pets)
  const activePetId = useStore((s) => s.activePetId)
  const setActivePet = useStore((s) => s.setActivePet)
  const mapMode = useStore((s) => s.mapMode)
  const transition = useStore((s) => s.transitionRoute)
  const walkIndex = useStore((s) => s.walkIndex)
  const events = useStore((s) => s.events)
  const openModal = useStore((s) => s.openModal)
  const setDeviceControlTarget = useStore((s) => s.setDeviceControlTarget)
  const openCameraFloat = useStore((s) => s.openCameraFloat)
  const sendCommand = useStore((s) => s.sendCommand)
  const openEvent = useStore((s) => s.openEvent)

  const proj = useMemo(() => makeHomeProjector(), [])
  const { P, VW, VH } = proj
  const amb = ambianceFor(new Date().getHours())
  const [tick, setTick] = useState(0)
  const [popover, setPopover] = useState<string | null>(null)
  const clickTimer = useRef<number | null>(null)

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2600)
    return () => clearInterval(t)
  }, [])

  const petRoomIds = new Set(pets.map((p) => p.roomId))

  // 房间按深度排序（x+y 越小越远，先画远处，近处覆盖之上）
  const roomsSorted = [...rooms]
    .map((r) => ({ r, c: roomCentroid(r) }))
    .sort((a, b) => a.c.x + a.c.y - (b.c.x + b.c.y))

  // 空闲/张望时轻微游走
  const wanderOf = (p: { id: string; behavior: PetBehavior }) =>
    p.behavior === 'idle' || p.behavior === 'looking'
      ? { x: Math.sin(tick * 0.9 + p.id.length) * 26, y: Math.cos(tick * 1.1 + p.id.length) * 18 }
      : { x: 0, y: 0 }

  // 宠物世界坐标（含同房错位 / 游走 / 跨房行走）
  const petWorld = (p: (typeof pets)[number]) => {
    const r = rooms.find((rm) => rm.id === p.roomId)
    const base = r ? roomCentroid(r) : { x: MAP_W / 2, y: MAP_H / 2 }
    const inRoom = pets.filter((x) => x.roomId === p.roomId)
    const idx = inRoom.findIndex((x) => x.id === p.id)
    const off = (idx - (inRoom.length - 1) / 2) * 120
    const walking = transition?.petId === p.id && transition.path.length > 1
    const wpt = walking ? transition.path[Math.min(walkIndex, transition.path.length - 1)] : null
    if (wpt) return { x: wpt.x, y: wpt.y, walking: true }
    const frozen = popover === p.id
    const w = frozen ? { x: 0, y: 0 } : wanderOf(p)
    return { x: base.x + off + w.x, y: base.y + w.y, walking: false }
  }

  // 历史轨迹节点（仅当前宠物 room_change，时间升序）
  const historyNodes =
    mapMode === 'history'
      ? eventsForPet(events, activePetId, pets[0]?.id)
          .filter((e) => e.type === 'room_change')
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((e) => {
            const r = rooms.find((rm) => rm.id === (e.toRoomId ?? e.roomId))
            return r ? { pt: roomCentroid(r), e, roomName: r.name } : null
          })
          .filter((n): n is NonNullable<typeof n> => !!n)
      : []

  return (
    <div
      className="relative mx-auto w-full overflow-hidden rounded-[28px] border border-line shadow-soft"
      style={{ aspectRatio: `${VW} / ${VH}`, maxHeight: '100%', background: amb.bg, transition: 'background 1.2s ease' }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" data-testid="home-iso-svg">
        <defs>
          <radialGradient id="isoGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={amb.glow} stopOpacity={amb.glowOpacity} />
            <stop offset="60%" stopColor={amb.glow} stopOpacity={amb.glowOpacity * 0.3} />
            <stop offset="100%" stopColor={amb.glow} stopOpacity={0} />
          </radialGradient>
          <linearGradient id="isoSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* 房间地台 + 家具（远→近） */}
        {roomsSorted.map(({ r }) => {
          const floor = isoFloor(r.kind)
          const c = roomCentroid(r)
          const poly = r.polygon
          const top = poly.map((pt) => P(pt.x, pt.y, SLAB_H))
          // 可见的地台侧裙（外法线朝向观察者，即投影到屏幕下方的边）
          const skirts: { pts: string; shade: number }[] = []
          for (let i = 0; i < poly.length; i++) {
            const a = poly[i]
            const b = poly[(i + 1) % poly.length]
            let nx = b.y - a.y
            let ny = -(b.x - a.x)
            const mx = (a.x + b.x) / 2 - c.x
            const my = (a.y + b.y) / 2 - c.y
            if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny }
            if ((nx + ny) * SIN <= 0) continue // 背面边，不可见
            const q = [P(a.x, a.y, 0), P(b.x, b.y, 0), P(b.x, b.y, SLAB_H), P(a.x, a.y, SLAB_H)]
            skirts.push({ pts: isoPoints(q), shade: nx > 0 ? 0.24 : 0.13 })
          }
          const active = petRoomIds.has(r.id)
          const furniture = (r.furniture ?? defaultFurniture(r))
            .map((f) => ({ f, key: f.x + f.y }))
            .sort((a2, b2) => a2.key - b2.key)
          return (
            <g key={r.id} opacity={mapMode === 'devices' ? 0.55 : 1}>
              {skirts.map((s2, i) => (
                <polygon key={`sk${i}`} points={s2.pts} fill={darken(floor, s2.shade)} />
              ))}
              <polygon points={isoPoints(top)} fill={floor} stroke={active ? '#8fc3b4' : 'rgba(90,120,110,.28)'} strokeWidth={active ? 2.4 : 1.4} strokeLinejoin="round" />
              <polygon points={isoPoints(top)} fill="url(#isoSheen)" style={{ pointerEvents: 'none' }} />
              <text x={P(c.x, c.y, SLAB_H).X} y={top.reduce((m, p) => Math.min(m, p.Y), Infinity) + 20} fontSize={16} fontWeight={800} textAnchor="middle" fill="#6f8880" style={{ pointerEvents: 'none' }}>
                {r.name}
              </text>
              {furniture.map(({ f }) => drawIsoFurniture(P, f, SLAB_H, FURN_UNIT))}
            </g>
          )
        })}

        {/* 设备点位（投影到地台上，保持图标正立） */}
        {rooms.flatMap((r) => {
          const b = roomBounds(r)
          return r.devices.map((did, idx) => {
            const dev = devices.find((d) => d.id === did)
            if (!dev) return null
            const dx = b.x + b.w * (0.26 + (idx % 3) * 0.24)
            const dy = b.y + b.h * (idx < 3 ? 0.3 : 0.74)
            const dp = P(dx, dy, SLAB_H)
            return (
              <g
                key={did}
                data-testid={dev.type === 'camera' ? 'map-camera' : `map-device-${dev.type}`}
                transform={`translate(${dp.X} ${dp.Y})`}
                style={{ cursor: 'pointer' }}
                opacity={mapMode === 'devices' ? 1 : 0.96}
                onClick={(e) => {
                  e.stopPropagation()
                  if (clickTimer.current) window.clearTimeout(clickTimer.current)
                  clickTimer.current = window.setTimeout(() => {
                    setDeviceControlTarget({ deviceId: did })
                    clickTimer.current = null
                  }, 240)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null }
                  if (dev.type === 'camera') openCameraFloat(did)
                }}
              >
                {dev.type === 'camera' ? <title>双击查看画面（可点击设备）</title> : <title>可点击设备</title>}
                <ellipse cx={0} cy={6} rx={16} ry={6} fill="rgba(30,50,44,.16)" style={{ pointerEvents: 'none' }} />
                <rect x={-22} y={-26} width={44} height={56} fill="#000" fillOpacity={0} style={{ pointerEvents: 'all' }} />
                <g transform="translate(0 -10) scale(1.2)" style={{ pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(40,70,60,.22))' }}>
                  <DeviceGlyph type={dev.type} />
                </g>
                {/* 可点击提示：轮廓用闪烁白色线条，不显示设备名 */}
                <rect
                  className="map-click-blink"
                  x={-15}
                  y={-23}
                  width={30}
                  height={34}
                  rx={9}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2.4}
                  style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 3px rgba(255,255,255,.85))' }}
                />
                {mapMode === 'devices' && (
                  <g style={{ pointerEvents: 'none' }}>
                    <rect x={-30} y={30} width={60} height={16} rx={8} fill="#fff" stroke={dev.online ? '#9fcabd' : '#e3aaa4'} strokeWidth={1} />
                    <circle cx={-20} cy={38} r={2.6} fill={dev.online ? '#2e7f75' : '#c0564e'} />
                    <text x={5} y={42} fontSize={9} fontWeight={700} textAnchor="middle" fill={dev.online ? '#3f6a60' : '#a44b44'}>
                      {deviceStatusText(dev, r)}
                    </text>
                  </g>
                )}
              </g>
            )
          })
        })}
        {/* 宠物所在房间的暖光 */}
        {roomsSorted.map(({ r }) => {
          if (!petRoomIds.has(r.id)) return null
          const b = roomBounds(r)
          const c = roomCentroid(r)
          const g = P(c.x, c.y, SLAB_H)
          const rad = Math.max(b.w, b.h) * 0.55 * proj.scale
          return <ellipse key={`glow${r.id}`} cx={g.X} cy={g.Y} rx={rad} ry={rad * 0.62} fill="url(#isoGlow)" style={{ pointerEvents: 'none' }} />
        })}

        {/* 昼夜色罩 */}
        {amb.tintOpacity > 0 && (
          <rect x={0} y={0} width={VW} height={VH} fill={amb.tint} opacity={amb.tintOpacity} style={{ pointerEvents: 'none' }} />
        )}

        {/* 历史轨迹 */}
        {historyNodes.length > 1 && (
          <>
            <polyline
              className="history-route"
              points={historyNodes.map((n) => { const p = P(n.pt.x, n.pt.y, SLAB_H + 2); return `${p.X},${p.Y}` }).join(' ')}
            />
            {historyNodes.map((n, i) => {
              const p = P(n.pt.x, n.pt.y, SLAB_H + 2)
              const last = i === historyNodes.length - 1
              return (
                <g key={n.e.id} data-testid="history-node" style={{ cursor: 'pointer' }} onClick={() => openEvent(n.e)}>
                  <title>{`${timeHM(n.e.timestamp)} · ${n.roomName} · ${n.e.title}`}</title>
                  <circle cx={p.X} cy={p.Y} r={last ? 18 : 15} fill="#fff" stroke={last ? '#a65e2f' : '#c5793f'} strokeWidth={last ? 6 : 5} />
                  <text x={p.X} y={p.Y + 1} fontSize={15} fontWeight={900} fill="#a65e2f" textAnchor="middle" dominantBaseline="central">{i + 1}</text>
                </g>
              )
            })}
          </>
        )}

        {/* 跨房间行走路径 + 脚印 */}
        {transition && transition.path.length > 1 && (
          <>
            <polyline className="transition-route" points={transition.path.map((pt) => { const p = P(pt.x, pt.y, SLAB_H + 2); return `${p.X},${p.Y}` }).join(' ')} />
            {transition.path.flatMap((pt, i) => {
              if (i === 0) return []
              const a = transition.path[i - 1]
              return [0.4, 0.8].map((t, k) => {
                const p = P(a.x + (pt.x - a.x) * t, a.y + (pt.y - a.y) * t, SLAB_H + 2)
                return <circle key={`${i}-${k}`} cx={p.X} cy={p.Y} r={5} fill="#4ca092" opacity={0.45} />
              })
            })}
            {(() => { const p = P(transition.to.x, transition.to.y, SLAB_H + 2); return <circle cx={p.X} cy={p.Y} r={9} fill="#fff" stroke="#2e7f75" strokeWidth={5} /> })()}
          </>
        )}
      </svg>
      {/* 宠物 Avatar（HTML 叠加，正立朝前） */}
      {mapMode !== 'history' && pets.map((p) => {
        const w = petWorld(p)
        const pp = P(w.x, w.y, SLAB_H)
        const leftPct = pp.X / VW * 100
        const topPct = pp.Y / VH * 100
        const isActive = p.id === activePetId
        const r = rooms.find((rm) => rm.id === p.roomId)
        const color = behaviorColor[p.behavior]
        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              transform: 'translate(-50%,-82%)',
              transition: w.walking ? 'left .42s linear, top .42s linear' : 'left 2.4s ease-in-out, top 2.4s ease-in-out',
              zIndex: isActive ? 8 : 6,
              opacity: mapMode === 'devices' ? 0.5 : 1,
            }}
          >
            <button
              data-testid={isActive ? 'pet-avatar' : 'pet-avatar-other'}
              aria-label={`${p.name} Avatar，当前${r?.name ?? ''}·${behaviorLabel[p.behavior]}`}
              title={`${p.name} · ${r?.name ?? ''} · ${behaviorLabel[p.behavior]}`}
              onClick={() => {
                if (!isActive) { setActivePet(p.id); setPopover(p.id) }
                else setPopover((v) => (v === p.id ? null : p.id))
              }}
              className={`relative grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-[20px] border-4 bg-[#fff8e9] ${behaviorAnim[p.behavior] ?? ''}`}
              style={{
                borderColor: isActive ? color : '#ffffff',
                boxShadow: isActive ? `0 0 0 6px ${color}22, 0 16px 26px rgba(53,86,77,.22)` : '0 10px 20px rgba(53,86,77,.16)',
              }}
            >
              <PetFace pet={p} size={52} />
            </button>
            <span
              className="pointer-events-none absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-white text-[12px] shadow"
              style={{ boxShadow: `0 0 0 2px ${color}` }}
              aria-hidden
            >
              {behaviorBadge[p.behavior]}
            </span>
            <span
              className="pointer-events-none absolute left-1/2 top-[64px] flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-bold shadow-softsm"
              style={{
                borderColor: isActive ? color : '#e4ece8',
                background: isActive ? '#ffffff' : 'rgba(255,255,255,.82)',
                color: isActive ? color : '#6e7f79',
              }}
              aria-hidden
            >
              {p.name} · {behaviorLabel[p.behavior]}
            </span>
          </div>
        )
      })}

      {/* 快捷互动气泡 */}
      {(() => {
        const p = pets.find((x) => x.id === popover)
        if (!p || p.id !== activePetId || mapMode === 'history') return null
        const r = rooms.find((rm) => rm.id === p.roomId)
        const w = petWorld(p)
        const pp = P(w.x, w.y, SLAB_H)
        const leftPct = Math.max(16, Math.min(84, pp.X / VW * 100))
        const topPct = pp.Y / VH * 100
        const placeBelow = topPct < 42
        const roomDevs = r ? roomDevices(devices, r.id) : []
        const speaker = roomDevs.find((d) => d.type === 'speaker')
        const feeder = devices.find((d) => d.type === 'feeder')
        const actions: { label: string; onClick: () => void }[] = [
          { label: '👁 看视频', onClick: () => openCameraFloat() },
          { label: '🔊 叫它', onClick: () => sendCommand(speaker?.id ?? p.id, `呼叫${p.name}`) },
          { label: '🍽 投喂', onClick: () => setDeviceControlTarget({ deviceId: feeder?.id ?? '' }) },
        ]
        return (
          <div
            data-testid="avatar-popover"
            className="animate-fade absolute z-[12] w-[220px] rounded-2xl border border-[#dce6e1] bg-white/97 p-3 shadow-soft backdrop-blur"
            style={{
              left: `${leftPct}%`,
              top: placeBelow ? `calc(${topPct}% + 36px)` : `calc(${topPct}% - 70px)`,
              transform: placeBelow ? 'translate(-50%,0)' : 'translate(-50%,-100%)',
            }}
          >
            <div className="flex items-start justify-between">
              <div>
                <b className="text-sm">{p.name}</b>
                <div className="mt-0.5 text-[12px] text-muted">{r?.name} · {behaviorLabel[p.behavior]} · {relativeTime(p.lastUpdatedAt)}</div>
              </div>
              <button className="grid h-6 w-6 place-items-center rounded-lg bg-[#eef3f0] text-[#6e7f79]" onClick={() => setPopover(null)} aria-label="关闭">×</button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {actions.map((a) => (
                <button key={a.label} className="rounded-xl border border-line bg-white px-1 py-2 text-[11px] font-bold text-[#53645e] hover:border-[#cde3dc] hover:bg-teal-soft hover:text-teal" onClick={a.onClick}>
                  {a.label}
                </button>
              ))}
            </div>
            <button className="mt-2 w-full rounded-xl bg-teal-soft py-1.5 text-[11px] font-bold text-teal" onClick={() => { setPopover(null); openModal('avatar') }}>
              更多详情 / 管理宠物
            </button>
          </div>
        )
      })()}
    </div>
  )
}
