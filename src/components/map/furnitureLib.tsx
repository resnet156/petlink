import type { FurnitureItem, FurnitureType, Room } from '@/domain/types'
import { roomBounds, makeId } from '@/domain/geometry'

const WOOD = '#c9b48f'
const WOOD_D = '#ab9573'
const FABRIC = '#b7c7bf'
const FABRIC_D = '#98ada3'
const SOFT = '#e7dccb'
const SCREEN = '#43544e'
const GREEN = '#86b298'
const WHITE = '#f6f3ec'

type Draw = (w: number, h: number) => JSX.Element

// 每件家具在本地 0..w × 0..h 坐标内绘制
const DRAW: Record<FurnitureType, Draw> = {
  sofa: (w, h) => (
    <g>
      <rect x={0} y={h * 0.28} width={w} height={h * 0.72} rx={10} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.5} />
      <rect x={0} y={0} width={w} height={h * 0.4} rx={9} fill={FABRIC_D} />
      <rect x={0} y={h * 0.25} width={w * 0.12} height={h * 0.75} rx={6} fill={FABRIC_D} />
      <rect x={w * 0.88} y={h * 0.25} width={w * 0.12} height={h * 0.75} rx={6} fill={FABRIC_D} />
      <line x1={w * 0.5} y1={h * 0.45} x2={w * 0.5} y2={h * 0.9} stroke={FABRIC_D} strokeWidth={1.2} />
    </g>
  ),
  coffee_table: (w, h) => (
    <g>
      <rect width={w} height={h} rx={8} fill={WOOD} stroke={WOOD_D} strokeWidth={1.5} />
      <rect x={w * 0.12} y={h * 0.18} width={w * 0.76} height={h * 0.64} rx={5} fill="#d8c6a3" />
    </g>
  ),
  tv: (w, h) => (
    <g>
      <rect y={h * 0.6} width={w} height={h * 0.4} rx={3} fill={WOOD} />
      <rect y={0} width={w} height={h * 0.62} rx={2} fill={SCREEN} />
    </g>
  ),
  rug: (w, h) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#efe6d6" opacity={0.85} />,
  rug_round: (w, h) => <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill="#e8ddcb" opacity={0.8} />,
  bed: (w, h) => (
    <g>
      <rect x={0} y={0} width={w} height={h * 0.1} rx={5} fill={WOOD_D} />
      <rect x={0} y={h * 0.08} width={w} height={h * 0.92} rx={10} fill={WHITE} stroke={WOOD} strokeWidth={1.5} />
      <rect x={w * 0.08} y={h * 0.14} width={w * 0.36} height={h * 0.2} rx={6} fill="#fff" stroke="#d8cfc0" strokeWidth={1.2} />
      <rect x={w * 0.56} y={h * 0.14} width={w * 0.36} height={h * 0.2} rx={6} fill="#fff" stroke="#d8cfc0" strokeWidth={1.2} />
      <rect x={0} y={h * 0.42} width={w} height={h * 0.58} rx={10} fill="#cfe0d8" />
    </g>
  ),
  nightstand: (w, h) => (
    <g>
      <rect width={w} height={h} rx={4} fill={WOOD} stroke={WOOD_D} strokeWidth={1.2} />
      <line x1={w * 0.15} y1={h * 0.52} x2={w * 0.85} y2={h * 0.52} stroke={WOOD_D} strokeWidth={1} />
      <circle cx={w * 0.5} cy={h * 0.3} r={Math.min(w, h) * 0.08} fill={WOOD_D} />
    </g>
  ),
  wardrobe: (w, h) => (
    <g>
      <rect width={w} height={h} rx={4} fill={SOFT} stroke={WOOD_D} strokeWidth={1.4} />
      <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={WOOD_D} strokeWidth={1.2} />
    </g>
  ),
  desk: (w, h) => (
    <g>
      <rect y={h * 0.5} width={w} height={h * 0.5} rx={4} fill={WOOD} stroke={WOOD_D} strokeWidth={1.5} />
      <rect x={w * 0.3} y={0} width={w * 0.3} height={h * 0.45} rx={2} fill={SCREEN} />
    </g>
  ),
  chair: (w, h) => (
    <g>
      <rect x={w * 0.12} y={h * 0.14} width={w * 0.76} height={h * 0.78} rx={6} fill={FABRIC} stroke={FABRIC_D} strokeWidth={1.3} />
      <rect x={w * 0.12} y={0} width={w * 0.76} height={h * 0.2} rx={4} fill={FABRIC_D} />
    </g>
  ),
  bookshelf: (w, h) => (
    <g>
      <rect width={w} height={h} rx={3} fill={WOOD} stroke={WOOD_D} strokeWidth={1.4} />
      <line x1={0} y1={h / 3} x2={w} y2={h / 3} stroke={WOOD_D} strokeWidth={1.3} />
      <line x1={0} y1={(h * 2) / 3} x2={w} y2={(h * 2) / 3} stroke={WOOD_D} strokeWidth={1.3} />
    </g>
  ),
  dining_table: (w, h) => (
    <g>
      <rect width={w} height={h} rx={Math.min(w, h) / 2.2} fill={WOOD} stroke={WOOD_D} strokeWidth={1.8} />
      <circle cx={w * 0.35} cy={h * 0.5} r={Math.min(w, h) * 0.13} fill="#f2ead9" />
      <circle cx={w * 0.65} cy={h * 0.5} r={Math.min(w, h) * 0.13} fill="#f2ead9" />
    </g>
  ),
  cabinet: (w, h) => (
    <g>
      <rect width={w} height={h} rx={3} fill={SOFT} stroke={WOOD_D} strokeWidth={1.3} />
      <line x1={w / 2} y1={h * 0.18} x2={w / 2} y2={h * 0.82} stroke={WOOD_D} strokeWidth={1} />
      <circle cx={w * 0.47} cy={h * 0.5} r={1.8} fill={WOOD_D} />
      <circle cx={w * 0.53} cy={h * 0.5} r={1.8} fill={WOOD_D} />
    </g>
  ),
  fridge: (w, h) => (
    <g>
      <rect width={w} height={h} rx={5} fill="#eef2f0" stroke="#b9c6bf" strokeWidth={1.4} />
      <line x1={0} y1={h * 0.4} x2={w} y2={h * 0.4} stroke="#b9c6bf" strokeWidth={1.3} />
    </g>
  ),
  plant: (w, h) => (
    <g>
      <rect x={w * 0.3} y={h * 0.6} width={w * 0.4} height={h * 0.4} rx={3} fill={WOOD_D} />
      <circle cx={w / 2} cy={h * 0.4} r={Math.min(w, h) * 0.42} fill={GREEN} />
    </g>
  ),
  cat_tree: (w, h) => (
    <g>
      <rect x={w * 0.1} y={h * 0.84} width={w * 0.8} height={h * 0.16} rx={5} fill={SOFT} stroke={WOOD_D} strokeWidth={1} />
      <rect x={w * 0.42} y={h * 0.18} width={w * 0.16} height={h * 0.66} fill={WOOD} />
      <circle cx={w * 0.5} cy={h * 0.16} r={Math.min(w, h) * 0.3} fill={SOFT} stroke={WOOD_D} strokeWidth={1} />
    </g>
  ),
  litter: (w, h) => (
    <g>
      <rect width={w} height={h} rx={6} fill="#cdd9d3" stroke="#aebfb8" strokeWidth={1.4} />
      <ellipse cx={w / 2} cy={h / 2} rx={w * 0.3} ry={h * 0.3} fill="#d7c4a7" />
    </g>
  ),
}

export const FURNITURE_META: Record<FurnitureType, { label: string; w: number; h: number }> = {
  sofa: { label: '沙发', w: 230, h: 70 },
  coffee_table: { label: '茶几', w: 110, h: 60 },
  tv: { label: '电视', w: 150, h: 26 },
  rug: { label: '地毯', w: 260, h: 150 },
  rug_round: { label: '圆毯', w: 150, h: 150 },
  bed: { label: '床', w: 240, h: 180 },
  nightstand: { label: '床头柜', w: 55, h: 50 },
  wardrobe: { label: '衣柜', w: 150, h: 55 },
  desk: { label: '书桌', w: 220, h: 70 },
  chair: { label: '椅子', w: 55, h: 55 },
  bookshelf: { label: '书架', w: 70, h: 160 },
  dining_table: { label: '餐桌', w: 180, h: 120 },
  cabinet: { label: '边柜', w: 180, h: 40 },
  fridge: { label: '冰箱', w: 60, h: 90 },
  plant: { label: '绿植', w: 56, h: 70 },
  cat_tree: { label: '猫爬架', w: 70, h: 120 },
  litter: { label: '猫砂盆', w: 80, h: 60 },
}

export const FURNITURE_PALETTE: FurnitureType[] = [
  'sofa', 'coffee_table', 'tv', 'rug', 'bed', 'nightstand', 'wardrobe', 'desk', 'chair',
  'bookshelf', 'dining_table', 'cabinet', 'fridge', 'plant', 'cat_tree', 'litter', 'rug_round',
]

export function drawFurniture(type: FurnitureType, w: number, h: number): JSX.Element {
  return (DRAW[type] ?? DRAW.cabinet)(w, h)
}

function item(type: FurnitureType, x: number, y: number, w: number, h: number): FurnitureItem {
  return { id: makeId('fn'), type, x, y, w, h }
}

/** 按房间类型生成默认家具布局（绝对坐标） */
export function defaultFurniture(room: Room): FurnitureItem[] {
  const b = roomBounds(room)
  const X = (f: number) => b.x + b.w * f
  const Y = (f: number) => b.y + b.h * f
  const W = (f: number) => b.w * f
  const H = (f: number) => b.h * f
  switch (room.kind) {
    case 'living':
      return [
        item('rug', X(0.2), Y(0.4), W(0.5), H(0.4)),
        item('tv', X(0.3), Y(0.06), W(0.4), H(0.07)),
        item('sofa', X(0.16), Y(0.74), W(0.52), H(0.16)),
        item('coffee_table', X(0.34), Y(0.5), W(0.22), H(0.12)),
        item('plant', X(0.82), Y(0.72), W(0.1), H(0.18)),
        item('cat_tree', X(0.84), Y(0.1), W(0.1), H(0.24)),
      ]
    case 'bedroom':
      return [
        item('bed', X(0.22), Y(0.16), W(0.56), H(0.58)),
        item('nightstand', X(0.06), Y(0.2), W(0.12), H(0.14)),
        item('nightstand', X(0.82), Y(0.2), W(0.12), H(0.14)),
        item('wardrobe', X(0.22), Y(0.84), W(0.56), H(0.1)),
      ]
    case 'study':
      return [
        item('desk', X(0.12), Y(0.14), W(0.56), H(0.18)),
        item('chair', X(0.34), Y(0.44), W(0.14), H(0.16)),
        item('bookshelf', X(0.78), Y(0.16), W(0.16), H(0.66)),
      ]
    case 'dining':
      return [
        item('dining_table', X(0.3), Y(0.34), W(0.4), H(0.34)),
        item('chair', X(0.16), Y(0.44), W(0.1), H(0.14)),
        item('chair', X(0.74), Y(0.44), W(0.1), H(0.14)),
        item('cabinet', X(0.1), Y(0.08), W(0.8), H(0.07)),
        item('fridge', X(0.84), Y(0.74), W(0.1), H(0.2)),
      ]
    case 'balcony':
      return [
        item('plant', X(0.12), Y(0.6), W(0.12), H(0.3)),
        item('plant', X(0.74), Y(0.62), W(0.12), H(0.28)),
        item('cat_tree', X(0.44), Y(0.5), W(0.12), H(0.4)),
      ]
    default:
      return [item('rug', X(0.25), Y(0.4), W(0.5), H(0.35)), item('sofa', X(0.2), Y(0.66), W(0.46), H(0.16))]
  }
}
