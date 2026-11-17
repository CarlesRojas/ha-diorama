import { decorationKind, footprint } from '#/decoration/catalog.ts'
import { pointStrictlyInside } from '#/geometry/overlap.ts'
import { neighboursOf, type Passage } from '#/geometry/passages.ts'
import type { DecorationConfig, Point, RoomConfig } from '#/types.ts'

// The path a robot vacuum drives while it runs. Real ones sweep the floor in
// long parallel passes, turning at each wall and stepping across by a little
// less than their own width so the passes overlap, and they go around what
// stands on the floor rather than through it. This builds the same thing:
// the free floor is sampled into a grid, the passes are the clear stretches
// of each row, and the move from the end of one pass to the start of the
// next is routed across the free floor as well, so no leg of the round ever
// crosses a sofa.

// How much of its own width the robot steps across between passes.
const OVERLAP = 0.85
// How finely the floor is sampled, as a share of the robot's radius.
const SAMPLE = 0.5
// A stretch shorter than the robot's own width is not worth driving, so the
// row gives it up.
const SHORTEST_PASS = 1

// The floor standing pieces a robot drives straight over. A rug is the only
// one: everything else on the floor is furniture it has to go around.
const DRIVEN_OVER = new Set(['rug'])

// Whether a piece is in the way at this spot. Its footprint is grown by the
// robot's radius, so the robot's rim clears it too.
function blockedBy(point: Point, item: DecorationConfig, radius: number) {
  const kind = decorationKind(item.kind)
  // What hangs on a wall or from the ceiling is not on the floor at all.
  if (!kind || kind.mount !== 'floor') return false
  if (DRIVEN_OVER.has(kind.id)) return false
  // Anything resting on a table is above the floor, so the robot drives
  // under it.
  if (item.on !== undefined) return false
  const [fw, fd] = footprint(kind, item.params, item.variant)
  const a = (-(item.rotation ?? 0) * Math.PI) / 180
  const dx = point[0] - item.position[0]
  const dy = point[1] - item.position[1]
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  return Math.abs(lx) <= fw / 2 + radius && Math.abs(ly) <= fd / 2 + radius
}

// The free floor of a room, sampled on a grid, with the room's own walls kept
// a robot's radius away.
function freeFloor(room: RoomConfig, others: DecorationConfig[], radius: number, step: number) {
  const xs = room.points.map(p => p[0])
  const ys = room.points.map(p => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const nx = Math.max(Math.ceil((Math.max(...xs) - minX) / step) + 1, 1)
  const ny = Math.max(Math.ceil((Math.max(...ys) - minY) / step) + 1, 1)
  const at = (i: number, j: number): Point => [minX + i * step, minY + j * step]
  const free = new Uint8Array(nx * ny)
  const rim: Point[] = [
    [0, 0],
    [radius, 0],
    [-radius, 0],
    [0, radius],
    [0, -radius],
  ]
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const [x, y] = at(i, j)
      // The robot fits at a spot when its rim is inside the room as well as
      // its center, which is what keeps it off the walls.
      const inside = rim.every(([ox, oy]) => pointStrictlyInside([x + ox, y + oy], room.points))
      free[j * nx + i] = inside && !others.some(o => blockedBy([x, y], o, radius)) ? 1 : 0
    }
  }
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && free[j * nx + i] === 1
  return { nx, ny, at, ok }
}

type Floor = ReturnType<typeof freeFloor>
type Cell = [number, number]

// The shortest way from one cell to another across the free floor, as cells.
// Empty when there is no way at all.
function route(floor: Floor, from: Cell, to: Cell): Cell[] {
  const { nx, ny, ok } = floor
  const start = from[1] * nx + from[0]
  const goal = to[1] * nx + to[0]
  if (start === goal) return [to]
  const came = new Int32Array(nx * ny).fill(-1)
  came[start] = start
  let edge = [start]
  while (edge.length > 0) {
    const next: number[] = []
    for (const cell of edge) {
      const i = cell % nx
      const j = (cell - i) / nx
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const a = i + di
        const b = j + dj
        if (!ok(a, b)) continue
        const id = b * nx + a
        if (came[id] !== -1) continue
        came[id] = cell
        if (id === goal) {
          // Walk the trail back to where it started.
          const out: Cell[] = []
          for (let c = goal; c !== start; c = came[c]) out.push([c % nx, (c - (c % nx)) / nx])
          return out.reverse()
        }
        next.push(id)
      }
    }
    edge = next
  }
  return []
}

// Whether the straight line between two cells stays on the free floor, which
// is what lets a routed trail be pulled back into a few long legs.
function sightLine(floor: Floor, a: Cell, b: Cell) {
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
  for (let s = 1; s <= steps; s++) {
    const t = s / steps
    if (!floor.ok(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t))) return false
  }
  return true
}

// A routed trail is a staircase of single cells. This pulls it straight:
// each leg runs as far as it can still see, so the robot drives a few long
// lines instead of a thousand little ones.
function straighten(floor: Floor, trail: Cell[], from: Cell): Cell[] {
  const out: Cell[] = []
  let at = from
  let next = 0
  while (next < trail.length) {
    let far = next
    for (let j = trail.length - 1; j > next; j--) {
      if (sightLine(floor, at, trail[j])) {
        far = j
        break
      }
    }
    out.push(trail[far])
    at = trail[far]
    next = far + 1
  }
  return out
}

// Everything the robot's ways depend on, as one string: the outline of each
// room it can drive to, the robot's own place and size, and where each piece
// in those rooms stands, the doors between them among them. Anything else
// about the plan can change without the ways having to be worked out again.
export function roamKey(rooms: RoomConfig[], all: DecorationConfig[], self: DecorationConfig, radius: number) {
  if (rooms.length === 0) return 'none'
  const ids = new Set(rooms.map(room => room.id))
  const pieces = all
    .filter(d => d.id !== self.id && ids.has(d.room))
    .map(d => `${d.room}:${d.kind}:${d.position}:${d.rotation ?? 0}:${d.on ?? ''}:${JSON.stringify(d.params ?? {})}`)
  const outlines = rooms.map(room => `${room.id}:${room.points}`)
  return `${outlines.join('|')}|${self.position}|${self.rotation ?? 0}|${radius}|${pieces.join('|')}`
}

// A robot's round: the sweep it drives while it is running, and the way
// back to the dock from wherever it has got to when it stops. The last leg
// of the way home is the one it backs onto the dock along.
export type Round = {
  sweep: Point[]
  home: (from: Point) => Point[]
}

// How far out from the dock the robot looks for the floor, in its own radii.
const DOCK_REACH = 4

// A room's free floor, with the cell under any point and the way between
// two cells across it.
function floorOf(room: RoomConfig, others: DecorationConfig[], radius: number) {
  const step = Math.max(radius * SAMPLE, 0.02)
  const floor = freeFloor(room, others, radius, step)
  const origin = floor.at(0, 0)
  const cellOf = (q: Point): Cell => [Math.round((q[0] - origin[0]) / step), Math.round((q[1] - origin[1]) / step)]
  // Every move is routed across the free floor, so no leg goes through the
  // furniture between its ends.
  const leg = (from: Cell, to: Cell) =>
    sightLine(floor, from, to) ? [to] : straighten(floor, route(floor, from, to), from)
  return { floor, step, cellOf, leg }
}

// The robot's round in a room. In the room of its dock it starts there and
// ends there. In another room it starts at `start`, where it came in.
export function roamRound(
  room: RoomConfig,
  all: DecorationConfig[],
  self: DecorationConfig,
  radius: number,
  start?: Point,
): Round {
  const others = all.filter(d => d.id !== self.id && d.room === room.id)
  const { floor, step, cellOf, leg } = floorOf(room, others, radius)
  const { nx, ny, at, ok } = floor

  // The passes: the clear stretches of every row the robot steps to, taken
  // end to end and then back the other way.
  const rows = Math.max(Math.round((radius * 2 * OVERLAP) / step), 1)
  const least = Math.max(Math.round((radius * 2 * SHORTEST_PASS) / step), 1)
  const stops: Cell[] = []
  let flip = false
  for (let j = 0; j < ny; j += rows) {
    const runs: Cell[] = []
    let from = -1
    for (let i = 0; i <= nx; i++) {
      if (i < nx && ok(i, j)) {
        if (from < 0) from = i
      } else {
        if (from >= 0 && i - from >= least) runs.push([from, i - 1])
        from = -1
      }
    }
    if (runs.length === 0) continue
    // The row is driven in the direction this pass goes, and its stretches
    // in that order too, so the robot never doubles back needlessly.
    if (flip) runs.reverse()
    for (const [a, b] of runs) stops.push(flip ? [b, j] : [a, j], flip ? [a, j] : [b, j])
    flip = !flip
  }

  // The dock stands against a wall, where the robot itself does not fit, so
  // the round starts at the dock's own spot and joins the floor straight
  // ahead of it: the first free cell out along the dock's front, so the
  // robot drives off the ramp the way it is facing and backs onto it the
  // same way, with no turn on the dock. Only a dock with nothing free ahead
  // of it settles for the free cell nearest to it.
  const ahead = (): Cell | null => {
    const a = ((self.rotation ?? 0) * Math.PI) / 180
    // The piece's front, on the plan: the way a wall piece faces into the room.
    const dir: Point = [Math.sin(a), -Math.cos(a)]
    const reach = Math.ceil((radius * DOCK_REACH) / step)
    for (let k = 1; k <= reach; k++) {
      const cell = cellOf([self.position[0] + dir[0] * k * step, self.position[1] + dir[1] * k * step])
      if (ok(cell[0], cell[1])) return cell
    }
    return null
  }
  // A round in another room starts where the robot came in instead.
  const dock = start
    ? nearestFree(floor, cellOf(start))
    : (ahead() ?? nearestFree(floor, cellOf(self.position)))
  // The shortest way back to the dock from anywhere on the floor, which is
  // what it drives when it is switched off partway through a round.
  const home = (from: Point): Point[] => {
    const at0 = nearestFree(floor, cellOf(from))
    if (!at0 || !dock) return [from, self.position]
    return [from, ...leg(at0, dock).map(cell => at(cell[0], cell[1])), self.position]
  }
  const path: Point[] = [start ?? self.position]
  if (!dock || stops.length === 0) return { sweep: path, home }
  let cursor = dock
  for (const stop of [dock, ...stops]) {
    const trail = leg(cursor, stop)
    if (trail.length === 0) continue
    for (const cell of trail) path.push(at(cell[0], cell[1]))
    cursor = trail[trail.length - 1]
  }
  return { sweep: path, home }
}

// How far either side of a door or an open stretch the robot lines up to go
// through it, in its own radii: clear of the wall on both sides.
const THROUGH = 1.6
// A way into the next room through an open stretch costs this much more than
// one through a door, so the robot takes the door where there is one. Rooms
// with nothing between them may still have a wall the plan does not draw.
const OPEN_COST = 1.5

// Every way the robot can go on one floor of the home: the round it sweeps
// in each room, the way from one room to another through the doors and open
// stretches between them, and the way back to its dock from anywhere.
export type Plan = {
  // The rooms it can reach, by id.
  has: (room: string) => boolean
  // The round of a room. Its dock's room with no `start` is the one it
  // leaves the dock for, and any other starts where it came in.
  round: (room: string, start?: Point) => Round
  // The way from `at` in one room to another room, through every room on
  // the way, ending just inside it. Null when no way leads there.
  crossing: (from: string, at: Point, to: string) => Point[] | null
  // The way from `at`, in any room, back onto the dock.
  home: (from: string, at: Point) => Point[]
  // The room a point is in, by id.
  roomAt: (at: Point) => string | undefined
}

export function roamPlan(
  dockRoom: RoomConfig,
  rooms: RoomConfig[],
  all: DecorationConfig[],
  self: DecorationConfig,
  radius: number,
): Plan {
  const byId = new Map(rooms.map(room => [room.id, room]))
  byId.set(dockRoom.id, dockRoom)
  const dock = roamRound(dockRoom, all, self, radius)
  const rounds = new Map<string, Round>()
  const round = (id: string, start?: Point): Round => {
    if (id === dockRoom.id && !start) return dock
    const room = byId.get(id)
    if (!room) return dock
    const key = `${id}|${start ?? ''}`
    let found = rounds.get(key)
    if (!found) {
      found = roamRound(room, all, self, radius, start)
      // Joining a round partway, from wherever the robot is, makes a new
      // start each time, so only the last few are kept.
      if (rounds.size > 16) rounds.clear()
      rounds.set(key, found)
    }
    return found
  }

  // The way across a room's free floor between two points, worked out once
  // for each room it is needed in.
  const floors = new Map<string, ReturnType<typeof floorOf>>()
  const walk = (id: string, from: Point, to: Point): Point[] => {
    const room = byId.get(id)
    if (!room) return [to]
    let f = floors.get(id)
    if (!f) {
      f = floorOf(
        room,
        all.filter(d => d.id !== self.id && d.room === id),
        radius,
      )
      floors.set(id, f)
    }
    const a = nearestFree(f.floor, f.cellOf(from))
    const b = nearestFree(f.floor, f.cellOf(to))
    if (!a || !b) return [to]
    return [f.floor.at(a[0], a[1]), ...f.leg(a, b).map(cell => f.floor.at(cell[0], cell[1])), to]
  }

  // The rooms beside each room, through a door or open to it. A stretch with
  // no door that either room hides its sign to is taken for a wall the plan
  // does not draw, so the robot goes round by the doors instead.
  const hidden = (a: RoomConfig, b: string) =>
    !!a.hide_arrows?.includes(b) || !!byId.get(b)?.hide_arrows?.includes(a.id)
  const ways = new Map(
    rooms.map(room => [
      room.id,
      neighboursOf(room, rooms, all).filter(next => next.door || !hidden(room, next.id)),
    ]),
  )

  // The cheapest run of rooms from one to another, as the ways through.
  const hops = (from: string, to: string): Passage[] | null => {
    const cost = new Map<string, number>([[from, 0]])
    const came = new Map<string, Passage>()
    const open = new Set([from])
    while (open.size > 0) {
      let at = ''
      for (const id of open) if (!at || cost.get(id)! < cost.get(at)!) at = id
      open.delete(at)
      if (at === to) break
      for (const next of ways.get(at) ?? []) {
        if (!next.passage) continue
        const total = cost.get(at)! + (next.door ? 1 : OPEN_COST)
        if (total >= (cost.get(next.id) ?? Infinity)) continue
        cost.set(next.id, total)
        came.set(next.id, next.passage)
        open.add(next.id)
      }
    }
    if (!came.has(to)) return null
    const out: Passage[] = []
    for (let id = to; id !== from; id = came.get(id)!.from) out.push(came.get(id)!)
    return out.reverse()
  }

  const crossing = (from: string, at: Point, to: string): Point[] | null => {
    const through = hops(from, to)
    if (!through) return null
    const path: Point[] = [at]
    let here = at
    for (const p of through) {
      const reach = radius * THROUGH
      const before: Point = [p.at[0] - p.out[0] * reach, p.at[1] - p.out[1] * reach]
      const after: Point = [p.at[0] + p.out[0] * reach, p.at[1] + p.out[1] * reach]
      path.push(...walk(p.from, here, before), after)
      here = after
    }
    return path
  }

  const home = (from: string, at: Point): Point[] => {
    if (from === dockRoom.id) return dock.home(at)
    const way = crossing(from, at, dockRoom.id)
    if (!way) return [at, self.position]
    return [...way, ...dock.home(way[way.length - 1]).slice(1)]
  }

  const roomAt = (at: Point) => rooms.find(room => pointStrictlyInside(at, room.points))?.id

  return { has: id => byId.has(id), round, crossing, home, roomAt }
}

// The free cell closest to one that is not, for joining the floor from the
// dock.
function nearestFree(floor: Floor, from: Cell): Cell | null {
  const { nx, ny, ok } = floor
  if (ok(from[0], from[1])) return from
  for (let r = 1; r < nx + ny; r++) {
    for (let di = -r; di <= r; di++) {
      for (const dj of [r - Math.abs(di), -(r - Math.abs(di))]) {
        if (ok(from[0] + di, from[1] + dj)) return [from[0] + di, from[1] + dj]
      }
    }
  }
  return null
}

// How long a polyline is, leg by leg, so a point along it can be found by
// distance rather than by index.
export function legLengths(path: Point[]) {
  const legs: number[] = []
  for (let i = 1; i < path.length; i++) {
    legs.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
  }
  return legs
}

// Where a distance along the path lands, and which way the robot faces
// there, as a turn about the scene's up axis.
export function alongPath(path: Point[], legs: number[], distance: number): { at: Point; heading: number } {
  if (path.length < 2) return { at: path[0] ?? [0, 0], heading: 0 }
  let left = Math.max(distance, 0)
  for (let i = 0; i < legs.length; i++) {
    if (left > legs[i] && i < legs.length - 1) {
      left -= legs[i]
      continue
    }
    const t = legs[i] > 0 ? Math.min(left / legs[i], 1) : 0
    const a = path[i]
    const b = path[i + 1]
    return {
      at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      heading: Math.atan2(b[0] - a[0], -(b[1] - a[1])),
    }
  }
  return { at: path[path.length - 1], heading: 0 }
}
