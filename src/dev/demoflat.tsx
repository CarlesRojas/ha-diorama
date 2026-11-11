// The demo flat with made up devices, without Home Assistant, for the
// README's screenshots. Served by the dev server, never built into the card:
//
//   http://localhost:5173/src/dev/demoflat.html
//
// Query parameters: `flip=light.bedroom,cover.hall_blind` starts those
// entities on, open or unlocked; `camera=x,y,z,tx,ty,tz` overrides the
// opening view; `sun=6` puts the sun at that elevation in degrees, so the
// room can be shot at dusk; `light` uses Home Assistant's light theme colors
// over a pale page, where it opens on the dark ones over a dark gradient;
// `editor` shows the editor instead of the card; `merge=0` draws every piece
// on its own, to compare against the merged room; `views` gives every room
// a view from above it, where it would have the one worked out for it;
// `fps` counts the frames drawn each second in a corner;
// `first=device` has a click on a device act on it from any room;
// `mobile=1:1` gives the card that aspect ratio while it is narrow, and 16:9
// otherwise; `frame=living,kitchen` has the view of the whole home zoom in
// on those rooms. `single` leaves out the first floor and the floors with it,
// so the card is one with no floors, as every card was before them.
// A click on a piece flips its entity, the way Home Assistant would. A cover
// sent to a position runs there at a tenth of its travel every half second.
import { setMerging } from '#/scene/Merged.tsx'
import type { CardConfig, HomeAssistant } from '#/types.ts'
import { DEMO_AREAS, DEMO_ENTITIES, DEMO_FLAT, DEMO_STATES, flip } from '../../scripts/demoflat.plan.ts'

await import('#/main.tsx')

const params = new URLSearchParams(location.search)
if (params.has('fps')) (await import('./fps.ts')).showFps()
if (params.get('merge') === '0') setMerging(false)
const light = params.has('light')
if (!light) {
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
}
const states = structuredClone(DEMO_STATES)
for (const id of (params.get('flip') ?? '').split(',')) if (states[id]) flip(states[id])
const sun = Number(params.get('sun'))
if (params.has('sun') && Number.isFinite(sun)) {
  const now = new Date().toISOString()
  states['sun.sun'] = {
    entity_id: 'sun.sun',
    state: sun > 0 ? 'above_horizon' : 'below_horizon',
    attributes: { elevation: sun },
    last_changed: now,
    last_updated: now,
  }
}

// The side panel is built from Home Assistant's own cards, which only exist
// inside Home Assistant, so the page draws the diorama on its own.
const { side_panel: _, ...flat } = DEMO_FLAT
const config: CardConfig = { ...flat, aspect_ratio: `${innerWidth} / ${innerHeight}` }
const camera = params.get('camera')?.split(',').map(Number)
if (camera?.length === 6) {
  config.camera = { position: [camera[0], camera[1], camera[2]], target: [camera[3], camera[4], camera[5]] }
}
if (params.has('views')) {
  config.rooms = config.rooms?.map(room => {
    const x = room.points.reduce((sum, p) => sum + p[0], 0) / room.points.length
    const y = room.points.reduce((sum, p) => sum + p[1], 0) / room.points.length
    return { ...room, camera: { position: [x + 2, 7, -y + 5], target: [x, 0, -y] } }
  })
}
const mobile = params.get('mobile')
if (mobile) {
  config.aspect_ratio = '16:9'
  config.aspect_ratio_mobile = mobile
}
const frame = params.get('frame')
if (frame) config.frame_rooms = frame.split(',')
if (params.get('first') === 'device') config.first_click = 'device'
if (params.has('single')) {
  const kept = new Set(config.rooms?.filter(room => room.floor_id !== 'first').map(room => room.id))
  config.rooms = config.rooms?.filter(room => kept.has(room.id)).map(({ floor_id: _floor, ...room }) => room)
  config.decorations = config.decorations?.filter(item => kept.has(item.room))
  config.devices = config.devices?.filter(device => kept.has(device.room))
  delete config.floors
}

type CardElement = HTMLElement & { setConfig: (c: CardConfig) => void; hass: HomeAssistant }
const element = document.createElement(params.has('editor') ? 'diorama-card-editor' : 'diorama-card') as CardElement
const hass = (): HomeAssistant => ({
  states: structuredClone(states),
  areas: DEMO_AREAS,
  entities: DEMO_ENTITIES,
  callService: (_domain, service, data) => {
    const id = data?.entity_id
    if (service === 'set_cover_position' && typeof id === 'string' && states[id]) {
      run(id, Number(data?.position))
      return Promise.resolve()
    }
    if (typeof id === 'string' && states[id]) {
      flip(states[id])
      element.hass = hass()
    }
    return Promise.resolve()
  },
  themes: { darkMode: !light },
})
const runs = new Map<string, ReturnType<typeof setInterval>>()
// Where each cover really is while it runs, apart from what it reports.
const reals = new Map<string, number>()
// Like a cover made from a template, one sent somewhere first reports that
// place as it starts, then where it really is.
function run(id: string, to: number) {
  clearInterval(runs.get(id))
  const entity = states[id]
  let at = reals.get(id) ?? Number(entity.attributes.current_position ?? 0)
  if (at !== to) {
    entity.attributes.current_position = to
    entity.state = to > at ? 'opening' : 'closing'
    element.hass = hass()
  }
  const step = () => {
    const next = at < to ? Math.min(at + 10, to) : Math.max(at - 10, to)
    entity.attributes.current_position = next
    entity.state = next === to ? (next > 0 ? 'open' : 'closed') : next > at ? 'opening' : 'closing'
    at = next
    reals.set(id, at)
    if (next === to) clearInterval(runs.get(id))
    element.hass = hass()
  }
  runs.set(id, setInterval(step, 500))
}
element.style.cssText = 'display:block;width:100vw;height:100vh'
element.setConfig(config)
element.hass = hass()
document.body.appendChild(element)
