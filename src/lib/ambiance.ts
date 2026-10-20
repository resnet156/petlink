/** 根据一天中的小时数推导地图的光照氛围（昼夜）。纯函数，便于测试。 */
export type Ambiance = {
  /** 地图底色 */
  bg: string
  /** 全图色罩颜色 */
  tint: string
  /** 全图色罩不透明度（白天为 0，夜晚最强） */
  tintOpacity: number
  /** 宠物所在房间的灯光颜色 */
  glow: string
  /** 房间灯光强度 */
  glowOpacity: number
  /** 是否夜间（供文案/样式判断） */
  night: boolean
  /** 氛围文案 */
  label: string
}

export function ambianceFor(hour: number): Ambiance {
  const h = ((hour % 24) + 24) % 24
  if (h >= 5 && h < 10)
    return { bg: '#fbf6ec', tint: '#ffcf98', tintOpacity: 0.1, glow: '#fff2d2', glowOpacity: 0.4, night: false, label: '清晨' }
  if (h >= 10 && h < 17)
    return { bg: '#f4f7f3', tint: '#ffffff', tintOpacity: 0, glow: '#fffbe9', glowOpacity: 0.28, night: false, label: '白天' }
  if (h >= 17 && h < 20)
    return { bg: '#efe4da', tint: '#ff9d5c', tintOpacity: 0.16, glow: '#ffe0ab', glowOpacity: 0.5, night: false, label: '傍晚' }
  return { bg: '#2b3e4d', tint: '#17283a', tintOpacity: 0.28, glow: '#ffe6a0', glowOpacity: 0.85, night: true, label: '夜间' }
}
