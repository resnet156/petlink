import { describe, expect, it } from 'vitest'
import { matchingClip, PET_CLIP_ACTIVITIES, wholeModelMotion, type PetClipActivity, type PetClipMap } from './petMotion'

describe('real model motion', () => {
  it('prefers named source clips and never plays an idle clip while offline', () => {
    const walk = { name: 'WalkCycle' }
    const idle = { name: 'Idle' }
    expect(matchingClip([idle, walk], 'walk')).toBe(walk)
    expect(matchingClip([idle, walk], 'shake')).toBeUndefined()
    expect(matchingClip([idle, walk], 'unknown')).toBeUndefined()
  })

  it.each<[PetClipActivity, string]>([
    ['rest', 'Idle'], ['rest', 'Rest'], ['rest', 'Standing'], ['rest', 'Survey'],
    ['walk', 'Walk'], ['walk', 'Walking'], ['run', 'Run'], ['run', 'Running'],
    ['run', 'Gallop'], ['shake', 'Shake'], ['shake', 'Shaking'],
    ['rest', 'Armature|Survey.001'], ['walk', 'Dog_Walking_Loop'], ['walk', 'WalkCycle'],
    ['walk', 'dog:walkcycle_02'], ['run', 'Rig:RUNNING-loop'], ['run', 'Gallop001'],
    ['shake', 'Body.Shaking'], ['rest', '静止'], ['walk', '步行'], ['run', '跑'], ['shake', '抖'],
  ])('recognizes the %s alias %s at a name boundary', (activity, name) => {
    const clip = { name }
    expect(matchingClip([clip], activity)).toBe(clip)
  })

  it('prefers an explicit exact clip name, even when it has no automatic alias', () => {
    const automatic = { name: 'Walk' }
    const chosen = { name: 'Action.002' }
    const mapping: PetClipMap = { walk: chosen.name }
    expect(matchingClip([automatic, chosen], 'walk', mapping)).toBe(chosen)
    expect(matchingClip([chosen, automatic], 'walk', mapping)).toBe(chosen)
    expect(matchingClip([{ name: 'WalkStop' }], 'walk', { walk: 'WalkStop' })?.name).toBe('WalkStop')
  })

  it('disables an explicitly empty mapping and falls back when a saved selection no longer exists', () => {
    const automatic = { name: 'Walk' }
    expect(matchingClip([automatic], 'walk', { walk: '' })).toBeUndefined()
    expect(matchingClip([automatic], 'walk', { walk: 'Removed clip' })).toBe(automatic)
    expect(matchingClip([automatic], 'walk', { rest: '' })).toBe(automatic)
    expect(matchingClip([{ name: 'Action.002' }], 'walk', { walk: 'Removed clip' })).toBeUndefined()
    expect(matchingClip([], 'walk', { walk: 'Walk' })).toBeUndefined()
  })

  it('prefers a bare alias over prefixed clips and keeps source order for equal matches', () => {
    const prefixed = { name: 'Dog_Walk_Loop' }
    const alternative = { name: 'RigWalkingCycle' }
    const exact = { name: 'Walking' }
    expect(matchingClip([prefixed, exact, alternative], 'walk')).toBe(exact)
    expect(matchingClip([prefixed, alternative], 'walk')).toBe(prefixed)
    expect(matchingClip([alternative, prefixed], 'walk')).toBe(alternative)
  })

  it('does not mistake unrelated substrings or transition clips for an activity cycle', () => {
    for (const name of ['Runway', 'Brunch', 'WalkStop', 'Walking_Stop', 'walkstop', 'WalkStart', 'IdleToWalk', 'RunToWalk', 'SurveyRun', 'Rig_Walk_Transition']) {
      const clip = { name }
      expect(matchingClip([clip], 'walk')).toBeUndefined()
      expect(matchingClip([clip], 'run')).toBeUndefined()
    }
  })

  it('never chooses any explicit or automatic clip without measured activity', () => {
    const clips = [{ name: 'Idle' }, { name: 'Walk' }, { name: 'Action.002' }]
    const mapping: PetClipMap = { rest: 'Idle', walk: 'Action.002', run: 'Action.002', shake: 'Action.002' }
    expect(matchingClip(clips, 'unknown', mapping)).toBeUndefined()
    expect(PET_CLIP_ACTIVITIES).toEqual(['rest', 'walk', 'run', 'shake'])
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
