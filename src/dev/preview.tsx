// A full window view of one decoration model, for checking a model up close
// while working on it. Served by the dev server, never built into the card:
//
//   http://localhost:5173/src/dev/preview.html?kind=light_pendant&variant=nagoya
//
// kind and variant pick the model, on=1 switches it on in a dark room, and
// any other parameter is passed to the model as its own, so &size=0.3 or
// &cord=0.5 set those. yaw turns the view round it by that many degrees, so
// &yaw=90 looks at it from its right side, and pitch raises the view by that
// many degrees. stand puts it on a piece of that kind at its defaults, so
// &stand=kitchen_counter shows a sink let into a counter, and at moves it
// that far along the piece. text is the state in words, as &text=heat, and
// moisture a plant's soil moisture sensor reading, as &moisture=10, and
// power what a smart plug's power sensor reads in watts, as &power=42.
// grow=width shows the model twice, as it is and with that parameter at its
// largest, for checking that everything in it grows along. Drag to turn it,
// scroll to zoom.
import { decorationKind, mountHeight } from '#/decoration/catalog.ts'
import { deskRise } from '#/scene/decor/state.ts'
import DecorationModel from '#/scene/decor/DecorationModel.tsx'
import { CEILING_HEIGHT_M, LIGHT_GLOW_COLOR } from '#/theme.ts'
import type { DecorationConfig } from '#/types.ts'
import { Bounds, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { createRoot } from 'react-dom/client'
import { Color } from 'three'

const query = new URLSearchParams(location.search)
const on = query.get('on') === '1'
// The room dark, as with the item on, unless told otherwise.
const dark = query.has('dark') ? query.get('dark') === '1' : on
// Drawn twice side by side, off on the left and on on the right, to see
// how far apart the two states read.
const compare = query.get('compare') === '1'
const kind = decorationKind(query.get('kind') ?? 'light_pendant')
const params: Record<string, number> = {}
// A value starting with # colors the slot it names, which helps to read a
// dark model.
const colors: Record<string, string> = {}
for (const [key, value] of query) {
  if (
    [
      'kind',
      'variant',
      'on',
      'dark',
      'compare',
      'spread',
      'yaw',
      'pitch',
      'stand',
      'at',
      'text',
      'moisture',
      'power',
    ].includes(key)
  )
    continue
  if (value.startsWith('#')) colors[key] = value
  else if (Number.isFinite(Number(value))) params[key] = Number(value)
}
const stand = query.get('stand')
const support: DecorationConfig | null = stand
  ? { id: 'support', kind: stand, room: 'preview', position: [0, 0] }
  : null
const item: DecorationConfig = {
  id: 'preview',
  kind: kind?.id ?? 'light_pendant',
  variant: query.get('variant') ?? undefined,
  room: 'preview',
  position: [Number(query.get('at')) || 0, 0],
  on: support?.id,
  params,
  colors,
}
const all = support ? [support, item] : [item]
// The same item with one parameter turned all the way up.
const grow = query.get('grow')
const grown: DecorationConfig | null =
  grow && kind ? { ...item, params: { ...params, [grow]: kind.params.find(x => x.id === grow)?.max ?? 0 } } : null
const yaw = (Number(query.get('yaw')) || 0) * (Math.PI / 180)
// How far above the model the camera looks down from, for flat things like
// a hob.
const pitch = (Number(query.get('pitch')) || 5.7) * (Math.PI / 180)
const glow = new Color(LIGHT_GLOW_COLOR)
// Ceiling items hang from a ceiling brought down near the floor, so a long
// cord does not push the model out of frame.
const lift = support ? 0 : kind?.mount === 'ceiling' ? -(CEILING_HEIGHT_M - 1.4) : kind ? -mountHeight(kind, params) : 0

// How far apart the two copies stand when comparing.
const spread = Number(query.get('spread')) || 1.2

const root = document.createElement('div')
root.style.cssText = `width:100vw;height:100vh;background:${dark ? '#2a2a2e' : '#3a3a40'}`
document.body.appendChild(root)
createRoot(root).render(
  kind ? (
    <Canvas
      shadows
      dpr={2}
      camera={{
        fov: 30,
        position: [3 * Math.sin(yaw) * Math.cos(pitch), 3 * Math.sin(pitch), 3 * Math.cos(yaw) * Math.cos(pitch)],
      }}
    >
      <ambientLight intensity={dark ? 0.15 : 0.7} />
      <directionalLight position={[3, 6, 4]} intensity={dark ? 0.1 : 1.2} />
      <Bounds fit clip observe margin={1.15} maxDuration={0}>
        {(compare || grown ? [false, true] : [on]).map((state, i, sides) => (
          <group key={i} position={[sides.length > 1 ? (i - 0.5) * spread : 0, lift, 0]}>
            {(grown && state ? [support, grown].filter(x => x !== null) : all).map(d => (
              <DecorationModel
                key={d.id}
                item={d}
                all={grown && state ? [support, grown].filter(x => x !== null) : all}
                state={{
                  on: grown ? on : state,
                  level: (grown ? on : state) ? 1 : 0,
                  levels: { open: Number(query.get('open') ?? 1), tilt: Number(query.get('tilt') ?? 0) },
                  glow: [glow.r, glow.g, glow.b],
                  text: query.get('text') ?? undefined,
                  moisture: query.has('moisture') ? Number(query.get('moisture')) : undefined,
                  power: query.has('power') ? Number(query.get('power')) : undefined,
                }}
                // Whatever stands on a standing desk goes up with it.
                raise={
                  d.on && stand === 'desk'
                    ? deskRise({ on: state, level: state ? 1 : 0, levels: {}, glow: [1, 1, 1] })
                    : 0
                }
              />
            ))}
          </group>
        ))}
      </Bounds>
      <OrbitControls makeDefault />
    </Canvas>
  ) : (
    <p style={{ padding: 16, fontFamily: 'sans-serif' }}>No kind called {query.get('kind')}.</p>
  ),
)
