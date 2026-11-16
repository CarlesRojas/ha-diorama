import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { BufferGeometry, Mesh, Raycaster, type BufferAttribute, type InterleavedBufferAttribute, type Scene } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, type MeshBVH } from 'three-mesh-bvh'

// A press is looked for with rays, up to eighty of them when it lands near
// nothing, and every ray was tested against every triangle of every shape
// whose bounds it crossed. A room merged into one shape is tens of thousands
// of triangles, so a press on a tablet could take a second before anything
// answered. Each shape now gets a tree of boxes round its triangles, built
// in the background, and a ray only looks at the few triangles in the
// boxes it passes through. Until its tree is built a shape is tested the
// old way, so nothing is ever missed.

type Tree = BufferGeometry & { boundsTree?: MeshBVH }

// Shapes this small are as quick to test whole as through a tree.
const MIN_TRIANGLES = 64
// How long each slice of building may take before it gives the page back.
const SLICE_MS = 8
// How often the scene is looked over for shapes built or changed since.
const SWEEP_MS = 1500

// The version of the positions each tree was built from, so a shape edited
// in place has its tree built again rather than answering from the old one.
const builtFrom = new WeakMap<BufferGeometry, number>()
const queue = new Set<BufferGeometry>()
let working = false

function version(position?: BufferAttribute | InterleavedBufferAttribute) {
  if (!position) return -1
  return 'isInterleavedBufferAttribute' in position ? position.data.version : position.version
}

function triangles(geometry: BufferGeometry) {
  const count = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)
  return count / 3
}

// Whether a shape has a tree that still matches it. A stale one is dropped.
function current(geometry: Tree) {
  if (!geometry.boundsTree) return false
  if (builtFrom.get(geometry) === version(geometry.attributes.position)) return true
  geometry.disposeBoundsTree()
  return false
}

const idle: (cb: () => void) => void =
  typeof requestIdleCallback === 'function' ? cb => requestIdleCallback(cb, { timeout: 500 }) : cb => setTimeout(cb, 16)

function work() {
  working = true
  idle(() => {
    const start = performance.now()
    for (const geometry of queue) {
      queue.delete(geometry)
      const g = geometry as Tree
      if (!g.attributes.position || current(g)) continue
      try {
        g.computeBoundsTree()
        builtFrom.set(g, version(g.attributes.position))
      } catch {
        // A shape the tree cannot take is simply tested whole.
      }
      if (performance.now() - start > SLICE_MS) break
    }
    if (queue.size > 0) work()
    else working = false
  })
}

function want(geometry: BufferGeometry) {
  if (triangles(geometry) < MIN_TRIANGLES || current(geometry as Tree)) return
  queue.add(geometry)
  if (!working) work()
}

let installed = false
function install() {
  if (installed) return
  installed = true
  const proto = BufferGeometry.prototype as Tree & {
    computeBoundsTree: typeof computeBoundsTree
    disposeBoundsTree: typeof disposeBoundsTree
  }
  proto.computeBoundsTree = computeBoundsTree
  proto.disposeBoundsTree = disposeBoundsTree
  // Only the nearest point of each shape is ever read, and a tree finds
  // that one without looking at the rest.
  ;(Raycaster.prototype as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true
  Mesh.prototype.raycast = function (this: Mesh, raycaster, intersects) {
    const geometry = this.geometry as Tree
    // A tree that no longer matches its shape is never used.
    if (geometry.boundsTree && !current(geometry)) want(geometry)
    return acceleratedRaycast.call(this, raycaster, intersects)
  }
}

function sweep(scene: Scene) {
  scene.traverse(object => {
    const geometry = (object as Mesh).geometry
    if ((object as Mesh).isMesh && geometry?.isBufferGeometry) want(geometry)
  })
}

// Builds the trees for whatever is in the scene, a little at a time, and
// again for whatever is built or changed later.
export default function Bvh() {
  const scene = useThree(state => state.scene)
  useEffect(() => {
    install()
    sweep(scene)
    const id = setInterval(() => sweep(scene), SWEEP_MS)
    return () => clearInterval(id)
  }, [scene])
  return null
}
