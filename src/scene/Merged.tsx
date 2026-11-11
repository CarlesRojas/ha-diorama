import { betweenOf, coversOver } from '#/decoration/between.ts'
import { decorationKind } from '#/decoration/catalog.ts'
import { showOnly } from '#/scene/focus.ts'
import type { CardConfig } from '#/types.ts'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix3,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  Vector3,
  type Group,
  type Scene,
  type Side,
} from 'three'

// A piece with no device behind it never changes: nothing switches it on,
// nothing moves it, and a press on it counts as one on the floor of its
// room. Yet it was drawn as its every part, a leg, a cushion, a knob, each a
// draw call of its own, and a flat of a few hundred pieces came to several
// hundred calls a frame, which is what a phone spends its frame on. So once
// the scene is built, every plain painted part of every such piece in a room
// is copied into one shape per kind of paint, its color carried on the
// vertices, and the parts themselves are hidden. The room then draws in a
// handful of calls and looks the same: the same triangles, the same colors,
// the same shading, only drawn together.
//
// Only plain paint is taken. Glass, a shade that light comes through, a
// screen, anything that glows or fades, keeps its own mesh: its values move
// or its shader is its own. The pieces that move on their own, a clock, are
// left whole too, as is anything standing on a desk that a device raises.
//
// In the editor every piece is pickable, so nothing there is merged.

// Kinds that move on their own, with no device behind them.
const LIVE_KINDS = new Set(['wall_clock'])

const DECORATION = 'decoration:'

// Whether the card merges at all. The demo page turns it off to compare.
let enabled = true
export function setMerging(on: boolean) {
  enabled = on
}

// The pieces that can be merged, by id: those with no device, that do not
// move on their own, and that do not stand on something a device raises.
function staticIds(config: CardConfig, keep?: ReadonlySet<string>) {
  const items = config.decorations ?? []
  const byId = new Map(items.map(d => [d.id, d]))
  const bound = new Set<string>()
  for (const device of config.devices ?? []) for (const id of device.decorations ?? []) bound.add(id)
  const ids = new Set<string>()
  for (const item of items) {
    if (bound.has(item.id) || keep?.has(item.id)) continue
    const kind = decorationKind(item.kind)
    if (!kind || LIVE_KINDS.has(kind.id)) continue
    // A piece in a wall between two rooms stays its own, so it can stay
    // when either room is focused and say which side it was pressed from.
    if (betweenOf(item, config.rooms ?? [])) continue
    // So does a window with a blind over it, which takes the blind's presses.
    if (coversOver(item, items, id => bound.has(id)).length > 0) continue
    let raised = false
    let at = item
    for (let depth = 0; at.on && depth < 6; depth++) {
      const below = byId.get(at.on)
      if (!below) break
      if (below.kind === 'desk' && bound.has(below.id)) raised = true
      at = below
    }
    if (!raised) ids.add(item.id)
  }
  return ids
}

// The plain paint of a part, or null when the part is anything else: see
// through, glowing, textured, drawn in its own order, or left out of the
// shadows on purpose. Anything not plain keeps its own mesh.
function plainPaint(mesh: Mesh): MeshStandardMaterial | null {
  if ((mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh || mesh.morphTargetInfluences?.length) return null
  if (mesh.renderOrder !== 0 || mesh.layers.mask !== 1) return null
  if (mesh.onBeforeRender !== Object3D.prototype.onBeforeRender) return null
  if (mesh.userData.transmits || mesh.userData.noShadow) return null
  const material = mesh.material
  if (Array.isArray(material) || material.type !== 'MeshStandardMaterial') return null
  const m = material as MeshStandardMaterial
  if (m.transparent || m.opacity < 1 || !m.depthWrite || !m.depthTest || m.alphaTest > 0) return null
  if (m.wireframe || !m.toneMapped || m.blending !== NormalBlending || !m.colorWrite || m.vertexColors || m.flatShading)
    return null
  if (m.polygonOffset || m.dithering || m.clipShadows || m.clippingPlanes) return null
  if (
    m.map ||
    m.normalMap ||
    m.roughnessMap ||
    m.metalnessMap ||
    m.emissiveMap ||
    m.aoMap ||
    m.alphaMap ||
    m.bumpMap ||
    m.envMap ||
    m.lightMap ||
    m.displacementMap
  )
    return null
  if (m.emissiveIntensity > 0 && (m.emissive.r > 0 || m.emissive.g > 0 || m.emissive.b > 0)) return null
  const geometry = mesh.geometry
  if (!geometry.attributes.position || geometry.groups.length > 0) return null
  if ((geometry as { isInstancedBufferGeometry?: boolean }).isInstancedBufferGeometry) return null
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null
  return m
}

// One copy of a part to place: its shape, where it goes and what color.
type Copy = { geometry: BufferGeometry; matrix: Matrix4; color: Color }

// Every copy that takes the same paint, apart from its color, which the
// vertices carry.
type Batch = { key: string; roughness: number; metalness: number; side: Side; copies: Copy[] }

const place = new Matrix4()
const turn = new Matrix3()
const v = new Vector3()

function batches(group: Group, hidden: Mesh[]) {
  const found = new Map<string, Batch>()
  group.traverseVisible(object => {
    if (!(object instanceof Mesh)) return
    const mesh = object as Mesh
    const paint = plainPaint(mesh)
    if (!paint) return
    const key = `${paint.roughness}|${paint.metalness}|${paint.side}`
    let batch = found.get(key)
    if (!batch) {
      batch = { key, roughness: paint.roughness, metalness: paint.metalness, side: paint.side, copies: [] }
      found.set(key, batch)
    }
    if (mesh instanceof InstancedMesh) {
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new Matrix4()
        mesh.getMatrixAt(i, matrix)
        matrix.premultiply(mesh.matrixWorld)
        const color = new Color()
        if (mesh.instanceColor) mesh.getColorAt(i, color)
        else color.copy(paint.color)
        batch.copies.push({ geometry: mesh.geometry, matrix, color })
      }
    } else batch.copies.push({ geometry: mesh.geometry, matrix: mesh.matrixWorld.clone(), color: paint.color.clone() })
    mesh.visible = false
    hidden.push(mesh)
  })
  return found
}

// One shape from every copy in a batch: positions and normals moved to where
// each copy stands, each copy's color on its vertices, and the triangles of
// a mirrored copy turned round so they still face out.
function merge(copies: Copy[]) {
  let vertices = 0
  let indices = 0
  for (const copy of copies) {
    const g = copy.geometry
    if (!g.attributes.normal) g.computeVertexNormals()
    vertices += g.attributes.position.count
    indices += g.index ? g.index.count : g.attributes.position.count
  }
  const position = new Float32Array(vertices * 3)
  const normal = new Float32Array(vertices * 3)
  const color = new Float32Array(vertices * 3)
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices)
  let vAt = 0
  let iAt = 0
  for (const copy of copies) {
    const g = copy.geometry
    const p = g.attributes.position
    const n = g.attributes.normal
    place.copy(copy.matrix)
    turn.getNormalMatrix(place)
    const mirrored = place.determinant() < 0
    const count = p.count
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(place)
      position[(vAt + i) * 3] = v.x
      position[(vAt + i) * 3 + 1] = v.y
      position[(vAt + i) * 3 + 2] = v.z
      v.fromBufferAttribute(n, i).applyMatrix3(turn).normalize()
      normal[(vAt + i) * 3] = v.x
      normal[(vAt + i) * 3 + 1] = v.y
      normal[(vAt + i) * 3 + 2] = v.z
      color[(vAt + i) * 3] = copy.color.r
      color[(vAt + i) * 3 + 1] = copy.color.g
      color[(vAt + i) * 3 + 2] = copy.color.b
    }
    const source = g.index
    const triangles = (source ? source.count : count) / 3
    for (let t = 0; t < triangles; t++) {
      const a = source ? source.getX(t * 3) : t * 3
      const b = source ? source.getX(t * 3 + 1) : t * 3 + 1
      const c = source ? source.getX(t * 3 + 2) : t * 3 + 2
      index[iAt++] = vAt + a
      index[iAt++] = vAt + (mirrored ? c : b)
      index[iAt++] = vAt + (mirrored ? b : c)
    }
    vAt += count
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  geometry.setAttribute('color', new BufferAttribute(color, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()
  return geometry
}

type Baked = { meshes: Mesh[]; hidden: Mesh[] }

// Merges the static pieces of every room and hides their parts. Returns what
// was made and what was hidden, so both can be undone.
function bake(scene: Scene, ids: Set<string>): Baked {
  scene.updateMatrixWorld(true)
  // The groups to take, by the room they stand in.
  const rooms = new Map<string | undefined, Group[]>()
  scene.traverse(object => {
    if (!object.name.startsWith(DECORATION) || !ids.has(object.name.slice(DECORATION.length))) return
    const room = object.userData.room as string | undefined
    const list = rooms.get(room) ?? []
    list.push(object as Group)
    rooms.set(room, list)
  })
  const meshes: Mesh[] = []
  const hidden: Mesh[] = []
  const materials = new Map<string, MeshStandardMaterial>()
  for (const [room, groups] of rooms) {
    const all = new Map<string, Batch>()
    for (const group of groups) {
      for (const [key, batch] of batches(group, hidden)) {
        const into = all.get(key)
        if (into) into.copies.push(...batch.copies)
        else all.set(key, batch)
      }
    }
    for (const batch of all.values()) {
      if (batch.copies.length === 0) continue
      let material = materials.get(batch.key)
      if (!material) {
        material = new MeshStandardMaterial({
          vertexColors: true,
          roughness: batch.roughness,
          metalness: batch.metalness,
          side: batch.side,
        })
        materials.set(batch.key, material)
      }
      const mesh = new Mesh(merge(batch.copies), material)
      mesh.name = `merged:${room ?? ''}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      // A press on it is one on the floor of the room, as it was on the parts.
      if (room) mesh.userData.room = room
      scene.add(mesh)
      meshes.push(mesh)
    }
  }
  return { meshes, hidden }
}

// `keep` are pieces that take a press of their own, like stairs to another
// floor, and stay whole.
type Props = { config: CardConfig; keep?: ReadonlySet<string> }

export default function Merged({ config, keep }: Props) {
  const scene = useThree(state => state.scene)
  const invalidate = useThree(state => state.invalidate)
  // Runs after every model has built and placed its parts, and again from
  // scratch when the plan changes.
  useEffect(() => {
    if (!enabled) return
    // A part hidden around a focused room would be taken for one that is
    // not plain paint. The focus hides what it has to again on its next frame.
    showOnly(scene, null)
    const baked = bake(scene, staticIds(config, keep))
    invalidate()
    return () => {
      for (const mesh of baked.hidden) mesh.visible = true
      const materials = new Set<MeshStandardMaterial>()
      for (const mesh of baked.meshes) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        materials.add(mesh.material as MeshStandardMaterial)
      }
      for (const material of materials) material.dispose()
      invalidate()
    }
  }, [scene, config, keep, invalidate])
  return null
}
