import {
  builtInDepth,
  canRide,
  decorationKind,
  footprint,
  isSupport,
  liveParam,
  mountHeight,
  paramValue,
  surfaceRect,
  surfaceTop,
} from '#/decoration/catalog.ts'
import type { DecorationConfig, Point } from '#/types.ts'

// Things that stand on other things. An item names what it stands on with
// `on`, and its height follows from there, so moving a table takes what is
// on it along and nothing has to be guessed from the geometry.

const MAX_DEPTH = 6

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
  const top = standHeight(support, all, depth + 1) + surfaceTop(supportKind, support.params, support.variant)
  return top + base - builtInDepth(kind)
}

// Is `point` on the usable part of this item's top?
export function onSurface(point: Point, support: DecorationConfig): boolean {
  const kind = decorationKind(support.kind)
  if (!kind || !isSupport(kind)) return false
  const [w, d] = surfaceRect(kind, support.params, support.variant)
  // Into the support's own frame, where the rect is axis aligned.
  const a = (-(support.rotation ?? 0) * Math.PI) / 180
  const dx = point[0] - support.position[0]
  const dy = point[1] - support.position[1]
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  // A wall shelf's top reaches out from the wall into the room, which is
  // the way its local y runs down, rather than sitting round the wall line.
  const out = kind.mount === 'wall' ? footprint(kind, support.params, support.variant)[1] / 2 : 0
  return Math.abs(lx) <= w / 2 && Math.abs(ly + out) <= d / 2
}

// A height a piece can stand at where it is: on the floor, at the height it
// has on its own, or on one of the tops under it.
export type Level = {
  // The piece it stands on there, or null when it stands on nothing.
  on: string | null
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
  const { on: _on, floor: _floor, ...free } = item
  const support = item.on ? all.find(d => d.id === item.on) : undefined
  const supportKind = support ? decorationKind(support.kind) : undefined
  const riding = support && supportKind && isSupport(supportKind) ? support.id : null
  const lift = paramValue(kind, item.params, 'lift', item.variant)
  const grounded = riding === null && (item.floor === true || lift === 0)
  const mine = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  const spots: { on: string | null; floor: boolean }[] = [{ on: null, floor: true }]
  for (const other of all) {
    if (mine.has(other.id) || other.room !== item.room) continue
    if (other.id === riding || onSurface(item.position, other)) spots.push({ on: other.id, floor: false })
  }
  const own = { on: null, floor: false }
  const standsAlone = riding === null && !grounded
  if (lift > 0 && (spots.length === 1 || item.params?.lift !== undefined || standsAlone)) spots.push(own)
  return spots
    .map(spot => ({
      ...spot,
      height: standHeight(spot.on ? { ...free, on: spot.on } : spot.floor ? { ...free, floor: true } : free, all),
      current: spot.on ? spot.on === riding : riding === null && spot.floor === grounded,
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

// The item a dragged one should stand on: the highest top under the point,
// never itself and never something already standing on it.
export function supportUnder(point: Point, item: DecorationConfig, all: DecorationConfig[]): DecorationConfig | null {
  const kind = decorationKind(item.kind)
  if (!kind || kind.mount !== 'floor' || !canRide(kind)) return null
  const own = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  let best: DecorationConfig | null = null
  let bestTop = -Infinity
  for (const other of all) {
    if (own.has(other.id) || other.room !== item.room) continue
    if (!onSurface(point, other)) continue
    const otherKind = decorationKind(other.kind)
    if (!otherKind || !isSupport(otherKind)) continue
    const top = standHeight(other, all) + surfaceTop(otherKind, other.params, other.variant)
    if (top > bestTop) {
      best = other
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
  const supportKind = decorationKind(support.kind)
  if (!supportKind || onSurface(item.position, support)) {
    return { position: item.position, rotation: item.rotation ?? 0 }
  }
  const turn = support.rotation ?? 0
  const [w, d] = surfaceRect(supportKind, support.params, support.variant)
  // A wall shelf's top is out from the wall line, as in onSurface.
  const out = supportKind.mount === 'wall' ? footprint(supportKind, support.params, support.variant)[1] / 2 : 0
  const a = (turn * Math.PI) / 180
  const toWorld = (u: number, v: number): Point => {
    const ly = v - out
    return [
      Math.round((support.position[0] + u * Math.cos(a) - ly * Math.sin(a)) * 100) / 100,
      Math.round((support.position[1] + u * Math.sin(a) + ly * Math.cos(a)) * 100) / 100,
    ]
  }
  const toLocal = (p: Point): [number, number] => {
    const dx = p[0] - support.position[0]
    const dy = p[1] - support.position[1]
    return [dx * Math.cos(-a) - dy * Math.sin(-a), dx * Math.sin(-a) + dy * Math.cos(-a) + out]
  }
  // What else stands on the top, as boxes in the top's own frame.
  const own = new Set([item.id, ...ridersOf(item.id, all).map(r => r.id)])
  const taken = all
    .filter(other => other.on === support.id && !own.has(other.id))
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
