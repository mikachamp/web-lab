import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

/** MSAA HDR -> bloom (glints only) -> ACES (OutputPass) -> grain */
export function createPost(R: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
  const comp = new EffectComposer(R, rt)
  comp.addPass(new RenderPass(scene, cam))
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .45, .35, .92); comp.addPass(bloom)
  comp.addPass(new OutputPass())
  const grain = new ShaderPass({ uniforms: { tDiffuse: { value: null }, t: { value: 0 }, amt: { value: .045 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform sampler2D tDiffuse; uniform float t, amt; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb += (h(vUv * 1000.0 + t) - 0.5) * amt; gl_FragColor = c; }' })
  comp.addPass(grain)
  return { comp, bloom, grain }
}
