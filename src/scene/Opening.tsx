import { surfacesReady } from '#/materials/textures.ts'
import { effectMaterials } from '#/scene/Effects.tsx'
import { showOnly } from '#/scene/focus.ts'
import { castAndReceive } from '#/scene/shadows.tsx'
import { warm } from '#/scene/warm.ts'
import { useThree, type RootState } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Scene,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type WebGLRenderer,
} from 'three'

// Three builds the shader of a material the first time it draws it, and
// waits for each one before it asks for the next. The whole home is new on
// the first frame, so that frame built every shader of it one after the
// other, a second and a half on a fast computer and several on a tablet,
// with the page frozen throughout.
//
// So the first frame waits. As soon as the home is built, every shader it
// needs is asked for at once, and the browser builds them side by side,
// away from the page, while workers paint the surfaces' patterns. Only when
// both are done is the first frame drawn, and it finds everything ready.
// The card opens sooner, and the page stays free while it does.

// Past this the first frame is drawn regardless, and builds what is left.
const MAX_WAIT_MS = 10000

const opening = new WeakSet<WebGLRenderer>()

// Whether the first frame is still waiting. Nothing is drawn until it is not.
export function isOpening(gl: WebGLRenderer) {
  return opening.has(gl)
}

// Asks for the shaders of the scene as a change leaves it, and settles once
// they are built.
function built(get: () => RootState, apply = () => {}, revert = () => {}) {
  return new Promise<void>(done => warm(get, {}, { apply, revert, commit: done, alone: true }))
}

// Asks for the shaders of the steps that finish the frame, see Effects.tsx,
// each on a triangle that covers the picture, as theirs do.
function effectsBuilt(gl: WebGLRenderer, camera: Camera) {
  const { buffered, screen } = effectMaterials(gl)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
  const sceneOf = (materials: Material[]) => {
    const scene = new Scene()
    for (const material of materials) {
      const mesh = new Mesh(geometry, material)
      mesh.frustumCulled = false
      scene.add(mesh)
    }
    return scene
  }
  const target = new WebGLRenderTarget(4, 4)
  const before = gl.getRenderTarget()
  let ready: Promise<unknown> = Promise.resolve()
  try {
    gl.setRenderTarget(target)
    const intoBuffers = gl.compileAsync(sceneOf(buffered), camera)
    gl.setRenderTarget(null)
    ready = Promise.all([intoBuffers, gl.compileAsync(sceneOf(screen), camera)])
  } catch (error) {
    console.warn('Diorama: could not build the effects ahead', error)
  } finally {
    gl.setRenderTarget(before)
  }
  return ready.finally(() => {
    geometry.dispose()
    target.dispose()
  })
}

// `focus` is the room the card opens on. The first frames fade from the
// whole home to it, so the shaders of both are needed.
export default function Opening({ focus }: { focus: string | null }) {
  const gl = useThree(state => state.gl)
  const get = useThree(state => state.get)
  // Held from the first render on, before any frame can be asked for.
  useState(() => opening.add(gl))
  // Only the room the card opened on counts.
  const [opensOn] = useState(focus)
  useEffect(() => {
    // Again here, for the effect run a second time in development.
    opening.add(gl)
    let over = false
    const open = () => {
      if (over) return
      over = true
      opening.delete(gl)
      get().invalidate()
    }
    const timer = setTimeout(open, MAX_WAIT_MS)
    // A turn later, so whatever the home's first effects set off is built.
    const start = setTimeout(() => {
      const scene = get().scene
      castAndReceive(scene)
      const shaders: Promise<unknown>[] = [built(get), effectsBuilt(gl, get().camera)]
      if (opensOn !== null)
        shaders.push(
          built(
            get,
            () => showOnly(scene, opensOn),
            () => showOnly(scene, null),
          ),
        )
      void Promise.all([...shaders, surfacesReady()]).then(open, open)
    })
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
      open()
    }
  }, [gl, get, opensOn])
  return null
}
