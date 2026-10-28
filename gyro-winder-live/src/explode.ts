import type { Part } from './scene'
export const sm = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x) }
/** ordered explode: top parts (order 1) leave first and come back last */
export function applyExplode(parts: Part[], e: number) {
  for (const p of parts) { const delay = (1 - p.order) * .42, t = sm((e - delay) / .58); p.obj.position.copy(p.base).addScaledVector(p.lift, t) }
}
