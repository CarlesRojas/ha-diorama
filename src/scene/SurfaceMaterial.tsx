import { surface, type SurfaceKind } from '#/materials/textures.ts'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { DoubleSide, Matrix3, Vector2 } from 'three'

type Props = {
  kind: SurfaceKind
  color: string
  // Tiles per meter. Defaults to the surface's own scale.
  repeat?: number
  // Multiplier on the size of the pattern. Two makes the planks, tiles or
  // weave twice as large on the same surface.
  scale?: number
  // Turns the pattern on the surface, in degrees.
  rotation?: number
  // How much the pattern shows: 0 is a plain tint, 1 as designed, 2 twice.
  intensity?: number
  // Size in meters of the object this material wraps. Geometry with
  // normalized UVs, a sphere or a cylinder, needs it to tile at the same
  // physical scale as extruded geometry, whose UVs are already in meters.
  span?: number
  emissive?: [number, number, number]
  emissiveIntensity?: number
  // Whether the surface has its relief. A piece rounded tighter than the
  // pattern is wide takes the pattern's colors only, as its relief bends
  // into rings and creases round the curve.
  relief?: boolean
  doubleSide?: boolean
}

// Standard material with the procedural color and normal maps of a surface
// kind, tinted by a color.
export default function SurfaceMaterial({
  kind,
  color,
  repeat,
  scale = 1,
  rotation = 0,
  intensity = 1,
  span,
  emissive,
  emissiveIntensity = 0,
  relief = true,
  doubleSide = false,
}: Props) {
  const s = surface(kind, intensity)
  const maps = useMemo(() => {
    const map = s.map.clone()
    const normalMap = s.normalMap.clone()
    const perMeter = (repeat ?? s.repeat) / Math.max(scale, 0.01)
    const r = span ? perMeter * span : perMeter
    // The pattern turns on the surface first and is scaled into the tile
    // after, so a stretched tile keeps its long side along the pattern and
    // not along the room. Three multiplies the other way round when it builds
    // the matrix itself, so build it here instead.
    const a = (rotation * Math.PI) / 180
    const cos = Math.cos(a)
    const sin = Math.sin(a)
    const sx = r / s.stretch
    const sy = r
    const matrix = new Matrix3().set(sx * cos, -sx * sin, 0, sy * sin, sy * cos, 0, 0, 0, 1)
    for (const t of [map, normalMap]) {
      // Floors are seen at a grazing angle, where without this the boards
      // and grout lines break into dashes.
      t.anisotropy = 8
      t.matrixAutoUpdate = false
      t.matrix.copy(matrix)
      // No needsUpdate: the clone shares the surface's pixels, which are
      // already on the graphics card. Asking for an upload here sent the
      // whole canvas up again for every piece that wore it.
    }
    return { map, normalMap }
  }, [s, repeat, scale, rotation, span])
  // A clone is a texture of its own as far as three is concerned, and one
  // that was swapped for another, by a slider or a style change, must be
  // let go of or it stays on the graphics card.
  useEffect(
    () => () => {
      maps.map.dispose()
      maps.normalMap.dispose()
    },
    [maps],
  )
  // A pattern still on its way when these were made is sent up again once
  // it is in. A clone keeps its own count of changes, so telling the
  // surface's own maps is not enough.
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    if (s.loaded) return
    let live = true
    void s.ready.then(() => {
      if (!live) return
      maps.map.needsUpdate = true
      maps.normalMap.needsUpdate = true
      invalidate()
    })
    return () => {
      live = false
    }
  }, [s, maps, invalidate])
  const normalScale = useMemo(() => new Vector2(s.normalScale, s.normalScale), [s.normalScale])
  return (
    <meshStandardMaterial
      color={color}
      map={maps.map}
      normalMap={relief ? maps.normalMap : null}
      normalScale={normalScale}
      roughness={s.roughness}
      side={doubleSide ? DoubleSide : undefined}
      emissive={emissive ?? [0, 0, 0]}
      emissiveIntensity={emissiveIntensity}
    />
  )
}
