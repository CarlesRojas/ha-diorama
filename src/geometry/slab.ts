import type { Point } from '#/types.ts'
import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from 'three'

// How near another room's outline has to run for a stretch of this one to
// count as touching it, in meters, and the shortest stretch worth cutting an
// edge for.
const TOUCH_M = 0.02
const MIN_STRETCH_M = 0.01

function distanceToSegment(p: Point, a: Point, b: Point) {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)))
  return Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t)
}

// Whether a point on a room's outline lies on the outline of a neighbour.
export function touchesNeighbour(p: Point, neighbours: Point[][]) {
  return neighbours.some(other =>
    other.some((v, j) => distanceToSegment(p, v, other[(j + 1) % other.length]) <= TOUCH_M),
  )
}

// The outline with its edges cut wherever a corner of a neighbour lands on
// them, so every stretch either runs along a neighbour from end to end or
// not at all.
function cutAtNeighbours(outline: Point[], neighbours: Point[][]): Point[] {
  const result: Point[] = []
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const length = Math.hypot(abx, aby)
    const cuts: number[] = []
    for (const other of neighbours) {
      for (const v of other) {
        if (distanceToSegment(v, a, b) > TOUCH_M) continue
        const along = ((v[0] - a[0]) * abx + (v[1] - a[1]) * aby) / length
        if (along > MIN_STRETCH_M && along < length - MIN_STRETCH_M) cuts.push(along / length)
      }
    }
    result.push(a)
    cuts.sort((x, y) => x - y)
    let last = 0
    for (const t of cuts) {
      if ((t - last) * length < MIN_STRETCH_M) continue
      result.push([a[0] + abx * t, a[1] + aby * t])
      last = t
    }
  }
  return result
}

// A corner of the slab's outline, and the way it moves inward as the edge
// rounding draws in: one meter of rounding moves it by `m`.
type Corner = { p: Point; m: Point }
type Edge = { nx: number; ny: number; round: boolean }
type Ring = { inset: number; y: number; angle: number }
type V = [number, number, number]

// The floor slab of a room. `outline` is its edge on the plan, counter
// clockwise. The top and bottom edges are rounded by `fillet` wherever the outline
// stands free, and left square where it runs along one of `neighbours`, so
// two floors that touch meet flat and only the rim of the home is rounded.
// The top is at y = 0 and plan y maps to -z.
export function slabGeometry(
  outline: Point[],
  neighbours: Point[][],
  fillet: number,
  depth: number,
  segments: number,
  shift = 0,
): BufferGeometry {
  // Curves hand back the same point many times over when they have no size.
  const clean: Point[] = []
  for (const p of outline) {
    const last = clean[clean.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) clean.push(p)
  }
  const same = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-6
  while (clean.length > 1 && same(clean[0], clean[clean.length - 1])) clean.pop()
  const points = neighbours.length > 0 ? cutAtNeighbours(clean, neighbours) : clean
  const n = points.length
  const geometry = new BufferGeometry()
  if (n < 3) return geometry

  // Every edge: its inward normal, and whether it is rounded over.
  const edges: Edge[] = points.map((a, i) => {
    const b = points[(i + 1) % n]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const round = fillet > 0 && !touchesNeighbour(middle, neighbours)
    return { nx: -(b[1] - a[1]) / length, ny: (b[0] - a[0]) / length, round }
  })

  // The corners in order, and with each the edge that leaves it. Where a
  // rounded stretch turns square along a straight line the corner is there
  // twice, and the edge of no length between the two closes the rounding's
  // end.
  const corners: Corner[] = []
  const leaving: (Edge | null)[] = []
  for (let i = 0; i < n; i++) {
    const before = edges[(i - 1 + n) % n]
    const after = edges[i]
    const k1 = before.round ? 1 : 0
    const k2 = after.round ? 1 : 0
    const det = before.nx * after.ny - before.ny * after.nx
    // Where the rounding stops at a corner, the inset corner slides along
    // the square edge by one over the sine of the turn, which throws it far
    // out of place at a shallow turn, as on the arc of a rounded corner that
    // another room's corner lands on. Below a turn of 30 degrees the corner
    // is doubled instead, the same as on a straight line.
    if (Math.abs(det) < (k1 === k2 ? 1e-3 : 0.5)) {
      if (k1 !== k2) {
        corners.push({ p: points[i], m: [before.nx * k1, before.ny * k1] })
        leaving.push(null)
      }
      corners.push({ p: points[i], m: [after.nx * k2, after.ny * k2] })
    } else {
      corners.push({
        p: points[i],
        m: [(k1 * after.ny - k2 * before.ny) / det, (before.nx * k2 - after.nx * k1) / det],
      })
    }
    leaving.push(after)
  }

  // The rings the sides are strung between, top to bottom: how far the
  // rounding has drawn in, how far down, and how far round the turn. The
  // underside is rounded the same as the top, so the rim is the same either
  // way up.
  const rings: Ring[] = []
  const steps = fillet > 0 ? segments : 0
  for (let j = 0; j <= steps; j++) {
    const angle = steps > 0 ? (j / steps) * (Math.PI / 2) : Math.PI / 2
    rings.push({ inset: fillet * (1 - Math.sin(angle)), y: -fillet * (1 - Math.cos(angle)), angle })
  }
  for (let j = 0; j <= steps; j++) {
    const angle = Math.PI / 2 + (steps > 0 ? (j / steps) * (Math.PI / 2) : 0)
    rings.push({ inset: fillet * (1 - Math.sin(angle)), y: -(fillet + depth) + fillet * Math.cos(angle), angle })
  }

  const position: number[] = []
  const normal: number[] = []
  const at = (c: Corner, ring: Ring): V => [c.p[0] + c.m[0] * ring.inset, ring.y, -(c.p[1] + c.m[1] * ring.inset)]
  const triangle = (a: V, b: V, c: V, na?: V, nb?: V, nc?: V) => {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    const size = Math.hypot(fx, fy, fz)
    // A triangle with no area, where two corners of a ring coincide.
    if (size < 1e-12) return
    const flat: V = [fx / size, fy / size, fz / size]
    position.push(...a, ...b, ...c)
    normal.push(...(na ?? flat), ...(nb ?? flat), ...(nc ?? flat))
  }

  // The top, inside the rounding, and the underside.
  const up: V = [0, 1, 0]
  const down: V = [0, -1, 0]
  const top = corners.map(c => at(c, rings[0]))
  for (const [a, b, c] of ShapeUtils.triangulateShape(
    top.map(v => new Vector2(v[0], -v[2])),
    [],
  )) {
    triangle(top[a], top[b], top[c], up, up, up)
  }
  const bottom = corners.map(c => at(c, rings[rings.length - 1]))
  for (const [a, b, c] of ShapeUtils.triangulateShape(
    bottom.map(v => new Vector2(v[0], -v[2])),
    [],
  )) {
    triangle(bottom[c], bottom[b], bottom[a], down, down, down)
  }

  // The sides, ring to ring. A rounded edge is shaded as the curve it is,
  // everything else as the flat face it is.
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % corners.length]
    const edge = leaving[i]
    for (let j = 0; j < rings.length - 1; j++) {
      const high = rings[j]
      const low = rings[j + 1]
      const aHigh = at(a, high)
      const bHigh = at(b, high)
      const aLow = at(a, low)
      const bLow = at(b, low)
      if (edge?.round) {
        const curve = (ring: Ring): V => [
          -edge.nx * Math.sin(ring.angle),
          Math.cos(ring.angle),
          edge.ny * Math.sin(ring.angle),
        ]
        const nHigh = curve(high)
        const nLow = curve(low)
        triangle(aHigh, aLow, bLow, nHigh, nLow, nLow)
        triangle(aHigh, bLow, bHigh, nHigh, nLow, nHigh)
      } else {
        triangle(aHigh, aLow, bLow)
        triangle(aHigh, bLow, bHigh)
      }
    }
  }

  // The floor is painted from above: every vertex takes its uv from where
  // it sits on the plan, so the rounded edge and the sides carry the same
  // boards as the top instead of a strip of their own that meets it at an
  // angle. Units are meters, which is what the surface scale expects.
  // A side that stands upright takes the one line of the pattern above it.
  // The pattern is moved by `shift` both ways, so a room drawn from a round
  // number does not have a joint there and sides the color of the joint.
  const uv: number[] = []
  for (let i = 0; i < position.length; i += 3) uv.push(position[i] + shift, -position[i + 2] + shift)

  geometry.setAttribute('position', new Float32BufferAttribute(position, 3))
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3))
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  return geometry
}
