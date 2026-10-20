import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PetAnimationController, preparePetClips } from './petAnimation'

function fixture() {
  const root = new THREE.Group()
  const bone = new THREE.Bone(); bone.name = 'Leg'; root.add(bone)
  const motion = new THREE.Group(); motion.add(root)
  const constant = (name: string, value: number) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('Leg.rotation[x]', [0, 1], [value, value])])
  return { root, bone, motion, idle: constant('Idle', 0), walk: constant('Walk', 1), run: constant('Gallop', -1) }
}

describe('PetAnimationController with actual Three.js bone bindings', () => {
  it('blends poses continuously, including a transition interrupted by another IMU activity', () => {
    const { root, bone, motion, idle, walk, run } = fixture()
    const controller = new PetAnimationController(root, motion, [idle, walk, run])
    expect(controller.update('rest', .1).clip).toBe('Idle')
    controller.update('walk', .08)
    const firstBlend = bone.rotation.x
    expect(firstBlend).toBeGreaterThan(0)
    expect(firstBlend).toBeLessThan(1)
    controller.update('run', 0)
    expect(bone.rotation.x).toBeCloseTo(firstBlend)
    controller.update('run', .01)
    expect(Math.abs(bone.rotation.x - firstBlend)).toBeLessThan(.02)
    for (let index = 0; index < 4; index++) controller.update('run', .1)
    expect(bone.rotation.x).toBeCloseTo(-1)
    expect(controller.mixer.existingAction(walk)?.isRunning()).toBe(false)
    controller.dispose()
  })

  it('does not restart looping clips on repeated windows or when offline telemetry returns', () => {
    const { root, bone, motion, walk } = fixture()
    const controller = new PetAnimationController(root, motion, [walk])
    controller.update('walk', .1)
    controller.update('walk', .1)
    const action = controller.mixer.existingAction(walk)!
    expect(action.time).toBeCloseTo(.2)
    const before = [controller.mixer.time, action.time, ...bone.quaternion.toArray(), ...motion.position.toArray(), ...motion.quaternion.toArray()]
    for (let index = 0; index < 50; index++) expect(controller.update('unknown', .1).mode).toBe('frozen')
    expect([controller.mixer.time, action.time, ...bone.quaternion.toArray(), ...motion.position.toArray(), ...motion.quaternion.toArray()]).toEqual(before)
    controller.update('walk', .1)
    expect(action.time).toBeCloseTo(.3)
    expect(action.loop).toBe(THREE.LoopRepeat)
    controller.dispose()
  })

  it('freezes an in-progress blend and resumes it without resetting bone pose', () => {
    const { root, bone, motion, idle, walk } = fixture()
    const controller = new PetAnimationController(root, motion, [idle, walk])
    controller.update('rest', .1)
    controller.update('walk', .08)
    const pose = bone.quaternion.toArray()
    const time = controller.mixer.time
    controller.update('unknown', .1)
    expect(bone.quaternion.toArray()).toEqual(pose)
    expect(controller.mixer.time).toBe(time)
    controller.update('walk', 0)
    expect(bone.quaternion.toArray()).toEqual(pose)
    controller.dispose()
  })

  it('keeps the previous skeletal pose when a clip is absent and only moves the outer model', () => {
    const { root, bone, motion, walk } = fixture()
    const eating = walk.clone(); eating.name = 'Eating'
    const controller = new PetAnimationController(root, motion, [walk, eating])
    controller.update('walk', .1)
    const bonePose = bone.quaternion.toArray()
    const mixerTime = controller.mixer.time
    expect(controller.update('shake', .1)).toEqual({ mode: 'whole-model', clip: null })
    expect(controller.mixer.time).toBe(mixerTime)
    expect(bone.quaternion.toArray()).toEqual(bonePose)
    expect(motion.rotation.y).not.toBe(0)
    expect(motion.position.x).toBe(0)
    expect(motion.position.z).toBe(0)
    expect(controller.mixer.existingAction(eating)).toBeNull()
    const held = [...motion.position.toArray(), ...motion.quaternion.toArray()]
    controller.update('unknown', .1)
    expect([...motion.position.toArray(), ...motion.quaternion.toArray()]).toEqual(held)
    controller.dispose()
  })

  it('honors manual clip mapping and explicit fallback, ignoring unusable empty clips', () => {
    const { root, motion, walk } = fixture()
    walk.name = 'CustomGait'
    const empty = new THREE.AnimationClip('Walk', 1, [])
    const controller = new PetAnimationController(root, motion, [walk, empty])
    expect(controller.update('walk', .1).mode).toBe('whole-model')
    expect(controller.update('walk', .1, { walk: 'CustomGait' }).clip).toBe('CustomGait')
    expect(controller.update('walk', .1, { walk: '' }).mode).toBe('whole-model')
    controller.dispose()
    expect(controller.mixer.existingAction(walk)).toBeNull()
    controller.dispose()
  })

  it('keeps a shared mapped clip playing when the activity label changes', () => {
    const { root, motion, walk } = fixture()
    const controller = new PetAnimationController(root, motion, [walk])
    controller.update('walk', .1)
    controller.update('run', .1, { run: 'Walk' })
    expect(controller.mixer.existingAction(walk)!.time).toBeCloseTo(.2)
    controller.dispose()
  })
})

describe('optional rig proportions', () => {
  it('scales a head bone and copied scale tracks without changing the root or accumulating per frame', () => {
    const root = new THREE.Group()
    root.scale.setScalar(2)
    const head = new THREE.Bone(); head.name = 'Head'; root.add(head)
    const source = new THREE.AnimationClip('Idle', 1, [new THREE.VectorKeyframeTrack('Head.scale', [0, 1], [1, 1, 1, 1, 1, 1])])
    const prepared = preparePetClips(root, [source], 1.2)
    expect(prepared[0]).not.toBe(source)
    expect([...source.tracks[0].values]).toEqual([1, 1, 1, 1, 1, 1])
    expect(root.scale.toArray()).toEqual([2, 2, 2])
    const controller = new PetAnimationController(root, new THREE.Group(), prepared)
    for (let index = 0; index < 30; index++) controller.update('rest', .1)
    expect(head.scale.x).toBeCloseTo(1.2)
    expect(head.scale.y).toBeCloseTo(1.2)
    controller.update('unknown', .1)
    expect(head.scale.z).toBeCloseTo(1.2)
    controller.dispose()
  })

  it('keeps imported clips untouched when styling is disabled or no head bone exists', () => {
    const root = new THREE.Group()
    const clips = [new THREE.AnimationClip('Idle', 1, [])]
    expect(preparePetClips(root, clips)).toBe(clips)
    expect(preparePetClips(root, clips, 1.2)).toBe(clips)
  })
})
