import type { FloorConfig, RoomConfig } from '#/types.ts'

export function getFloorElevation(floorId: string | undefined, floors?: FloorConfig[]): number {
  if (!floors || floors.length === 0) return 0
  const targetId = floorId ?? 'floor-0'
  const floor = floors.find(f => f.id === targetId)
  return floor?.elevation ?? 0
}

// How far a room's floor stands above the rest of the home, in meters.
// Combines the room's own elevation (split-level / steps) with its floor's elevation.
export const elevationOf = (room: RoomConfig | undefined, floors?: FloorConfig[]) =>
  (room?.elevation ?? 0) + getFloorElevation(room?.floor_id, floors)

// The lowest and highest floors of the home, never above or below level,
// so the slabs can all reach down to one base and the framing can take in
// the floors that stand above the rest.
export function elevationRange(rooms: RoomConfig[], floors?: FloorConfig[]): [number, number] {
  let low = 0
  let high = 0
  for (const room of rooms) {
    low = Math.min(low, elevationOf(room, floors))
    high = Math.max(high, elevationOf(room, floors))
  }
  return [low, high]
}
