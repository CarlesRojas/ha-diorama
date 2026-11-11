import { distanceToOutline } from '#/decoration/between.ts'
import { decorationKind, decorationVariant, footprint, paramValue } from '#/decoration/catalog.ts'
import { pointOnBoundary, pointStrictlyInside } from '#/geometry/overlap.ts'
import type { CardConfig, DecorationConfig, Point, RoomConfig } from '#/types.ts'

// The floors of a home. A card with none, or with one, has every room on
// the same floor and shows them all, as it always has. With two or more it
// shows one floor at a time, and a flight of stairs that climbs a whole
// storey leads from its floor to the one above.

// A floor as the card reads it, its name and level filled in.
export type Floor = { id: string; name: string; level: number }

// A flight this tall or taller climbs a whole storey. A lower one is a few
// steps up to a raised floor and leads nowhere.
export const STOREY_RISE_M = 1.8
// The landing is looked for this far past the top step, so a room drawn
// right against the top of the flight is the one it arrives in, and a room
// up to this far away from there will do when none is right there.
const LANDING_STEP_M = 0.3
const LANDING_REACH_M = 1.5

// What a floor is called when it is given no name, by its level.
export function levelName(level: number) {
  if (level === 0) return 'Ground floor'
  if (level < 0) return level === -1 ? 'Basement' : `Basement ${-level}`
  const names = ['First', 'Second', 'Third', 'Fourth', 'Fifth']
  return level <= names.length ? `${names[level - 1]} floor` : `Floor ${level}`
}

// The floors from the lowest up. A floor with no level takes its place in
// the list as one, and a second floor with an id already taken is left out.
export function floorsOf(config: Pick<CardConfig, 'floors'>): Floor[] {
  const seen = new Set<string>()
  const list = Array.isArray(config.floors) ? config.floors : []
  return list
    .map((floor, index) => ({ floor, index }))
    .filter(({ floor }) => typeof floor?.id === 'string' && !seen.has(floor.id) && !!seen.add(floor.id))
    .map(({ floor, index }) => {
      const level = typeof floor.level === 'number' && Number.isFinite(floor.level) ? floor.level : index
      return { id: floor.id, name: floor.name?.trim() || levelName(level), level, index }
    })
    .sort((a, b) => a.level - b.level || a.index - b.index)
    .map(({ id, name, level }) => ({ id, name, level }))
}

// Whether the card has floors to switch between.
export const hasFloors = (config: Pick<CardConfig, 'floors'>) => floorsOf(config).length > 1

// The floor the card opens on: the ground floor, or the lowest one above
// it, or with every floor below ground the highest of them.
export function startFloor(floors: Floor[]): Floor | undefined {
  return floors.find(floor => floor.level >= 0) ?? floors[floors.length - 1]
}

// The floor a room is on. A room that names no floor, or one the card does
// not have, is on the floor the card opens on.
export function floorOf(room: Pick<RoomConfig, 'floor_id'> | undefined, floors: Floor[]): string | undefined {
  if (room?.floor_id && floors.some(floor => floor.id === room.floor_id)) return room.floor_id
  return startFloor(floors)?.id
}

// The rooms on a floor, all of them for a card with no floors to switch.
export function roomsOn(config: CardConfig, floor: string | null | undefined): RoomConfig[] {
  const rooms = config.rooms ?? []
  const floors = floorsOf(config)
  if (floors.length < 2 || !floor) return rooms
  return rooms.filter(room => floorOf(room, floors) === floor)
}

const inside = (point: Point, room: RoomConfig) =>
  pointStrictlyInside(point, room.points) || pointOnBoundary(point, room.points)

// From the stair's own frame to the plan: x across, z toward its foot.
function toPlan(item: DecorationConfig, [x, z]: [number, number], turnOnly = false): Point {
  const a = ((item.rotation ?? 0) * Math.PI) / 180
  const wx = x * Math.cos(a) + z * Math.sin(a)
  const wz = -x * Math.sin(a) + z * Math.cos(a)
  return turnOnly ? [wx, -wz] : [item.position[0] + wx, item.position[1] - wz]
}

// Where a flight starts and where it arrives on the plan, which way it
// heads as it arrives, and how far it climbs. A straight flight climbs from
// its foot at the front to the back. A quarter turn arrives at the end of
// its second flight, out to the side it turns to.
export function stairEnds(item: DecorationConfig) {
  const kind = decorationKind(item.kind)
  if (!kind || kind.id !== 'stairs') return null
  const v = (id: string) => paramValue(kind, item.params, id, item.variant)
  const w = v('width')
  const l = v('length')
  const rise = v('height')
  if (decorationVariant(kind, item.variant)?.id === 'quarter') {
    const s = v('flip') > 0.5 ? -1 : 1
    const across = w + v('reach')
    return {
      foot: toPlan(item, [s * (w / 2 - across / 2), l / 2]),
      top: toPlan(item, [(s * across) / 2, w / 2 - l / 2]),
      heading: toPlan(item, [s, 0], true),
      rise,
    }
  }
  return {
    foot: toPlan(item, [0, l / 2]),
    top: toPlan(item, [0, -l / 2]),
    heading: toPlan(item, [0, -1], true),
    rise,
  }
}

// A flight of stairs that joins two floors: the room it stands in, and the
// room on the floor above that its top step arrives in.
export type StairLink = {
  id: string
  rise: number
  lower: { floor: string; room: string }
  upper: { floor: string; room: string }
}

// Every flight that climbs a whole storey to a floor above it, with a room
// on that floor where it arrives.
export function stairLinks(config: CardConfig): StairLink[] {
  const floors = floorsOf(config)
  if (floors.length < 2) return []
  const rooms = config.rooms ?? []
  const roomById = new Map(rooms.map(room => [room.id, room]))
  const links: StairLink[] = []
  for (const item of config.decorations ?? []) {
    if (item.kind !== 'stairs') continue
    const ends = stairEnds(item)
    const room = roomById.get(item.room)
    if (!ends || !room || ends.rise < STOREY_RISE_M) continue
    const from = floorOf(room, floors)
    const above = floors[floors.findIndex(floor => floor.id === from) + 1]
    if (!from || !above) continue
    const landing: Point = [
      ends.top[0] + ends.heading[0] * LANDING_STEP_M,
      ends.top[1] + ends.heading[1] * LANDING_STEP_M,
    ]
    const upstairs = rooms.filter(other => floorOf(other, floors) === above.id)
    const near = upstairs
      .map(other => ({ other, distance: inside(landing, other) ? 0 : distanceToOutline(landing, other.points) }))
      .filter(entry => entry.distance <= LANDING_REACH_M)
      .sort((a, b) => a.distance - b.distance)[0]
    if (!near) continue
    links.push({
      id: item.id,
      rise: ends.rise,
      lower: { floor: from, room: room.id },
      upper: { floor: above.id, room: near.other.id },
    })
  }
  return links
}

// The card as one floor of it shows: that floor's rooms, what is in them
// and the devices behind it, and the flights that climb up to it from the
// floor below, drawn below its floor so their top steps meet it and put in
// the rooms they arrive in. A card with no floors to switch is given back
// as it is.
export function floorView(config: CardConfig, floor: string | null | undefined): CardConfig {
  if (!floor || !hasFloors(config)) return config
  const rooms = roomsOn(config, floor)
  const ids = new Set(rooms.map(room => room.id))
  const byId = new Map((config.decorations ?? []).map(item => [item.id, item]))
  const arriving = stairLinks(config)
    .filter(link => link.upper.floor === floor)
    .flatMap(link => {
      const item = byId.get(link.id)
      if (!item) return []
      const { on: _on, floor: _floor, ...rest } = item
      return [{ ...rest, room: link.upper.room, below: link.rise }]
    })
  return {
    ...config,
    rooms,
    decorations: [...(config.decorations ?? []).filter(item => ids.has(item.room)), ...arriving],
    devices: (config.devices ?? []).filter(device => ids.has(device.room)),
    frame_rooms: config.frame_rooms?.filter(id => ids.has(id)),
  }
}

// What the tiles are told about the floor in view: its rooms, and the
// areas that are only on other floors, whose tiles step aside for it.
export type FloorFilter = { id: string; rooms: string[]; away: string[] }

export function floorFilter(config: CardConfig, floor: string): FloorFilter {
  const floors = floorsOf(config)
  const here = new Set<string>()
  const there = new Set<string>()
  const rooms: string[] = []
  for (const room of config.rooms ?? []) {
    const on = floorOf(room, floors) === floor
    if (on) rooms.push(room.id)
    if (room.area_id) (on ? here : there).add(room.area_id)
  }
  return { id: floor, rooms, away: [...there].filter(area => !here.has(area)) }
}

// The outline a piece takes up on the plan, its corners in order: a flight
// of stairs in its stairwell, or a piece of the floor below under the plan.
export function pieceOutline(item: DecorationConfig): Point[] {
  const kind = decorationKind(item.kind)
  if (!kind) return []
  const [w, d] = footprint(kind, item.params, item.variant)
  return (
    [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [w / 2, d / 2],
      [-w / 2, d / 2],
    ] as [number, number][]
  ).map(corner => toPlan(item, corner))
}
