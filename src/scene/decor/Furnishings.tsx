import { Bar, SEG, Slab } from '#/scene/decor/parts.tsx'
import { useFrame } from '@react-three/fiber'
import { useEverySecond } from '#/scene/live.ts'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Group, Mesh } from 'three'

// The rug, the mirror, the clock, the books and the curtain, each in the
// styles the catalog gives it. `paint` gives the material for a slot.

type Paint = (slot: string, both?: boolean) => ReactNode

// Four styles of rug. A flat woven one with a border stripe and fringed short
// ends, after a Nordic wool rug. A kilim, thinner, with bands of color across
// it and fringes. A plain deep pile with soft corners. A round loop pile rug
// with a ring woven in near its edge. `plain` leaves the lines out.
export function Rug({
  style,
  w,
  d,
  plain,
  paint,
  fringe,
}: {
  style: string
  w: number
  d: number
  plain: boolean
  paint: Paint
  fringe: (children: ReactNode) => ReactNode
}) {
  if (style === 'round') {
    const r = Math.min(w, d) / 2
    return (
      <group scale={[w / 2 / r, 1, d / 2 / r]}>
        <mesh position={[0, 0.007, 0]} receiveShadow>
          <cylinderGeometry args={[r, r, 0.014, SEG * 3]} />
          {paint('field')}
        </mesh>
        {!plain && (
          <mesh position={[0, 0.0145, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r * 0.8, r * 0.84, SEG * 3]} />
            {paint('border')}
          </mesh>
        )}
      </group>
    )
  }
  if (style === 'shag') {
    return (
      <Slab size={[w, 0.024, d]} radius={0.02} bevel={0.008} position={[0, 0.001, 0]}>
        {paint('field')}
      </Slab>
    )
  }
  if (style === 'kilim') {
    // Bands across the rug, a wide one in the middle and narrower pairs
    // either side, the way a flat weave repeats.
    const unit = w / 11
    const bands: [number, number, string][] = [
      [0, unit * 1.2, 'border'],
      [unit * 1.6, unit * 0.35, 'accent'],
      [unit * 2.4, unit * 0.35, 'border'],
      [unit * 3.6, unit * 0.5, 'accent'],
    ]
    return (
      <group>
        <Slab size={[w, 0.007, d]} radius={0.01} bevel={0.002} position={[0, 0.001, 0]}>
          {paint('field')}
        </Slab>
        {!plain &&
          bands.flatMap(([x, bw, slot]) =>
            (x === 0 ? [0] : [-x, x]).map(at => (
              <mesh key={`${slot}${at}`} position={[at, 0.0085, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[bw, d - 0.04]} />
                {paint(slot)}
              </mesh>
            )),
          )}
        {fringe(paint('field'))}
      </group>
    )
  }
  const band = Math.min(0.12, Math.min(w, d) * 0.12)
  return (
    <group>
      <Slab size={[w, 0.011, d]} radius={0.02} bevel={0.004} position={[0, 0.001, 0]}>
        {paint('field')}
      </Slab>
      {!plain && (
        // The border, drawn as four stripes so the field stays plain.
        <group>
          {[-1, 1].map(s => (
            <mesh key={`x${s}`} position={[0, 0.013, (s * (d - band)) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w - band * 2, band * 0.45]} />
              {paint('border')}
            </mesh>
          ))}
          {[-1, 1].map(s => (
            <mesh key={`z${s}`} position={[(s * (w - band)) / 2, 0.013, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
              <planeGeometry args={[d - band * 2, band * 0.45]} />
              {paint('border')}
            </mesh>
          ))}
        </group>
      )}
      {fringe(paint('field'))}
    </group>
  )
}

// A round mirror in a slim ring, or a square or upright one in a thin flat
// frame. `s` is its diameter or its width, and `tall` its height.
export function Mirror({ style, s, tall = s, paint }: { style: string; s: number; tall?: number; paint: Paint }) {
  if (style === 'square' || style === 'rect') {
    const h = style === 'rect' ? tall : s
    const bar = Math.min(0.025, Math.min(s, h) * 0.05)
    return (
      <group>
        <mesh position={[0, 0, 0.012]}>
          <boxGeometry args={[s - bar, h - bar, 0.008]} />
          {paint('glass')}
        </mesh>
        {[-1, 1].map(k => (
          <group key={k}>
            <mesh position={[0, (k * (h - bar)) / 2, 0.014]} castShadow>
              <boxGeometry args={[s, bar, 0.028]} />
              {paint('frame')}
            </mesh>
            <mesh position={[(k * (s - bar)) / 2, 0, 0.014]} castShadow>
              <boxGeometry args={[bar, h - bar * 2, 0.028]} />
              {paint('frame')}
            </mesh>
          </group>
        ))}
      </group>
    )
  }
  const r = s / 2
  const ring = Math.min(0.03, r * 0.12)
  return (
    <group>
      <mesh position={[0, 0, 0.022]}>
        <torusGeometry args={[r - ring, ring, 20, SEG * 2]} />
        {paint('frame')}
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.018]}>
        <cylinderGeometry args={[r - ring, r - ring, 0.01, SEG * 2]} />
        {paint('glass')}
      </mesh>
    </group>
  )
}

// A hand from the middle of a clock: `len` out, `tail` back past the
// middle, `w` wide, standing `z` off the face.
function Hand({
  len,
  tail = 0,
  w,
  z,
  children,
}: {
  len: number
  tail?: number
  w: number
  z: number
  children: ReactNode
}) {
  // A hand is a sliver that throws nothing worth seeing, and it moves every
  // second; as a caster it would have the sun's shadow drawn again each time.
  return (
    <mesh position={[0, (len - tail) / 2, z]} userData={NO_SHADOW}>
      <boxGeometry args={[w, len + tail, 0.003]} />
      {children}
    </mesh>
  )
}

// The hands, turned to the time of day where the clock is seen, so a clock
// on the wall tells the time.
function Hands({ z, hour, minute, second }: { z: number; hour: ReactNode; minute: ReactNode; second?: ReactNode }) {
  const h = useRef<Group>(null)
  const m = useRef<Group>(null)
  const sec = useRef<Group>(null)
  // The hands only move when the second does. A minute hand's share of a
  // second is nothing to see, and this leaves the frame alone in between.
  const shown = useRef(-1)
  useEverySecond()
  useFrame(() => {
    const now = new Date()
    const s = now.getSeconds()
    if (s === shown.current) return
    shown.current = s
    const min = now.getMinutes() + s / 60
    const hr = (now.getHours() % 12) + min / 60
    if (h.current) h.current.rotation.z = -(hr / 12) * Math.PI * 2
    if (m.current) m.current.rotation.z = -(min / 60) * Math.PI * 2
    if (sec.current) sec.current.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2
  })
  return (
    <group position={[0, 0, z]}>
      <group ref={h}>{hour}</group>
      <group ref={m}>{minute}</group>
      {second && <group ref={sec}>{second}</group>}
    </group>
  )
}

// The segments of a seven segment digit, as [x, y, along x] from its middle
// in shares of its width and height, and which of them each digit lights:
// top, upper right, lower right, bottom, lower left, upper left, middle.
const SEGMENTS: [number, number, boolean][] = [
  [0, 0.5, true],
  [0.5, 0.25, false],
  [0.5, -0.25, false],
  [0, -0.5, true],
  [-0.5, -0.25, false],
  [-0.5, 0.25, false],
  [0, 0, true],
]
const DIGITS = [
  '1111110',
  '0110000',
  '1101101',
  '1111001',
  '0110011',
  '1011011',
  '1011111',
  '1110000',
  '1111111',
  '1111011',
]

// Four seven segment digits and a blinking colon showing the hours and
// minutes, `w` wide and `h` tall, their unlit segments faintly there. The
// segments are two millimetres of light on a face: no shadow to throw, and
// as casters the colon would have the sun's map drawn again every second.
const NO_SHADOW = { noShadow: true }
function DigitalTime({ w, h, z, glow }: { w: number; h: number; z: number; glow: string }) {
  const lit = useRef<(Mesh | null)[]>([])
  const colon = useRef<Group>(null)
  const dw = w / 5.2
  const t = Math.min(dw, h) * 0.16
  const xs = [-1.95, -0.85, 0.85, 1.95].map(k => k * dw)
  const shown = useRef(-1)
  useEverySecond()
  useFrame(() => {
    const now = new Date()
    // Nothing on it changes within a second.
    const s = now.getSeconds()
    if (s === shown.current) return
    shown.current = s
    const text = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    for (let d = 0; d < 4; d++) {
      const mask = DIGITS[Number(text[d])]
      for (let k = 0; k < 7; k++) {
        const mesh = lit.current[d * 7 + k]
        if (mesh) mesh.visible = mask[k] === '1'
      }
    }
    if (colon.current) colon.current.visible = now.getSeconds() % 2 === 0
  })
  const segment = (flat: boolean): [number, number, number] =>
    flat ? [dw * 0.72, t, 0.002] : [t, h / 2 - t * 0.4, 0.002]
  return (
    <group position={[0, 0, z]}>
      {xs.map((x, d) =>
        SEGMENTS.map(([sx, sy, flat], k) => (
          <group key={`${d}:${k}`} position={[x + sx * dw * 0.82, sy * (h - t), 0]}>
            <mesh>
              <boxGeometry args={segment(flat)} />
              <meshStandardMaterial color={glow} transparent opacity={0.08} />
            </mesh>
            <mesh
              ref={el => {
                lit.current[d * 7 + k] = el
              }}
              position={[0, 0, 0.001]}
              userData={NO_SHADOW}
            >
              <boxGeometry args={segment(flat)} />
              <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
          </group>
        )),
      )}
      <group ref={colon}>
        {[-1, 1].map(s => (
          <mesh key={s} position={[0, s * h * 0.2, 0.001]} userData={NO_SHADOW}>
            <boxGeometry args={[t, t, 0.002]} />
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// Three wall clocks, each telling the time. An oak ring round a pale face
// with four quarter marks. A digital clock, a slim dark bar with the hours
// and minutes lit in seven segment digits behind smoked glass. A ball clock
// after the Vitra Ball Clock by George Nelson, twelve balls on spokes round
// a small hub and no face at all. `s` is its diameter, or the digital
// clock's width. `glow` is the color the digits light in.
export function Clock({ style, s, paint, glow }: { style: string; s: number; paint: Paint; glow: string }) {
  const r = s / 2
  if (style === 'digital') {
    const h = s * 0.34
    const depth = 0.03
    return (
      <group>
        <Slab size={[s, depth, h]} radius={Math.min(0.012, h * 0.2)} bevel={0.004} rotation={[Math.PI / 2, 0, 0]}>
          {paint('rim')}
        </Slab>
        {/* The smoked glass front, inset in the frame. */}
        <mesh position={[0, 0, depth + 0.0005]}>
          <planeGeometry args={[s - 0.02, h - 0.02]} />
          {paint('face')}
        </mesh>
        <DigitalTime w={s * 0.8} h={h * 0.56} z={depth + 0.002} glow={glow} />
      </group>
    )
  }
  if (style === 'ball') {
    const hub = r * 0.14
    const reach = r - r * 0.09
    return (
      <group>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.03]}>
          <cylinderGeometry args={[hub, hub, 0.02, SEG]} />
          {paint('face')}
        </mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <group key={i} rotation={[0, 0, -a]}>
              <mesh position={[0, (hub + reach) / 2, 0.03]}>
                <cylinderGeometry args={[0.003, 0.003, reach - hub, 8]} />
                {paint('face')}
              </mesh>
              <mesh position={[0, reach, 0.03]} castShadow>
                <sphereGeometry args={[r * 0.09, 20, 14]} />
                {paint('rim')}
              </mesh>
            </group>
          )
        })}
        <Hands
          z={0.045}
          hour={
            <Hand len={r * 0.45} w={r * 0.07} z={0}>
              {paint('hands')}
            </Hand>
          }
          minute={
            <Hand len={r * 0.7} w={r * 0.05} z={0.004}>
              {paint('hands')}
            </Hand>
          }
          second={
            <Hand len={r * 0.72} tail={r * 0.15} w={r * 0.015} z={0.008}>
              {paint('accent')}
            </Hand>
          }
        />
      </group>
    )
  }
  const ring = Math.min(0.016, r * 0.1)
  const marks = 4
  return (
    <group>
      <mesh position={[0, 0, 0.02]}>
        <torusGeometry args={[r - ring, ring, 16, SEG * 2]} />
        {paint('rim')}
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.016]}>
        <cylinderGeometry args={[r - ring * 0.6, r - ring * 0.6, 0.014, SEG * 2]} />
        {paint('face')}
      </mesh>
      {Array.from({ length: marks }, (_, i) => {
        const a = (i / marks) * Math.PI * 2
        const len = r * 0.14
        const at = r - ring * 2 - len / 2
        return (
          <mesh key={i} position={[Math.sin(a) * at, Math.cos(a) * at, 0.0245]} rotation={[0, 0, -a]}>
            <boxGeometry args={[r * 0.04, len, 0.003]} />
            {paint('rim')}
          </mesh>
        )
      })}
      <Hands
        z={0.026}
        hour={
          <Hand len={r * 0.5} w={r * 0.07} z={0}>
            {paint('hands')}
          </Hand>
        }
        minute={
          <Hand len={r * 0.76} w={r * 0.05} z={0.004}>
            {paint('hands')}
          </Hand>
        }
        second={
          <Hand len={r * 0.62} tail={r * 0.2} w={r * 0.018} z={0.008}>
            {paint('accent')}
          </Hand>
        }
      />
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.037]}>
        <cylinderGeometry args={[r * 0.04, r * 0.04, 0.004, 20]} />
        {paint('hands')}
      </mesh>
    </group>
  )
}

// A stack of books as tall as set, each a real book in the next of three
// colors: two covers, a spine mostly to the front, and the block of pages
// between them showing on the other three sides. Each is a little out of line with the
// one under it, turned a little, and a little smaller or larger.
export function Books({ w, h, paint }: { w: number; h: number; paint: Paint }) {
  const count = Math.max(1, Math.round(h / 0.042))
  const step = h / count
  const trims = [0, 0.1, 0.04, 0.12, 0.06]
  const covers = ['first', 'second', 'third']
  const board = Math.min(0.004, step * 0.12)
  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const trim = 1 - trims[i % trims.length]
        const bw = w * trim
        const bd = w * 0.7 * trim
        const t = step - 0.002
        const cover = paint(covers[i % covers.length])
        return (
          <group
            key={i}
            position={[((i % 2) - 0.5) * w * 0.05, i * step, ((i % 3) - 1) * w * 0.03]}
            rotation={[0, ((i % 3) - 1) * 0.06 + (i % 4 === 3 ? Math.PI : 0), 0]}
          >
            {[0, t - board].map(y => (
              <Slab key={y} size={[bw, board, bd]} radius={0.002} bevel={board * 0.3} position={[0, y, 0]}>
                {cover}
              </Slab>
            ))}
            <Slab
              size={[bw, t, board * 1.6]}
              radius={0.002}
              bevel={board * 0.3}
              position={[0, 0, bd / 2 - board * 0.8]}
            >
              {cover}
            </Slab>
            <Slab
              size={[bw - 0.008, t - board * 2 + 0.001, bd - 0.008]}
              radius={0.001}
              bevel={0.0005}
              position={[0, board - 0.0005, -0.001]}
            >
              {paint('pages')}
            </Slab>
          </group>
        )
      })}
    </group>
  )
}

// A length of cloth hanging in even waves from `x0`, its outer end, to `x1`,
// from `top` down to `bottom`, its line `z` off the wall. It holds `cloth`
// meters of fabric however far it is drawn, so the waves deepen as it
// gathers.
function Drape({
  x0,
  x1,
  top,
  bottom,
  z,
  cloth,
  waves,
  shadow = true,
  children,
}: {
  x0: number
  x1: number
  top: number
  bottom: number
  z: number
  cloth: number
  waves: number
  shadow?: boolean
  children: ReactNode
}) {
  const segs = waves * 12
  const mesh = useRef<Mesh>(null)
  useLayoutEffect(() => {
    const geometry = mesh.current?.geometry
    if (!geometry) return
    const span = Math.abs(x1 - x0)
    const wave = span / waves
    const amp = Math.min(0.09, (wave / Math.PI) * Math.sqrt(Math.max(cloth / Math.max(span, 0.01) - 1, 0)))
    const at = geometry.attributes.position
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i <= segs; i++) {
        const u = i / segs
        at.setXYZ(
          row * (segs + 1) + i,
          x0 + (x1 - x0) * u,
          row === 0 ? top : bottom,
          z + amp * Math.sin(u * waves * Math.PI * 2),
        )
      }
    }
    at.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }, [segs, x0, x1, top, bottom, z, cloth, waves])
  return (
    <mesh key={segs} ref={mesh} castShadow={shadow}>
      <planeGeometry args={[1, 1, segs, 1]} />
      {children}
    </mesh>
  )
}

// Two curtains, two panels each, the rod or track at the origin and the
// floor `height` below it, the cloth stopping `hem` off the floor. `level`
// is how far open, from 0 shut to 1 drawn back to each end. A sheer on a
// slim ceiling style track, hanging in the even S folds of a wave heading,
// and a heavy velvet with eyelets threaded straight onto a thick rod.
export function Curtain({
  style,
  w,
  height,
  hem,
  level,
  single = false,
  left = false,
  paint,
  sheer,
}: {
  style: string
  w: number
  height: number
  hem: number
  level: number
  // One panel across the whole window instead of a pair meeting in the
  // middle, and the side it is drawn back to.
  single?: boolean
  left?: boolean
  paint: Paint
  sheer: ReactNode
}) {
  const drop = Math.max(height - hem, 0.2)
  const z = 0.075
  // Each panel, laid out from its outer end, reaches the middle when shut
  // and bunches to a third of that when open. A single panel reaches the
  // other end instead, from the side it opens to.
  const full = single ? w + 0.12 : w / 2 + 0.06
  const gather = 1 - 0.66 * level
  const ends = single ? [left ? -1 : 1] : [-1, 1]
  const outer = (s: number) => s * (single ? full / 2 : full)
  if (style === 'eyelet') {
    const waves = Math.max(3, Math.round(full / 0.16))
    const rod = w + 0.24
    return (
      <group>
        <Bar length={rod} radius={0.014} rotation={[0, 0, Math.PI / 2]} position={[0, 0.02, z]}>
          {paint('rail')}
        </Bar>
        {[-1, 1].map(s => (
          <group key={s}>
            <mesh position={[(s * rod) / 2, 0.02, z]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.022, 0.022, 0.05, 20]} />
              {paint('rail')}
            </mesh>
            <mesh position={[s * (w / 2 + 0.05), 0.02, z / 2]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.01, 0.01, z, 12]} />
              {paint('rail')}
            </mesh>
          </group>
        ))}
        {ends.map(s => {
          const x0 = outer(s)
          const x1 = x0 - s * full * gather
          return (
            <group key={s}>
              <Drape x0={x0} x1={x1} top={0.065} bottom={-drop} z={z} cloth={full * 1.7} waves={waves}>
                {paint('fabric', true)}
              </Drape>
              {/* An eyelet wherever the cloth crosses the rod. */}
              {Array.from({ length: waves * 2 + 1 }, (_, k) => (
                <mesh key={k} position={[x0 + ((x1 - x0) * k) / (waves * 2), 0.02, z]}>
                  <torusGeometry args={[0.02, 0.004, 8, 20]} />
                  {paint('rail')}
                </mesh>
              ))}
            </group>
          )
        })}
      </group>
    )
  }
  const waves = Math.max(3, Math.round(full / 0.11))
  return (
    <group>
      <Slab size={[w + 0.1, 0.02, 0.03]} radius={0.004} bevel={0.002} position={[0, 0.005, z]}>
        {paint('rail')}
      </Slab>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * (w / 2 + 0.02), 0.015, z / 2]}>
          <boxGeometry args={[0.02, 0.012, z]} />
          {paint('rail')}
        </mesh>
      ))}
      {ends.map(s => (
        <Drape
          key={s}
          x0={outer(s)}
          x1={outer(s) - s * full * gather}
          top={0.004}
          bottom={-drop}
          z={z}
          cloth={full * 1.9}
          waves={waves}
          shadow={false}
        >
          {sheer}
        </Drape>
      ))}
    </group>
  )
}
