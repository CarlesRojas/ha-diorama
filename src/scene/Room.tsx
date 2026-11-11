import type { FloorConfig, Point, RoomConfig } from '#/types.ts'
import { SLAB_BEVEL_SEGMENTS, SLAB_CURVE_SEGMENTS } from '#/constants.ts'
import SurfaceMaterial from '#/scene/SurfaceMaterial.tsx'
import type { SurfaceKind } from '#/materials/textures.ts'
import {
  FLOOR_MATERIALS,
  FLOOR_PATTERN_SHIFT_M,
  ROOM_SLAB_EDGE_RADIUS_M,
  ROOM_SLAB_STEP_MAX_DROP_M,
  ROOM_SLAB_THICKNESS_M,
} from '#/theme.ts'
import { floorColor } from '#/scene/floorColor.ts'
import { useEased } from '#/scene/decor/ease.ts'
import { presenceTint } from '#/scene/presence.ts'
import { ensureCounterClockwise, inset, roundedShape } from '#/geometry/polygon.ts'
import { elevationOf, elevationRange } from '#/geometry/elevation.ts'
import { slabGeometry, touchesNeighbour } from '#/geometry/slab.ts'
import { memo, useMemo } from 'react'

// Floors this close to touching are drawn as touching, in meters.
const TOUCHING_GAP_M = 0.001

type Props = {
  room: RoomConfig
  // Every room of the home, to tell where this one touches another.
  rooms: RoomConfig[]
  index: number
  radius: number
  gap: number
  floors?: FloorConfig[]
  // Someone is in the room, by its presence sensor.
  occupied?: boolean
}

// Clicks on the floor are not taken here. The press fallback finds the room
// under a press once the pieces around it have had their turn.
function Room({ room, rooms, index, radius, gap, floors, occupied = false }: Props) {
  const elevation = elevationOf(room, floors)
  const defaultFloorId = 'floor-0'
  const roomFloorId = room.floor_id ?? defaultFloorId
  const floorRooms = rooms.filter(r => (r.floor_id ?? defaultFloorId) === roomFloorId)
  const [lowestRoomElevation] = elevationRange(
    floorRooms.map(r => ({ ...r, floor_id: undefined }))
  )
  const geometry = useMemo(() => {
    const points = inset(ensureCounterClockwise(room.points), gap / 2)
    const cornerRadius = room.radius ?? radius
    // Neighbours at the same or higher elevation, where slabs meet flat
    const higherNeighbours =
      gap > TOUCHING_GAP_M
        ? []
        : floorRooms.filter(other => other.id !== room.id && elevationOf(other, floors) >= elevation).map(r => r.points)

    // Neighbours at lower elevation, touching this room to form a step
    const lowerNeighbours =
      gap > TOUCHING_GAP_M
        ? []
        : floorRooms.filter(other => other.id !== room.id && elevationOf(other, floors) < elevation).map(r => r.points)

    const outline = roundedShape(points, cornerRadius, cornerRadius + gap, i => touchesNeighbour(points[i], higherNeighbours))
      .getPoints(SLAB_CURVE_SEGMENTS)
      .map((p): Point => [p.x, p.y])

    // Solid step down only applies if this room actually borders a lower room in the same layout
    // and the height offset is within a sensible threshold (<= 50 cm), avoiding huge solid blocks
    const touchesLower = points.some(p => touchesNeighbour(p, lowerNeighbours))
    const drop = (room.elevation ?? 0) - lowestRoomElevation
    const stepDepth = touchesLower && drop > 0 && drop <= ROOM_SLAB_STEP_MAX_DROP_M ? drop : 0
    const slabDepth = (room.thickness ?? ROOM_SLAB_THICKNESS_M) + stepDepth

    return slabGeometry(
      outline,
      higherNeighbours,
      ROOM_SLAB_EDGE_RADIUS_M,
      slabDepth,
      SLAB_BEVEL_SEGMENTS,
      FLOOR_PATTERN_SHIFT_M,
    )
  }, [room.id, room.points, room.radius, room.elevation, room.thickness, floorRooms, floors, lowestRoomElevation, radius, gap, elevation])

  const floor = room.floor ? FLOOR_MATERIALS[room.floor.material] : undefined
  // The presence filter fades over the floor and away again.
  const shown = useEased(occupied ? 1 : 0, 4)
  const color = presenceTint(floorColor(room, index), room, shown)

  return (
    <mesh
      // Named so the outline and the press fallback can find the room.
      name={`room:${room.id}`}
      position={[0, elevation, 0]}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      {floor ? (
        // Extrude UVs are plan meters, so the surface tiles at its own
        // physical size, scaled and turned by what the room asks for.
        <SurfaceMaterial
          kind={(floor.surface ?? 'matte') as SurfaceKind}
          color={color}
          scale={room.floor?.scale ?? 1}
          rotation={room.floor?.rotation ?? 0}
          intensity={room.floor?.intensity ?? 1}
        />
      ) : (
        <meshStandardMaterial color={color} roughness={0.85} />
      )}
    </mesh>
  )
}

export default memo(Room)
