import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { circle, box, ellipse, smoothUnion, union, meltAndTrace, type SDF, type Pt } from './sdf'

/** closed loops (outer first) -> THREE.Shape with holes. The SDF module already gives outer CCW, holes CW. */
export function shapeFromLoops(loops: Pt[][]): THREE.Shape {
  const [outer, ...holes] = loops
  const s = new THREE.Shape(outer.map(p => new THREE.Vector2(p[0], p[1])))
  for (const h of holes) s.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))))
  return s
}

/** generated once per key; the shapes never change at runtime, so the cost is paid behind the loader only */
const cache = new Map<string, { shape: THREE.Shape; ms: number; points: number }>()
export const meltStats = () => [...cache.entries()].map(([k, v]) => ({ part: k, ms: +v.ms.toFixed(1), points: v.points }))
function melted(key: string, f: SDF, bounds: [number, number, number, number], step: number, eps: number, smooth = 1) {
  let hit = cache.get(key)
  if (!hit) {
    const t = performance.now(), loops = meltAndTrace(f, bounds, step, { eps, smooth })
    hit = { shape: shapeFromLoops(loops), ms: performance.now() - t, points: loops.reduce((n, l) => n + l.length, 0) }
    cache.set(key, hit)
  }
  return hit.shape
}

/** ORGANIC PART 1, the cradle: a round leather pad melted together with two neck lobes (toward the brass arms) and two side ears */
export function cradleShape() {
  const f = smoothUnion(7, circle(0, 0, 15.5), ellipse(0, 21, 5.5, 8.5), ellipse(0, -21, 5.5, 8.5), ellipse(15, 0, 4.5, 8.5), ellipse(-15, 0, 4.5, 8.5))
  return melted('cradle', f, [-28, -34, 28, 34], .4, .05, 1)
}
/** ORGANIC PART 2, the posts: a tall rounded bar melted into a flared foot that reaches toward the middle of the base (side = +1 or -1) */
export function postShape(side: number, w: number, h: number) {
  const r = w / 2, bar = union(box(0, (h - r) / 2, r, (h - r) / 2, 0), circle(0, h - r, r))
  const foot = box(-side * 4, 3.2, 10, 3.2, 1.2)
  return melted('post' + side, smoothUnion(9, bar, foot), [-18, -2, 18, h + 2], .4, .05, 1)
}

/** extrude a melted shape with a small bevel and creased (smooth) normals; depth is the total thickness */
export function extrudeMelted(shape: THREE.Shape, total: number, bevel: number, segs = 5) {
  const depth = Math.max(.01, total - 2 * bevel)
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: segs, curveSegments: 1, steps: 1 })
  g.translate(0, 0, -depth / 2)
  g.deleteAttribute('normal')
  return toCreasedNormals(g, Math.PI / 4)
}
