import type { CollarActivity } from './collar'

const clipPatterns: Record<CollarActivity, RegExp> = {
  rest: /idle|rest|standing|静止/i,
  walk: /walk|走|步行/i,
  run: /run|gallop|跑/i,
  shake: /shake|抖|甩/i,
  unknown: /$a/,
}

export function matchingClip<T extends { name: string }>(clips: T[], activity: CollarActivity): T | undefined {
  return activity === 'unknown' ? undefined : clips.find((clip) => clipPatterns[activity].test(clip.name))
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
