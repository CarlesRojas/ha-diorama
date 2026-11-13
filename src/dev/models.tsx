// Imported models with made up devices, to see what their tagged parts do
// without Home Assistant. Served by the dev server, never built into the
// card:
//
//   http://localhost:5173/src/dev/models.html?glb=/src/dev/test-models/lamp.glb,/src/dev/test-models/chest.glb
//
// Each file is read the way Import a model reads it and stood in a row in
// one room, bound to a made up device of the kind it prefers: a light for a
// model that glows, a cover for one that opens, a fan for one that spins, a
// switch otherwise. A click on a piece flips its device. Query parameters:
// `on=1` starts every device on, `level=0.5` sets their percentage, `sun=-10`
// puts the sun at that elevation so a glow can be seen at night, `editor`
// shows the editor instead of the card, `camera=x,y,z,tx,ty,tz` sets the
// view, and `stretch=1.5,1,1` stretches every piece along its width, depth
// and height, to see that a hinge stays a hinge on a stretched model, and
// `ride=1` stands a table lamp on every top of a model that has any, to see
// that each one is where its part is. `mount=wall` hangs every model on the
// back wall.
import { modelPreferredDomains } from '#/decoration/modelTags.ts'
import { encodeShape, fetchGltf, shapeOf } from '#/scene/decor/modelShape.ts'
import type { CardConfig, EntityState, HomeAssistant, ModelConfig } from '#/types.ts'

await import('#/main.tsx')

const params = new URLSearchParams(location.search)
const dark: Record<string, string> = {
  '--primary-text-color': '#e1e1e1',
  '--secondary-text-color': '#9b9b9b',
  '--card-background-color': '#1c1c1c',
  '--secondary-background-color': '#202020',
  '--divider-color': 'rgba(225, 225, 225, 0.12)',
  '--primary-background-color': '#111111',
}
for (const [name, value] of Object.entries(dark)) document.documentElement.style.setProperty(name, value)
document.body.style.background = 'linear-gradient(160deg,#2b2f3a,#151821 60%,#0e0f14) fixed'

const files = (params.get('glb') ?? '').split(',').filter(Boolean)
const on = params.get('on') === '1'
const level = Math.min(Math.max(Number(params.get('level') ?? 1), 0), 1)
const now = new Date().toISOString()
const states: Record<string, EntityState> = {}
const models: Record<string, ModelConfig> = {}
const config: CardConfig = {
  type: 'custom:diorama-card',
  aspect_ratio: `${innerWidth} / ${innerHeight}`,
  rooms: [],
  decorations: [],
  devices: [],
  models,
}

let x = 0.6
for (const [i, url] of files.entries()) {
  const shape = shapeOf(await fetchGltf(url))
  const id = `m${i}`
  const name = decodeURIComponent(url.split('/').pop() ?? id).replace(/\.glb$/i, '')
  models[id] = {
    name,
    size: shape.size,
    triangles: shape.triangles,
    parts: encodeShape(shape),
    ...(shape.tops.length > 0 && { tops: shape.tops }),
    ...(params.get('mount') === 'wall' && { mount: 'wall' }),
  }
  const hung = models[id].mount === 'wall'
  const y = hung ? 2.4 : 1.2
  const domain = modelPreferredDomains(models[id].parts)[0] ?? 'switch'
  const entity = `${domain}.${id}`
  const attributes: Record<string, unknown> = { friendly_name: name }
  if (domain === 'light') {
    attributes.supported_color_modes = ['brightness']
    if (on) attributes.brightness = Math.round(level * 255)
  }
  if (domain === 'cover') attributes.current_position = on ? Math.round(level * 100) : 0
  if (domain === 'fan') attributes.percentage = on ? Math.round(level * 100) : 0
  states[entity] = {
    entity_id: entity,
    state: domain === 'cover' ? (on ? 'open' : 'closed') : on ? 'on' : 'off',
    attributes,
    last_changed: now,
    last_updated: now,
  }
  const stretch = (params.get('stretch') ?? '1,1,1').split(',').map(Number)
  const [sw, sd, sh] = shape.size.map((v, k) => Math.round(v * (stretch[k] || 1) * 100) / 100)
  const w = sw
  x += w / 2
  config.decorations!.push({
    id: `piece_${id}`,
    kind: `model:${id}`,
    room: 'room',
    position: [x, y],
    rotation: 0,
    ...(params.has('stretch') && { params: { width: sw, depth: sd, height: sh } }),
  })
  config.devices!.push({ entity_id: entity, room: 'room', position: [x, y], decorations: [`piece_${id}`] })
  // A lamp on each top, side by side, the highest top's naming no level.
  if (params.get('ride') === '1')
    for (const [n, top] of shape.tops.entries()) {
      const along = top.x + ((n + 0.5) / shape.tops.length - 0.5) * top.w * 0.6
      config.decorations!.push({
        id: `rider_${id}_${n}`,
        kind: 'light_table',
        room: 'room',
        position: [x + along * (sw / shape.size[0]), y - (hung ? sd / 2 : 0) - top.z * (sd / shape.size[1])],
        on: `piece_${id}`,
        ...(n < shape.tops.length - 1 && { level: n }),
        params: { size: 0.14, height: 0.22 },
      })
    }
  x += w / 2 + 0.5
}
const width = Math.max(x + 0.1, 2.5)
config.rooms = [
  {
    id: 'room',
    name: 'Models',
    points: [
      [0, 0],
      [width, 0],
      [width, 2.4],
      [0, 2.4],
    ],
  },
]
const camera = params.get('camera')?.split(',').map(Number)
if (camera?.length === 6)
  config.camera = { position: [camera[0], camera[1], camera[2]], target: [camera[3], camera[4], camera[5]] }
const sun = Number(params.get('sun'))
if (params.has('sun') && Number.isFinite(sun))
  states['sun.sun'] = {
    entity_id: 'sun.sun',
    state: sun > 0 ? 'above_horizon' : 'below_horizon',
    attributes: { elevation: sun },
    last_changed: now,
    last_updated: now,
  }

function flip(entity: EntityState) {
  const domain = entity.entity_id.split('.')[0]
  const a = entity.attributes
  if (domain === 'cover') {
    entity.state = entity.state === 'open' ? 'closed' : 'open'
    a.current_position = entity.state === 'open' ? 100 : 0
    return
  }
  entity.state = entity.state === 'on' ? 'off' : 'on'
  if (domain === 'light') a.brightness = entity.state === 'on' ? 255 : undefined
  if (domain === 'fan') a.percentage = entity.state === 'on' ? 100 : 0
}

type CardElement = HTMLElement & { setConfig: (c: CardConfig) => void; hass: HomeAssistant }
const element = document.createElement(params.has('editor') ? 'diorama-card-editor' : 'diorama-card') as CardElement
const hass = (): HomeAssistant => ({
  states: structuredClone(states),
  areas: {},
  callService: (_domain, _service, data) => {
    const id = data?.entity_id
    if (typeof id === 'string' && states[id]) {
      flip(states[id])
      element.hass = hass()
    }
    return Promise.resolve()
  },
  themes: { darkMode: true },
})
element.style.cssText = 'display:block;width:100vw;height:100vh'
element.setConfig(config)
element.hass = hass()
document.body.appendChild(element)
