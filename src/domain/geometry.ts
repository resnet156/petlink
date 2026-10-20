import type { Point, Room } from './types'

/** 地图逻辑坐标系：viewBox 0 0 1000 600 */
export const MAP_W = 1000
export const MAP_H = 600

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

export function centroid(points: Point[]): Point {
  if (!points.length) return { x: MAP_W / 2, y: MAP_H / 2 }
  const x = points.reduce((a, p) => a + p.x, 0) / points.length
  const y = points.reduce((a, p) => a + p.y, 0) / points.length
  return { x, y }
}

export function roomCentroid(room: Room): Point {
  return centroid(room.polygon)
}

export type Bounds = { x: number; y: number; w: number; h: number }

export function bounds(points: Point[]): Bounds {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

export function roomBounds(room: Room): Bounds {
  return bounds(room.polygon)
}

export function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersect =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 0.0001) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function clampPoint(p: Point, w = MAP_W, h = MAP_H): Point {
  return { x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) }
}

/** 找到离目标房间几何最近、且拥有某设备的房间 id */
export function nearestRoomIdWith(
  rooms: Room[],
  targetRoomId: string,
  predicate: (room: Room) => boolean,
): string | null {
  const candidates = rooms.filter(predicate)
  if (!candidates.length) return null
  const target = rooms.find((r) => r.id === targetRoomId)
  if (!target) return candidates[0].id
  const c = roomCentroid(target)
  return candidates
    .slice()
    .sort((a, b) => dist(roomCentroid(a), c) - dist(roomCentroid(b), c))[0].id
}

/** 依据名称推断房间语义类型（仅用于默认家具/图标；不驱动业务逻辑） */
export function inferRoomKind(name: string): Room['kind'] {
  if (name.includes('卧') || name.toLowerCase().includes('bed')) return 'bedroom'
  if (name.includes('书') || name.toLowerCase().includes('study')) return 'study'
  if (name.includes('阳') || name.toLowerCase().includes('balcon')) return 'balcony'
  if (name.includes('餐') || name.includes('厨') || name.toLowerCase().includes('kitchen'))
    return 'dining'
  if (name.includes('客厅') || name.toLowerCase().includes('living')) return 'living'
  return 'custom'
}

/** 房间“门口”坐标：最靠近户型中心、且足够长的墙边中点（宠物进出房间的通道点） */
export function roomDoorPoint(room: Room): Point {
  const poly = room.polygon
  if (poly.length < 3) return roomCentroid(room)
  const C = { x: MAP_W / 2, y: MAP_H / 2 }
  let best: Point | null = null
  let bd = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    if (Math.hypot(b.x - a.x, b.y - a.y) < 90) continue
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const d = Math.hypot(m.x - C.x, m.y - C.y)
    if (d < bd) { bd = d; best = m }
  }
  return best ?? roomCentroid(room)
}

/** 跨房间步行路径：出发房间质心 → 出发门口 → 目标门口 → 目标房间质心 */
export function buildWalkPath(from: Room | undefined, to: Room): Point[] {
  const dest = roomCentroid(to)
  if (!from) return [dest]
  return [roomCentroid(from), roomDoorPoint(from), roomDoorPoint(to), dest]
}

let idCounter = 0
export function makeId(prefix = 'id'): string {
  idCounter += 1
  const rand = Math.abs(Math.sin(idCounter) * 1e9).toString(36).slice(0, 6)
  return `${prefix}_${idCounter.toString(36)}${rand}`
}

/** 计算围栏贴合全屋边界的矩形 */
export function fitFenceRect(rooms: Room[], margin = 22): Point[] {
  const all = rooms.flatMap((r) => r.polygon)
  if (!all.length) return []
  const b = bounds(all)
  const minX = Math.max(8, b.x - margin)
  const minY = Math.max(8, b.y - margin)
  const maxX = Math.min(MAP_W - 8, b.x + b.w + margin)
  const maxY = Math.min(MAP_H - 8, b.y + b.h + margin)
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ]
}
