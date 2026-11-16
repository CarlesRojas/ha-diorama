import { balance } from '#/scene/pad.ts'
import { useThree, type RootState } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BackSide,
  DoubleSide,
  FrontSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshDepthMaterial,
  MeshDistanceMaterial,
  VSMShadowMap,
  WebGLRenderTarget,
  type Material,
  type MeshStandardMaterial,
  type Scene,
  type Side,
  type WebGLRenderer,
} from 'three'

// Switching a lamp on or off changes how many lights the scene has, and
// three builds a shader for every material with the count of each kind of
// light baked in. So the first frame after a switch built a new shader for
// every material in the flat, and for the two the shadow maps are drawn
// with, and linking them stalled the page for anything from a blink to over
// a second, longer on a phone. The lamp seemed to take its time.
//
// Instead a change is tried first: it is made, the shaders the scene would
// then need are asked for, and it is undone again, all before the next frame
// draws. The browser links the shaders in the background, and once they are
// ready the change is made for good, and the frame that follows finds
// everything built. A change that is asked for while another is being tried
// waits for the next round, so a room switching on a dozen lamps at once
// tries them together.
//
// Three can ask for the shaders of the things it draws, but not for the two
// it draws the shadow maps with: those are its own, and they are set up for
// each caster as the maps are drawn. So a stand in for each kind of caster
// is built here, carrying a copy of the shadow material set up the way three
// sets it, and those are asked for on top. They are keyed as three keys the
// shaders, so what is built here is what three will look for.

export type Change = {
  // Makes the change, so the scene's lights are what they will be.
  apply: () => void
  // Takes it back, leaving the scene as it was.
  revert: () => void
  // Makes it for good, once the shaders are ready.
  commit: () => void
  // Tried in a round of its own. For a change that is never made for good,
  // only tried for its shaders: with others it would have theirs built for
  // a scene they never see.
  alone?: boolean
}

type Queued = Change & { cancelled: boolean }

type Warmer = {
  pending: Map<object, Queued>
  flying: Map<object, Queued>
  busy: boolean
  // The shadow materials built so far, by the kind of caster they stand for.
  shadowMaterials: Map<string, [MeshDepthMaterial, MeshDistanceMaterial]>
  // The shadow maps are drawn into a render target, and the shaders are keyed
  // by whether one is bound, so one is bound while their shaders are asked
  // for.
  target: WebGLRenderTarget
  // Whether the scene itself is drawn into a buffer and finished from there,
  // in which case its shaders are keyed that way too.
  composed: boolean
}

const warmers = new WeakMap<WebGLRenderer, Warmer>()

function of(gl: WebGLRenderer): Warmer {
  let w = warmers.get(gl)
  if (!w) {
    w = {
      pending: new Map(),
      flying: new Map(),
      busy: false,
      shadowMaterials: new Map(),
      target: new WebGLRenderTarget(4, 4),
      composed: false,
    }
    warmers.set(gl, w)
  }
  return w
}

// What three turns a caster's own material into when drawing its shadow.
type Shadowed = Partial<
  Pick<
    MeshStandardMaterial,
    | 'side'
    | 'shadowSide'
    | 'map'
    | 'alphaMap'
    | 'alphaTest'
    | 'alphaToCoverage'
    | 'displacementMap'
    | 'displacementScale'
    | 'displacementBias'
    | 'wireframe'
  >
>

const shadowSide: Record<number, Side> = { [FrontSide]: BackSide, [BackSide]: FrontSide, [DoubleSide]: DoubleSide }

function shadowMaterials(w: Warmer, gl: WebGLRenderer, key: string, m: Shadowed) {
  let pair = w.shadowMaterials.get(key)
  if (!pair) {
    pair = [new MeshDepthMaterial(), new MeshDistanceMaterial()]
    w.shadowMaterials.set(key, pair)
  }
  for (const r of pair) {
    const side = m.side ?? FrontSide
    r.side = m.shadowSide ?? (gl.shadowMap.type === VSMShadowMap ? side : shadowSide[side])
    r.map = m.map ?? null
    r.alphaMap = m.alphaMap ?? null
    r.alphaTest = m.alphaToCoverage ? 0.5 : (m.alphaTest ?? 0)
    r.displacementMap = m.displacementMap ?? null
    r.displacementScale = m.displacementScale ?? 1
    r.displacementBias = m.displacementBias ?? 0
    // three sets this on both, though only the depth one declares it.
    ;(r as MeshDepthMaterial).wireframe = m.wireframe ?? false
  }
  return pair
}

// One stand in per kind of caster: what of it reaches the shadow shader is
// its geometry's attributes, whether it is instanced, and the few things
// three copies from its material.
function standIns(w: Warmer, gl: WebGLRenderer, scene: Scene): Group {
  const root = new Group()
  const seen = new Set<string>()
  scene.traverse(object => {
    if (!(object instanceof Mesh) || !object.castShadow) return
    const geometry = object.geometry
    const instanced = object instanceof InstancedMesh
    const shape = [
      instanced ? 1 : 0,
      instanced && object.instanceColor ? 1 : 0,
      Object.keys(geometry.attributes).sort().join(','),
      Object.keys(geometry.morphAttributes).sort().join(','),
    ].join('|')
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      const m = material as Shadowed
      const key = [
        shape,
        m.side ?? FrontSide,
        m.shadowSide ?? '',
        m.map?.id ?? '',
        m.alphaMap?.id ?? '',
        m.alphaToCoverage ? 0.5 : (m.alphaTest ?? 0),
        m.displacementMap?.id ?? '',
        m.wireframe ? 1 : 0,
      ].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      for (const shadowMaterial of shadowMaterials(w, gl, key, m)) {
        if (instanced) {
          const proxy = new InstancedMesh(geometry, shadowMaterial, 1)
          proxy.instanceColor = object.instanceColor
          root.add(proxy)
        } else root.add(new Mesh(geometry, shadowMaterial))
      }
    }
  })
  return root
}

async function flush(w: Warmer, get: () => RootState) {
  if (w.busy || w.pending.size === 0) return
  w.busy = true
  const batch = w.pending
  w.pending = new Map()
  if (batch.size > 1)
    for (const [key, change] of batch) {
      if (!change.alone) continue
      batch.delete(key)
      w.pending.set(key, change)
    }
  w.flying = batch
  const changes = [...batch.values()]
  const { gl, scene, camera } = get()
  let ready: Promise<unknown> = Promise.resolve()
  for (const c of changes) c.apply()
  try {
    // The dark lights that hold the counts to a step are part of what the
    // shaders are built for.
    balance(scene)
    // The shadow pass first, with a target bound as the maps have, then the
    // scene as it is drawn, which is into a buffer of its own when the frame
    // is finished from one. Both see the lights as the change leaves them.
    gl.setRenderTarget(w.target)
    const shadows = gl.compileAsync(standIns(w, gl, scene), camera, scene)
    if (!w.composed) gl.setRenderTarget(null)
    const drawn = gl.compileAsync(scene, camera)
    gl.setRenderTarget(null)
    ready = Promise.all([shadows, drawn])
  } catch (error) {
    console.warn('Diorama: could not build shaders ahead', error)
  } finally {
    for (let i = changes.length - 1; i >= 0; i--) changes[i].revert()
  }
  try {
    await ready
  } catch {
    // The change is made regardless; the frame builds what is missing.
  }
  w.flying = new Map()
  for (const c of changes) if (!c.cancelled) c.commit()
  w.busy = false
  void flush(w, get)
}

// Tells the warmer whether the scene is drawn into a buffer, as it is while
// the frame is finished by the effects, rather than straight to the screen.
export function setComposed(gl: WebGLRenderer, composed: boolean) {
  of(gl).composed = composed
}

// Asks for a change to the scene's lights to be tried before it is made. A
// key names what is changing, so a change asked for again while an earlier
// one for the same key waits takes its place, or, with `replace` off, is
// dropped. Returns a function that calls the change off: one still waiting
// is dropped, one being tried is not made for good.
export function warm(get: () => RootState, key: object, change: Change, replace = true) {
  const w = of(get().gl)
  const queued: Queued = { ...change, cancelled: false }
  const earlier = w.pending.get(key) ?? w.flying.get(key)
  if (earlier && !replace) return () => {}
  if (earlier) earlier.cancelled = true
  w.pending.delete(key)
  w.pending.set(key, queued)
  queueMicrotask(() => void flush(w, get))
  return () => {
    queued.cancelled = true
    if (w.pending.get(key) === queued) w.pending.delete(key)
  }
}

export function useWarm() {
  const get = useThree(state => state.get)
  return useCallback((key: object, change: Change, replace = true) => warm(get, key, change, replace), [get])
}

// Whether a light is to be shown: `target`, once the shaders for the scene
// with it shown, or hidden, are built. `set` shows or hides it, and is called
// on the way to try the change and to take it back. The light starts out as
// asked, since at mount the whole scene is built in one go anyway.
export function useWarmed(target: boolean, set: (on: boolean) => void): boolean {
  const [shown, setShown] = useState(target)
  const warmUp = useWarm()
  const key = useRef({})
  const latest = useRef(set)
  useLayoutEffect(() => {
    latest.current = set
  })
  useEffect(() => {
    if (shown === target) return
    return warmUp(key.current, {
      apply: () => latest.current(target),
      revert: () => latest.current(!target),
      commit: () => setShown(target),
    })
  }, [target, shown, warmUp])
  return shown
}

// How long after the scene changes its shaders are built ahead, so the
// models have loaded by then.
const AHEAD_OF_SHOWING_MS = 1200

// Builds, in the background, the shaders of whatever the scene holds but
// does not draw yet: the rest of a room's things a focused view leaves
// out, the signs that lead out of a room, which only show around it. Three
// builds a shader the first time it draws something, and with every lamp
// of the home in it a single new shader took most of a second on a tablet,
// so flying into a room stalled on its very first frame. Asked again
// whenever `key` changes, as the plan does.
export function Precompile({ watch }: { watch: unknown }) {
  const warmUp = useWarm()
  const key = useRef({})
  useEffect(() => {
    const timer = setTimeout(
      () =>
        warmUp(key.current, {
          apply: () => {},
          revert: () => {},
          commit: () => {},
          alone: true,
        }),
      AHEAD_OF_SHOWING_MS,
    )
    return () => clearTimeout(timer)
  }, [watch, warmUp])
  return null
}
