import { useEffect, useRef } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { MAP_W, MAP_H, roomBounds, roomCentroid } from '@/domain/geometry'
import { floorColor } from '@/components/map/furniture'
import { drawFurniture, defaultFurniture } from '@/components/map/furnitureLib'
import type { Point } from '@/domain/types'

export function FenceModal() {
  const open = useStore((s) => s.modal === 'fence')
  const close = useStore((s) => s.closeModal)
  const rooms = useStore((s) => s.homeMap.rooms)
  const version = useStore((s) => s.homeMap.version)
  const fence = useStore((s) => s.fence)
  const setFencePoints = useStore((s) => s.setFencePoints)
  const fitFence = useStore((s) => s.fitFence)
  const saveFence = useStore((s) => s.saveFence)
  const room = useStore(currentRoom)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIndex = useRef<number>(-1)

  useEffect(() => {
    if (open && fence.points.length < 3) fitFence()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toSvg = (e: { clientX: number; clientY: number }): Point => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * MAP_W, y: ((e.clientY - r.top) / r.height) * MAP_H }
  }

  const addPoint = (e: React.MouseEvent) => {
    if (dragIndex.current >= 0) return
    const target = e.target as Element
    if (target.getAttribute('data-handle') !== null) return // 点在把手上不加点
    setFencePoints([...fence.points, toSvg(e)])
  }

  const petCenter = room ? roomCentroid(room) : { x: 500, y: 300 }

  return (
    <Modal open={open} onClose={close} wide eyebrow="SAFE ZONE · SYNC HOME MAP" title="虚拟栅栏" desc="室内安全区域（非室外 GPS 电子围栏）。点击地图添加围栏顶点，至少 3 点即可保存。" testId="fence-modal">
      {fence.needsReview && (
        <div data-testid="fence-review" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#f0d9b8] bg-[#fff5e6] px-3.5 py-2.5 text-xs text-[#8a6530]">
          <span><b>地图已更新</b>，你的自定义安全区域可能不再适用，请检查。</span>
          <div className="flex gap-2">
            <button className="btn" onClick={() => setFencePoints(fence.points)}>保留当前围栏</button>
            <button className="btn btn-primary" onClick={() => fitFence()}>重新贴合全屋</button>
          </div>
        </div>
      )}
      <div className="relative h-[420px] overflow-hidden rounded-[22px] border border-line bg-[#f4f7f4]">
        <div data-testid="fence-sync-badge" className="absolute left-3.5 top-3.5 z-[3] rounded-full border border-line bg-white/95 px-2.5 py-1.5 text-[12px] font-extrabold text-teal shadow-softsm">
          已同步当前地图 · {rooms.length} 个房间 · V{version}
        </div>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full cursor-crosshair"
          onClick={addPoint}
          onPointerMove={(e) => {
            if (dragIndex.current < 0) return
            const p = toSvg(e)
            const next = fence.points.map((pt, i) => (i === dragIndex.current ? { x: Math.max(0, Math.min(MAP_W, p.x)), y: Math.max(0, Math.min(MAP_H, p.y)) } : pt))
            setFencePoints(next)
          }}
          onPointerUp={() => (dragIndex.current = -1)}
        >
          {rooms.map((r) => {
            const b = roomBounds(r)
            return (
              <g key={r.id}>
                <polygon points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')} fill={floorColor(r.kind)} stroke="#7f9289" strokeWidth={7} strokeLinejoin="round" style={{ vectorEffect: 'non-scaling-stroke' }} />
                <polygon points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#c7d4ce" strokeWidth={2} style={{ vectorEffect: 'non-scaling-stroke' }} />
                <g opacity={0.6} style={{ pointerEvents: 'none' }}>
                  {(r.furniture ?? defaultFurniture(r)).map((f) => (
                    <g key={f.id} transform={`translate(${f.x} ${f.y}) rotate(${f.rotation ?? 0} ${f.w / 2} ${f.h / 2})`}>
                      {drawFurniture(f.type, f.w, f.h)}
                    </g>
                  ))}
                </g>
                <text x={b.x + 14} y={b.y + 24} fontSize={15} fontWeight={800} fill="#7c8d87" style={{ pointerEvents: 'none' }}>{r.name}</text>
              </g>
            )
          })}
          <polygon points={fence.points.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(76,160,146,.18)" stroke="#2e7f75" strokeWidth={5} strokeDasharray="12 8" />
          {fence.points.map((p, i) => (
            <circle
              key={i}
              data-handle={i}
              data-testid="fence-handle"
              cx={p.x}
              cy={p.y}
              r={12}
              fill="#fff"
              stroke="#2e7f75"
              strokeWidth={6}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => { e.stopPropagation(); dragIndex.current = i; ;(e.target as Element).setPointerCapture?.(e.pointerId) }}
            />
          ))}
          <g style={{ pointerEvents: 'none' }}>
            <circle cx={petCenter.x} cy={petCenter.y} r={19} fill="#fff3d8" stroke="#fff" strokeWidth={5} />
            <text x={petCenter.x} y={petCenter.y + 6} fontSize={23} textAnchor="middle">🐱</text>
          </g>
        </svg>
      </div>
      <p className="mt-2.5 rounded-xl bg-[#eef6f2] px-3 py-2.5 text-[11px] leading-relaxed text-[#60746c]">
        这是<b>室内</b>安全区域，用于判断宠物进入/离开已定义的室内监控范围；无室外定位数据时不代表宠物真实走出住宅。点击空白增加边界点，拖动绿点调整。自定义后的围栏不会因修改户型而被静默覆盖，仅在布局大改时提示复核。
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button className="btn" onClick={() => setFencePoints(fence.points.slice(0, -1))}>撤销点</button>
        <button className="btn" onClick={() => setFencePoints([])}>重画</button>
        <button className="btn" onClick={() => fitFence()}>贴合全屋边界</button>
        <button data-testid="save-fence" className="btn btn-primary" onClick={() => saveFence()}>保存并启用</button>
      </div>
    </Modal>
  )
}
