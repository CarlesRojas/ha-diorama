import {
  colorValue,
  decorationVariant,
  leafCount,
  materialValue,
  paramValue,
  screenSize,
  type DecorationKind,
} from '#/decoration/catalog.ts'
import { Bar, Draft, Glass, Halo, Led, Material, SEG, Slab, Steam, Waves } from '#/scene/decor/parts.tsx'
import { roundedShape } from '#/geometry/polygon.ts'
import ScreenMaterial, { Projection, ScreenGlow } from '#/scene/decor/Screen.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import type { DecorationConfig } from '#/types.ts'
import { useEased, useTravel } from '#/scene/decor/ease.ts'
import { useWarmed } from '#/scene/warm.ts'
import Vacuum from '#/scene/decor/Vacuum.tsx'
import PergolaAwning from '#/scene/decor/Pergola.tsx'
import { CeilingFan, FloorFan, Radiator } from '#/scene/decor/Climate.tsx'
import { FAN_SPEED } from '#/scene/decor/pressed.ts'
import { Beam, Console, FloorSpeaker, PortableProjector, Speaker } from '#/scene/decor/Media.tsx'
import type { RoomConfig } from '#/types.ts'
import { MODE_HEX } from '#/tiles/modes.ts'
import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { useLive } from '#/scene/live.ts'
import { DoubleSide, ExtrudeGeometry, Quaternion, Vector3, type MeshStandardMaterial, type PointLight } from 'three'

type Props = {
  kind: DecorationKind
  item: DecorationConfig
  state: ItemState | null
  // The room the piece stands in and everything else in the plan, for the
  // few models that have to know where they can drive.
  room?: RoomConfig
  all: DecorationConfig[]
}

// A flat shape cut from the front and extruded toward the viewer: the bar
// of a lever handle, drawn as a rectangle with fully rounded ends.
function Plate({
  width,
  height,
  depth,
  position,
  children,
}: {
  width: number
  height: number
  depth: number
  position: [number, number, number]
  children: ReactNode
}) {
  const geometry = useMemo(() => {
    const shape = roundedShape(
      [
        [-width / 2, -height / 2],
        [width / 2, -height / 2],
        [width / 2, height / 2],
        [-width / 2, height / 2],
      ],
      height / 2,
    )
    return new ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 })
  }, [width, height, depth])
  return (
    <mesh geometry={geometry} position={position} castShadow>
      {children}
    </mesh>
  )
}

// Media, climate, covers, security and the small smart home fittings.
type Vec3 = [number, number, number]

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

// A smoke alarm going off: its ring flashes twice a second and a strong
// red light under it washes the floor and the furniture round it, the way
// a lamp would, so the alarm reads from across the flat.
function Alarm({ on, s, y }: { on: boolean; s: number; y: number }) {
  const ring = useRef<MeshStandardMaterial>(null)
  const light = useRef<PointLight>(null)
  const last = useRef(-1)
  // The light joins the scene once the shaders for a scene with it in are
  // built, so the first flash does not stall the frame.
  const shown = useWarmed(on, visible => {
    if (light.current) light.current.visible = visible
  })
  useLive(on)
  useFrame(({ clock }) => {
    const flash = on && clock.elapsedTime % 0.5 < 0.25 ? 1 : 0
    if (flash === last.current) return
    last.current = flash
    if (ring.current) ring.current.emissiveIntensity = 3.5 * flash
    if (light.current) light.current.intensity = 4 * flash
  })
  return (
    <group>
      <mesh position={[0, y - 0.001, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[s * 0.13, s * 0.018, 10, SEG * 2]} />
        <meshStandardMaterial ref={ring} color="#f2d0cc" emissive="#ff2a1a" emissiveIntensity={0} />
      </mesh>
      <pointLight
        ref={light}
        position={[0, y - 0.15, 0]}
        color="#ff3020"
        intensity={0}
        distance={5}
        decay={1}
        visible={shown}
      />
    </group>
  )
}

// A color like #ff6422 as red, green and blue from 0 to 1.
const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
]

export default function DeviceModel({ kind, item, state, room, all }: Props) {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const m = (slot: string) => materialValue(kind, slot, item.variant)
  // Every part names itself, so a device's colors read as its parts.
  const M = (slot: string) => <Material color={c(slot)} material={m(slot)} />
  const look = { paint: M, color: c, material: m }
  const style = decorationVariant(kind, item.variant)?.id ?? ''
  const on = state?.on ?? false
  const level = state?.level ?? 1
  // Everything that moves is eased, so a cover reporting its position once a
  // second travels instead of stuttering and a door swings instead of
  // snapping. The hooks are called here, never inside the switch, so their
  // order does not depend on which kind is being drawn.
  // How far open a hinged or sliding thing is, 0 to 1.
  const swing = useEased(on ? 1 : 0, 6)
  // Anything that lights up fades with this, and anything that spins uses
  // it to run down rather than stopping dead.
  const lit = useEased(on ? 1 : 0, 9)
  // Sound only comes out of something that is on and not paused or idle, so
  // a speaker on pause keeps its lights but stops sending out waves.
  const sounding = on && state?.text !== 'paused' && state?.text !== 'idle'
  // How far open the item is: the percentage feeding it, or its switch when
  // it has none. Without the switch, a cover bound to something that only
  // turns on and off would never move.
  const openTarget = state ? (state.levels.open ?? (state.on ? 1 : 0)) : 0
  const coverLevel = useTravel(openTarget, undefined, state?.dragged)
  // Same, but a cover with no position at all counts as fully open.
  const openAmount = coverLevel
  // Slats, or a window's tilt, when a second percentage feeds it.
  // Home Assistant counts a tilt up from shut, so nothing feeding it means
  // slats closed and a window standing straight.
  const tiltAmount = useTravel(state?.levels.tilt ?? 0)
  // A window's lean. A tilt and turn handle does one or the other, so a
  // window that opens at all stands straight again first.
  const leanAmount = useTravel(openTarget > 0 ? 0 : (state?.levels.tilt ?? 0))
  const runLevel = useEased(level, 6)

  // One leaf of a window or a door: a thin frame around a pane of glass, or
  // around a solid panel. It stands on its own base, centered on `cx`, so
  // the edges of leaves that overlap stay legible.
  const sash = (cx: number, lw: number, lh: number, frame: ReactNode, glass: string | null, t = 0.03) => (
    <group position={[cx, 0, 0]}>
      <Slab size={[t, lh, t]} radius={0.007} position={[-lw / 2 + t / 2, 0, 0]}>
        {frame}
      </Slab>
      <Slab size={[t, lh, t]} radius={0.007} position={[lw / 2 - t / 2, 0, 0]}>
        {frame}
      </Slab>
      <Slab size={[lw, t, t]} radius={0.007} position={[0, 0, 0]}>
        {frame}
      </Slab>
      <Slab size={[lw, t, t]} radius={0.007} position={[0, lh - t, 0]}>
        {frame}
      </Slab>
      {glass === null ? (
        <Slab size={[Math.max(lw - t, 0.02), Math.max(lh - t * 2, 0.02), t * 0.7]} radius={0.008} position={[0, t, 0]}>
          {M('panel')}
        </Slab>
      ) : (
        <mesh position={[0, lh / 2, t / 2]}>
          <planeGeometry args={[Math.max(lw - t * 2, 0.02), Math.max(lh - t * 2, 0.02)]} />
          <Glass color={glass} />
        </mesh>
      )}
    </group>
  )

  // A dark panel that plays a picture when the device is on and is a black
  // mirror when it is off.
  // A modern panel: nearly frameless, thin at the edge, with the
  // electronics in a box behind the lower half.
  const screen = (w: number, h: number, z: number) => (
    <group>
      <Slab size={[w, h, 0.016]} radius={0.008} bevel={0.004} position={[0, 0, z]}>
        {M('bezel')}
      </Slab>
      <Slab size={[w * 0.55, h * 0.4, 0.032]} radius={0.012} bevel={0.006} position={[0, h * 0.05, z - 0.024]}>
        {M('bezel')}
      </Slab>
      <mesh position={[0, h / 2, z + 0.0095]}>
        <planeGeometry args={[w - 0.012, h - 0.012]} />
        {on ? (
          <ScreenMaterial showing={state?.showing} aspect={(w - 0.012) / (h - 0.012)} />
        ) : (
          <meshStandardMaterial color={c('screen')} roughness={0.12} metalness={0.25} />
        )}
      </mesh>
      {/* The picture's light on the room round it, more for a bigger screen. */}
      <ScreenGlow
        on={on}
        position={[0, h / 2, z + 0.25]}
        intensity={0.7 * Math.min(1.8, 0.6 + w * 0.9)}
        distance={2.5 + w * 2}
        showing={state?.showing}
      />
    </group>
  )

  switch (kind.id) {
    // Media
    case 'tv': {
      // A panel on a low blade foot, the way a Nordic set is stood on a
      // sideboard.
      const [w, h] = screenSize(p('inches'))
      const foot = Math.max(0.28, w * 0.26)
      return (
        <group>
          <Slab size={[foot, 0.016, 0.24]} radius={0.02} bevel={0.005} position={[0, 0, 0]}>
            <Material color={c('stand')} material={m('stand')} />
          </Slab>
          {/* The neck, a flat blade rather than a post. */}
          <Slab size={[foot * 0.5, 0.11, 0.03]} radius={0.01} bevel={0.005} position={[0, 0.016, 0]}>
            <Material color={c('stand')} material={m('stand')} />
          </Slab>
          <group position={[0, 0.12, 0]}>{screen(w, h, 0)}</group>
        </group>
      )
    }
    case 'tv_wall':
    case 'monitor': {
      const [w, h] = kind.id === 'monitor' ? [p('width'), p('width') * p('ratio')] : screenSize(p('inches'))
      if (kind.id === 'monitor') {
        // After the Dell U2723QE: a flat rounded base plate, a slim column
        // standing behind the panel, and a hinge block reaching forward
        // from it into the box on the panel's back. The panel clears the
        // desk by a hand's width, a little more for a taller one.
        const bottom = 0.05 + h * 0.15
        const post = Math.min(0.075, w * 0.12)
        const postZ = -0.058
        const baseW = Math.max(0.16, w * 0.38)
        const baseD = Math.min(0.24, Math.max(0.14, h * 0.5))
        const hinge = bottom + h * 0.3
        return (
          <group>
            <Slab size={[baseW, 0.014, baseD]} radius={0.03} bevel={0.005} position={[0, 0, postZ - 0.03 + baseD / 2]}>
              <Material color={c('stand')} material={m('stand')} />
            </Slab>
            <Slab size={[post, hinge + 0.03, 0.024]} radius={0.01} bevel={0.004} position={[0, 0.01, postZ]}>
              <Material color={c('stand')} material={m('stand')} />
            </Slab>
            <Slab size={[post * 0.9, 0.05, 0.03]} radius={0.01} bevel={0.004} position={[0, hinge - 0.025, -0.045]}>
              <Material color={c('stand')} material={m('stand')} />
            </Slab>
            <group position={[0, bottom, 0]}>{screen(w, h, 0)}</group>
          </group>
        )
      }
      return <group position={[0, -h / 2, 0]}>{screen(w, h, 0.03)}</group>
    }
    case 'soundbar': {
      // A fabric wrapped bar with hard end caps and a control strip on top.
      // The sound spreads in rings from a driver near each end, laid flat
      // just above the bar, so they never cut into it or what it stands on.
      const w = p('width')
      const h = p('height')
      const d = 0.1
      const across = style === 'arc' ? Math.max(d, h * 1.3) : d
      const sound = (
        <>
          {[-1, 1].map(side => (
            <Waves
              key={side}
              on={sounding}
              position={[side * (w / 2 - Math.min(0.12, w * 0.15)), h + 0.015, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              from={across / 2 + 0.02}
              reach={Math.max(0.18, h * 2.4)}
            />
          ))}
        </>
      )
      if (style === 'arc') {
        // A capsule laid along the bar, oval in section, with a light
        // strip across the middle of its top.
        const dd = Math.max(d, h * 1.3)
        return (
          <group>
            <mesh position={[0, h / 2, 0]} rotation={[0, 0, Math.PI / 2]} scale={[1, 1, dd / h]} castShadow>
              <capsuleGeometry args={[h / 2, Math.max(w - h, 0.01), 12, SEG]} />
              <Material color={c('grille')} material={m('grille')} />
            </mesh>
            {/* The feet it rests on. */}
            <mesh position={[0, 0.004, 0]}>
              <boxGeometry args={[w * 0.8, 0.008, dd * 0.4]} />
              {M('caps')}
            </mesh>
            <mesh position={[0, h + 0.0005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[w * 0.16, 0.004]} />
              <meshStandardMaterial color={c('caps')} emissive="#ffffff" emissiveIntensity={1.4 * lit} />
            </mesh>
            {sound}
          </group>
        )
      }
      return (
        <group>
          <Slab size={[w, h, d]} radius={h / 2.4} bevel={0.008} position={[0, 0, 0]}>
            <Material color={c('grille')} material={m('grille')} />
          </Slab>
          {[-1, 1].map(side => (
            <Slab
              key={side}
              size={[0.022, h, d]}
              radius={h / 2.6}
              bevel={0.006}
              position={[(side * (w - 0.02)) / 2, 0, 0]}
            >
              {M('caps')}
            </Slab>
          ))}
          {/* Control strip and feet. */}
          <mesh position={[0, h + 0.001, -d * 0.2]}>
            <boxGeometry args={[w * 0.3, 0.004, d * 0.3]} />
            {M('caps')}
          </mesh>
          {[-1, 1].map(side => (
            <mesh key={side} position={[side * w * 0.36, 0.004, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.008, 16]} />
              {M('caps')}
            </mesh>
          ))}
          <Led on={on} position={[0, h * 0.4, d / 2 + 0.002]} radius={0.007} />
          {sound}
        </group>
      )
    }
    case 'speaker':
      return (
        <Speaker style={style} r={p('size') / 2} h={p('height')} on={on} lit={lit} sounding={sounding} look={look} />
      )
    case 'floor_speaker':
      return <FloorSpeaker style={style} w={p('width')} h={p('height')} on={on} sounding={sounding} look={look} />
    case 'game_console':
      return <Console style={style} w={p('width')} h={p('height')} on={on} lit={lit} look={look} />
    case 'projector_portable':
      return (
        <PortableProjector
          s={p('size')}
          throwLength={p('throw')}
          swing={swing}
          lit={lit}
          look={look}
          showing={state?.showing}
        />
      )
    case 'projector': {
      // After the Epson EH-TW7100 on a ceiling pole: a round plate on the
      // ceiling, a pole down to a flat bracket, and the wide body hanging
      // from it with the lens in the middle of its front, between two vent
      // grilles. The size is the body's width.
      const w = p('size')
      const bh = w * 0.38
      const bd = w * 0.76
      const pole = Math.max(0.06, w * 0.35)
      const top = -(0.012 + pole + 0.01)
      const mid = top - bh / 2
      return (
        <group>
          <mesh position={[0, -0.006, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, SEG]} />
            {M('mount')}
          </mesh>
          <mesh position={[0, -0.012 - pole / 2, 0]}>
            <cylinderGeometry args={[0.014, 0.014, pole, 20]} />
            {M('mount')}
          </mesh>
          <Slab size={[w * 0.6, 0.01, bd * 0.6]} radius={0.01} position={[0, top, 0]}>
            {M('mount')}
          </Slab>
          <Slab
            size={[w, bh, bd]}
            radius={Math.min(0.03, bh * 0.3)}
            bevel={Math.min(0.012, bh * 0.1)}
            position={[0, top - bh, 0]}
          >
            {M('body')}
          </Slab>
          {/* Vent grilles either side of the lens. */}
          {[-1, 1].flatMap(side =>
            [0, 1, 2, 3].map(i => (
              <mesh key={`${side}:${i}`} position={[side * w * 0.31, mid + bh * (0.21 - i * 0.14), bd / 2 + 0.001]}>
                <boxGeometry args={[w * 0.26, bh * 0.06, 0.003]} />
                {M('mount')}
              </mesh>
            )),
          )}
          {/* Lens barrel, stepping out of the front face. */}
          <mesh position={[0, mid, bd / 2 + w * 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[bh * 0.34, bh * 0.36, w * 0.05, SEG]} />
            {M('mount')}
          </mesh>
          <mesh position={[0, mid, bd / 2 + w * 0.045]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[bh * 0.26, bh * 0.26, w * 0.01, SEG]} />
            <meshStandardMaterial color={c('lens')} emissive="#cfe4f5" emissiveIntensity={2 * lit} />
          </mesh>
          <Led on={on} position={[w * 0.44, top - bh * 0.15, bd / 2 + 0.002]} radius={Math.min(0.006, w * 0.02)} />
          {/* The picture on its way out, aimed a little down into the room. */}
          <group position={[0, mid, bd / 2 + w * 0.05]} rotation={[0.1, 0, 0]}>
            <Beam length={p('throw')} width={p('throw') * 0.55} strength={lit} showing={state?.showing} />
          </group>
        </group>
      )
    }

    // Climate
    case 'radiator':
      return (
        <Radiator style={style} w={p('width')} h={p('height')} base={p('base')} warm={0.45 * level * lit} look={look} />
      )
    case 'ac_unit': {
      // A split unit: a soft rounded shell, the intake grille across the
      // top, a louvre that tips open underneath and a small display. Its
      // height and depth follow its width, within what real units come in.
      const w = p('width')
      // The air out in the color its tiles show, like orange while it
      // heats, and plain while it waits.
      const air = MODE_HEX[state?.text ?? ''] ?? '#6b7480'
      if (style === 'duct') {
        // A grille let into the wall, a frame round a dark slot of blades
        // angled down, with the air coming out through them.
        const gh = 0.14
        const blades = 5
        return (
          <group position={[0, -gh, 0]}>
            {(
              [
                [0, gh - 0.01, w, 0.02],
                [0, 0.01, w, 0.02],
                [-w / 2 + 0.01, gh / 2, 0.02, gh],
                [w / 2 - 0.01, gh / 2, 0.02, gh],
              ] as const
            ).map(([x, y, fw, fh], i) => (
              <mesh key={i} position={[x, y, 0.007]} castShadow>
                <boxGeometry args={[fw, fh, 0.014]} />
                {M('body')}
              </mesh>
            ))}
            <mesh position={[0, gh / 2, 0.002]}>
              <planeGeometry args={[w - 0.04, gh - 0.04]} />
              <Material color="#1d2022" material="matte" />
            </mesh>
            {Array.from({ length: blades }).map((_, i) => (
              <mesh
                key={i}
                position={[0, 0.02 + ((i + 0.5) * (gh - 0.04)) / blades, 0.008]}
                rotation={[0.5 + 0.3 * swing, 0, 0]}
              >
                <boxGeometry args={[w - 0.045, 0.003, 0.018]} />
                {M('grille')}
              </mesh>
            ))}
            <Draft on={on} position={[0, gh * 0.3, 0.02]} width={w * 0.7} color={air} />
          </group>
        )
      }
      const h = Math.min(Math.max(w * 0.33, 0.12), 0.34)
      const d = Math.min(Math.max(w * 0.22, 0.1), 0.24)
      const vents = Math.max(8, Math.round(w / 0.06))
      return (
        <group position={[0, -h, 0]}>
          <Slab
            size={[w, h, d]}
            radius={Math.min(0.05, h * 0.2)}
            bevel={Math.min(0.035, h * 0.12)}
            position={[0, 0, d / 2]}
          >
            {M('body')}
          </Slab>
          {/* Intake slots, raked across the top face. */}
          {Array.from({ length: vents }).map((_, i) => (
            <mesh key={i} position={[-w / 2 + ((i + 0.5) * w) / vents, h - 0.004, d * 0.45]}>
              <boxGeometry args={[(w / vents) * 0.55, 0.005, d * 0.5]} />
              {M('grille')}
            </mesh>
          ))}
          {/* The outlet, a recess under the front with the flap in it. */}
          <mesh position={[0, h * 0.15, d - d * 0.15]}>
            <boxGeometry args={[w - 0.09, h * 0.2, d * 0.25]} />
            <Material color="#2f3336" material="matte" />
          </mesh>
          <Slab
            size={[w - 0.1, h * 0.07, d * 0.38]}
            radius={0.01}
            bevel={0.006}
            position={[0, h * 0.13, d - 0.012]}
            rotation={[-0.7 * swing, 0, 0]}
          >
            {M('grille')}
          </Slab>
          {/* Display strip, dark until it runs. */}
          <mesh position={[w * 0.39, h * 0.42, d + 0.001]}>
            <planeGeometry args={[w * 0.12, h * 0.09]} />
            <meshStandardMaterial color={c('display')} emissive="#7fb3e8" emissiveIntensity={0.8 * lit} />
          </mesh>
          <Led on={on} position={[w * 0.31, h * 0.42, d + 0.004]} color="#7fb3e8" radius={Math.min(0.008, h * 0.03)} />
          {/* The draft out of the outlet, from inside it over the flap and
              sinking forward. */}
          <Draft on={on} position={[0, h * 0.15, d * 0.9]} width={w - 0.12} color={air} />
        </group>
      )
    }
    case 'fan_ceiling':
      return (
        <CeilingFan
          style={style}
          r={p('size') / 2}
          drop={p('drop')}
          speed={(FAN_SPEED.fan_ceiling + runLevel * 5) * lit}
          look={look}
        />
      )
    case 'fan_floor':
      return (
        <FloorFan
          style={style}
          r={p('size') / 2}
          h={p('height')}
          on={on}
          speed={(FAN_SPEED.fan_floor + runLevel * 6) * lit}
          look={look}
        />
      )
    case 'air_purifier': {
      // A drum wrapped in filter fabric on a hard foot, with a collar
      // round the top, a sunken outlet grille and a round display. The
      // parts stack from the floor to the height set, with no gaps.
      const r = p('size') / 2
      const h = p('height')
      const foot = Math.min(0.036, h * 0.08)
      const collar = Math.min(0.09, h * 0.16)
      const band = h - foot - collar
      const spokes = 10
      return (
        <group>
          <mesh position={[0, foot / 2, 0]}>
            <cylinderGeometry args={[r * 0.96, r * 0.92, foot, SEG * 2]} />
            {M('body')}
          </mesh>
          {/* The filter band, the part that reads as fabric. */}
          <mesh position={[0, foot + band / 2, 0]} castShadow>
            <cylinderGeometry args={[r, r, band, SEG * 2, 1, true]} />
            <Material color={c('filter')} material={m('filter')} doubleSide />
          </mesh>
          <mesh position={[0, h - collar / 2 - 0.005, 0]}>
            <cylinderGeometry args={[r * 0.98, r, collar - 0.01, SEG * 2]} />
            {M('body')}
          </mesh>
          {/* Outlet grille: a disc inside the collar's rim, crossed by bars. */}
          <mesh position={[0, h - 0.006, 0]}>
            <cylinderGeometry args={[r * 0.9, r * 0.9, 0.012, SEG * 2]} />
            <Material color={c('grille')} material={m('grille')} />
          </mesh>
          {Array.from({ length: spokes }).map((_, i) => (
            <mesh key={i} position={[0, h + 0.002, 0]} rotation={[0, (i / spokes) * Math.PI, 0]}>
              <boxGeometry args={[r * 1.76, 0.004, 0.01]} />
              {M('body')}
            </mesh>
          ))}
          <mesh position={[0, h + 0.008, 0]}>
            <cylinderGeometry args={[r * 0.3, r * 0.3, 0.012, SEG]} />
            <meshStandardMaterial color={c('display')} emissive="#7fb3e8" emissiveIntensity={0.9 * level * lit} />
          </mesh>
          {/* A light round the rim of the collar, and the clean air rising
              off the grille, fuller the faster it runs. */}
          <mesh position={[0, h + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r * 0.9, r * 0.97, SEG * 2]} />
            <meshStandardMaterial color={c('body')} emissive="#7fb3e8" emissiveIntensity={1.4 * lit} />
          </mesh>
          <Steam
            on={on}
            position={[0, h + 0.02, 0]}
            radius={r * 0.4}
            rise={r * 3}
            count={8}
            strength={0.06 + level * 0.08}
            speed={0.3 + level * 0.4}
            color="#dceeff"
          />
        </group>
      )
    }
    case 'humidifier': {
      // A stoneware jar with a stepped shoulder and a nozzle in the neck.
      const r = p('size') / 2
      const h = p('height')
      return (
        <group>
          <mesh position={[0, h * 0.42, 0]} castShadow>
            <cylinderGeometry args={[r, r * 0.86, h * 0.84, SEG * 2]} />
            {M('body')}
          </mesh>
          <mesh position={[0, h * 0.88, 0]}>
            <cylinderGeometry args={[r * 0.72, r, h * 0.1, SEG * 2]} />
            {M('collar')}
          </mesh>
          <mesh position={[0, h - 0.008, 0]}>
            <cylinderGeometry args={[r * 0.46, r * 0.62, 0.03, SEG * 2]} />
            {M('collar')}
          </mesh>
          <mesh position={[0, h + 0.004, 0]}>
            <cylinderGeometry args={[r * 0.3, r * 0.3, 0.016, SEG]} />
            <Material color={c('nozzle')} material={m('nozzle')} />
          </mesh>
          {/* A soft plume rising out of the nozzle, fuller the higher it runs. */}
          <Steam
            on={on}
            position={[0, h + r * 0.1, 0]}
            radius={r * 0.35}
            rise={r * 3.2}
            count={10}
            strength={0.12 + level * 0.14}
            speed={0.25 + level * 0.2}
            color="#e8f2f6"
          />
        </group>
      )
    }
    case 'thermostat': {
      // A round dial: a steel ring around a face that lights when it runs,
      // in the color its tiles show, and white while it waits.
      const r = p('size') / 2
      const glow = MODE_HEX[state?.text ?? ''] ?? '#ffffff'
      return (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.012]}>
            <cylinderGeometry args={[r * 0.72, r * 0.72, 0.024, SEG]} />
            {M('back')}
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.034]}>
            <cylinderGeometry args={[r, r * 0.96, 0.03, SEG]} />
            {M('ring')}
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.05]}>
            <cylinderGeometry args={[r * 0.82, r * 0.82, 0.004, SEG]} />
            <Material color={c('face')} material={m('face')} emissive={rgbOf(glow)} emissiveIntensity={1.5 * lit} />
          </mesh>
          <Halo on={on} position={[0, 0, 0.1]} color={glow} />
        </group>
      )
    }

    // Covers
    case 'blind':
    case 'awning': {
      const w = p('width')
      const full = p('drop')
      // Home Assistant reports 1 as open, so an open blind or shutter is
      // gathered up, while an open awning is the one run out over the
      // terrace. The parts are built once at full size and the group is
      // scaled, which keeps the travel smooth: rebuilding a slat or a slab
      // every frame is what made these move in steps.
      const awning = kind.id === 'awning'
      const out = Math.max(awning ? coverLevel : 1 - coverLevel, 0.001)
      // Each of these calls its moving part and its head by its own name.
      const cloth = awning ? 'canopy' : 'slats'
      const head = awning ? 'cassette' : 'rail'
      // A blind's slats turn with its second percentage: flat lets the light
      // through, upright shuts it out.
      const slatAngle = (1 - tiltAmount) * 1.2
      if (awning && style === 'pergola') {
        return (
          <PergolaAwning
            w={w}
            reach={full}
            floor={p('height')}
            out={coverLevel}
            canopy={<Material color={c(cloth)} material={m(cloth)} doubleSide />}
            frame={<Material color={c(head)} material={m(head)} />}
          />
        )
      }
      if (awning) {
        // After the Markilux 990: the cloth runs out of a cassette on a
        // front profile carried by two folding arms, which open out from
        // brackets under the cassette as the awning extends.
        const pitch = 0.25
        const reach = full * out
        const cassette = { h: 0.12, d: 0.16 }
        const endY = -cassette.h + 0.02 - reach * Math.sin(pitch)
        const endZ = cassette.d - 0.02 + reach * Math.cos(pitch)
        const armX = w / 2 - Math.min(0.15, w * 0.1)
        // Each arm is two halves, as long as the full extension needs, and
        // never so long that the two meet when they fold.
        const half = Math.min(full * 0.52, armX - 0.05)
        const metal = <Material color={c(head)} material={m(head)} />
        return (
          <group>
            <Slab size={[w + 0.04, cassette.h, cassette.d]} radius={0.05} position={[0, -cassette.h, cassette.d / 2]}>
              {metal}
            </Slab>
            <group position={[0, -cassette.h + 0.02, cassette.d - 0.02]} rotation={[pitch, 0, 0]} scale={[1, 1, out]}>
              <Slab size={[w - 0.04, 0.01, full]} radius={0.005} position={[0, 0, full / 2]}>
                <Material color={c(cloth)} material={m(cloth)} />
              </Slab>
            </group>
            {/* The front profile, with a short valance hanging from it. */}
            <Slab size={[w, 0.06, 0.07]} radius={0.02} position={[0, endY - 0.05, endZ]}>
              {metal}
            </Slab>
            <Slab size={[w - 0.02, 0.16, 0.006]} radius={0.002} bevel={0.001} position={[0, endY - 0.21, endZ + 0.03]}>
              <Material color={c(cloth)} material={m(cloth)} />
            </Slab>
            {[-1, 1].map(sx => {
              const shoulder: Vec3 = [sx * armX, -cassette.h - 0.07, 0.06]
              const hand: Vec3 = [sx * armX, endY - 0.02, endZ - 0.02]
              const span = Math.hypot(hand[1] - shoulder[1], hand[2] - shoulder[2])
              const bend = Math.sqrt(Math.max(half * half - (span / 2) ** 2, 0))
              // The elbow swings in toward the middle as the arm folds.
              const elbow: Vec3 = [sx * (armX - bend), (shoulder[1] + hand[1]) / 2, (shoulder[2] + hand[2]) / 2]
              return (
                <group key={sx}>
                  <Slab size={[0.08, 0.1, 0.07]} radius={0.015} position={[sx * armX, -cassette.h - 0.1, 0.035]}>
                    {metal}
                  </Slab>
                  <Rod from={shoulder} to={elbow} radius={0.018}>
                    {metal}
                  </Rod>
                  <Rod from={elbow} to={hand} radius={0.015}>
                    {metal}
                  </Rod>
                  <mesh position={elbow}>
                    <sphereGeometry args={[0.024, 12, 8]} />
                    {metal}
                  </mesh>
                </group>
              )
            })}
          </group>
        )
      }
      const rail = <Material color={c(head)} material={m(head)} />
      const slat = <Material color={c(cloth)} material={m(cloth)} />
      // How far down it hangs right now.
      const down = full * out
      if (style === 'shutter') {
        // A roller shutter rolls up into its box. The slats keep their size
        // and run up into it one after another, and only the bottom one
        // stays out when it is fully open. The box is taller than a slat,
        // so one on its way in never pokes out of the top. A slat is hidden
        // rather than dropped once it is all the way in, so nothing is
        // built again as it travels.
        const box = { h: 0.13, d: 0.12 }
        const n = Math.max(2, Math.round(full / 0.055))
        const pitch = full / n
        const z = 0.07
        return (
          <group>
            <Slab size={[w + 0.08, box.h, box.d]} radius={0.015} position={[0, -box.h, box.d / 2]}>
              {rail}
            </Slab>
            {/* The guide channel down each side, which the slats run in. */}
            {[-1, 1].map(sx => (
              <Slab
                key={sx}
                size={[0.035, full, 0.05]}
                radius={0.006}
                position={[sx * (w / 2 + 0.0175), -box.h - full, z]}
              >
                {rail}
              </Slab>
            ))}
            {Array.from({ length: n }).map((_, i) => {
              const last = i === n - 1
              // Where the bottom of this slat is, counted up from where the
              // shutter ends.
              const y = -box.h - down + (n - 1 - i) * pitch
              return (
                <group key={i} visible={last || y < -box.h}>
                  <Slab
                    size={[w, last ? pitch * 0.9 : pitch * 0.96, last ? 0.028 : 0.014]}
                    radius={0.006}
                    bevel={0.003}
                    position={[0, last ? Math.min(y, -box.h - 0.035) : y, z]}
                  >
                    {last ? rail : slat}
                  </Slab>
                </group>
              )
            })}
          </group>
        )
      }
      // A venetian blind comes up the way a real one does. The bottom rail
      // rises on its lift cords and gathers the slats onto itself, flat, in
      // a stack under the head rail. Nothing shrinks. Ladder tapes run down
      // in front of and behind every slat, holding them, from the head rail
      // to the bottom rail.
      const headH = 0.06
      const n = Math.max(2, Math.round(full / 0.06))
      const pitch = full / n
      const gap = 0.007
      // Fully up, the rail stops under the stack of slats it carries.
      const stack = n * gap
      const railTop = -headH - stack - (full - stack) * out
      const z = 0.045
      const reach = 0.033
      const tapes = w > 2 ? [-w * 0.38, 0, w * 0.38] : [-w * 0.34, w * 0.34]
      const hang = -railTop - headH
      return (
        <group>
          <Slab size={[w + 0.04, headH, 0.08]} radius={0.015} position={[0, -headH, 0.04]}>
            {rail}
          </Slab>
          {Array.from({ length: n }).map((_, i) => {
            const natural = -headH - pitch * (i + 0.5)
            const stacked = railTop + gap * (n - i - 0.5)
            // How far into the stack this slat is, where it lies flat.
            const flat = Math.min(Math.max((stacked - natural) / (pitch * 0.5) + 1, 0), 1)
            return (
              <mesh
                key={i}
                position={[0, Math.max(natural, stacked), z]}
                rotation={[slatAngle + (Math.PI / 2 - slatAngle) * flat, 0, 0]}
              >
                <boxGeometry args={[w, pitch * 1.08, 0.003]} />
                {slat}
              </mesh>
            )
          })}
          <Slab size={[w, 0.022, 0.05]} radius={0.008} bevel={0.003} position={[0, railTop - 0.022, z]}>
            {rail}
          </Slab>
          {tapes.map(x => (
            <group key={x} position={[x, -headH - hang / 2, z]}>
              {[-1, 1].map(f => (
                <mesh key={f} position={[0, 0, f * reach]}>
                  <boxGeometry args={[0.012, hang, 0.0015]} />
                  <Material color={c('ladder')} material={m('ladder')} />
                </mesh>
              ))}
              {/* The lift cord, through the middle of the slats. */}
              <mesh>
                <boxGeometry args={[0.0025, hang, 0.0025]} />
                <Material color={c('ladder')} material={m('ladder')} />
              </mesh>
            </group>
          ))}
        </group>
      )
    }
    case 'window': {
      // A frame with as many casements as the width takes, each between half
      // a meter and a meter wide. They swing inward when the cover opens.
      // Left alone, a run of them opens from the middle the way a pair of
      // French casements does. Hinge right swings every one of them from its
      // right edge instead, which is the other way a run of casements is
      // actually hung. Mirroring the run was the old meaning, and on the
      // pair most windows are it changed nothing at all.
      const w = p('width')
      const h = p('height')
      const hingeRight = p('flip') > 0.5
      // Steel frames are slimmer than timber or uPVC ones.
      const f = style === 'steel' ? 0.035 : 0.05
      const d = 0.05
      const frame = <Material color={c('frame')} material={m('frame')} />
      const inner = { w: w - f * 2, h: h - f * 2 }
      const leaves = leafCount(inner.w)
      const leafW = inner.w / leaves
      // Glazing bars across a leaf, laid on its glass. They move with the
      // leaf, so they are drawn inside whatever group swings or slides it.
      const bars = (cx: number, lw: number, lh: number, cols: number, rows: number, t: number) => (
        <group position={[cx, 0, t / 2]}>
          {Array.from({ length: cols - 1 }).map((_, i) => (
            <mesh key={`c${i}`} position={[-lw / 2 + (lw * (i + 1)) / cols, lh / 2, 0]}>
              <boxGeometry args={[0.012, lh - t * 2, 0.012]} />
              {frame}
            </mesh>
          ))}
          {Array.from({ length: rows - 1 }).map((_, j) => (
            <mesh key={`r${j}`} position={[0, (lh * (j + 1)) / rows, 0]}>
              <boxGeometry args={[lw - t * 2, 0.012, 0.012]} />
              {frame}
            </mesh>
          ))}
        </group>
      )
      const glass = c('glass')
      // How far a leaf's top leans into the room when it tilts, about ten
      // degrees at full tilt.
      const lean = -leanAmount * 0.17
      // The ways a window can open other than on side hinges. Each keeps the
      // outer frame and puts its own leaves inside it.
      let leavesDrawn: ReactNode = null
      if (style === 'sash') {
        // A box sash: two halves, the lower one sliding up on the room side
        // of the upper one as the window opens, each split by a glazing bar.
        // The lower one tilts in from its foot.
        const sh = inner.h / 2 + 0.015
        const rise = coverLevel * inner.h * 0.45
        leavesDrawn = (
          <>
            <group position={[0, f + inner.h - sh, 0.04]}>
              {sash(0, inner.w, sh, frame, glass)}
              {bars(0, inner.w, sh, 2, 1, 0.03)}
            </group>
            <group position={[0, f + rise, 0.005]} rotation={[lean, 0, 0]}>
              {sash(0, inner.w, sh, frame, glass)}
              {bars(0, inner.w, sh, 2, 1, 0.03)}
            </group>
          </>
        )
      } else if (style === 'slider') {
        // Two panes on two tracks. The back one slides over the fixed one,
        // from the right unless the hinge is flipped, and tilts in from its
        // foot.
        const side = hingeRight ? -1 : 1
        const pw = inner.w / 2 + 0.015
        const travel = coverLevel * (inner.w / 2 - 0.03)
        leavesDrawn = (
          <>
            <group position={[0, f, 0.04]}>{sash((-side * inner.w) / 4, pw, inner.h, frame, glass)}</group>
            <group position={[(side * inner.w) / 4 - side * travel, f, 0.005]} rotation={[lean, 0, 0]}>
              {sash(0, pw, inner.h, frame, glass)}
            </group>
          </>
        )
      }
      // Steel casements are the side hung ones again, only slimmer and
      // divided into small panes.
      const steel = style === 'steel'
      const t = steel ? 0.022 : 0.03
      const rows = Math.max(2, Math.round(inner.h / 0.3))
      return (
        // Set back so the frame stands as far out of one side of its wall as
        // out of the other.
        <group position={[0, 0, 0.02 - d / 2]}>
          <Slab size={[w, f, d]} radius={0.012} position={[0, 0, d / 2 - 0.02]}>
            {frame}
          </Slab>
          <Slab size={[w, f, d]} radius={0.012} position={[0, h - f, d / 2 - 0.02]}>
            {frame}
          </Slab>
          <Slab size={[f, inner.h, d]} radius={0.012} position={[-(w - f) / 2, f, d / 2 - 0.02]}>
            {frame}
          </Slab>
          <Slab size={[f, inner.h, d]} radius={0.012} position={[(w - f) / 2, f, d / 2 - 0.02]}>
            {frame}
          </Slab>
          {leavesDrawn ??
            Array.from({ length: leaves }).map((_, i) => {
              const left = !hingeRight && i < leaves / 2
              const edge = -inner.w / 2 + i * leafW
              const hinge = left ? edge : edge + leafW
              // Fully open is square to the wall.
              const open = (left ? 1 : -1) * (Math.PI / 2) * coverLevel
              return (
                <group key={i} position={[hinge, f, 0.02]} rotation={[0, open, 0]}>
                  {/* Tilt and turn: the top leans in when a tilt percentage
                    feeds it and the window is shut. */}
                  <group rotation={[lean, 0, 0]}>
                    {sash((left ? 1 : -1) * (leafW / 2), leafW, inner.h, frame, glass, t)}
                    {steel && bars((left ? 1 : -1) * (leafW / 2), leafW, inner.h, 2, rows, t)}
                  </group>
                </group>
              )
            })}
        </group>
      )
    }
    case 'door': {
      // A plain flush leaf in a lining, with an architrave on both faces and
      // a lever handle on each side. The hinge sits on the left unless the
      // flip switch moves it to the right. An opening wider than a single
      // leaf is hung with a pair, hinged at both jambs and meeting in the
      // middle, the way a pair of French doors is.
      const w = p('width')
      const h = p('height')
      // 1 hinges on the left, -1 on the right.
      const hinge = p('flip') > 0.5 ? -1 : 1
      // A terrace pair always opens both its leaves.
      const frame_only = style === 'frame'
      const terrace = style === 'terrace'
      const pair = w > 1.2 || terrace
      const lw = pair ? w / 2 : w
      const leaf = 0.042
      const jamb = 0.05
      // How far the frame runs into the wall.
      const lining = 0.06
      const metal = <Material color={c('handle')} material={m('handle')} />
      // The classical styles are framed: stiles and rails round panels of
      // wood or glass, and a round knob on the narrower stile.
      const classic = style === 'panel' || style === 'glazed'
      // A lever on a round rose: a 5 cm rose, a 2.2 cm neck out of it and a
      // 13 by 2.5 cm bar with fully rounded ends, running back toward the
      // hinge. A knob is a 5.4 cm ball, a little flattened, on a short neck.
      const handle = (side: number, face: number) => {
        const z = face > 0 ? leaf : 0
        const out = (d: number) => z + face * d
        return (
          <group position={[side * (lw - (classic ? 0.065 : terrace ? 0.045 : 0.085)), h * 0.47, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, out(0.0035)]}>
              <cylinderGeometry args={[classic ? 0.028 : 0.025, classic ? 0.03 : 0.025, 0.007, SEG * 2]} />
              {metal}
            </mesh>
            {classic ? (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, out(0.027)]}>
                  <cylinderGeometry args={[0.008, 0.011, 0.04, SEG]} />
                  {metal}
                </mesh>
                <mesh position={[0, 0, out(0.062)]} scale={[1, 1, 0.75]}>
                  <sphereGeometry args={[0.027, SEG, 12]} />
                  {metal}
                </mesh>
              </>
            ) : (
              <>
                <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, out(0.0295)]}>
                  <cylinderGeometry args={[0.011, 0.011, 0.045, SEG]} />
                  {metal}
                </mesh>
                <Plate
                  width={0.13}
                  height={0.022}
                  depth={0.01}
                  position={[-side * (0.065 - 0.011), 0, face > 0 ? out(0.052) : out(0.062)]}
                >
                  {metal}
                </Plate>
              </>
            )}
          </group>
        )
      }
      // The leaf itself, centered on its own width and standing on the floor.
      const LW = lw - (pair ? 0.006 : 0.008)
      const H = h - 0.006
      // A piece of the frame, as thick as the leaf, from its bottom edge up.
      const piece = (key: string, x: number, y: number, pw: number, ph: number) => (
        <Slab key={key} size={[pw, ph, leaf]} radius={0.003} bevel={0.002} position={[x, y, leaf / 2]}>
          {M('panel')}
        </Slab>
      )
      const framed = (stile: number, top: number, bottom: number) => [
        piece('l', -(LW - stile) / 2, 0, stile, H),
        piece('r', (LW - stile) / 2, 0, stile, H),
        piece('t', 0, H - top, LW - stile * 2, top),
        piece('b', 0, 0, LW - stile * 2, bottom),
      ]
      let body: ReactNode
      if (style === 'panel') {
        // After a Victorian four panel door: two tall panels over two short
        // ones, split by a wide lock rail and a middle stile. Each panel sits
        // back from the faces, with a raised field in the middle of it.
        const [stile, top, bottom, lock, mid] = [0.12, 0.12, 0.22, 0.18, 0.1]
        // The lock rail carries the knob.
        const lockY = h * 0.47 - lock / 2
        const pw = (LW - stile * 2 - mid) / 2
        const rows = [
          [bottom, lockY - bottom],
          [lockY + lock, H - top - lockY - lock],
        ]
        body = (
          <>
            {framed(stile, top, bottom)}
            {piece('lock', 0, lockY, LW - stile * 2, lock)}
            {rows.map(([y0, ph]) => piece(`m${y0}`, 0, y0, mid, ph))}
            {rows.flatMap(([y0, ph]) =>
              [-1, 1].map(sx => (
                <group key={`${y0}:${sx}`} position={[(sx * (mid + pw)) / 2, y0, leaf / 2]}>
                  <Slab
                    size={[pw + 0.01, ph + 0.01, leaf * 0.3]}
                    radius={0.003}
                    bevel={0.002}
                    position={[0, -0.005, 0]}
                  >
                    {M('panel')}
                  </Slab>
                  <Slab
                    size={[pw - 0.07, ph - 0.07, leaf * 0.64]}
                    radius={0.004}
                    bevel={0.008}
                    position={[0, 0.035, 0]}
                  >
                    {M('panel')}
                  </Slab>
                </group>
              )),
            )}
          </>
        )
      } else if (terrace) {
        // After a terrace French door: slim stiles and a deep bottom rail
        // round one tall pane, with nothing across the glass.
        const [stile, top, bottom] = [0.075, 0.09, 0.18]
        const gw = LW - stile * 2
        const gh = H - top - bottom
        body = (
          <>
            {framed(stile, top, bottom)}
            <mesh position={[0, bottom + gh / 2, leaf / 2]}>
              <planeGeometry args={[gw + 0.01, gh + 0.01]} />
              <Glass color={c('glass')} />
            </mesh>
            {/* The glazing beads round the pane, on both faces. */}
            {[-1, 1].map(face => (
              <group key={face} position={[0, 0, leaf / 2 + (face * leaf) / 2]}>
                {[
                  [0, bottom, gw, 0.014],
                  [0, H - top - 0.014, gw, 0.014],
                  [-gw / 2 + 0.007, bottom, 0.014, gh],
                  [gw / 2 - 0.007, bottom, 0.014, gh],
                ].map(([x, y, bw, bh], i) => (
                  <Slab key={i} size={[bw, bh, 0.012]} radius={0.003} bevel={0.002} position={[x, y, 0]}>
                    {M('panel')}
                  </Slab>
                ))}
              </group>
            ))}
          </>
        )
      } else if (style === 'glazed') {
        // After a French door: glass from the bottom rail up, in small lites
        // between thin glazing bars.
        const [stile, top, bottom] = [0.1, 0.1, 0.2]
        const gw = LW - stile * 2
        const gh = H - top - bottom
        const cols = Math.max(2, Math.round(gw / 0.24))
        const rows = Math.max(3, Math.round(gh / 0.3))
        body = (
          <>
            {framed(stile, top, bottom)}
            <mesh position={[0, bottom + gh / 2, leaf / 2]}>
              <planeGeometry args={[gw + 0.01, gh + 0.01]} />
              <Glass color={c('glass')} />
            </mesh>
            {Array.from({ length: cols - 1 }).map((_, i) => (
              <Slab
                key={`c${i}`}
                size={[0.022, gh, leaf * 0.6]}
                radius={0.004}
                bevel={0.002}
                position={[-gw / 2 + ((i + 1) * gw) / cols, bottom, leaf / 2]}
              >
                {M('panel')}
              </Slab>
            ))}
            {Array.from({ length: rows - 1 }).map((_, i) => (
              <Slab
                key={`r${i}`}
                size={[gw, 0.022, leaf * 0.6]}
                radius={0.004}
                bevel={0.002}
                position={[0, bottom + ((i + 1) * gh) / rows - 0.011, leaf / 2]}
              >
                {M('panel')}
              </Slab>
            ))}
          </>
        )
      } else {
        body = (
          <Slab size={[LW, H, leaf]} radius={0.004} bevel={0.003} position={[0, 0, leaf / 2]}>
            {M('panel')}
          </Slab>
        )
      }
      return (
        // Set back by half the leaf, so the door stands as far into the room
        // on one side of its wall as into the one on the other.
        <group position={[0, 0, -leaf / 2]}>
          {/* The frame is three rectangles, a jamb each side and the head,
              and it stays put while the leaf swings. */}
          {[-1, 1].map(s2 => (
            <Slab
              key={s2}
              size={[jamb, h + jamb, lining]}
              radius={0.006}
              bevel={0.004}
              position={[(s2 * (w + jamb)) / 2, 0, leaf / 2]}
            >
              {M('frame')}
            </Slab>
          ))}
          <Slab size={[w + jamb * 2, jamb, lining]} radius={0.006} bevel={0.004} position={[0, h, leaf / 2]}>
            {M('frame')}
          </Slab>
          {/* Each leaf, hinged on its jamb, and square to the wall when
              fully open. */}
          {!frame_only && (pair ? [1, -1] : [hinge]).map(side => (
            <group key={side} position={[(-side * w) / 2, 0, 0]} rotation={[0, -side * (Math.PI / 2) * coverLevel, 0]}>
              <group position={[(side * lw) / 2, 0, 0]}>{body}</group>
              {handle(side, 1)}
              {handle(side, -1)}
            </group>
          ))}
        </group>
      )
    }
    case 'sliding_door': {
      // Panels in their own tracks, side by side in depth. They run toward
      // the far end and come to rest one in front of the other as the cover
      // opens, so an open door shows its panels stacked and the opening is
      // the rest of the run.
      const w = p('width')
      const h = p('height')
      // 1 gathers the panels at the right, -1 at the left.
      const side = p('flip') > 0.5 ? -1 : 1
      const f = 0.05
      const track = 0.035
      const frame = <Material color={c('frame')} material={m('frame')} />
      const glazed = style === 'glass'
      const count = Math.max(1, Math.round(p('panels')))
      const run = w - f * 2
      const panelW = run / count
      const depth = count * track + 0.03
      return (
        <group>
          {/* Head rail and floor track, as deep as the panels they carry,
              and a jamb at each end so the opening stays framed. */}
          <Slab size={[w, f, depth]} radius={0.012} position={[0, h - f, 0]}>
            {frame}
          </Slab>
          <Slab size={[w, 0.02, depth]} radius={0.006} position={[0, 0, 0]}>
            {frame}
          </Slab>
          <Slab size={[f, h - f, depth]} radius={0.012} position={[-(w - f) / 2, 0, 0]}>
            {frame}
          </Slab>
          <Slab size={[f, h - f, depth]} radius={0.012} position={[(w - f) / 2, 0, 0]}>
            {frame}
          </Slab>
          {Array.from({ length: count }).map((_, i) => {
            // The panel at the far end stays put and the others gather in
            // front of it, at whichever end the switch picks.
            // A lone panel has nothing to stack on, so it runs into the wall
            // beside the opening the way a pocket door does, leaving its
            // edge out to pull it back by.
            const steps = count === 1 ? 1 - 0.06 / panelW : side > 0 ? count - 1 - i : i
            const slide = side * openAmount * steps * panelW
            const cx = -run / 2 + panelW * (i + 0.5) + slide
            const z = (i - (count - 1) / 2) * track
            return (
              <group key={i} position={[cx, 0.02, z]}>
                {sash(0, panelW, h - f - 0.02, frame, glazed ? c('glass') : null, Math.min(0.045, panelW * 0.15))}
              </group>
            )
          })}
        </group>
      )
    }
    case 'projector_screen': {
      // A case at the ceiling with the screen rolling out of it. Closed is
      // rolled up, so an unbound one shows as just the case. The sheet is one
      // mesh, scaled rather than resized, so nothing is rebuilt as it moves.
      const [w, h] = screenSize(p('inches'))
      const drop = h * openAmount
      const caseH = 0.09
      return (
        <group>
          <Slab size={[w + 0.12, caseH, 0.11]} radius={0.03} position={[0, -caseH, 0]}>
            <Material color={c('case')} material={m('case')} />
          </Slab>
          {/* The picture stays even while the sheet is rolled up, so a
              projector aimed at it knows where it will land. */}
          <group position={[0, -caseH - drop / 2, 0]}>
            {drop > 0.01 && (
              <mesh scale={[1, openAmount, 1]}>
                <planeGeometry args={[w, h]} />
                <meshStandardMaterial color={c('screen')} roughness={0.9} side={DoubleSide} />
              </mesh>
            )}
            <Projection w={w} h={h} open={openAmount} />
          </group>
          {drop > 0.01 && (
            // The weighted bar along the bottom edge keeps its own size.
            <Slab size={[w, 0.03, 0.03]} radius={0.008} position={[0, -caseH - drop, 0]}>
              <Material color={c('case')} material={m('case')} />
            </Slab>
          )}
        </group>
      )
    }
    case 'garage_door': {
      const w = p('width')
      const h = p('height')
      const rail = <Material color={c('rail')} material={m('rail')} />
      // How far it has run up, in meters of travel.
      const travel = h * coverLevel
      if (style === 'roller') {
        // A roller door: narrow slats that run up into a box over the
        // opening, one after another, the way a shutter does. None of them
        // changes size, and only the bottom one stays out when it is open.
        const box = { h: 0.2, d: 0.2 }
        const n = Math.max(2, Math.round(h / 0.08))
        const pitch = h / n
        const z = 0.08
        return (
          <group>
            <Slab size={[w + 0.14, box.h, box.d]} radius={0.02} position={[0, h, box.d / 2]}>
              {rail}
            </Slab>
            {[-1, 1].map(sx => (
              <Slab key={sx} size={[0.05, h, 0.07]} radius={0.008} position={[sx * (w / 2 + 0.025), 0, z]}>
                {rail}
              </Slab>
            ))}
            {Array.from({ length: n }).map((_, i) => {
              const last = i === n - 1
              const y = travel + (n - 1 - i) * pitch
              return (
                <group key={i} visible={last || y < h}>
                  <Slab
                    size={[w, last ? pitch * 0.8 : pitch * 0.94, last ? 0.04 : 0.02]}
                    radius={0.006}
                    bevel={0.003}
                    position={[0, last ? Math.min(y, h - 0.05) : y, z]}
                  >
                    {last ? rail : M('panels')}
                  </Slab>
                </group>
              )
            })}
          </group>
        )
      }
      // A sectional door: the panels run up side tracks and round a bend at
      // the top, and once flat under the ceiling each stops just past the
      // bend, sliding into the same place as the ones before it, so the open
      // door takes a single panel's length of ceiling. The panels are
      // placed along that path every frame and never rebuilt.
      const panels = Math.max(1, Math.round(h / 0.45))
      const panelH = h / panels
      const zf = 0.07
      const r = 0.3
      const bend = (r * Math.PI) / 2
      const at = (s: number): { y: number; z: number; a: number } => {
        if (s <= h) return { y: s, z: zf, a: 0 }
        if (s <= h + bend) {
          const a = (s - h) / r
          return { y: h + r * Math.sin(a), z: zf + r - r * Math.cos(a), a }
        }
        // How far it has run along the flat, up to where the panels stop.
        const flat = Math.min(s - h - bend, panelH / 2)
        return { y: h + r, z: zf + r + flat, a: Math.PI / 2 }
      }
      const run = panelH + 0.1
      // Open, the bottom panel has come all the way round the bend too, so
      // every panel lies flat under the ceiling.
      const lift = (h + bend) * coverLevel
      return (
        <group>
          {Array.from({ length: panels }).map((_, i) => {
            const { y, z, a } = at(panelH * (i + 0.5) + lift)
            return (
              <group key={i} position={[0, y, z]} rotation={[a, 0, 0]}>
                <Slab size={[w, panelH - 0.01, 0.04]} radius={0.012} position={[0, -(panelH - 0.01) / 2, 0]}>
                  {M('panels')}
                </Slab>
              </group>
            )
          })}
          {/* The tracks: up each side, round the bend and back under the ceiling. */}
          {[-1, 1].map(sx => (
            <group key={sx} position={[sx * (w / 2 + 0.02), 0, 0]}>
              <Slab size={[0.03, h, 0.05]} radius={0.006} position={[0, 0, zf]}>
                {rail}
              </Slab>
              <mesh position={[0, h, zf + r]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[r, 0.018, 8, 16, Math.PI / 2]} />
                {rail}
              </mesh>
              <Slab size={[0.03, 0.04, run]} radius={0.006} position={[0, h + r - 0.02, zf + r + run / 2]}>
                {rail}
              </Slab>
            </group>
          ))}
          {/* The header over the opening, between the wall and the panels. */}
          <Slab size={[w + 0.08, 0.07, 0.04]} radius={0.01} position={[0, h, 0.02]}>
            {rail}
          </Slab>
        </group>
      )
    }

    // Security and small fittings
    case 'camera': {
      // After the Google Nest Cam, wired, on its wall mount: a round plate
      // on the wall, a short arm out of it ending in a ball joint, and the
      // drum of a body aimed into the room with a black glass face. Every
      // part is in proportion to the size, so a bigger one still clears
      // the wall.
      const s = p('size')
      const r = s * 0.42
      const len = s * 0.95
      const plate = s * 0.08
      const arm = s * 0.34
      const back = plate + arm + s * 0.06
      const front = back + len
      return (
        <group>
          <mesh position={[0, 0, plate / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.3, s * 0.32, plate, SEG]} />
            {M('mount')}
          </mesh>
          <Bar
            length={arm + s * 0.06}
            radius={s * 0.06}
            rotation={[Math.PI / 2, 0, 0]}
            position={[0, 0, plate + arm / 2]}
          >
            {M('mount')}
          </Bar>
          <mesh position={[0, 0, plate + arm]}>
            <sphereGeometry args={[s * 0.1, SEG, SEG]} />
            {M('mount')}
          </mesh>
          {/* The body, a touch narrower at the back, with a rolled front edge. */}
          <mesh position={[0, 0, back + len / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[r * 0.94, r * 0.86, len, SEG * 2]} />
            {M('body')}
          </mesh>
          <mesh position={[0, 0, front]}>
            <torusGeometry args={[r * 0.9, r * 0.1, 12, SEG * 2]} />
            {M('body')}
          </mesh>
          {/* The face: black glass, with the lens standing out of it. */}
          <mesh position={[0, 0, front + s * 0.01]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r * 0.86, r * 0.86, s * 0.02, SEG * 2]} />
            <Material color={c('lens')} material={m('lens')} />
          </mesh>
          <mesh position={[0, r * 0.12, front + s * 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[r * 0.26, r * 0.3, s * 0.03, SEG]} />
            <meshStandardMaterial color={c('lens')} roughness={0.05} metalness={0.5} />
          </mesh>
          <Led on={on} position={[0, -r * 0.5, front + s * 0.02]} color="#8fd6a0" radius={s * 0.055} />
          <Halo on={on} position={[0, -r * 0.5, front + 0.05]} />
        </group>
      )
    }
    case 'doorbell': {
      // A slim bar: a camera lens up top, a lit ring button underneath.
      const s = p('size')
      const h = s * 2.3
      return (
        <group>
          <Slab size={[s, h, 0.032]} radius={s * 0.38} bevel={0.008} position={[0, -h / 2, 0.016]}>
            {M('body')}
          </Slab>
          {/* Camera lens, sunk into a dark window. */}
          <mesh position={[0, -h * 0.26, 0.035]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.3, s * 0.3, 0.008, SEG]} />
            <meshStandardMaterial color={c('lens')} roughness={0.15} metalness={0.2} />
          </mesh>
          <mesh position={[0, -h * 0.26, 0.038]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.16, s * 0.16, 0.006, SEG]} />
            <meshStandardMaterial color={c('lens')} roughness={0.05} metalness={0.4} />
          </mesh>
          {/* Button, a disc inside a ring that lights when it rings. */}
          <mesh position={[0, -h * 0.72, 0.036]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.34, s * 0.34, 0.008, SEG]} />
            <Material color={c('button')} material={m('button')} />
          </mesh>
          <mesh position={[0, -h * 0.72, 0.042]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[s * 0.27, 0.005, 12, SEG]} />
            <meshStandardMaterial color="#7fb3e8" emissive="#7fb3e8" emissiveIntensity={3 * lit} />
          </mesh>
          <Halo on={on} position={[0, -h * 0.72, 0.09]} color="#7fb3e8" />
        </group>
      )
    }
    case 'smart_lock': {
      // A round thumbturn on a rounded backplate, the way a retrofit lock
      // sits over the existing cylinder.
      const s = p('size')
      const h = s * 1.9
      // Its light glows red while the door is locked and green once it can
      // be opened, for as long as it has an entity to report.
      const bound = state != null
      const glow = on ? '#e5484d' : '#46c46e'
      return (
        <group>
          <Slab size={[s, h, 0.026]} radius={s / 2} bevel={0.008} position={[0, -h / 2, 0.013]}>
            {M('body')}
          </Slab>
          <mesh position={[0, -h * 0.55, 0.045]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.44, s * 0.46, 0.038, SEG * 2]} />
            {M('turn')}
          </mesh>
          {/* The turn knob with its grip ridge, upright while it is locked and
              turned a quarter over to lie flat once it is unlocked, so the
              state reads at a glance, the way it does on the real thing. */}
          <group position={[0, -h * 0.55, 0]} rotation={[0, 0, (1 - lit) * (Math.PI / 2)]}>
            <mesh position={[0, 0, 0.066]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[s * 0.3, s * 0.34, 0.012, SEG]} />
              {M('turn')}
            </mesh>
            <Slab size={[s * 0.14, s * 0.56, 0.014]} radius={s * 0.05} position={[0, -s * 0.28, 0.072]}>
              {M('turn')}
            </Slab>
            <mesh position={[0, 0, 0.0795]}>
              <planeGeometry args={[s * 0.04, s * 0.4]} />
              <meshStandardMaterial color="#3a3d40" emissive={glow} emissiveIntensity={bound ? 2.6 : 0} />
            </mesh>
          </group>
          <Led on={bound} color={glow} position={[0, -h * 0.16, 0.03]} radius={0.008} />
          <Halo on={bound} color={glow} position={[0, -h * 0.4, 0.11]} />
        </group>
      )
    }
    case 'motion_sensor': {
      // A faceted dome on a ball mount, so it can be aimed into the room.
      // The plate, the ball and the dome all step out from the wall in
      // proportion to the size, so the dome never sinks into it.
      const s = p('size')
      const t = s * 0.2
      return (
        <group position={[0, -s * 0.8, 0]}>
          <mesh position={[0, 0, t / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[s * 0.45, s * 0.5, t, SEG]} />
            {M('body')}
          </mesh>
          <mesh position={[0, 0, t + s * 0.1]}>
            <sphereGeometry args={[s * 0.2, SEG, SEG]} />
            {M('body')}
          </mesh>
          {/* The whole ball turns teal while it sees someone, so the alert
              reads from every angle. */}
          <mesh position={[0, 0, t + s * 0.62]}>
            <sphereGeometry args={[s * 0.5, SEG, SEG]} />
            <meshStandardMaterial
              color={c('accent')}
              roughness={0.35}
              emissive="#1ed4bf"
              emissiveIntensity={1.8 * lit}
            />
          </mesh>
          <Halo on={on} position={[0, 0, t + s * 1.3]} color="#2fdccb" intensity={0.1} />
        </group>
      )
    }
    case 'smoke_detector': {
      // After the Google Nest Protect: a rounded square a few centimeters
      // deep, hanging from the ceiling, its underside pricked with a grid
      // of vent holes around a ring that lights in the middle.
      const s = p('size')
      const t = s * 0.28
      const grid = 7
      const pitch = (s * 0.72) / (grid - 1)
      const holes = Array.from({ length: grid * grid }, (_, i) => [
        (i % grid) * pitch - s * 0.36,
        Math.floor(i / grid) * pitch - s * 0.36,
      ]).filter(([x, z]) => Math.hypot(x, z) > s * 0.2)
      return (
        <group>
          <Slab size={[s, t, s]} radius={s * 0.2} bevel={s * 0.06} position={[0, -t, 0]}>
            {M('body')}
          </Slab>
          {holes.map(([x, z]) => (
            <mesh key={`${x}:${z}`} position={[x, -t - 0.0005, z]}>
              <cylinderGeometry args={[s * 0.018, s * 0.018, 0.002, 12]} />
              <meshStandardMaterial color={c('vents')} roughness={0.8} />
            </mesh>
          ))}
          {/* The light ring round the button, flashing red while it alarms. */}
          <Alarm on={on} s={s} y={-t} />
        </group>
      )
    }
    case 'leak_sensor': {
      // A small round puck that lies on the floor where water would gather,
      // on three metal probes. Once they get wet a ring round its top
      // glows blue and a puddle spreads round it, so a leak reads from
      // across the room.
      const s = p('size')
      const t = s * 0.3
      return (
        <group>
          <mesh position={[0, 0.0015, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={0.2 + 0.8 * lit} visible={lit > 0.01}>
            <circleGeometry args={[s * 2.4, SEG * 2]} />
            <meshStandardMaterial
              color="#6fa8d8"
              roughness={0.05}
              metalness={0.1}
              transparent
              opacity={0.45 * lit}
              depthWrite={false}
            />
          </mesh>
          {[0, 1, 2].map(i => (
            <mesh
              key={i}
              position={[Math.sin((i * Math.PI * 2) / 3) * s * 0.3, 0.003, Math.cos((i * Math.PI * 2) / 3) * s * 0.3]}
            >
              <cylinderGeometry args={[s * 0.06, s * 0.06, 0.006, 12]} />
              {M('probes')}
            </mesh>
          ))}
          <mesh position={[0, 0.006 + t / 2, 0]} castShadow>
            <cylinderGeometry args={[s * 0.46, s * 0.5, t, SEG * 2]} />
            {M('body')}
          </mesh>
          <mesh position={[0, 0.006 + t, 0]} scale={[1, 0.18, 1]}>
            <sphereGeometry args={[s * 0.46, SEG * 2, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {M('body')}
          </mesh>
          <mesh position={[0, 0.006 + t, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[s * 0.3, s * 0.025, 10, SEG * 2]} />
            <meshStandardMaterial color="#d6e4f0" emissive="#2f8cff" emissiveIntensity={3 * lit} />
          </mesh>
          <Halo on={on} position={[0, t + 0.05, 0]} color="#5aa8ff" intensity={0.08} />
        </group>
      )
    }
    case 'alarm_panel': {
      // A wall keypad: a dark glass face over a soft body, the readout at
      // the top and a three by four grid of keys under it.
      const s = p('size')
      const h = s * 1.5
      return (
        <group position={[0, -h, 0]}>
          <Slab size={[s, h, 0.028]} radius={s * 0.12} bevel={0.008} position={[0, 0, 0.014]}>
            {M('body')}
          </Slab>
          <mesh position={[0, h / 2, 0.03]}>
            <planeGeometry args={[s * 0.84, h * 0.84]} />
            <meshStandardMaterial color={c('glass')} roughness={0.15} metalness={0.2} />
          </mesh>
          <mesh position={[0, h * 0.72, 0.031]}>
            <planeGeometry args={[s * 0.68, h * 0.22]} />
            <Material
              color={c('screen')}
              material={m('screen')}
              emissive={[0.55, 0.78, 1]}
              emissiveIntensity={1.6 * lit}
            />
          </mesh>
          <Halo on={on} position={[0, h * 0.72, 0.09]} color="#8cc8ff" />
          {Array.from({ length: 12 }).map((_, i) => (
            <mesh key={i} position={[((i % 3) - 1) * s * 0.24, h * (0.49 - Math.floor(i / 3) * 0.1), 0.032]}>
              <boxGeometry args={[s * 0.17, h * 0.065, 0.002]} />
              <meshStandardMaterial color={c('keys')} roughness={0.5} />
            </mesh>
          ))}
        </group>
      )
    }
    case 'air_quality': {
      // A small desk monitor: a wedge body leaning back on a foot, with the
      // readout on its face and a vent slot down one side. The screen and
      // the slots lean with the body, from the same pivot at its base, so
      // they sit on its faces. Tilted about their own centres instead, the
      // screen stood proud of the face it belongs on.
      const s = p('size')
      const h = s * 1.8
      const d = s * 0.7
      const lean = -0.12
      return (
        <group>
          {/* The body stands forward on its foot, so leaning back it stays over it. */}
          <Slab size={[s * 1.2, 0.012, s * 1.1]} radius={s * 0.1} position={[0, 0, 0]}>
            {M('body')}
          </Slab>
          <group position={[0, 0.012, s * 0.12]} rotation={[lean, 0, 0]}>
            <Slab size={[s, h, d]} radius={s * 0.16} bevel={0.008} position={[0, 0, 0]}>
              {M('body')}
            </Slab>
            {/* On the front face, a hair proud of it so the two never fight. */}
            <mesh position={[0, h * 0.58, d / 2 + 0.0015]}>
              <planeGeometry args={[s * 0.78, h * 0.5]} />
              <Material
                color={c('screen')}
                material={m('screen')}
                emissive={[0.55, 0.78, 1]}
                emissiveIntensity={1.6 * lit}
              />
            </mesh>
            <Halo on={on} position={[0, h * 0.58, d / 2 + 0.06]} color="#8cc8ff" />
            {/* Intake slots on the side. */}
            {[0, 1, 2].map(i => (
              <mesh key={i} position={[s / 2 + 0.002, h * (0.2 + i * 0.12), 0]}>
                <boxGeometry args={[0.004, 0.006, d * 0.57]} />
                <meshStandardMaterial color={c('vents')} roughness={0.8} />
              </mesh>
            ))}
          </group>
        </group>
      )
    }
    case 'vacuum_robot':
      return <Vacuum kind={kind} item={item} state={state} room={room} all={all} lit={lit} />
    default:
      return null
  }
}
