import * as THREE from 'three'
import type { CollarActivity } from '@/domain/collar'
import { matchingClip, wholeModelMotion, type PetClipMap } from '@/domain/petMotion'

export type PetMotionMode = 'frozen' | 'source-clip' | 'whole-model'
export type PetMotionState = { mode: PetMotionMode; clip: string | null }

/** Optional proportions are applied to copied scale tracks as well as the bind pose,
 * so an animation cannot overwrite them and frame updates cannot multiply them again. */
export function preparePetClips(root: THREE.Object3D, clips: THREE.AnimationClip[], headScale = 1) {
  const factor = Number.isFinite(headScale) ? THREE.MathUtils.clamp(headScale, .8, 1.5) : 1
  if (factor === 1) return clips
  const heads = new Set<THREE.Object3D>()
  root.traverse((object) => {
    if (object instanceof THREE.Bone && /(^|[_.:])head$/i.test(object.name)) heads.add(object)
  })
  if (!heads.size) return clips
  for (const head of heads) head.scale.multiplyScalar(factor)
  return clips.map((source) => {
    const clip = source.clone()
    for (const track of clip.tracks) {
      const binding = THREE.PropertyBinding.parseTrackName(track.name)
      if (binding.propertyName !== 'scale' || binding.propertyIndex !== undefined) continue
      const node = THREE.PropertyBinding.findNode(root, binding.nodeName)
      if (!(node instanceof THREE.Object3D) || !heads.has(node)) continue
      // Includes cubic-spline tangents: multiplying all values preserves interpolation.
      for (let index = 0; index < track.values.length; index++) track.values[index] *= factor
    }
    return clip
  })
}

/** AnimationMixer / weighted actions follow Three.js's skeletal blending example.
 * https://threejs.org/examples/webgl_animation_skinning_blending.html
 * Explicit weight interpolation also preserves continuity when an IMU event interrupts a fade.
 */
export class PetAnimationController {
  readonly mixer: THREE.AnimationMixer
  readonly clips: THREE.AnimationClip[]
  private readonly actions = new Map<THREE.AnimationClip, THREE.AnimationAction>()
  private readonly weights = new Map<THREE.AnimationAction, number>()
  private transition: { elapsed: number; from: Map<THREE.AnimationAction, number> } | null = null
  private target: THREE.AnimationAction | null = null
  private elapsed = 0
  private disposed = false
  private state: PetMotionState = { mode: 'frozen', clip: null }

  constructor(private readonly root: THREE.Object3D, private readonly motionRoot: THREE.Object3D, clips: THREE.AnimationClip[], private readonly fadeSeconds = .28) {
    this.mixer = new THREE.AnimationMixer(root)
    this.clips = clips.filter((clip) => Number.isFinite(clip.duration) && clip.duration > 0 && clip.tracks.length > 0)
  }

  private select(clip: THREE.AnimationClip) {
    let next = this.actions.get(clip)
    if (!next) {
      next = this.mixer.clipAction(clip)
      this.actions.set(clip, next)
    }
    if (next === this.target) return
    const hasPose = [...this.weights.values()].some((weight) => weight > 0)
    if (!this.weights.has(next)) {
      next.reset().setLoop(THREE.LoopRepeat, Infinity).setEffectiveTimeScale(1).setEffectiveWeight(0).play()
      this.weights.set(next, 0)
    }
    next.enabled = true
    next.paused = false
    this.target = next
    this.transition = hasPose ? { elapsed: 0, from: new Map(this.weights) } : null
    if (!hasPose) { this.weights.set(next, 1); next.setEffectiveWeight(1) }
  }

  update(activity: CollarActivity, deltaSeconds: number, mapping?: PetClipMap): PetMotionState {
    if (this.disposed) return this.state
    if (activity === 'unknown') {
      // Do not advance mixer time, transitions, procedural offsets, or bone transforms.
      this.state = { mode: 'frozen', clip: this.state.clip }
      return this.state
    }
    const delta = Number.isFinite(deltaSeconds) ? THREE.MathUtils.clamp(deltaSeconds, 0, .1) : 0
    this.elapsed += delta
    const clip = matchingClip(this.clips, activity, mapping)
    if (clip) {
      this.select(clip)
      if (this.transition) {
        this.transition.elapsed += delta
        const progress = this.fadeSeconds <= 0 ? 1 : Math.min(this.transition.elapsed / this.fadeSeconds, 1)
        const eased = progress * progress * (3 - 2 * progress)
        for (const [action, from] of this.transition.from) {
          const weight = THREE.MathUtils.lerp(from, action === this.target ? 1 : 0, eased)
          this.weights.set(action, weight)
          action.setEffectiveWeight(weight)
        }
        if (progress === 1) {
          for (const [action, weight] of this.weights) if (weight === 0) { action.stop(); this.weights.delete(action) }
          this.transition = null
        }
      }
      this.mixer.update(delta)
    }
    // A missing clip retains the last skeletal pose. It never substitutes an unrelated
    // eating/jumping clip or returns to a T-pose merely because a shake clip is absent.
    const pose = clip ? { y: 0, pitch: 0, yaw: 0, roll: 0 } : wholeModelMotion(activity, this.elapsed)!
    const blend = 1 - Math.exp(-delta / .09)
    this.motionRoot.position.y = THREE.MathUtils.lerp(this.motionRoot.position.y, pose.y, blend)
    this.motionRoot.rotation.x = THREE.MathUtils.lerp(this.motionRoot.rotation.x, pose.pitch, blend)
    this.motionRoot.rotation.y = THREE.MathUtils.lerp(this.motionRoot.rotation.y, pose.yaw, blend)
    this.motionRoot.rotation.z = THREE.MathUtils.lerp(this.motionRoot.rotation.z, pose.roll, blend)
    this.state = { mode: clip ? 'source-clip' : 'whole-model', clip: clip?.name ?? null }
    return this.state
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.root)
    this.actions.clear()
    this.weights.clear()
    this.transition = null
  }
}
