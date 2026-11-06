import { test } from 'node:test'
import assert from 'node:assert/strict'
import { circle, box, capsule, smin, smoothUnion, rasterize, insideArea, marchingSquares, signedArea, selfIntersects, simplifyLoop, chaikin, meltAndTrace, union } from '../src/sdf.ts'

const B: [number, number, number, number] = [-40, -40, 40, 40]

test('smin is never above min and equals min far from the blend', () => {
  assert.ok(smin(1, 1, 2) < 1)
  assert.equal(smin(0, 10, 2), 0)
  for (let i = 0; i < 100; i++) { const a = Math.random() * 6 - 3, b = Math.random() * 6 - 3; assert.ok(smin(a, b, 2) <= Math.min(a, b) + 1e-12) }
})

test('circle traces to one closed CCW loop with the right radius and no self-intersection', () => {
  const loops = marchingSquares(rasterize(circle(0, 0, 10), ...B, .5))
  assert.equal(loops.length, 1)
  const l = loops[0]
  assert.ok(signedArea(l) > 0, 'outer loop is counter-clockwise')
  assert.ok(Math.abs(signedArea(l) - Math.PI * 100) < 3, 'area ~ pi r^2, got ' + signedArea(l))
  for (const p of l) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 10) < .05, 'point on the circle')
  assert.equal(selfIntersects(l), false)
})

test('contours are closed: every grid edge crossing has exactly one in and one out (loop visits each point once)', () => {
  const loops = marchingSquares(rasterize(union(circle(-4, 0, 7), circle(6, 2, 6)), ...B, .5))
  assert.equal(loops.length, 1)  // hard union of overlapping circles -> one loop
  const seen = new Set(loops[0].map(p => p.join(',')))
  assert.equal(seen.size, loops[0].length)
  assert.equal(selfIntersects(loops[0]), false)
})

test('a ring gives an outer CCW loop and a CW hole', () => {
  const ring = (x: number, y: number) => Math.max(circle(0, 0, 20)(x, y), -circle(0, 0, 12)(x, y))
  const loops = marchingSquares(rasterize(ring, ...B, .5))
  assert.equal(loops.length, 2)
  const [a, b] = loops.sort((p, q) => Math.abs(signedArea(q)) - Math.abs(signedArea(p)))
  assert.ok(signedArea(a) > 0); assert.ok(signedArea(b) < 0)
  assert.ok(Math.abs(signedArea(a) + signedArea(b) - Math.PI * (400 - 144)) < 8)
})

test('two separate shapes give two loops', () => {
  assert.equal(marchingSquares(rasterize(union(circle(-20, 0, 6), circle(20, 0, 6)), ...B, .5)).length, 2)
})

test('saddle cells do not create crossing segments', () => {
  // two squares that touch diagonally at a lattice cell
  const f = (x: number, y: number) => Math.min(box(-2, -2, 2, 2)(x, y), box(2, 2, 2, 2)(x, y))
  for (const l of marchingSquares(rasterize(f, -10, -10, 10, 10, 1))) assert.equal(selfIntersects(l), false)
})

test('smooth union is bigger than either input, and bigger than the hard union', () => {
  const a = circle(-6, 0, 6), b = circle(6, 0, 6)
  const area = (f: any) => insideArea(rasterize(f, ...B, .25))
  const hard = area(union(a, b)), melt = area(smoothUnion(6, a, b))
  assert.ok(melt > area(a)); assert.ok(melt > area(b)); assert.ok(melt > hard, `melt ${melt} > hard ${hard}`)
  const loops = marchingSquares(rasterize(smoothUnion(6, a, b), ...B, .25))
  assert.equal(loops.length, 1); assert.equal(selfIntersects(loops[0]), false)
})

test('melting joins two shapes that a hard union keeps apart (the neck)', () => {
  const a = circle(-7.5, 0, 6), b = circle(7.5, 0, 6)  // gap of 3
  assert.equal(marchingSquares(rasterize(union(a, b), ...B, .25)).length, 2)
  assert.equal(marchingSquares(rasterize(smoothUnion(8, a, b), ...B, .25)).length, 1)
})

test('meltAndTrace: simplify keeps the shape within eps, chaikin keeps it simple', () => {
  const f = smoothUnion(5, circle(0, 0, 14), capsule(0, 10, 0, 28, 6), ellipse2())
  const loops = meltAndTrace(f, B, .5, { eps: .06 })
  assert.equal(loops.length, 1)
  assert.equal(selfIntersects(loops[0]), false)
  const raw = marchingSquares(rasterize(f, ...B, .5))[0]
  assert.ok(loops[0].length < raw.length, 'fewer points after simplify')
  assert.ok(Math.abs(signedArea(loops[0]) - signedArea(raw)) / signedArea(raw) < .01)
  const sm = chaikin(loops[0]); assert.equal(selfIntersects(sm), false)
  assert.equal(simplifyLoop(raw, .05).length >= 3, true)
})
function ellipse2() { return (x: number, y: number) => (Math.hypot((x - 15) / 8, y / 5) - 1) * 5 }
