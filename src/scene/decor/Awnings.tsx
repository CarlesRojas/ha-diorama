import { Slab } from '#/scene/decor/parts.tsx'
import { useMemo, type ReactNode } from 'react'
import { ExtrudeGeometry, Quaternion, Shape, Vector3 } from 'three'

// Folding arm awnings, hung on a wall with nothing standing on the ground:
// the cloth runs out from a head on the wall onto a front profile, carried
// by two arms that fold open from brackets under the head as it extends.
// The styles differ in the head the cloth rolls into and in what hangs from
// the front profile.
//
// The piece's frame has its origin on the wall at the top of the head, x
// along the wall, y up and z out from the wall.

type Vec3 = [number, number, number]

// Where the cloth leaves the head, and how steeply it falls from there.
// The drag's travel follows the front profile out along the same line.
export function awningHead(style: string) {
  if (style === 'open') return { y: -0.09, z: 0.15, pitch: 0.25 }
  if (style === 'semi') return { y: -0.145, z: 0.11, pitch: 0.22 }
  return { y: -0.1, z: 0.14, pitch: 0.25 }
}

// A straight rod between two points: one cylinder moved and stretched into
// place, so an arm that folds as a cover runs is never rebuilt.
function Rod({ from, to, radius, children }: { from: Vec3; to: Vec3; radius: number; children: ReactNode }) {
  const a = new Vector3(...from)
  const dir = new Vector3(...to).sub(a)
  const length = Math.max(dir.length(), 0.001)
  const turn = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.divideScalar(length))
  const mid = a.addScaledVector(dir, length / 2)
  return (
    <mesh position={mid.toArray()} quaternion={turn} scale={[1, length, 1]} castShadow>
      <cylinderGeometry args={[radius, radius, 1, 12]} />
      {children}
    </mesh>
  )
}

// A flat shape drawn in the wall's section, z out and y up, run along the
// wall for `width` from its middle. Built once for its numbers.
function Section({
  draw,
  keyOf,
  width,
  x = 0,
  children,
}: {
  draw: () => Shape
  keyOf: string
  width: number
  x?: number
  children: ReactNode
}) {
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => new ExtrudeGeometry(draw(), { depth: width, bevelEnabled: false }), [keyOf, width])
  // The shape is drawn as (-z, y) and extruded along its own z, which the
  // turn lays along the wall.
  return (
    <mesh geometry={geometry} position={[x - width / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
      {children}
    </mesh>
  )
}

// The hood over a semi cassette's roll: a quarter of a ring from the wall
// down to a lip in front, centered `r` under the top of the wall plate.
const HOOD_R = 0.15
const HOOD_T = 0.008
function hoodShape() {
  const s = new Shape()
  // (-z, y): the outer arc from the top at the wall out to the front, and
  // the inner one back.
  s.absarc(0, -HOOD_R, HOOD_R, Math.PI / 2, Math.PI, false)
  s.absarc(0, -HOOD_R, HOOD_R - HOOD_T, Math.PI, Math.PI / 2, true)
  return s
}
// The end cap closing the hood at either side, the whole quarter disc.
function capShape() {
  const s = new Shape()
  s.moveTo(0, -HOOD_R)
  s.absarc(0, -HOOD_R, HOOD_R, Math.PI / 2, Math.PI, false)
  s.lineTo(0, -HOOD_R)
  return s
}

// One tongue of a scalloped valance, `w` wide and `h` long, rounded at the
// bottom, drawn in the plane of the valance.
function tongueShape(w: number, h: number) {
  const r = w / 2
  const s = new Shape()
  s.moveTo(-r, 0)
  s.lineTo(r, 0)
  s.lineTo(r, -h + r)
  s.absarc(0, -h + r, r, 0, Math.PI, true)
  s.lineTo(-r, 0)
  return s
}

export default function FoldingAwning({
  style,
  w,
  reach,
  out,
  canopy,
  stripe,
  frame,
}: {
  style: string
  w: number
  // How far it reaches out from the wall, fully extended.
  reach: number
  // How far it is out, 0 to 1.
  out: number
  canopy: ReactNode
  // The second color of a striped cloth. The cloth is plain without it.
  stripe?: ReactNode
  frame: ReactNode
}) {
  const head = awningHead(style)
  const run = reach * out
  const endY = head.y - run * Math.sin(head.pitch)
  const endZ = head.z + run * Math.cos(head.pitch)
  const armX = w / 2 - Math.min(0.15, w * 0.1)
  // Each arm is two halves, as long as the full extension needs, and never
  // so long that the two meet when they fold.
  const half = Math.min(reach * 0.52, armX - 0.05)
  // A striped cloth is cut in strips of about 15 cm, an odd number of them
  // so both edges come out in the main color.
  const strips = Math.max(5, Math.round((w - 0.04) / 0.15) | 1)
  const strip = (w - 0.04) / strips
  const tongue = useMemo(
    () => new ExtrudeGeometry(tongueShape(strip, 0.14), { depth: 0.004, bevelEnabled: false }),
    [strip],
  )

  // Where the arms start, on brackets under the head, and how thick they are.
  const shoulderY = style === 'semi' ? -0.2 : style === 'open' ? -0.18 : -0.19
  const arm = style === 'semi' ? { upper: 0.02, fore: 0.017 } : { upper: 0.018, fore: 0.015 }
  const bracket =
    style === 'semi' ? { y: -0.215, h: 0.09 } : style === 'open' ? { y: -0.21, h: 0.11 } : { y: -0.22, h: 0.1 }

  const cloth = (
    // Built once at full size and scaled out, which keeps the travel smooth.
    <group position={[0, head.y, head.z]} rotation={[head.pitch, 0, 0]} scale={[1, 1, Math.max(out, 0.001)]}>
      <Slab size={[w - 0.04, 0.01, reach]} radius={0.005} position={[0, 0, reach / 2]}>
        {canopy}
      </Slab>
      {stripe &&
        Array.from({ length: (strips - 1) / 2 }, (_, i) => (
          <mesh key={i} position={[-(w - 0.04) / 2 + strip * (2 * i + 1.5), 0.0106, reach / 2]}>
            <boxGeometry args={[strip, 0.001, reach]} />
            {stripe}
          </mesh>
        ))}
    </group>
  )

  const arms = [-1, 1].map(sx => {
    const shoulder: Vec3 = [sx * armX, shoulderY, 0.06]
    const hand: Vec3 = [sx * armX, endY - 0.02, endZ - 0.02]
    const span = Math.hypot(hand[1] - shoulder[1], hand[2] - shoulder[2])
    const bend = Math.sqrt(Math.max(half * half - (span / 2) ** 2, 0))
    // The elbow swings in toward the middle as the arm folds.
    const elbow: Vec3 = [sx * (armX - bend), (shoulder[1] + hand[1]) / 2, (shoulder[2] + hand[2]) / 2]
    return (
      <group key={sx}>
        <Slab size={[0.08, bracket.h, 0.07]} radius={0.015} position={[sx * armX, bracket.y, 0.035]}>
          {frame}
        </Slab>
        <Rod from={shoulder} to={elbow} radius={arm.upper}>
          {frame}
        </Rod>
        <Rod from={elbow} to={hand} radius={arm.fore}>
          {frame}
        </Rod>
        <mesh position={elbow}>
          <sphereGeometry args={[arm.upper + 0.006, 12, 8]} />
          {frame}
        </mesh>
      </group>
    )
  })

  if (style === 'open') {
    // An open awning on a square bar: the cloth winds round a bare roller
    // that sits on brackets above the bar, fatter the further it is in,
    // and a scalloped valance in the two colors of the cloth hangs from the
    // front profile.
    const roll = 0.035 + 0.02 * (1 - out)
    const bar = 0.045
    return (
      <group>
        <Slab size={[w + 0.1, bar, bar]} radius={0.006} bevel={0.004} position={[0, -0.13 - bar / 2, bar / 2 + 0.02]}>
          {frame}
        </Slab>
        {/* The plates holding the bar to the wall, and the roller's ends. */}
        {[-1, 0, 1].map(sx => (
          <Slab
            key={sx}
            size={[0.1, 0.16, 0.02]}
            radius={0.01}
            bevel={0.004}
            position={[sx * (w / 2 - 0.05), -0.2, 0.01]}
          >
            {frame}
          </Slab>
        ))}
        {[-1, 1].map(sx => (
          <Slab key={sx} size={[0.03, 0.12, 0.17]} radius={0.01} position={[sx * (w / 2 + 0.005), -0.11, 0.095]}>
            {frame}
          </Slab>
        ))}
        <mesh position={[0, head.y + roll, head.z - 0.01]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[roll, roll, w - 0.04, 20]} />
          {canopy}
        </mesh>
        {cloth}
        <Slab size={[w, 0.05, 0.05]} radius={0.008} bevel={0.004} position={[0, endY - 0.04, endZ]}>
          {frame}
        </Slab>
        {/* The tongues, one under each strip of the cloth, in its color. */}
        {Array.from({ length: strips }, (_, i) => (
          <mesh
            key={i}
            geometry={tongue}
            position={[-(w - 0.04) / 2 + strip * (i + 0.5), endY - 0.04, endZ + 0.027]}
            castShadow
          >
            {i % 2 === 1 && stripe ? stripe : canopy}
          </mesh>
        ))}
        {arms}
      </group>
    )
  }

  if (style === 'semi') {
    // A semi cassette: a curved hood over the roll keeps the rain off it,
    // closed at both ends, with the arms left bare under it and a plain
    // front profile with no valance.
    const roll = 0.03 + 0.018 * (1 - out)
    return (
      <group>
        <Slab size={[w + 0.06, 0.06, 0.03]} radius={0.01} bevel={0.004} position={[0, -0.2, 0.015]}>
          {frame}
        </Slab>
        {/* The back plate the hood closes against, on the wall. */}
        <Slab size={[w + 0.06, 0.15, 0.012]} radius={0.004} bevel={0.003} position={[0, -0.15, 0.006]}>
          {frame}
        </Slab>
        <Section draw={hoodShape} keyOf="hood" width={w + 0.06}>
          {frame}
        </Section>
        {[-1, 1].map(sx => (
          <Section key={sx} draw={capShape} keyOf="cap" width={0.008} x={sx * (w / 2 + 0.026)}>
            {frame}
          </Section>
        ))}
        <mesh position={[0, -0.1, 0.075]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[roll, roll, w - 0.04, 20]} />
          {canopy}
        </mesh>
        {cloth}
        <Slab size={[w + 0.02, 0.075, 0.06]} radius={0.025} bevel={0.006} position={[0, endY - 0.06, endZ]}>
          {frame}
        </Slab>
        {arms}
      </group>
    )
  }

  // After the Markilux 990: a full cassette the cloth and the arms fold
  // away into, with a short straight valance under the front profile.
  const cassette = { h: 0.12, d: 0.16 }
  return (
    <group>
      <Slab size={[w + 0.04, cassette.h, cassette.d]} radius={0.05} position={[0, -cassette.h, cassette.d / 2]}>
        {frame}
      </Slab>
      {cloth}
      <Slab size={[w, 0.06, 0.07]} radius={0.02} position={[0, endY - 0.05, endZ]}>
        {frame}
      </Slab>
      <Slab size={[w - 0.02, 0.16, 0.006]} radius={0.002} bevel={0.001} position={[0, endY - 0.21, endZ + 0.03]}>
        {canopy}
      </Slab>
      {arms}
    </group>
  )
}
