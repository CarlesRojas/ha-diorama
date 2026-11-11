import { colorValue, decorationVariant, materialValue, paramValue, type DecorationKind } from '#/decoration/catalog.ts'
import { useEased, useTravel } from '#/scene/decor/ease.ts'
import { Material, SEG, Slab, Tube } from '#/scene/decor/parts.tsx'
import { Books, Clock, Curtain, Mirror, Rug } from '#/scene/decor/Furnishings.tsx'
import Piano from '#/scene/decor/Piano.tsx'
import Railing from '#/scene/decor/Railing.tsx'
import Stairs from '#/scene/decor/Stairs.tsx'
import { FloorPlant, ShelfPlant, WallPlant } from '#/scene/decor/Plants.tsx'
import type { ItemState } from '#/scene/decor/state.ts'
import type { DecorationConfig } from '#/types.ts'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, Euler, InstancedMesh, LatheGeometry, Matrix4, Quaternion, Vector2, Vector3 } from 'three'

type Props = { kind: DecorationKind; item: DecorationConfig; state: ItemState | null }

// A leaf: a flattened, slightly pointed blade rather than a squashed ball.
function Leaf({
  length,
  width,
  position,
  rotation,
  children,
}: {
  length: number
  width: number
  position: [number, number, number]
  rotation: [number, number, number]
  children: React.ReactNode
}) {
  return (
    <mesh position={position} rotation={rotation} scale={[width, length * 0.06, length]} castShadow>
      <sphereGeometry args={[0.5, 20, 12]} />
      {children}
    </mesh>
  )
}

// The fringe along both short ends of a rug, one instanced mesh however
// long the rug is, so a wide one does not cost a mesh per tuft.
function Fringe({ width, depth, children }: { width: number; depth: number; children: React.ReactNode }) {
  const tufts = Math.max(6, Math.round(width / 0.03))
  const mesh = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const fringe = mesh.current
    if (!fringe) return
    const place = new Matrix4()
    const turn = new Euler()
    const one = new Vector3(1, 1, 1)
    for (let i = 0; i < tufts * 2; i++) {
      const s = i < tufts ? -1 : 1
      const k = i % tufts
      turn.set(Math.PI / 2, 0, ((k % 3) - 1) * 0.08)
      place.compose(
        new Vector3(-width / 2 + ((k + 0.5) * width) / tufts, 0.006, s * (depth / 2 + 0.028)),
        new Quaternion().setFromEuler(turn),
        one,
      )
      fringe.setMatrixAt(i, place)
    }
    fringe.instanceMatrix.needsUpdate = true
    fringe.computeBoundingSphere()
  }, [tufts, width, depth])
  return (
    <instancedMesh key={tufts} ref={mesh} args={[undefined, undefined, tufts * 2]}>
      <capsuleGeometry args={[0.004, 0.05, 1, 5]} />
      {children}
    </instancedMesh>
  )
}

// What a dry plant's soil and leaves fade toward.
const DRY_SOIL = new Color('#9a8a72')
const DRY_LEAF = new Color('#b39a52')

// Rugs, plants, art and the soft things that make a room feel lived in.
export default function DecorModel({ kind, item, state }: Props) {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const c = (slot: string) => colorValue(kind, item.colors, slot, item.variant)
  const m = (slot: string) => materialValue(kind, slot, item.variant)
  const style = decorationVariant(kind, item.variant)?.id ?? ''
  // How thirsty a plant is, 0 watered to 1 dry: it starts to wilt at its
  // Dry below reading and is fully wilted 15 points under it. Eased, so a
  // watering perks it up over a few seconds rather than in one frame.
  const dry = kind.params.some(x => x.id === 'dry') ? p('dry') : undefined
  const moisture = dry === undefined ? undefined : state?.moisture
  const thirst = useEased(moisture === undefined ? 0 : Math.min(Math.max((dry! - moisture) / 15, 0), 1), 1.5)
  const tinted = (slot: string) => {
    if (thirst <= 0) return c(slot)
    if (slot === 'soil') return new Color(c(slot)).lerp(DRY_SOIL, thirst).getStyle()
    if (slot === 'leaves' || slot === 'stems' || slot === 'markings')
      return new Color(c(slot)).lerp(DRY_LEAF, thirst * 0.7).getStyle()
    return c(slot)
  }
  const paint = (slot: string, both = false) => <Material color={tinted(slot)} material={m(slot)} doubleSide={both} />
  // An unbound curtain hangs closed. A device with a position draws it that
  // far, one that only switches draws it all the way open or shut. Eased,
  // so it draws rather than jumps as Home Assistant reports its position on
  // the way.
  const level = useTravel(state ? (state.levels.open ?? (state.on ? 1 : 0)) : 0)

  // A turned stoneware vase, narrow foot, full belly, drawn in neck.
  const isVase = kind.id === 'vase'
  const vaseR = isVase ? p('size') / 2 : 0
  const vaseH = isVase ? p('height') : 0
  const vaseGeometry = useMemo(() => {
    if (!isVase) return null
    const r = vaseR
    const h = vaseH
    const profile: [number, number][] = [
      [0.001, 0],
      [r * 0.52, 0],
      [r * 0.56, h * 0.06],
      [r * 0.86, h * 0.26],
      [r, h * 0.5],
      [r * 0.88, h * 0.76],
      [r * 0.62, h * 0.94],
      [r * 0.6, h],
      [r * 0.53, h * 0.98],
      [r * 0.52, h * 0.3],
    ]
    return new LatheGeometry(
      profile.map(([x, y]) => new Vector2(x, y)),
      SEG * 2,
    )
  }, [isVase, vaseR, vaseH])

  switch (kind.id) {
    case 'half_wall': {
      // A low dividing wall: one plain block, long in one direction and
      // thin in the other, with a top other things stand on.
      const w = p('width')
      const d = p('depth')
      const h = p('height')
      return (
        <Slab size={[w, h, d]} radius={0.012} bevel={0.006} position={[0, 0, 0]}>
          <Material color={c('wall')} material={m('wall')} />
        </Slab>
      )
    }
    case 'rug': {
      const w = p('width')
      const d = p('depth')
      return (
        <Rug
          style={style}
          w={w}
          d={d}
          plain={p('plain') > 0}
          paint={paint}
          fringe={children => (
            <Fringe width={w} depth={d}>
              {children}
            </Fringe>
          )}
        />
      )
    }
    case 'plant_large':
      return <FloorPlant style={style} size={p('size')} height={p('height')} wilt={thirst} paint={paint} />
    case 'plant_small':
      return (
        <ShelfPlant
          style={style}
          size={p('size')}
          height={p('height')}
          trail={p('trail')}
          wilt={thirst}
          paint={paint}
        />
      )
    case 'plant_wall':
      return <WallPlant style={style} width={p('width')} trail={p('trail')} wilt={thirst} paint={paint} />
    case 'wall_mirror': {
      const s = p('size')
      return (
        <group position={[0, Math.max(0, s / 2 + 0.02 - p('height')), 0]}>
          <Mirror style={style} s={s} paint={paint} />
        </group>
      )
    }
    case 'wall_clock': {
      const s = p('size')
      return (
        <group position={[0, Math.max(0, s / 2 + 0.02 - p('height')), 0]}>
          <Clock style={style} s={s} paint={paint} glow={c('accent')} />
        </group>
      )
    }
    case 'vase': {
      const r = p('size') / 2
      const h = p('height')
      const stems = 5
      return (
        <group>
          {vaseGeometry && (
            <mesh geometry={vaseGeometry} castShadow receiveShadow>
              <Material color={c('vase')} material={m('vase')} doubleSide />
            </mesh>
          )}
          {Array.from({ length: stems }).map((_, i) => {
            const a = i * 2.39
            const top = h * (1.3 + (i % 2) * 0.22)
            const reach = r * (0.5 + (i % 3) * 0.45)
            const out = (k: number): [number, number] => [Math.cos(a) * k, Math.sin(a) * k]
            // Each stem rises from inside the vase straight up through the
            // neck, then bends out to where its flower is.
            const [x0, z0] = out(r * 0.12)
            const [x1, z1] = out(r * 0.3)
            const [x2, z2] = out(reach)
            return (
              <group key={i}>
                <Tube
                  points={[
                    [x0, h * 0.7, z0],
                    [x1, h * 1.02, z1],
                    [x2, top, z2],
                  ]}
                  radius={Math.min(0.005, r * 0.05)}
                  segments={16}
                >
                  <Material color={c('stems')} material={m('stems')} />
                </Tube>
                <Leaf length={r * 0.9} width={r * 0.4} position={[x2, top, z2]} rotation={[0, -a + Math.PI / 2, 0.9]}>
                  <Material color={c('flowers')} material={m('flowers')} doubleSide />
                </Leaf>
              </group>
            )
          })}
        </group>
      )
    }
    case 'stairs':
      return (
        <Stairs
          style={style}
          w={p('width')}
          l={p('length')}
          h={p('height')}
          reach={p('reach')}
          flip={p(style === 'quarter' ? 'flip' : 'rail') > 0.5}
          paint={paint}
        />
      )
    case 'railing':
      return <Railing style={style} w={p('width')} h={p('height')} paint={paint} glass={c('glass')} />
    case 'piano':
      return <Piano style={style} w={p('width')} d={p('depth')} h={p('height')} paint={paint} />
    case 'books':
      return <Books w={p('width')} h={p('height')} paint={paint} />
    case 'curtain':
      return (
        <Curtain
          style={style}
          w={p('width')}
          height={p('height')}
          hem={p('hem')}
          level={level}
          single={p('single') > 0.5}
          left={p('left') > 0.5}
          paint={paint}
          sheer={<Material color={c('fabric')} material={m('fabric')} doubleSide opacity={0.55} />}
        />
      )
    default:
      return null
  }
}
