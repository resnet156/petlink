import type { AnimationClip, KeyframeTrack } from 'three'

const basename = (name: string) => name.slice(name.lastIndexOf('|') + 1)

function sameValues(left: ArrayLike<unknown>, right: ArrayLike<unknown>): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index++) {
    if (!Object.is(left[index], right[index])) return false
  }
  return true
}

function sameTrack(left: KeyframeTrack, right: KeyframeTrack): boolean {
  return left.name === right.name
    && left.ValueTypeName === right.ValueTypeName
    && left.getInterpolation() === right.getInterpolation()
    && sameValues(left.times, right.times)
    && sameValues(left.values, right.values)
}

function sameAnimation(left: AnimationClip, right: AnimationClip): boolean {
  return Object.is(left.duration, right.duration)
    && left.blendMode === right.blendMode
    && left.tracks.length === right.tracks.length
    && left.tracks.every((track, index) => sameTrack(track, right.tracks[index]))
}

/** Remove duplicate exports only; keep distinct motions even when their basenames collide.
 * Input objects are retained unchanged, and a bare name replaces its prefixed duplicate in place. */
export function deduplicatePetClips(clips: AnimationClip[]): AnimationClip[] {
  const result: AnimationClip[] = []
  const indicesByName = new Map<string, number[]>()
  for (const clip of clips) {
    const name = basename(clip.name)
    const indices = indicesByName.get(name) ?? []
    const duplicate = indices.find((index) => sameAnimation(result[index], clip))
    if (duplicate === undefined) {
      indices.push(result.length)
      indicesByName.set(name, indices)
      result.push(clip)
    } else if (clip.name === name && result[duplicate].name !== name) {
      result[duplicate] = clip
    }
  }
  return result
}
