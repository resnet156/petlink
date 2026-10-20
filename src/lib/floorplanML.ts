import * as ort from 'onnxruntime-web'
import { MAP_W, MAP_H } from '@/domain/geometry'
import type { Point } from '@/domain/types'

/**
 * 基于深度模型的户型房间识别（ResNet34-UNet，CubiCasa5K 训练，4 类：
 * 0=地面 1=墙 2=门 3=窗）。模型只学"墙/门/窗"的结构，天然忽略室内家具，
 * 因此按墙精确分房间。模型在浏览器本地用 onnxruntime-web(WASM) 推理，
 * 图片不出本机。模型/运行时都是同源静态资源，首次使用懒加载并缓存。
 *
 * 失败时抛错，调用方回退到启发式识别。
 */

// 资源前缀：Web 构建为 '/'，Electron 构建为 './'（file:// 相对加载），两端都能取到模型与 wasm
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
const MODEL_URL = `${BASE}models/floorplan.int8.onnx`
const S = 512
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let sessionP: Promise<ort.InferenceSession> | null = null

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionP) {
    ort.env.wasm.wasmPaths = `${BASE}ort/`
    ort.env.wasm.numThreads = 1 // 单线程，免去跨源隔离(COOP/COEP)要求
    sessionP = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    }).catch((e) => {
      sessionP = null
      throw e
    })
  }
  return sessionP
}

/** 模型是否就绪（已缓存会话）。用于 UI 判断是否需要提示"首次下载模型"。 */
export function isMLReady(): boolean {
  return sessionP !== null
}

type WallMask = { wall: Uint8Array; left: number; top: number; iw: number; ih: number }

/** 跑模型得到墙屏障掩码(墙|门|窗)，512 letterbox 空间，inner 区域对应整张原图。 */
async function runWallMask(dataUrl: string): Promise<WallMask> {
  const img = await loadImage(dataUrl)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  const scale = Math.min(S / w, S / h)
  const iw = Math.max(1, Math.round(w * scale))
  const ih = Math.max(1, Math.round(h * scale))
  const left = (S - iw) >> 1
  const top = (S - ih) >> 1

  // letterbox 到 512×512，留白用 ImageNet 均值色（归一化后=0，与训练一致）
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d ctx')
  ctx.fillStyle = `rgb(${Math.round(MEAN[0] * 255)},${Math.round(MEAN[1] * 255)},${Math.round(MEAN[2] * 255)})`
  ctx.fillRect(0, 0, S, S)
  ctx.drawImage(img, left, top, iw, ih)
  const { data } = ctx.getImageData(0, 0, S, S)

  const plane = S * S
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    input[i] = (data[i * 4] / 255 - MEAN[0]) / STD[0]
    input[plane + i] = (data[i * 4 + 1] / 255 - MEAN[1]) / STD[1]
    input[2 * plane + i] = (data[i * 4 + 2] / 255 - MEAN[2]) / STD[2]
  }

  const session = await getSession()
  const tensor = new ort.Tensor('float32', input, [1, 3, S, S])
  const out = await session.run({ [session.inputNames[0]]: tensor })
  const logits = out[session.outputNames[0]].data as Float32Array // (1,4,512,512)

  // argmax → 墙屏障掩码(墙|门|窗)。
  const wall = new Uint8Array(plane)
  for (let i = 0; i < plane; i++) {
    let best = 0, bv = logits[i]
    for (let k = 1; k < 4; k++) { const v = logits[k * plane + i]; if (v > bv) { bv = v; best = k } }
    if (best >= 1) wall[i] = 1
  }
  closeMask(wall, S, S, 2) // 封住发丝级断口
  return { wall, left, top, iw, ih }
}

function buildOverlay(wall: Uint8Array, left: number, top: number, iw: number, ih: number): string {
  const c = document.createElement('canvas')
  c.width = iw
  c.height = ih
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d ctx')
  const im = ctx.createImageData(iw, ih)
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const src = (top + y) * S + (left + x)
      const di = (y * iw + x) * 4
      if (wall[src]) {
        im.data[di] = 22; im.data[di + 1] = 125; im.data[di + 2] = 109; im.data[di + 3] = 235 // 墨绿墙线
      } else {
        im.data[di + 3] = 0 // 透明
      }
    }
  }
  ctx.putImageData(im, 0, 0)
  return c.toDataURL('image/png')
}

/**
 * 一次推理同时产出：墙体参考层图 + 据墙切出的房间矩形（初步，供用户拖拽调整）。
 * 模型本机运行、图片不外传。
 */
export async function detectFloorplan(dataUrl: string): Promise<{ overlayUrl: string; polys: Point[][] }> {
  const { wall, left, top, iw, ih } = await runWallMask(dataUrl)
  const overlayUrl = buildOverlay(wall, left, top, iw, ih)
  const polys = extractRooms(wall, left, top, iw, ih)
  if ((globalThis as unknown as { __FP_DEBUG?: boolean }).__FP_DEBUG) {
    let wc = 0; for (let i = 0; i < wall.length; i++) wc += wall[i]
    // eslint-disable-next-line no-console
    console.log(`[FP] detectFloorplan wall=${wc} inner=${iw}x${ih} rooms=${polys.length}`)
  }
  return { overlayUrl, polys }
}

export async function detectWallsOverlay(dataUrl: string): Promise<{ url: string; width: number; height: number }> {
  const { wall, left, top, iw, ih } = await runWallMask(dataUrl)
  return { url: buildOverlay(wall, left, top, iw, ih), width: iw, height: ih }
}

export async function detectRoomsML(dataUrl: string): Promise<Point[][]> {
  const { wall, left, top, iw, ih } = await runWallMask(dataUrl)
  return extractRooms(wall, left, top, iw, ih)
}

/**
 * 从干净的墙掩码里提取房间矩形。模型墙里没有家具，所以用"矩形生长"：以地面点为种子，
 * 向四周扩张，直到某条边多半是墙(撞上贯穿墙)或越界才停。墙线上的小断口/门洞只占边线
 * 一小段，不会使生长停下，于是矩形严格以墙为界、能跨过门洞缺口与家具，得到完整房间。
 */
function extractRooms(wall: Uint8Array, left: number, top: number, iw: number, ih: number): Point[][] {
  closeMask(wall, S, S, 2) // 先把墙线细断口连实
  const inWall = (x: number, y: number) => {
    if (x < left || y < top || x >= left + iw || y >= top + ih) return true
    return wall[y * S + x] === 1
  }
  // 户型边界 = 所有墙像素的外接框（墙是最外层结构；尺寸标注/文字不在墙掩码里）。
  // 房间一律裁进这个框，保证不超出户型图边界。
  let bx0 = left + iw, by0 = top + ih, bx1 = left, by1 = top
  for (let y = top; y < top + ih; y++) for (let x = left; x < left + iw; x++) {
    if (wall[y * S + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y }
  }
  if (bx1 <= bx0 || by1 <= by0) { bx0 = left; by0 = top; bx1 = left + iw - 1; by1 = top + ih - 1 }

  // 以地面网格点为种子，向四周生长矩形：某条边碰到墙(墙占比 > STOP)或到边界则该方向停。
  // STOP 取小值→一碰到墙就停，房间严格限制在单个墙围格内，不会横跨墙体/把多间并成一大间。
  const STOP = 0.12
  const step = Math.max(4, Math.round(Math.min(iw, ih) / 42))
  type Rect = { x0: number; y0: number; x1: number; y1: number; area: number }
  const cand: Rect[] = []
  for (let gy = by0 + step; gy < by1 - step; gy += step) {
    for (let gx = bx0 + step; gx < bx1 - step; gx += step) {
      if (inWall(gx, gy)) continue
      let x0 = gx, x1 = gx, y0 = gy, y1 = gy
      let L = true, R = true, T = true, B = true, guard = 0
      while ((L || R || T || B) && guard++ < iw + ih) {
        if (R) { const nx = x1 + 1; let w = 0; const n = y1 - y0 + 1; for (let y = y0; y <= y1; y++) if (inWall(nx, y)) w++; if (nx >= bx1 || w / n > STOP) R = false; else x1 = nx }
        if (L) { const nx = x0 - 1; let w = 0; const n = y1 - y0 + 1; for (let y = y0; y <= y1; y++) if (inWall(nx, y)) w++; if (nx <= bx0 || w / n > STOP) L = false; else x0 = nx }
        if (B) { const ny = y1 + 1; let w = 0; const n = x1 - x0 + 1; for (let x = x0; x <= x1; x++) if (inWall(x, ny)) w++; if (ny >= by1 || w / n > STOP) B = false; else y1 = ny }
        if (T) { const ny = y0 - 1; let w = 0; const n = x1 - x0 + 1; for (let x = x0; x <= x1; x++) if (inWall(x, ny)) w++; if (ny <= by0 || w / n > STOP) T = false; else y0 = ny }
      }
      // 裁进户型边界框，保证不超出
      x0 = Math.max(x0, bx0); y0 = Math.max(y0, by0); x1 = Math.min(x1, bx1); y1 = Math.min(y1, by1)
      cand.push({ x0, y0, x1, y1, area: (x1 - x0 + 1) * (y1 - y0 + 1) })
    }
  }

  const innerArea = iw * ih
  const minArea = innerArea * 0.006
  const maxArea = innerArea * 0.4
  // 内部是否有墙横穿（某条内部行/列大半是墙）→ 说明矩形横跨了墙体，判为非法
  const crossesWall = (r: Rect) => {
    const m = 3
    for (let x = r.x0 + m; x <= r.x1 - m; x += 2) {
      let w = 0, n = 0
      for (let y = r.y0 + m; y <= r.y1 - m; y++) { n++; if (inWall(x, y)) w++ }
      if (n > 0 && w / n > 0.55) return true
    }
    for (let y = r.y0 + m; y <= r.y1 - m; y += 2) {
      let w = 0, n = 0
      for (let x = r.x0 + m; x <= r.x1 - m; x++) { n++; if (inWall(x, y)) w++ }
      if (n > 0 && w / n > 0.55) return true
    }
    return false
  }
  cand.sort((a, b) => b.area - a.area)
  const kept: Rect[] = []
  for (const r of cand) {
    if (r.area < minArea || r.area > maxArea) continue
    if (crossesWall(r)) continue // 不允许横跨墙体
    // 不允许重叠：与任何已选房间有实质重叠即丢弃（相邻房间以墙相隔，本就不重叠）
    let overlap = false
    for (const k of kept) {
      const ox = Math.max(0, Math.min(r.x1, k.x1) - Math.max(r.x0, k.x0))
      const oy = Math.max(0, Math.min(r.y1, k.y1) - Math.max(r.y0, k.y0))
      if (ox * oy > 0.03 * Math.min(r.area, k.area)) { overlap = true; break }
    }
    if (!overlap) kept.push(r)
  }
  kept.sort((a, b) => b.area - a.area)
  const rooms = kept.slice(0, 24)

  const sx = MAP_W / iw
  const sy = MAP_H / ih
  const polys: Point[][] = []
  for (const r of rooms) {
    const x = (r.x0 - left) * sx + 3
    const y = (r.y0 - top) * sy + 3
    const wpx = (r.x1 - r.x0 + 1) * sx - 6
    const hpx = (r.y1 - r.y0 + 1) * sy - 6
    if (wpx < 24 || hpx < 20) continue
    polys.push([
      { x: Math.round(x), y: Math.round(y) },
      { x: Math.round(x + wpx), y: Math.round(y) },
      { x: Math.round(x + wpx), y: Math.round(y + hpx) },
      { x: Math.round(x), y: Math.round(y + hpx) },
    ])
  }
  return polys
}

function closeMask(mask: Uint8Array, GW: number, GH: number, iters: number): void {
  const dil = morph(mask, GW, GH, iters, true)
  const ero = morph(dil, GW, GH, iters, false)
  mask.set(ero)
}

function morph(mask: Uint8Array, GW: number, GH: number, iters: number, dilate: boolean): Uint8Array {
  let cur = mask
  for (let k = 0; k < iters; k++) {
    const nx = new Uint8Array(cur.length)
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const i = y * GW + x
        const nb = (x > 0 && cur[i - 1]) || (x < GW - 1 && cur[i + 1]) || (y > 0 && cur[i - GW]) || (y < GH - 1 && cur[i + GW])
        if (dilate) nx[i] = cur[i] || nb ? 1 : 0
        else {
          const edge = x === 0 || y === 0 || x === GW - 1 || y === GH - 1
          const allNb = (x > 0 ? cur[i - 1] : 1) && (x < GW - 1 ? cur[i + 1] : 1) && (y > 0 ? cur[i - GW] : 1) && (y < GH - 1 ? cur[i + GW] : 1)
          nx[i] = cur[i] && (edge || allNb) ? 1 : 0
        }
      }
    }
    cur = nx
  }
  return cur
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
