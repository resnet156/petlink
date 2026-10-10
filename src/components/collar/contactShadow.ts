import * as THREE from 'three'
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js'
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js'

// Depth-projection + separable blur follows the official Three.js r180 example:
// https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shadow_contact.html
// MIT, Copyright © 2010-2025 three.js authors. Only layer 1 casts this shadow.
export function createContactShadow(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const resolution = window.innerWidth < 600 ? 256 : 512
  const depthTarget = new THREE.WebGLRenderTarget(resolution, resolution)
  const blurTarget = new THREE.WebGLRenderTarget(resolution, resolution)
  depthTarget.texture.generateMipmaps = false
  blurTarget.texture.generateMipmaps = false
  const material = new THREE.MeshBasicMaterial({ map: depthTarget.texture, transparent: true, opacity: .52, depthWrite: false, toneMapped: false })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6).rotateX(Math.PI / 2), material)
  plane.scale.y = -1
  plane.position.y = .006
  plane.renderOrder = 2
  scene.add(plane)
  const camera = new THREE.OrthographicCamera(-2.3, 2.3, 2.3, -2.3, 0, 2.8)
  camera.position.y = .008
  camera.rotation.x = Math.PI / 2
  camera.layers.set(1)
  const depth = new THREE.MeshDepthMaterial({ depthTest: false, depthWrite: false })
  depth.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.14, 0.18, 0.16 ), pow( 1.0 - fragCoordZ, 2.0 ) );',
    )
  }
  const horizontal = new THREE.ShaderMaterial(HorizontalBlurShader)
  const vertical = new THREE.ShaderMaterial(VerticalBlurShader)
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), horizontal)
  const blurScene = new THREE.Scene()
  blurScene.add(quad)
  const blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  blurCamera.position.z = .5
  const blur = (amount: number) => {
    quad.material = horizontal
    horizontal.uniforms.tDiffuse.value = depthTarget.texture
    horizontal.uniforms.h.value = amount / resolution
    renderer.setRenderTarget(blurTarget)
    renderer.render(blurScene, blurCamera)
    quad.material = vertical
    vertical.uniforms.tDiffuse.value = blurTarget.texture
    vertical.uniforms.v.value = amount / resolution
    renderer.setRenderTarget(depthTarget)
    renderer.render(blurScene, blurCamera)
  }
  return {
    update() {
      const previousTarget = renderer.getRenderTarget()
      const previousAlpha = renderer.getClearAlpha()
      const previousMaterial = scene.overrideMaterial
      const previousBackground = scene.background
      scene.background = null
      scene.overrideMaterial = depth
      renderer.setClearAlpha(0)
      renderer.setRenderTarget(depthTarget)
      renderer.render(scene, camera)
      scene.overrideMaterial = previousMaterial
      blur(2.8)
      blur(1.1)
      renderer.setRenderTarget(previousTarget)
      renderer.setClearAlpha(previousAlpha)
      scene.background = previousBackground
    },
    dispose() {
      scene.remove(plane)
      plane.geometry.dispose()
      material.dispose()
      quad.geometry.dispose()
      depth.dispose()
      horizontal.dispose()
      vertical.dispose()
      depthTarget.dispose()
      blurTarget.dispose()
    },
  }
}
