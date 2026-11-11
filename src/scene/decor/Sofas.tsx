import { Panel, Soft } from '#/scene/decor/parts.tsx'
import {
  BLOCK_ARM_TOP,
  BLOCK_ARM_W,
  BLOCK_BACK_T,
  BLOCK_BACK_TOP,
  BLOCK_CUSHION,
  BLOCK_DECK_TOP,
  BLOCK_PLINTH,
  RAIL_ARM,
  RAIL_BACK_T,
  RAIL_BACK_TOP,
  RAIL_CUSHION,
  RAIL_LEG_R,
  RAIL_SEAT_RAIL,
  SOFA_ARM_TOP,
  SOFA_ARM_W,
  SOFA_BACK_T,
  SOFA_BACK_TOP,
  SOFA_BASE_H,
  SOFA_CUSHION,
  SOFA_LEG_H,
  SOFA_LEG_R,
  SOFA_LEG_SPLAY,
  SOFA_LUMBAR,
  SOFA_SEAT_H,
} from '#/scene/decor/sofaSpecs.ts'
import { type ReactNode } from 'react'

// The sofas, and a pouf to go with each. The upholstered parts are soft
// blocks: a box with its edges rounded off and its faces a little full, the
// way a filled cover sits.

type Vec3 = [number, number, number]
type Slot = (slot: string) => ReactNode

type LegAt = { x: number; z: number; out: [number, number] }

// A leg hung from its top, where it meets the frame, so leaning its foot
// out leaves the top where it is. It is drawn that much longer to still
// reach the floor.
function TopLeg({
  x,
  z,
  height,
  radius,
  lean = [0, 0],
  children,
}: {
  x: number
  z: number
  height: number
  radius: [number, number]
  lean?: [number, number]
  children: ReactNode
}) {
  const length = height / (Math.cos(lean[0]) * Math.cos(lean[1]))
  return (
    <group position={[x, height, z]} rotation={[lean[0], 0, lean[1]]}>
      <mesh position={[0, -length / 2, 0]} castShadow>
        <cylinderGeometry args={[radius[0], radius[1], length, 16]} />
        {children}
      </mesh>
    </group>
  )
}

function SofaLegs({ legs, height, M, slot = 'legs' }: { legs: LegAt[]; height: number; M: Slot; slot?: string }) {
  return (
    <>
      {legs.map(({ x, z, out }) => (
        <TopLeg
          key={`${x}:${z}`}
          x={x}
          z={z}
          height={height}
          radius={SOFA_LEG_R}
          lean={[-out[1] * SOFA_LEG_SPLAY, out[0] * SOFA_LEG_SPLAY]}
        >
          {M(slot)}
        </TopLeg>
      ))}
    </>
  )
}

// Where a sofa's parts go, whatever its style. With a chaise, the seat at
// the right end, or the left when flipped, runs forward to the back plus
// `total`, and the sofa's middle is the middle of that whole footprint.
type Layout = {
  total: number
  back: number
  front: number
  inner: number
  seats: number
  seatW: number
  seatX: (i: number) => number
  // Which seat runs out as the chaise, -1 for none.
  long: number
  // The chaise's own sides, left and right.
  chaiseX: [number, number]
}

function sofaLayout(
  w: number,
  d: number,
  reach: number,
  chaise: boolean,
  flip: boolean,
  armW: number,
  seats: number,
): Layout {
  const total = chaise ? Math.max(reach, d + 0.3) : d
  const back = -total / 2
  const inner = w - armW * 2
  const seatW = inner / seats
  const seatX = (i: number) => -inner / 2 + seatW * (i + 0.5)
  const long = chaise ? (flip ? 0 : seats - 1) : -1
  const chaiseX: [number, number] = [seatX(Math.max(long, 0)) - seatW / 2, seatX(Math.max(long, 0)) + seatW / 2]
  return { total, back, front: back + d, inner, seats, seatW, seatX, long, chaiseX }
}

// `seats` is how many seats share out the width, as sofaSeats in the
// catalog gives it.
type SofaProps = { w: number; d: number; reach: number; chaise: boolean; flip: boolean; seats: number; M: Slot }

export function Sofa({ style, ...props }: SofaProps & { style: string }) {
  if (style === 'block') return <BlockSofa {...props} />
  if (style === 'rail') return <RailSofa {...props} />
  return <PillowSofa {...props} />
}

// A back cushion standing on the back of the seat at `z` and leaning back
// by `lean`, `w` wide.
function BackCushion({
  x,
  y,
  z,
  w,
  size: [h, t, lean],
  M,
}: {
  x: number
  y: number
  z: number
  w: number
  size: [number, number, number]
  M: Slot
}) {
  return (
    <group position={[x, y, z]} rotation={[-lean, 0, 0]}>
      <Soft
        size={[w, h, t]}
        round={[0.07, 0.07, 0.07]}
        puff={[0.01, 0.015, 0.035]}
        wrinkle={0.003}
        position={[0, h / 2, -t / 2]}
      >
        {M('cushions')}
      </Soft>
    </group>
  )
}

// The pillow arm sofa, after Pilma's Dresde: thin padded arms, a slim back
// frame, loose back and lumbar cushions, on slim metal legs that lean out
// at the foot.
function PillowSofa({ w, d, reach, chaise, flip, seats: count, M }: SofaProps) {
  const { total, back, front, inner, seats, seatW, seatX, long, chaiseX } = sofaLayout(
    w,
    d,
    reach,
    chaise,
    flip,
    SOFA_ARM_W,
    count,
  )
  const seatY = SOFA_LEG_H + SOFA_BASE_H
  const seatBack = back + SOFA_BACK_T
  const [lumbarW, lumbarH, lumbarT, lumbarLean] = SOFA_LUMBAR
  const settle = 0.03
  const end = back + total

  // The legs stand under the middle of each arm, far enough in from its
  // ends to be under its flat underside, and under the corners of the
  // chaise and the middle of a long back.
  const armX = w / 2 - SOFA_ARM_W / 2
  const inset = 0.16
  const legs: LegAt[] = [-1, 1].flatMap(s => [
    { x: s * armX, z: back + inset, out: [s, -1] as [number, number] },
    { x: s * armX, z: front - inset, out: [s, 1] as [number, number] },
  ])
  if (chaise) {
    legs.push(
      { x: chaiseX[0] + 0.06, z: end - 0.06, out: [-1, 1] },
      { x: chaiseX[1] - 0.06, z: end - 0.06, out: [1, 1] },
    )
  }
  if (w > 2.4) legs.push({ x: 0, z: back + 0.06, out: [0, -1] })
  if (w > 2.4 && !chaise) legs.push({ x: 0, z: front - 0.06, out: [0, 1] })

  return (
    <group>
      <SofaLegs legs={legs} height={SOFA_LEG_H} M={M} />
      {/* The base the cushions sit on, and its run out under the chaise. */}
      <Soft
        size={[inner + 0.02, SOFA_BASE_H, d - 0.02]}
        round={[0.02, 0.03, 0.03]}
        position={[0, SOFA_LEG_H + SOFA_BASE_H / 2, back + d / 2]}
      >
        {M('upholstery')}
      </Soft>
      {chaise && (
        <Soft
          size={[seatW, SOFA_BASE_H, total - d + 0.04]}
          round={[0.02, 0.03, 0.03]}
          position={[seatX(long), SOFA_LEG_H + SOFA_BASE_H / 2, (front + end) / 2 - 0.02]}
        >
          {M('upholstery')}
        </Soft>
      )}
      {/* The back frame, from the base up behind the back cushions. */}
      <Soft
        size={[inner + 0.02, SOFA_BACK_TOP - SOFA_LEG_H, SOFA_BACK_T]}
        round={[0.03, 0.04, 0.05]}
        puff={[0, 0, 0.01]}
        position={[0, (SOFA_BACK_TOP + SOFA_LEG_H) / 2, back + SOFA_BACK_T / 2]}
      >
        {M('upholstery')}
      </Soft>
      {/* The arms, thin padded panels the whole depth of the sofa, down to
          the tops of the legs like the base. */}
      {[-1, 1].map(s => (
        <Soft
          key={s}
          size={[SOFA_ARM_W, SOFA_ARM_TOP - SOFA_LEG_H, d]}
          round={[0.055, 0.1, 0.14]}
          puff={[0.018, 0.01, 0]}
          position={[s * armX, (SOFA_ARM_TOP + SOFA_LEG_H) / 2, back + d / 2]}
        >
          {M('upholstery')}
        </Soft>
      ))}
      {Array.from({ length: seats }, (_, i) => {
        const to = i === long ? end : front
        return (
          <group key={i}>
            <Soft
              size={[seatW - 0.012, SOFA_SEAT_H, to - seatBack]}
              round={[0.06, 0.07, 0.06]}
              puff={[0.008, 0.028, 0.008]}
              wrinkle={0.003}
              position={[seatX(i), seatY + SOFA_SEAT_H / 2, (seatBack + to) / 2]}
            >
              {M('cushions')}
            </Soft>
            {/* The back cushion stands on the back of the seat and leans on
                the frame, and the lumbar cushion leans on it. */}
            <BackCushion
              x={seatX(i)}
              y={seatY + SOFA_SEAT_H - settle}
              z={seatBack + SOFA_CUSHION[1]}
              w={seatW - 0.02}
              size={SOFA_CUSHION}
              M={M}
            />
            <group
              position={[seatX(i), seatY + SOFA_SEAT_H - settle, seatBack + SOFA_CUSHION[1] + lumbarT]}
              rotation={[-lumbarLean, 0, 0]}
            >
              <Soft
                size={[Math.min(lumbarW, seatW * 0.62), lumbarH, lumbarT]}
                round={[0.05, 0.06, 0.05]}
                puff={[0.01, 0.01, 0.04]}
                wrinkle={0.003}
                position={[0, lumbarH / 2, -lumbarT / 2]}
              >
                {M('cushions')}
              </Soft>
            </group>
          </group>
        )
      })}
    </group>
  )
}

// The plinth sofa, after Hay's Mags: a low deep block on a dark plinth set
// back from its edges, wide square arms and back, and one seat cushion and
// one tall back cushion per seat.
function BlockSofa({ w, d, reach, chaise, flip, seats: count, M }: SofaProps) {
  const { total, back, front, inner, seats, seatW, seatX, long, chaiseX } = sofaLayout(
    w,
    d,
    reach,
    chaise,
    flip,
    BLOCK_ARM_W,
    count,
  )
  const [plinthH, setback] = BLOCK_PLINTH
  const end = back + total
  const seatBack = back + BLOCK_BACK_T
  const seatH = 0.17
  const seatTop = BLOCK_DECK_TOP + seatH
  const round: Vec3 = [0.035, 0.035, 0.035]
  const chaiseW = chaiseX[1] - chaiseX[0]
  const chaiseMid = (chaiseX[0] + chaiseX[1]) / 2
  return (
    <group>
      {/* The plinth, set back under the body and under the chaise. */}
      <Panel size={[w - setback * 2, plinthH, d - setback * 2]} radius={0.01} position={[0, 0, back + d / 2]}>
        {M('plinth')}
      </Panel>
      {chaise && (
        <Panel
          size={[chaiseW - setback * 2, plinthH, total - d + setback]}
          radius={0.01}
          position={[chaiseMid, 0, (front + end) / 2 - setback / 2]}
        >
          {M('plinth')}
        </Panel>
      )}
      {/* The deck under the seat cushions, the back and the arms. */}
      <Soft
        size={[inner + 0.02, BLOCK_DECK_TOP - plinthH, d]}
        round={round}
        position={[0, (BLOCK_DECK_TOP + plinthH) / 2, back + d / 2]}
      >
        {M('upholstery')}
      </Soft>
      {chaise && (
        <Soft
          size={[chaiseW, BLOCK_DECK_TOP - plinthH, total - d + 0.04]}
          round={round}
          position={[chaiseMid, (BLOCK_DECK_TOP + plinthH) / 2, (front + end) / 2 - 0.02]}
        >
          {M('upholstery')}
        </Soft>
      )}
      <Soft
        size={[inner + 0.02, BLOCK_BACK_TOP - plinthH, BLOCK_BACK_T]}
        round={[0.04, 0.05, 0.05]}
        puff={[0, 0, 0.01]}
        position={[0, (BLOCK_BACK_TOP + plinthH) / 2, back + BLOCK_BACK_T / 2]}
      >
        {M('upholstery')}
      </Soft>
      {[-1, 1].map(s => (
        <Soft
          key={s}
          size={[BLOCK_ARM_W, BLOCK_ARM_TOP - plinthH, d]}
          round={[0.04, 0.05, 0.05]}
          puff={[0.01, 0.006, 0.006]}
          position={[(s * (w - BLOCK_ARM_W)) / 2, (BLOCK_ARM_TOP + plinthH) / 2, back + d / 2]}
        >
          {M('upholstery')}
        </Soft>
      ))}
      {Array.from({ length: seats }, (_, i) => {
        const to = i === long ? end : front
        return (
          <group key={i}>
            <Soft
              size={[seatW - 0.01, seatH, to - seatBack]}
              round={[0.045, 0.05, 0.045]}
              puff={[0, 0.01, 0]}
              position={[seatX(i), BLOCK_DECK_TOP + seatH / 2, (seatBack + to) / 2]}
            >
              {M('cushions')}
            </Soft>
            <BackCushion
              x={seatX(i)}
              y={seatTop - 0.02}
              z={seatBack + BLOCK_CUSHION[1]}
              w={seatW - 0.015}
              size={BLOCK_CUSHION}
              M={M}
            />
          </group>
        )
      })}
    </group>
  )
}

// The rail sofa, after Karimoku's Castor: an open teak frame on round
// tapered legs, a flat board for each arm, rails round the seat and along
// the top of an upholstered back, with the cushions laid in it.
function RailSofa({ w, d, reach, chaise, flip, seats: count, M }: SofaProps) {
  const [armW, armT, armTop] = RAIL_ARM
  const { total, back, front, inner, seats, seatW, seatX, long, chaiseX } = sofaLayout(
    w,
    d,
    reach,
    chaise,
    flip,
    armW,
    count,
  )
  const [railH, railTop] = RAIL_SEAT_RAIL
  const end = back + total
  const seatBack = back + RAIL_BACK_T
  const seatH = 0.15
  const seatTop = railTop + seatH
  const t = 0.03
  const armX = w / 2 - armW / 2
  const legIn = 0.035
  // The front rail runs between the arms, but not across the chaise, whose
  // seat carries on forward.
  const fronts: [number, number][] = chaise
    ? ([
        [-inner / 2, chaiseX[0]],
        [chaiseX[1], inner / 2],
      ].filter(([a, b]) => b - a > 0.01) as [number, number][])
    : [[-inner / 2, inner / 2]]
  const chaiseMid = (chaiseX[0] + chaiseX[1]) / 2
  const chaiseW = chaiseX[1] - chaiseX[0]
  return (
    <group>
      {/* Each arm: a leg at either end, the front one up to a flat board
          and the back one on through it as a post that carries the rail
          along the top of the back, and a side rail at the seat. */}
      {[-1, 1].map(s => (
        <group key={s}>
          <TopLeg x={s * armX} z={front - legIn} height={armTop - armT} radius={RAIL_LEG_R}>
            {M('frame')}
          </TopLeg>
          <TopLeg x={s * armX} z={back + legIn} height={RAIL_BACK_TOP} radius={RAIL_LEG_R}>
            {M('frame')}
          </TopLeg>
          <Panel size={[armW, armT, d]} radius={0.015} position={[s * armX, armTop - armT, back + d / 2]}>
            {M('frame')}
          </Panel>
          <Panel
            size={[0.028, railH, d - legIn * 2]}
            radius={0.004}
            position={[s * armX, railTop - railH, back + d / 2]}
          >
            {M('frame')}
          </Panel>
        </group>
      ))}
      {/* The rails round the seat, and round the chaise with its own legs at
          its front. */}
      {fronts.map(([a, b]) => (
        <Panel key={a} size={[b - a, railH, t]} radius={0.004} position={[(a + b) / 2, railTop - railH, front - t / 2]}>
          {M('frame')}
        </Panel>
      ))}
      <Panel size={[inner, railH, t]} radius={0.004} position={[0, railTop - railH, back + t / 2]}>
        {M('frame')}
      </Panel>
      {chaise && (
        <>
          {chaiseX.map(x => (
            <group key={x}>
              <TopLeg x={x} z={end - legIn} height={railTop} radius={RAIL_LEG_R}>
                {M('frame')}
              </TopLeg>
              <Panel size={[t, railH, total - d]} radius={0.004} position={[x, railTop - railH, (front + end) / 2]}>
                {M('frame')}
              </Panel>
            </group>
          ))}
          <Panel size={[chaiseW, railH, t]} radius={0.004} position={[chaiseMid, railTop - railH, end - t / 2]}>
            {M('frame')}
          </Panel>
        </>
      )}
      {/* The upholstered back, with a rail along its top. */}
      <Soft
        size={[inner, RAIL_BACK_TOP - railTop + railH, RAIL_BACK_T]}
        round={[0.02, 0.03, 0.03]}
        position={[0, (RAIL_BACK_TOP + railTop - railH) / 2, back + RAIL_BACK_T / 2]}
      >
        {M('upholstery')}
      </Soft>
      <Panel
        size={[w - armW + RAIL_LEG_R[1] * 2 + 0.01, 0.028, RAIL_BACK_T + 0.02]}
        radius={0.01}
        position={[0, RAIL_BACK_TOP, back + RAIL_BACK_T / 2]}
      >
        {M('frame')}
      </Panel>
      {Array.from({ length: seats }, (_, i) => {
        const to = i === long ? end : front
        return (
          <group key={i}>
            <Soft
              size={[seatW - 0.01, seatH, to - seatBack]}
              round={[0.05, 0.055, 0.05]}
              puff={[0, 0.012, 0]}
              position={[seatX(i), railTop - 0.02 + seatH / 2, (seatBack + to) / 2]}
            >
              {M('cushions')}
            </Soft>
            <BackCushion
              x={seatX(i)}
              y={seatTop - 0.04}
              z={seatBack + RAIL_CUSHION[1]}
              w={seatW - 0.015}
              size={RAIL_CUSHION}
              M={M}
            />
          </group>
        )
      })}
    </group>
  )
}

// A pouf for each sofa, square, `size` across and `h` tall.
export function Pouf({ style, size, h, M }: { style: string; size: number; h: number; M: Slot }) {
  if (style === 'block') {
    // A soft cube on the plinth sofa's setback plinth.
    const [plinthH, setback] = BLOCK_PLINTH
    const blockH = h - plinthH
    return (
      <group>
        <Panel size={[size - setback * 2, plinthH, size - setback * 2]} radius={0.01}>
          {M('legs')}
        </Panel>
        <Soft
          size={[size, blockH, size]}
          round={[0.035, Math.min(0.04, blockH / 3), 0.035]}
          puff={[0.006, 0.01, 0.006]}
          position={[0, plinthH + blockH / 2, 0]}
        >
          {M('cover')}
        </Soft>
      </group>
    )
  }
  if (style === 'rail') {
    // A teak stool frame, four legs and a rail round the top, with a
    // cushion laid in it.
    const railH = 0.06
    const frameTop = Math.max(h - 0.12, railH + 0.05)
    const edge = size / 2 - 0.035
    const t = 0.028
    return (
      <group>
        {[-1, 1].flatMap(sx =>
          [-1, 1].map(sz => (
            <TopLeg key={`${sx}:${sz}`} x={sx * edge} z={sz * edge} height={frameTop} radius={RAIL_LEG_R}>
              {M('legs')}
            </TopLeg>
          )),
        )}
        {[-1, 1].map(s => (
          <group key={s}>
            <Panel
              size={[size - 0.03, railH, t]}
              radius={0.004}
              position={[0, frameTop - railH, s * (size / 2 - t / 2 - 0.015)]}
            >
              {M('legs')}
            </Panel>
            <Panel
              size={[t, railH, size - 0.03]}
              radius={0.004}
              position={[s * (size / 2 - t / 2 - 0.015), frameTop - railH, 0]}
            >
              {M('legs')}
            </Panel>
          </group>
        ))}
        <Soft
          size={[size - 0.04, h - frameTop + 0.02, size - 0.04]}
          round={[0.05, 0.05, 0.05]}
          puff={[0, 0.012, 0]}
          position={[0, (h + frameTop - 0.02) / 2, 0]}
        >
          {M('cover')}
        </Soft>
      </group>
    )
  }
  // The pillow arm sofa's base alone, as one upholstered block on its legs.
  const legH = Math.min(SOFA_LEG_H, h * 0.45)
  const edge = size / 2 - 0.1
  const legs: LegAt[] = [-1, 1].flatMap(sx =>
    [-1, 1].map(sz => ({ x: sx * edge, z: sz * edge, out: [sx, sz] as [number, number] })),
  )
  const blockH = h - legH
  return (
    <group>
      <SofaLegs legs={legs} height={legH} M={M} />
      <Soft
        size={[size, blockH, size]}
        round={[0.05, Math.min(0.06, blockH / 3), 0.05]}
        puff={[0.006, 0.01, 0.006]}
        position={[0, legH + blockH / 2, 0]}
      >
        {M('cover')}
      </Soft>
    </group>
  )
}
