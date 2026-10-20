/** 寻宠分享卡片的输入资料 */
export type ShareCardInfo = {
  name: string
  species?: string
  furColor?: string
  collarColor?: string
  /** 宠物照片 dataURL；提供则绘制照片，否则绘制形象 */
  photo?: string
  lastRoom: string
  /** 最后出现时间文案，如“3 分钟前” */
  lastSeen: string
}

function speciesEmoji(species?: string): string {
  if (!species) return '🐾'
  if (species.includes('犬') || species.includes('狗')) return '🐶'
  if (species.includes('兔')) return '🐰'
  return '🐱'
}

/** 在 canvas 上绘制寻宠分享卡片（依据宠物资料 / 照片 / 最近出现位置） */
export function drawShareCard(canvas: HTMLCanvasElement, info: ShareCardInfo) {
  const x = canvas.getContext('2d')
  if (!x) return
  const W = canvas.width
  const H = canvas.height
  x.clearRect(0, 0, W, H)
  x.fillStyle = '#2e7f75'
  x.fillRect(0, 0, W, H)
  x.fillStyle = 'rgba(255,255,255,.08)'
  x.beginPath()
  x.arc(610, 180, 210, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#fff'
  roundRect(x, 48, 48, W - 96, H - 96, 38)
  x.fill()
  x.fillStyle = '#c85f5b'
  x.font = 'bold 28px sans-serif'
  x.fillText('紧急寻宠 · LOST PET', 86, 106)
  x.fillStyle = '#20322f'
  x.font = 'bold 54px sans-serif'
  x.fillText(`帮我找找${info.name}`, 86, 176)

  // 头像区：圆底 + 照片（有则绘制）/ 形象 emoji（缺省）
  const cx = W / 2
  const cy = 350
  const r = 135
  x.fillStyle = '#fff0df'
  x.beginPath()
  x.arc(cx, cy, r, 0, Math.PI * 2)
  x.fill()
  const drawEmoji = () => {
    x.font = '150px serif'
    x.textAlign = 'center'
    x.fillStyle = '#20322f'
    x.fillText(speciesEmoji(info.species), cx, cy + 55)
    x.textAlign = 'left'
  }
  if (info.photo) {
    const img = new Image()
    img.onload = () => {
      x.save()
      x.beginPath()
      x.arc(cx, cy, r, 0, Math.PI * 2)
      x.clip()
      // cover 填充
      const scale = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight)
      const dw = img.naturalWidth * scale
      const dh = img.naturalHeight * scale
      x.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh)
      x.restore()
    }
    img.onerror = drawEmoji
    img.src = info.photo
  } else {
    drawEmoji()
  }

  const descParts = [info.species, info.furColor ? `${info.furColor}毛色` : '', info.collarColor ? `佩戴${info.collarColor}项圈` : '']
    .filter(Boolean)
    .join(' · ')
  x.fillStyle = '#20322f'
  x.font = 'bold 30px sans-serif'
  x.fillText(descParts || '家养宠物', 86, 535)
  x.fillStyle = '#6e7f79'
  x.font = '24px sans-serif'
  x.fillText(`最后出现：家附近 · ${info.lastRoom}`, 86, 585)
  x.fillText(`最后更新：${info.lastSeen}`, 86, 625)
  x.fillStyle = '#e9f4ef'
  roundRect(x, 80, 670, W - 160, 112, 24)
  x.fill()
  x.fillStyle = '#2e7f75'
  x.font = 'bold 25px sans-serif'
  x.fillText(`发现${info.name}？请点击卡片联系主人`, 108, 720)
  x.font = '20px sans-serif'
  x.fillText('PetLink 已开启走失互寻', 108, 756)
  drawFakeQR(x, 510, 682, 115)
  x.fillStyle = '#96a39f'
  x.font = '18px sans-serif'
  x.fillText('定位信息仅在走失模式期间共享', 86, 850)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawFakeQR(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const n = 9
  const cell = s / n
  ctx.fillStyle = '#fff'
  ctx.fillRect(x, y, s, s)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if ((i * j + i + j) % 3 === 0 || (i < 3 && j < 3) || (i > 5 && j < 3) || (i < 3 && j > 5)) {
        ctx.fillStyle = '#20322f'
        ctx.fillRect(x + i * cell, y + j * cell, cell * 0.84, cell * 0.84)
      }
    }
}
