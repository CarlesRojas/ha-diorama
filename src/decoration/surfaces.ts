import {
  builtInDepth,
  canRide,
  decorationKind,
  footprint,
  isSupport,
  liveParam,
  mountHeight,
  paramValue,
  surfaceTops,
  type Top,
} from '#/decoration/catalog.ts'
import type { DecorationConfig, Point } from '#/types.ts'

// Things that stand on other things. An item names what it stands on with
// `on`, and its height follows from there, so moving a table takes what is
// on it along and nothing has to be guessed from the geometry.

const MAX_DEPTH = 6

// The tops of an item, lowest first. None when nothing can stand on it.
function topsOf(support: DecorationConfig): Top[] {
  const kind = decorationKind(support.kind)
  return kind ? surfaceTops(kind, support.params, support.variant) : []
}

// Which of a support's tops a piece standing on it is on: the one it names,
// or the highest one when it names none or one that is not there.
const topIndex = (level: number | undefined, tops: Top[]) =>
  level !== undefined && Number.isInteger(level) && level >= 0 && level < tops.length ? level : tops.length - 1

// How a piece names a top in its config: nothing for the highest one, which
// is the only one of most things, and its number from the lowest otherwise.
const levelOf = (index: number, tops: Top[]) => (index >= tops.length - 1 ? undefined : index)

// The tops of a support that `point` is on the usable part of, as their
// numbers from the lowest.
function topsUnder(point: Point, support: DecorationConfig): number[] {
  const tops = topsOf(support)
  if (tops.length === 0) return []
  // Into the support's own frame, where the tops are axis aligned.
  const a = (-(support.rotation ?? 0) * Math.PI) / 180
  const dx = point[0] - support.position[0]
  const dy = point[1] - support.position[1]
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  return tops.flatMap((top, i) => (Math.abs(lx - top.x) <= top.w / 2 && Math.abs(ly - top.y) <= top.d / 2 ? [i] : []))
}

// How high above the floor an item's own base sits. A wall or ceiling item
// hangs where its kind says. A floor item stands on its support's top, or on
// the height it has on its own when it stands on nothing, unless it was
// put on the floor.
export function standHeight(item: DecorationConfig, all: DecorationConfig[], depth = 0): number {
  const kind = decorationKind(item.kind)
  if (!kind) return 0
  if (kind.mount !== 'floor') return mountHeight(kind, item.params)
  // Some things are built into a run of units rather than standing on the
  // floor: an oven halfway up a tall cabinet, a radiator off the skirting.
  const base = kind.params.some(x => x.id === 'base') ? liveParam(kind, item.params, 'base', item.variant) : 0
  const support = item.on ? all.find(d => d.id === item.on) : undefined
  const supportKind = support ? decorationKind(support.kind) : undefined
  if (!support || !supportKind || !isSupport(supportKind) || depth >= MAX_DEPTH) {
    return base + (canRide(kind) && !item.floor ? paramValue(kind, item.params, 'lift') : 0)
  }
  const tops = topsOf(support)
  const top = standHeight(support, all, depth + 1) + tops[topIndex(item.level, tops)].height
  return top + base - builtInDepth(kind)
}

// Is `point` on the usable part of one of this item's tops?
export const onSurface = (point: Point, support: DecorationConfig) => topsUnder(point, support).length > 0

// A height a piece can stand at where it is: on the floor, at the height it
// has on its own, or on one of the tops under it.
export type Level = {
  // The piece it stands on there, or null when it stands on nothing.
  on: string | null
  // Which of that piece's tops, when it is not the highest one.
  level?: number
  // On nothing, whether that is the floor or the height it has on its own.
  floor: boolean
  // How high its base is there.
  height: number
  // Whether that is where it stands now.
  current: boolean
}

// Every height a piece can stand at where it is, lowest first: the floor,
// every top under it, and the height it has on its own. That last one is
// for where there is nothing to stand on, a kettle in mid air over a table
// being no use, unless the height was set by hand, which is then kept as a
// step wherever the piece goes.
export function levelsAt(item: DecorationConfig, all: DecorationConfig[]): Level[] {
  const kind = decorationKind(item.kind)
  if (!kind || kind.mount !== 'floor' || !canRide(kind)) return []
  const { on: _on, floor: _floor, level: _level, ...free } = item
  const support = item.on ? all.find(d => d.id === item.on) : undefined
  const supportKind = support ? decorationKind(support.kind) : undefined
  const riding = support && supportKind && isSupport(supportKind) ? support.id : null
  const ridingTops = riding && support ? topsOf(support) : []
  const ridingLevel = levelOf(topIndex(item.level, ridingTops), ridingTops)
  const lift = paramValue(kind, item.params, 'lift', item.variant)
  const grounded = riding === null && (item.floor === true || lift === 0)
  const mine = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  const spots: { on: string | null; floor: boolean; level?: number }[] = [{ on: null, floor: true }]
  for (const other of all) {
    if (mine.has(other.id) || other.room !== item.room) continue
    // Every top of it under the piece, and the one it stands on now even
    // when it has been slid off its edge.
    const tops = topsOf(other)
    const under = new Set(topsUnder(item.position, other))
    if (other.id === riding) under.add(topIndex(item.level, tops))
    for (const index of [...under].sort((a, b) => a - b)) {
      const level = levelOf(index, tops)
      spots.push({ on: other.id, floor: false, ...(level !== undefined && { level }) })
    }
  }
  const own: { on: string | null; floor: boolean; level?: number } = { on: null, floor: false }
  const standsAlone = riding === null && !grounded
  if (lift > 0 && (spots.length === 1 || item.params?.lift !== undefined || standsAlone)) spots.push(own)
  return spots
    .map(spot => ({
      ...spot,
      height: standHeight(
        spot.on ? { ...free, on: spot.on, level: spot.level } : spot.floor ? { ...free, floor: true } : free,
        all,
      ),
      current: spot.on ? spot.on === riding && spot.level === ridingLevel : riding === null && spot.floor === grounded,
    }))
    .sort((a, b) => a.height - b.height)
}

// Everything standing on an item, directly or further up.
export function ridersOf(id: string, all: DecorationConfig[]): DecorationConfig[] {
  const out: DecorationConfig[] = []
  const walk = (parent: string, depth: number) => {
    if (depth >= MAX_DEPTH) return
    for (const item of all) {
      if (item.on !== parent) continue
      out.push(item)
      walk(item.id, depth + 1)
    }
  }
  walk(id, 0)
  return out
}

// What a dragged item should stand on: the highest top under the point,
// never its own and never one of something already standing on it. A piece
// already standing on one of the tops under the point stays on that one,
// so it can be slid along a lower board without jumping up to the top one.
export function supportUnder(
  point: Point,
  item: DecorationConfig,
  all: DecorationConfig[],
): { support: DecorationConfig; level?: number } | null {
  const kind = decorationKind(item.kind)
  if (!kind || kind.mount !== 'floor' || !canRide(kind)) return null
  const own = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  let best: { support: DecorationConfig; level?: number } | null = null
  let bestTop = -Infinity
  for (const other of all) {
    if (own.has(other.id) || other.room !== item.room) continue
    const under = topsUnder(point, other)
    if (under.length === 0) continue
    const tops = topsOf(other)
    if (other.id === item.on && under.includes(topIndex(item.level, tops))) {
      const level = levelOf(topIndex(item.level, tops), tops)
      return { support: other, ...(level !== undefined && { level }) }
    }
    const base = standHeight(other, all)
    for (const index of under) {
      const top = base + tops[index].height
      if (top <= bestTop) continue
      const level = levelOf(index, tops)
      best = { support: other, ...(level !== undefined && { level }) }
      bestTop = top
    }
  }
  return best
}

// Every top in the room a piece could be moved onto from its panel, never
// itself and never something already standing on it.
export function topsFor(item: DecorationConfig, all: DecorationConfig[]): DecorationConfig[] {
  const kind = decorationKind(item.kind)
  if (!kind || kind.mount !== 'floor' || !canRide(kind)) return []
  const own = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  return all.filter(other => {
    if (own.has(other.id) || other.room !== item.room) return false
    const otherKind = decorationKind(other.kind)
    return !!otherKind && isSupport(otherKind)
  })
}

// Half the width and depth a piece takes up, turned by `turn` degrees.
function halfExtents(item: DecorationConfig, turn: number): [number, number] {
  const kind = decorationKind(item.kind)
  if (!kind) return [0, 0]
  const [w, d] = footprint(kind, item.params, item.variant)
  const a = (turn * Math.PI) / 180
  const c = Math.abs(Math.cos(a))
  const s = Math.abs(Math.sin(a))
  return [(c * w + s * d) / 2, (s * w + c * d) / 2]
}

// Where a piece goes when it is moved onto a top from its panel. One already
// over that top stays where it is. Otherwise it turns the way the top faces
// and takes the first free spot from towards the back of the top, so a
// monitor ends up behind where the keyboard goes and a second piece goes
// beside the first rather than into it.
export function spotOn(
  item: DecorationConfig,
  support: DecorationConfig,
  all: DecorationConfig[],
): { position: Point; rotation: number } {
  // It goes onto the highest top, which is the one a piece is on when it
  // names none. One already over that top stays where it is.
  const tops = topsOf(support)
  const top = tops[tops.length - 1]
  if (!top || topsUnder(item.position, support).includes(tops.length - 1)) {
    return { position: item.position, rotation: item.rotation ?? 0 }
  }
  const turn = support.rotation ?? 0
  const { w, d } = top
  // The top's middle is where its item says, out from the wall line for
  // one on a wall, as in topsUnder.
  const a = (turn * Math.PI) / 180
  const toWorld = (u: number, v: number): Point => {
    const lx = u + top.x
    const ly = v + top.y
    return [
      Math.round((support.position[0] + lx * Math.cos(a) - ly * Math.sin(a)) * 100) / 100,
      Math.round((support.position[1] + lx * Math.sin(a) + ly * Math.cos(a)) * 100) / 100,
    ]
  }
  const toLocal = (p: Point): [number, number] => {
    const dx = p[0] - support.position[0]
    const dy = p[1] - support.position[1]
    return [dx * Math.cos(-a) - dy * Math.sin(-a) - top.x, dx * Math.sin(-a) + dy * Math.cos(-a) - top.y]
  }
  // What else stands on that top, as boxes in the top's own frame.
  const own = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  const taken = all
    .filter(other => other.on === support.id && !own.has(other.id))
    .filter(other => topIndex(other.level, tops) === tops.length - 1)
    .map(other => {
      const [u, v] = toLocal(other.position)
      const [hu, hv] = halfExtents(other, (other.rotation ?? 0) - turn)
      return { u, v, hu, hv }
    })
  const [iu, iv] = halfExtents(item, 0)
  // The back of a top is up its local y, the way a piece facing out from it
  // has behind it. Halfway there leaves room in front.
  const goal: [number, number] = [0, Math.max(0, d / 2 - iv) / 2]
  const gap = 0.02
  const clear = ([u, v]: [number, number]) =>
    taken.every(t => Math.abs(u - t.u) >= iu + t.hu + gap || Math.abs(v - t.v) >= iv + t.hv + gap)
  // Spots on a 5 cm grid, nearest the goal first: all of it on the top, or
  // failing that only its middle, as when it is dragged there.
  const spots = (reachU: number, reachV: number) => {
    const out: [number, number][] = []
    const nu = Math.floor(reachU / 0.05 + 1e-9)
    const nv = Math.floor(reachV / 0.05 + 1e-9)
    for (let i = -nu; i <= nu; i++) {
      for (let j = -nv; j <= nv; j++) out.push([i * 0.05, j * 0.05])
    }
    return out.sort((p, q) => Math.hypot(p[0] - goal[0], p[1] - goal[1]) - Math.hypot(q[0] - goal[0], q[1] - goal[1]))
  }
  const free = spots(Math.max(0, w / 2 - iu), Math.max(0, d / 2 - iv)).find(clear) ?? spots(w / 2, d / 2).find(clear)
  const [u, v] = free ?? goal
  return { position: toWorld(u, v), rotation: turn }
}
