import { decorationKind, paramValue } from '#/decoration/catalog.ts'
import type { DecorationConfig, Point, RoomConfig } from '#/types.ts'

// The pieces that stand in a wall between two rooms and are seen from both:
// a door is as much the hall's as the bedroom's.
const BETWEEN_KINDS = new Set(['door', 'sliding_door', 'garage_door', 'window', 'blind', 'curtain', 'awning'])
// How near a room's outline has to pass for the piece to be in its wall
// too, in meters. Wider than a wall is thick, narrower than a door is wide.
const BETWEEN_REACH_M = 0.3

function distanceToOutline(p: Point, points: Point[]) {
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const abx = b[0] - a[0]
    const aby = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * aby) / (abx * abx + aby * aby || 1)))
    best = Math.min(best, Math.hypot(p[0] - a[0] - abx * t, p[1] - a[1] - aby * t))
  }
  return best
}

function inside(p: Point, points: Point[]) {
  let within = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) within = !within
  }
  return within
}

// The rooms of a piece in a wall between two. `rooms` is every room it
// belongs to, the one it was put in first. `front` is the room on the side
// the piece faces and `back` the one behind it, so a press can go to the
// room it was made from.
export type Between = { rooms: string[]; front: string; back: string }

// Null for a piece that has only its own room, which is nearly all of them.
export function betweenOf(item: DecorationConfig, rooms: RoomConfig[]): Between | null {
  if (!BETWEEN_KINDS.has(item.kind)) return null
  const others = rooms
    .filter(room => room.id !== item.room)
    .map(room => ({ id: room.id, distance: distanceToOutline(item.position, room.points) }))
    .filter(room => room.distance <= BETWEEN_REACH_M)
    .sort((a, b) => a.distance - b.distance)
  if (others.length === 0) return null
  // A wall piece faces plan -y at rotation 0. A step that way from where it
  // stands is either in its own room or it is not.
  const turn = ((item.rotation ?? 0) * Math.PI) / 180
  const ahead: Point = [item.position[0] + Math.sin(turn) * 0.25, item.position[1] - Math.cos(turn) * 0.25]
  const own = rooms.find(room => room.id === item.room)
  const faces = own ? inside(ahead, own.points) : true
  const other = others[0].id
  return {
    rooms: [item.room, ...others.map(room => room.id)],
    front: faces ? item.room : other,
    back: faces ? other : item.room,
  }
}

// Which of its two rooms a piece is looked at from: the one the camera is
// looking out of, across the wall, whichever side of it the camera happens
// to hang over. The piece stands at x, z in the scene, turned by `turn`.
// `look` is the way the camera faces and `camera` where it is, which only
// decides when the camera looks straight down and faces neither way.
type Flat = { x: number; z: number }
export function roomLookedFrom(between: Between, x: number, z: number, turn: number, look: Flat, camera: Flat) {
  const flat = Math.hypot(look.x, look.z)
  const facing =
    flat > 1e-3
      ? -(look.x * Math.sin(turn) + look.z * Math.cos(turn))
      : (camera.x - x) * Math.sin(turn) + (camera.z - z) * Math.cos(turn)
  return facing >= 0 ? between.front : between.back
}

// The openings a blind or a curtain hangs over, and the covers that do.
const OPENING_KINDS = new Set(['window', 'door', 'sliding_door', 'garage_door'])
const COVER_KINDS = new Set(['blind', 'curtain'])

// The blinds and curtains hanging over an opening, on either side of it:
// the ones with a device, `bound` saying which have, that are within the
// opening's width of its middle. An opening with no device of its own hands
// its presses to them, so a press on the glass works the blind.
export function coversOver(
  item: DecorationConfig,
  all: DecorationConfig[],
  bound: (id: string) => boolean,
): DecorationConfig[] {
  if (!OPENING_KINDS.has(item.kind) || bound(item.id)) return []
  const kind = decorationKind(item.kind)
  if (!kind) return []
  const reach = Math.max(BETWEEN_REACH_M, paramValue(kind, item.params, 'width', item.variant) / 2)
  return all.filter(
    other =>
      COVER_KINDS.has(other.kind) &&
      bound(other.id) &&
      Math.hypot(other.position[0] - item.position[0], other.position[1] - item.position[1]) <= reach,
  )
}

// Covers this close to being equally near a press are taken as hanging over
// the same stretch of the opening, in meters.
const SAME_STRETCH_M = 0.05

// Which of the covers over an opening a press at `point` on the plan is
// for: the one hanging over that stretch of it, so each half of a wide
// window works the blind over it. Where two hang over the same stretch, a
// blind comes before a curtain, and then the one whose middle is nearer.
export function coverAt(covers: DecorationConfig[], point: Point): DecorationConfig | undefined {
  const measured = covers.map(cover => {
    const kind = decorationKind(cover.kind)
    const half = kind ? paramValue(kind, cover.params, 'width', cover.variant) / 2 : 0
    // A wall piece is as wide as it is along the wall it stands in.
    const turn = ((cover.rotation ?? 0) * Math.PI) / 180
    const dx = point[0] - cover.position[0]
    const dy = point[1] - cover.position[1]
    const along = Math.abs(dx * Math.cos(turn) + dy * Math.sin(turn))
    return { cover, past: Math.max(0, along - half), middle: Math.hypot(dx, dy) }
  })
  const nearest = Math.min(...measured.map(m => m.past))
  return measured
    .filter(m => m.past <= nearest + SAME_STRETCH_M)
    .sort((a, b) => Number(b.cover.kind === 'blind') - Number(a.cover.kind === 'blind') || a.middle - b.middle)[0]
    ?.cover
}
