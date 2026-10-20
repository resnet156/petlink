import { MAP_W, MAP_H } from '@/domain/geometry'
import type { Point } from '@/domain/types'

/**
 * 户型房间识别入口：优先用深度模型(onnxruntime-web，本地推理，按墙精确分房间)，
 * 失败或模型不可用时回退到轻量启发式识别。模型以动态 import 懒加载，避免把
 * onnxruntime 打进主包。
 */
export async function detectRoomsFromImage(dataUrl: string): Promise<Point[][]> {
  const noML = (globalThis as unknown as { __FP_NO_ML?: boolean }).__FP_NO_ML
  const dbg = (globalThis as unknown as { __FP_DEBUG?: boolean }).__FP_DEBUG
  if (!noML) {
    try {
      const { detectRoomsML } = await import('./floorplanML')
      const polys = await detectRoomsML(dataUrl)
      if (dbg) console.log(`[FP] ML path OK, rooms=${polys.length}`) // eslint-disable-line no-console
      if (polys.length) return polys
    } catch (e) {
      // eslint-disable-next-line no-console
      if (dbg) console.warn('[FP] ML detect FAILED, fallback to heuristic:', e)
    }
  }
  const h = await detectRoomsHeuristic(dataUrl)
  if (dbg) console.log(`[FP] heuristic path, rooms=${h.length}`) // eslint-disable-line no-console
  return h
}

/**
 * 从户型图自动识别房间（客户端轻量 CV，回退方案）：
 * 1) 缩小到网格并二值化：深色线条视为墙(barrier)，其余为可通行区域；
 * 2) 对非墙像素做连通域标记，排除贴边的外部背景，保留被墙围住的"房间"连通域；
 * 3) 每个房间取外接矩形，按比例映射回地图坐标，内缩避开墙体。
 * 返回房间多边形（地图坐标）列表。识别不到返回空数组。
 */
export async function detectRoomsHeuristic(dataUrl: string): Promise<Point[][]> {
  const img = await loadImage(dataUrl)
  const GW = 320
  const GH = Math.max(80, Math.min(360, Math.round((GW * img.height) / img.width)))
  const canvas = document.createElement('canvas')
  canvas.width = GW
  canvas.height = GH
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, GW, GH)
  const { data } = ctx.getImageData(0, 0, GW, GH)

  const N = GW * GH
  const gray = new Uint8Array(N)
  const hist = new Array(256).fill(0)
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3]
    const lum = a > 40 ? ((0.299 * r + 0.587 * g + 0.114 * b) | 0) : 255
    gray[i] = lum
    hist[lum]++
  }
  // Otsu 自适应阈值（钳制到合理区间）；深色像素(<thr)视为"黑墨"（墙+家具+标注线+文字）。
  const thr = Math.max(70, Math.min(190, otsu(hist, N)))
  const dark = new Uint8Array(N)
  for (let i = 0; i < N; i++) dark[i] = gray[i] < thr ? 1 : 0

  // 以"墙壁为边缘"：墙体是贯穿全屋、相互连通的黑色骨架；而沙发/床/文字/尺寸标注线
  // 都是漂浮在房间内部、彼此独立的小块黑墨。取黑墨的最大连通块(及其同量级的大块)
  // 作为墙骨架，丢掉其余所有家具/文字噪声——这样房间不会被室内家具切碎。
  const skeleton = wallSkeleton(dark, GW, GH)

  // 对墙骨架做形态学"闭运算"(先膨胀再腐蚀) 封住门洞/缺口，基本不改变墙位，
  // 避免 flood fill 从门口把相邻房间或室外连成一片。
  const SEAL = Math.max(3, Math.round(GW / 70)) // 封门洞半径（随网格自适应，约封 2*SEAL 像素的缺口）
  const wall = erode(dilate(skeleton, GW, GH, SEAL), GW, GH, SEAL)
  const EXP = 1 // 闭运算基本不改变墙位，外接矩形只需少量回扩贴合墙内沿

  // 连通域（4 邻接）标记非墙像素
  const label = new Int32Array(N).fill(-1)
  const stack: number[] = []
  type Comp = { minx: number; miny: number; maxx: number; maxy: number; area: number; border: boolean }
  const comps: Comp[] = []
  for (let s = 0; s < N; s++) {
    if (wall[s] || label[s] !== -1) continue
    const id = comps.length
    stack.length = 0
    stack.push(s)
    label[s] = id
    let minx = GW, miny = GH, maxx = 0, maxy = 0, area = 0, border = false
    while (stack.length) {
      const p = stack.pop() as number
      const x = p % GW
      const y = (p / GW) | 0
      area++
      if (x < minx) minx = x
      if (x > maxx) maxx = x
      if (y < miny) miny = y
      if (y > maxy) maxy = y
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) border = true
      if (x > 0 && !wall[p - 1] && label[p - 1] === -1) { label[p - 1] = id; stack.push(p - 1) }
      if (x < GW - 1 && !wall[p + 1] && label[p + 1] === -1) { label[p + 1] = id; stack.push(p + 1) }
      if (y > 0 && !wall[p - GW] && label[p - GW] === -1) { label[p - GW] = id; stack.push(p - GW) }
      if (y < GH - 1 && !wall[p + GW] && label[p + GW] === -1) { label[p + GW] = id; stack.push(p + GW) }
    }
    comps.push({ minx, miny, maxx, maxy, area, border })
  }

  // 房间筛选：排除贴边的室外背景；保留面积在合理区间的连通域
  const minArea = N * 0.0025
  const maxArea = N * 0.5
  const exterior = comps.slice().sort((a, b) => b.area - a.area)[0]
  let rooms = comps.filter((c) => c !== exterior && !c.border && c.area >= minArea && c.area <= maxArea)
  if (rooms.length === 0) {
    rooms = comps.filter((c) => c !== exterior && c.area >= minArea && c.area <= maxArea)
  }
  rooms.sort((a, b) => b.area - a.area)
  rooms = rooms.slice(0, 24)

  // 与编辑器底图绘制保持一致：底图被拉伸铺满 MAP_W×MAP_H，这里也按"拉伸"映射，
  // 保证识别出的房间与底图完全对齐（之前用等比居中导致错位）。
  const sx = MAP_W / GW
  const sy = MAP_H / GH

  const polys: Point[][] = []
  for (const c of rooms) {
    // 外接矩形少量回扩，贴合墙内沿
    const gx0 = Math.max(0, c.minx - EXP)
    const gy0 = Math.max(0, c.miny - EXP)
    const gx1 = Math.min(GW - 1, c.maxx + EXP)
    const gy1 = Math.min(GH - 1, c.maxy + EXP)
    const x = gx0 * sx + 3
    const y = gy0 * sy + 3
    const w = (gx1 - gx0 + 1) * sx - 6
    const h = (gy1 - gy0 + 1) * sy - 6
    if (w < 26 || h < 22) continue // 过小的可能是壁橱/误检，跳过
    // 过滤细长条：双层外墙/阳台栏杆之间的夹缝常被误判成房间
    const long = Math.max(w, h), short = Math.min(w, h)
    if (short < 46 && long / short > 3.6) continue
    polys.push([
      { x: Math.round(x), y: Math.round(y) },
      { x: Math.round(x + w), y: Math.round(y) },
      { x: Math.round(x + w), y: Math.round(y + h) },
      { x: Math.round(x), y: Math.round(y + h) },
    ])
  }
  return polys
}

function otsu(hist: number[], total: number): number {
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, maxVar = -1, thr = 127
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > maxVar) { maxVar = v; thr = t }
  }
  return thr
}

// 墙骨架：取"黑墨"的最大 8-连通块(及与之同量级的大块)作为墙，丢弃漂浮的家具/文字噪声。
// 以墙为房间边缘，室内家具不再把房间切碎。
function wallSkeleton(dark: Uint8Array, GW: number, GH: number): Uint8Array {
  const N = GW * GH
  const label = new Int32Array(N).fill(-1)
  const sizes: number[] = []
  const stack: number[] = []
  for (let s = 0; s < N; s++) {
    if (!dark[s] || label[s] !== -1) continue
    const id = sizes.length
    let area = 0
    stack.length = 0
    stack.push(s); label[s] = id
    while (stack.length) {
      const p = stack.pop() as number
      area++
      const x = p % GW, y = (p / GW) | 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue
        const q = ny * GW + nx
        if (dark[q] && label[q] === -1) { label[q] = id; stack.push(q) }
      }
    }
    sizes.push(area)
  }
  if (sizes.length === 0) return dark
  let maxA = 0
  for (const a of sizes) if (a > maxA) maxA = a
  // 保留最大块及其同量级的大块(≥15% 最大块)，兜住墙骨架被门洞断成两大段的情况
  const keep = new Uint8Array(sizes.length)
  for (let i = 0; i < sizes.length; i++) keep[i] = sizes[i] >= maxA * 0.15 ? 1 : 0
  const out = new Uint8Array(N)
  for (let i = 0; i < N; i++) if (label[i] >= 0 && keep[label[i]]) out[i] = 1
  return out
}

function erode(mask: Uint8Array, GW: number, GH: number, iters: number): Uint8Array {
  let cur = mask
  for (let k = 0; k < iters; k++) {
    const nx = new Uint8Array(cur.length)
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x
        if (!cur[i]) { nx[i] = 0; continue }
        const up = y > 0 ? cur[i - GW] : 1
        const dn = y < GH - 1 ? cur[i + GW] : 1
        const lf = x > 0 ? cur[i - 1] : 1
        const rt = x < GW - 1 ? cur[i + 1] : 1
        nx[i] = (up && dn && lf && rt) ? 1 : 0
      }
    }
    cur = nx
  }
  return cur
}

function dilate(mask: Uint8Array, GW: number, GH: number, iters: number): Uint8Array {
  let cur = mask
  for (let k = 0; k < iters; k++) {
    const nx = new Uint8Array(cur.length)
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x
        if (cur[i]) { nx[i] = 1; continue }
        if ((x > 0 && cur[i - 1]) || (x < GW - 1 && cur[i + 1]) || (y > 0 && cur[i - GW]) || (y < GH - 1 && cur[i + GW])) nx[i] = 1
      }
    }
    cur = nx
  }
  return cur
}

function loadImage(src: string): Promise<HTMLImageElement> {  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
