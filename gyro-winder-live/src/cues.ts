import * as THREE from 'three'
import { sm } from './explode'

export const PIV = 82
export const CUES: Record<string, Record<string, number>> = {
  hero:   { frame: 230, polar: 14, az: -24, ty: 64, offsetX: .17, explode: 0, timeScale: 1, labels: 0 },
  close:  { frame: 68,  polar: 6,  az: 16,  ty: PIV, offsetX: -.17, explode: 0, timeScale: 1 / 12, labels: 0 },
  apart:  { frame: 360, polar: 26, az: -32, ty: 110, offsetX: 0, explode: 1, timeScale: 1, labels: 1 },
  around: { frame: 330, polar: 18, az: 140, ty: 110, offsetX: -.17, explode: 1, timeScale: 1, labels: 0 },
  back:   { frame: 220, polar: 12, az: -18, ty: 64, offsetX: .17, explode: 0, timeScale: 1, labels: 0 }
}
export const KEYS = ['frame', 'polar', 'az', 'ty', 'offsetX', 'explode', 'timeScale', 'labels']

/** the camera script: cues pinned to page sections, framed by size not distance */
export function createCues(cam: THREE.PerspectiveCamera | null, reduce: boolean) {
  const sections = [...document.querySelectorAll<HTMLElement>('section[data-cue]')]
  const cur: Record<string, number> = Object.assign({}, CUES.hero), tgt: Record<string, number> = Object.assign({}, CUES.hero)
  let mobile = false
  function scrollCue() {
    const mid = scrollY + innerHeight / 2
    const centers = sections.map(s => s.offsetTop + s.offsetHeight / 2)
    let i = 0; while (i < centers.length - 1 && mid > centers[i + 1]) i++
    const a = CUES[sections[i].dataset.cue], b = CUES[sections[Math.min(i + 1, sections.length - 1)].dataset.cue]
    const f = i === centers.length - 1 ? 0 : sm((mid - centers[i]) / (centers[i + 1] - centers[i]))
    for (const k of KEYS) tgt[k] = a[k] + (b[k] - a[k]) * f
    // text reveals driven by scroll position, not observers
    sections.forEach((s, j) => { const d = Math.abs(mid - centers[j]) / innerHeight; (s.querySelector('.copy') as HTMLElement).style.opacity = String((reduce || !cam) ? 1 : Math.max(0, Math.min(1, 1.6 - d * 2.2))) })
  }
  function resizeCam() { cam.aspect = innerWidth / innerHeight; mobile = innerWidth < 760; cam.updateProjectionMatrix() }
  function placeCamera() {
    const vf = THREE.MathUtils.degToRad(cam.fov), fitH = (cur.frame / 2) / Math.tan(vf / 2), dist = fitH / Math.min(1, cam.aspect * (mobile ? 1 : .9))
    const p = THREE.MathUtils.degToRad(cur.polar), a = THREE.MathUtils.degToRad(cur.az)
    cam.position.set(Math.sin(a) * Math.cos(p) * dist, cur.ty + Math.sin(p) * dist, Math.cos(a) * Math.cos(p) * dist)
    cam.lookAt(0, cur.ty, 0)
    const w = innerWidth, h = innerHeight
    if (mobile) cam.setViewOffset(w, h, 0, Math.round(h * .17), w, h); else cam.setViewOffset(w, h, -Math.round(w * cur.offsetX), 0, w, h)
  }
  return { cur, tgt, sections, scrollCue, resizeCam, placeCamera, isMobile: () => mobile }
}
