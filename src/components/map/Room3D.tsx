import { useEffect, useState } from 'react'
import type { FurnitureItem, FurnitureType, PetState, Room } from '@/domain/types'
import { roomBounds } from '@/domain/geometry'
import { defaultFurniture } from '@/components/map/furnitureLib'
import { PetFace } from '@/components/PetFace'
import { behaviorLabel, behaviorColor, behaviorBadge } from '@/lib/tracking'

/** 立体卡通房间风格 */
export type RoomStyle = 'cartoon' | 'warm' | 'night'
const STYLES: Record<RoomStyle, { label: string; bg: string; floor: string; wallL: string; wallR: string; line: string; text: string }> = {
  cartoon: { label: '清爽', bg: '#eaf3ee', floor: '#dfeee6', wallL: '#cfe3da', wallR: '#bcd6cc', line: '#9fc3b5', text: '#3f5a51' },
  warm: { label: '暖阳', bg: '#f6efe2', floor: '#f0e6d2', wallL: '#e7d7bb', wallR: '#dcc8a6', line: '#c9b48f', text: '#6b573a' },
  night: { label: '夜间', bg: '#1f2d3a', floor: '#2b3d4e', wallL: '#243442', wallR: '#1c2a36', line: '#3f5668', text: '#cfe0ee' },
}

// 2:1 等距投影
const COS = Math.cos(Math.PI / 6)
const SIN = Math.sin(Math.PI / 6)

function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((n >> 16) & 255) * (1 - amt))
  const g = Math.max(0, ((n >> 8) & 255) * (1 - amt))
  const b = Math.max(0, (n & 255) * (1 - amt))
  return `rgb(${r | 0},${g | 0},${b | 0})`
}

// 家具高度（相对，0=平铺）与基色
function furnStyle(type: FurnitureType): { h: number; base: string } {
  switch (type) {
    case 'rug':
    case 'rug_round':
      return { h: 0, base: '#e9ddc6' }
    case 'wardrobe':
    case 'fridge':
    case 'bookshelf':
    case 'cat_tree':
      return { h: 1, base: '#c9b48f' }
    case 'sofa':
    case 'chair':
      return { h: 0.5, base: '#aebfc8' }
    case 'plant':
      return { h: 0.7, base: '#86b298' }
    case 'tv':
      return { h: 0.6, base: '#4a5a63' }
    default:
      return { h: 0.42, base: '#c9b48f' }
  }
}

/** 立体卡通房间：仅显示当前宠物所处的房间，基于其布局做等距 3D 建模。风格可切换。 */
export function Room3D({
  room,
  pet,
  style,
  transparent = false,
  showLabel = true,
}: {
  room: Room
  pet: PetState
  style: RoomStyle
  /** 透明背景：只显示等距房间与宠物，四周透出桌面（桌面组件用） */
  transparent?: boolean
  /** 是否显示左上角“房间名 · 3D”标签 */
  showLabel?: boolean
}) {
  const s = STYLES[style]
  const b = roomBounds(room)
  const RW = b.w
  const RD = b.h
  const wallH = Math.min(RW, RD) * 0.5
  const furniture: FurnitureItem[] = room.furniture ?? defaultFurniture(room)

  // 轻微游走，让宠物“活”起来
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2200)
    return () => clearInterval(t)
  }, [])
  const wobble = pet.behavior === 'sleeping' ? 0 : Math.sin(tick) * RW * 0.06

  // 投影参数：缩放到 viewBox 内
  const VW = 1000
  const VH = 720
  const margin = 90
  const widthIso = (RW + RD) * COS
  const heightIso = (RW + RD) * SIN + wallH
  const scale = Math.min((VW - margin * 2) / widthIso, (VH - margin * 2) / heightIso)
  const ox = margin + RD * COS * scale
  const oy = margin + wallH * scale
  const P = (x: number, y: number, z = 0) => ({
    X: ox + (x - y) * COS * scale,
    Y: oy + ((x + y) * SIN - z) * scale,
  })
  const pts = (arr: { X: number; Y: number }[]) => arr.map((p) => `${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ')

  // 地板四角
  const f00 = P(0, 0), f10 = P(RW, 0), f11 = P(RW, RD), f01 = P(0, RD)
  // 两面后墙（左后 x=0 / 右后 y=0，向上拉伸）
  const leftWall = [P(0, 0, 0), P(0, RD, 0), P(0, RD, wallH), P(0, 0, wallH)]
  const rightWall = [P(0, 0, 0), P(RW, 0, 0), P(RW, 0, wallH), P(0, 0, wallH)]

  const petP = P(RW / 2 + wobble, RD / 2, 0)
  const petPx = (petP.X / VW) * 100
  const petPy = (petP.Y / VH) * 100

  return (
    <div
      className={`relative h-full w-full ${transparent ? '' : 'overflow-hidden rounded-2xl'}`}
      style={{ background: transparent ? 'transparent' : s.bg }}
    >
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
        {/* 后墙 */}
        <polygon points={pts(leftWall)} fill={s.wallL} stroke={s.line} strokeWidth={2} strokeLinejoin="round" />
        <polygon points={pts(rightWall)} fill={s.wallR} stroke={s.line} strokeWidth={2} strokeLinejoin="round" />
        {/* 地板 */}
        <polygon points={pts([f00, f10, f11, f01])} fill={s.floor} stroke={s.line} strokeWidth={2} strokeLinejoin="round" />
        {/* 家具（远→近绘制） */}
        {[...furniture]
          .map((f) => ({ f, lx: f.x - b.x, ly: f.y - b.y }))
          .filter((o) => o.lx + o.f.w <= RW + 2 && o.ly + o.f.h <= RD + 2 && o.lx >= -2 && o.ly >= -2)
          .sort((a, c) => a.lx + a.ly - (c.lx + c.ly))
          .map(({ f, lx, ly }) => {
            const fs = furnStyle(f.type)
            const h = fs.h * wallH
            const x0 = lx, y0 = ly, x1 = lx + f.w, y1 = ly + f.h
            if (h <= 0) {
              return <polygon key={f.id} points={pts([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)])} fill={fs.base} opacity={0.75} />
            }
            const top = [P(x0, y0, h), P(x1, y0, h), P(x1, y1, h), P(x0, y1, h)]
            const right = [P(x1, y0, 0), P(x1, y1, 0), P(x1, y1, h), P(x1, y0, h)]
            const front = [P(x0, y1, 0), P(x1, y1, 0), P(x1, y1, h), P(x0, y1, h)]
            return (
              <g key={f.id}>
                <polygon points={pts(right)} fill={darken(fs.base, 0.22)} />
                <polygon points={pts(front)} fill={darken(fs.base, 0.12)} />
                <polygon points={pts(top)} fill={fs.base} stroke="rgba(0,0,0,.06)" strokeWidth={1} />
              </g>
            )
          })}
      </svg>

      {/* 宠物（HTML 叠加，始终正面朝向）+ 右上角悬浮状态徽标 */}
      <div className="pointer-events-none absolute" style={{ left: `${petPx}%`, top: `${petPy}%`, transform: 'translate(-50%,-82%)' }}>
        <div className="relative">
          <div className={`grid h-[76px] w-[76px] place-items-center overflow-hidden rounded-[22px] border-4 border-white bg-[#fff8e9] shadow-soft ${pet.behavior === 'sleeping' ? 'pet-sleep' : pet.behavior === 'running' ? 'pet-run' : 'pet-look'}`}>
            <PetFace pet={pet} size={66} />
          </div>
          <span
            className="absolute -right-2 -top-2 inline-flex items-center gap-1 rounded-full border-2 border-white bg-white px-2 py-0.5 text-[11px] font-bold shadow"
            style={{ color: behaviorColor[pet.behavior], boxShadow: `0 0 0 2px ${behaviorColor[pet.behavior]}` }}
          >
            {behaviorBadge[pet.behavior]} {behaviorLabel[pet.behavior]}
          </span>
        </div>
      </div>

      {/* 房间名 */}
      {showLabel && (
        <div className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold" style={{ color: s.text, background: 'rgba(255,255,255,.55)' }}>
          {room.name} · 3D
        </div>
      )}
    </div>
  )
}
