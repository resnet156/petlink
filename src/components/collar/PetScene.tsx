import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { CollarActivity, RoomDimensions } from '@/domain/collar'
import { matchingClip, wholeModelMotion } from '@/domain/petMotion'
import { createContactShadow } from './contactShadow'

type Props = {
  activity: CollarActivity
  color: string
  room: RoomDimensions | null
  model: ArrayBuffer | null
  viewAzimuth?: number
  onModelInfo: (info: { clips: string[]; error: string; loaded?: boolean }) => void
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
  })
}

function buildPet(color: string) {
  const root = new THREE.Group()
  const fur = new THREE.MeshStandardMaterial({ color, roughness: .9 })
  const cream = new THREE.MeshStandardMaterial({ color: '#fff1dc', roughness: .94 })
  const ink = new THREE.MeshStandardMaterial({ color: '#292d29', roughness: .35 })
  const inner = new THREE.MeshStandardMaterial({ color: '#945b42', roughness: 1 })
  const teal = new THREE.MeshStandardMaterial({ color: '#247966', roughness: .5 })
  const gold = new THREE.MeshStandardMaterial({ color: '#efbc60', metalness: .5, roughness: .3 })
  const sphere = (parent: THREE.Object3D, material: THREE.Material, position: [number, number, number], scale: [number, number, number]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const torso = new THREE.Group()
  root.add(torso)
  sphere(torso, fur, [0, .84, -.06], [.44, .45, .7])
  sphere(torso, cream, [0, .78, .33], [.35, .35, .4])
  const head = new THREE.Group()
  head.position.set(0, 1.3, .57)
  torso.add(head)
  sphere(head, fur, [0, 0, 0], [.46, .44, .43])
  sphere(head, cream, [0, -.12, .3], [.34, .24, .22])
  sphere(head, ink, [0, -.05, .51], [.1, .075, .07])
  for (const side of [-1, 1]) {
    sphere(head, ink, [side * .215, .065, .345], [.055, .065, .032])
    sphere(head, cream, [side * .201, .087, .373], [.015, .018, .009])
    sphere(head, cream, [side * .225, .18, .3], [.08, .038, .024])
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.22, .49, 3), fur)
    ear.position.set(side * .31, .41, -.005)
    ear.rotation.set(-.1, side * .3, side * -.2)
    ear.scale.z = .68
    ear.castShadow = true
    head.add(ear)
    const inset = new THREE.Mesh(new THREE.ConeGeometry(.105, .28, 3), inner)
    inset.position.set(side * .315, .42, .083)
    inset.rotation.copy(ear.rotation)
    inset.scale.z = .22
    head.add(inset)
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.345, .055, 12, 42), teal)
  collar.position.set(0, 1.04, .49)
  collar.rotation.x = -.4
  torso.add(collar)
  sphere(torso, gold, [0, .74, .72], [.075, .095, .035])
  const legs: THREE.Group[] = []
  for (const z of [-.43, .4]) for (const x of [-.29, .29]) {
    const leg = new THREE.Group()
    leg.position.set(x, .71, z)
    sphere(leg, fur, [0, -.24, 0], [.14, .3, .145])
    sphere(leg, cream, [0, -.56, .055], [.16, .105, .205])
    root.add(leg)
    legs.push(leg)
  }
  const tail = new THREE.Group()
  tail.position.set(0, .95, -.61)
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, .28, -.33),
    new THREE.Vector3(0, .61, -.37), new THREE.Vector3(0, .72, -.08), new THREE.Vector3(0, .5, .03),
  ])
  const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, .13, 12, false), fur)
  tailMesh.castShadow = true
  tail.add(tailMesh)
  sphere(tail, cream, [0, .5, .03], [.13, .135, .13])
  torso.add(tail)
  return { root, torso, head, legs, tail }
}

export function PetScene({ activity, color, room, model, viewAzimuth, onModelInfo }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const activityRef = useRef(activity)
  activityRef.current = activity
  const [error, setError] = useState('')

  useEffect(() => {
    const element = host.current
    if (!element) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }) }
    catch { setError('当前浏览器未启用 WebGL。动作数据仍可查看，请换用支持 3D 的浏览器。'); onModelInfo({ clips: [], error: '浏览器未启用 WebGL，无法解析预览模型' }); return }
    setError('')
    let alive = true
    let frame = 0
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.domElement.setAttribute('aria-label', '3D 宠物，可拖动旋转和缩放视角')
    renderer.domElement.setAttribute('role', 'img')
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // Official RoomEnvironment gives local, reproducible studio IBL without CDN HDRIs.
    // https://threejs.org/docs/pages/RoomEnvironment.html (Three.js, MIT)
    const environment = new RoomEnvironment()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environmentTarget = pmrem.fromScene(environment, .04)
    scene.environment = environmentTarget.texture
    scene.environmentIntensity = .65
    environment.dispose()
    pmrem.dispose()
    const camera = new THREE.PerspectiveCamera(35, 1, .1, 120)
    const distance = room ? Math.max(room.width, room.depth, room.height) + 1 : 3.65
    const azimuth = viewAzimuth ?? .58
    camera.position.set(Math.sin(azimuth) * distance * 1.55, distance * .54, Math.cos(azimuth) * distance * 1.55)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, room ? .6 : .85, 0)
    controls.enableDamping = true
    controls.enablePan = false
    controls.minDistance = 2.6
    controls.maxDistance = 42
    controls.maxPolarAngle = Math.PI / 2 - .03
    controls.update()
    scene.add(new THREE.HemisphereLight('#f4f7ff', '#aba78f', .65))
    const sun = new THREE.DirectionalLight('#fff5e7', 2.5)
    sun.position.set(-3, 6, 4)
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
    const shadowExtent = room ? Math.max(room.width, room.depth) * .7 : 2.8
    sun.shadow.camera.left = -shadowExtent
    sun.shadow.camera.right = shadowExtent
    sun.shadow.camera.top = shadowExtent
    sun.shadow.camera.bottom = -shadowExtent
    sun.shadow.camera.far = 30
    sun.shadow.normalBias = .012
    sun.shadow.bias = -.0001
    sun.shadow.radius = 4
    scene.add(sun)
    const fill = new THREE.DirectionalLight('#d6e8ff', 1.25)
    fill.position.set(4, 2, -3)
    scene.add(fill)

    if (room) {
      const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, .12, room.depth), new THREE.MeshStandardMaterial({ color: '#e0ccae', roughness: .95 }))
      floor.position.y = -.075
      floor.receiveShadow = true
      scene.add(floor)
      const wallMaterial = new THREE.MeshStandardMaterial({ color: '#f5f0e3', roughness: 1, transparent: true, opacity: .78 })
      const back = new THREE.Mesh(new THREE.BoxGeometry(room.width, room.height, .07), wallMaterial)
      back.position.set(0, room.height / 2, -room.depth / 2)
      back.receiveShadow = true
      scene.add(back)
      const side = new THREE.Mesh(new THREE.BoxGeometry(.07, room.height, room.depth), wallMaterial)
      side.position.set(-room.width / 2, room.height / 2, 0)
      side.receiveShadow = true
      scene.add(side)
      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(room.width, room.height, room.depth)), new THREE.LineBasicMaterial({ color: '#6b9d8c', transparent: true, opacity: .28 }))
      outline.position.y = room.height / 2
      scene.add(outline)
      const gridPoints: number[] = []
      for (let x = -room.width / 2; x <= room.width / 2; x += 1) gridPoints.push(x, -.005, -room.depth / 2, x, -.005, room.depth / 2)
      for (let z = -room.depth / 2; z <= room.depth / 2; z += 1) gridPoints.push(-room.width / 2, -.005, z, room.width / 2, -.005, z)
      const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3)), new THREE.LineBasicMaterial({ color: '#c7b599' }))
      scene.add(grid)
    } else {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.8, .14, 96), new THREE.MeshStandardMaterial({ color: '#eceae0', roughness: .64 }))
      pedestal.position.y = -.09
      pedestal.receiveShadow = true
      scene.add(pedestal)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, .006, 8, 96), new THREE.MeshBasicMaterial({ color: '#b5c3b5' }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = -.012
      scene.add(ring)
    }
    const pet = buildPet(color)
    pet.root.traverse((object) => { if (object instanceof THREE.Mesh) object.layers.enable(1) })
    scene.add(pet.root)
    const contactShadow = room ? null : createContactShadow(renderer, scene)
    let shadowDirty = true
    let loaded: THREE.Group | null = null
    let mixer: THREE.AnimationMixer | null = null
    let clips: THREE.AnimationClip[] = []
    let activeAction: THREE.AnimationAction | null = null
    let previousActivity: CollarActivity | null = null
    onModelInfo({ clips: [], error: '' })

    if (model) {
      const manager = new THREE.LoadingManager()
      manager.setURLModifier((url) => { if (!url.startsWith('data:') && !url.startsWith('blob:')) throw new Error('模型包含外部资源'); return url })
      const onLoadError = () => { if (alive) onModelInfo({ clips: [], error: '模型读取失败；请使用贴图内嵌、未经 Draco 压缩的 GLB 2.0' }) }
      try { new GLTFLoader(manager).parse(model, '', (gltf) => {
        if (!alive) { disposeObject(gltf.scene); return }
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const size = box.getSize(new THREE.Vector3())
        const span = Math.max(size.x, size.y, size.z)
        if (!Number.isFinite(span) || span <= 0) { disposeObject(gltf.scene); onModelInfo({ clips: [], error: '模型没有可显示的几何体' }); return }
        gltf.scene.scale.multiplyScalar(2 / span)
        box.setFromObject(gltf.scene)
        const center = box.getCenter(new THREE.Vector3())
        gltf.scene.position.add(new THREE.Vector3(-center.x, -box.min.y, -center.z))
        gltf.scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; object.layers.enable(1) } })
        loaded = new THREE.Group()
        loaded.add(gltf.scene)
        scene.add(loaded)
        pet.root.visible = false
        shadowDirty = true
        mixer = new THREE.AnimationMixer(gltf.scene)
        clips = gltf.animations
        previousActivity = null
        onModelInfo({ clips: clips.map((clip) => clip.name), error: '', loaded: true })
      }, onLoadError) } catch { onLoadError() }
    }

    const resize = () => {
      const width = Math.max(element.clientWidth, 1)
      const height = Math.max(element.clientHeight, 1)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()
    const clock = new THREE.Clock()
    let elapsed = 0
    let shadowElapsed = 0
    const draw = () => {
      if (!alive) return
      frame = requestAnimationFrame(draw)
      const delta = Math.min(clock.getDelta(), .1)
      const current = activityRef.current
      if (current !== 'unknown') elapsed += delta
      if (loaded && mixer) {
        if (current !== 'unknown' && current !== previousActivity) {
          activeAction?.stop()
          const clip = matchingClip(clips, current)
          activeAction = clip ? mixer.clipAction(clip).reset().play() : null
          previousActivity = current
          shadowDirty = true
        }
        if (current !== 'unknown') {
          if (activeAction) {
            loaded.position.y = 0
            loaded.rotation.set(0, 0, 0)
            mixer.update(delta)
          } else {
            const pose = wholeModelMotion(current, elapsed)!
            loaded.position.y = pose.y
            loaded.rotation.set(pose.pitch, pose.yaw, pose.roll)
          }
        }
        element.dataset.motionMode = current === 'unknown' ? 'frozen' : activeAction ? 'source-clip' : 'whole-model'
      } else if (current !== 'unknown') {
        const pace = current === 'run' ? 14 : current === 'walk' ? 7 : 0
        const phase = elapsed * pace
        pet.root.position.y = pace ? Math.abs(Math.sin(phase)) * (current === 'run' ? .12 : .035) : 0
        pet.root.rotation.z = current === 'shake' ? Math.sin(elapsed * 25) * .11 : 0
        pet.torso.rotation.y = current === 'shake' ? Math.sin(elapsed * 25) * .16 : 0
        pet.head.rotation.y = current === 'shake' ? Math.sin(elapsed * 25 + .6) * .23 : 0
        pet.tail.rotation.z = current === 'shake' ? Math.sin(elapsed * 25 + 1) * .4 : 0
        pet.legs.forEach((leg, i) => { leg.rotation.x = pace ? Math.sin(phase + (i === 0 || i === 3 ? 0 : Math.PI)) * (current === 'run' ? .7 : .4) : 0 })
      }
      if (!loaded) element.dataset.motionMode = current === 'unknown' ? 'frozen' : 'template'
      shadowElapsed += delta
      const animated = current !== 'unknown' && (current !== 'rest' || !!activeAction)
      // Cache static shadows and cap moving contact shadows at 20 Hz on mobile/desktop.
      if (contactShadow && (shadowDirty || (animated && shadowElapsed > .05))) {
        contactShadow.update()
        shadowDirty = false
        shadowElapsed = 0
      }
      controls.update()
      renderer.render(scene, camera)
    }
    draw()
    return () => {
      alive = false
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      mixer?.stopAllAction()
      contactShadow?.dispose()
      environmentTarget.dispose()
      disposeObject(scene)
      scene.traverse((object) => { if (object instanceof THREE.LineSegments) { object.geometry.dispose(); (object.material as THREE.Material).dispose() } })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [color, room, model, viewAzimuth, onModelInfo])

  return <div className="collar-scene" ref={host}>{error && <div className="collar-scene-error" role="status">{error}</div>}</div>
}
