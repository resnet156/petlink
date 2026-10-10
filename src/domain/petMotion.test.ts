import { describe, expect, it } from 'vitest'
import { matchingClip, wholeModelMotion } from './petMotion'

describe('real model motion', () => {
  it('prefers named source clips and never plays an idle clip while offline', () => {
    const walk = { name: 'WalkCycle' }
    const idle = { name: 'Idle' }
    expect(matchingClip([idle, walk], 'walk')).toBe(walk)
    expect(matchingClip([idle, walk], 'shake')).toBeUndefined()
    expect(matchingClip([idle, walk], 'unknown')).toBeUndefined()
  })

  it('holds the previous pose offline and stays still at rest', () => {
    expect(wholeModelMotion('unknown', 12)).toBeNull()
    expect(wholeModelMotion('rest', 12)).toEqual({ y: 0, pitch: 0, yaw: 0, roll: 0 })
  })

  it('uses bounded whole-object response without planar displacement or skeleton joints', () => {
    for (const activity of ['walk', 'run', 'shake'] as const) {
      for (let time = 0; time < 6; time += .02) {
        const pose = wholeModelMotion(activity, time)!
        expect(Object.keys(pose)).toEqual(['y', 'pitch', 'yaw', 'roll'])
        expect(pose.y).toBeGreaterThanOrEqual(0)
        expect(pose.y).toBeLessThanOrEqual(.09)
        expect(Math.abs(pose.yaw)).toBeLessThanOrEqual(.17)
      }
      expect(wholeModelMotion(activity, 0)).not.toEqual(wholeModelMotion(activity, .3))
    }
  })
})
