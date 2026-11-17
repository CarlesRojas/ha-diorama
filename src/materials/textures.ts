import BakeWorker from '#/materials/bake.worker.ts?worker&inline'
import { bake, FIELDS, paint, SIZE, type Baked, type SurfaceKind } from '#/materials/fields.ts'
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
} from 'three'

// Procedural surfaces, generated once and cached. Each material gives a light
// grayscale color map, so the item's color tints it, and a normal map built
// from a height field for relief under the lights.
//
// Working a pattern out takes a tenth of a second per kind on a computer and
// several times that on a tablet, and a home shows several kinds, so the card
// sat frozen for a good part of its opening while the floors were painted.
// The patterns are built by workers instead, beside the page, while the
// graphics card builds the shaders. Each map is there from the start, plain
// white and flat, and is filled in place when its pattern comes back. The
// card waits for them before it draws its first frame, see Opening.tsx.

export type { SurfaceKind }

export type Surface = {
  map: Texture
  normalMap: Texture
  roughness: number
  // How many times the tile fits in one meter.
  repeat: number
  // How much longer the tile is along u than along v. Floorboards use it to
  // run long down the room while staying narrow across it.
  stretch: number
  normalScale: number
  // Settles once both maps hold the pattern.
  ready: Promise<void>
  // Whether they do already.
  loaded: boolean
}

// Cached per kind and per intensity, since the color map is baked with it.
const cache = new Map<string, Surface>()

// A kind's pattern, which every intensity of it shares.
type Pattern = { baked: Baked | null; normalMap: DataTexture; ready: Promise<void> }
const patterns = new Map<SurfaceKind, Pattern>()

// A few workers, one pattern each at a time. A worker is let go of as soon
// as there is nothing left for it, since the patterns are asked for in one
// burst as the home is built and seldom after.
const WORKERS = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
type Job = { kind: SurfaceKind; done: (baked: Baked) => void }
const queue: Job[] = []
const free: Worker[] = []
let made = 0

// Where a worker's code comes from. The bundle carries it as text, and
// started from a blob, the way Vite does it, the browser held the page up
// for a sixth of a second while it registered the blob, during the busiest
// moment of the card's opening. From a data address it starts at once. Not
// every browser takes a worker from one, so a refusal falls back to the
// blob, and a refusal of that to building the patterns on the page.
type Source = 'data' | 'blob' | 'page'
let source: Source = typeof Worker === 'undefined' ? 'page' : 'data'

// Each worker's source, so several refused at once fall back only one step.
const startedFrom = new WeakMap<Worker, Source>()

function fallBack(from: Source) {
  if (source === from) source = from === 'data' ? 'blob' : 'page'
}

function onPage(job: Job) {
  setTimeout(() => job.done(bake(job.kind)))
}

// Vite's inline worker tries a blob first and takes a data address when it
// gets no blob address, so it is given none for a moment.
function fromData() {
  const objectUrl = URL.createObjectURL
  URL.createObjectURL = () => ''
  try {
    return new BakeWorker()
  } finally {
    URL.createObjectURL = objectUrl
  }
}

function spawn(): Worker | null {
  while (source !== 'page') {
    try {
      const worker = source === 'data' ? fromData() : new BakeWorker()
      startedFrom.set(worker, source)
      made++
      return worker
    } catch {
      fallBack(source)
    }
  }
  return null
}

function pump() {
  while (queue.length > 0) {
    if (source === 'page') {
      onPage(queue.shift()!)
      continue
    }
    const worker = free.pop() ?? (made < WORKERS ? spawn() : null)
    // Every worker busy, or none to be had, which leaves the page.
    if (!worker) {
      if (made >= WORKERS) return
      continue
    }
    const job = queue.shift()!
    worker.onmessage = (event: MessageEvent<Baked>) => {
      job.done(event.data)
      if (queue.length > 0) free.push(worker)
      else {
        worker.terminate()
        made--
      }
      pump()
    }
    // A worker the browser would not start says so here, after the fact.
    // Its job goes back in line for the next way of starting one.
    worker.onerror = event => {
      event.preventDefault()
      worker.terminate()
      made--
      fallBack(startedFrom.get(worker) ?? source)
      queue.unshift(job)
      pump()
    }
    worker.postMessage(job.kind)
  }
}

function pattern(kind: SurfaceKind): Pattern {
  const cached = patterns.get(kind)
  if (cached) return cached
  // Flat until the pattern comes: every normal straight up.
  const data = new Uint8Array(SIZE * SIZE * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 128
    data[i + 1] = 128
    data[i + 2] = 255
    data[i + 3] = 255
  }
  const normalMap = new DataTexture(data, SIZE, SIZE, RGBAFormat)
  normalMap.wrapS = normalMap.wrapT = RepeatWrapping
  // A data texture comes with no mipmaps, which makes a floor seen at a
  // grazing angle crawl and its lines break up.
  normalMap.generateMipmaps = true
  normalMap.minFilter = LinearMipmapLinearFilter
  normalMap.needsUpdate = true
  const out: Pattern = { baked: null, normalMap, ready: Promise.resolve() }
  out.ready = new Promise<Baked>(done => {
    queue.push({ kind, done })
    pump()
  }).then(baked => {
    data.set(baked.normal)
    normalMap.needsUpdate = true
    out.baked = baked
  })
  patterns.set(kind, out)
  return out
}

// How a surface catches the light, without building its pattern. Decorations
// are painted plain, so they take this and no maps: a metal fitting still
// reads as metal next to a chalky one, with nothing drawn on either.
export function surfaceRoughness(kind: SurfaceKind) {
  return FIELDS[kind]?.roughness ?? 0.9
}

// `intensity` scales how much the pattern shows: 0 is a plain tint, 1 is the
// surface as designed, 2 is twice the contrast and relief. The color map is
// baked with it, so it is quantized and cached per step.
export function surface(kind: SurfaceKind, intensity = 1): Surface {
  const k = Math.min(Math.max(Math.round(intensity * 20) / 20, 0), 3)
  const key = `${kind}@${k}`
  const cached = cache.get(key)
  if (cached) return cached
  const spec = FIELDS[kind]
  const p = pattern(kind)
  // Plain white until the pattern comes, which is how the surface looks at
  // no intensity at all.
  const data = new Uint8Array(SIZE * SIZE * 4).fill(255)
  const map = new DataTexture(data, SIZE, SIZE, RGBAFormat)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.magFilter = LinearFilter
  map.minFilter = LinearMipmapLinearFilter
  map.generateMipmaps = true
  map.needsUpdate = true

  const out: Surface = {
    map,
    normalMap: p.normalMap,
    roughness: spec.roughness,
    repeat: spec.repeat,
    stretch: spec.stretch ?? 1,
    normalScale: spec.normalScale * k,
    ready: Promise.resolve(),
    loaded: false,
  }
  const fill = (baked: Baked) => {
    paint(baked.light, k, data)
    map.needsUpdate = true
    out.loaded = true
  }
  if (p.baked) fill(p.baked)
  else out.ready = p.ready.then(() => fill(p.baked!))
  cache.set(key, out)
  return out
}

// Settles once every surface asked for so far holds its pattern.
export async function surfacesReady() {
  await Promise.all([...cache.values()].map(s => s.ready))
}
