import { colorValue, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { Led, Material, SEG, Slab, Spinner } from '#/scene/decor/parts.tsx'
import { elevationOf } from '#/geometry/elevation.ts'
import { alongPath, legLengths, roamKey, roamPlan } from '#/scene/decor/roam.ts'
import type { ItemState } from '#/scene/decor/state.ts'
import type { DecorationConfig, Point, RoomConfig } from '#/types.ts'
import { useFrame, useThree } from '@react-three/fiber'
import { shadowless, useLive } from '#/scene/live.ts'
import { useMemo, useRef } from 'react'
import { MathUtils, type Group } from 'three'

type Props = {
  kind: DecorationKind
  item: DecorationConfig
  state: ItemState | null
  room?: RoomConfig
  // Every room of the plan. The robot drives to the ones on its dock's floor
  // when the vacuum says it is cleaning there.
  rooms?: RoomConfig[]
  all: DecorationConfig[]
  // How hard it is running, so the brushes wind down rather than stopping
  // dead when it is switched off.
  lit: number
}

// How fast the robot drives, in meters a second. Slow enough to read as a
// machine crossing a room rather than a toy.
const SPEED = 0.24
// How quickly it swings around to face the way it is going.
const TURN_RATE = 3.5

type Trip = { path: Point[]; legs: number[]; total: number }

const tripOf = (path: Point[]): Trip => {
  const legs = legLengths(path)
  return { path, legs, total: legs.reduce((a, b) => a + b, 0) }
}

// The point of a path nearest to `from`, as a distance along it, so turning
// the robot back on partway home picks the round up where it is rather than
// teleporting it to the start.
function nearestAlong(trip: Trip, from: Point) {
  let best = 0
  let bestGap = Infinity
  let along = 0
  for (let i = 0; i < trip.legs.length; i++) {
    const a = trip.path[i]
    const b = trip.path[i + 1]
    const len = trip.legs[i]
    const t =
      len > 0
        ? Math.min(Math.max(((from[0] - a[0]) * (b[0] - a[0]) + (from[1] - a[1]) * (b[1] - a[1])) / (len * len), 0), 1)
        : 0
    const gap = Math.hypot(a[0] + (b[0] - a[0]) * t - from[0], a[1] + (b[1] - a[1]) * t - from[1])
    if (gap < bestGap) {
      bestGap = gap
      best = along + t * len
    }
    along += len
  }
  return best
}

// A robot vacuum and the dock it charges on. The dock stays where the piece
// was placed, since that is the thing with a plug in the wall, and the robot
// itself leaves it to sweep the room and comes back when it is turned off.
// A vacuum that says which room it is cleaning has the robot drive there,
// through the doors between, and sweep that room instead, and drive on to
// the next one when the vacuum moves on.
export default function Vacuum({ kind, item, state, room, rooms, all, lit }: Props) {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const m = (slot: string) => materialValue(kind, slot, item.variant)
  const M = (slot: string) => <Material color={c(slot)} material={m(slot)} />
  const on = state?.on ?? false
  const r = p('size') / 2
  const h = 0.085

  // The rooms the robot can drive to: the ones on its dock's floor. Working
  // out its ways means sampling each room's floor, so they are kept until
  // the shape of those rooms, the furniture standing in them or the robot's
  // own place actually changes. Every other render, of which there are many,
  // leaves them alone.
  const level = room?.floor_id ?? ''
  const reach = useMemo(
    () => (room ? (rooms ?? [room]).filter(other => (other.floor_id ?? '') === level) : []),
    [rooms, room, level],
  )
  const key = roamKey(reach, all, item, r)
  const plan = useMemo(
    () => (room ? roamPlan(room, reach, all, item, r) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )

  const rig = useRef<Group>(null)
  // What it is driving now: a room's sweep while it runs, the way to the
  // next room when the vacuum moves on to one, the way back to the dock once
  // it stops, and nothing at all while it sits there.
  const trip = useRef<Trip | null>(null)
  const going = useRef<'sweep' | 'travel' | 'home' | 'parked'>('parked')
  // The room it sweeps, or is on its way to.
  const area = useRef(item.room)
  // The room it was last inside, which a doorway between two is in neither.
  const last = useRef(item.room)
  // The room it was last sent to, so a room it cannot reach is tried once.
  const aim = useRef<string | null>(null)
  const travelled = useRef(0)
  const forward = useRef(true)
  const spot = useRef<Point>(item.position)
  const facing = useRef(0)
  const rotation = MathUtils.degToRad(item.rotation ?? 0)
  // Where it is meant to be: the room the vacuum says while it cleans, when
  // the robot can get there, and its dock's own room otherwise.
  const target = state?.place && plan?.has(state.place) ? state.place : item.room

  // Sweeps a room from where the robot is. Its dock's room is the round it
  // always drives, joined where it is nearest; another room's round starts
  // right where it stands.
  const sweepRoom = (id: string, from: Point) => {
    const docked = id === item.room
    const round = plan?.round(id, docked ? undefined : from)
    trip.current = tripOf(round?.sweep ?? [item.position])
    travelled.current = docked ? nearestAlong(trip.current, from) : 0
    forward.current = true
    going.current = 'sweep'
    area.current = id
  }

  const invalidate = useThree(state => state.invalidate)
  useLive(on)
  useFrame((_, delta) => {
    const g = rig.current
    if (!g) return
    shadowless(g)
    const dt = Math.min(delta, 0.1)
    // Off, it still has to drive home and turn to face the room.
    if (!on && going.current !== 'parked') invalidate()

    if (on && (going.current === 'parked' || going.current === 'home' || aim.current !== target)) {
      // Out to sweep, or on to the room the vacuum moved to, from wherever
      // it had got to.
      aim.current = target
      const from = going.current === 'sweep' ? area.current : last.current
      const way = from === target ? null : plan?.crossing(from, spot.current, target)
      if (way) {
        trip.current = tripOf(way)
        travelled.current = 0
        going.current = 'travel'
        area.current = target
      } else sweepRoom(from === target || !plan ? target : from, spot.current)
    } else if (!on && (going.current === 'sweep' || going.current === 'travel')) {
      // Switched off: straight back to the dock by the shortest way across
      // the free floor, through the rooms between, not back along
      // everything it just swept.
      going.current = 'home'
      aim.current = null
      trip.current = tripOf(plan ? plan.home(last.current, spot.current) : [spot.current, item.position])
      travelled.current = 0
    }

    let run = trip.current
    if (run && run.total > 0) {
      if (going.current === 'sweep') {
        // Out to the far end of the round and back again, for as long as it
        // is running. The way back stops short of where it set off, at the
        // end of the first leg, so a running robot never climbs onto the
        // dock and spins round on it.
        travelled.current += (forward.current ? 1 : -1) * SPEED * dt
        if (travelled.current >= run.total) {
          travelled.current = run.total
          forward.current = false
        } else if (!forward.current && travelled.current <= run.legs[0]) {
          travelled.current = run.legs[0]
          forward.current = true
        }
      } else {
        travelled.current = Math.min(travelled.current + SPEED * dt, run.total)
        if (travelled.current >= run.total) {
          // In the next room: it sweeps it from where it came in.
          if (going.current === 'travel') {
            sweepRoom(area.current, run.path[run.path.length - 1])
            run = trip.current
          } else going.current = 'parked'
        }
      }
    } else if (going.current === 'home') going.current = 'parked'

    const here =
      run && run.total > 0 ? alongPath(run.path, run.legs, travelled.current) : { at: item.position, heading: 0 }
    spot.current = here.at
    const inside = plan?.roomAt(here.at)
    if (inside) last.current = inside
    // Which room it is drawn with: a focused room shows the robot while it
    // is in there, wherever its dock is.
    g.userData.room = going.current === 'parked' ? item.room : last.current
    // A room raised or sunk from the dock's carries the robot with its floor.
    g.position.y = elevationOf(reach.find(other => other.id === last.current)) - elevationOf(room)
    // The whole piece is already turned to the item's own rotation, so the
    // robot's place inside it is the plan offset turned back the other way.
    const dx = here.at[0] - item.position[0]
    const dz = -(here.at[1] - item.position[1])
    g.position.x = dx * Math.cos(rotation) - dz * Math.sin(rotation)
    g.position.z = dx * Math.sin(rotation) + dz * Math.cos(rotation)
    // Facing the way it drives, and turning into it rather than snapping.
    // Parked, it faces straight out of the dock, which is the piece's own
    // front, so its brushes point into the room and not at the wall. The
    // last leg home, onto the dock, is the one leg it drives in reverse,
    // so it backs onto the ramp still facing the room.
    let want = going.current === 'parked' ? 0 : here.heading - rotation
    if (run && going.current === 'home' && travelled.current > run.total - run.legs[run.legs.length - 1]) {
      want += Math.PI
    }
    // The shorter way round to the wanted facing, never more than half a
    // turn either way. A plain remainder keeps the sign of a negative
    // difference, which sent it the long way round for a small swing left.
    const gap = want - facing.current
    const turn = Math.atan2(Math.sin(gap), Math.cos(gap))
    facing.current += turn * Math.min(TURN_RATE * dt, 1)
    g.rotation.y = facing.current
  })

  return (
    <group>
      {/* The dock: a low ramp the robot backs onto, with a short back
          panel carrying the charging contacts. It never moves. */}
      <Slab size={[r * 1.5, 0.014, r * 1.25]} radius={0.02} bevel={0.005} position={[0, 0, -r * 0.5]}>
        {M('bumper')}
      </Slab>
      {/* The lip the robot climbs, thin at the front. */}
      <mesh position={[0, 0.007, r * 0.1]} rotation={[-0.16, 0, 0]}>
        <boxGeometry args={[r * 1.5, 0.004, r * 0.22]} />
        {M('bumper')}
      </mesh>
      <Slab size={[r * 1.15, 0.13, 0.035]} radius={0.016} bevel={0.006} position={[0, 0, -r * 1.06]}>
        {M('body')}
      </Slab>
      {/* Two contacts on the panel, where the robot meets it. */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * r * 0.3, 0.028, -r * 1.06 + 0.019]}>
          <boxGeometry args={[r * 0.22, 0.014, 0.004]} />
          {M('brushes')}
        </mesh>
      ))}
      {/* The dock's own light, on while the robot is away charging rather
          than out on a round. */}
      <Led on={!on} position={[0, 0.105, -r * 1.06 + 0.02]} radius={0.007} />

      <group ref={rig} name={`decoration:${item.id}:robot`}>
        {/* A low puck: a bumper wrapping the front half, a lidar turret set
            back on the top plate, and a side brush that spins while it runs. */}
        <mesh position={[0, h / 2, 0]} castShadow>
          <cylinderGeometry args={[r, r * 0.98, h, SEG]} />
          {M('body')}
        </mesh>
        {/* Bumper, the front half of the rim only. The half cylinder runs
            round from the front to the back through one side, so a quarter
            turn centres it on the front. It was turned the other way, which
            put it on the back, against the dock while parked and trailing
            behind while running. */}
        <mesh position={[0, h * 0.34, 0]} rotation={[0, -Math.PI / 2, 0]}>
          <cylinderGeometry args={[r * 1.02, r * 1.02, h * 0.42, SEG, 1, true, 0, Math.PI]} />
          <Material color={c('bumper')} material={m('bumper')} doubleSide />
        </mesh>
        {/* Lidar turret, behind the middle. */}
        <mesh position={[0, h + 0.012, -r * 0.34]}>
          <cylinderGeometry args={[r * 0.3, r * 0.32, 0.024, SEG]} />
          {M('bumper')}
        </mesh>
        <mesh position={[0, h + 0.026, -r * 0.34]}>
          <cylinderGeometry args={[r * 0.26, r * 0.28, 0.006, SEG]} />
          {M('body')}
        </mesh>
        {/* A round button in front of the turret. */}
        <mesh position={[0, h + 0.002, r * 0.3]}>
          <cylinderGeometry args={[r * 0.16, r * 0.16, 0.006, SEG]} />
          {M('bumper')}
        </mesh>
        {/* A ring of light round the button while it runs. */}
        <mesh position={[0, h + 0.0055, r * 0.3]} rotation={[-Math.PI / 2, 0, 0]} visible={lit > 0.01}>
          <ringGeometry args={[r * 0.17, r * 0.22, SEG]} />
          <meshBasicMaterial color="#7fd0ff" transparent opacity={lit} />
        </mesh>
        <Led on={on} position={[0, h + 0.008, r * 0.62]} radius={0.007} />
        <Spinner speed={9 * lit}>
          <mesh position={[r * 0.72, 0.01, 0]}>
            <boxGeometry args={[r * 0.55, 0.005, 0.016]} />
            {M('brushes')}
          </mesh>
          <mesh position={[-r * 0.72, 0.01, 0]}>
            <boxGeometry args={[r * 0.55, 0.005, 0.016]} />
            {M('brushes')}
          </mesh>
        </Spinner>
      </group>
    </group>
  )
}
