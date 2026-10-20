import type { FurnitureType } from '@/domain/types'

// 画布版家具图标：与 furnitureLib 的 SVG 造型一致，用于户型编辑器预览（替代纯矩形）。
// 统一在局部坐标 [0,0,w,h] 内绘制。

const WOOD = '#c9b48f', WOOD_D = '#ab9573'
const FABRIC = '#b7c7bf', FABRIC_D = '#98ada3'
const SOFT = '#e7dccb', SCREEN = '#43544e', GREEN = '#86b298', WHITE = '#f6f3ec'

type C = CanvasRenderingContext2D

function rr(ctx: C, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.arcTo(x + w, y, x + w, y + h, rad)
  ctx.arcTo(x + w, y + h, x, y + h, rad)
  ctx.arcTo(x, y + h, x, y, rad)
  ctx.arcTo(x, y, x + w, y, rad)
  ctx.closePath()
}
function box(ctx: C, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string, lw = 1.4) {
  rr(ctx, x, y, w, h, r)
  ctx.fillStyle = fill
  ctx.fill()
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke() }
}
function ell(ctx: C, cx: number, cy: number, rx: number, ry: number, fill: string, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha
  ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2)
  ctx.fillStyle = fill; ctx.fill(); ctx.restore()
}
function hline(ctx: C, x1: number, y: number, x2: number, color: string, lw = 1.3) {
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke()
}

// __PAINT__

/** 在局部 [0,0,w,h] 内绘制对应家具图标（俯视），与地图平面视图造型一致 */
export function drawFurnitureCanvas(ctx: C, type: FurnitureType, w: number, h: number) {
  switch (type) {
    case 'sofa':
      box(ctx, 0, h * 0.28, w, h * 0.72, 10, FABRIC, FABRIC_D)
      box(ctx, 0, 0, w, h * 0.4, 9, FABRIC_D)
      box(ctx, 0, h * 0.25, w * 0.12, h * 0.75, 6, FABRIC_D)
      box(ctx, w * 0.88, h * 0.25, w * 0.12, h * 0.75, 6, FABRIC_D)
      break
    case 'coffee_table':
      box(ctx, 0, 0, w, h, 8, WOOD, WOOD_D)
      box(ctx, w * 0.12, h * 0.18, w * 0.76, h * 0.64, 5, '#d8c6a3')
      break
    case 'tv':
      box(ctx, 0, h * 0.6, w, h * 0.4, 3, WOOD)
      box(ctx, 0, 0, w, h * 0.62, 2, SCREEN)
      break
    case 'rug':
      ell(ctx, w / 2, h / 2, w / 2, h / 2, '#efe6d6', 0.85)
      break
    case 'rug_round':
      ell(ctx, w / 2, h / 2, w / 2, h / 2, '#e8ddcb', 0.8)
      break
    case 'bed':
      box(ctx, 0, 0, w, h * 0.1, 5, WOOD_D)
      box(ctx, 0, h * 0.08, w, h * 0.92, 10, WHITE, WOOD)
      box(ctx, 0, h * 0.42, w, h * 0.58, 10, '#cfe0d8')
      box(ctx, w * 0.08, h * 0.14, w * 0.36, h * 0.2, 6, '#ffffff', '#d8cfc0', 1.1)
      box(ctx, w * 0.56, h * 0.14, w * 0.36, h * 0.2, 6, '#ffffff', '#d8cfc0', 1.1)
      break
    case 'nightstand':
      box(ctx, 0, 0, w, h, 4, WOOD, WOOD_D)
      hline(ctx, w * 0.15, h * 0.52, w * 0.85, WOOD_D)
      ell(ctx, w * 0.5, h * 0.3, Math.min(w, h) * 0.08, Math.min(w, h) * 0.08, WOOD_D)
      break
    case 'wardrobe':
      box(ctx, 0, 0, w, h, 4, SOFT, WOOD_D)
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1.2; ctx.stroke()
      break
    case 'desk':
      box(ctx, 0, h * 0.5, w, h * 0.5, 4, WOOD, WOOD_D)
      box(ctx, w * 0.3, 0, w * 0.3, h * 0.45, 2, SCREEN)
      break
    case 'chair':
      box(ctx, w * 0.12, h * 0.14, w * 0.76, h * 0.78, 6, FABRIC, FABRIC_D, 1.2)
      box(ctx, w * 0.12, 0, w * 0.76, h * 0.2, 4, FABRIC_D)
      break
    case 'bookshelf':
      box(ctx, 0, 0, w, h, 3, WOOD, WOOD_D)
      hline(ctx, 0, h / 3, w, WOOD_D)
      hline(ctx, 0, (h * 2) / 3, w, WOOD_D)
      break
    case 'dining_table':
      box(ctx, 0, 0, w, h, Math.min(w, h) / 2.2, WOOD, WOOD_D, 1.6)
      ell(ctx, w * 0.35, h * 0.5, Math.min(w, h) * 0.13, Math.min(w, h) * 0.13, '#f2ead9')
      ell(ctx, w * 0.65, h * 0.5, Math.min(w, h) * 0.13, Math.min(w, h) * 0.13, '#f2ead9')
      break
    case 'cabinet':
      box(ctx, 0, 0, w, h, 3, SOFT, WOOD_D)
      ctx.beginPath(); ctx.moveTo(w / 2, h * 0.18); ctx.lineTo(w / 2, h * 0.82); ctx.strokeStyle = WOOD_D; ctx.lineWidth = 1; ctx.stroke()
      break
    case 'fridge':
      box(ctx, 0, 0, w, h, 5, '#eef2f0', '#b9c6bf')
      hline(ctx, 0, h * 0.4, w, '#b9c6bf')
      break
    case 'plant':
      box(ctx, w * 0.3, h * 0.6, w * 0.4, h * 0.4, 3, WOOD_D)
      ell(ctx, w / 2, h * 0.4, Math.min(w, h) * 0.42, Math.min(w, h) * 0.42, GREEN)
      break
    case 'cat_tree':
      box(ctx, w * 0.1, h * 0.84, w * 0.8, h * 0.16, 5, SOFT, WOOD_D, 1)
      box(ctx, w * 0.42, h * 0.18, w * 0.16, h * 0.66, 0, WOOD)
      ell(ctx, w * 0.5, h * 0.16, Math.min(w, h) * 0.3, Math.min(w, h) * 0.3, SOFT)
      break
    case 'litter':
      box(ctx, 0, 0, w, h, 6, '#cdd9d3', '#aebfb8')
      ell(ctx, w / 2, h / 2, w * 0.3, h * 0.3, '#d7c4a7')
      break
    default:
      box(ctx, 0, 0, w, h, 4, SOFT, WOOD_D)
  }
}
