import { roomOfName } from '#/lib/follow.ts'
import type { HomeAssistant, RoomConfig } from '#/types.ts'

// The room a robot vacuum says it is in, so the robot in the diorama can
// drive there. Home Assistant has no word of its own for it, so it is read
// the ways the integrations that know it say it:
//
// - an attribute of the vacuum, `current_room` as Tapo has it, or one of the
//   other names below, holding the room's name, an object with a `name`, or
//   an area's id in `area_id`,
// - a sensor or a select on the same device whose id ends in room, area or
//   segment, like a current room sensor, whose state is the name.
//
// The name is then matched to a room as a person's area is for following:
// by its area's id, name or aliases, or by the room's own name. A robot
// whose app names the rooms in another language is matched by giving each
// area the robot's name for it as an alias in Home Assistant.

// The attributes a vacuum may say its room in, the likeliest first.
const ATTRIBUTES = ['current_room', 'current_area', 'current_segment', 'current_zone', 'room', 'area', 'segment']

// The word a sensor's id ends in when it says the room, and the words that
// say it is about a past round, which is not where the robot is now. Only
// the end counts, since the device's own name, like living_room_vacuum,
// starts the id of every entity it has.
const NAMES_ROOM = /(^|_)(room|area|segment|zone)$/
const PAST = /last|previous|history|total|cleaned/

// The name, or the area's id, an attribute's value holds.
function nameIn(value: unknown): { name?: string; area?: string } | undefined {
  if (typeof value === 'string') return { name: value }
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    const area = typeof v.area_id === 'string' ? v.area_id : undefined
    const name = typeof v.name === 'string' ? v.name : undefined
    if (area || name) return { area, name }
  }
  return undefined
}

// The sensors and selects on each device that may say the room, by device
// id, worked out once for each registry Home Assistant hands over.
const roomSensorsByRegistry = new WeakMap<object, Map<string, string[]>>()

function roomSensors(hass: HomeAssistant, device: string): string[] {
  const registry = hass.entities ?? {}
  let byDevice = roomSensorsByRegistry.get(registry)
  if (!byDevice) {
    byDevice = new Map()
    for (const entry of Object.values(registry)) {
      const id = entry.entity_id
      if (!entry.device_id || !(id.startsWith('sensor.') || id.startsWith('select.'))) continue
      const object = id.slice(id.indexOf('.') + 1)
      if (!NAMES_ROOM.test(object) || PAST.test(object)) continue
      const list = byDevice.get(entry.device_id) ?? []
      list.push(id)
      byDevice.set(entry.device_id, list)
    }
    roomSensorsByRegistry.set(registry, byDevice)
  }
  return byDevice.get(device) ?? []
}

// The room of `rooms` the vacuum says it is in right now, by id. Undefined
// when it says none, or names one the plan does not have.
export function vacuumRoom(hass: HomeAssistant, entityId: string, rooms: RoomConfig[]): string | undefined {
  const entity = hass.states[entityId]
  if (!entity) return undefined
  const byArea = (area: string | undefined) => (area ? rooms.find(room => room.area_id === area) : undefined)
  const byName = (name: string | undefined) => (name ? roomOfName(hass, rooms, name) : undefined)
  for (const key of ATTRIBUTES) {
    const said = nameIn(entity.attributes[key])
    const room = said && (byArea(said.area) ?? byName(said.name))
    if (room) return room.id
  }
  const device = hass.entities?.[entityId]?.device_id
  if (!device) return undefined
  for (const id of roomSensors(hass, device)) {
    const sensor = hass.states[id]
    if (!sensor) continue
    const room =
      byArea(typeof sensor.attributes.area_id === 'string' ? sensor.attributes.area_id : undefined) ??
      byName(sensor.state)
    if (room) return room.id
  }
  return undefined
}
