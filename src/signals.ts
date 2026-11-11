import { shownMode } from '#/tiles/modes.ts'
import type { HomeAssistant } from '#/types.ts'

// Abstract controls a device exposes, derived from its Home Assistant domain
// and attributes. Decoration models express state through these instead of
// knowing about domains.
// A press is a button: pressed once, it does one thing and is done, with no
// state of its own to keep.
export type Signal = 'toggle' | 'level' | 'color' | 'warmth' | 'value' | 'enum' | 'press'

// A device can offer more than one percentage: a cover has its position and
// often a tilt, a light its brightness. One of them drives what an item
// does, and an item with two of its own, a window that opens and tilts, can
// take a different one for each.
export type LevelChannel = { id: string; label: string }

export function levelChannels(hass: HomeAssistant, entityId: string): LevelChannel[] {
  const attrs = hass.states[entityId]?.attributes ?? {}
  const out: LevelChannel[] = []
  switch (domainOf(entityId)) {
    case 'cover':
      if (typeof attrs.current_position === 'number') out.push({ id: 'position', label: 'Position' })
      if (typeof attrs.current_tilt_position === 'number') out.push({ id: 'tilt', label: 'Tilt' })
      break
    case 'light':
      if (typeof attrs.brightness === 'number') out.push({ id: 'brightness', label: 'Brightness' })
      break
    case 'fan':
      if (typeof attrs.percentage === 'number') out.push({ id: 'percentage', label: 'Speed' })
      break
    case 'media_player':
      if (typeof attrs.volume_level === 'number') out.push({ id: 'volume', label: 'Volume' })
      break
  }
  return out
}

// Every percentage the device reports, by channel id, 0 to 1.
export function levelValues(hass: HomeAssistant, entityId: string): Record<string, number> {
  const attrs = hass.states[entityId]?.attributes ?? {}
  const out: Record<string, number> = {}
  const put = (id: string, value: unknown, scale: number) => {
    if (typeof value === 'number') out[id] = Math.min(Math.max(value / scale, 0), 1)
  }
  put('position', attrs.current_position, 100)
  put('tilt', attrs.current_tilt_position, 100)
  put('brightness', attrs.brightness, 255)
  put('percentage', attrs.percentage, 100)
  put('volume', attrs.volume_level, 1)
  return out
}

export type SignalValues = {
  // How wet a plant's soil is, 0 to 100, from a moisture sensor or a plant.
  moisture?: number
  on?: boolean
  // 0 to 1
  level?: number
  // [r, g, b] 0 to 255
  color?: [number, number, number]
  // Kelvin
  warmth?: number
  value?: number
  state?: string
  // When it was last pressed, as Home Assistant says. It changes with every
  // press, which is all that is read from it.
  pressed?: string
}

const domainOf = (entityId: string) => entityId.split('.')[0]

// Carbon monoxide a smoke detector alarms at, and the words a sensor that
// watches for smoke, gas or water says when it has found some.
const CO_ALARM_PPM = 50
const ALARM_WORDS = new Set(['detected', 'alarm', 'alarming', 'smoke', 'fire', 'emergency', 'warning', 'leak', 'wet'])

const COLOR_MODES_WITH_COLOR = new Set(['hs', 'rgb', 'rgbw', 'rgbww', 'xy'])
const COLOR_MODES_WITH_LEVEL = new Set(['brightness', 'color_temp', 'hs', 'rgb', 'rgbw', 'rgbww', 'xy', 'white'])

export function deviceSignals(hass: HomeAssistant, entityId: string): Signal[] {
  const attrs = hass.states[entityId]?.attributes ?? {}
  switch (domainOf(entityId)) {
    case 'light': {
      const modes = (attrs.supported_color_modes as string[] | undefined) ?? []
      const out: Signal[] = ['toggle']
      if (modes.some(m => COLOR_MODES_WITH_LEVEL.has(m))) out.push('level')
      if (modes.some(m => COLOR_MODES_WITH_COLOR.has(m))) out.push('color')
      if (modes.includes('color_temp')) out.push('warmth')
      return out
    }
    case 'switch':
    case 'input_boolean':
    // A group of switches or lights is switched as one.
    case 'group':
    case 'humidifier':
    case 'lock':
    case 'binary_sensor':
      return ['toggle']
    case 'cover':
      return typeof attrs.current_position === 'number' ? ['toggle', 'level'] : ['toggle']
    case 'fan':
      return typeof attrs.percentage === 'number' ? ['toggle', 'level'] : ['toggle']
    case 'media_player':
      return typeof attrs.volume_level === 'number' ? ['toggle', 'level'] : ['toggle']
    case 'vacuum':
      // A vacuum is started and sent home, which is a switch as far as the
      // models are concerned: running or not.
      return ['toggle']
    // A climate device runs or not, and says in words what it runs as.
    case 'climate':
      return ['toggle', 'enum']
    case 'select':
    case 'input_select':
    // A plant is fine or has a problem, and says which in its attributes.
    case 'plant':
      return ['enum']
    case 'sensor':
    case 'number':
    case 'input_number':
      return ['value']
    case 'button':
    case 'input_button':
    case 'scene':
    case 'script':
      return ['press']
    default:
      return []
  }
}

export function signalValues(hass: HomeAssistant, entityId: string): SignalValues {
  const entity = hass.states[entityId]
  if (!entity) return {}
  const attrs = entity.attributes
  const state = entity.state
  switch (domainOf(entityId)) {
    case 'light': {
      const out: SignalValues = { on: state === 'on', state }
      if (typeof attrs.brightness === 'number') out.level = Math.min(Math.max(attrs.brightness / 255, 0), 1)
      const rgb = attrs.rgb_color
      if (Array.isArray(rgb) && rgb.length >= 3) out.color = [rgb[0], rgb[1], rgb[2]] as [number, number, number]
      if (typeof attrs.color_temp_kelvin === 'number') out.warmth = attrs.color_temp_kelvin
      return out
    }
    case 'cover':
      return {
        on: state === 'open' || state === 'opening',
        level: typeof attrs.current_position === 'number' ? attrs.current_position / 100 : undefined,
        state,
      }
    case 'fan':
      return {
        on: state === 'on',
        level: typeof attrs.percentage === 'number' ? attrs.percentage / 100 : undefined,
        state,
      }
    case 'media_player':
      return {
        on: !['off', 'standby', 'unavailable', 'unknown'].includes(state),
        level: typeof attrs.volume_level === 'number' ? attrs.volume_level : undefined,
        state,
      }
    case 'lock':
      return { on: state === 'locked', state }
    // Home Assistant has a word for each part of a vacuum's round. Only one
    // of them means it is out on the floor.
    case 'vacuum':
      return { on: state === 'cleaning', state }
    // The mode whose color its tiles show, like heat, so the model glows
    // in the same color. In auto that is what it is doing right now, and
    // idle while it waits.
    case 'climate':
      return {
        on: !['off', 'unavailable', 'unknown'].includes(state),
        state: shownMode(state, attrs.hvac_action) ?? 'idle',
      }
    case 'sensor':
    case 'number':
    case 'input_number': {
      // A sensor that is unavailable or unknown has no number to show.
      const value = Number(state)
      const known = Number.isFinite(value) ? value : undefined
      // A smoke or gas sensor that reads a number, or says what it found in
      // words, is on while it alarms, so a smoke detector bound to it flashes.
      const alarm =
        attrs.device_class === 'carbon_monoxide'
          ? known !== undefined && known >= CO_ALARM_PPM
          : ALARM_WORDS.has(state.toLowerCase())
      return {
        value: known,
        state,
        moisture: attrs.device_class === 'moisture' ? known : undefined,
        ...(alarm && { on: true }),
      }
    }
    // A moisture binary sensor is on when it is wet. A plant says how wet
    // its soil is when it has a sensor for it, or else only whether the
    // moisture is its problem.
    case 'binary_sensor':
      return {
        on: state === 'on',
        state,
        moisture:
          attrs.device_class === 'moisture' && (state === 'on' || state === 'off')
            ? state === 'on'
              ? 100
              : 0
            : undefined,
      }
    case 'plant': {
      const reading = Number(attrs.moisture)
      if (attrs.moisture !== undefined && attrs.moisture !== null && Number.isFinite(reading))
        return { state, moisture: reading }
      if (state === 'problem') {
        const problem = String(attrs.problem ?? '').toLowerCase()
        return { state, moisture: problem.includes('moisture low') ? 0 : undefined }
      }
      return { state, moisture: state === 'ok' ? 100 : undefined }
    }
    // A button's and a scene's state is the time they were last pressed. A
    // script's is whether it is running, and the time is kept beside it.
    case 'button':
    case 'input_button':
    case 'scene':
      return { pressed: state === 'unknown' || state === 'unavailable' ? undefined : state, state }
    case 'script': {
      const last = attrs.last_triggered
      return { on: state === 'on', pressed: typeof last === 'string' ? last : undefined, state }
    }
    // A group of covers is open rather than on.
    case 'group':
      return { on: state === 'on' || state === 'open', state }
    default:
      return { on: state === 'on', state }
  }
}

// The power sensors on each device, by device id. A smart plug keeps what
// it draws in a sensor of its own beside its switch, on the same device.
// Worked out once for each registry Home Assistant hands over, since the
// registry only changes when an entity is added or taken away, and a flat
// of thousands of entities is not searched on every state change.
const powerSensorsByRegistry = new WeakMap<object, Map<string, string[]>>()

function powerSensors(hass: HomeAssistant, device: string): string[] {
  const registry = hass.entities ?? {}
  let byDevice = powerSensorsByRegistry.get(registry)
  if (!byDevice) {
    byDevice = new Map()
    for (const entry of Object.values(registry)) {
      if (!entry.device_id || !entry.entity_id.startsWith('sensor.')) continue
      const list = byDevice.get(entry.device_id) ?? []
      list.push(entry.entity_id)
      byDevice.set(entry.device_id, list)
    }
    powerSensorsByRegistry.set(registry, byDevice)
  }
  // Which of a device's sensors read power is in their states, which come
  // and go, so it is asked each time.
  return (byDevice.get(device) ?? []).filter(id => hass.states[id]?.attributes.device_class === 'power')
}

// What a device draws, in watts, from the power sensor on the same device
// as the entity, which is how a smart plug says it. A reading in kilowatts
// is turned into watts. Undefined when the device has no such sensor, or it
// has nothing to say just now.
export function powerOf(hass: HomeAssistant, entityId: string): number | undefined {
  const device = hass.entities?.[entityId]?.device_id
  if (!device) return undefined
  for (const id of powerSensors(hass, device)) {
    const entity = hass.states[id]
    const value = Number(entity.state)
    if (entity.state === '' || !Number.isFinite(value)) continue
    const unit = String(entity.attributes.unit_of_measurement ?? 'W')
    return unit === 'kW' ? value * 1000 : unit === 'mW' ? value / 1000 : value
  }
  return undefined
}

// Watts the way a plug's display and its tile say them: a tenth of a watt
// for a small draw, whole watts up to a kilowatt, and kilowatts past it.
export function formatPower(watts: number) {
  if (watts >= 1000) return `${(watts / 1000).toFixed(2)} kW`
  if (watts >= 10) return `${Math.round(watts)} W`
  return `${Math.max(watts, 0).toFixed(1)} W`
}

// The media player features a click needs, as Home Assistant numbers them.
const MEDIA_PAUSE = 1
const MEDIA_PLAY = 16384

// What a click on a speaker or a TV does. One that can play and pause and
// has something on pauses it or plays it again, and is never turned off by
// the click: that is for its power button or its dialog. One with nothing
// on, or one that cannot play or pause, is switched on and off like
// anything else. Null when the click has nothing to do.
export function mediaClick(state: string | undefined, features: number): string | null {
  if (state === undefined || state === 'unavailable' || state === 'unknown') return null
  if (features & MEDIA_PAUSE && (state === 'playing' || state === 'buffering')) return 'media_pause'
  if (features & MEDIA_PLAY && state === 'paused') return 'media_play'
  return 'toggle'
}

// The service call a click on a device performs. Null when there is none.
// Most domains toggle, which needs nothing but the entity. A vacuum has no
// toggle to call, so it is sent out or sent home by what it is doing now.
export function clickAction(
  entityId: string,
  state?: string,
  attributes: Record<string, unknown> = {},
): { domain: string; service: string } | null {
  const domain = domainOf(entityId)
  switch (domain) {
    case 'media_player': {
      const features = typeof attributes.supported_features === 'number' ? attributes.supported_features : 0
      const service = mediaClick(state, features)
      return service ? { domain, service } : null
    }
    case 'light':
    case 'switch':
    case 'input_boolean':
    case 'fan':
    case 'cover':
    case 'humidifier':
      return { domain, service: 'toggle' }
    // A group has no toggle of its own, so Home Assistant's toggles every
    // member.
    case 'group':
      return { domain: 'homeassistant', service: 'toggle' }
    case 'vacuum':
      return { domain, service: state === 'cleaning' ? 'return_to_base' : 'start' }
    // A lock is locked or unlocked by what it is now, so a click on an
    // unlocked door locks it rather than asking it to unlock again.
    case 'lock':
      return { domain, service: state === 'unlocked' || state === 'open' ? 'lock' : 'unlock' }
    case 'button':
    case 'input_button':
      return { domain, service: 'press' }
    case 'scene':
      return { domain, service: 'turn_on' }
    case 'script':
      return { domain, service: 'turn_on' }
    default:
      return null
  }
}

// What a click is expected to leave the device: on or off, before Home
// Assistant says so. From what the device is now, or what the caller takes
// it to be, when an earlier click is still waiting on its answer. Undefined
// when the click does not flip that, a scene or a button, or a device that
// is not on or off to begin with.
export function clickOutcome(hass: HomeAssistant, entityId: string, on?: boolean): boolean | undefined {
  const domain = domainOf(entityId)
  if (domain === 'button' || domain === 'input_button' || domain === 'scene' || domain === 'script') return undefined
  const entity = hass.states[entityId]
  const action = clickAction(entityId, entity?.state, entity?.attributes)
  if (!action) return undefined
  // A speaker or a TV that pauses or plays stays on.
  if (domain === 'media_player' && action.service !== 'toggle') return undefined
  const now = on ?? signalValues(hass, entityId).on
  return now === undefined ? undefined : !now
}

// Approximate RGB of a black body at the given temperature, 0 to 1 each.
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(Math.max(kelvin, 1000), 12000) / 100
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332)
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.1 : 288.1 * Math.pow(t - 60, -0.0755)
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5 * Math.log(t - 10) - 305
  const clamp = (v: number) => Math.min(Math.max(v, 0), 255) / 255
  return [clamp(r), clamp(g), clamp(b)]
}
