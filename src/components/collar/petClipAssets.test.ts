import { AnimationClip, InterpolateDiscrete, NumberKeyframeTrack } from 'three'
import { describe, expect, it } from 'vitest'
import { deduplicatePetClips } from './petClipAssets'

const track = (name = 'Bone.position[x]', values = [0, 1], times = [0, 1]) =>
  new NumberKeyframeTrack(name, new Float32Array(times), new Float32Array(values))
const clip = (name: string) => new AnimationClip(name, 1, [track()])

describe('pet animation asset deduplication', () => {
  it('prefers bare names for identical exports and preserves first occurrence order without mutation', () => {
    const prefixedWalk = clip('AnimalArmature|Walk')
    const bareRun = clip('Run')
    const bareWalk = clip('Walk')
    const prefixedRun = clip('Scene|AnimalArmature|Run')
    const source = [prefixedWalk, bareRun, bareWalk, prefixedRun]
    const originalNames = source.map((value) => value.name)
    expect(deduplicatePetClips(source)).toEqual([bareWalk, bareRun])
    expect(deduplicatePetClips(source)[0]).toBe(bareWalk)
    expect(deduplicatePetClips(source)[1]).toBe(bareRun)
    expect(source.map((value) => value.name)).toEqual(originalNames)
    expect(source).toHaveLength(4)
    expect(deduplicatePetClips([prefixedWalk, clip('Other|Walk')])[0]).toBe(prefixedWalk)
  })

  it('retains same-basename animations when duration or any ordered track data differs', () => {
    const original = new AnimationClip('AnimalArmature|Walk', 1, [track(), track('Tail.rotation[y]')])
    const changedDuration = original.clone(); changedDuration.duration = 2
    const changedName = original.clone(); changedName.tracks[0].name = 'Other.position[x]'
    const changedInterpolation = original.clone(); changedInterpolation.tracks[0].setInterpolation(InterpolateDiscrete)
    const changedTime = original.clone(); changedTime.tracks[0].times[1] = .5
    const changedValue = original.clone(); changedValue.tracks[0].values[1] = 1.000001
    const changedOrder = original.clone(); changedOrder.tracks.reverse()
    const changedLength = original.clone(); changedLength.tracks.pop()
    const variants = [original, changedDuration, changedName, changedInterpolation, changedTime, changedValue, changedOrder, changedLength]
    variants.slice(1).forEach((value) => { value.name = 'Walk' })
    expect(deduplicatePetClips(variants)).toEqual(variants)
    const bareDuplicate = original.clone(); bareDuplicate.name = 'Walk'
    expect(deduplicatePetClips([...variants, bareDuplicate])).toEqual([bareDuplicate, ...variants.slice(1)])
  })

  it('keeps identical motion under different basenames and handles empty assets deterministically', () => {
    const walk = clip('Walk')
    const run = clip('Run')
    expect(deduplicatePetClips([walk, run, walk.clone()])).toEqual([walk, run])
    expect(deduplicatePetClips([])).toEqual([])
    const empty = new AnimationClip('Rig|Idle', 0, [])
    const bare = new AnimationClip('Idle', 0, [])
    expect(deduplicatePetClips([empty, bare])).toEqual([bare])
  })
})
