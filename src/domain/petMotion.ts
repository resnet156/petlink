import type { CollarActivity } from './collar'

export const PET_CLIP_ACTIVITIES = ['rest', 'walk', 'run', 'shake'] as const
export type PetClipActivity = typeof PET_CLIP_ACTIVITIES[number]
export type PetClipMap = Partial<Record<PetClipActivity, string>>

const clipAliases: Record<PetClipActivity, readonly string[]> = {
  rest: ['idle', 'rest', 'standing', 'survey', '静止'],
  walk: ['walk', 'walking', '走', '步行'],
  run: ['run', 'running', 'gallop', '跑'],
  shake: ['shake', 'shaking', '抖', '甩'],
}
const transitionWords = new Set(['start', 'starting', 'stop', 'stopping', 'end', 'ending', 'transition', 'enter', 'exit', 'begin', 'to', 'from'])

function clipTokens(name: string): string[] {
  return name
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d+)/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9\u3400-\u9fff]+/)
    .filter(Boolean)
    .flatMap((token) => token.replace(/^(idle|rest|standing|survey|walk|walking|run|running|gallop|shake|shaking)(cycle|loop)$/, '$1 $2').split(' '))
}

/** Explicit choices use exact names; '' disables playback, and stale names fall back to aliases.
 * Automatic matching prefers a bare alias, then the first matching source clip. */
export function matchingClip<T extends { name: string }>(clips: readonly T[], activity: CollarActivity, mapping?: PetClipMap): T | undefined {
  if (activity === 'unknown') return undefined
  const selected = mapping?.[activity]
  if (selected === '') return undefined
  if (selected !== undefined) {
    const explicit = clips.find((clip) => clip.name === selected)
    if (explicit) return explicit
  }

  let best: T | undefined
  for (const clip of clips) {
    const tokens = clipTokens(clip.name)
    if (tokens.some((token) => transitionWords.has(token))) continue
    if (!tokens.some((token) => clipAliases[activity].includes(token))) continue
    if (PET_CLIP_ACTIVITIES.some((other) => other !== activity && tokens.some((token) => clipAliases[other].includes(token)))) continue
    if (clipAliases[activity].includes(clip.name.trim().toLowerCase())) return clip
    best ??= clip
  }
  return best
}

// A visual response of the whole object, never a reconstructed skeletal gait or location.
// null means retain the exact previous pose when telemetry is unavailable.
export function wholeModelMotion(activity: CollarActivity, seconds: number) {
  if (activity === 'unknown') return null
  if (activity === 'walk') return { y: .025 * (1 + Math.sin(seconds * 7)), pitch: 0, yaw: .055 * Math.sin(seconds * 3.5), roll: .018 * Math.sin(seconds * 7) }
  if (activity === 'run') return { y: .09 * Math.abs(Math.sin(seconds * 12)), pitch: .04 * Math.sin(seconds * 12), yaw: .035 * Math.sin(seconds * 6), roll: 0 }
  if (activity === 'shake') return { y: 0, pitch: 0, yaw: .17 * Math.sin(seconds * 25), roll: .03 * Math.cos(seconds * 25) }
  return { y: 0, pitch: 0, yaw: 0, roll: 0 }
}
