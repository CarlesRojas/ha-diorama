import { MODEL_MAX_PARTS } from '#/decoration/models.ts'
import {
  cleanLook,
  cleanMotion,
  cleanTops,
  isActive,
  MODEL_MAX_TOPS,
  parseTags,
  untagged,
  type PartTags,
} from '#/decoration/modelTags.ts'
import type { ModelConfig, ModelLook, ModelMotion, ModelTop } from '#/types.ts'
import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// A model's shape, read from a glTF file and kept as plain triangles: what
// it was painted with is thrown away, since the card paints it its own way,
// and so are its textures, its normals and everything else a file carries.
// Only where its corners are and which three make each triangle is left.

// One part of a model: its corners in meters, three numbers each, with the
// model standing on y = 0 and centered on x and z, and its triangles.
// A part that comes from a device carries what it does: see modelTags.ts.
export type ShapePart = {
  name: string
  positions: Float32Array
  index: Uint16Array | Uint32Array
  motion?: ModelMotion
  look?: ModelLook
  color?: string
  finish?: string
}
// The width, depth and height are along x, z and y.
// The tops are the upper faces of the meshes tagged `[top]`, lowest first.
export type Shape = { size: [number, number, number]; triangles: number; parts: ShapePart[]; tops: ModelTop[] }

// Edges sharper than this stay sharp, softer ones are shaded round.
const CREASE = (40 * Math.PI) / 180

function loader(files?: Map<string, string>) {
  const gltf = new GLTFLoader()
  // The files picked along with a .gltf, its .bin and the like, found by
  // their names.
  if (files)
    gltf.manager.setURLModifier(url => {
      const name = decodeURIComponent(url.split(/[\\/]/).pop() ?? '')
      return files.get(name) ?? url
    })
  // Meshopt's decoder is small enough to carry. Draco's is not, as three
  // bundles it, so a file compressed with Draco is turned away with a word
  // on how to export it.
  gltf.setMeshoptDecoder(MeshoptDecoder)
  // No texture is ever loaded, so none is decoded for nothing and none can
  // fail to load. It takes the place of the KTX2 one, which comes before
  // every other texture plugin and would ask for a loader it does not have.
  gltf.register(() => ({
    name: 'KHR_texture_basisu',
    loadTexture: () => Promise.resolve(null) as unknown as Promise<Texture>,
  }))
  return gltf
}

// Reads a .glb, or a .gltf with the files it names.
export async function readGltf(data: ArrayBuffer | string, files?: Map<string, string>): Promise<GLTF> {
  return loader(files).parseAsync(data, '')
}

export async function fetchGltf(url: string): Promise<GLTF> {
  return loader().loadAsync(url)
}

// What the file calls a node or a mesh, as written, before three tidies
// the name up for its own use.
type Names = { node?: string; mesh?: string; primitives: number }
function namesOf(gltf: GLTF, object: Object3D): Names {
  const json = gltf.parser.json as {
    nodes?: { name?: string }[]
    meshes?: { name?: string; primitives?: unknown[] }[]
  }
  const out: Names = { primitives: 1 }
  // A mesh with several primitives is a group of meshes, one per primitive,
  // under the node, so the names can be one step up.
  for (let o: Object3D | null = object, steps = 0; o && steps < 2; o = o.parent, steps++) {
    const at = gltf.parser.associations.get(o) as { nodes?: number; meshes?: number } | undefined
    if (!at) continue
    if (out.node === undefined && at.nodes !== undefined) out.node = json.nodes?.[at.nodes]?.name || undefined
    if (out.mesh === undefined && at.meshes !== undefined) {
      const mesh = json.meshes?.[at.meshes]
      out.mesh = mesh?.name || undefined
      out.primitives = mesh?.primitives?.length ?? 1
    }
  }
  return out
}

// A name as a person would write it: Blender's .001 copies and the
// underscores that stand for spaces taken out.
const tidy = (name: string | undefined) =>
  untagged((name ?? '').replace(/\.\d{3,}$/, ''))
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)

type Piece = {
  name: string
  material: string
  positions: number[]
  index: number[]
  // What it does, with the pivot of a motion where it stands in the file.
  motion?: ModelMotion
  look?: ModelLook
  // Whether its upper face is a top for other pieces to stand on.
  top?: boolean
  // What its material in the file says, when it has one.
  color?: string
  finish?: string
}

const FINISHES = new Set(['matte', 'fabric', 'wood', 'ceramic', 'metal'])

// The paint a material in the file stands for: its color, and a finish by
// its name when that is one of the card's, or else by how metallic and how
// rough it is. A mesh with no material of its own says nothing.
function paintOf(gltf: GLTF, material: Mesh['material'] | undefined): { color?: string; finish?: string } {
  const m = (Array.isArray(material) ? material[0] : material) as
    { name?: string; color?: { getHexString: () => string }; metalness?: number; roughness?: number } | undefined
  // The loader paints a mesh with no material in a plain white of its own,
  // with no name. A material it had to copy, for a mesh without normals,
  // keeps the name but not the link back to the file.
  if (!m || (gltf.parser.associations.get(m as never)?.materials === undefined && !m.name)) return {}
  const named = (m.name ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .find(w => FINISHES.has(w))
  const finish = named ?? ((m.metalness ?? 0) > 0.5 ? 'metal' : (m.roughness ?? 1) < 0.35 ? 'ceramic' : 'matte')
  return { ...(m.color && { color: `#${m.color.getHexString()}` }), finish }
}

// The nearest motion and the nearest look tagged on the mesh or on a node
// above it, and where the node with the motion has its origin. A top is
// said by the mesh itself or by any node above it.
function tagsAbove(gltf: GLTF, object: Object3D): { motion?: ModelMotion; look?: ModelLook; top?: boolean } {
  const json = gltf.parser.json as { nodes?: { name?: string }[]; meshes?: { name?: string }[] }
  const out: { motion?: ModelMotion; look?: ModelLook; top?: boolean } = {}
  for (let o: Object3D | null = object; o; o = o.parent) {
    const at = gltf.parser.associations.get(o) as { nodes?: number; meshes?: number } | undefined
    const names = [
      at?.nodes !== undefined ? json.nodes?.[at.nodes]?.name : undefined,
      at?.meshes !== undefined ? json.meshes?.[at.meshes]?.name : undefined,
    ]
    for (const name of names) {
      const tags: PartTags = parseTags(name)
      if (tags.top) out.top = true
      if (!out.look && tags.look) out.look = tags.look
      if (!out.motion && tags.motion) {
        const origin = new Vector3().setFromMatrixPosition(o.matrixWorld)
        out.motion = { ...tags.motion, pivot: [origin.x, origin.y, origin.z] }
      }
    }
  }
  return out
}

const corner = new Vector3()
const place = new Matrix4()
const instance = new Matrix4()

// Every mesh in the file as triangles where they stand in the scene.
function piecesOf(gltf: GLTF): Piece[] {
  const root = gltf.scene ?? gltf.scenes?.[0]
  if (!root) return []
  root.updateMatrixWorld(true)
  const pieces: Piece[] = []
  root.traverse(object => {
    const mesh = object as Mesh
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return
    const geometry = mesh.geometry
    const position = geometry.attributes.position
    const names = namesOf(gltf, mesh)
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const tags = tagsAbove(gltf, mesh)
    let name = tidy(names.node) || tidy(names.mesh)
    // A mesh in several materials is told apart by them, a chair's frame
    // from its seat.
    if (names.primitives > 1 && material?.name) name = name ? `${name} ${tidy(material.name)}` : tidy(material.name)
    const copies: Matrix4[] = []
    const instanced = mesh as InstancedMesh
    if (instanced.isInstancedMesh) {
      for (let i = 0; i < instanced.count; i++) {
        instanced.getMatrixAt(i, instance)
        copies.push(instance.clone().premultiply(mesh.matrixWorld))
      }
    } else copies.push(mesh.matrixWorld)
    const source = geometry.index
    const count = source ? source.count : position.count
    for (const matrix of copies) {
      place.copy(matrix)
      const positions: number[] = new Array(position.count * 3)
      for (let i = 0; i < position.count; i++) {
        corner.fromBufferAttribute(position, i).applyMatrix4(place)
        positions[i * 3] = corner.x
        positions[i * 3 + 1] = corner.y
        positions[i * 3 + 2] = corner.z
      }
      // A mirrored copy has its triangles turned round so they still face out.
      const mirrored = place.determinant() < 0
      const index: number[] = new Array(count - (count % 3))
      for (let t = 0; t + 2 < count; t += 3) {
        const a = source ? source.getX(t) : t
        const b = source ? source.getX(t + 1) : t + 1
        const c = source ? source.getX(t + 2) : t + 2
        index[t] = a
        index[t + 1] = mirrored ? c : b
        index[t + 2] = mirrored ? b : c
      }
      pieces.push({ name, material: tidy(material?.name), positions, index, ...tags, ...paintOf(gltf, mesh.material) })
    }
  })
  return pieces
}

const triangleCount = (pieces: Piece[]) => pieces.reduce((sum, p) => sum + p.index.length / 3, 0)

// What a piece does, so that two pieces of the same name that move round
// different hinges stay two parts.
const doing = (p: Piece) => (isActive(p) ? `\u0001${JSON.stringify([p.motion ?? null, p.look ?? null])}` : '')

// Pieces with the same name are one part, so the four legs of a table are
// painted together. A piece with no name is a part of its own.
function gather(pieces: Piece[], by: (p: Piece) => string): Piece[][] {
  const groups = new Map<string, Piece[]>()
  let unnamed = 0
  for (const piece of pieces) {
    const own = by(piece).toLowerCase()
    const key = own || isActive(piece) ? `${own}${doing(piece)}` : `\u0000${unnamed++}`
    const list = groups.get(key)
    if (list) list.push(piece)
    else groups.set(key, [piece])
  }
  return [...groups.values()]
}

// Few enough parts to paint one by one and to draw in a few calls. Past the
// limit they are gathered by what they are made of, and past it still the
// smallest go together as Other.
// The parts that come from a device always stay parts of their own, by
// name, since what they do is theirs: only the still ones are gathered.
function partsOf(pieces: Piece[]): { name: string; pieces: Piece[] }[] {
  const active = gather(pieces.filter(isActive), p => p.name)
  const still = pieces.filter(p => !isActive(p))
  const room = Math.max(MODEL_MAX_PARTS - active.length, 1)
  let groups = gather(still, p => p.name)
  let named = (group: Piece[]) => group[0].name
  if (groups.length > room) {
    groups = gather(still, p => p.material)
    named = group => group[0].material
  }
  if (groups.length > room) {
    groups.sort((a, b) => triangleCount(b) - triangleCount(a))
    const rest = groups.splice(room - 1).flat()
    groups.push(rest.map(p => ({ ...p, name: 'Other', material: 'Other' })))
  }
  const all = [
    ...groups.map(g => ({ group: g, named })),
    ...active.map(g => ({ group: g, named: (x: Piece[]) => x[0].name })),
  ]
  const used = new Set<string>()
  return all.map(({ group, named }, i) => {
    let name = named(group) || `Part ${i + 1}`
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${named(group) || 'Part'} ${n}`
    used.add(name.toLowerCase())
    return { name, pieces: group }
  })
}

// A file says nothing about its unit, and glTF means meters. A model that
// would come out tens of meters across was made in centimeters, or in
// millimeters, and is taken down to size.
function unitOf(largest: number) {
  let scale = 1
  while (largest * scale > 30) scale /= scale === 1 ? 100 : 10
  return scale
}

const round4 = (value: number) => Math.round(value * 10000) / 10000

// The tops in a model: the upper face of every still piece tagged for it,
// as the box round the piece seen from above. Two at the same height that
// touch are one top, so a board made of several meshes is stood on as one.
// `place` takes a corner in the file to where it is in the model.
function topsOf(pieces: Piece[], place: (value: number, axis: number) => number): ModelTop[] {
  type Box = { y: number; x0: number; x1: number; z0: number; z1: number }
  const boxes: Box[] = []
  for (const piece of pieces) {
    if (!piece.top || piece.motion || piece.positions.length === 0) continue
    const box: Box = { y: -Infinity, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity }
    for (let i = 0; i < piece.positions.length; i += 3) {
      const x = place(piece.positions[i], 0)
      const y = place(piece.positions[i + 1], 1)
      const z = place(piece.positions[i + 2], 2)
      box.y = Math.max(box.y, y)
      box.x0 = Math.min(box.x0, x)
      box.x1 = Math.max(box.x1, x)
      box.z0 = Math.min(box.z0, z)
      box.z1 = Math.max(box.z1, z)
    }
    const near = 0.005
    const same = boxes.find(
      b =>
        Math.abs(b.y - box.y) <= near &&
        b.x0 <= box.x1 + near &&
        box.x0 <= b.x1 + near &&
        b.z0 <= box.z1 + near &&
        box.z0 <= b.z1 + near,
    )
    if (same) {
      same.y = Math.max(same.y, box.y)
      same.x0 = Math.min(same.x0, box.x0)
      same.x1 = Math.max(same.x1, box.x1)
      same.z0 = Math.min(same.z0, box.z0)
      same.z1 = Math.max(same.z1, box.z1)
    } else boxes.push(box)
  }
  return boxes
    .filter(b => b.x1 - b.x0 > 0.01 && b.z1 - b.z0 > 0.01)
    .sort((a, b) => (b.x1 - b.x0) * (b.z1 - b.z0) - (a.x1 - a.x0) * (a.z1 - a.z0))
    .slice(0, MODEL_MAX_TOPS)
    .map(b => ({
      y: round4(Math.max(b.y, 0)),
      x: round4((b.x0 + b.x1) / 2),
      z: round4((b.z0 + b.z1) / 2),
      w: round4(b.x1 - b.x0),
      d: round4(b.z1 - b.z0),
    }))
    .sort((a, b) => a.y - b.y)
}

// The shape in a glTF file, standing on the floor and centered, in meters.
export function shapeOf(gltf: GLTF): Shape {
  const pieces = piecesOf(gltf)
  if (pieces.length === 0 || triangleCount(pieces) === 0) throw new Error('There is no shape in this file.')
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const piece of pieces)
    for (let i = 0; i < piece.positions.length; i++) {
      const axis = i % 3
      if (piece.positions[i] < min[axis]) min[axis] = piece.positions[i]
      if (piece.positions[i] > max[axis]) max[axis] = piece.positions[i]
    }
  const scale = unitOf(Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]))
  const middle = [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2]
  const parts = partsOf(pieces).map(({ name, pieces: group }) => {
    const vertices = group.reduce((sum, p) => sum + p.positions.length / 3, 0)
    const positions = new Float32Array(vertices * 3)
    const index: number[] = []
    let at = 0
    for (const piece of group) {
      for (let i = 0; i < piece.positions.length; i++)
        positions[at * 3 + i] = (piece.positions[i] - middle[i % 3]) * scale
      for (const corner of piece.index) index.push(corner + at)
      at += piece.positions.length / 3
    }
    // Corners that were only apart for the texture or the shading are one.
    const loose = new BufferGeometry()
    loose.setAttribute('position', new BufferAttribute(positions, 3))
    loose.setIndex(index)
    const welded = mergeVertices(loose, 1e-5)
    const p = welded.attributes.position.array as Float32Array
    const n = p.length / 3
    const source = welded.index!.array
    const kept = n > 65536 ? new Uint32Array(source.length) : new Uint16Array(source.length)
    kept.set(source)
    const first = group[0]
    const motion: ModelMotion | undefined = first.motion && {
      ...first.motion,
      // A slide is a length, in the file's unit like everything else in it.
      amount: first.motion.type === 'slide' ? round4(first.motion.amount * scale) : first.motion.amount,
      pivot: first.motion.pivot.map((v, axis) => round4((v - middle[axis]) * scale)) as [number, number, number],
    }
    return {
      name,
      positions: p,
      index: kept,
      ...(motion && { motion }),
      ...(first.look && { look: first.look }),
      ...(first.color && { color: first.color }),
      ...(first.finish && { finish: first.finish }),
    }
  })
  // To the millimeter, which is how it is written in the config.
  const mm = (value: number) => Math.max(Math.round(value * scale * 1000) / 1000, 0.01)
  const size: [number, number, number] = [mm(max[0] - min[0]), mm(max[2] - min[2]), mm(max[1] - min[1])]
  const triangles = parts.reduce((sum, p) => sum + p.index.length / 3, 0)
  const tops = topsOf(pieces, (value, axis) => (value - middle[axis]) * scale)
  return { size, triangles, parts, tops }
}

// Into the card config and back. Each corner is three 16 bit numbers across
// the model's own box, which keeps a tenth of a millimeter on a meter wide
// piece in half the room a float takes, and the triangles index them in 16
// bits while there are few enough corners, 32 bits past that.

function toBase64(bytes: Uint8Array) {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[])
  return btoa(text)
}

function fromBase64(text: string) {
  const raw = atob(text)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function encodeShape(shape: Shape): ModelConfig['parts'] {
  const [w, d, h] = shape.size
  return shape.parts.map(part => {
    const q = new Uint16Array(part.positions.length)
    for (let i = 0; i < part.positions.length; i += 3) {
      q[i] = Math.round(Math.min(Math.max(part.positions[i] / w + 0.5, 0), 1) * 65535)
      q[i + 1] = Math.round(Math.min(Math.max(part.positions[i + 1] / h, 0), 1) * 65535)
      q[i + 2] = Math.round(Math.min(Math.max(part.positions[i + 2] / d + 0.5, 0), 1) * 65535)
    }
    return {
      name: part.name,
      vertices: toBase64(new Uint8Array(q.buffer)),
      triangles: toBase64(new Uint8Array(part.index.buffer, part.index.byteOffset, part.index.byteLength)),
      ...(part.motion && { motion: part.motion }),
      ...(part.look && { look: part.look }),
      ...(part.color && { color: part.color }),
      ...(part.finish && { finish: part.finish }),
    }
  })
}

// One stored part back as corners in meters, or null when what is stored
// does not add up to a shape.
function decodePart(part: ModelConfig['parts'][number], size: [number, number, number]): ShapePart | null {
  if (!part.vertices || !part.triangles) return null
  try {
    const raw = fromBase64(part.vertices)
    if (raw.length % 6 !== 0) return null
    const q = new Uint16Array(raw.buffer)
    const n = q.length / 3
    const bytes = fromBase64(part.triangles)
    const wide = n > 65536
    if (bytes.length % (wide ? 12 : 6) !== 0) return null
    const index = wide ? new Uint32Array(bytes.buffer) : new Uint16Array(bytes.buffer)
    for (let i = 0; i < index.length; i++) if (index[i] >= n) return null
    const [w, d, h] = size
    const positions = new Float32Array(q.length)
    for (let i = 0; i < q.length; i += 3) {
      positions[i] = (q[i] / 65535 - 0.5) * w
      positions[i + 1] = (q[i + 1] / 65535) * h
      positions[i + 2] = (q[i + 2] / 65535 - 0.5) * d
    }
    const motion = cleanMotion(part.motion)
    const look = cleanLook(part.look)
    return { name: part.name, positions, index, ...(motion && { motion }), ...(look && { look }) }
  } catch {
    return null
  }
}

export function decodeShape(model: ModelConfig): Shape {
  const parts = model.parts.map(p => decodePart(p, model.size)).filter((p): p is ShapePart => !!p)
  return {
    size: model.size,
    triangles: parts.reduce((sum, p) => sum + p.index.length / 3, 0),
    parts,
    tops: cleanTops(model.tops),
  }
}

// A part ready to draw, shaded round across soft edges and sharp across
// hard ones. Drawn shared by every piece placed from the model.
export function partGeometry(part: ShapePart) {
  const indexed = new BufferGeometry()
  indexed.setAttribute('position', new BufferAttribute(part.positions, 3))
  indexed.setIndex(new BufferAttribute(part.index, 1))
  const geometry = toCreasedNormals(indexed, CREASE)
  indexed.dispose()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}
