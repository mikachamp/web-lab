import * as THREE from 'three'
import type { Part } from './scene'

/** labels: project anchors each frame, stack in two columns with leader lines */
export function createLabels(parts: Part[], cam: THREE.Camera) {
  const labWrap = document.getElementById('labels'), svg = labWrap.querySelector('svg')
  const labs: { p: Part; d: HTMLDivElement }[] = []
  for (const p of parts) if (p.label) { const d = document.createElement('div'); d.className = 'lab'; d.innerHTML = `<b>${p.label.n}</b><span class="d">${p.label.d}</span>`; labWrap.appendChild(d); labs.push({ p, d }) }
  const v3 = new THREE.Vector3()
  return function draw(alpha: number, mobile: boolean) {
    labWrap.style.opacity = String(alpha)
    if (alpha < .02) { svg.innerHTML = ''; return }
    const w = innerWidth, h = innerHeight, pts = labs.map(L => { L.p.obj.getWorldPosition(v3); v3.project(cam); return { L, x: (v3.x * .5 + .5) * w, y: (-v3.y * .5 + .5) * h } })
    const mid = w / 2, cols = [pts.filter(q => q.x < mid).sort((a, b) => a.y - b.y), pts.filter(q => q.x >= mid).sort((a, b) => a.y - b.y)]
    let path = ''
    cols.forEach((col, ci) => {
      let y = Math.max(mobile ? h * .14 : 90, h * .5 - col.length * 34)
      const gx = ci ? w - (mobile ? 12 : w * .06) : (mobile ? 12 : w * .06)
      col.forEach(q => {
        y = Math.max(y, Math.min(h * (mobile ? .52 : .56), q.y)); const d = q.L.d
        d.style.top = (y - 10) + 'px'; d.style.left = ci ? '' : gx + 'px'; d.style.right = ci ? (w - gx) + 'px' : ''; d.style.textAlign = ci ? 'right' : 'left'
        const ex = ci ? gx - d.offsetWidth - 8 : gx + d.offsetWidth + 8
        path += `M${ex},${y} L${ci ? ex - 18 : ex + 18},${y} L${q.x},${q.y} `
        y += mobile ? 34 : 40
      })
    })
    svg.innerHTML = `<path d="${path}" fill="none" stroke="rgba(255,157,66,.55)" stroke-width="1"/>` + pts.map(q => `<circle cx="${q.x}" cy="${q.y}" r="2.5" fill="#ff9d42"/>`).join('')
  }
}
