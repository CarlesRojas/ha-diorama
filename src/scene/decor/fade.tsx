import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Group, Material, Mesh, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three'

// A piece that fades away with height: whole at one height, gone at
// another, eased between the two. A flight of stairs to another floor shows
// only its own end on each floor, the foot downstairs and the top upstairs,
// and melts into the background toward the other one.

// Heights in meters, in the scene: whole at `from`, gone at `to`. Either
// way up, so a flight upstairs fades downward.
export type Fade = { from: number; to: number }

type Uniforms = { uDioFadeFrom: { value: number }; uDioFadeTo: { value: number } }

const PATCHED = 'dioFade'

// Has the material fade by the height of each point, in the world. Its own
// parts are drawn in its own material, so changing it touches nothing else.
function patch(material: Material, uniforms: Uniforms) {
  if (material.userData[PATCHED] === uniforms) return
  material.userData[PATCHED] = uniforms
  material.transparent = true
  const before = material.onBeforeCompile.bind(material)
  const key = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer: WebGLRenderer) => {
    before(shader, renderer)
    if (!shader.vertexShader.includes('#include <project_vertex>')) return
    if (!shader.fragmentShader.includes('#include <dithering_fragment>')) return
    shader.uniforms.uDioFadeFrom = uniforms.uDioFadeFrom
    shader.uniforms.uDioFadeTo = uniforms.uDioFadeTo
    shader.vertexShader = `varying float vDioFadeY;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 dioFadeAt = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        dioFadeAt = instanceMatrix * dioFadeAt;
      #endif
      vDioFadeY = (modelMatrix * dioFadeAt).y;`,
    )
    shader.fragmentShader =
      `uniform float uDioFadeFrom;\nuniform float uDioFadeTo;\nvarying float vDioFadeY;\n${shader.fragmentShader}`.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
      float dioFadeT = clamp((vDioFadeY - uDioFadeFrom) / (uDioFadeTo - uDioFadeFrom), 0.0, 1.0);
      gl_FragColor.a *= 1.0 - dioFadeT * dioFadeT * (3.0 - 2.0 * dioFadeT);`,
      )
  }
  material.customProgramCacheKey = () => `${key()}|dio-fade`
  material.needsUpdate = true
}

// Fades everything drawn inside it. The heights can change, as when the
// piece is resized, without building any shader again.
export function Faded({ fade, children }: { fade?: Fade; children: ReactNode }) {
  const group = useRef<Group>(null)
  const uniforms = useRef<Uniforms>({ uDioFadeFrom: { value: 0 }, uDioFadeTo: { value: 1 } })
  // Every render, since a part built since has a material of its own.
  useLayoutEffect(() => {
    if (!fade || !group.current) return
    uniforms.current.uDioFadeFrom.value = fade.from
    uniforms.current.uDioFadeTo.value = fade.to
    group.current.traverse(object => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        patch(material, uniforms.current)
      }
    })
  })
  return <group ref={group}>{children}</group>
}
