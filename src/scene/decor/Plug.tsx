import { colorValue, decorationVariant, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { useEased } from '#/scene/decor/ease.ts'
import { Halo, Material, SEG, Slab, Tube } from '#/scene/decor/parts.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import { formatPower } from '#/signals.ts'
import type { DecorationConfig } from '#/types.ts'
import { useEffect, useMemo, type ReactNode } from 'react'
import { CanvasTexture, LatheGeometry, SRGBColorSpace, Vector2 } from 'three'

type Props = { kind: DecorationKind; item: DecorationConfig; state: ItemState | null }

type Vec3 = [number, number, number]

// The face plate of the wall socket a plug stands in, and how thick it is.
const PLATE = 0.008
const PLATE_SIZE = 0.08

// Each style's body: how wide, tall and deep it is, and how high its middle
// sits over the wall socket's. Its own socket is always over the wall's.
const BODIES: Record<string, { w: number; tall: number; deep: number; y: number; radius: number }> = {
  round: { w: 0.05, tall: 0.05, deep: 0.045, y: 0, radius: 0.025 },
  block: { w: 0.051, tall: 0.072, deep: 0.04, y: 0.01, radius: 0.012 },
  meter: { w: 0.062, tall: 0.11, deep: 0.046, y: 0.026, radius: 0.01 },
}

// The dark of a socket's holes.
const INK = '#141517'

// A smart plug in a wall socket. The Round Plug is a round Schuko plug with
// a ring of light round its face, the Mini Block a small square one after
// the Tapo P100 with a dot of light, and the Meter Display a taller one
// with a display over its socket that shows what its power sensor reads,
// or ON and OFF without one. Each lights while its switch is on, and the
// plug of what it powers can stand in it with its lead down the wall. It
// is built from the wall out along +z, its socket's middle at its origin.
export default function PlugModel({ kind, item, state }: Props) {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const M = (slot: string) => <Material color={c(slot)} material={materialValue(kind, slot, item.variant)} />
  const style = decorationVariant(kind, item.variant)?.id ?? 'round'
  const on = state?.on ?? false
  const body = BODIES[style] ?? BODIES.round
  const front = PLATE + body.deep
  const lit = useEased(on ? 1 : 0, 9)
  const light = c('light')
  // The light is the socket's color while it is dark, so an unlit ring reads
  // as part of the plug rather than as a colored one.
  const led = (
    <meshStandardMaterial
      color={lit > 0.5 ? light : c('socket')}
      emissive={light}
      emissiveIntensity={lit * 2.4}
      roughness={0.4}
    />
  )
  const power = state?.power
  const words = power !== undefined ? formatPower(power) : on ? 'ON' : 'OFF'
  return (
    <group>
      <Slab size={[PLATE_SIZE, PLATE, PLATE_SIZE]} radius={0.008} bevel={0.002} rotation={[Math.PI / 2, 0, 0]}>
        {M('plate')}
      </Slab>
      {style === 'round' ? (
        <RoundBody r={body.w / 2} deep={body.deep}>
          {M('body')}
        </RoundBody>
      ) : (
        <Slab
          size={[body.w, body.deep, body.tall]}
          radius={body.radius}
          bevel={0.005}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, body.y, PLATE]}
        >
          {M('body')}
        </Slab>
      )}
      <SocketFace z={front} color={c('socket')} />
      {style === 'block' ? (
        <>
          {/* The dot of light high on its face, and the button on its side. */}
          <mesh position={[0, body.y + body.tall / 2 - 0.011, front + 0.0004]}>
            <circleGeometry args={[0.0022, 16]} />
            {led}
          </mesh>
          <mesh position={[body.w / 2 + 0.0004, body.y + 0.012, PLATE + body.deep * 0.5]}>
            <boxGeometry args={[0.0016, 0.014, 0.014]} />
            {M('socket')}
          </mesh>
        </>
      ) : style === 'meter' ? (
        <>
          {/* The display in its dark frame, and the button under it with a
              ring of light round it. */}
          <mesh position={[0, 0.054, front + 0.0003]}>
            <planeGeometry args={[0.046, 0.026]} />
            <meshStandardMaterial color="#101417" roughness={0.2} />
          </mesh>
          <group position={[0, 0.054, front + 0.0006]}>
            <Readout text={words} color={light} lit={lit} size={[0.042, 0.021]} />
          </group>
          <mesh position={[0, 0.029, front + 0.0004]}>
            <circleGeometry args={[0.0045, SEG]} />
            {M('socket')}
          </mesh>
          <mesh position={[0, 0.029, front + 0.0005]}>
            <ringGeometry args={[0.0045, 0.0056, SEG]} />
            {led}
          </mesh>
        </>
      ) : (
        <>
          {/* The ring of light round its face, and the button on its top. */}
          <mesh position={[0, 0, front + 0.0004]}>
            <ringGeometry args={[0.018, 0.0196, SEG * 2]} />
            {led}
          </mesh>
          <mesh position={[0, body.tall / 2 - 0.0005, PLATE + body.deep * 0.55]}>
            <cylinderGeometry args={[0.006, 0.006, 0.003, SEG]} />
            {M('socket')}
          </mesh>
        </>
      )}
      {p('cable') > 0.5 && <PlugLead front={front} floor={p('height')} M={M} />}
      <Halo on={on} position={[0, body.y, front + 0.12]} color={light} intensity={0.02} distance={0.3} />
    </group>
  )
}

// A round plug's body: a drum `r` across out from the plate, `deep` long,
// its front edge rounded over onto its face. Turned on a lathe, so its side
// is smooth all the way round.
function RoundBody({ r, deep, children }: { r: number; deep: number; children: ReactNode }) {
  const geometry = useMemo(() => {
    const b = 0.006
    const points = [new Vector2(0, 0), new Vector2(r, 0), new Vector2(r, deep - b)]
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2)
      points.push(new Vector2(r - b + b * Math.cos(a), deep - b + b * Math.sin(a)))
    }
    points.push(new Vector2(0, deep))
    return new LatheGeometry(points, SEG * 2)
  }, [r, deep])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, 0, PLATE]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
      {children}
    </mesh>
  )
}

// The face of a Schuko socket: a round insert, its two holes and the earth
// clips above and below them.
function SocketFace({ z, color }: { z: number; color: string }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0, 0.0003]}>
        <circleGeometry args={[0.0165, SEG * 2]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 0.0095, 0, 0.0006]}>
          <circleGeometry args={[0.0026, 16]} />
          <meshStandardMaterial color={INK} roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map(s => (
        <mesh key={`clip${s}`} position={[0, s * 0.0142, 0.0008]}>
          <boxGeometry args={[0.007, 0.0018, 0.0012]} />
          <meshStandardMaterial color="#c9c3b5" metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  )
}

// The plug of whatever it powers, pushed into its socket, and the lead from
// it down the wall to the floor and along the skirting. The floor is
// `floor` below the socket.
function PlugLead({ front, floor, M }: { front: number; floor: number; M: (slot: string) => ReactNode }) {
  const z = front + 0.012
  const ground = -floor + 0.003
  // Where the lead has come back to lie against the wall, never below the
  // bend onto the floor.
  const drop = Math.max(ground + 0.045, -0.075)
  const points: Vec3[] = [
    [0, -0.024, z],
    [0, -0.042, z - 0.006],
    [0, drop, 0.016],
    [0, ground + 0.03, 0.012],
    [0.012, ground + 0.006, 0.014],
    [0.05, ground, 0.016],
    [0.28, ground, 0.016],
  ]
  return (
    <group>
      {/* The plug's round head, a little narrower grip behind it, and the
          sleeve the lead leaves it by, going down. */}
      <mesh position={[0, 0, front + 0.009]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.0168, 0.0168, 0.018, SEG]} />
        {M('cable')}
      </mesh>
      <mesh position={[0, 0, front + 0.021]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.0145, 0.008, SEG]} />
        {M('cable')}
      </mesh>
      <mesh position={[0, -0.018, z]}>
        <cylinderGeometry args={[0.0042, 0.006, 0.014, 16]} />
        {M('cable')}
      </mesh>
      <Tube points={points} radius={0.0028} segments={64}>
        {M('cable')}
      </Tube>
    </group>
  )
}

// What a meter plug's display says, drawn on a small canvas of its own
// each time the words change, the last one let go of once it is replaced.
function Readout({ text, color, lit, size }: { text: string; color: string; lit: number; size: [number, number] }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 192
    canvas.height = 96
    const g = canvas.getContext('2d')
    if (g) {
      g.fillStyle = '#0b1013'
      g.fillRect(0, 0, canvas.width, canvas.height)
      g.fillStyle = color
      g.font = `600 ${text.length > 6 ? 40 : 48}px Montserrat, sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(text, canvas.width / 2, canvas.height / 2 + 2)
    }
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.anisotropy = 8
    return map
  }, [text, color])
  useEffect(() => () => texture.dispose(), [texture])
  // The display stays faintly lit while the plug is off, as a meter does.
  const k = 0.3 + 0.7 * lit
  return (
    <mesh>
      <planeGeometry args={size} />
      <meshBasicMaterial map={texture} toneMapped={false} color={[k, k, k]} />
    </mesh>
  )
}
