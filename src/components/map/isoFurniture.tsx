import type { FurnitureItem } from '@/domain/types'
import { darken } from './iso'

type P = (x: number, y: number, z?: number) => { X: number; Y: number }
const S = (a: { X: number; Y: number }[]) => a.map((p) => `${p.X.toFixed(1)},${p.Y.toFixed(1)}`).join(' ')

// 材质色
const FAB = '#b7c7bf', FAB_D = '#9bb0a6'
const WOOD = '#cdb894', WOOD_D = '#a98f68'
const WHITE = '#eef0ea', DUVET = '#cfe0d8'
const SCREEN = '#3c4a52'
const GREEN = '#8bb49b'
const APP = '#e3e9e6'
const CERAMIC = '#d7ccba'
const ACCENT = '#dd9159'      // 暖橙：靠背 / 坐垫点缀
const ACCENT_SOFT = '#ecc19a' // 浅暖：抱枕
const BLANKET = '#d98f6b'     // 床尾毯
const LAMP = '#f4e6c3'        // 灯罩

/** 等距立方体（左后两面受光较弱 → 右/前面加深），可选顶面描边 */
function box(P: P, x0: number, y0: number, x1: number, y1: number, zb: number, zt: number, base: string, k: string, stroke = true) {
  const top = [P(x0, y0, zt), P(x1, y0, zt), P(x1, y1, zt), P(x0, y1, zt)]
  const right = [P(x1, y0, zb), P(x1, y1, zb), P(x1, y1, zt), P(x1, y0, zt)]
  const front = [P(x0, y1, zb), P(x1, y1, zb), P(x1, y1, zt), P(x0, y1, zt)]
  return (
    <g key={k}>
      <polygon points={S(right)} fill={darken(base, 0.24)} />
      <polygon points={S(front)} fill={darken(base, 0.12)} />
      <polygon points={S(top)} fill={base} stroke={stroke ? 'rgba(20,40,34,.1)' : 'none'} strokeWidth={1} strokeLinejoin="round" />
    </g>
  )
}

/** 在家具表面画一条线（用世界坐标两点投影），用于门缝 / 搁板 / 抽屉等细节 */
function seg(P: P, a: [number, number, number], b: [number, number, number], k: string, color = 'rgba(40,55,50,.3)', w = 1.4) {
  const pa = P(a[0], a[1], a[2])
  const pb = P(b[0], b[1], b[2])
  return <line key={k} x1={pa.X} y1={pa.Y} x2={pb.X} y2={pb.Y} stroke={color} strokeWidth={w} />
}

// __CASES__

/** 把一件家具画成逼近真实造型的等距立体形象（坐落在 zb 高度的地台上，unit 为高度单位） */
export function drawIsoFurniture(P: P, f: FurnitureItem, zb: number, unit: number): JSX.Element {
  const x0 = f.x, y0 = f.y, x1 = f.x + f.w, y1 = f.y + f.h
  const w = f.w, h = f.h
  const U = (n: number) => zb + n * unit
  const parts: JSX.Element[] = []
  const id = f.id

  switch (f.type) {
    case 'rug':
    case 'rug_round': {
      const z = zb + 0.5
      const base = f.type === 'rug_round' ? '#e8ddcb' : '#efe6d6'
      return (
        <g key={id}>
          <polygon points={S([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)])} fill={base} opacity={0.78} />
          <polygon points={S([P(x0 + w * 0.08, y0 + h * 0.12, z), P(x1 - w * 0.08, y0 + h * 0.12, z), P(x1 - w * 0.08, y1 - h * 0.12, z), P(x0 + w * 0.08, y1 - h * 0.12, z)])} fill="none" stroke={darken(base, 0.14)} strokeWidth={1.4} />
        </g>
      )
    }
    case 'sofa': {
      // 靠背（后沿、最高）→ 左扶手 → 坐垫（前、较低）→ 右扶手
      parts.push(box(P, x0, y0, x1, y0 + h * 0.3, zb, U(0.6), FAB_D, `${id}-back`))
      parts.push(box(P, x0, y0 + h * 0.1, x0 + w * 0.15, y1, zb, U(0.46), FAB_D, `${id}-arml`))
      parts.push(box(P, x0 + w * 0.13, y0 + h * 0.28, x1 - w * 0.13, y1, zb, U(0.3), FAB, `${id}-seat`))
      // 抱枕点缀（暖色）
      parts.push(box(P, x0 + w * 0.16, y0 + h * 0.34, x0 + w * 0.4, y0 + h * 0.62, U(0.3), U(0.46), ACCENT_SOFT, `${id}-cu1`))
      parts.push(box(P, x1 - w * 0.4, y0 + h * 0.34, x1 - w * 0.16, y0 + h * 0.62, U(0.3), U(0.46), ACCENT, `${id}-cu2`))
      parts.push(box(P, x1 - w * 0.15, y0 + h * 0.1, x1, y1, zb, U(0.46), FAB_D, `${id}-armr`))
      break
    }
    case 'chair': {
      parts.push(box(P, x0, y0, x1, y0 + h * 0.24, zb, U(0.82), ACCENT, `${id}-back`))
      parts.push(box(P, x0, y0 + h * 0.2, x1, y1, zb, U(0.42), WOOD, `${id}-seat`))
      break
    }
    case 'bed': {
      parts.push(box(P, x0, y0, x1, y0 + h * 0.1, zb, U(0.58), WOOD_D, `${id}-hb`)) // 床头板
      parts.push(box(P, x0, y0 + h * 0.08, x1, y1, zb, U(0.26), WHITE, `${id}-mat`)) // 床垫
      parts.push(box(P, x0, y0 + h * 0.42, x1, y1, U(0.26), U(0.32), DUVET, `${id}-duvet`)) // 被子
      parts.push(box(P, x0, y1 - h * 0.16, x1, y1, U(0.26), U(0.36), BLANKET, `${id}-blanket`)) // 床尾毯
      parts.push(box(P, x0 + w * 0.08, y0 + h * 0.14, x0 + w * 0.44, y0 + h * 0.32, U(0.26), U(0.36), '#ffffff', `${id}-p1`)) // 枕
      parts.push(box(P, x0 + w * 0.56, y0 + h * 0.14, x0 + w * 0.92, y0 + h * 0.32, U(0.26), U(0.36), '#ffffff', `${id}-p2`))
      break
    }
    case 'tv': {
      parts.push(box(P, x0, y0, x1, y1, zb, U(0.06), WOOD, `${id}-stand`))
      parts.push(box(P, x0 + w * 0.03, y0, x1 - w * 0.03, y0 + h * 0.5, U(0.06), U(0.52), SCREEN, `${id}-screen`))
      break
    }
    case 'plant': {
      parts.push(box(P, x0 + w * 0.28, y0 + h * 0.28, x1 - w * 0.28, y1 - h * 0.28, zb, U(0.3), CERAMIC, `${id}-pot`))
      parts.push(box(P, x0 + w * 0.14, y0 + h * 0.14, x1 - w * 0.14, y1 - h * 0.14, U(0.28), U(0.62), GREEN, `${id}-leaf1`, false))
      parts.push(box(P, x0 + w * 0.26, y0 + h * 0.26, x1 - w * 0.26, y1 - h * 0.26, U(0.6), U(0.86), '#9cc3aa', `${id}-leaf2`, false))
      break
    }
    case 'wardrobe':
    case 'fridge':
    case 'bookshelf':
    case 'cabinet': {
      const tall = f.type === 'cabinet' ? 0.4 : 0.96
      const mat = f.type === 'fridge' ? APP : WOOD
      parts.push(box(P, x0, y0, x1, y1, zb, U(tall), mat, `${id}-body`))
      if (f.type === 'bookshelf') {
        parts.push(seg(P, [x0, y1, U(tall * 0.33)], [x1, y1, U(tall * 0.33)], `${id}-s1`))
        parts.push(seg(P, [x0, y1, U(tall * 0.66)], [x1, y1, U(tall * 0.66)], `${id}-s2`))
      } else if (f.type === 'fridge') {
        parts.push(seg(P, [x0, y1, U(tall * 0.45)], [x1, y1, U(tall * 0.45)], `${id}-fr`))
        parts.push(seg(P, [x1 - w * 0.1, y1, U(tall * 0.5)], [x1 - w * 0.1, y1, U(tall * 0.9)], `${id}-fh`, 'rgba(40,55,50,.35)', 2.2))
      } else {
        parts.push(seg(P, [(x0 + x1) / 2, y1, zb], [(x0 + x1) / 2, y1, U(tall)], `${id}-door`))
        parts.push(seg(P, [(x0 + x1) / 2 - w * 0.06, y1, U(tall * 0.5)], [(x0 + x1) / 2 - w * 0.06, y1, U(tall * 0.5)], `${id}-k`))
      }
      break
    }
    // __CASES3__
    case 'desk': {
      parts.push(box(P, x0, y0, x1, y0 + h * 0.08, zb, U(0.34), WOOD_D, `${id}-mod`))
      parts.push(box(P, x0, y0, x0 + w * 0.05, y1, zb, U(0.34), WOOD_D, `${id}-l1`))
      parts.push(box(P, x1 - w * 0.05, y0, x1, y1, zb, U(0.34), WOOD_D, `${id}-l2`))
      parts.push(box(P, x0, y0, x1, y1, U(0.34), U(0.4), WOOD, `${id}-top`))
      parts.push(box(P, x0 + w * 0.34, y0 + h * 0.1, x0 + w * 0.6, y0 + h * 0.2, U(0.4), U(0.78), SCREEN, `${id}-mon`))
      break
    }
    case 'dining_table':
    case 'coffee_table': {
      const topZ = f.type === 'coffee_table' ? 0.24 : 0.32
      const lw = Math.min(w, h) * 0.08
      parts.push(box(P, x0 + lw, y0 + lw, x0 + lw * 2, y0 + lw * 2, zb, U(topZ), WOOD_D, `${id}-lg1`))
      parts.push(box(P, x1 - lw * 2, y0 + lw, x1 - lw, y0 + lw * 2, zb, U(topZ), WOOD_D, `${id}-lg2`))
      parts.push(box(P, x0 + lw, y1 - lw * 2, x0 + lw * 2, y1 - lw, zb, U(topZ), WOOD_D, `${id}-lg3`))
      parts.push(box(P, x1 - lw * 2, y1 - lw * 2, x1 - lw, y1 - lw, zb, U(topZ), WOOD_D, `${id}-lg4`))
      parts.push(box(P, x0, y0, x1, y1, U(topZ), U(topZ + 0.06), WOOD, `${id}-top`))
      break
    }
    case 'nightstand': {
      parts.push(box(P, x0, y0, x1, y1, zb, U(0.4), WOOD, `${id}-b`))
      parts.push(seg(P, [x0 + w * 0.15, y1, U(0.22)], [x1 - w * 0.15, y1, U(0.22)], `${id}-dr`))
      // 台灯：灯座 + 灯罩
      parts.push(box(P, x0 + w * 0.4, y0 + h * 0.32, x0 + w * 0.52, y0 + h * 0.5, U(0.4), U(0.6), WOOD_D, `${id}-lp`))
      parts.push(box(P, x0 + w * 0.3, y0 + h * 0.24, x0 + w * 0.62, y0 + h * 0.56, U(0.6), U(0.78), LAMP, `${id}-ls`))
      break
    }
    case 'cat_tree': {
      parts.push(box(P, x0 + w * 0.15, y0 + h * 0.15, x1 - w * 0.15, y1 - h * 0.15, zb, U(0.1), '#e6dcc9', `${id}-base`))
      parts.push(box(P, x0 + w * 0.4, y0 + h * 0.4, x0 + w * 0.6, y0 + h * 0.6, U(0.1), U(0.78), WOOD, `${id}-post`))
      parts.push(box(P, x0 + w * 0.18, y0 + h * 0.18, x1 - w * 0.18, y1 - h * 0.18, U(0.78), U(0.92), '#e6dcc9', `${id}-plat`))
      break
    }
    case 'litter': {
      parts.push(box(P, x0, y0, x1, y1, zb, U(0.2), CERAMIC, `${id}-base`))
      parts.push(box(P, x0, y0, x1, y0 + h * 0.55, U(0.2), U(0.46), APP, `${id}-hood`))
      break
    }
    default: {
      parts.push(box(P, x0, y0, x1, y1, zb, U(0.4), WOOD, `${id}-b`))
    }
  }
  return <g key={id} style={{ pointerEvents: 'none' }}>{parts}</g>
}
