import { describe, it, expect } from 'vitest'
import { ambianceFor } from './ambiance'

describe('ambianceFor', () => {
  it('白天色罩为透明、非夜间', () => {
    const a = ambianceFor(13)
    expect(a.tintOpacity).toBe(0)
    expect(a.night).toBe(false)
    expect(a.label).toBe('白天')
  })

  it('夜间为暗色罩、强灯光、night=true', () => {
    const a = ambianceFor(23)
    expect(a.night).toBe(true)
    expect(a.tintOpacity).toBeGreaterThan(0.2)
    expect(a.glowOpacity).toBeGreaterThan(0.5)
    expect(a.label).toBe('夜间')
  })

  it('清晨/傍晚为暖色罩', () => {
    expect(ambianceFor(7).label).toBe('清晨')
    expect(ambianceFor(18).label).toBe('傍晚')
    expect(ambianceFor(18).tintOpacity).toBeGreaterThan(0)
  })

  it('小时数越界也能归一化', () => {
    expect(ambianceFor(0).night).toBe(true)
    expect(ambianceFor(24).night).toBe(true)
    expect(ambianceFor(-1).night).toBe(true)
  })
})
