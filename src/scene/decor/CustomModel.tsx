import { colorValue, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { MODEL_COLOR, modelOf } from '#/decoration/models.ts'
import { useEased, useTravel } from '#/scene/decor/ease.ts'
import { Glow, ownShadowless } from '#/scene/decor/LightModel.tsx'
import { ShadeMaterial } from '#/scene/decor/lightMaterials.tsx'
import { Material } from '#/scene/decor/parts.tsx'
import { decodeShape, fetchGltf, partGeometry, shapeOf, type Shape } from '#/scene/decor/modelShape.ts'
import type { ItemState } from '#/scene/decor/state.ts'
import { shadowless, useLive } from '#/scene/live.ts'
import type { DecorationConfig, ModelConfig, ModelLook, ModelMotion } from '#/types.ts'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box3, MathUtils, Quaternion, Vector3, type BufferGeometry, type Group } from 'three'

type Props = { kind: DecorationKind; item: DecorationConfig; state: ItemState | null }

type DrawnPart = { name: string; geometry: BufferGeometry; motion?: ModelMotion; look?: ModelLook }
type Drawn = { size: [number, number, number]; parts: DrawnPart[] }

// A model's parts, made once and drawn by every piece placed from it. What
// is kept says which data it was made from, so a model imported again under
// the same id is made again, and a card config handed over afresh, as Home
// Assistant does on every edit, finds the one already made.
const made = new Map<string, { key: string; drawn: Drawn }>()

const keyOf = (model: ModelConfig) =>
  JSON.stringify([
    model.size,
    model.parts.map(p => [
      p.name,
      p.motion,
      p.look,
      p.vertices?.length,
      p.triangles?.length,
      p.vertices?.slice(0, 32),
      p.triangles?.slice(-32),
    ]),
  ])

const drawnOf = (shape: Shape): Drawn => ({
  size: shape.size,
  parts: shape.parts.map(part => ({
    name: part.name,
    geometry: partGeometry(part),
    ...(part.motion && { motion: part.motion }),
    ...(part.look && { look: part.look }),
  })),
})

function embedded(kindId: string, model: ModelConfig): Drawn {
  const key = keyOf(model)
  const known = made.get(kindId)
  if (known && known.key === key) return known.drawn
  const drawn = drawnOf(decodeShape(model))
  made.set(kindId, { key, drawn })
  return drawn
}

// A model read from a file of its own is fetched once per address, and
// drawn at once by everything that asks after that, so the editor, which
// has just read it to import it, draws it in the same frame.
const fetched = new Map<string, Promise<Shape>>()
const ready = new Map<string, Drawn>()
export function fetchShape(url: string) {
  let found = fetched.get(url)
  if (!found) {
    found = fetchGltf(url).then(gltf => {
      const shape = shapeOf(gltf)
      ready.set(url, drawnOf(shape))
      return shape
    })
    // A file that failed can be tried again on the next load.
    found.catch(() => fetched.delete(url))
    fetched.set(url, found)
  }
  return found
}

function useDrawn(kindId: string): Drawn | null {
  const model = modelOf(kindId)
  const url = model?.url
  // Held as state too, so the draw once it has arrived is told apart from
  // the one before it.
  const [loaded, setLoaded] = useState<{ url: string; drawn: Drawn } | null>(null)
  useEffect(() => {
    if (!url || ready.has(url)) return
    let live = true
    fetchShape(url).then(
      () => {
        const drawn = ready.get(url)
        if (live && drawn) setLoaded({ url, drawn })
      },
      error => console.warn(`Diorama could not load the model at ${url}`, error),
    )
    return () => {
      live = false
    }
  }, [url])
  if (!model) return null
  if (!url) return embedded(kindId, model)
  return ready.get(url) ?? (loaded?.url === url ? loaded.drawn : null)
}

type Vec3 = [number, number, number]
const times = (a: Vec3, b: Vec3): Vec3 => [a[0] * b[0], a[1] * b[1], a[2] * b[2]]

// One part that moves with the device. It is stretched with the rest of the
// model first and then turned or moved whole round its pivot, so a hinged
// door on a model made wider stays a door and is never sheared.
function Moving({
  motion,
  scale,
  open,
  spin,
  children,
}: {
  motion: ModelMotion
  scale: Vec3
  // How far open the piece is, 0 to 1, for a hinge or a slide.
  open: number
  // Turns a second, for a spin.
  spin: number
  children: ReactNode
}) {
  const turning = useRef<Group>(null)
  const angle = useRef(0)
  const axis = useMemo(() => new Vector3(...motion.axis), [motion.axis])
  useLive(motion.type === 'spin' && spin > 0.001)
  useLayoutEffect(() => {
    if (motion.type === 'spin') shadowless(turning.current)
  })
  useFrame((_, delta) => {
    if (motion.type !== 'spin' || !turning.current || spin <= 0.001) return
    angle.current = (angle.current + spin * Math.PI * 2 * Math.min(delta, 0.1)) % (Math.PI * 2)
    turning.current.quaternion.setFromAxisAngle(axis, angle.current)
  })
  const at = times(motion.pivot, scale)
  let position = at
  let quaternion: Quaternion | undefined
  if (motion.type === 'slide') {
    const reach = motion.amount * open
    position = [
      at[0] + motion.axis[0] * reach * scale[0],
      at[1] + motion.axis[1] * reach * scale[1],
      at[2] + motion.axis[2] * reach * scale[2],
    ]
  } else if (motion.type === 'hinge')
    quaternion = new Quaternion().setFromAxisAngle(axis, MathUtils.degToRad(motion.amount) * open)
  const [px, py, pz] = motion.pivot
  return (
    <group position={position} {...(quaternion && { quaternion })}>
      <group ref={turning}>
        <group scale={scale}>
          <group position={[-px, -py, -pz]}>{children}</group>
        </group>
      </group>
    </group>
  )
}

// A model imported into the catalog, in the card's own paint: every part a
// plain color, stretched to the sizes on its sliders. On the floor it stands
// on its base, on a wall it hangs with its back to the wall, and from the
// ceiling it hangs by its top. Parts tagged in the file come alive with the
// device behind the piece: they glow, swing, slide, spin, or show only while
// it is on or off (see modelTags.ts).
export default function CustomModel({ kind, item, state }: Props) {
  const drawn = useDrawn(kind.id)
  const own = useRef<Group>(null)
  const on = state?.on ?? false
  // How far open it is: the percentage feeding it, or its switch when it has
  // none, eased the way a cover travels.
  const openTarget = state ? (state.levels.open ?? (state.on ? 1 : 0)) : 0
  const open = useTravel(openTarget, undefined, state?.dragged)
  // Shown and hidden parts change over half way through a light's fade.
  const lit = useEased(on ? 1 : 0, 9)
  // A spin runs at its speed times the device's level, and runs down.
  const spin = useEased(on ? (state?.level ?? 1) : 0, 2)
  const glows = drawn?.parts.some(p => p.look?.type === 'glow') ?? false
  useLayoutEffect(() => {
    if (glows && own.current) ownShadowless(own.current)
  })
  // Where the light comes from: the middle of every part that glows.
  const glowAt = useMemo(() => {
    const box = new Box3()
    let output = 0
    for (const part of drawn?.parts ?? []) {
      if (part.look?.type !== 'glow' || !part.geometry.boundingBox) continue
      box.union(part.geometry.boundingBox)
      output = Math.max(output, part.look.output ?? 1)
    }
    if (box.isEmpty()) return null
    const middle = box.getCenter(new Vector3())
    return { at: [middle.x, middle.y, middle.z] as Vec3, output }
  }, [drawn])
  if (!drawn) return null
  const w = paramValue(kind, item.params, 'width', item.variant)
  const d = paramValue(kind, item.params, 'depth', item.variant)
  const h = paramValue(kind, item.params, 'height', item.variant)
  const [sw, sd, sh] = drawn.size
  const scale: Vec3 = [w / sw, h / sh, d / sd]
  const slots = Object.keys(kind.colors)
  const still: ReactNode[] = []
  const moving: ReactNode[] = []
  drawn.parts.forEach((part, i) => {
    // A part is painted by its name, and by its place when the file it
    // is read from has changed since it was imported.
    const slot = slots.includes(part.name) ? part.name : slots[i]
    const color = slot ? colorValue(kind, item.colors, slot) : MODEL_COLOR
    const finish = slot ? materialValue(kind, slot) : undefined
    const look = part.look?.type
    const shown = look === 'on' ? lit > 0.5 : look === 'off' ? lit <= 0.5 : true
    const shines = look === 'glow' || look === 'led'
    const mesh = (
      <mesh
        key={i}
        geometry={part.geometry}
        castShadow={!shines}
        receiveShadow
        visible={shown}
        dispose={null}
        // Light comes through a glowing shade, as through a lamp's.
        userData={look === 'glow' ? { transmits: true } : undefined}
      >
        {shines ? (
          <ShadeMaterial color={color} material={finish} state={state} solid={look === 'led'} />
        ) : (
          <Material color={color} material={finish} />
        )}
      </mesh>
    )
    if (!part.motion) still.push(mesh)
    else
      moving.push(
        <Moving key={i} motion={part.motion} scale={scale} open={open} spin={spin * part.motion.amount}>
          {mesh}
        </Moving>,
      )
  })
  return (
    <group ref={own} position={[0, kind.mount === 'ceiling' ? -h : 0, kind.mount === 'wall' ? d / 2 : 0]}>
      <group scale={scale}>{still}</group>
      {moving}
      {glowAt && <Glow state={state} at={times(glowAt.at, scale)} output={glowAt.output} />}
    </group>
  )
}
