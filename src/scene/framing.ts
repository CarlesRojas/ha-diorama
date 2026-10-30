import { CAMERA_DIRECTION, CAMERA_FIT_MARGIN, CAMERA_FOV_DEG } from '#/constants.ts'
import { decorationKind, paramValue } from '#/decoration/catalog.ts'
import { standHeight } from '#/decoration/surfaces.ts'
import { elevationRange } from '#/geometry/elevation.ts'
import { CEILING_HEIGHT_M, ROOM_SLAB_THICKNESS_M } from '#/theme.ts'
import type { CameraView, DecorationConfig, FloorConfig, RoomConfig } from '#/types.ts'
import { MathUtils, Vector3 } from 'three'

export type Framing = {
  position: Vector3
  target: Vector3
}

// Places the camera along a fixed direction so the flat's bounding box fits
// the viewport. Plan y maps to -z in the scene.
// Tallest point the scene reaches, so the camera frames fixtures too.
export function sceneHeight(decorations: DecorationConfig[] = []) {
  let top = 0.6
  for (const item of decorations) {
    const kind = decorationKind(item.kind)
    if (!kind) continue
    if (kind.mount === 'ceiling') return CEILING_HEIGHT_M
    const height = paramValue(kind, item.params, 'height')
    top = Math.max(top, standHeight(item, decorations) + height + 0.4)
  }
  return top
}

// Where the flat sits in the scene and how far it reaches from there. The
// sun uses it to stand over the flat and to cover exactly it, which keeps
// its shadow map fine grained however small the home is.
export function planBounds(rooms: RoomConfig[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const room of rooms) {
    for (const [x, y] of room.points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) return { center: [0, 0, 0] as [number, number, number], reach: 4 }
  const center: [number, number, number] = [(minX + maxX) / 2, 0, -(minY + maxY) / 2]
  const reach = Math.max(maxX - minX, maxY - minY) / 2
  return { center, reach }
}

// The camera stands along `from`, a direction from the target to the camera,
// or along the standard one when none is given. `margin` is how much room
// is left around the flat, as a factor of the distance. `center` moves the
// target until the flat sits in the middle of the view, so no side keeps
// more empty space than the others, and fits the rooms' own corners rather
// than the box around them all, whose empty corners pushed a room off to
// one side. `spill` lets them run past the sides of the view by that factor
// of its width, while the top and the bottom still fit. `whole` are shapes
// on the floor, like the signs out of a room, that never run past them.
export function frameRooms(
  rooms: RoomConfig[],
  aspect: number,
  height = 0.6,
  from: [number, number, number] = CAMERA_DIRECTION,
  margin = CAMERA_FIT_MARGIN,
  center = false,
  spill = 1,
  whole: RoomConfig[] = [],
  floors?: FloorConfig[],
): Framing {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const room of [...rooms, ...whole]) {
    for (const [x, y] of room.points) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  if (!Number.isFinite(minX)) {
    minX = minY = -1
    maxX = maxY = 1
  }

  const target = new Vector3((minX + maxX) / 2, height * 0.35, -(minY + maxY) / 2)
  const direction = new Vector3(...from).normalize()

  // Camera basis for a camera at `target + direction * d` looking at target.
  const forward = direction.clone().negate()
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const up = new Vector3().crossVectors(right, forward).normalize()

  const vFov = MathUtils.degToRad(CAMERA_FOV_DEG)
  const tanV = Math.tan(vFov / 2)
  const tanH = tanV * aspect

  // For each corner, the distance the camera needs so that the corner
  // still fits horizontally and vertically. The farthest wins.
  const corners: Vector3[] = []
  const spills: number[] = []
  const floor = center ? rooms.flatMap(room => room.points) : [minX, maxX].flatMap(x => [minY, maxY].map(y => [x, y]))
  // Floors raised or sunk reach the box higher or lower.
  const [low, high] = elevationRange([...rooms, ...whole], floors)
  const add = (points: number[][], by: number) => {
    for (const [x, y] of points)
      for (const z of [low - ROOM_SLAB_THICKNESS_M, height + high]) {
        corners.push(new Vector3(x, z, -y))
        spills.push(by)
      }
  }
  add(floor, spill)
  add(
    whole.flatMap(shape => shape.points),
    1,
  )
  const fit = () => {
    let distance = 0
    corners.forEach((point, i) => {
      const corner = point.clone().sub(target)
      const depth = corner.dot(forward)
      const dx = Math.abs(corner.dot(right))
      const dy = Math.abs(corner.dot(up))
      distance = Math.max(distance, dx / (tanH * spills[i]) - depth, dy / tanV - depth)
    })
    return distance
  }

  let distance = fit()
  // The box seen at an angle is not symmetric around its center: its top
  // reaches further on screen than its bottom. Each pass moves the target
  // to the middle of what shows and fits again.
  for (let pass = 0; center && pass < 4; pass++) {
    let left = Infinity
    let rightmost = -Infinity
    let bottom = Infinity
    let top = -Infinity
    for (const point of corners) {
      const corner = point.clone().sub(target)
      const depth = distance + corner.dot(forward)
      const x = corner.dot(right) / depth
      const y = corner.dot(up) / depth
      left = Math.min(left, x)
      rightmost = Math.max(rightmost, x)
      bottom = Math.min(bottom, y)
      top = Math.max(top, y)
    }
    target
      .addScaledVector(right, ((left + rightmost) / 2) * distance)
      .addScaledVector(up, ((bottom + top) / 2) * distance)
    distance = fit()
  }

  const position = target.clone().addScaledVector(direction, distance * margin)
  return { position, target }
}

// A saved view, kept as it is when the whole plan shows in it at this
// aspect, and otherwise backed off along the same angle until it does. The
// view is saved in a 3D view of one shape and shown in cards of others, a
// square on a phone or a tall half of a screen, where it could cut the home
// off.
export function fitView(
  view: CameraView,
  rooms: RoomConfig[],
  aspect: number,
  height = 0.6,
  margin = CAMERA_FIT_MARGIN,
  // Frames the plan along the view's angle even when it already fits, for
  // a card too small to spare the room the saved view leaves around it.
  closeIn = false,
  spill = 1,
  whole: RoomConfig[] = [],
  floors?: FloorConfig[],
): Framing {
  const position = new Vector3(...view.position)
  const target = new Vector3(...view.target)
  const forward = target.clone().sub(position).normalize()
  const right = new Vector3().crossVectors(forward, new Vector3(0, 1, 0)).normalize()
  const up = new Vector3().crossVectors(right, forward).normalize()
  const tanV = Math.tan(MathUtils.degToRad(CAMERA_FOV_DEG) / 2) / margin
  const tanH = tanV * aspect

  const [low, high] = elevationRange([...rooms, ...whole], floors)
  let fits = true
  const corner = new Vector3()
  for (const room of [...rooms, ...whole]) {
    for (const [x, y] of room.points) {
      for (const z of [low - ROOM_SLAB_THICKNESS_M, height + high]) {
        corner.set(x, z, -y).sub(position)
        const depth = corner.dot(forward)
        if (depth <= 0 || Math.abs(corner.dot(right)) > depth * tanH || Math.abs(corner.dot(up)) > depth * tanV)
          fits = false
      }
    }
  }
  if (fits && !closeIn) return { position, target }
  const from = position.clone().sub(target)
  return frameRooms(rooms, aspect, height, [from.x, from.y, from.z], margin, closeIn, spill, whole, floors)
}
