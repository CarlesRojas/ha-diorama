import type { RoomConfig } from '#/types.ts'

// How far a room's floor stands above the rest of the home, in meters.
export const elevationOf = (room: RoomConfig | undefined) => room?.elevation ?? 0

// The lowest and highest floors of the home, never above or below level,
// so the slabs can all reach down to one base and the framing can take in
// the floors that stand above the rest.
export function elevationRange(rooms: RoomConfig[]): [number, number] {
  let low = 0
  let high = 0
  for (const room of rooms) {
    low = Math.min(low, elevationOf(room))
    high = Math.max(high, elevationOf(room))
  }
  return [low, high]
}
