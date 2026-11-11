import { colorValue, decorationVariant, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import FlushLight from '#/scene/decor/CeilingLights.tsx'
import { CeilingFan } from '#/scene/decor/Climate.tsx'
import StringLights from '#/scene/decor/StringLights.tsx'
import DeskLamp from '#/scene/decor/DeskLamps.tsx'
import { DESK_LAMPS } from '#/scene/decor/deskLampSpecs.ts'
import FloorLamp from '#/scene/decor/FloorLamps.tsx'
import { FLOOR_LAMPS } from '#/scene/decor/floorLampSpecs.ts'
import { BaseMaterial, ShadeMaterial, type LightState } from '#/scene/decor/lightMaterials.tsx'
import Pendant from '#/scene/decor/Pendants.tsx'
import { PENDANTS } from '#/scene/decor/pendantSpecs.ts'
import TableLamp from '#/scene/decor/TableLamps.tsx'
import { TABLE_LAMPS } from '#/scene/decor/tableLampSpecs.ts'
import WallLamp from '#/scene/decor/WallLamps.tsx'
import { WALL_LAMPS } from '#/scene/decor/wallLampSpecs.ts'
import { LAMP_SHADOW_MAP_PX, LAMP_SHADOW_RADIUS } from '#/constants.ts'
import { CEILING_HEIGHT_M, LAMP_KEY_SHARE, LAMP_OUTPUT, LAMP_THROUGH_SHARE, LIGHT_POINT_INTENSITY } from '#/theme.ts'
import type { DecorationConfig } from '#/types.ts'

import { useEased } from '#/scene/decor/ease.ts'
import { useWarmed } from '#/scene/warm.ts'
import { useLayoutEffect, useRef } from 'react'
import type { BufferGeometry, Camera, Group, Mesh, PointLight, RectAreaLight } from 'three'
import type { ItemState } from '#/scene/decor/state.ts'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'

// Rect area lights need their uniform tables built once, and they only
// light standard materials, which is what every model here uses.
RectAreaLightUniformsLib.init()

type Props = {
  kind: DecorationKind
  item: DecorationConfig
  state: ItemState | null
}

// Smooth, chunky shapes: squashed spheres, capsules and domes, matte
// surfaces. Segment counts stay low so the silhouettes read as simple.
const SEG = 32

function Glow({
  state,
  at,
  spread = 0,
  output = 1,
}: {
  state: LightState | null
  // Where the bulb is, inside the shade rather than on the frame that holds
  // it: a floor lamp lights from the middle of its shade, not from its mast.
  at: [number, number, number]
  spread?: number
  // What this kind of lamp puts out, against the rest of them.
  output?: number
}) {
  const lit = useEased(state?.on ? (state.level ?? 1) : 0, 9)
  const [r, g, b] = state?.glow ?? [1, 1, 1]
  // The lights stay mounted while the lamp is off but are hidden, which
  // takes them out of the scene's light count. A light that is counted
  // costs every material a share of its shader and its uniforms on every
  // frame, at nothing as much as at full, and a flat of dark lamps was
  // paying more for them than for everything it drew. Switching one does
  // change the count and has the shaders built again, so they are shown or
  // hidden only once those are ready, and the frame that shows them does
  // not stall.
  const dark = lit < 0.01
  // Close to linear with the level: a lamp at a third still lights the
  // room around it, and still casts, instead of fading away first.
  const total = dark ? 0 : LIGHT_POINT_INTENSITY * output * (0.25 + 0.75 * lit) * lit
  // What the bulb is heading for, so the lamps that may cast are ranked by
  // where they will be and not by where the fade has got to. Ranked by the
  // moment's intensity, a lamp coming on stood behind every lamp already
  // on until it was nearly full, and its shadows arrived only then.
  const level = state?.on ? (state.level ?? 1) : 0
  const rank = LIGHT_POINT_INTENSITY * output * (0.25 + 0.75 * level) * level * LAMP_KEY_SHARE
  // The bulb asks for its shadow from the first frame it is lit. Which
  // lamps cast is settled on every draw, within the budget, so that has the
  // last word, see `balance`. It is only ever switched on here: switching
  // it off while the lamp is lit would change the count of shadows behind
  // the back of what hands them out.
  const strip = useRef<RectAreaLight>(null)
  const bulb = useRef<PointLight>(null)
  const through = useRef<PointLight>(null)
  const latestRank = useRef(rank)
  useLayoutEffect(() => {
    latestRank.current = rank
  })
  const shown = useWarmed(!dark, on => {
    for (const light of [strip.current, bulb.current, through.current]) if (light) light.visible = on
    if (on && bulb.current && latestRank.current > 0) bulb.current.castShadow = true
  })
  // A strip is a line of light, not a point. A rect area light is one
  // continuous source, so the wash along a long strip is even instead of
  // beading wherever a point happens to sit.
  if (spread > 0.4) {
    return (
      <rectAreaLight
        ref={strip}
        position={[at[0], at[1] - 0.02, at[2]]}
        rotation={[-Math.PI / 2, 0, 0]}
        width={spread}
        height={0.06}
        color={[r, g, b]}
        intensity={total * 4}
        visible={shown}
      />
    )
  }
  return (
    <>
      {/* The bulb. What the shade stops on its way out lands as a shadow of
          whatever stands around the lamp. */}
      <pointLight
        ref={bulb}
        position={at}
        color={[r, g, b]}
        intensity={total * LAMP_KEY_SHARE}
        distance={7}
        decay={1.15}
        visible={shown}
        userData={{ rank }}
        shadow-mapSize={[LAMP_SHADOW_MAP_PX, LAMP_SHADOW_MAP_PX]}
        shadow-radius={LAMP_SHADOW_RADIUS}
        // Small offsets: a big one pushes the sample past a thin top or
        // panel and lets the light through the middle of it.
        shadow-bias={-0.0012}
        shadow-normalBias={0.008}
        shadow-camera-near={0.05}
        shadow-camera-far={9}
      />
      {/* What comes through the shade itself. Parchment and opal glass are
          not walls: they glow, so this part reaches past the shade and casts
          nothing. */}
      <pointLight
        ref={through}
        position={at}
        color={[r, g, b]}
        intensity={total * LAMP_THROUGH_SHARE}
        distance={6}
        decay={1.25}
        visible={shown}
        userData={{ through: true }}
      />
    </>
  )
}

// A lamp's own parts are left out of its own bulb's shadows, so the lamp
// never darkens itself or throws its stand across the room around it. They
// still cast for the sun and for every other lamp. Three asks no one which
// light a part should cast for, so the part is drawn as nothing while the
// shadow of its own bulb is drawn.
function ownShadowless(group: Group) {
  const lights: PointLight[] = []
  group.traverse(object => {
    if ((object as PointLight).isPointLight && !object.userData.through) lights.push(object as PointLight)
  })
  // The bulb stays mounted while the lamp is off, so its camera is the same
  // for as long as the lamp is.
  const camera = lights[0]?.shadow.camera
  if (!camera) return
  let held = 0
  group.traverse(object => {
    const mesh = object as Mesh
    if (!mesh.isMesh || mesh.userData.ownShadowless) return
    mesh.userData.ownShadowless = true
    mesh.onBeforeShadow = (_r, _o, _c, shadowCamera: Camera, geometry: BufferGeometry) => {
      if (shadowCamera !== camera) return
      held = geometry.drawRange.count
      geometry.drawRange.count = 0
    }
    mesh.onAfterShadow = (_r, _o, _c, shadowCamera: Camera, geometry: BufferGeometry) => {
      if (shadowCamera === camera) geometry.drawRange.count = held
    }
  })
}

export default function LightModel({ kind, item, state }: Props) {
  const own = useRef<Group>(null)
  // Again after every render, for the parts a new style or size brings.
  useLayoutEffect(() => {
    if (own.current) ownShadowless(own.current)
  })
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const m = (slot: string) => materialValue(kind, slot, item.variant)
  const size = p('size')
  let body: React.ReactNode
  let glowAt: [number, number, number] = [0, 1, 0]
  // How far the light is spread along the item, for a strip.
  let glowSpread = 0
  switch (kind.id) {
    case 'light_ceiling': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'focus'
      const r = size / 2
      if (style !== 'focus') {
        const drop = style === 'dome' ? r * 0.45 : style === 'drum' ? 0.14 : 0.12
        glowAt = [0, CEILING_HEIGHT_M - drop - 0.05, 0]
        body = <FlushLight style={style} r={r} drop={drop} c={c} m={m} state={state} />
        break
      }
      // A plain round focus in the ceiling, ten centimeters across.
      glowAt = [0, CEILING_HEIGHT_M - r - 0.05, 0]
      body = (
        <group>
          <mesh position={[0, CEILING_HEIGHT_M - 0.006, 0]}>
            <cylinderGeometry args={[r, r, 0.012, SEG * 2]} />
            <BaseMaterial color={c('rim')} material={m('rim')} />
          </mesh>
          <mesh position={[0, CEILING_HEIGHT_M - 0.014, 0]} userData={{ transmits: true }}>
            <cylinderGeometry args={[r * 0.88, r * 0.88, 0.006, SEG * 2]} />
            <ShadeMaterial color={c('focus')} material={m('focus')} state={state} />
          </mesh>
        </group>
      )
      break
    }
    case 'light_pendant': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'nagoya'
      const spec = PENDANTS[style] ?? PENDANTS.nagoya
      const k = size / spec.diameter
      const top = CEILING_HEIGHT_M - p('cord')
      glowAt = [0, top - spec.glow * k, 0]
      body = <Pendant style={style} k={k} top={top} c={c} m={m} state={state} />
      break
    }
    case 'light_floor': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'tmm'
      const spec = FLOOR_LAMPS[style] ?? FLOOR_LAMPS.tmm
      // The width scales the whole lamp, and the height and depth lengthen
      // parts of it.
      const k = size / spec.size
      const up = Math.max(p('height') / k - spec.height, -spec.shrink)
      const out = Math.max(p('depth') / k - spec.depth, -spec.thin)
      glowAt = [(spec.glow[0] - spec.offset) * k, (spec.glow[1] + spec.rise * up) * k, spec.glow[2] * k]
      body = <FloorLamp style={style} k={k} up={up} out={out} c={c} m={m} state={state} />
      break
    }
    case 'light_table': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'cestita'
      const spec = TABLE_LAMPS[style] ?? TABLE_LAMPS.cestita
      const k = size / spec.size
      const up = Math.max(p('height') / k - spec.height, -spec.shrink)
      glowAt = [0, (spec.glow + spec.rise * up) * k, 0]
      body = <TableLamp style={style} k={k} up={up} c={c} m={m} state={state} />
      break
    }
    case 'light_desk': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'balanced_arm'
      const spec = DESK_LAMPS[style] ?? DESK_LAMPS.balanced_arm
      const k = size / spec.size
      const up = Math.max(p('height') / k - spec.height, -spec.shrink)
      // The light is out over the desk, in front of the lamp's middle.
      glowAt = [0, (spec.glow[0] + spec.rise[0] * up) * k, (spec.glow[1] + spec.rise[1] * up) * k]
      body = <DeskLamp style={style} k={k} up={up} c={c} m={m} state={state} />
      break
    }
    case 'light_wall': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'tmm'
      const spec = WALL_LAMPS[style] ?? WALL_LAMPS.tmm
      const k = size / spec.size
      const up = Math.max(p('tall') / k - spec.height, -spec.shrink)
      const out = Math.max(p('depth') / k - spec.depth, -spec.thin)
      // Hung by its middle, out from the wall along z.
      const height = p('height')
      glowAt = [spec.glow[0] * k, height + (spec.glow[1] + spec.rise * up) * k, (spec.glow[2] + spec.reach * out) * k]
      body = (
        <group position={[0, height, 0]}>
          <WallLamp style={style} k={k} up={up} out={out} c={c} m={m} state={state} />
        </group>
      )
      break
    }
    case 'light_strip':
    case 'light_strip_ceiling':
    case 'light_strip_wall': {
      // An aluminium channel with a frosted diffuser under it. Lights place
      // themselves, so the ceiling one goes up against the ceiling and the
      // other two take their own height. The wall one stands off the wall
      // on its channel instead of sinking into it.
      const length = p('length')
      const height = kind.id === 'light_strip_ceiling' ? CEILING_HEIGHT_M - 0.046 : p('height')
      const z = kind.id === 'light_strip_wall' ? 0.016 : 0
      // The light comes from just under the diffuser, so the channel above
      // it never shades the strip's own wash.
      glowAt = [0, height + 0.005, z]
      glowSpread = length
      body = (
        <group>
          <mesh position={[0, height + 0.035, z]}>
            <boxGeometry args={[length, 0.022, 0.03]} />
            <BaseMaterial color={c('channel')} material={m('channel')} />
          </mesh>
          <mesh position={[0, height + 0.018, z]} rotation={[0, 0, Math.PI / 2]} userData={{ transmits: true }}>
            <capsuleGeometry args={[0.016, Math.max(length - 0.032, 0.05), 8, 20]} />
            <ShadeMaterial color={c('diffuser')} material={m('diffuser')} state={state} />
          </mesh>
        </group>
      )
      break
    }
    case 'light_fan': {
      // A ceiling fan whose light stands for the light it is bound to. The
      // blades stay still: the fan itself is the Ceiling fan piece's.
      const style = decorationVariant(kind, item.variant)?.id ?? 'disc'
      const fan = style === 'bowl' ? 'classic' : style === 'globe' ? 'loft' : 'haiku'
      const r = size / 2
      const loft = fan === 'loft'
      const mr =
        fan === 'classic' ? Math.max(0.09, r * 0.17) : loft ? Math.max(0.06, r * 0.1) : Math.max(0.07, r * 0.17)
      const mh = fan === 'classic' ? Math.max(0.1, r * 0.18) : loft ? Math.max(0.06, r * 0.1) : Math.max(0.045, r * 0.1)
      const drop = Math.max(p('drop'), 0.05 + mh)
      const shade = <ShadeMaterial color={c('light')} material={m('light')} state={state} />
      const look = {
        paint: (slot: string) => (slot === 'bowl' ? shade : <BaseMaterial color={c(slot)} material={m(slot)} />),
        color: c,
        material: m,
      }
      glowAt = [0, CEILING_HEIGHT_M - drop - (fan === 'classic' ? 0.04 : 0.08), 0]
      body = (
        <group position={[0, CEILING_HEIGHT_M, 0]}>
          <CeilingFan style={fan} r={r} drop={p('drop')} speed={0} look={look} />
          {fan === 'haiku' && (
            // An LED disc set into the underside of the motor.
            <mesh position={[0, -drop - 0.006, 0]} userData={{ transmits: true }}>
              <cylinderGeometry args={[mr * 0.8, mr * 0.8, 0.012, SEG * 2]} />
              {shade}
            </mesh>
          )}
          {loft && (
            // A schoolhouse globe hung under the motor on a short fitter.
            <group position={[0, -drop, 0]}>
              <mesh position={[0, -0.02, 0]}>
                <cylinderGeometry args={[mr * 0.6, mr * 0.7, 0.04, SEG]} />
                <BaseMaterial color={c('housing')} material={m('housing')} />
              </mesh>
              <mesh position={[0, -0.04 - mr * 0.9, 0]} userData={{ transmits: true }}>
                <sphereGeometry args={[mr * 1.1, SEG, SEG]} />
                {shade}
              </mesh>
            </group>
          )}
        </group>
      )
      break
    }
    case 'light_string': {
      const style = decorationVariant(kind, item.variant)?.id ?? 'festoon'
      const length = p('length')
      const height = p('height')
      const sag = Math.min(p('sag'), height - 0.1)
      glowAt = [0, height - sag * 0.7 - 0.08, 0]
      glowSpread = length
      body = <StringLights style={style} length={length} height={height} sag={sag} c={c} m={m} state={state} />
      break
    }
    default:
      body = null
  }

  // A ceiling light is seen from above, where there is no ceiling, and its
  // light faces down. A disc over it glows with the light as its shade does,
  // so from above it still shows that it is on, and in what color.
  if (kind.id === 'light_ceiling') {
    const style = decorationVariant(kind, item.variant)?.id ?? 'focus'
    const slot = style === 'dome' ? 'globe' : style === 'drum' ? 'diffuser' : 'focus'
    body = (
      <group>
        {body}
        <mesh position={[0, CEILING_HEIGHT_M + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[(size / 2) * 0.86, SEG * 2]} />
          <ShadeMaterial color={c(slot)} material={m(slot)} state={state} solid />
        </mesh>
      </group>
    )
  }

  return (
    <group ref={own}>
      {body}
      <Glow state={state} at={glowAt} spread={glowSpread} output={LAMP_OUTPUT[kind.id] ?? 1} />
    </group>
  )
}
