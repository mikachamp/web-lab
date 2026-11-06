import { createScene } from './scene'
import { createPost } from './post'
import { applyExplode } from './explode'
import { createCues, CUES } from './cues'
import { createLabels } from './labels'
import { createAudio } from './audio'
import { createFps } from './fps'

const q = new URLSearchParams(location.search)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
const cv = document.getElementById('c') as HTMLCanvasElement
const load = document.getElementById('load')

let S: ReturnType<typeof createScene>
try { S = createScene(cv) }
catch (e) {  // no-WebGL fallback: hide canvas, keep the text sections readable
  cv.style.display = 'none'; load.remove(); document.body.classList.add('nogl')
  document.getElementById('hold').style.display = 'none'; document.getElementById('bp').style.display = 'none'
  const F = createCues(null, true); addEventListener('scroll', F.scrollCue, { passive: true }); F.scrollCue()
  throw e
}
const { R, PR_MAX, scene, cam, parts, rig } = S
let pr = PR_MAX
const { comp, bloom, grain } = createPost(R, scene, cam)
const C = createCues(cam, reduce)
const { cur, tgt } = C
const drawLabels = createLabels(parts, cam)
const audio = createAudio()
const fps = createFps(q.has('fps'))

function size() { const w = innerWidth, h = innerHeight; R.setSize(w, h, false); comp.setSize(w, h); C.resizeCam() }
size(); addEventListener('resize', () => { size(); C.scrollCue() })
addEventListener('scroll', C.scrollCue, { passive: true }); C.scrollCue()

/* blueprint */
const bpBtn = document.getElementById('bp')
bpBtn.onclick = () => { const on = !S.isBlueprint(); bpBtn.setAttribute('aria-pressed', String(on)); S.setBlueprint(on) }

/* hold to power (the same gesture unlocks audio and phone tilt) */
const holdBtn = document.getElementById('hold'), ringEl = document.getElementById('ring'), holdT = document.getElementById('holdT')
let holding = false, holdK = 0, powered = false
holdBtn.addEventListener('pointerdown', (e) => { holding = true; try { holdBtn.setPointerCapture(e.pointerId) } catch {} ; audio.unlock() })
const release = () => { holding = false }
holdBtn.addEventListener('pointerup', release); holdBtn.addEventListener('pointercancel', release)
holdBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); audio.ensure(); holding = true } })
holdBtn.addEventListener('keyup', release)

let mx = 0, my = 0
addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth * 2 - 1; my = e.clientY / innerHeight * 2 - 1 }, { passive: true })

let clock = Number(q.get('t')) || 0, power = 0, last = performance.now(), lastBeat = 0, envX = 0, envY = 0
const fpsWin: number[] = []; let qStep = 0, qCool = 0
/* quality ladder (each step is one more thing off). Below 40 fps the loop climbs one step every 2 s:
   1-2 lower the pixel ratio, 3 bloom off, 4 iridescence off, 5 the crystal drops transmission for a cheap see-through glass.
   ?quality=low starts at step 4 with the pixel ratio already at 1 (the crystal keeps its refraction). */
const QMAX = 5
function applyStep(n: number) {
  qStep = n
  if (n >= 1) { pr = Math.max(1, Math.min(PR_MAX, 1.75) - .375 * Math.min(n, 2)); R.setPixelRatio(pr); comp.setPixelRatio(pr); size() }
  bloom.enabled = n < 3
  S.iridescence(n < 4)
  S.glassCheap(n >= 5)
}
const qParam = q.get('quality')
if (qParam && /^[0-5]$/.test(qParam)) applyStep(Number(qParam))   // ?quality=0..5 forces a ladder step (for comparing)
if (qParam === 'low') { applyStep(4); pr = 1; R.setPixelRatio(1); comp.setPixelRatio(1); size() }
let running = false, rafId = 0
const frozen = q.has('freeze')   // test hook: ?freeze renders only when __live.step() is called

function frame(now: number) {
  rafId = 0
  const raw = Math.min(1, (now - last) / 1000), dt = Math.min(.05, raw); last = now
  const k = reduce ? 1 : 1 - Math.exp(-dt * 4)
  for (const key of Object.keys(CUES.hero)) cur[key] += (tgt[key] - cur[key]) * k
  if (holding) { holdK = Math.min(1, holdK + dt / .9); if (holdK >= 1) { powered = !powered; holding = false; holdT.textContent = powered ? 'Hold to stop' : 'Hold to power'; holdBtn.setAttribute('aria-label', powered ? 'Hold to power down' : 'Hold to power up') } }
  else holdK = Math.max(0, holdK - dt * 3)
  ringEl.setAttribute('stroke-dashoffset', String(56.55 * (1 - holdK)))
  power = reduce ? (powered ? 1 : .08) : power + ((powered ? 1 : .08) - power) * (1 - Math.exp(-dt * 1.2))
  const ts = reduce ? 0 : cur.timeScale
  clock += dt * ts * (.25 + power * 3.2)
  const e = cur.explode, still = 1 - Math.min(1, e * 1.4)
  rig.outerPiv.rotation.x = clock * .55 * still
  rig.innerPiv.rotation.y = clock * 1.0 * still
  rig.spinner.rotation.z = clock * .3 * still
  rig.hand.rotation.z = -clock * .9; rig.led.material.emissiveIntensity = .2 + power * 1.4
  const beat = Math.floor(clock / (Math.PI / 2))
  if (beat !== lastBeat) { if (power > .3 && e < .2) audio.tick(power); lastBeat = beat }
  applyExplode(parts, e)
  const tx = mx + audio.tilt.x, ty = my + audio.tilt.y
  envX += (ty * .45 - envX) * (1 - Math.exp(-dt * 3)); envY += (-tx * .8 - envY) * (1 - Math.exp(-dt * 3))
  scene.environmentRotation.set(envX, envY, 0)
  C.placeCamera()
  grain.uniforms.t.value = reduce ? 0 : now * .001
  comp.render()
  drawLabels(Math.min(1, cur.labels * 1.3) * (S.isBlueprint() ? .9 : 1), C.isMobile())
  fps.frame(dt, `${innerWidth}x${innerHeight} pr ${pr.toFixed(2)} q${qStep}${bloom.enabled ? '' : ' nobloom'}${qStep >= 4 ? ' noiri' : ''}${qStep >= 5 ? ' cheapglass' : ''}`)
  // adaptive quality: below 40 fps step resolution down, then turn bloom off (?noadapt disables, for measuring)
  fpsWin.push(raw); if (fpsWin.length > 90) fpsWin.shift()
  if (qCool > 0) qCool -= raw
  else if (!q.has('noadapt') && fpsWin.length >= 12) {
    const sum = fpsWin.reduce((a, b) => a + b, 0)
    if (fpsWin.length < 90 && sum < 2) return void (running && !frozen && (rafId = requestAnimationFrame(frame)))   // not enough time yet
    const f = fpsWin.length / sum
    if (f < 40 && qStep < QMAX) { qCool = 2; fpsWin.length = 0; applyStep(qStep + 1) }
  }
  if (running && !frozen) rafId = requestAnimationFrame(frame)
}
function start() { if (running) return; running = true; last = performance.now(); fps.reset(); fpsWin.length = 0; if (!rafId) rafId = requestAnimationFrame(frame) }
function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0 } }
/* pause when the tab is hidden; the canvas is fixed full-screen so there is no separate off-screen state */
document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start() })

// compile every shader behind the loader, then start
const cueName = q.get('cue')   // ?cue=hero|close|apart|around|back jumps to that section (for timed frames; use with ?freeze)
if (cueName && CUES[cueName]) document.querySelector(`section[data-cue="${cueName}"]`)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior })
if (cueName && CUES[cueName]) { C.scrollCue(); Object.assign(cur, tgt) }
R.compileAsync(scene, cam).catch(() => {}).then(() => { load.style.opacity = '0'; setTimeout(() => load.remove(), 700); start() })
;(window as any).__live = {
  cues: CUES, set(k: string) { Object.assign(cur, CUES[k]); Object.assign(tgt, CUES[k]) },
  isRunning: () => running, audioState: () => audio.state(), holdK: () => holdK, powered: () => powered,
  renderer: () => { const gl = R.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown' },
  fps: () => fps.stats(), quality: () => qStep, dbg: () => ({ win: fpsWin.length, cool: qCool, sum: fpsWin.reduce((a, b) => a + b, 0) }), melt: () => S.melt(), info: () => R.info.render, step: (now = performance.now()) => frame(now)
}
