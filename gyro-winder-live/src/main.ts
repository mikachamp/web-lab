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

let clock = 0, power = 0, last = performance.now(), lastBeat = 0, envX = 0, envY = 0
const fpsWin: number[] = []; let qStep = 0, qCool = 0
let running = false, rafId = 0
const frozen = q.has('freeze')   // test hook: ?freeze renders only when __live.step() is called

function frame(now: number) {
  rafId = 0
  const dt = Math.min(.05, (now - last) / 1000); last = now
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
  fps.frame(dt, `${innerWidth}x${innerHeight} pr ${pr.toFixed(2)} q${qStep}${bloom.enabled ? '' : ' nobloom'}`)
  // adaptive quality: below 40 fps step resolution down, then turn bloom off (?noadapt disables, for measuring)
  fpsWin.push(dt); if (fpsWin.length > 90) fpsWin.shift()
  if (qCool > 0) qCool -= dt
  else if (fpsWin.length === 90 && !q.has('noadapt')) {
    const f = 90 / fpsWin.reduce((a, b) => a + b, 0)
    if (f < 40 && qStep < 3) { qStep++; qCool = 2; fpsWin.length = 0
      if (qStep < 3) { pr = Math.max(1, pr - .375); R.setPixelRatio(pr); comp.setPixelRatio(pr); size() } else bloom.enabled = false }
  }
  if (running && !frozen) rafId = requestAnimationFrame(frame)
}
function start() { if (running) return; running = true; last = performance.now(); fps.reset(); if (!rafId) rafId = requestAnimationFrame(frame) }
function stop() { running = false; if (rafId) { cancelAnimationFrame(rafId); rafId = 0 } }
/* pause when the tab is hidden; the canvas is fixed full-screen so there is no separate off-screen state */
document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start() })

// compile every shader behind the loader, then start
R.compileAsync(scene, cam).catch(() => {}).then(() => { load.style.opacity = '0'; setTimeout(() => load.remove(), 700); start() })
;(window as any).__live = {
  cues: CUES, set(k: string) { Object.assign(cur, CUES[k]); Object.assign(tgt, CUES[k]) },
  isRunning: () => running, audioState: () => audio.state(), holdK: () => holdK, powered: () => powered,
  renderer: () => { const gl = R.getContext(); const x = gl.getExtension('WEBGL_debug_renderer_info'); return x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : 'unknown' },
  fps: () => fps.stats(), step: (now = performance.now()) => frame(now)
}
