import * as THREE from 'three'
import { cradleShape, postShape, extrudeMelted, meltStats } from './melt'

export interface Part { obj: THREE.Object3D; base: THREE.Vector3; lift: THREE.Vector3; order: number; label: { n: string; d: string } | null }

/** renderer, in-scene studio environment, materials and every part from code (millimetres) */
export function createScene(cv: HTMLCanvasElement) {
  const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' })
  const PR_MAX = Math.min(devicePixelRatio || 1, 1.75)
  R.setPixelRatio(PR_MAX)
  R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.0
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c0e)
  const cam = new THREE.PerspectiveCamera(30, 1, 1, 4000)

  /* light: a tiny studio inside the scene, baked into the environment */
  const studio = new THREE.Scene()
  studio.add(new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100), new THREE.MeshBasicMaterial({ color: 0x0c0c0d, side: THREE.BackSide })))
  const panel = (w: number, h: number, intensity: number, p: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .97, .92).multiplyScalar(intensity), side: THREE.DoubleSide }))
    m.position.set(...p); m.lookAt(0, 0, 0); studio.add(m)
  }
  panel(22, 14, 5.5, [-22, 20, 20]); panel(30, 10, .9, [6, -6, 40]); panel(2.4, 34, 7, [30, 4, 12]); panel(2.4, 34, 5, [-30, 6, -14]); panel(40, 6, .6, [0, 40, -10])
  const pmrem = new THREE.PMREMGenerator(R)
  scene.environment = pmrem.fromScene(studio, .04).texture
  scene.environmentIntensity = 1.35

  /* materials: two per part (face + edge); anisotropy made in code */
  const anisoTex = (kind: string) => {
    const N = 256, d = new Uint8Array(N * N * 4)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 0
      if (kind === 'circ') a = Math.atan2(y - N / 2, x - N / 2) + Math.PI / 2
      const i = (y * N + x) * 4
      d[i] = (Math.cos(a) * .5 + .5) * 255; d[i + 1] = (Math.sin(a) * .5 + .5) * 255; d[i + 2] = 255; d[i + 3] = 255
    }
    const t = new THREE.DataTexture(d, N, N); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
  }
  /* heat-tint thickness map, made in code. The G channel is film thickness (0..1 across iridescenceThicknessRange).
     Thin film = straw, thicker = purple then blue. Heat gathers near the weld spots (the pin sockets at 0 and 180 degrees,
     plus a small third one) and along the inner edge of the ring, with a little noise so it never looks printed. */
  const heatTex = () => {
    const N = 512, R0 = 54, R1 = 62, SPAN = 124, d = new Uint8Array(N * N * 4)
    const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h) }
    const vnoise = (x: number, y: number) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
      return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v }
    const welds = [[0, 1, .42], [Math.PI, 1, .42], [-0.87, .55, .3]]   // angle, strength, angular width (rad)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = (x / (N - 1) - .5) * SPAN, py = (y / (N - 1) - .5) * SPAN, r = Math.hypot(px, py), th = Math.atan2(py, px)
      const rn = Math.min(1, Math.max(0, (r - R0) / (R1 - R0)))
      let heat = 0
      for (const [a, k, w] of welds) { let da = Math.abs(th - a); da = Math.min(da, Math.PI * 2 - da); heat = Math.max(heat, k * Math.exp(-(da * da) / (2 * w * w))) }
      heat *= .55 + .45 * (1 - rn)                                        // stronger toward the inner edge
      const edge = Math.exp(-rn * 5) * .35 + Math.exp(-(1 - rn) * 7) * .2   // thin bands at both rims
      const n = vnoise(px * .35, py * .35) * .5 + vnoise(px * 1.4, py * 1.4) * .25 - .18
      const v = Math.min(1, Math.max(0, .12 + heat * .7 + edge + n * .22))
      const i = (y * N + x) * 4; d[i] = d[i + 2] = 0; d[i + 1] = v * 255; d[i + 3] = 255
    }
    const t = new THREE.DataTexture(d, N, N); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true
    t.repeat.set(1 / SPAN, 1 / SPAN); t.offset.set(.5, .5); return t
  }
  const LIN = anisoTex('lin'), CIRC = anisoTex('circ'), HEAT = heatTex()
  const fitTex = (t: THREE.Texture, w: number, h: number) => { const c = t.clone(); c.repeat.set(1 / w, 1 / h); c.offset.set(.5, .5); c.needsUpdate = true; return c }
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(o)
  const M = {
    baseFace: phys({ color: '#c9ccd2', metalness: 1, roughness: .32, anisotropy: .8, anisotropyMap: fitTex(LIN, 140, 100) }),
    baseEdge: phys({ color: '#e6e8ec', metalness: 1, roughness: .07 }),
    postFace: phys({ color: '#26282d', metalness: .85, roughness: .38, anisotropy: .5, anisotropyMap: fitTex(LIN, 20, 100) }),
    postEdge: phys({ color: '#5a5e66', metalness: 1, roughness: .1 }),
    steelFace: phys({ color: '#d9dce1', metalness: 1, roughness: .22, anisotropy: .85, anisotropyMap: fitTex(CIRC, 124, 124),
      iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [90, 260], iridescenceThicknessMap: HEAT }),
    bezelFace: phys({ color: '#d9dce1', metalness: 1, roughness: .22, anisotropy: .85, anisotropyMap: fitTex(CIRC, 40, 40) }),
    steelEdge: phys({ color: '#f1f2f4', metalness: 1, roughness: .05 }),
    ringEdge: phys({ color: '#f1f2f4', metalness: 1, roughness: .05, iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [150, 230] }),
    brassFace: phys({ color: '#c79a52', metalness: 1, roughness: .28, anisotropy: .85, anisotropyMap: fitTex(CIRC, 100, 100) }),
    brassEdge: phys({ color: '#e2bb76', metalness: 1, roughness: .06 }),
    leather: phys({ color: '#2a1b14', roughness: .72, sheen: 1, sheenColor: new THREE.Color('#6b4a36'), sheenRoughness: .6 }),
    dial: phys({ color: '#0f1114', roughness: .3, clearcoat: 1, clearcoatRoughness: .04 }),
    /* sapphire crystal: transmission only, lit by the studio reflections (no direct lights in this scene) */
    glass: phys({ color: '#ffffff', metalness: 0, roughness: .015, transmission: 1, ior: 1.77, thickness: 6, dispersion: .2, specularIntensity: .6, attenuationColor: new THREE.Color('#e8f2ff'), attenuationDistance: 60 }),
    glassLo: phys({ color: '#dfe9f2', metalness: 0, roughness: .02, transparent: true, opacity: .16, ior: 1.77, envMapIntensity: 1.2, depthWrite: false }),
    amber: phys({ color: '#ff9d42', metalness: .2, roughness: .3, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: .6 })
  }

  /* every part from code: 2D shapes, extruded with a polished bevel, in millimetres */
  const rr = (w: number, h: number, r: number) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s }
  const ring = (R1: number, R0: number) => { const s = new THREE.Shape(); s.absarc(0, 0, R1, 0, Math.PI * 2, false); const h = new THREE.Path(); h.absarc(0, 0, R0, 0, Math.PI * 2, true); s.holes.push(h); return s }
  const post = (w: number, h: number, r: number) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - r); s.absarc(0, h - r, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s }
  const ext = (shape: THREE.Shape, depth: number, bevel = .4) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 72 })
    g.translate(0, 0, -depth / 2); return g
  }
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[]) => new THREE.Mesh(g, m)
  const lathe = (pts: number[][], seg = 72) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg)

  const root = new THREE.Group(); scene.add(root)
  const PIV = 82
  const parts: Part[] = []
  const part = (obj: THREE.Object3D, parent: THREE.Object3D, order: number, lift: number[], label: Part['label']) => { parent.add(obj); parts.push({ obj, base: obj.position.clone(), lift: new THREE.Vector3(...(lift as [number, number, number])), order, label }); return obj }

  const base = new THREE.Group()
  const bm = mesh(ext(rr(140, 100, 14), 12, .6), [M.baseFace, M.baseEdge]); bm.rotation.x = -Math.PI / 2; bm.position.y = 6; base.add(bm)
  part(base, root, .1, [0, -46, 0], { n: 'Base', d: '140 × 100 × 12 mm · brushed, polished edge' })
  const pod = new THREE.Group(); pod.position.set(0, 12, 0)
  pod.add(mesh(lathe([[0, 0], [15, 0], [15.4, .4], [15.4, 12], [14, 14], [0, 14]]), M.steelEdge))
  const led = mesh(new THREE.TorusGeometry(15.5, .5, 8, 64), M.amber) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>; led.rotation.x = Math.PI / 2; led.position.y = 6; pod.add(led)
  part(pod, root, .2, [0, 0, 70], { n: 'Drive pod', d: 'Ø30 × 14 mm · the motor' })
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * 72, 12, 0)
    const pm = mesh(extrudeMelted(postShape(sx, 12, PIV - 12 + 8), 10, .5, 3), [M.postFace, M.postEdge]); p.add(pm)
    const cap = mesh(lathe([[0, 0], [5, 0], [5.3, .3], [5.3, 3], [4.6, 3.6], [0, 3.6]]), M.steelEdge); cap.rotation.z = -sx * Math.PI / 2; cap.position.set(sx * 6, PIV - 12, 0); p.add(cap)
    part(p, root, .3, [sx * 46, 0, 0], sx < 0 ? { n: 'Posts', d: '12 × 78 × 10 mm · anodised, melted foot flare' } : null)
  }
  const outerPiv = new THREE.Group(); outerPiv.position.y = PIV; root.add(outerPiv)
  const outer = new THREE.Group()
  outer.add(mesh(ext(ring(62, 54), 6, .45), [M.steelFace, M.ringEdge]))
  for (const sx of [-1, 1]) { const pin = mesh(new THREE.CylinderGeometry(2.2, 2.2, 12, 24), M.steelEdge); pin.rotation.z = Math.PI / 2; pin.position.x = sx * 64; outer.add(pin) }
  part(outer, outerPiv, .5, [0, 34, 0], { n: 'Outer gimbal', d: 'Ø124 × 6 mm · steel, heat-tint face' })
  const innerPiv = new THREE.Group(); outerPiv.add(innerPiv)
  const inner = new THREE.Group()
  inner.add(mesh(ext(ring(50, 43), 5, .4), [M.brassFace, M.brassEdge]))
  for (const sy of [-1, 1]) { const pin = mesh(new THREE.CylinderGeometry(1.8, 1.8, 10, 24), M.brassEdge); pin.position.y = sy * 52; inner.add(pin) }
  part(inner, innerPiv, .7, [0, 62, 12], { n: 'Inner gimbal', d: 'Ø100 × 5 mm · brass, polished edge' })
  const spinner = new THREE.Group(); innerPiv.add(spinner)
  const cradle = new THREE.Group()
  const pillow = mesh(extrudeMelted(cradleShape(), 34, 3, 6), M.leather); cradle.add(pillow)   // organic: melted SDF outline, leather
  for (const sy of [-1, 1]) { const arm = mesh(new THREE.BoxGeometry(4, 25, 4), M.brassEdge); arm.position.y = sy * 30; cradle.add(arm) }
  part(cradle, spinner, .85, [0, 92, 22], { n: 'Cradle', d: '34 mm thick · leather, melted outline' })
  const watch = new THREE.Group(); watch.position.z = 17
  const caseM = mesh(lathe([[0, 0], [19, 0], [20, 1], [20.4, 4], [20, 7.5], [18.6, 9], [0, 9]]), M.steelEdge); caseM.rotation.x = Math.PI / 2; watch.add(caseM)
  const bezel = mesh(new THREE.TorusGeometry(18.4, 1.1, 16, 96), M.bezelFace); bezel.position.z = 9; watch.add(bezel)
  const dial = mesh(new THREE.CircleGeometry(17.2, 96), M.dial); dial.position.z = 8.8; watch.add(dial)
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, t = mesh(new THREE.BoxGeometry(i % 3 ? .9 : 1.6, i % 3 ? 3 : 4.5, .6), i ? M.steelEdge : M.amber); t.position.set(Math.sin(a) * 14.2, Math.cos(a) * 14.2, 9.1); t.rotation.z = -a; watch.add(t) }
  /* sapphire crystal: a thick domed lens (lathe, axis -> z). Transmission refracts the dial and hands behind it. */
  const crystal = mesh(lathe([[0, 0], [17.5, 0], [17.9, .35], [17.9, 1.0], [17.2, 1.6], [13.5, 2.5], [7.5, 3.1], [0, 3.4]], 96), M.glass); crystal.rotation.x = Math.PI / 2; crystal.position.z = 9.75; watch.add(crystal)
  const hand = mesh(new THREE.BoxGeometry(.9, 12, .5), M.steelEdge); hand.geometry.translate(0, 5, 0); hand.position.z = 9.4; watch.add(hand)
  const hand2 = mesh(new THREE.BoxGeometry(1.4, 8.5, .5), M.steelEdge); hand2.geometry.translate(0, 3.6, 0); hand2.position.z = 9.2; hand2.rotation.z = -1.1; watch.add(hand2)
  part(watch, spinner, 1, [0, 120, 46], { n: 'Watch head', d: 'Ø40 mm case · sapphire crystal, IOR 1.77' })
  const sh = document.createElement('canvas'); sh.width = sh.height = 128
  { const g = sh.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128) }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(240, 180), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -.2; root.add(shadow)

  /* blueprint mode: swap every surface for its edges */
  const lineM = new THREE.LineBasicMaterial({ color: 0xff9d42, transparent: true, opacity: .75 })
  const edgeLines: [THREE.Mesh, THREE.LineSegments][] = []
  root.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== shadow) { const m = o as THREE.Mesh; const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), lineM); l.visible = false; m.add(l); edgeLines.push([m, l]) } })
  for (const [o] of edgeLines) o.userData.mat = o.material
  const hidden = new THREE.MeshBasicMaterial({ visible: false })
  let blueprint = false
  const setBlueprint = (on: boolean) => { blueprint = on; for (const [o, l] of edgeLines) { l.visible = on; o.material = on ? hidden : o.userData.mat } }

  /* quality hooks used by the adaptive step-down and ?quality=low */
  const iridescence = (on: boolean) => { for (const m of [M.steelFace, M.ringEdge]) m.iridescence = on ? 1 : 0 }
  const glassCheap = (on: boolean) => { crystal.material = on ? M.glassLo : M.glass; crystal.renderOrder = on ? 2 : 0 }
  return { R, PR_MAX, scene, cam, parts, setBlueprint, isBlueprint: () => blueprint, iridescence, glassCheap, melt: meltStats,
    rig: { outerPiv, innerPiv, spinner, hand, led } }
}
