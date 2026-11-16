import { flights } from '#/scene/flights.ts'
import { due } from '#/scene/pace.ts'
import { coarseOnly } from '#/scene/device.ts'
import { EDITOR_SELECTED_COLOR } from '#/theme.ts'
import { FOCUS_FADE_S } from '#/constants.ts'
import { redrawShadows, showOnly } from '#/scene/focus.ts'
import { setComposed } from '#/scene/warm.ts'
import { useFrame, useThree } from '@react-three/fiber'
import { N8AOPostPass } from 'n8ao'
import {
  EffectComposer,
  EffectPass,
  KernelSize,
  OutlineEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing'
import { useEffect, useRef } from 'react'
import {
  Color,
  ConstantAlphaFactor,
  CustomBlending,
  HalfFloatType,
  OneMinusConstantAlphaFactor,
  Mesh,
  type Material,
  type Object3D,
} from 'three'

// The frame is drawn into a buffer and finished from there, in a few steps:
//
// Ambient occlusion darkens where things meet, the foot of a wall, under a
// sofa, the corner of a shelf, which is the shading a small model most
// misses. Without it the flat reads as cut-outs standing on a floor.
//
// Tone mapping then brings the range of light down to what the screen can
// show. Three applied the same filmic curve on its own when it drew to the
// screen; drawing into a buffer turns that off, so it is done here.
//
// Drawing into a buffer loses the antialiasing the screen gave for free, so
// edges are smoothed again at the end.
//
// In the editor, whatever is picked is traced in blue, the 3D version of the
// blue the plan draws it in. The edge is the object's own silhouette, so a
// sofa is outlined as a sofa rather than as the box around it, and where
// something stands in front of it the edge carries on, fainter.
//
// In the card, a room that is focused stands alone, and the rest of the home
// fades away around it, or the room that stood alone before it does, for as
// long as the camera takes to fly there. Fading the things themselves would make every
// material see through, which is a shader of its own for each, built on the
// first fade while the card stalls. So the fade is of the finished picture
// instead: for as long as it lasts the frame is drawn twice, the whole home
// and then the room alone laid over it, more and more of it. Either picture
// is drawn with the shaders the scene already has.

// How far the occlusion reaches, in meters, and how much it darkens. A
// flat is about ten meters across, so the reach is a fraction of one.
const AO_RADIUS_M = 0.35
const AO_FALLOFF = 1
const AO_INTENSITY = 2.5
// The outline's thickness and the edge where something stands in front of
// the picked one.
const OUTLINE_STRENGTH = 2.5
const OUTLINE_HIDDEN_SHARE = 0.25

// The meshes that draw a picked object. The outline only takes in what is
// added to it, not the parts under it, and a piece is a group of parts.
// Steam, a glow and the like are left out, so the edge is of the piece.
function parts(object: Object3D) {
  const found: Mesh[] = []
  object.traverseVisible(part => {
    if (!(part instanceof Mesh)) return
    const materials = Array.isArray(part.material) ? part.material : [part.material]
    if (materials.every(material => material.depthWrite)) found.push(part)
  })
  return found
}

type Props = {
  // The name of the object to outline, as the scene gives it, `null` for
  // none. The card never passes one, and gets no outline pass at all.
  selected?: string | null
  // The room that stands alone, the rest of the home faded away. The editor
  // never passes one.
  focus?: string | null
}

type Pipeline = {
  composer: EffectComposer
  outline: OutlineEffect | null
  // What lays the finished picture on the screen, and how much of what is
  // already there it replaces: all of it, but for the second picture of a
  // fade.
  paint: Material
}

export default function Effects({ selected, focus = null }: Props) {
  const gl = useThree(state => state.gl)
  const scene = useThree(state => state.scene)
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  const dpr = useThree(state => state.viewport.dpr)
  const invalidate = useThree(state => state.invalidate)

  // The picked object is found by name, and found again whenever the one in
  // hand has left the scene, which happens when a model is rebuilt.
  const found = useRef<Object3D | null>(null)
  // Kept in a ref rather than memoised: the passes are objects that are
  // changed in place every frame, which is what refs are for.
  const pipeline = useRef<Pipeline | null>(null)
  const outlined = selected !== undefined
  useEffect(() => {
    // Half float, so the scene keeps its range until it is tone mapped.
    const composer = new EffectComposer(gl, { frameBufferType: HalfFloatType })
    composer.addPass(new RenderPass(scene, camera))
    // A phone or a tablet gets the occlusion at half resolution and with
    // fewer samples.
    const ao = new N8AOPostPass(scene, camera)
    ao.setQualityMode(coarseOnly() ? 'Low' : 'Medium')
    ao.configuration.halfRes = coarseOnly()
    ao.configuration.aoRadius = AO_RADIUS_M
    ao.configuration.distanceFalloff = AO_FALLOFF
    ao.configuration.intensity = AO_INTENSITY
    composer.addPass(ao)
    let outline: OutlineEffect | null = null
    if (outlined) {
      const blue = new Color(EDITOR_SELECTED_COLOR)
      outline = new OutlineEffect(scene, camera, {
        edgeStrength: OUTLINE_STRENGTH,
        visibleEdgeColor: blue.getHex(),
        hiddenEdgeColor: blue.clone().multiplyScalar(OUTLINE_HIDDEN_SHARE).getHex(),
        blur: true,
        kernelSize: KernelSize.SMALL,
        xRay: true,
        multisampling: 4,
      })
    }
    const last = new EffectPass(
      camera,
      ...(outline ? [outline] : []),
      new SMAAEffect({ preset: SMAAPreset.HIGH }),
      new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
    )
    // The picture replaces a share of what the screen holds. The share is
    // all of it but during a fade, and it is set up this way from the start
    // so the fade changes a number and not the shader.
    const paint = last.fullscreenMaterial
    paint.blending = CustomBlending
    paint.blendSrc = ConstantAlphaFactor
    paint.blendDst = OneMinusConstantAlphaFactor
    paint.blendAlpha = 1
    // Laid over what is there, the screen must not be cleared first.
    const draw = last.render.bind(last)
    last.render = (...args: Parameters<EffectPass['render']>) => {
      const renderer = args[0]
      const clears = renderer.autoClear
      if (paint.blendAlpha < 1) renderer.autoClear = false
      draw(...args)
      renderer.autoClear = clears
    }
    composer.addPass(last)
    pipeline.current = { composer, outline, paint }
    found.current = null
    // The shaders the scene needs are now the ones for drawing into a
    // buffer, and the ones built ahead of a light change must match.
    setComposed(gl, true)
    return () => {
      setComposed(gl, false)
      pipeline.current = null
      // The composer disposes of its passes, and they of their effects.
      composer.dispose()
    }
  }, [gl, scene, camera, outlined])

  useEffect(() => {
    // The composer sizes its buffers from the canvas, which follows the
    // pixel ratio, and this only tells it the canvas has changed.
    pipeline.current?.composer.setSize(size.width, size.height, false)
  }, [gl, scene, camera, outlined, size.width, size.height, dpr])

  // Frames are drawn on request, and a new pick or a new size is one.
  useEffect(() => {
    invalidate()
  }, [selected, focus, size.width, size.height, dpr, invalidate])

  // The fade from one picture to the next: the room that stood alone before
  // and the one that does now, null for the whole home, how far the fade has
  // come, 0 to 1, and how long it takes. Then the room the scene is cut down
  // to right now and the one the shadows were last drawn for.
  const from = useRef<string | null>(null)
  const to = useRef<string | null>(null)
  const faded = useRef(1)
  const span = useRef(FOCUS_FADE_S)
  const cut = useRef<string | null>(null)
  const shaded = useRef<string | null>(null)
  // The whole home is back before the scene goes, and before the pieces are
  // merged again.
  useEffect(
    () => () => {
      showOnly(scene, null)
      cut.current = null
    },
    [scene],
  )

  useFrame((state, delta) => {
    const run = pipeline.current
    if (!run) return
    if (run.outline) {
      const held = found.current
      const selection = run.outline.selection
      if (!selected) {
        if (held) selection.clear()
        found.current = null
      } else {
        if (!held || held.name !== selected || !held.parent) found.current = scene.getObjectByName(selected) ?? null
        // Again on every frame, for parts built or shown since.
        const now = found.current ? parts(found.current) : []
        if (now.length !== selection.size || now.some(part => !selection.has(part))) {
          selection.clear()
          for (const part of now) selection.add(part)
        }
      }
    }
    const cutTo = (room: string | null) => {
      // Again on every frame a room stands alone, for parts built since.
      if (room !== null || cut.current !== null) showOnly(scene, room)
      cut.current = room
    }
    // Only the picture that comes draws the shadows, once, for the room it
    // shows. The one that goes is drawn with the same maps. Each picture
    // drawing its own had every map, the sun's and every lamp's six sides,
    // drawn twice over on every frame of the fade.
    const draw = (room: string | null, share: number, shade: boolean) => {
      cutTo(room)
      if (shade && shaded.current !== room) {
        redrawShadows(scene)
        shaded.current = room
      }
      run.paint.blendAlpha = share
      run.composer.render(delta)
    }
    if (focus !== to.current) {
      from.current = to.current
      to.current = focus
      faded.current = 0
      // The fade lasts as long as the flight that takes the camera there.
      const flight = flights.get(camera)?.current
      span.current = flight?.duration ?? FOCUS_FADE_S
    }
    if (faded.current < 1) {
      // A frame after a long rest reports the whole rest as its time.
      faded.current = Math.min(1, faded.current + Math.min(delta, 0.05) / span.current)
      invalidate()
    }
    // A tick between two frames is left undrawn, with the next one asked
    // for, so what changed on it is drawn on the one after.
    if (!due(state.clock)) {
      invalidate()
      return
    }
    const t = faded.current
    if (t === 1) draw(to.current, 1, true)
    else {
      // The one picture goes as the other comes, and the one that comes is
      // drawn last, so it is the one that takes presses from the start.
      draw(from.current, 1, false)
      draw(to.current, t * t * (3 - 2 * t), true)
      run.paint.blendAlpha = 1
    }
    // A priority above zero takes the drawing over from the default loop,
    // which is what lets the composer be the one to draw the frame.
  }, 1)

  return null
}
