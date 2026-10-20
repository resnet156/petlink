import type { DeviceType, Room } from '@/domain/types'
import { roomBounds } from '@/domain/geometry'

// 列表里仍用 emoji 作为设备类型的简易标识（地图上用 DeviceGlyph 产品化图标）
export const deviceIcon: Record<DeviceType, string> = {
  camera: '📷',
  speaker: '🔊',
  smart_screen: '🖥',
  feeder: '🍽',
  water: '💧',
  ac: '❄️',
  temp_humidity: '🌡',
  toy: '✦',
}
export function deviceIconOf(type: DeviceType): string {
  return deviceIcon[type] ?? '▦'
}

export const WALL = '#aebbb4'
export function floorColor(kind: Room['kind']): string {
  switch (kind) {
    case 'living': return '#f0e6d3'
    case 'bedroom': return '#efe7e2'
    case 'study': return '#eceee6'
    case 'dining': return '#efe7d6'
    case 'balcony': return '#ebe0cc'
    default: return '#f0f2ec'
  }
}

const WOOD = '#c9b48f'
const WOOD_D = '#ab9573'
const FABRIC = '#bccbc3'
const FABRIC_D = '#9bb0a6'
const SOFT = '#e7dccb'
const SCREEN = '#43544e'
const GREEN = '#86b298'

/** 依据房间类型绘制接近真实场景的家具（在房间 bounding box 内布局） */
export function FurnitureNodes({ room }: { room: Room }) {
  const b = roomBounds(room)
  const X = (f: number) => b.x + b.w * f
  const Y = (f: number) => b.y + b.h * f
  const W = (f: number) => b.w * f
  const H = (f: number) => b.h * f
  const k = room.kind

  if (k === 'living') {
    return (
      <g>
        <ellipse cx={X(0.5)} cy={Y(0.55)} rx={W(0.3)} ry={H(0.26)} fill="#efe6d6" opacity={0.8} />
        {/* 电视墙 */}
        <rect x={X(0.3)} y={Y(0.06)} width={W(0.4)} height={H(0.05)} rx={3} fill={WOOD} />
        <rect x={X(0.37)} y={Y(0.02)} width={W(0.26)} height={H(0.07)} rx={2} fill={SCREEN} />
        {/* 沙发（底部） */}
        <rect x={X(0.18)} y={Y(0.72)} width={W(0.5)} height={H(0.16)} rx={10} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.5} />
        <rect x={X(0.18)} y={Y(0.66)} width={W(0.5)} height={H(0.1)} rx={8} fill={FABRIC_D} />
        <rect x={X(0.14)} y={Y(0.68)} width={W(0.07)} height={H(0.2)} rx={6} fill={FABRIC_D} />
        <rect x={X(0.65)} y={Y(0.68)} width={W(0.07)} height={H(0.2)} rx={6} fill={FABRIC_D} />
        {/* 茶几 */}
        <rect x={X(0.34)} y={Y(0.5)} width={W(0.22)} height={H(0.12)} rx={6} fill={WOOD} stroke={WOOD_D} strokeWidth={1.5} />
        {/* 绿植 */}
        <rect x={X(0.82)} y={Y(0.74)} width={W(0.06)} height={H(0.12)} fill={WOOD_D} />
        <circle cx={X(0.85)} cy={Y(0.72)} r={Math.max(7, H(0.09))} fill={GREEN} />
      </g>
    )
  }
  if (k === 'bedroom') {
    return (
      <g>
        <ellipse cx={X(0.5)} cy={Y(0.82)} rx={W(0.26)} ry={H(0.1)} fill="#e7ddcd" opacity={0.7} />
        {/* 床头板 */}
        <rect x={X(0.2)} y={Y(0.14)} width={W(0.6)} height={H(0.08)} rx={6} fill={WOOD_D} />
        {/* 床垫 */}
        <rect x={X(0.22)} y={Y(0.2)} width={W(0.56)} height={H(0.52)} rx={10} fill="#f3efe6" stroke={WOOD} strokeWidth={1.5} />
        {/* 枕头 */}
        <rect x={X(0.26)} y={Y(0.24)} width={W(0.2)} height={H(0.12)} rx={6} fill="#ffffff" stroke="#d8cfc0" strokeWidth={1.2} />
        <rect x={X(0.54)} y={Y(0.24)} width={W(0.2)} height={H(0.12)} rx={6} fill="#ffffff" stroke="#d8cfc0" strokeWidth={1.2} />
        {/* 被子 */}
        <rect x={X(0.22)} y={Y(0.42)} width={W(0.56)} height={H(0.3)} rx={10} fill="#cfe0d8" />
        {/* 床头柜 */}
        <rect x={X(0.06)} y={Y(0.2)} width={W(0.12)} height={H(0.14)} rx={4} fill={WOOD} stroke={WOOD_D} strokeWidth={1.2} />
        <rect x={X(0.82)} y={Y(0.2)} width={W(0.12)} height={H(0.14)} rx={4} fill={WOOD} stroke={WOOD_D} strokeWidth={1.2} />
      </g>
    )
  }
  if (k === 'study') {
    return (
      <g>
        {/* 书桌 */}
        <rect x={X(0.14)} y={Y(0.2)} width={W(0.56)} height={H(0.16)} rx={5} fill={WOOD} stroke={WOOD_D} strokeWidth={1.5} />
        {/* 显示器 */}
        <rect x={X(0.3)} y={Y(0.08)} width={W(0.22)} height={H(0.12)} rx={2} fill={SCREEN} />
        <rect x={X(0.38)} y={Y(0.2)} width={W(0.06)} height={H(0.04)} fill={WOOD_D} />
        {/* 椅子 */}
        <circle cx={X(0.42)} cy={Y(0.5)} r={Math.max(9, H(0.11))} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.5} />
        {/* 书架 */}
        <rect x={X(0.78)} y={Y(0.2)} width={W(0.16)} height={H(0.6)} rx={3} fill={WOOD} stroke={WOOD_D} strokeWidth={1.5} />
        <line x1={X(0.78)} y1={Y(0.4)} x2={X(0.94)} y2={Y(0.4)} stroke={WOOD_D} strokeWidth={1.4} />
        <line x1={X(0.78)} y1={Y(0.6)} x2={X(0.94)} y2={Y(0.6)} stroke={WOOD_D} strokeWidth={1.4} />
      </g>
    )
  }
  if (k === 'dining') {
    const chair = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={Math.max(7, Math.min(b.w, b.h) * 0.06)} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.3} />
    return (
      <g>
        {/* 餐桌 */}
        <ellipse cx={X(0.5)} cy={Y(0.5)} rx={W(0.26)} ry={H(0.2)} fill={WOOD} stroke={WOOD_D} strokeWidth={1.8} />
        {chair(X(0.26), Y(0.5))}
        {chair(X(0.74), Y(0.5))}
        {chair(X(0.5), Y(0.24))}
        {chair(X(0.5), Y(0.76))}
        {/* 边柜 */}
        <rect x={X(0.1)} y={Y(0.08)} width={W(0.8)} height={H(0.06)} rx={3} fill={SOFT} stroke={WOOD_D} strokeWidth={1.2} />
      </g>
    )
  }
  if (k === 'balcony') {
    const planks = []
    for (let i = 0; i < 6; i++) planks.push(<line key={i} x1={X(0.05)} y1={Y(0.12 + i * 0.14)} x2={X(0.95)} y2={Y(0.12 + i * 0.14)} stroke="#d8c6a4" strokeWidth={2} />)
    return (
      <g>
        {planks}
        {/* 栏杆（外沿） */}
        <rect x={X(0.05)} y={Y(0.04)} width={W(0.9)} height={H(0.04)} rx={2} fill={WOOD_D} />
        {/* 绿植 */}
        <rect x={X(0.14)} y={Y(0.68)} width={W(0.1)} height={H(0.18)} fill={WOOD} />
        <circle cx={X(0.19)} cy={Y(0.64)} r={Math.max(9, H(0.12))} fill={GREEN} />
        <rect x={X(0.74)} y={Y(0.68)} width={W(0.1)} height={H(0.18)} fill={WOOD} />
        <circle cx={X(0.79)} cy={Y(0.64)} r={Math.max(8, H(0.1))} fill="#9ac3ab" />
      </g>
    )
  }
  // custom
  return (
    <g>
      <rect x={X(0.2)} y={Y(0.6)} width={W(0.46)} height={H(0.16)} rx={9} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.5} />
      <rect x={X(0.34)} y={Y(0.4)} width={W(0.2)} height={H(0.12)} rx={5} fill={WOOD} stroke={WOOD_D} strokeWidth={1.4} />
    </g>
  )
}
