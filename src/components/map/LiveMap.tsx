import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store/useStore'
import { MAP_W, MAP_H, roomBounds, roomCentroid } from '@/domain/geometry'
import { floorColor, WALL } from './furniture'
import { drawFurniture, defaultFurniture } from './furnitureLib'
import { DeviceGlyph } from './DeviceGlyph'
import { HomeIso } from './HomeIso'
import { PetFace } from '@/components/PetFace'
import { behaviorLabel, roomDevices, behaviorColor, behaviorBadge } from '@/lib/tracking'
import { relativeTime, timeHM } from '@/lib/time'
import { ambianceFor } from '@/lib/ambiance'
import { eventsForPet } from '@/lib/diary'
import type { Point, PetBehavior, Device } from '@/domain/types'

const behaviorAnim: Partial<Record<PetBehavior, string>> = {
  running: 'pet-run',
  looking: 'pet-look',
  sleeping: 'pet-sleep',
  eating: 'pet-eat',
  drinking: 'pet-eat',
  playing: 'pet-play',
}

function poly(points: { x: number; y: number }[]) {
  return points.map((p) => `${p.x},${p.y}`).join(' ')
}

/** 在离户型中心最近、足够长的墙边上生成一个门洞 + 开门弧线 */
function doorFor(polygon: Point[]) {
  if (polygon.length < 3) return null
  const C = { x: MAP_W / 2, y: MAP_H / 2 }
  let bm: { a: Point; b: Point; m: Point; len: number } | null = null
  let bd = Infinity
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 90) continue
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const d = Math.hypot(m.x - C.x, m.y - C.y)
    if (d < bd) { bd = d; bm = { a, b, m, len } }
  }
  if (!bm) return null
  const { a, b, m, len } = bm
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const half = Math.min(70, len * 0.6) / 2
  const x1 = m.x - ux * half
  const y1 = m.y - uy * half
  const x2 = m.x + ux * half
  const y2 = m.y + uy * half
  let nx = -uy
  let ny = ux
  if ((m.x + nx - C.x) ** 2 + (m.y + ny - C.y) ** 2 > (m.x - C.x) ** 2 + (m.y - C.y) ** 2) { nx = -nx; ny = -ny }
  const r = half * 2
  const arc = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x1 + nx * r} ${y1 + ny * r}`
  return { x1, y1, x2, y2, arc }
}

type Win = { x1: number; y1: number; x2: number; y2: number }
/** 外墙上的窗户段：找到位于户型外轮廓上的房间边，取中段作为窗 */
function windowsFor(rooms: { polygon: Point[] }[]): Win[] {
  const all = rooms.flatMap((r) => r.polygon)
  if (!all.length) return []
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const minY = Math.min(...all.map((p) => p.y))
  const maxY = Math.max(...all.map((p) => p.y))
  const eps = 2
  const out: Win[] = []
  for (const r of rooms) {
    for (let i = 0; i < r.polygon.length; i++) {
      const a = r.polygon[i]
      const b = r.polygon[(i + 1) % r.polygon.length]
      const onV = (Math.abs(a.x - minX) < eps && Math.abs(b.x - minX) < eps) || (Math.abs(a.x - maxX) < eps && Math.abs(b.x - maxX) < eps)
      const onH = (Math.abs(a.y - minY) < eps && Math.abs(b.y - minY) < eps) || (Math.abs(a.y - maxY) < eps && Math.abs(b.y - maxY) < eps)
      if (!onV && !onH) continue
      const len = Math.hypot(b.x - a.x, b.y - a.y)
      if (len < 150) continue
      const ux = (b.x - a.x) / len
      const uy = (b.y - a.y) / len
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const half = Math.min(100, len * 0.4) / 2
      out.push({ x1: m.x - ux * half, y1: m.y - uy * half, x2: m.x + ux * half, y2: m.y + uy * half })
    }
  }
  return out
}

/** 设备模式下显示的简短状态文案 */
function deviceStatusText(dev: Device, room?: { environment: { temperature: number } }): string {
  if (!dev.online) return '离线'
  const st = dev.status
  switch (dev.type) {
    case 'ac':
      return st.power ? `制冷 ${Number(st.target ?? 26)}℃` : '待机'
    case 'feeder':
      return `余粮 ${Number(st.food ?? 68)}%`
    case 'water':
      return `水位 ${Number(st.level ?? 72)}%`
    case 'temp_humidity':
      return room ? `${room.environment.temperature.toFixed(0)}℃` : '在线'
    default:
      return '在线'
  }
}

export function LiveMap({ defaultView = 'iso', showToggle = true }: { defaultView?: 'iso' | 'flat'; showToggle?: boolean } = {}) {
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
  const [popover, setPopover] = useState<string | null>(null)
  const [view, setView] = useState<'iso' | 'flat'>(defaultView)
  const [wander, setWander] = useState<Record<string, { x: number; y: number }>>({})
  // 区分设备图标的单击（打开控制）与双击（摄像头打开浮窗）
  const clickTimer = useRef<number | null>(null)

  // 空闲时宠物在房间内轻微游走，让地图更“活”
  useEffect(() => {
    const t = setInterval(() => {
      setWander(() => {
        const next: Record<string, { x: number; y: number }> = {}
        for (const p of pets) {
          if (p.id === transition?.petId) continue
          next[p.id] =
            p.behavior === 'idle' || p.behavior === 'looking'
              ? { x: (Math.sin(Date.now() / 900 + p.id.length) * 34), y: (Math.cos(Date.now() / 1100 + p.id.length) * 22) }
              : { x: 0, y: 0 }
        }
        return next
      })
    }, 2600)
    return () => clearInterval(t)
  }, [pets, transition])

  const petRoomIds = new Set(pets.map((p) => p.roomId))
  // 昼夜光照氛围：随本地时间变化（清晨/白天/傍晚/夜间）
  const amb = ambianceFor(new Date().getHours())
  // 历史轨迹：仅当前宠物的 room_change 事件（时间升序），保留事件以便点击查看
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
  const historyPts = historyNodes.map((n) => n.pt)

  const viewToggle = showToggle ? (
    <div className="absolute right-3 top-3 z-20 flex rounded-full bg-white/85 p-0.5 shadow-softsm backdrop-blur" data-testid="map-view-toggle">
      <button
        onClick={() => setView('iso')}
        className={`rounded-full px-3 py-1 text-[12px] font-bold ${view === 'iso' ? 'bg-teal text-white shadow-softsm' : 'text-[#6f817b]'}`}
      >
        立体
      </button>
      <button
        onClick={() => setView('flat')}
        className={`rounded-full px-3 py-1 text-[12px] font-bold ${view === 'flat' ? 'bg-teal text-white shadow-softsm' : 'text-[#6f817b]'}`}
      >
        平面
      </button>
    </div>
  ) : null

  if (view === 'iso') {
    return (
      <div className="relative mx-auto max-h-full w-full">
        <HomeIso />
        {viewToggle}
      </div>
    )
  }

  return (
    <div className="relative mx-auto aspect-[5/3] max-h-full w-full overflow-hidden rounded-[28px] border border-line bg-[#fafcf9] shadow-soft">
      {viewToggle}
      <div
        className="absolute inset-5 overflow-hidden rounded-[22px] border border-[#e2e9e4]"
        style={{ background: amb.bg, transition: 'background 1.2s ease' }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          data-testid="live-map-svg"
        >
          <defs>
            <radialGradient id="roomGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={amb.glow} stopOpacity={amb.glowOpacity} />
              <stop offset="62%" stopColor={amb.glow} stopOpacity={amb.glowOpacity * 0.32} />
              <stop offset="100%" stopColor={amb.glow} stopOpacity={0} />
            </radialGradient>
          </defs>
          {/* 房间：地板色 + 墙体 + 门洞 + 家具 */}
          {rooms.map((r) => {
            const b = roomBounds(r)
            const active = petRoomIds.has(r.id)
            const door = doorFor(r.polygon)
            const floor = floorColor(r.kind)
            return (
              <g key={r.id}>
                {/* 墙体（底层较深描边） */}
                <polygon points={poly(r.polygon)} fill={floor} stroke="#7f9289" strokeWidth={9} strokeLinejoin="round" style={{ vectorEffect: 'non-scaling-stroke' }} />
                {/* 地板（上层浅描边） */}
                <polygon
                  points={poly(r.polygon)}
                  fill={floor}
                  stroke={active ? '#8fc3b4' : WALL}
                  strokeWidth={active ? 4 : 2.5}
                  strokeLinejoin="round"
                  style={{ vectorEffect: 'non-scaling-stroke' }}
                />
                {/* 门洞：用地板色覆盖墙体形成开口 + 开门弧线 */}
                {door && (
                  <>
                    <line x1={door.x1} y1={door.y1} x2={door.x2} y2={door.y2} stroke={floor} strokeWidth={11} strokeLinecap="butt" style={{ vectorEffect: 'non-scaling-stroke' }} />
                    <path d={door.arc} fill="none" stroke="#c3d0ca" strokeWidth={2} style={{ vectorEffect: 'non-scaling-stroke' }} />
                  </>
                )}
                {/* 家具（来自可编辑数据，缺省回退按房型生成）—— 落地软投影提升层次 */}
                {(r.furniture ?? defaultFurniture(r)).map((f) => (
                  <g
                    key={f.id}
                    transform={`translate(${f.x} ${f.y}) rotate(${f.rotation ?? 0} ${f.w / 2} ${f.h / 2})`}
                    style={{ pointerEvents: 'none', filter: 'drop-shadow(0 3px 2.5px rgba(35,55,48,.2))' }}
                    opacity={mapMode === 'devices' ? 0.4 : 1}
                  >
                    {drawFurniture(f.type, f.w, f.h)}
                  </g>
                ))}
                <text x={b.x + 14} y={b.y + 24} fontSize={15} fontWeight={800} fill="#7c8d87" style={{ pointerEvents: 'none' }}>
                  {r.name}
                </text>
                {/* 设备点位（小度产品风格图标 + 名称） */}
                {r.devices.map((did, idx) => {
                  const dev = devices.find((d) => d.id === did)
                  if (!dev) return null
                  const dx = b.x + b.w * (0.22 + (idx % 3) * 0.28)
                  const dy = b.y + b.h * (idx < 3 ? 0.22 : 0.8)
                  return (
                    <g
                      key={did}
                      data-testid={dev.type === 'camera' ? 'map-camera' : `map-device-${dev.type}`}
                      transform={`translate(${dx} ${dy})`}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        // 延迟执行，若紧接着是双击则取消（避免单击的控制弹层打断双击）
                        if (clickTimer.current) window.clearTimeout(clickTimer.current)
                        clickTimer.current = window.setTimeout(() => {
                          setDeviceControlTarget({ deviceId: did })
                          clickTimer.current = null
                        }, 240)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        if (clickTimer.current) {
                          window.clearTimeout(clickTimer.current)
                          clickTimer.current = null
                        }
                        // 双击摄像头：打开浮窗观看该摄像头画面
                        if (dev.type === 'camera') openCameraFloat(did)
                      }}
                    >
                      {dev.type === 'camera' ? <title>双击查看画面（可点击设备）</title> : <title>可点击设备</title>}
                      {/* 透明命中区：让整块设备可点，图标本身 pointerEvents:none */}
                      <rect x={-22} y={-20} width={44} height={60} fill="#000" fillOpacity={0} style={{ pointerEvents: 'all' }} />
                      {/* 直接用设备本身形象，不加圆框 */}
                      <g transform="scale(1.25)" style={{ pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(40,70,60,.22))' }}>
                        <DeviceGlyph type={dev.type} />
                      </g>
                      {/* 可点击提示：轮廓用闪烁白色线条，不显示设备名 */}
                      <rect
                        className="map-click-blink"
                        x={-16}
                        y={-17}
                        width={32}
                        height={34}
                        rx={9}
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth={2.4}
                        style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 3px rgba(255,255,255,.85))' }}
                      />
                      {/* 设备模式：图标下方显示在线/离线与关键状态 */}
                      {mapMode === 'devices' && (
                        <g style={{ pointerEvents: 'none' }}>
                          <rect x={-28} y={40} width={56} height={16} rx={8} fill="#fff" stroke={dev.online ? '#9fcabd' : '#e3aaa4'} strokeWidth={1} />
                          <circle cx={-19} cy={48} r={2.6} fill={dev.online ? '#2e7f75' : '#c0564e'} />
                          <text x={4} y={52} fontSize={9} fontWeight={700} textAnchor="middle" fill={dev.online ? '#3f6a60' : '#a44b44'}>
                            {deviceStatusText(dev, r)}
                          </text>
                        </g>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
          {/* 外墙窗户 */}
          {windowsFor(rooms).map((w, i) => (
            <g key={`win${i}`}>
              <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#dfeaf2" strokeWidth={10} strokeLinecap="round" style={{ vectorEffect: 'non-scaling-stroke' }} />
              <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} stroke="#8fb6d6" strokeWidth={3} strokeLinecap="round" style={{ vectorEffect: 'non-scaling-stroke' }} strokeDasharray="2 10" />
            </g>
          ))}
          {/* 昼夜色罩：按时间给全图上一层色调（白天为 0） */}
          {amb.tintOpacity > 0 && (
            <rect x={0} y={0} width={MAP_W} height={MAP_H} fill={amb.tint} opacity={amb.tintOpacity} style={{ pointerEvents: 'none' }} />
          )}
          {/* 房间点亮：宠物所在的房间透出暖光（夜间更明显，形成“只有它在的屋子亮着”） */}
          {rooms.map((r) => {
            if (!petRoomIds.has(r.id)) return null
            const b = roomBounds(r)
            const c = roomCentroid(r)
            return (
              <ellipse
                key={`glow-${r.id}`}
                cx={c.x}
                cy={c.y}
                rx={Math.max(b.w, b.h) * 0.62}
                ry={Math.max(b.w, b.h) * 0.62}
                fill="url(#roomGlow)"
                style={{ pointerEvents: 'none' }}
              />
            )
          })}
          {/* 历史轨迹：画在房间/家具之上，节点可点击查看事件；与实时(teal)不同用暖橙色 */}
          {historyPts.length > 1 && (
            <>
              <polyline className="history-route" points={poly(historyPts)} />
              {historyNodes.map((n, i) => {
                const last = i === historyNodes.length - 1
                return (
                  <g key={n.e.id} data-testid="history-node" style={{ cursor: 'pointer' }} onClick={() => openEvent(n.e)}>
                    <title>{`${timeHM(n.e.timestamp)} · ${n.roomName} · ${n.e.title}${n.e.source?.length ? ' · ' + n.e.source.join('+') : ''}`}</title>
                    <circle cx={n.pt.x} cy={n.pt.y} r={last ? 20 : 17} fill="#fff" stroke={last ? '#a65e2f' : '#c5793f'} strokeWidth={last ? 6 : 5} />
                    <text x={n.pt.x} y={n.pt.y + 1} fontSize={17} fontWeight={900} fill="#a65e2f" textAnchor="middle" dominantBaseline="central">{i + 1}</text>
                    {n.e.media && <circle cx={n.pt.x + 14} cy={n.pt.y - 12} r={5} fill="#2e7f75" stroke="#fff" strokeWidth={2} />}
                  </g>
                )
              })}
            </>
          )}
          {/* 过渡路径 + 脚印（沿真实门口折线，画在家具之上） */}
          {transition && transition.path.length > 1 && (
            <>
              <polyline className="transition-route" points={poly(transition.path)} />
              {transition.path.flatMap((pt, i) => {
                if (i === 0) return []
                const a = transition.path[i - 1]
                return [0.4, 0.8].map((t, k) => (
                  <circle key={`${i}-${k}`} cx={a.x + (pt.x - a.x) * t} cy={a.y + (pt.y - a.y) * t} r={5} fill="#4ca092" opacity={0.45} />
                ))
              })}
              <circle cx={transition.to.x} cy={transition.to.y} r={9} fill="#fff" stroke="#2e7f75" strokeWidth={5} />
            </>
          )}
        </svg>

        {/* Avatar 覆盖层：每只宠物一个（同房间自动错位），点击选中并打开详情。历史模式不展示实时 Avatar，避免被当作历史位置 */}
        {mapMode !== 'history' && pets.map((p) => {
          const r = rooms.find((rm) => rm.id === p.roomId)
          const base = r ? roomCentroid(r) : { x: MAP_W / 2, y: MAP_H / 2 }
          // 同房间内的宠物按序号横向错开
          const inRoom = pets.filter((x) => x.roomId === p.roomId)
          const idx = inRoom.findIndex((x) => x.id === p.id)
          const offsetUnits = (idx - (inRoom.length - 1) / 2) * 95
          const isActive = p.id === activePetId
          const color = behaviorColor[p.behavior]
          // 正在跨房间行走的宠物：位置取当前折线路点；否则取房间质心 + 轻微游走
          const walking = transition?.petId === p.id && transition.path.length > 1
          const wpt = walking ? transition.path[Math.min(walkIndex, transition.path.length - 1)] : null
          // 气泡打开时冻结该宠物的游走，避免它从气泡下方走开
          const frozen = popover === p.id
          const w = wander[p.id] ?? { x: 0, y: 0 }
          const px = wpt ? wpt.x : base.x + offsetUnits + (walking || frozen ? 0 : w.x)
          const py = wpt ? wpt.y : base.y + (walking || frozen ? 0 : w.y)
          const leftPct = px / 10
          const topPct = py / 6
          return (
            <div
              key={p.id}
              className="absolute"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                transform: 'translate(-50%,-50%)',
                transition: walking
                  ? 'left .42s linear, top .42s linear'
                  : 'left 2.4s ease-in-out, top 2.4s ease-in-out',
                zIndex: isActive ? 8 : 6,
                opacity: mapMode === 'devices' ? 0.4 : 1,
              }}
            >
              <button
                data-testid={isActive ? 'pet-avatar' : 'pet-avatar-other'}
                aria-label={`${p.name} Avatar，当前${r?.name ?? ''}·${behaviorLabel[p.behavior]}`}
                title={`${p.name} · ${r?.name ?? ''} · ${behaviorLabel[p.behavior]}`}
                onClick={() => {
                  if (!isActive) {
                    setActivePet(p.id)
                    setPopover(p.id)
                  } else {
                    setPopover((v) => (v === p.id ? null : p.id))
                  }
                }}
                className={`relative grid h-[68px] w-[68px] place-items-center overflow-hidden rounded-[22px] border-4 bg-[#fff8e9] ${behaviorAnim[p.behavior] ?? ''} ${isActive ? '' : 'opacity-90'}`}
                style={{
                  borderColor: isActive ? color : '#ffffff',
                  boxShadow: isActive ? `0 0 0 6px ${color}22, 0 16px 26px rgba(53,86,77,.19)` : '0 10px 20px rgba(53,86,77,.14)',
                }}
              >
                <PetFace pet={p} size={60} />
              </button>
              {/* 行为徽标（图标，默认不显文字，符合低文字原则） */}
              <span
                className="pointer-events-none absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-white text-[12px] shadow"
                style={{ boxShadow: `0 0 0 2px ${color}` }}
                aria-hidden
              >
                {behaviorBadge[p.behavior]}
              </span>
              {/* 常驻名字 + 当前行为标签：无需点击即可看清每只宠物的实时状态 */}
              <span
                className="pointer-events-none absolute left-1/2 top-[72px] flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[12px] font-bold shadow-softsm"
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

        {/* Avatar 快捷互动气泡（核心交互：点一下即可看它/叫它/陪它） */}
        {(() => {
          const p = pets.find((x) => x.id === popover)
          if (!p || p.id !== activePetId) return null
          const r = rooms.find((rm) => rm.id === p.roomId)
          const base = r ? roomCentroid(r) : { x: MAP_W / 2, y: MAP_H / 2 }
          // 气泡锚定到宠物当前实际位置（含同房错位；气泡打开时已冻结游走），而非房间质心
          const inRoom = pets.filter((x) => x.roomId === p.roomId)
          const idx = inRoom.findIndex((x) => x.id === p.id)
          const offsetUnits = (idx - (inRoom.length - 1) / 2) * 95
          const walking = transition?.petId === p.id && transition.path.length > 1
          const wpt = walking ? transition.path[Math.min(walkIndex, transition.path.length - 1)] : null
          const px = wpt ? wpt.x : base.x + offsetUnits
          const py = wpt ? wpt.y : base.y
          const leftPct = Math.max(16, Math.min(84, px / 10))
          const topPct = py / 6
          // 宠物在地图上半部分时气泡朝下展开，避免被容器顶部裁剪而“消失”
          const placeBelow = topPct < 50
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
                top: placeBelow ? `calc(${topPct}% + 42px)` : `calc(${topPct}% - 42px)`,
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
    </div>
  )
}
