/**
 * SDF melt-and-trace. Pure functions, no three.js, so they can be unit-tested in node.
 *   1. describe 2D shapes as signed distance functions (negative = inside)
 *   2. smooth-union ("melt") them
 *   3. rasterise onto a grid
 *   4. trace the zero level with marching squares -> closed loops of points
 * The loops are turned into a THREE.Shape in melt.ts and extruded.
 */
export type Pt = [number, number]
export type SDF = (x: number, y: number) => number

export const circle = (cx: number, cy: number, r: number): SDF => (x, y) => Math.hypot(x - cx, y - cy) - r
/** rounded box: half sizes hw, hh and corner radius r (r <= min(hw, hh)) */
export const box = (cx: number, cy: number, hw: number, hh: number, r = 0): SDF => (x, y) => {
  const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
/** capsule between two points */
export const capsule = (ax: number, ay: number, bx: number, by: number, r: number): SDF => (x, y) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay
  const h = Math.min(1, Math.max(0, (px * dx + py * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - dx * h, py - dy * h) - r
}
/** ellipse (approximate distance, exact zero level) */
export const ellipse = (cx: number, cy: number, rx: number, ry: number): SDF => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry)

export const union = (a: SDF, b: SDF): SDF => (x, y) => Math.min(a(x, y), b(x, y))
export const subtract = (a: SDF, b: SDF): SDF => (x, y) => Math.max(a(x, y), -b(x, y))
/** polynomial smooth minimum: always <= min(a, b), so the melted shape contains both inputs. k = blend width. */
export const smin = (a: number, b: number, k: number): number => {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * .25
}
export const smoothUnion = (k: number, ...fs: SDF[]): SDF => (x, y) => { let d = fs[0](x, y); for (let i = 1; i < fs.length; i++) d = smin(d, fs[i](x, y), k); return d }

export interface Grid { w: number; h: number; x0: number; y0: number; step: number; data: Float32Array }

/** sample f on a (w x h) lattice of points starting at (x0, y0) */
export function rasterize(f: SDF, x0: number, y0: number, x1: number, y1: number, step: number): Grid {
  const w = Math.floor((x1 - x0) / step) + 1, h = Math.floor((y1 - y0) / step) + 1, data = new Float32Array(w * h)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) data[j * w + i] = f(x0 + i * step, y0 + j * step)
  return { w, h, x0, y0, step, data }
}
/** area of the inside (value < 0), counted as lattice cells: cheap, good enough to compare shapes */
export function insideArea(g: Grid): number { let n = 0; for (let i = 0; i < g.data.length; i++) if (g.data[i] < 0) n++; return n * g.step * g.step }

/** signed area of a polygon: positive = counter-clockwise */
export function signedArea(p: Pt[]): number { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1] } return s / 2 }

/**
 * Marching squares at level 0. Returns closed loops (first point not repeated).
 * Inside (< 0) is on the left of every loop: outer boundaries are counter-clockwise, holes clockwise.
 * Points sit on lattice edges, placed by linear interpolation. A one-cell border of "outside" is
 * assumed, so shapes touching the grid edge still close.
 */
export function marchingSquares(g: Grid, iso = 0): Pt[][] {
  // pad with a ring of outside so every contour is closed
  const W = g.w + 2, H = g.h + 2, v = new Float32Array(W * H).fill(1e6)
  for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) v[(j + 1) * W + i + 1] = g.data[j * g.w + i] - iso
  const px = (i: number) => g.x0 + (i - 1) * g.step, py = (j: number) => g.y0 + (j - 1) * g.step
  // edge ids: horizontal edge (i,j)-(i+1,j) = 2*(j*W+i); vertical edge (i,j)-(i,j+1) = 2*(j*W+i)+1
  const pos = new Map<number, Pt>()
  const hEdge = (i: number, j: number) => {
    const id = 2 * (j * W + i); if (!pos.has(id)) { const a = v[j * W + i], b = v[j * W + i + 1], t = a / (a - b); pos.set(id, [px(i) + t * g.step, py(j)]) } return id
  }
  const vEdge = (i: number, j: number) => {
    const id = 2 * (j * W + i) + 1; if (!pos.has(id)) { const a = v[j * W + i], b = v[(j + 1) * W + i], t = a / (a - b); pos.set(id, [px(i), py(j) + t * g.step]) } return id
  }
  const next = new Map<number, number>()   // directed segments, inside on the left
  const seg = (a: number, b: number) => { next.set(b, a) }   // table below is written inside-on-right; store reversed
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = v[j * W + i], b = v[j * W + i + 1], c = v[(j + 1) * W + i + 1], d = v[(j + 1) * W + i]   // a=bl b=br c=tr d=tl
    const m = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0)
    if (m === 0 || m === 15) continue
    const B = () => hEdge(i, j), T = () => hEdge(i, j + 1), L = () => vEdge(i, j), R = () => vEdge(i + 1, j)
    switch (m) {
      case 1: seg(L(), B()); break          // only bl inside
      case 2: seg(B(), R()); break          // br
      case 3: seg(L(), R()); break          // bl+br
      case 4: seg(R(), T()); break          // tr
      case 6: seg(B(), T()); break          // br+tr
      case 7: seg(L(), T()); break          // all but tl
      case 8: seg(T(), L()); break          // tl
      case 9: seg(T(), B()); break          // tl+bl
      case 11: seg(T(), R()); break         // all but tr
      case 12: seg(R(), L()); break         // tr+tl
      case 13: seg(R(), B()); break         // all but br
      case 14: seg(B(), L()); break         // all but bl
      case 5: case 10: {                    // saddle: decide by the centre value
        const centreInside = (a + b + c + d) / 4 < 0
        if (m === 5) { if (centreInside) { seg(L(), T()); seg(R(), B()) } else { seg(L(), B()); seg(R(), T()) } }
        else { if (centreInside) { seg(T(), R()); seg(B(), L()) } else { seg(T(), L()); seg(B(), R()) } }
        break
      }
    }
  }
  const loops: Pt[][] = []
  const seen = new Set<number>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: Pt[] = []; let cur = start
    while (!seen.has(cur)) { seen.add(cur); loop.push(pos.get(cur)); const n = next.get(cur); if (n === undefined) break; cur = n }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/** Douglas-Peucker on a closed loop; eps in the same units as the points */
export function simplifyLoop(p: Pt[], eps: number): Pt[] {
  if (p.length < 8) return p
  // split at the two points furthest apart so the loop is treated as two open chains
  let ia = 0, ib = 0, best = -1
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[0][0], p[i][1] - p[0][1]); if (d > best) { best = d; ib = i } }
  const rdp = (pts: Pt[]): Pt[] => {
    if (pts.length < 3) return pts
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    let m = 0, mi = 0
    for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / len; if (d > m) { m = d; mi = i } }
    if (m <= eps) return [a, b]
    return rdp(pts.slice(0, mi + 1)).slice(0, -1).concat(rdp(pts.slice(mi)))
  }
  const c1 = rdp(p.slice(ia, ib + 1)), c2 = rdp(p.slice(ib).concat([p[ia]]))
  return c1.slice(0, -1).concat(c2.slice(0, -1))
}
/** one Chaikin corner-cutting pass on a closed loop (rounds off the lattice stair-steps) */
export function chaikin(p: Pt[]): Pt[] {
  const o: Pt[] = []
  for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; o.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]) }
  return o
}

/** true if any two non-adjacent edges of the closed loop cross (O(n^2), for tests and small loops) */
export function selfIntersects(p: Pt[]): boolean {
  const n = p.length
  const ccw = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue
    const a = p[i], b = p[(i + 1) % n], c = p[j], d = p[(j + 1) % n]
    if (ccw(a, b, c) * ccw(a, b, d) < 0 && ccw(c, d, a) * ccw(c, d, b) < 0) return true
  }
  return false
}

/** the whole pipeline: SDF -> clean closed loops (outer CCW first, then holes CW) */
export function meltAndTrace(f: SDF, bounds: [number, number, number, number], step = .5, opts: { eps?: number; smooth?: number } = {}): Pt[][] {
  const g = rasterize(f, bounds[0], bounds[1], bounds[2], bounds[3], step)
  let loops = marchingSquares(g)
  loops = loops.map(l => simplifyLoop(l, opts.eps ?? step * .12))
  for (let i = 0; i < (opts.smooth ?? 0); i++) loops = loops.map(chaikin)
  return loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)))
}
