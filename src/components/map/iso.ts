import type { FurnitureType, Room } from '@/domain/types'
import { MAP_W, MAP_H } from '@/domain/geometry'

// 2:1 等距投影（与 Room3D 一致的 30° 斜视），用于整屋 2.5D 渲染
export const COS = Math.cos(Math.PI / 6)
export const SIN = Math.sin(Math.PI / 6)

/** 房间地台抬升高度（世界单位），形成"立体平面图"的厚度感 */
export const SLAB_H = 24
/** 家具高度单位：furnStyle.h 乘以它得到实际抬升高度 */
export const FURN_UNIT = 92

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, n | 0))
}
function toHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function darken(hex: string, amt: number): string {
  const [r, g, b] = toHex(hex)
  return `rgb(${clamp255(r * (1 - amt))},${clamp255(g * (1 - amt))},${clamp255(b * (1 - amt))})`
}
export function lighten(hex: string, amt: number): string {
  const [r, g, b] = toHex(hex)
  return `rgb(${clamp255(r + (255 - r) * amt)},${clamp255(g + (255 - g) * amt)},${clamp255(b + (255 - b) * amt)})`
}

/** 柔和的地板基色（低饱和、偏自然材质），比平面图更"真实" */
export function isoFloor(kind: Room['kind']): string {
  switch (kind) {
    case 'living': return '#efe6d6'
    case 'bedroom': return '#ece7ee'
    case 'study': return '#e6edee'
    case 'dining': return '#f0e8d9'
    case 'balcony': return '#e8dfcc'
    default: return '#edf0ec'
  }
}

/** 家具高度（相对单位，0=平铺地毯）与柔和基色 */
export function furnStyle(type: FurnitureType): { h: number; base: string } {
  switch (type) {
    case 'rug':
    case 'rug_round':
      return { h: 0, base: '#e7dcc6' }
    case 'wardrobe':
    case 'fridge':
    case 'bookshelf':
      return { h: 0.95, base: '#d2c09c' }
    case 'cat_tree':
      return { h: 1.05, base: '#cbbfa6' }
    case 'bed':
      return { h: 0.3, base: '#dfe7e2' }
    case 'sofa':
    case 'chair':
      return { h: 0.42, base: '#b3c3bb' }
    case 'coffee_table':
    case 'nightstand':
    case 'dining_table':
    case 'cabinet':
    case 'desk':
      return { h: 0.32, base: '#cdb894' }
    case 'plant':
      return { h: 0.6, base: '#8bb49b' }
    case 'tv':
      return { h: 0.5, base: '#4a5a63' }
    case 'litter':
      return { h: 0.2, base: '#cdd7d1' }
    default:
      return { h: 0.36, base: '#cdb894' }
  }
}

export type Projector = {
  P: (x: number, y: number, z?: number) => { X: number; Y: number }
  VW: number
  VH: number
  scale: number
}

/** 构建把整屋平面坐标 (0..MAP_W, 0..MAP_H) 映射到等距视图的投影器 */
export function makeHomeProjector(): Projector {
  const VW = 1180
  const VH = 720
  const margin = 48
  const maxZ = SLAB_H + FURN_UNIT * 1.3
  const widthIso = (MAP_W + MAP_H) * COS
  const heightIso = (MAP_W + MAP_H) * SIN + maxZ
  const scale = Math.min((VW - margin * 2) / widthIso, (VH - margin * 2) / heightIso)
  const ox = margin + MAP_H * COS * scale
  const oy = margin + maxZ * scale
  const P = (x: number, y: number, z = 0) => ({
    X: ox + (x - y) * COS * scale,
    Y: oy + ((x + y) * SIN - z) * scale,
  })
  return { P, VW, VH, scale }
}

export function isoPoints(arr: { X: number; Y: number }[]): string {
  return arr.map((p) => `${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ')
}
