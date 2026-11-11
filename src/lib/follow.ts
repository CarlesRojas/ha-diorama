import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { occupied } from '#/scene/presence.ts'
import type { CardConfig, FollowConfig, HomeAssistant, RoomConfig } from '#/types.ts'

// Following someone around the home: the card flies to the room they are
// in, on the screens where it is turned on. Who it follows is one of
//
// - `me`, the person linked to whoever is logged in on the screen,
// - a person, by their entity id,
// - `anyone`, the only room whose presence sensor says someone is there.
//
// A person's room comes from a sensor whose state names an area, as the
// ones Bermuda or ESPresense make for a phone or a watch. It is looked for
// among the entities of the person's trackers, or named as `sensor`.

export const FOLLOW_ME = 'me'
export const FOLLOW_ANYONE = 'anyone'

// States that say a sensor knows of no room at all.
const NOWHERE = new Set(['unknown', 'unavailable', 'not_home', 'away', 'none', ''])

// Lower case with anything but letters and digits as one underscore, so
// "Living Room", "living_room" and "living-room" are the same name.
const simple = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

// The room a sensor's state names: by its area's id or name, or the room's
// own name. Bermuda also gives the area's id as an attribute, which wins.
export function roomNamed(hass: HomeAssistant, rooms: RoomConfig[], entityId: string): RoomConfig | undefined {
  const entity = hass.states[entityId]
  if (!entity) return undefined
  const areaId = entity.attributes.area_id
  if (typeof areaId === 'string') {
    const room = rooms.find(r => r.area_id === areaId)
    if (room) return room
  }
  if (NOWHERE.has(entity.state.toLowerCase())) return undefined
  const name = simple(entity.state)
  return rooms.find(room => {
    const area = room.area_id ? hass.areas[room.area_id] : undefined
    return (
      (room.area_id && simple(room.area_id) === name) ||
      (area && simple(area.name) === name) ||
      (room.name && simple(room.name) === name)
    )
  })
}

// The person linked to the user logged in on this screen.
export function personOfUser(hass: HomeAssistant): string | undefined {
  const user = hass.user?.id
  if (!user) return undefined
  return Object.values(hass.states).find(e => e.entity_id.startsWith('person.') && e.attributes.user_id === user)
    ?.entity_id
}

// The sensors that may say which room a person is in: their trackers, and
// the sensors on the same devices as those trackers. Bermuda's is called
// after the area, so one ending in `_area` comes first, then those that
// name a room right now.
export function sensorsOfPerson(hass: HomeAssistant, rooms: RoomConfig[], person: string): string[] {
  const trackers = hass.states[person]?.attributes.device_trackers
  if (!Array.isArray(trackers)) return []
  const devices = new Set(trackers.map(id => hass.entities?.[id as string]?.device_id).filter((d): d is string => !!d))
  const onDevices = Object.values(hass.entities ?? {})
    .filter(e => e.device_id && devices.has(e.device_id) && e.entity_id.startsWith('sensor.'))
    .map(e => e.entity_id)
  const all = [...new Set([...onDevices, ...(trackers as string[])])].filter(id => hass.states[id])
  const rank = (id: string) => (id.endsWith('_area') ? 0 : roomNamed(hass, rooms, id) ? 1 : 2)
  return all.filter(id => rank(id) < 2).sort((a, b) => rank(a) - rank(b))
}

// Every sensor that names one of the rooms right now, to choose from when
// a person's own cannot be found.
export function roomSensors(hass: HomeAssistant, rooms: RoomConfig[]): string[] {
  return Object.keys(hass.states).filter(
    id => (id.startsWith('sensor.') || id.startsWith('device_tracker.')) && roomNamed(hass, rooms, id),
  )
}

// The person a follow is for, `me` turned into the one logged in.
export function followedPerson(hass: HomeAssistant, follow: FollowConfig): string | undefined {
  if (follow.who === FOLLOW_ANYONE) return undefined
  return follow.who === FOLLOW_ME ? personOfUser(hass) : follow.who
}

// The sensor a follow reads the room from, the one chosen or the one found.
export function followedSensor(hass: HomeAssistant, rooms: RoomConfig[], follow: FollowConfig): string | undefined {
  if (follow.who === FOLLOW_ANYONE) return undefined
  if (follow.sensor) return follow.sensor
  const person = followedPerson(hass, follow)
  return person ? sensorsOfPerson(hass, rooms, person)[0] : undefined
}

// The room the card should be showing for a follow, or nothing when no one
// is in a room it knows, or when more than one room has someone in it.
export function followedRoom(hass: HomeAssistant | null, config: CardConfig, follow?: FollowConfig): string | null {
  if (!hass || !follow) return null
  const rooms = config.rooms ?? []
  if (follow.who === FOLLOW_ANYONE) {
    const there = rooms.filter(room => occupied(hass, room))
    return there.length === 1 ? there[0].id : null
  }
  const sensor = followedSensor(hass, rooms, follow)
  return (sensor && roomNamed(hass, rooms, sensor)?.id) || null
}

// How long the room must stay the same before the card flies there, so a
// sensor that flickers between two rooms as someone walks by moves nothing.
const SETTLE_MS = 3000
// How long the card waits after it was last touched, so it never takes the
// view away from someone looking around by hand.
const QUIET_MS = 60_000
// How often to try again while the 3D view is still loading.
const RETRY_MS = 200

// Flies to the room someone moved to, once it has settled and no one has
// touched the card for a while. Only a change of room moves the camera: a
// room left by hand stays left until they go to another one. `go` flies to
// a room and says whether it could. `touched` is to be called on every
// press, wheel or key on the card.
export function useFollow(room: string | null, active: boolean, go: (room: string) => boolean) {
  const [settled, setSettled] = useState(room)
  useEffect(() => {
    if (room === settled) return
    const timer = setTimeout(() => setSettled(room), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [room, settled])

  const lastTouch = useRef(0)
  const followed = useRef<string | null>(null)
  const goNow = useRef(go)
  useLayoutEffect(() => {
    goNow.current = go
  })
  useEffect(() => {
    if (!active) return
    // Out of every room, or in more than one: the next room is news again.
    if (!settled) {
      followed.current = null
      return
    }
    if (settled === followed.current) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const attempt = () => {
      const wait = lastTouch.current + QUIET_MS - Date.now()
      if (wait > 0) timer = setTimeout(attempt, wait)
      else if (goNow.current(settled)) followed.current = settled
      else timer = setTimeout(attempt, RETRY_MS)
    }
    attempt()
    return () => clearTimeout(timer)
  }, [settled, active])

  return useCallback(() => {
    lastTouch.current = Date.now()
  }, [])
}
