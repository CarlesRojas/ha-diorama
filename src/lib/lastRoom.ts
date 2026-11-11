import type { CardConfig } from '#/types.ts'

// The room each card was showing, so a card that Home Assistant builds
// again opens on the same room. It does that when the app comes back from
// the background and draws the dashboard anew. Kept for the browser tab, so
// it lasts through a reload of the page too, and starts empty in a new tab.
const KEY = 'diorama-room'

// Kept here as well, for when the browser keeps nothing.
let rooms: Record<string, string> = {}
try {
  rooms = JSON.parse(sessionStorage.getItem(KEY) ?? '{}')
} catch {
  // Nothing kept, or nothing that can be read.
}

// A card is known by the page it is on and the rooms it has.
export const cardKey = (config: CardConfig) =>
  `${location.pathname}|${(config.rooms ?? []).map(room => room.id).join(',')}`

export function lastRoom(card: string): string | null {
  return rooms[card] ?? null
}

export function keepRoom(card: string, room: string | null) {
  if ((rooms[card] ?? null) === room) return
  rooms = { ...rooms }
  if (room) rooms[card] = room
  else delete rooms[card]
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rooms))
  } catch {
    // Kept for this page only.
  }
}

// The floor each card with floors was showing, kept the same way, so a card
// built again opens on that floor even with no room in view.
const FLOOR_KEY = 'diorama-floor'

let floors: Record<string, string> = {}
try {
  floors = JSON.parse(sessionStorage.getItem(FLOOR_KEY) ?? '{}')
} catch {
  // Nothing kept, or nothing that can be read.
}

export function lastFloor(card: string): string | null {
  return floors[card] ?? null
}

export function keepFloor(card: string, floor: string | null) {
  if ((floors[card] ?? null) === floor) return
  floors = { ...floors }
  if (floor) floors[card] = floor
  else delete floors[card]
  try {
    sessionStorage.setItem(FLOOR_KEY, JSON.stringify(floors))
  } catch {
    // Kept for this page only.
  }
}
