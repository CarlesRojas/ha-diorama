import { EDITOR_DEVICE_GRID_M } from '#/constants.ts'
import { SOFA_DEPTH, SOFA_REACH, SOFA_WIDTH } from '#/scene/decor/sofaSpecs.ts'
import { isModelKind, modelKind } from '#/decoration/models.ts'
import type { Signal } from '#/signals.ts'
import { CEILING_HEIGHT_M, LIGHT_BASE_COLOR, LIGHT_SHADE_COLOR, SCANDI, SCREEN_OFF_COLOR } from '#/theme.ts'

export type Mount = 'floor' | 'wall' | 'ceiling'

export type DecorationParam = {
  id: string
  label: string
  default: number
  min: number
  max: number
  step: number
  // How the editor writes the value. Meters when it is missing.
  unit?: string
  // A two state parameter, stored as 0 or 1 and edited as a switch.
  toggle?: boolean
  // A place in a row of parts, which a button steps through. How many places
  // there are is cycleLength's to say, and the value wraps round it.
  cycle?: boolean
  // A number of parts added to or taken from the count the size gives, which
  // minus and plus buttons step. The editor shows the count that results,
  // which adjustedCount says.
  adjust?: boolean
  // The styles it means something on. Every style when missing.
  variants?: string[]
  // Kept out of the editor: the piece has the value, with no slider for it.
  hidden?: boolean
  // A switch of the same kind this only means something with: shown while
  // it is on, and counted as nothing while it is off.
  when?: string
}

// One style of a kind. A pendant is a pendant whichever one it is, so the
// catalog lists it once and the style is picked in the item's own panel,
// above its sizes. A style that paints different parts brings its own
// slots, which then stand in for the kind's.
export type DecorationVariant = {
  id: string
  label: string
  colors?: Record<string, string>
  materials?: Record<string, string>
  // Its own defaults for some of the kind's parameters. A style drawn after
  // a real piece starts at that piece's real size, and the slider still
  // takes it anywhere from there.
  params?: Record<string, number>
}

export type DecorationKind = {
  id: string
  family: string
  label: string
  mount: Mount
  params: DecorationParam[]
  // Material slots and their default colors.
  colors: Record<string, string>
  // Default surface per slot, matte when missing.
  materials?: Record<string, string>
  // The styles this kind comes in, the first one the default. Absent when
  // there is only one way to draw it.
  variants?: DecorationVariant[]
  // Signals the model can express visually. Anything else can still be
  // bound, the model just does not change.
  expresses: Signal[]
}

// Percentages an item can take, and what each one does to it. Most take a
// single one. A window opens and tilts, so it takes two, and each can be fed
// by a different percentage of the device.
const ITEM_LEVELS: Record<string, { id: string; label: string }[]> = {
  window: [
    { id: 'open', label: 'Open' },
    { id: 'tilt', label: 'Tilt' },
  ],
  blind: [
    { id: 'open', label: 'Open' },
    { id: 'tilt', label: 'Slats' },
  ],
}

export function itemLevels(kind: DecorationKind) {
  return ITEM_LEVELS[kind.id] ?? (kind.expresses.includes('level') ? [{ id: 'open', label: 'Level' }] : [])
}

// The kinds of Home Assistant device that are what a piece is, offered first
// when picking one to drive it. Any device that can show something on the
// piece is still on offer after them: a plain switch can run a fan.
const FAMILY_DOMAINS: Record<string, string[]> = {
  light: ['light'],
  cover: ['cover'],
  media: ['media_player'],
  climate: ['climate', 'fan', 'humidifier'],
}
const KIND_DOMAINS: Record<string, string[]> = {
  stairs: ['light', 'switch'],
  projector_screen: ['cover'],
  awning: ['cover'],
  louvred_pergola: ['cover'],
  driveway_gate: ['cover'],
  // A printer is watched through a smart plug, or through a sensor that
  // says what it is doing, and a router through its connectivity.
  printer_3d: ['switch', 'sensor', 'binary_sensor'],
  router: ['binary_sensor', 'switch'],
  // A tablet's screen is a light or a switch where its kiosk app makes it
  // one, and a player where it plays.
  wall_tablet: ['media_player', 'light', 'switch'],
  fan_ceiling: ['fan'],
  fan_floor: ['fan'],
  air_purifier: ['fan'],
  humidifier: ['humidifier'],
  smart_lock: ['lock'],
  vacuum_robot: ['vacuum'],
  water_heater: ['water_heater'],
  motion_sensor: ['binary_sensor'],
  smoke_detector: ['binary_sensor', 'sensor'],
  leak_sensor: ['binary_sensor'],
  camera: ['camera'],
  alarm_panel: ['alarm_control_panel'],
  // Home Assistant's own plant, then the soil moisture, temperature and
  // the air's humidity round it.
  plant_large: ['plant', 'sensor', 'binary_sensor'],
  plant_small: ['plant', 'sensor', 'binary_sensor'],
  plant_wall: ['plant', 'sensor', 'binary_sensor'],
}

export function preferredDomains(kind: DecorationKind): string[] {
  return KIND_DOMAINS[kind.id] ?? FAMILY_DOMAINS[kind.family] ?? []
}

// Parameter shorthands. Every length is in meters.

// Vertical parameters: how tall something is, or how high it sits. They are
// kept inside a room, a little above the ceiling at most.
const VERTICAL = new Set(['height', 'sill', 'lift', 'drop', 'cord', 'hem'])
const CEILING_LIMIT_M = 3
const round2 = (value: number) => Math.round(value * 100) / 100

// The range a slider offers. Each one reaches well past the usual size in
// both directions, so nothing is capped just short of a real piece of
// furniture: a wardrobe three meters wide, a coffee table at ankle height.
// Counts, which take whole steps, are left exactly as they are given.

// A slider counts its stops from its own start, so a start that is not a
// whole number of steps puts every stop at an odd value: a bookshelf that
// starts at 23 cm and steps by 5 offers 78, 83, 88. Both ends are pulled
// out to the nearest whole step, which puts the stops on 80, 85, 90.
const down = (value: number, step: number) => round2(Math.floor(value / step + 1e-9) * step)
const up = (value: number, step: number) => round2(Math.ceil(value / step - 1e-9) * step)

const range = (id: string, d: number, min: number, max: number, step: number) => {
  if (step >= 1) return { min, max }
  const low = Math.max(Math.min(min, d * 0.25), VERTICAL.has(id) ? 0 : 0.05)
  const high = Math.max(max, d * 3)
  const top = VERTICAL.has(id) ? (id === 'height' ? Math.max(high, max) : Math.min(high, CEILING_LIMIT_M)) : high
  return { min: down(low, step), max: up(top, step) }
}

const p = (
  id: string,
  label: string,
  d: number,
  min: number,
  max: number,
  step?: number,
  unit?: string,
): DecorationParam => {
  // Every length steps by the grid pieces are moved on in the plan, so a
  // piece's edges land on the same marks its position does. Only a value
  // with a unit of its own, a count or a share, takes its own step.
  const grid = unit === undefined ? EDITOR_DEVICE_GRID_M : (step ?? 1)
  return {
    id,
    label,
    // On a stop of its own slider, so the first drag nudges it by one step
    // rather than jumping it to the nearest round value.
    default: round2(Math.round(d / grid) * grid),
    ...range(id, d, min, max, grid),
    step: grid,
    unit,
  }
}
const width = (d: number, min = 0.3, max = 4) => p('width', 'Width', d, min, max)
const depth = (d: number, min = 0.2, max = 3) => p('depth', 'Depth', d, min, max)
const height = (d: number, min = 0.2, max = 2.6) => p('height', 'Height', d, min, max)
const size = (d: number, min = 0.1, max = 1.5) => p('size', 'Size', d, min, max)
const length = (d: number, min = 0.2, max = 10) => p('length', 'Length', d, min, max)
// Height an item stands at when it is not standing on anything. The editor
// has no slider for it: the piece is stepped between the floor, this height
// and the tops under it.
const lift = (d: number, max = 1.5) => ({ ...p('lift', 'Standing on', d, 0, max), hidden: true })
const panels = (d = 2, max = 5) => p('panels', 'Panels', d, 1, max, 1, '')
// How far an appliance is raised off the floor, to sit in a run of units.
const base = (d = 0) => p('base', 'Off floor', d, 0, 1.6)
// Screens are sold by the diagonal, and they are all 16:9.
const inches = (d: number, min = 24, max = 120) => p('inches', 'Screen', d, min, max, 1, '"')
// The soil moisture a plant starts to wilt at, as its sensor reads it.
const dryBelow = () => p('dry', 'Dry below', 20, 5, 60, 1, '%')
// A switch: off is 0, on is 1.
const flag = (id: string, label: string, d = 0): DecorationParam => ({
  id,
  label,
  default: d,
  min: 0,
  max: 1,
  step: 1,
  unit: '',
  toggle: true,
})

// A place in a row of parts, stepped through with a button rather than a
// slider, since how many places there are depends on the other parameters.
const cycle = (id: string, label: string): DecorationParam => ({
  id,
  label,
  default: 0,
  min: 0,
  max: 99,
  step: 1,
  unit: '',
  cycle: true,
})

// Parts added to or taken from the count the size gives, so the count keeps
// following the size after it is adjusted.
const adjust = (id: string, label: string): DecorationParam => ({
  id,
  label,
  default: 0,
  min: -10,
  max: 10,
  step: 1,
  unit: '',
  adjust: true,
})

// A parameter only some of the kind's styles have.
const only = (param: DecorationParam, variants: string[]): DecorationParam => ({ ...param, variants })
// A parameter that only means something while one of the kind's switches is on.
const whenOn = (param: DecorationParam, toggle: string): DecorationParam => ({ ...param, when: toggle })

// The parameters the editor shows for a style, and for the switches the
// item has on.
export function styleParams(kind: DecorationKind, variant?: string, params?: Record<string, number>) {
  const style = decorationVariant(kind, variant)?.id
  return kind.params.filter(
    p =>
      !p.hidden &&
      (!p.variants || (style !== undefined && p.variants.includes(style))) &&
      (!p.when || paramValue(kind, params, p.when, variant) > 0.5),
  )
}

// Signal sets.
const NONE: Signal[] = []
const TOGGLE: Signal[] = ['toggle']
const TOGGLE_LEVEL: Signal[] = ['toggle', 'level']
const LIGHT_SIGNALS: Signal[] = ['toggle', 'level', 'color', 'warmth']
const READOUT: Signal[] = ['value', 'enum', 'toggle']
// A printer runs or not, and a sensor beside it says how far the print has got.
const PRINTER_SIGNALS: Signal[] = ['toggle', 'value']

// Pieces that switch but have nothing to do for a press: a sensor only says
// what it sees, a lock is locked or not, and a readout shows a number.
const NO_PRESS = new Set([
  'motion_sensor',
  'smoke_detector',
  'leak_sensor',
  'alarm_panel',
  'smart_lock',
  'air_quality',
  'thermostat',
  'plant_large',
  'plant_small',
  'plant_wall',
])

// Everything else that switches also does one thing for a press: it runs for
// a moment and goes back, a light blinks, a fridge opens and shuts, a litter
// box scoops once.
const withPress = (id: string, expresses: Signal[]): Signal[] =>
  expresses.includes('toggle') && !NO_PRESS.has(id) ? [...expresses, 'press'] : expresses

const kind = (
  id: string,
  family: string,
  label: string,
  mount: Mount,
  params: DecorationParam[],
  colors: Record<string, string>,
  materials: Record<string, string>,
  expresses: Signal[] = NONE,
  variants?: DecorationVariant[],
): DecorationKind => ({
  id,
  family,
  label,
  mount,
  params,
  colors,
  materials,
  expresses: withPress(id, expresses),
  variants,
})

// The pendant's styles are real lamps, so they wear their real finishes:
// natural wood, opal glass, white ceramic, and black canopies and cords.
// Bathroom ceramics, and the tiled boxing and panels round them.
const BATH_WHITE = '#f4f3ef'
const BATH_TILE = '#e3dfd7'

const PENDANT_BLACK_COLOR = '#232426'
const PENDANT_OPAL_COLOR = '#f6f4ef'
const PENDANT_CERAMIC_COLOR = '#f8f7f4'
const PENDANT_STEEL_COLOR = '#b4b8bb'

// The first style, which is also the kind's own slots.
const PENDANT_NAGOYA: DecorationVariant = {
  id: 'nagoya',
  label: 'Slatted Lantern',
  params: { size: 0.42 },
  colors: { slats: '#e2c89c', threads: '#f2ede4', diffuser: LIGHT_SHADE_COLOR, cord: PENDANT_BLACK_COLOR },
  materials: { slats: 'wood', threads: 'fabric', diffuser: 'matte', cord: 'fabric' },
}

// The table lamp's first style, which is also the kind's own slots, named as
// the lamp before it had styles, so a saved globe or basket color still
// lands on the Cestita.
const TABLE_CESTITA: DecorationVariant = {
  id: 'cestita',
  label: 'Opal Globe Carrier',
  params: { size: 0.22, height: 0.36 },
  colors: { globe: PENDANT_OPAL_COLOR, basket: '#b97a4a' },
  materials: { globe: 'matte', basket: 'wood' },
}

// The desk lamp's first style, the balanced arm lamp in its usual white
// on black arms.
const DESK_ARM: DecorationVariant = {
  id: 'balanced_arm',
  label: 'Balanced Arm',
  params: { size: 0.4, height: 0.43 },
  colors: { shade: '#ece8df', inside: '#f6f4ef', arms: PENDANT_BLACK_COLOR, base: '#ece8df' },
  materials: { shade: 'matte', inside: 'matte', arms: 'metal', base: 'matte' },
}

// The piano's first style, an upright in oak, which is also the kind's own
// slots.
const PIANO_UPRIGHT: DecorationVariant = {
  id: 'upright',
  label: 'Oak Upright',
  // 150 by 60 cm and 125 cm tall.
  params: { width: 1.5, depth: 0.6, height: 1.25 },
  colors: { case: SCANDI.oak, keys: '#f4f1ea', sharps: '#1d1e20', fittings: '#c8ad72' },
  materials: { case: 'wood', keys: 'matte', sharps: 'matte', fittings: 'metal' },
}

// The floor lamp's first style, which keeps the kind's old slots, so a saved
// shade or stand color still lands on the TMM.
const FLOOR_TMM: DecorationVariant = {
  id: 'tmm',
  label: 'Beech Tripod Drum',
  // 60 by 50 cm across, from the end of a leg to the far side of the shade,
  // and 166 cm tall.
  params: { size: 0.6, depth: 0.5, height: 1.66 },
  colors: { shade: '#ecdfc0', stand: '#dfbb8f', fittings: PENDANT_BLACK_COLOR, cable: PENDANT_BLACK_COLOR },
  materials: { shade: 'fabric', stand: 'wood', fittings: 'metal', cable: 'fabric' },
}

// The dining table's first style, which keeps the kind's old slots and the
// oak on steel it was drawn as before it had styles.
const DINING_VIOK: DecorationVariant = {
  id: 'viok',
  label: 'Oak on Steel Angles',
  // 160 by 90 cm, 76 cm tall.
  params: { width: 1.6, depth: 0.9, height: 0.76 },
  colors: { top: '#dbbf98', frame: '#5a5b5d' },
  materials: { top: 'wood', frame: 'metal' },
}

// The sofa and the pouf, after Pilma's Dresde in its natural fabric, on
// legs painted mocha.
const SOFA_FABRIC_COLOR = '#e4ded4'
const SOFA_LEG_COLOR = '#3d3530'

// The dining chair's first style, which keeps the kind's old shell and
// legs slots, so a saved color still lands on it.
const CHAIR_SLAB: DecorationVariant = {
  id: 'oia',
  label: 'Molded Slab',
  // 48 by 51 cm, 85 cm tall.
  params: { width: 0.48, depth: 0.51, height: 0.85 },
  colors: { shell: '#45403d', legs: '#45403d' },
  materials: { shell: 'matte', legs: 'matte' },
}

// The counter's first style, a run against the wall, which keeps the old
// counter's slots.
const COUNTER_RUN: DecorationVariant = {
  id: 'run',
  label: 'Wall Run',
  // A broken white stone worktop on oak units.
  colors: { worktop: '#ece6da', cabinets: SCANDI.oak, fronts: SCANDI.oak },
  materials: { worktop: 'ceramic', cabinets: 'wood', fronts: 'wood' },
}

// The bed's first style, which keeps the old bed's slots.
const BED_HEADBOARD: DecorationVariant = {
  id: 'headboard',
  label: 'Splay Oak',
  colors: { frame: SCANDI.oak, bedding: SCANDI.offWhite, pillows: SCANDI.linen },
  materials: { frame: 'wood', bedding: 'fabric', pillows: 'fabric' },
}

// The office chair's first style, which keeps the kind's old seat, back,
// frame and base slots, since the old model was a task chair like it.
const OFFICE_TECK: DecorationVariant = {
  id: 'teck',
  label: 'Mesh Task Chair',
  // 66 by 66 cm, 99 cm tall, its seat 49 cm up.
  params: { width: 0.66, depth: 0.66, height: 0.49 },
  colors: { seat: '#252527', back: '#1c1c1e', frame: '#202022', base: '#c9ccd0', castors: '#1b1b1c' },
  materials: { seat: 'fabric', back: 'fabric', frame: 'matte', base: 'metal', castors: 'matte' },
}

// The desk's first style, the kind's old model with its slots.
const DESK_WRITING: DecorationVariant = {
  id: 'writing',
  label: 'Writing desk',
  params: { width: 1.4, depth: 0.7, height: 0.75 },
  colors: { top: SCANDI.oak, legs: SCANDI.oak, drawer: SCANDI.offWhite, handle: SCANDI.slate },
  materials: { top: 'wood', legs: 'wood', drawer: 'matte', handle: 'metal' },
}

// The bench's first style, which keeps the kind's old legs and seat slots.
const BENCH_LAUTA: DecorationVariant = {
  id: 'lauta',
  label: 'Cord Seat Oak Bench',
  // 130 by 42 cm, its seat 44 cm up.
  params: { width: 1.3, depth: 0.42, height: 0.44 },
  colors: { legs: '#e0b584', seat: '#dcc3a0' },
  materials: { legs: 'wood', seat: 'fabric' },
}

// The stool's first style, which keeps the kind's old legs and seat slots.
const STOOL_LAUTA: DecorationVariant = {
  id: 'lauta',
  label: 'Cord Seat Oak',
  // 45 by 35 cm, its seat 68 cm up.
  params: { size: 0.45, depth: 0.35, height: 0.68 },
  colors: { legs: '#e0b584', seat: '#dcc3a0' },
  materials: { legs: 'wood', seat: 'fabric' },
}

// The wall lamp's first style, which keeps the kind's old slots, so a saved
// shade or channel color still lands on the TMM.
const WALL_TMM: DecorationVariant = {
  id: 'tmm',
  label: 'Parchment Wall Drum',
  // A Ø20 shade 23 cm out from the wall, on a channel 20 cm tall.
  params: { size: 0.2, depth: 0.23, tall: 0.2 },
  colors: { shade: '#ecdfc0', channel: '#dfbb8f', fittings: PENDANT_BLACK_COLOR },
  materials: { shade: 'fabric', channel: 'wood', fittings: 'metal' },
}

// The stairs' first style, an open riser flight: 4 cm oak treads on two
// white steel strings, 90 cm wide, with a black steel handrail 90 cm over
// the nosings on its open side.
const STAIRS_OPEN: DecorationVariant = {
  id: 'open',
  label: 'Open Oak',
  colors: { treads: SCANDI.oak, strings: '#f3f1ec', rail: '#2b2c2d' },
  materials: { treads: 'wood', strings: 'matte', rail: 'metal' },
}

export const DECORATION_KINDS: DecorationKind[] = [
  // Lights
  kind(
    'light_ceiling',
    'light',
    'Ceiling light',
    'ceiling',
    // Size is the light's diameter. Each style starts at its own.
    [size(0.1, 0.06, 0.7)],
    { focus: LIGHT_SHADE_COLOR, rim: LIGHT_BASE_COLOR },
    { focus: 'matte', rim: 'metal' },
    LIGHT_SIGNALS,
    [
      // The first keeps the kind's old slots, so a saved color still lands.
      { id: 'focus', label: 'Recessed Spot' },
      {
        id: 'dome',
        label: 'Opal Dome',
        // A flush mount Ø35 opal glass dome on a white ring.
        params: { size: 0.35 },
        colors: { globe: PENDANT_OPAL_COLOR, rim: '#f3f1ec' },
        materials: { globe: 'matte', rim: 'metal' },
      },
      {
        id: 'drum',
        label: 'Linen Drum',
        // A flush mount Ø45 linen drum, 14 cm deep, closed by opal underneath.
        params: { size: 0.45 },
        colors: { shade: '#ecdfc0', diffuser: PENDANT_OPAL_COLOR, rim: LIGHT_BASE_COLOR },
        materials: { shade: 'fabric', diffuser: 'matte', rim: 'metal' },
      },
      {
        id: 'spot',
        label: 'Surface Spot',
        // A black Ø9 can 12 cm long, screwed straight to the ceiling.
        params: { size: 0.09 },
        colors: { body: '#2b2c2d', focus: LIGHT_SHADE_COLOR },
        materials: { body: 'metal', focus: 'matte' },
      },
    ],
  ),
  kind(
    'light_pendant',
    'light',
    'Pendant',
    'ceiling',
    // Size is the shade's diameter. Each style starts at its lamp's own.
    [size(0.42, 0.06, 1), p('cord', 'Cord length', 0.8, 0.2, 2)],
    PENDANT_NAGOYA.colors ?? {},
    PENDANT_NAGOYA.materials ?? {},
    LIGHT_SIGNALS,
    // Four Santa & Cole lamps, each drawn from its dimensional drawing.
    [
      PENDANT_NAGOYA,
      {
        id: 'globo_cestita',
        label: 'Opal Lantern',
        params: { size: 0.17 },
        colors: {
          globe: PENDANT_OPAL_COLOR,
          cap: PENDANT_BLACK_COLOR,
          canopy: PENDANT_BLACK_COLOR,
          cord: PENDANT_BLACK_COLOR,
        },
        materials: { globe: 'matte', cap: 'metal', canopy: 'metal', cord: 'fabric' },
      },
      {
        id: 'headhat_bowl',
        label: 'Ceramic Bowl',
        params: { size: 0.2 },
        colors: {
          shade: PENDANT_CERAMIC_COLOR,
          inside: PENDANT_CERAMIC_COLOR,
          capsule: PENDANT_BLACK_COLOR,
          canopy: PENDANT_BLACK_COLOR,
          cord: PENDANT_BLACK_COLOR,
        },
        materials: { shade: 'ceramic', inside: 'matte', capsule: 'metal', canopy: 'metal', cord: 'fabric' },
      },
      {
        id: 'cirio_simple',
        label: 'Porcelain Candle',
        params: { size: 0.1 },
        colors: {
          shade: PENDANT_CERAMIC_COLOR,
          capsule: PENDANT_BLACK_COLOR,
          canopy: PENDANT_BLACK_COLOR,
          cord: PENDANT_BLACK_COLOR,
        },
        materials: { shade: 'ceramic', capsule: 'metal', canopy: 'metal', cord: 'fabric' },
      },
    ],
  ),
  kind(
    'light_floor',
    'light',
    'Floor lamp',
    'floor',
    // Size and depth are the lamp's footprint and height its height. Each
    // style starts at its lamp's own, to the centimeter.
    [
      p('size', 'Width', 0.6, 0.15, 1.0, 0.01),
      p('depth', 'Depth', 0.5, 0.15, 1.0, 0.01),
      p('height', 'Height', 1.66, 0.8, 2.2, 0.01),
    ],
    FLOOR_TMM.colors ?? {},
    FLOOR_TMM.materials ?? {},
    LIGHT_SIGNALS,
    // Three Santa & Cole lamps, each drawn from its dimensional drawing.
    [
      FLOOR_TMM,
      {
        id: 'fad',
        label: 'Adjustable Tripod',
        // Ø49 across the foot and 120 cm at its lowest.
        params: { size: 0.49, depth: 0.49, height: 1.2 },
        colors: { shade: '#f3efe6', stand: '#c08f5e', rod: PENDANT_STEEL_COLOR },
        materials: { shade: 'fabric', stand: 'wood', rod: 'metal' },
      },
      {
        id: 'lamina',
        label: 'Tall Folded Sheet',
        // Ø21 across the base and 187.5 cm to the top of the rod.
        params: { size: 0.21, depth: 0.21, height: 1.88 },
        colors: { shade: '#f5f4f0', back: '#d9dbdc', structure: PENDANT_BLACK_COLOR, diffuser: PENDANT_OPAL_COLOR },
        materials: { shade: 'matte', back: 'metal', structure: 'metal', diffuser: 'matte' },
      },
    ],
  ),
  kind(
    'light_table',
    'light',
    'Table lamp',
    'floor',
    // Size is the lamp's width and height its height. Each style starts at
    // its lamp's own.
    [size(0.22, 0.08, 0.6), height(0.36, 0.15, 0.9), lift(0.75)],
    TABLE_CESTITA.colors ?? {},
    TABLE_CESTITA.materials ?? {},
    LIGHT_SIGNALS,
    // Four Santa & Cole lamps, each drawn from its dimensional drawing, and
    // a color lamp after a Philips Hue.
    [
      TABLE_CESTITA,
      {
        id: 'sylvestrina',
        label: 'Black Glass Candlestick',
        // Ø12.7 by 35.5 cm, to the centimeter.
        params: { size: 0.13, height: 0.36 },
        colors: { base: PENDANT_BLACK_COLOR, glass: '#eef3f4', diffuser: PENDANT_OPAL_COLOR },
        materials: { base: 'ceramic', glass: 'matte', diffuser: 'matte' },
      },
      {
        id: 'maija',
        label: 'Ringed Tripod',
        params: { size: 0.21, height: 0.33 },
        colors: { shade: '#f3f2ee', feet: '#b89a5e', diffuser: PENDANT_OPAL_COLOR },
        materials: { shade: 'matte', feet: 'metal', diffuser: 'matte' },
      },
      {
        id: 'basica_minima',
        label: 'Parchment Drum',
        params: { size: 0.12, height: 0.3 },
        colors: { shade: '#e6d6b4', column: '#e8d3ad', base: '#4b3a2a', stitching: '#5a3b25' },
        materials: { shade: 'fabric', column: 'wood', base: 'metal', stitching: 'fabric' },
      },
      {
        id: 'iris',
        label: 'Tilted Ring',
        // After the Philips Hue Iris: an opal disc in a clear ring, tilted
        // back on a small round foot, 18.8 cm wide and 19.4 cm tall.
        params: { size: 0.19, height: 0.19 },
        colors: { diffuser: PENDANT_OPAL_COLOR, ring: '#e8ecee', body: '#f3f2ef' },
        materials: { diffuser: 'matte', ring: 'ceramic', body: 'matte' },
      },
    ],
  ),
  kind(
    'light_desk',
    'light',
    'Desk lamp',
    'floor',
    // Size is the square the lamp stands in, its arm and shade included, and
    // height its height. Each style starts at its lamp's own.
    [size(0.4, 0.15, 0.8), height(0.43, 0.2, 1), lift(0.75)],
    DESK_ARM.colors ?? {},
    DESK_ARM.materials ?? {},
    LIGHT_SIGNALS,
    [
      DESK_ARM,
      {
        id: 'banker',
        label: 'Green Glass Banker',
        params: { size: 0.28, height: 0.41 },
        colors: { shade: '#2e8b57', diffuser: PENDANT_OPAL_COLOR, base: '#b89a5e' },
        materials: { shade: 'ceramic', diffuser: 'matte', base: 'metal' },
      },
    ],
  ),
  kind(
    'light_wall',
    'light',
    'Wall light',
    'wall',
    // Size, depth and lamp height are the lamp's own, out from the wall, and
    // height is how high its middle hangs. Each style starts at its lamp's
    // own size, to the centimeter.
    [
      p('size', 'Width', 0.2, 0.08, 0.6, 0.01),
      p('depth', 'Depth', 0.23, 0.08, 0.5, 0.01),
      p('tall', 'Lamp height', 0.2, 0.08, 0.6, 0.01),
      height(1.8, 0.5, 2.5),
    ],
    WALL_TMM.colors ?? {},
    WALL_TMM.materials ?? {},
    LIGHT_SIGNALS,
    // Three Santa & Cole lamps, each drawn from its dimensional drawing.
    [
      WALL_TMM,
      {
        id: 'singular',
        label: 'Linen Wall Sconce',
        // 18 cm wide, 15 cm out and 30 cm tall.
        params: { size: 0.18, depth: 0.15, tall: 0.3 },
        colors: { shade: '#f4f1ea', structure: '#c9ccce' },
        materials: { shade: 'fabric', structure: 'metal' },
      },
      {
        id: 'wally',
        label: 'Black Arm Opal Globe',
        // A Ø18 globe 22 cm out, on a plate 24 cm tall.
        params: { size: 0.18, depth: 0.22, tall: 0.24 },
        colors: { globe: PENDANT_OPAL_COLOR, structure: PENDANT_BLACK_COLOR },
        materials: { globe: 'matte', structure: 'matte' },
      },
    ],
  ),
  kind(
    'light_strip',
    'light',
    'Floor LED strip',
    'floor',
    [length(1), height(0.02, 0, 2.6)],
    { diffuser: LIGHT_SHADE_COLOR, channel: LIGHT_BASE_COLOR },
    { diffuser: 'matte', channel: 'metal' },
    LIGHT_SIGNALS,
  ),
  kind(
    'light_strip_ceiling',
    'light',
    'Ceiling LED strip',
    'ceiling',
    [length(1.6)],
    { diffuser: LIGHT_SHADE_COLOR, channel: LIGHT_BASE_COLOR },
    { diffuser: 'matte', channel: 'metal' },
    LIGHT_SIGNALS,
  ),
  kind(
    'light_strip_wall',
    'light',
    'Wall LED strip',
    'wall',
    [length(1.6), height(1.9, 0.1, 2.5)],
    { diffuser: LIGHT_SHADE_COLOR, channel: LIGHT_BASE_COLOR },
    { diffuser: 'matte', channel: 'metal' },
    LIGHT_SIGNALS,
  ),

  // Seating
  kind(
    'sofa',
    'seating',
    'Sofa',
    'floor',
    // The seats share out the width, and a narrow one is an armchair. Every
    // style can run one end seat out as a chaise, whose length and side
    // only mean anything with it on.
    [
      width(SOFA_WIDTH, 0.6, 4),
      depth(SOFA_DEPTH, 0.6, 1.3),
      flag('chaise', 'Chaise longue'),
      p('reach', 'Chaise length', SOFA_REACH, 1.2, 2.2),
      flag('flip', 'Chaise left'),
    ],
    { upholstery: SOFA_FABRIC_COLOR, cushions: SOFA_FABRIC_COLOR, legs: SOFA_LEG_COLOR },
    { upholstery: 'fabric', cushions: 'fabric', legs: 'matte' },
    NONE,
    [
      { id: 'dresde', label: 'Pillow Arm' },
      {
        id: 'block',
        label: 'Plinth Block',
        params: { depth: 1.0 },
        colors: { upholstery: '#c9bda9', cushions: '#c9bda9', plinth: '#3a3531' },
        materials: { upholstery: 'fabric', cushions: 'fabric', plinth: 'matte' },
      },
      {
        id: 'rail',
        label: 'Teak Rail',
        params: { width: 2.1, depth: 0.86 },
        colors: { upholstery: '#6f7a67', cushions: '#6f7a67', frame: '#9a6a42' },
        materials: { upholstery: 'fabric', cushions: 'fabric', frame: 'wood' },
      },
    ],
  ),
  kind(
    'dining_chair',
    'seating',
    'Dining chair',
    'floor',
    // Each style starts at its chair's own size, to the centimeter, and the
    // sliders scale the chair from there.
    [
      p('width', 'Width', 0.44, 0.35, 0.7, 0.01),
      p('depth', 'Depth', 0.56, 0.35, 0.7, 0.01),
      p('height', 'Height', 0.89, 0.6, 1.1, 0.01),
    ],
    CHAIR_SLAB.colors ?? {},
    CHAIR_SLAB.materials ?? {},
    undefined,
    // Three Pilma chairs, from their stated sizes and product photos.
    [
      CHAIR_SLAB,
      {
        id: 'sura',
        label: 'Cord Seat Teak',
        // 46 by 55 cm, 80 cm tall.
        params: { width: 0.46, depth: 0.55, height: 0.8 },
        colors: { seat: '#c9a57a', frame: '#b98a5c' },
        materials: { seat: 'fabric', frame: 'wood' },
      },
      {
        id: 'varma',
        label: 'Padded Walnut',
        // 48 by 51 cm, 80 cm tall.
        params: { width: 0.48, depth: 0.51, height: 0.8 },
        colors: { seat: '#26272a', frame: '#5b3e30' },
        materials: { seat: 'matte', frame: 'wood' },
      },
    ],
  ),
  kind(
    'office_chair',
    'seating',
    'Office chair',
    'floor',
    // Each style starts at its chair's own size, to the centimeter. Width
    // and depth scale the chair, and the seat height rides the seat up or
    // down on its column as the gas lift does.
    [
      p('width', 'Width', 0.66, 0.4, 0.85, 0.01),
      p('depth', 'Depth', 0.66, 0.4, 0.85, 0.01),
      p('height', 'Seat height', 0.49, 0.38, 0.62, 0.01),
    ],
    OFFICE_TECK.colors ?? {},
    OFFICE_TECK.materials ?? {},
    undefined,
    // A saved style that is gone falls back to the first.
    [
      OFFICE_TECK,
      {
        id: 'sling',
        label: 'Sling Rib',
        params: { width: 0.58, depth: 0.6, height: 0.46 },
        colors: { seat: '#2a2624', frame: '#d4d6d8', base: '#d4d6d8', castors: '#1b1b1c' },
        materials: { seat: 'matte', frame: 'metal', base: 'metal', castors: 'matte' },
      },
      {
        id: 'racer',
        label: 'Bucket Racer',
        params: { width: 0.7, depth: 0.68, height: 0.48 },
        colors: { seat: '#1f1f21', accent: '#b3262c', pillows: '#2a2a2d', base: '#1f1f21', castors: '#1b1b1c' },
        materials: { seat: 'fabric', accent: 'fabric', pillows: 'fabric', base: 'matte', castors: 'matte' },
      },
    ],
  ),
  kind(
    'sim_rig',
    'seating',
    'Sim racing cockpit',
    'floor',
    // Width is across the seat and depth from the pedals to the back of the
    // seat. Each style starts at its rig's own size, and the sliders scale
    // it from there.
    [p('width', 'Width', 0.55, 0.45, 1), p('depth', 'Depth', 1.38, 1, 2)],
    { frame: '#1f2022', seat: '#232426', trim: '#b3262c', wheel: '#1b1c1e', pedals: '#8a8f92' },
    { frame: 'matte', seat: 'fabric', trim: 'fabric', wheel: 'matte', pedals: 'metal' },
    NONE,
    [
      // After the Next Level Racing GTtrack: a black steel tube frame 138
      // by 55 cm with a fixed bucket seat, the wheel on a deck at the
      // front and the pedals on a plate at the far end.
      { id: 'tube', label: 'Tube Cockpit' },
      {
        id: 'profile',
        label: 'Aluminium Profile',
        // After the Sim-Lab GT1 Evo: a frame of 80 by 40 mm aluminium
        // profile, 135 by 58 cm, with a direct drive wheel on a front
        // upright and the pedals on a slotted deck.
        params: { width: 0.6, depth: 1.35 },
        colors: { frame: '#b9bdc0', seat: '#2a2b2d', trim: '#5c6064', wheel: '#1b1c1e', pedals: '#2b2c2d' },
        materials: { frame: 'metal', seat: 'fabric', trim: 'fabric', wheel: 'matte', pedals: 'metal' },
      },
    ],
  ),
  kind(
    'stool',
    'seating',
    'Stool',
    'floor',
    // Size is the width, so a saved size still sets it, and height is the
    // seat's, which a back scales with. Each style starts at its stool's
    // own, to the centimeter.
    [
      p('size', 'Width', 0.45, 0.25, 0.7, 0.01),
      p('depth', 'Depth', 0.35, 0.25, 0.7, 0.01),
      p('height', 'Seat height', 0.68, 0.3, 0.9, 0.01),
    ],
    STOOL_LAUTA.colors ?? {},
    STOOL_LAUTA.materials ?? {},
    undefined,
    // Three Pilma stools, from their stated sizes and product photos.
    [
      STOOL_LAUTA,
      {
        id: 'dean',
        label: 'Rattan Back Teak',
        // 47 by 51 cm, its seat 65 cm up and its back 90.
        params: { size: 0.47, depth: 0.51, height: 0.65 },
        colors: { legs: '#8b5a36', seat: '#c4a57c' },
        materials: { legs: 'wood', seat: 'fabric' },
      },
      {
        id: 'keula',
        label: 'Horseshoe Back Oak',
        // 45 by 54 cm, its seat 65 cm up.
        params: { size: 0.45, depth: 0.54, height: 0.65 },
        colors: { legs: '#dfb884', seat: '#7d6a62' },
        materials: { legs: 'wood', seat: 'matte' },
      },
    ],
  ),
  kind(
    'bench',
    'seating',
    'Bench',
    'floor',
    // Height is the seat's, which anything set on the bench stands on. Each
    // style starts at its bench's own, to the centimeter.
    [
      p('width', 'Width', 1.3, 0.6, 2.4, 0.01),
      p('depth', 'Depth', 0.42, 0.3, 0.7, 0.01),
      p('height', 'Height', 0.44, 0.35, 0.55, 0.01),
    ],
    BENCH_LAUTA.colors ?? {},
    BENCH_LAUTA.materials ?? {},
    undefined,
    // Two Pilma benches, from their stated sizes and product photos.
    [
      BENCH_LAUTA,
      {
        id: 'angle',
        label: 'Teak with Drawers',
        // 170 by 49 cm, 45 cm tall.
        params: { width: 1.7, depth: 0.49, height: 0.45 },
        colors: { frame: '#a57a4e', drawers: '#5e5b56' },
        materials: { frame: 'wood', drawers: 'matte' },
      },
    ],
  ),
  kind(
    'pouf',
    'seating',
    'Pouf',
    'floor',
    // One to go with each sofa: its base on its legs, a soft cube on its
    // plinth, or a cushion laid in a teak frame.
    [size(0.8, 0.3, 1.2), height(0.42, 0.25, 0.55)],
    { cover: SOFA_FABRIC_COLOR, legs: SOFA_LEG_COLOR },
    { cover: 'fabric', legs: 'matte' },
    NONE,
    [
      { id: 'dresde', label: 'Pillow Arm' },
      {
        id: 'block',
        label: 'Plinth Block',
        params: { size: 0.7 },
        colors: { cover: '#c9bda9', legs: '#3a3531' },
      },
      {
        id: 'rail',
        label: 'Teak Rail',
        params: { size: 0.6 },
        colors: { cover: '#6f7a67', legs: '#9a6a42' },
        materials: { cover: 'fabric', legs: 'wood' },
      },
    ],
  ),

  // Tables
  kind(
    'dining_table',
    'table',
    'Dining table',
    'floor',
    // Width is the table's length. Each style starts at its table's own
    // size, to the centimeter.
    [
      p('width', 'Width', 1.6, 0.9, 3, 0.01),
      p('depth', 'Depth', 0.9, 0.7, 1.2, 0.01),
      p('height', 'Height', 0.76, 0.6, 0.85, 0.01),
    ],
    DINING_VIOK.colors ?? {},
    DINING_VIOK.materials ?? {},
    undefined,
    // Three Pilma tables, from their stated sizes and product photos.
    [
      DINING_VIOK,
      {
        id: 'deva',
        label: 'Porcelain in Teak',
        // 180 by 100 cm, 77 cm tall.
        params: { width: 1.8, depth: 1, height: 0.77 },
        colors: { top: '#ddd0ba', frame: '#a9713f' },
        materials: { top: 'ceramic', frame: 'wood' },
      },
      {
        id: 'spider',
        label: 'Crossed Teak Trestles',
        // 200 by 100 cm, 75 cm tall.
        params: { width: 2, depth: 1, height: 0.75 },
        colors: { top: '#9b7e5f', frame: '#87694b' },
        materials: { top: 'wood', frame: 'wood' },
      },
    ],
  ),
  kind(
    'coffee_table',
    'table',
    'Coffee table',
    'floor',
    [width(1.1, 0.6, 1.6), depth(0.6, 0.4, 0.9), height(0.4, 0.3, 0.5)],
    { top: SCANDI.oak, legs: SCANDI.oak, shelf: SCANDI.oak },
    { top: 'wood', legs: 'wood', shelf: 'wood' },
    undefined,
    [
      { id: 'slatted', label: 'Oak Slatted' },
      {
        id: 'lack',
        label: 'Block Lakka',
        // 90 by 55 cm, 45 cm tall.
        params: { width: 0.9, depth: 0.55, height: 0.45 },
        colors: { top: '#f3f1ec', legs: '#f3f1ec', shelf: '#f3f1ec' },
        materials: { top: 'matte', legs: 'matte', shelf: 'matte' },
      },
      {
        id: 'tulip',
        label: 'Oval Tulpa',
        // 107 by 71 cm, 39 cm tall.
        params: { width: 1.07, depth: 0.71, height: 0.39 },
        colors: { top: '#e9e5de', base: '#f2f1ee' },
        materials: { top: 'ceramic', base: 'matte' },
      },
      {
        id: 'frame',
        label: 'Steel Square',
        // 100 by 60 cm, 38 cm tall.
        params: { width: 1, depth: 0.6, height: 0.38 },
        colors: { top: '#3a3b3d', legs: '#3a3b3d' },
        materials: { top: 'metal', legs: 'metal' },
      },
    ],
  ),
  kind(
    'side_table',
    'table',
    'Side table',
    'floor',
    // The nightstand was a kind of its own, and a saved one is read as a
    // side table in that style.
    [width(0.45, 0.3, 0.7), depth(0.45, 0.3, 0.7), height(0.5, 0.35, 0.75)],
    { top: SCANDI.oak, legs: SCANDI.oak, shelf: SCANDI.oak },
    { top: 'wood', legs: 'wood', shelf: 'wood' },
    undefined,
    [
      { id: 'shelf', label: 'Oak Tier' },
      {
        id: 'nightstand',
        label: 'Drawer Natta',
        params: { width: 0.45, depth: 0.4, height: 0.5 },
        colors: { cabinet: SCANDI.oak, drawers: SCANDI.offWhite, handles: SCANDI.slate },
        materials: { cabinet: 'wood', drawers: 'matte', handles: 'metal' },
      },
      {
        id: 'tray',
        label: 'Tray Glada',
        // 45 cm across, 53 cm tall.
        params: { width: 0.45, depth: 0.45, height: 0.53 },
        colors: { tray: '#8c9483', legs: '#8c9483' },
        materials: { tray: 'matte', legs: 'matte' },
      },
    ],
  ),
  kind(
    'desk',
    'table',
    'Desk',
    'floor',
    // The ranges cover both styles: the office table goes up far enough to
    // stand at.
    [width(1.4, 0.9, 2.4), depth(0.7, 0.5, 1), height(0.75, 0.65, 1.2)],
    DESK_WRITING.colors ?? {},
    DESK_WRITING.materials ?? {},
    // Every style is a standing desk: on, or at a level, the top goes up,
    // and whatever stands on it goes up with it.
    TOGGLE_LEVEL,
    // The office table was a kind of its own, and a saved one is read as a
    // desk in that style.
    [
      DESK_WRITING,
      {
        id: 'office_table',
        label: 'Office table',
        params: { width: 1.6, depth: 0.8, height: 0.75 },
        colors: { top: SCANDI.oak, frame: SCANDI.charcoal, tray: SCANDI.slate },
        materials: { top: 'wood', frame: 'metal', tray: 'metal' },
      },
      {
        id: 'pedestal',
        label: 'Mikka Pedestal',
        // 142 by 75 cm, with a three drawer pedestal.
        params: { width: 1.42, depth: 0.75, height: 0.75 },
        colors: { top: '#f3f1ec', legs: '#f3f1ec', drawer: '#f3f1ec', handle: '#8a8f92' },
        materials: { top: 'matte', legs: 'matte', drawer: 'matte', handle: 'metal' },
      },
    ],
  ),

  // Storage
  kind(
    'bookshelf',
    'storage',
    'Bookshelf',
    'floor',
    // The shelves between the bottom and the top follow the height, and a
    // few can be added or taken away.
    [
      width(0.9, 0.5, 2),
      depth(0.32, 0.2, 0.5),
      height(1.8, 0.8, 2.4),
      only(adjust('shelves', 'Shelves'), ['billy', 'string']),
    ],
    { cabinet: SCANDI.oak, shelves: SCANDI.oak },
    { cabinet: 'wood', shelves: 'wood' },
    undefined,
    [
      { id: 'billy', label: 'Birch Bilbo' },
      {
        id: 'kallax',
        label: 'Cube Kalla',
        // Two cubes by four, 77 by 147 cm.
        params: { width: 0.77, depth: 0.39, height: 1.47 },
        colors: { cabinet: '#f3f1ec', shelves: '#f3f1ec' },
        materials: { cabinet: 'matte', shelves: 'matte' },
      },
      {
        id: 'string',
        label: 'Wire Strand',
        // Two floor panels 200 cm tall, 30 cm deep, with 78 cm shelves.
        params: { width: 0.82, depth: 0.3, height: 2 },
        colors: { cabinet: '#2b2c2d', shelves: SCANDI.walnut },
        materials: { cabinet: 'metal', shelves: 'wood' },
      },
    ],
  ),
  kind(
    'sideboard',
    'storage',
    'Sideboard',
    'floor',
    // Hung on the wall it loses its legs, and the case keeps its height.
    [
      width(1.6, 0.9, 2.6),
      depth(0.42, 0.3, 0.6),
      height(0.75, 0.6, 1),
      flag('wall', 'Wall mounted'),
      whenOn(base(0.4), 'wall'),
    ],
    { cabinet: SCANDI.oak, fronts: SCANDI.offWhite, handles: SCANDI.slate },
    { cabinet: 'wood', fronts: 'matte', handles: 'metal' },
    undefined,
    [
      { id: 'oak', label: 'Oak Board' },
      {
        id: 'credenza',
        label: 'Slide Credenza',
        // Four sliding doors, 190 by 46 cm and 65 cm tall.
        params: { width: 1.9, depth: 0.46, height: 0.65 },
        colors: { cabinet: '#7a5238', fronts: '#8d6143', frame: '#c9ccce' },
        materials: { cabinet: 'wood', fronts: 'wood', frame: 'metal' },
      },
      {
        id: 'besta',
        label: 'Push Bessa',
        // Three 60 cm units on metal legs, 180 by 42 cm, 74 cm tall.
        params: { width: 1.8, depth: 0.42, height: 0.74 },
        colors: { cabinet: '#f3f1ec', fronts: '#f3f1ec', legs: '#8a8f92' },
        materials: { cabinet: 'matte', fronts: 'matte', legs: 'metal' },
      },
    ],
  ),
  kind(
    'wardrobe',
    'storage',
    'Wardrobe',
    'floor',
    [width(1.2, 0.6, 2.6), depth(0.6, 0.45, 0.75), height(2.1, 1.4, 2.5)],
    { cabinet: SCANDI.offWhite, fronts: SCANDI.oak, handles: SCANDI.slate },
    { cabinet: 'matte', fronts: 'wood', handles: 'metal' },
    undefined,
    [
      { id: 'hinged', label: 'Oak Doors' },
      {
        id: 'sliding',
        label: 'Sliding Paxa',
        // 150 by 66 cm, 201 cm tall, with two sliding doors.
        params: { width: 1.5, depth: 0.66, height: 2.01 },
        colors: { cabinet: SCANDI.offWhite, fronts: '#d8d3ca', handles: '#8a8f92' },
        materials: { cabinet: 'matte', fronts: 'matte', handles: 'metal' },
      },
      {
        id: 'rail',
        label: 'Open Rail',
        // 99 by 46 cm, 151 cm tall.
        params: { width: 0.99, depth: 0.46, height: 1.51 },
        colors: { frame: '#f3f1ec' },
        materials: { frame: 'metal' },
      },
    ],
  ),
  kind(
    'dresser',
    'storage',
    'Dresser',
    'floor',
    [width(1, 0.6, 1.8), depth(0.45, 0.35, 0.6), height(0.9, 0.6, 1.3)],
    { cabinet: SCANDI.oak, fronts: SCANDI.offWhite, handles: SCANDI.slate },
    { cabinet: 'wood', fronts: 'matte', handles: 'metal' },
    undefined,
    [
      { id: 'oak', label: 'Oak Chest' },
      {
        id: 'malm',
        label: 'Plain Malma',
        // Four drawers, 80 by 48 cm, 100 cm tall.
        params: { width: 0.8, depth: 0.48, height: 1 },
        colors: { cabinet: '#f3f1ec', fronts: '#f3f1ec' },
        materials: { cabinet: 'matte', fronts: 'matte' },
      },
      {
        id: 'hemnes',
        label: 'Painted Hemma',
        // Three drawers, 108 by 50 cm, 96 cm tall.
        params: { width: 1.08, depth: 0.5, height: 0.96 },
        colors: { cabinet: '#efece5', fronts: '#efece5', handles: '#e2ddd3' },
        materials: { cabinet: 'wood', fronts: 'wood', handles: 'wood' },
      },
    ],
  ),
  kind(
    'shoe_rack',
    'storage',
    'Shoe rack',
    'floor',
    [width(0.8, 0.5, 1.4), depth(0.3, 0.2, 0.4), height(0.5, 0.3, 1.4)],
    { frame: SCANDI.oak, rails: SCANDI.oak },
    { frame: 'wood', rails: 'wood' },
    undefined,
    [
      { id: 'rungs', label: 'Oak Rungs' },
      {
        id: 'cabinet',
        label: 'Tilt Hemma',
        // Two tilting compartments, 89 by 30 cm, 127 cm tall.
        params: { width: 0.89, depth: 0.3, height: 1.27 },
        colors: { frame: '#efece5', fronts: '#efece5', handles: '#e2ddd3' },
        materials: { frame: 'wood', fronts: 'wood', handles: 'wood' },
      },
      {
        id: 'bench',
        label: 'Seat Tjusa',
        // 81 by 34 cm, 50 cm tall.
        params: { width: 0.81, depth: 0.34, height: 0.5 },
        colors: { frame: '#2b2c2d', seat: SCANDI.oak, rails: '#2b2c2d' },
        materials: { frame: 'metal', seat: 'wood', rails: 'metal' },
      },
    ],
  ),
  kind(
    'wall_shelf',
    'storage',
    'Wall shelf',
    'wall',
    [width(0.9, 0.4, 1.8), depth(0.24, 0.15, 0.4), height(1.5, 0.6, 2.3)],
    { shelf: SCANDI.oak },
    { shelf: 'wood' },
    undefined,
    [
      {
        id: 'floating',
        label: 'Floating Lakka',
        // 110 by 26 cm, 5 cm thick.
        params: { width: 1.1, depth: 0.26 },
        colors: { shelf: '#f3f1ec' },
        materials: { shelf: 'matte' },
      },
      { id: 'ledge', label: 'Lipped Ledge' },
      {
        id: 'string',
        label: 'Wire Pocket',
        // 60 by 15 cm, 50 cm tall, with three shelves.
        params: { width: 0.6, depth: 0.15 },
        colors: { panels: '#f2f1ee', shelf: '#f2f1ee' },
        materials: { panels: 'metal', shelf: 'matte' },
      },
    ],
  ),

  // Bedroom
  kind(
    'bed_double',
    'bed',
    'Bed',
    'floor',
    [width(1.6, 0.9, 2), length(2.05, 1.8, 2.3), flag('headboard', 'Headboard', 1)],
    BED_HEADBOARD.colors ?? {},
    BED_HEADBOARD.materials ?? {},
    undefined,
    [
      BED_HEADBOARD,
      {
        id: 'upholstered',
        label: 'Channel Rest',
        colors: { frame: '#a39a8c', bedding: SCANDI.offWhite, pillows: '#d8d2c6' },
        materials: { frame: 'fabric', bedding: 'fabric', pillows: 'fabric' },
      },
      {
        id: 'low',
        label: 'Ledge Low',
        colors: { frame: '#c49a6c', bedding: '#e9e4da', pillows: SCANDI.offWhite },
        materials: { frame: 'wood', bedding: 'fabric', pillows: 'fabric' },
      },
    ],
  ),

  // Kitchen
  kind(
    'kitchen_counter',
    'kitchen',
    'Counter',
    'floor',
    // A run of 60 cm base units and one that takes up the rest of the
    // width. By default that one grows from nothing to a full unit. The wide
    // switch has it grow from one unit to just short of two instead, so no
    // unit is ever narrower than a full one. The growing unit can stand at
    // any place in the run.
    [
      width(1.8, 0.6, 4),
      depth(0.62, 0.5, 1.2),
      height(0.9, 0.8, 1.1),
      flag('wide', 'Wide module'),
      cycle('grow', 'Growing module'),
    ],
    COUNTER_RUN.colors ?? {},
    COUNTER_RUN.materials ?? {},
    // On, the drawers slide out and the doors stand open.
    TOGGLE,
    [
      COUNTER_RUN,
      {
        id: 'island',
        label: 'Island',
        // Deeper, with the worktop overhanging at the back for stools.
        params: { depth: 0.9, height: 0.92 },
        colors: { worktop: '#ece6da', cabinets: SCANDI.oak, fronts: SCANDI.oak },
      },
    ],
  ),
  kind(
    'upper_cabinets',
    'kitchen',
    'Upper cabinets',
    'wall',
    // Built from 60 cm units the way the counter is, with the same wide
    // switch and growing unit, so a run of them can line up over one. The
    // height is the top of the units, which are 70 cm tall, so by default
    // they clear a 90 cm counter by 60 cm.
    [
      width(1.8, 0.6, 4),
      depth(0.35, 0.25, 0.45),
      height(2.2, 1.8, 2.4),
      flag('wide', 'Wide module'),
      cycle('grow', 'Growing module'),
    ],
    { cabinets: SCANDI.oak, doors: SCANDI.oak, handles: SCANDI.slate },
    { cabinets: 'wood', doors: 'wood', handles: 'metal' },
    TOGGLE,
  ),
  kind(
    'fridge',
    'kitchen',
    'Fridge',
    'floor',
    [
      width(0.6, 0.5, 0.95),
      depth(0.66, 0.5, 0.8),
      height(2.03, 0.8, 2.1),
      base(),
      only(flag('flip', 'Hinge right'), ['bespoke']),
    ],
    { body: SCANDI.offWhite, doors: SCANDI.offWhite, handles: SCANDI.slate },
    { body: 'ceramic', doors: 'ceramic', handles: 'metal' },
    TOGGLE,
    [
      { id: 'bespoke', label: 'Pocket Grip' },
      {
        id: 'side_by_side',
        label: 'Twin Tower',
        params: { width: 0.91, depth: 0.72, height: 1.78 },
        colors: { body: '#a9adaf', doors: '#c3c6c7', handles: '#8a8e91' },
        materials: { body: 'metal', doors: 'metal', handles: 'metal' },
      },
    ],
  ),
  kind(
    'oven',
    'kitchen',
    'Oven',
    'floor',
    [width(0.6, 0.45, 0.9), depth(0.55, 0.5, 0.7), height(0.6, 0.45, 0.9), base()],
    { body: '#34383b', glass: '#111416', handle: '#b9bdbf', display: '#16191b' },
    { body: 'ceramic', glass: 'ceramic', handle: 'metal', display: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'hob',
    'kitchen',
    'Hob',
    'floor',
    [width(0.6, 0.3, 0.9), depth(0.52, 0.4, 0.7), lift(0.9)],
    { glass: '#15181a', zones: '#6c7175' },
    { glass: 'ceramic', zones: 'metal' },
    TOGGLE,
    [
      { id: 'induction', label: 'Black Flux' },
      {
        id: 'gas',
        label: 'Iron Crown',
        colors: { top: '#c3c6c7', grids: '#26282a', burners: '#b08d57', knobs: '#2e3133' },
        materials: { top: 'metal', grids: 'matte', burners: 'metal', knobs: 'metal' },
        params: { width: 0.58 },
      },
    ],
  ),
  kind(
    'extractor_hood',
    'kitchen',
    'Extractor hood',
    'ceiling',
    [width(0.6, 0.45, 1.2), depth(0.5, 0.35, 0.6)],
    { canopy: '#c4c7c8', chimney: '#c4c7c8', filter: '#9a9fa2', controls: '#1c1f21' },
    { canopy: 'metal', chimney: 'metal', filter: 'metal', controls: 'ceramic' },
    TOGGLE_LEVEL,
  ),
  kind(
    'ceiling_extractor',
    'kitchen',
    'Ceiling extractor',
    'ceiling',
    [width(0.87, 0.6, 1.4), depth(0.51, 0.35, 0.9)],
    { panel: SCANDI.offWhite, grille: '#2e3133' },
    { panel: 'matte', grille: 'metal' },
    TOGGLE_LEVEL,
  ),
  kind(
    'dishwasher',
    'kitchen',
    'Dishwasher',
    'floor',
    [width(0.6, 0.45, 0.8), depth(0.6, 0.5, 0.7), height(0.845, 0.7, 0.95), base()],
    { body: '#b9bdbf', top: '#3a3d40', door: '#c9cccd', controls: '#1c1f21' },
    { body: 'metal', top: 'matte', door: 'metal', controls: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'kitchen_sink',
    'kitchen',
    'Sink',
    'floor',
    [width(0.54, 0.4, 1.2), depth(0.44, 0.35, 0.7), lift(0.9)],
    { bowl: '#b9bdbf', tap: '#c4c7c8' },
    { bowl: 'metal', tap: 'metal' },
    TOGGLE,
    [
      { id: 'undermount', label: 'Steel Andor' },
      {
        id: 'belfast',
        label: 'Fireclay Hollin',
        colors: { bowl: '#f2f0ea', tap: '#b08d57' },
        materials: { bowl: 'ceramic', tap: 'metal' },
        params: { width: 0.6, depth: 0.5 },
      },
      {
        id: 'inset',
        label: 'Granite Marra',
        colors: { bowl: '#56544f', tap: '#2e3133' },
        materials: { bowl: 'matte', tap: 'metal' },
        params: { width: 1, depth: 0.5 },
      },
    ],
  ),
  kind(
    'microwave',
    'kitchen',
    'Microwave',
    'floor',
    [width(0.44, 0.35, 0.7), depth(0.35, 0.3, 0.5), height(0.26, 0.2, 0.45), lift(1.2)],
    { body: '#c4c7c8', door: '#1c1f21', glass: '#111416', knobs: '#8f9497' },
    { body: 'metal', door: 'ceramic', glass: 'ceramic', knobs: 'metal' },
    TOGGLE,
  ),
  kind(
    'coffee_machine',
    'kitchen',
    'Coffee machine',
    'floor',
    [width(0.36, 0.08, 0.5), depth(0.45, 0.25, 0.55), height(0.38, 0.18, 0.5), lift(0.92)],
    { body: SCANDI.offWhite, steel: '#c4c7c8', wood: SCANDI.walnut },
    { body: 'ceramic', steel: 'metal', wood: 'wood' },
    TOGGLE,
    [
      {
        id: 'bambino',
        label: 'Compact Bambu',
        params: { width: 0.195, depth: 0.32, height: 0.31 },
        colors: { body: '#3a3d40', steel: '#aeb3b5', handle: '#1c1f21' },
        materials: { body: 'metal', steel: 'metal', handle: 'matte' },
      },
      { id: 'linea', label: 'Steel Lineo' },
      {
        id: 'pod',
        label: 'Pod Nib',
        params: { width: 0.084, depth: 0.33, height: 0.204 },
        colors: { body: '#1f2123', accent: '#aeb3b5' },
        materials: { body: 'matte', accent: 'metal' },
      },
    ],
  ),
  kind(
    'kettle',
    'kitchen',
    'Kettle',
    'floor',
    [size(0.15, 0.1, 0.22), lift(0.92)],
    { body: '#f2f2f0', fittings: '#8a8f92' },
    { body: 'matte', fittings: 'matte' },
    TOGGLE,
    [
      { id: 'jug', label: 'Chalk Jug' },
      {
        id: 'gooseneck',
        label: 'Matte Swan',
        colors: { body: '#2b2c2d', fittings: SCANDI.walnut },
        materials: { body: 'matte', fittings: 'wood' },
      },
    ],
  ),
  kind(
    'toaster',
    'kitchen',
    'Toaster',
    'floor',
    [width(0.31, 0.2, 0.45), depth(0.2, 0.1, 0.3), lift(0.92)],
    { body: '#e8e3d8', trim: '#c4c7c8' },
    { body: 'ceramic', trim: 'metal' },
    TOGGLE,
    [
      // Two slots in a rounded body, 31 cm long. Made shallow enough, either
      // style is left with a single slot.
      { id: 'retro', label: 'Twin Loaf' },
      {
        id: 'long',
        label: 'Long Slot',
        // Two long slots side by side, 42 cm long.
        params: { width: 0.42, depth: 0.17 },
        colors: { body: '#c4c7c8', trim: '#2b2e31' },
        materials: { body: 'metal', trim: 'matte' },
      },
    ],
  ),
  kind(
    'cooking_robot',
    'kitchen',
    'Cooking robot',
    'floor',
    [width(0.33, 0.25, 0.45), lift(0.92)],
    { body: SCANDI.offWhite, jug: '#c4c7c8', lid: '#8a8f92', display: '#16191b' },
    { body: 'ceramic', jug: 'metal', lid: 'matte', display: 'ceramic' },
    TOGGLE,
    [
      // A tall jug set into a base with a screen on its front.
      { id: 'jug', label: 'Mix Chef' },
      {
        id: 'bowl',
        label: 'Dome Cook',
        // A wide bowl on a squat round base, under a domed lid.
        params: { width: 0.36 },
        colors: { body: '#2b2e31', jug: '#c4c7c8', lid: '#c4c7c8', display: '#16191b' },
        materials: { body: 'matte', jug: 'metal', lid: 'metal', display: 'ceramic' },
      },
    ],
  ),
  kind(
    'air_fryer',
    'kitchen',
    'Air fryer',
    'floor',
    [width(0.28, 0.2, 0.45), lift(0.92)],
    { body: '#2b2e31', handle: '#1c1d1f', display: '#16191b' },
    { body: 'matte', handle: 'matte', display: 'ceramic' },
    TOGGLE,
    [
      // One drawer in a rounded cube.
      { id: 'basket', label: 'Crisp Cube' },
      {
        id: 'dual',
        label: 'Twin Drawer',
        // Two drawers side by side, 40 cm wide.
        params: { width: 0.4 },
        colors: { body: '#e8e6e1', handle: '#2b2e31', display: '#16191b' },
        materials: { body: 'matte', handle: 'matte', display: 'ceramic' },
      },
    ],
  ),

  // Laundry
  kind(
    'washing_machine',
    'laundry',
    'Washing machine',
    'floor',
    [width(0.6, 0.5, 0.8), depth(0.6, 0.5, 0.7), height(0.85, 0.7, 1), base()],
    { body: '#f4f4f2', door: '#c4c7c8', controls: '#e6e7e6' },
    { body: 'ceramic', door: 'metal', controls: 'ceramic' },
    TOGGLE_LEVEL,
  ),
  kind(
    'dryer',
    'laundry',
    'Dryer',
    'floor',
    [width(0.6, 0.5, 0.8), depth(0.6, 0.5, 0.7), height(0.85, 0.7, 1), base()],
    { body: '#f4f4f2', door: '#3d4144', controls: '#e6e7e6' },
    { body: 'ceramic', door: 'metal', controls: 'ceramic' },
    TOGGLE_LEVEL,
  ),

  // Bathroom
  kind(
    'toilet',
    'bathroom',
    'Toilet',
    'floor',
    [width(0.37, 0.3, 0.5), depth(0.57, 0.45, 0.9)],
    { pan: BATH_WHITE, seat: BATH_WHITE, flush: '#c4c7c8' },
    { pan: 'ceramic', seat: 'ceramic', flush: 'metal' },
    TOGGLE,
    [
      {
        id: 'arc',
        label: 'Arc Pair',
        params: { width: 0.37, depth: 0.62 },
        colors: { pan: BATH_WHITE, seat: BATH_WHITE, flush: '#c4c7c8' },
        materials: { pan: 'ceramic', seat: 'ceramic', flush: 'metal' },
      },
      {
        id: 'wall_hung',
        label: 'Vela Hung',
        colors: { pan: BATH_WHITE, seat: BATH_WHITE, flush: '#2b2c2d' },
        materials: { pan: 'ceramic', seat: 'ceramic', flush: 'matte' },
      },
      {
        id: 'close_coupled',
        label: 'Oda Pair',
        colors: { pan: BATH_WHITE, seat: SCANDI.oak, flush: '#c4c7c8' },
        materials: { pan: 'ceramic', seat: 'wood', flush: 'metal' },
        params: { depth: 0.65 },
      },
      { id: 'square', label: 'Kant Pair', params: { width: 0.38, depth: 0.65 } },
    ],
  ),
  kind(
    'basin',
    'bathroom',
    'Basin',
    'floor',
    [width(0.6, 0.4, 1.2), depth(0.46, 0.35, 0.6), height(0.85, 0.7, 0.95)],
    { bowl: BATH_WHITE, tap: '#c4c7c8' },
    { bowl: 'ceramic', tap: 'metal' },
    TOGGLE,
    [
      {
        id: 'vanity',
        label: 'Lumen Console',
        colors: { bowl: BATH_WHITE, vanity: SCANDI.oak, tap: '#c4c7c8' },
        materials: { bowl: 'ceramic', vanity: 'wood', tap: 'metal' },
        params: { width: 0.8, depth: 0.48 },
      },
      { id: 'wall_hung', label: 'Pell Hung' },
      {
        id: 'pedestal',
        label: 'Stave Pedestal',
        colors: { bowl: BATH_WHITE, tap: '#b08d57' },
        materials: { bowl: 'ceramic', tap: 'metal' },
        params: { depth: 0.45 },
      },
    ],
  ),
  kind(
    'bathtub',
    'bathroom',
    'Bathtub',
    'floor',
    [width(0.8, 0.6, 1), length(1.7, 1.3, 2)],
    { tub: BATH_WHITE, tap: '#c4c7c8' },
    { tub: 'ceramic', tap: 'metal' },
    TOGGLE,
    [
      { id: 'freestanding', label: 'Isle Shell', params: { width: 0.85, length: 1.8 } },
      {
        id: 'built_in',
        label: 'Inlet Steel',
        colors: { tub: BATH_WHITE, panel: BATH_TILE, tap: '#c4c7c8' },
        materials: { tub: 'ceramic', panel: 'matte', tap: 'metal' },
        params: { width: 0.75, length: 1.7 },
      },
      {
        id: 'roll_top',
        label: 'Foundry Roll',
        colors: { tub: BATH_WHITE, feet: '#b08d57', tap: '#b08d57' },
        materials: { tub: 'ceramic', feet: 'metal', tap: 'metal' },
        params: { width: 0.91, length: 1.9 },
      },
    ],
  ),
  kind(
    'shower',
    'bathroom',
    'Shower',
    'floor',
    [
      width(0.9, 0.7, 1.8),
      depth(0.9, 0.7, 1.8),
      height(2, 1.8, 2.3),
      p('glass', 'Glass sides', 2, 0, 3, 1, ''),
      flag('flip', 'Glass on the right'),
    ],
    { tray: SCANDI.offWhite, glass: '#dbe6e9', frame: SCANDI.slate, tap: SCANDI.slate },
    { tray: 'ceramic', glass: 'ceramic', frame: 'metal', tap: 'metal' },
    TOGGLE,
  ),
  kind(
    'towel_rail',
    'bathroom',
    'Towel rail',
    'wall',
    [width(0.6, 0.3, 1), height(1.05, 0.4, 1.7), p('sill', 'Off the floor', 0.65, 0, 1.2)],
    { rail: SCANDI.slate, towel: SCANDI.linen },
    { rail: 'metal', towel: 'fabric' },
    TOGGLE,
    [
      { id: 'grouped', label: 'Quad Tier' },
      {
        id: 'ladder',
        label: 'Bow Ladder',
        params: { width: 0.5 },
        colors: { rail: '#e9e7e2', towel: '#b9c4c9' },
      },
    ],
  ),

  // Decor
  kind(
    'half_wall',
    'decor',
    'Half wall',
    'floor',
    [width(2, 0.4, 8), depth(0.2, 0.1, 0.4), height(1, 0.4, 1.6)],
    { wall: SCANDI.offWhite },
    { wall: 'matte' },
  ),
  kind(
    'stairs',
    'decor',
    'Stairs',
    'floor',
    // A flight that climbs a whole storey: its top reaches the next floor,
    // so it rises the room's height unless told otherwise. Width is the
    // flight's, length how far it runs across the floor, and the quarter
    // turn adds a second flight across the top. The risers share out the
    // rise, each as close to 18 cm as a whole number of them comes. A low
    // rise makes a few steps up to a raised floor.
    [
      width(0.9, 0.6, 1.6),
      length(3.25, 0.3, 6),
      p('height', 'Rise', CEILING_HEIGHT_M, 0.15, 4),
      only(p('reach', 'Second flight', 1.6, 0.5, 4), ['quarter']),
      only(flag('flip', 'Turn left'), ['quarter']),
      only(flag('rail', 'Rail on left'), ['open', 'closed']),
    ],
    STAIRS_OPEN.colors ?? {},
    STAIRS_OPEN.materials ?? {},
    NONE,
    [
      STAIRS_OPEN,
      {
        id: 'closed',
        label: 'White Closed String',
        // The same 90 cm flight, its treads, risers and the string wall on
        // its open side all painted white under an oak handrail.
        colors: { treads: '#f3f1ec', risers: '#f3f1ec', sides: '#f3f1ec', rail: SCANDI.oak },
        materials: { treads: 'matte', risers: 'matte', sides: 'matte', rail: 'wood' },
      },
      {
        id: 'quarter',
        label: 'Quarter Turn',
        // A 90 cm flight that turns on a square landing at the top: 2.2 m
        // up the first flight and 1.6 m across the second, a common way to
        // fit a storey into a hall.
        params: { length: 2.2, reach: 1.6 },
        colors: { treads: SCANDI.oak, risers: '#f3f1ec', rail: '#2b2c2d' },
        materials: { treads: 'wood', risers: 'matte', rail: 'metal' },
      },
      {
        id: 'floating',
        label: 'Floating Cantilever',
        // 6 cm oak treads the full width of the flight, held in the wall
        // on one side, with no strings, risers or rail.
        colors: { treads: SCANDI.oak },
        materials: { treads: 'wood' },
      },
    ],
  ),
  kind(
    'railing',
    'decor',
    'Railing',
    'floor',
    // A balustrade along the edge of a raised floor or beside a few steps.
    // Width is how long the run is, height the handrail's, 90 cm as most
    // building codes ask of one inside a home.
    [width(1.2, 0.3, 6), height(0.9, 0.6, 1.2)],
    { rail: '#2b2c2d', balusters: '#2b2c2d' },
    { rail: 'metal', balusters: 'metal' },
    NONE,
    [
      // Black steel: square end posts, a round handrail, a flat bar low
      // down and slim round balusters 11 cm apart.
      { id: 'steel', label: 'Steel Balusters' },
      {
        id: 'glass',
        label: 'Glass Panel',
        // A frameless pane in a brushed aluminium floor shoe, capped with
        // an oak handrail.
        colors: { glass: '#dfeef0', shoe: '#c9ccce', rail: SCANDI.oak },
        materials: { glass: 'ceramic', shoe: 'metal', rail: 'wood' },
      },
      {
        id: 'spindle',
        label: 'Oak Spindle',
        // Square newels, spindles and handrail all in bare oak, the
        // classic timber balustrade.
        colors: { posts: SCANDI.oak, spindles: SCANDI.oak, rail: SCANDI.oak },
        materials: { posts: 'wood', spindles: 'wood', rail: 'wood' },
      },
    ],
  ),
  kind(
    'rug',
    'decor',
    'Rug',
    'floor',
    [width(2, 0.6, 4), depth(1.4, 0.5, 3), only(flag('plain', 'No lines'), ['border', 'kilim', 'round'])],
    { field: SCANDI.linen, border: SCANDI.clay },
    { field: 'carpet', border: 'carpet' },
    undefined,
    [
      {
        id: 'shag',
        label: 'Plain Pile',
        colors: { field: '#cfc8bc' },
        materials: { field: 'carpet' },
        params: { width: 2, depth: 1.4 },
      },
      { id: 'border', label: 'Nord Border' },
      {
        id: 'kilim',
        label: 'Kilim Stripe',
        colors: { field: '#e9e2d4', border: '#3f4a52', accent: '#c47a52' },
        materials: { field: 'carpet', border: 'carpet', accent: 'carpet' },
        params: { width: 2.3, depth: 1.6 },
      },
      {
        id: 'round',
        label: 'Round Loop',
        colors: { field: '#d9cdb8', border: '#b9a584' },
        materials: { field: 'carpet', border: 'carpet' },
        params: { width: 1.6, depth: 1.6 },
      },
    ],
  ),
  kind(
    'plant_large',
    'decor',
    'Floor plant',
    'floor',
    [size(0.8, 0.3, 1.6), height(1.6, 0.6, 2.4), dryBelow()],
    { pot: SCANDI.offWhite, soil: '#3c332b', stems: '#7a6a58', leaves: '#4f7d3c' },
    { pot: 'ceramic', soil: 'matte', stems: 'wood', leaves: 'wood' },
    // A plant wilts when the soil its sensor reads goes dry.
    READOUT,
    [
      { id: 'fiddle', label: 'Fiddle leaf fig' },
      {
        id: 'monstera',
        label: 'Monstera',
        colors: { pot: '#3a3a3a', soil: '#6e5a3a', stems: '#6a9a50', leaves: '#3a6e42' },
        materials: { pot: 'ceramic', soil: 'matte', stems: 'matte', leaves: 'wood' },
        params: { size: 1.1, height: 1.3 },
      },
      {
        id: 'kentia',
        label: 'Kentia palm',
        colors: { pot: '#b89a6a', soil: '#3c332b', stems: '#5f8a45', leaves: '#4c7e40' },
        materials: { pot: 'fabric', soil: 'matte', stems: 'matte', leaves: 'wood' },
        params: { size: 1.3, height: 1.8 },
      },
      {
        id: 'mango',
        label: 'Mango plant',
        colors: { pot: '#c9b79c', soil: '#3c332b', stems: '#6e5a48', leaves: '#3a6a3a' },
        materials: { pot: 'ceramic', soil: 'matte', stems: 'matte', leaves: 'ceramic' },
        params: { size: 0.85, height: 1.5 },
      },
      {
        id: 'bird',
        label: 'Bird of paradise',
        colors: { pot: '#2b2c2d', soil: '#3c332b', stems: '#6f8a4a', leaves: '#4e7a44' },
        materials: { pot: 'ceramic', soil: 'matte', stems: 'matte', leaves: 'wood' },
        params: { size: 0.9, height: 1.9 },
      },
      {
        id: 'bamboo',
        label: 'Golden bamboo',
        colors: { pot: '#2f3133', soil: '#3c332b', stems: '#9fa35a', leaves: '#5d8a3e' },
        materials: { pot: 'ceramic', soil: 'matte', stems: 'ceramic', leaves: 'wood' },
        params: { size: 0.7, height: 1.9 },
      },
      {
        id: 'ficus',
        label: 'Weeping fig',
        colors: { pot: '#b5704a', soil: '#3c332b', stems: '#7a6a58', leaves: '#3f6e34' },
        materials: { pot: 'matte', soil: 'matte', stems: 'matte', leaves: 'ceramic' },
        params: { size: 1, height: 1.6 },
      },
    ],
  ),
  kind(
    'plant_small',
    'decor',
    'Shelf plant',
    'floor',
    [
      size(0.3, 0.12, 0.6),
      height(0.3, 0.12, 0.9),
      lift(0.75),
      only(p('trail', 'Trail', 0.6, 0.1, 1.5, 0.05), ['pothos']),
      dryBelow(),
    ],
    { pot: SCANDI.offWhite, soil: '#3c332b', stems: '#7aa648', leaves: '#5a9440', markings: '#e3d268' },
    { pot: 'ceramic', soil: 'matte', stems: 'matte', leaves: 'wood', markings: 'wood' },
    // A plant wilts when the soil its sensor reads goes dry.
    READOUT,
    [
      { id: 'pothos', label: 'Golden pothos' },
      {
        id: 'pilea',
        label: 'Chinese money plant',
        colors: { pot: '#c0703f', soil: '#3c332b', stems: '#7aa648', leaves: '#5b9442', markings: '#8fb05a' },
        materials: { pot: 'terracotta', soil: 'matte', stems: 'matte', leaves: 'wood', markings: 'matte' },
        params: { size: 0.3, height: 0.32 },
      },
      {
        id: 'snake',
        label: 'Snake plant',
        colors: { pot: '#9a9a96', soil: '#3c332b', stems: '#7aa648', leaves: '#3d6538', markings: '#a3b89c' },
        materials: { pot: 'concrete', soil: 'matte', stems: 'matte', leaves: 'wood', markings: 'wood' },
        params: { size: 0.2, height: 0.45 },
      },
    ],
  ),
  kind(
    'plant_wall',
    'decor',
    'Wall plant',
    'wall',
    [
      width(0.3, 0.2, 0.8),
      height(1.6, 0.6, 2.3),
      only(p('trail', 'Trail', 0.6, 0.1, 1.5, 0.05), ['pothos', 'pearls']),
      dryBelow(),
    ],
    { pot: SCANDI.offWhite, soil: '#3c332b', stems: '#7aa648', leaves: '#5a9440', markings: '#e3d268' },
    { pot: 'ceramic', soil: 'matte', stems: 'matte', leaves: 'wood', markings: 'wood' },
    // A plant wilts when the soil its sensor reads goes dry.
    READOUT,
    [
      { id: 'pothos', label: 'Golden pothos' },
      {
        id: 'pearls',
        label: 'String of pearls',
        colors: { pot: '#c0703f', soil: '#3c332b', stems: '#8a9a5a', leaves: '#7fa35a', markings: '#7fa35a' },
        materials: { pot: 'terracotta', soil: 'matte', stems: 'matte', leaves: 'ceramic', markings: 'matte' },
        params: { width: 0.24, trail: 0.8 },
      },
      {
        id: 'boston',
        label: 'Boston fern',
        colors: { pot: '#2a2a2a', soil: '#6b5238', stems: '#6e8e48', leaves: '#62a040', markings: '#62a040' },
        materials: { pot: 'metal', soil: 'matte', stems: 'matte', leaves: 'wood', markings: 'matte' },
        params: { width: 0.28 },
      },
    ],
  ),
  kind(
    'wall_mirror',
    'decor',
    'Wall mirror',
    'wall',
    [size(0.7, 0.3, 1.3), height(1.6, 0.8, 2.3)],
    { frame: SCANDI.oak, glass: SCANDI.mist },
    { frame: 'wood', glass: 'metal' },
    NONE,
    [
      { id: 'round', label: 'Halo Round' },
      {
        id: 'square',
        label: 'Frame Square',
        colors: { frame: '#2b2c2d', glass: SCANDI.mist },
        materials: { frame: 'metal', glass: 'metal' },
        params: { size: 0.6 },
      },
    ],
  ),
  kind(
    'wall_clock',
    'decor',
    'Wall clock',
    'wall',
    [size(0.3, 0.15, 0.6), height(1.9, 1, 2.4)],
    { rim: SCANDI.oak, face: SCANDI.offWhite, hands: SCANDI.charcoal, accent: '#c8553d' },
    { rim: 'wood', face: 'matte', hands: 'matte', accent: 'matte' },
    undefined,
    [
      { id: 'oak', label: 'Oak Ring' },
      {
        id: 'digital',
        label: 'Glow Digit',
        colors: { rim: '#232426', face: '#101112', accent: '#ff6a3d' },
        materials: { rim: 'matte', face: 'ceramic', accent: 'matte' },
        params: { size: 0.4 },
      },
      {
        id: 'ball',
        label: 'Ball Nelo',
        colors: { rim: '#6f5236', face: '#2b2c2d', hands: '#1f2123', accent: '#c8553d' },
        materials: { rim: 'wood', face: 'metal', hands: 'matte', accent: 'matte' },
        params: { size: 0.33 },
      },
    ],
  ),
  kind(
    'piano',
    'decor',
    'Piano',
    'floor',
    // Width runs along the keyboard, and depth back from it.
    [width(1.5, 1, 1.8), depth(0.6, 0.35, 2.2), height(1.25, 0.8, 1.4)],
    PIANO_UPRIGHT.colors ?? {},
    PIANO_UPRIGHT.materials ?? {},
    NONE,
    [
      PIANO_UPRIGHT,
      {
        id: 'grand',
        label: 'Black Baby Grand',
        // 150 by 160 cm, its lid down at 100 cm.
        params: { width: 1.5, depth: 1.6, height: 1 },
        colors: { case: '#26272a', keys: '#f4f1ea', sharps: '#1d1e20', fittings: '#c8ad72' },
        materials: { case: 'ceramic', keys: 'matte', sharps: 'matte', fittings: 'metal' },
      },
      {
        id: 'digital',
        label: 'Slim Digital',
        // 136 by 42 cm and 86 cm tall.
        params: { width: 1.36, depth: 0.42, height: 0.86 },
        colors: { case: '#232427', keys: '#f4f1ea', sharps: '#1d1e20', fittings: '#8a8f92' },
        materials: { case: 'matte', keys: 'matte', sharps: 'matte', fittings: 'metal' },
      },
    ],
  ),
  kind(
    'vase',
    'decor',
    'Vase',
    'floor',
    [size(0.18, 0.08, 0.4), height(0.3, 0.12, 0.7), lift(0.75)],
    { vase: SCANDI.mist, stems: SCANDI.leaf, flowers: SCANDI.leaf },
    { vase: 'ceramic', stems: 'matte', flowers: 'matte' },
  ),
  kind(
    'books',
    'decor',
    'Books',
    'floor',
    [width(0.26, 0.12, 0.5), height(0.14, 0.06, 0.3), lift(0.75)],
    { first: '#2f4a5c', second: '#c47a52', third: '#d8c9a8', pages: '#f1ebdd' },
    { first: 'matte', second: 'matte', third: 'matte', pages: 'matte' },
  ),
  kind(
    'curtain',
    'decor',
    'Curtain',
    'wall',
    [
      width(1.4, 0.6, 3),
      height(2.3, 1.2, 2.6),
      p('hem', 'Off floor', 0.02, 0, 1.5),
      // One panel drawn to one side instead of a pair parting in the middle.
      flag('single', 'One panel'),
      whenOn(flag('left', 'Opens to the left'), 'single'),
    ],
    { fabric: '#f4f1ea', rail: '#e9e7e2' },
    { fabric: 'fabric', rail: 'matte' },
    TOGGLE_LEVEL,
    [
      {
        id: 'eyelet',
        label: 'Velvet Eyelet',
        colors: { fabric: '#c9c9c6', rail: '#2b2c2d' },
        materials: { fabric: 'fabric', rail: 'metal' },
      },
      {
        id: 'wave',
        label: 'Sheer Wave',
        colors: { fabric: '#f4f1ea', rail: '#e9e7e2' },
        materials: { fabric: 'fabric', rail: 'matte' },
      },
    ],
  ),

  // Media
  kind(
    'tv',
    'media',
    'TV',
    'floor',
    [inches(60, 24, 110), lift(0)],
    { bezel: SCANDI.ink, screen: SCREEN_OFF_COLOR, stand: '#b4b8bb' },
    { bezel: 'matte', screen: 'ceramic', stand: 'metal' },
    TOGGLE,
  ),
  kind(
    'tv_wall',
    'media',
    'Wall TV',
    'wall',
    [inches(60, 24, 110), height(1.3, 0.8, 2)],
    { bezel: SCANDI.ink, screen: SCREEN_OFF_COLOR },
    { bezel: 'matte', screen: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'wall_tablet',
    'media',
    'Wall tablet',
    'wall',
    // Width is the tablet's as it hangs, and height how high its middle is.
    // It shows a dashboard while on, or what a player bound to it plays.
    [width(0.25, 0.12, 0.6), height(1.45, 0.8, 2)],
    { frame: '#f3f1ec', bezel: '#1c1d1f', screen: SCREEN_OFF_COLOR },
    { frame: 'matte', bezel: 'ceramic', screen: 'ceramic' },
    TOGGLE,
    [
      // A 10.9 inch tablet, 24.9 by 17.9 cm, set into a white wall frame
      // 28 by 21 cm that stands 1.5 cm off the wall.
      { id: 'frame', label: 'Flush Frame', params: { width: 0.28 } },
      {
        id: 'portrait',
        label: 'Slim Portrait',
        // An 8 inch tablet, 13.7 by 20.2 cm, upright on a magnetic mount.
        params: { width: 0.14 },
        colors: { frame: '#2b2c2d', bezel: '#1c1d1f', screen: SCREEN_OFF_COLOR },
        materials: { frame: 'metal', bezel: 'ceramic', screen: 'ceramic' },
      },
    ],
  ),
  kind(
    'soundbar',
    'media',
    'Soundbar',
    'floor',
    [width(0.9, 0.4, 1.6), height(0.08, 0.05, 0.15), lift(0)],
    { grille: SCANDI.linen, caps: SCANDI.charcoal },
    { grille: 'fabric', caps: 'matte' },
    TOGGLE_LEVEL,
    [
      { id: 'bar', label: 'Linen Bar' },
      {
        id: 'arc',
        label: 'Pebble Arc',
        // A long black capsule, 114 cm long, with a light across its top.
        params: { width: 1.14, height: 0.087 },
        colors: { grille: '#2b2e31', caps: '#1c1d1f' },
        materials: { grille: 'matte', caps: 'matte' },
      },
    ],
  ),
  kind(
    'speaker',
    'media',
    'Speaker',
    'floor',
    [size(0.14, 0.08, 0.35), only(height(0.17, 0.1, 0.5), ['pod', 'drum']), lift(0)],
    { mesh: '#e6e4df', top: '#2a2c2e' },
    { mesh: 'fabric', top: 'ceramic' },
    TOGGLE_LEVEL,
    [
      // 14 cm across and 17 cm tall.
      { id: 'pod', label: 'Round Pomo' },
      // 10 cm across.
      { id: 'mini', label: 'Orb Pomo', params: { size: 0.1 } },
      {
        id: 'drum',
        label: 'Linen Drum',
        params: { size: 0.16, height: 0.22 },
        colors: { grille: SCANDI.linen, base: SCANDI.oak },
        materials: { grille: 'fabric', base: 'wood' },
      },
    ],
  ),
  kind(
    'floor_speaker',
    'media',
    'Floor speaker',
    'floor',
    [width(0.22, 0.12, 0.4), height(1, 0.6, 1.3)],
    { cabinet: SCANDI.oak, drivers: '#1d1e20', trim: '#b4b8bb' },
    { cabinet: 'wood', drivers: 'matte', trim: 'metal' },
    TOGGLE_LEVEL,
    [
      { id: 'tower', label: 'Oak Stave' },
      {
        id: 'column',
        label: 'Linen Pillar',
        params: { width: 0.16, height: 1.1 },
        colors: { fabric: '#c9c4ba', metal: '#b4b8bb' },
        materials: { fabric: 'fabric', metal: 'metal' },
      },
    ],
  ),
  kind(
    'monitor',
    'media',
    'Monitor',
    'floor',
    [width(0.6, 0.4, 1.1), p('ratio', 'Height ratio', 0.6, 0.4, 0.8, 0.02, ''), lift(0)],
    { bezel: SCANDI.ink, screen: SCREEN_OFF_COLOR, stand: SCANDI.slate },
    { bezel: 'matte', screen: 'ceramic', stand: 'metal' },
    TOGGLE,
  ),
  kind(
    'game_console',
    'media',
    'Game console',
    'floor',
    [width(0.28, 0.08, 0.5), height(0.065, 0.04, 0.45), lift(0)],
    { body: SCANDI.offWhite, panel: SCANDI.charcoal },
    { body: 'matte', panel: 'matte' },
    TOGGLE,
    [
      // Laid flat: 28 cm wide and 6.5 cm tall.
      { id: 'slim', label: 'Slab S' },
      {
        id: 'tower',
        label: 'Monolith X',
        // 15 cm square and 30 cm tall.
        params: { width: 0.15, height: 0.3 },
        colors: { body: '#1b1c1e', vent: '#3f7d3a' },
        materials: { body: 'matte', vent: 'matte' },
      },
      {
        id: 'wing',
        label: 'Nimbus',
        // 10 cm wide and 39 cm tall.
        params: { width: 0.1, height: 0.39 },
        colors: { shell: '#f4f4f2', core: '#141517', light: '#3d7bff' },
        materials: { shell: 'ceramic', core: 'ceramic', light: 'matte' },
      },
    ],
  ),
  kind(
    'pc_tower',
    'media',
    'PC tower',
    'floor',
    [width(0.23, 0.15, 0.35), depth(0.46, 0.25, 0.6), height(0.48, 0.3, 0.65), lift(0)],
    { case: '#1c1d1f', glass: '#3a4046', accent: '#5b7cff' },
    { case: 'matte', glass: 'ceramic', accent: 'ceramic' },
    TOGGLE,
    [
      // A black case with a glass side onto three lit fans.
      { id: 'glass', label: 'Prism Tower' },
      {
        id: 'lattice',
        label: 'Lattice Tower',
        // An aluminium case with a pierced front, the light behind it.
        params: { width: 0.22, depth: 0.45, height: 0.53 },
        colors: { case: '#c9ccce', glass: '#c9ccce', accent: '#ffffff' },
        materials: { case: 'metal', glass: 'metal', accent: 'ceramic' },
      },
    ],
  ),
  kind(
    'laptop',
    'media',
    'Laptop',
    'floor',
    [width(0.31, 0.25, 0.42), lift(0.75)],
    { body: '#c9ccce', keys: '#2b2e31', screen: SCREEN_OFF_COLOR },
    { body: 'metal', keys: 'matte', screen: 'ceramic' },
    TOGGLE,
    [
      // A thin aluminium wedge, open.
      { id: 'slim', label: 'Slate Air' },
      {
        id: 'gaming',
        label: 'Raptor Pro',
        // A thicker black one, its keys lit when it runs.
        params: { width: 0.36 },
        colors: { body: '#1c1d1f', keys: '#141517', screen: SCREEN_OFF_COLOR, accent: '#3b8bff' },
        materials: { body: 'matte', keys: 'matte', screen: 'ceramic', accent: 'ceramic' },
      },
    ],
  ),
  kind(
    'wireless_charger',
    'media',
    'Wireless charger',
    'floor',
    [size(0.1, 0.05, 0.3), lift(0.75)],
    { pad: '#2b2e31', device: '#1c1d1f', ring: '#ffffff' },
    { pad: 'fabric', device: 'ceramic', ring: 'ceramic' },
    TOGGLE,
    [
      // A round pad, a phone lying on it while it charges.
      { id: 'phone', label: 'Halo Pad' },
      {
        id: 'watch',
        label: 'Watch Puck',
        params: { size: 0.06 },
        colors: { pad: '#f2efe9', device: '#1c1d1f', ring: '#ffffff' },
        materials: { pad: 'ceramic', device: 'ceramic', ring: 'ceramic' },
      },
      {
        id: 'earbuds',
        label: 'Bud Dock',
        params: { size: 0.08 },
        colors: { pad: '#2b2e31', device: '#f4f4f2', ring: '#ffffff' },
        materials: { pad: 'fabric', device: 'ceramic', ring: 'ceramic' },
      },
      {
        id: 'tablet',
        label: 'Tablet Easel',
        // A stand the tablet leans back on.
        params: { size: 0.2 },
        colors: { pad: '#c9ccce', device: '#1c1d1f', ring: '#ffffff' },
        materials: { pad: 'metal', device: 'ceramic', ring: 'ceramic' },
      },
    ],
  ),
  kind(
    'projector',
    'media',
    'Projector',
    'ceiling',
    [size(0.26, 0.15, 0.45), p('throw', 'Throw', 3, 1, 8, 0.1)],
    { body: SCANDI.offWhite, lens: '#2f3336', mount: SCANDI.slate },
    { body: 'matte', lens: 'ceramic', mount: 'metal' },
    TOGGLE,
  ),
  kind(
    'projector_portable',
    'media',
    'Portable projector',
    'floor',
    [size(0.1, 0.07, 0.16), p('throw', 'Throw', 2, 0.5, 5, 0.1), lift(0)],
    { body: '#e9e8e4', cradle: '#b9bab8', lens: '#2f3336' },
    { body: 'matte', cradle: 'matte', lens: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'projector_ust',
    'media',
    'Short throw projector',
    'floor',
    [inches(100, 70, 150), lift(0.45)],
    { body: '#e9e8e4', grille: '#b9bab8', lens: '#2f3336' },
    { body: 'matte', grille: 'fabric', lens: 'ceramic' },
    TOGGLE,
    // A low box set close to the wall, throwing its light up it.
    [{ id: 'box', label: 'Wall Beam' }],
  ),
  kind(
    'projector_screen',
    'media',
    'Projector screen',
    'ceiling',
    [inches(100, 60, 160)],
    { case: SCANDI.ink, screen: '#f4f3ef' },
    { case: 'matte', screen: 'matte' },
    TOGGLE_LEVEL,
  ),

  // Climate
  kind(
    'radiator',
    'climate',
    'Radiator',
    'wall',
    [width(0.9, 0.3, 2), height(0.6, 0.3, 2), p('base', 'Off floor', 0.15, 0, 1)],
    { panel: SCANDI.offWhite, valve: SCANDI.slate },
    { panel: 'matte', valve: 'metal' },
    TOGGLE_LEVEL,
    [
      { id: 'panel', label: 'Flat Plane' },
      {
        id: 'column',
        label: 'Iron Column',
        params: { width: 0.8, height: 0.6, base: 0.12 },
        colors: { panel: '#ecebe6', valve: '#b4b8bb' },
        materials: { panel: 'ceramic', valve: 'metal' },
      },
      {
        id: 'tube',
        label: 'Reed Bar',
        params: { width: 0.45, height: 1.6, base: 0.1 },
        colors: { panel: '#3a3d40', valve: '#b4b8bb' },
        materials: { panel: 'matte', valve: 'metal' },
      },
    ],
  ),
  kind(
    'ac_unit',
    'climate',
    'Air conditioner',
    'wall',
    [width(0.9, 0.3, 1.3), height(2.1, 1.5, 2.5)],
    { body: SCANDI.offWhite, grille: SCANDI.mist, display: '#20262a' },
    { body: 'matte', grille: 'ceramic', display: 'matte' },
    TOGGLE_LEVEL,
    [
      { id: 'split', label: 'Cloud Split' },
      // Ducted air, where all that shows is the grille it blows through.
      {
        id: 'duct',
        label: 'Slot Vent',
        params: { width: 0.35, height: 2.3 },
        colors: { body: SCANDI.offWhite, grille: '#3a3d40', display: '#20262a' },
        materials: { body: 'matte', grille: 'matte', display: 'matte' },
      },
    ],
  ),
  kind(
    'fan_ceiling',
    'climate',
    'Ceiling fan',
    'ceiling',
    [size(1.1, 0.6, 1.6), p('drop', 'Drop', 0.35, 0.1, 1)],
    { housing: SCANDI.offWhite, blades: SCANDI.oak },
    { housing: 'matte', blades: 'wood' },
    TOGGLE_LEVEL,
    [
      {
        id: 'classic',
        label: 'Bowl Five',
        params: { size: 1.3, drop: 0.4 },
        colors: { housing: '#9a8466', blades: '#5b4432', bowl: '#f1ede4' },
        materials: { housing: 'metal', blades: 'wood', bowl: 'ceramic' },
      },
      { id: 'haiku', label: 'Aero Trio' },
      {
        id: 'loft',
        label: 'Iron Loft',
        params: { size: 1.3, drop: 0.5 },
        colors: { housing: '#2b2c2e', blades: '#2b2c2e' },
        materials: { housing: 'matte', blades: 'metal' },
      },
    ],
  ),
  kind(
    'fan_floor',
    'climate',
    'Floor fan',
    'floor',
    // The standing fan and the tower fan were kinds of their own, and a
    // saved one is read as a floor fan in that style.
    [size(0.4, 0.15, 0.6), height(1.2, 0.6, 1.6)],
    { stand: SCANDI.offWhite, blades: SCANDI.mist, guard: SCANDI.slate },
    { stand: 'matte', blades: 'matte', guard: 'metal' },
    TOGGLE_LEVEL,
    [
      { id: 'pedestal', label: 'Breeze Stand' },
      {
        id: 'disc',
        label: 'Calm Disc',
        params: { size: 0.36, height: 0.95 },
        colors: { stand: SCANDI.offWhite, blades: SCANDI.mist, guard: SCANDI.offWhite },
        materials: { stand: 'matte', blades: 'matte', guard: 'matte' },
      },
    ],
  ),
  kind(
    'fireplace',
    'climate',
    'Fireplace',
    'floor',
    [width(1.2, 0.4, 2.4), height(0.9, 0.5, 1.6)],
    { body: SCANDI.ink, hearth: '#8d8a85', logs: '#cfc8bd' },
    { body: 'matte', hearth: 'concrete', logs: 'ceramic' },
    TOGGLE,
    [
      { id: 'linear', label: 'Ribbon Flame' },
      {
        id: 'stove',
        label: 'Iron Stove',
        params: { width: 0.5, height: 0.75 },
        colors: { body: '#2a2b2d', logs: '#6b4a32' },
        materials: { body: 'metal', logs: 'wood' },
      },
    ],
  ),
  kind(
    'air_purifier',
    'climate',
    'Air purifier',
    'floor',
    [size(0.28, 0.18, 0.45), height(0.6, 0.35, 0.9)],
    { body: SCANDI.offWhite, filter: SCANDI.linen, grille: '#2f3336', display: '#20262a' },
    { body: 'matte', filter: 'fabric', grille: 'matte', display: 'matte' },
    TOGGLE_LEVEL,
  ),
  kind(
    'humidifier',
    'climate',
    'Humidifier',
    'floor',
    [size(0.2, 0.12, 0.35), height(0.32, 0.2, 0.5), lift(0)],
    { body: SCANDI.offWhite, collar: SCANDI.mist, nozzle: '#2f3336' },
    { body: 'ceramic', collar: 'ceramic', nozzle: 'matte' },
    TOGGLE_LEVEL,
  ),
  kind(
    'thermostat',
    'climate',
    'Thermostat',
    'wall',
    [size(0.11, 0.07, 0.2), height(1.45, 0.8, 2)],
    { ring: SCANDI.offWhite, back: SCANDI.offWhite, face: SCANDI.charcoal },
    { ring: 'metal', back: 'matte', face: 'ceramic' },
    READOUT,
  ),

  // Covers
  kind(
    'blind',
    'cover',
    'Blind',
    'wall',
    // A blind can hang on the far side of its wall, outside the room it is
    // in, which is where a shutter over a window on an outside wall goes.
    [width(1.2, 0.5, 3), height(2.1, 1, 2.5), p('drop', 'Drop', 1.4, 0.3, 2.2), flag('outside', 'Other side of wall')],
    { slats: SCANDI.linen, rail: SCANDI.slate, ladder: SCANDI.linen },
    { slats: 'fabric', rail: 'metal', ladder: 'fabric' },
    TOGGLE_LEVEL,
    [
      { id: 'venetian', label: 'Ladder Slat' },
      {
        id: 'shutter',
        label: 'Roll Guard',
        colors: { slats: SCANDI.mist, rail: SCANDI.slate },
        materials: { slats: 'metal', rail: 'metal' },
      },
    ],
  ),
  kind(
    'window',
    'cover',
    'Window',
    'wall',
    [width(1.2, 0.5, 3), height(1.2, 0.5, 2), p('sill', 'Sill height', 0.9, 0, 1.6), flag('flip', 'Hinge right')],
    { frame: SCANDI.offWhite, glass: SCANDI.mist },
    { frame: 'matte', glass: 'ceramic' },
    TOGGLE,
    [
      { id: 'casement', label: 'Twin Casement' },
      { id: 'sash', label: 'Box Sash' },
      { id: 'slider', label: 'Glide Pane' },
      {
        id: 'steel',
        label: 'Iron Grid',
        colors: { frame: '#2b2d2f', glass: SCANDI.mist },
        materials: { frame: 'metal', glass: 'ceramic' },
      },
    ],
  ),
  kind(
    'door',
    'cover',
    'Door',
    'wall',
    // A pair of terrace doors has a hinge at each jamb, so it has no side
    // to switch.
    [width(0.85, 0.6, 1.4), height(2.05, 1.8, 2.4), only(flag('flip', 'Hinge right'), ['flush', 'panel', 'glazed'])],
    { frame: SCANDI.offWhite, panel: SCANDI.offWhite, handle: SCANDI.charcoal },
    { frame: 'matte', panel: 'matte', handle: 'metal' },
    TOGGLE,
    [
      { id: 'flush', label: 'Plain Leaf' },
      {
        id: 'panel',
        label: 'Regent Four',
        colors: { frame: '#f1ede4', panel: '#f1ede4', handle: '#b08d57' },
        materials: { frame: 'matte', panel: 'matte', handle: 'metal' },
      },
      {
        id: 'glazed',
        label: 'Garden Lite',
        colors: { frame: SCANDI.offWhite, panel: SCANDI.offWhite, handle: '#b4b8bb', glass: SCANDI.mist },
        materials: { frame: 'matte', panel: 'matte', handle: 'metal', glass: 'ceramic' },
      },
      {
        id: 'terrace',
        label: 'Terrace Pair',
        // A glazed French door for a terrace: two leaves of 70 cm, 2.15 m
        // tall, each one tall pane over a deep bottom rail, both opening.
        params: { width: 1.4, height: 2.15 },
        colors: { frame: SCANDI.offWhite, panel: SCANDI.offWhite, handle: '#2b2c2d', glass: SCANDI.mist },
        materials: { frame: 'matte', panel: 'matte', handle: 'metal', glass: 'ceramic' },
      },
    ],
  ),
  kind(
    'sliding_door',
    'cover',
    'Sliding door',
    'wall',
    [width(1.8, 0.9, 6), height(2.1, 1.8, 2.6), panels(), flag('flip', 'Slide left')],
    { frame: SCANDI.slate, panel: SCANDI.offWhite },
    { frame: 'metal', panel: 'matte' },
    TOGGLE_LEVEL,
    [
      { id: 'panel', label: 'Panel Track' },
      {
        id: 'glass',
        label: 'Glass Track',
        params: { width: 2.4, height: 2.2 },
        colors: { frame: SCANDI.slate, glass: SCANDI.mist },
        materials: { frame: 'metal', glass: 'ceramic' },
      },
    ],
  ),
  kind(
    'garage_door',
    'cover',
    'Garage door',
    'wall',
    [width(2.5, 1.8, 4), height(2.2, 1.8, 2.6)],
    { panels: SCANDI.mist, rail: SCANDI.slate },
    { panels: 'metal', rail: 'metal' },
    TOGGLE_LEVEL,
    [
      { id: 'sectional', label: 'Track Lift' },
      {
        id: 'roller',
        label: 'Coil Box',
        colors: { panels: '#b9bcbe', rail: '#5d6164' },
        materials: { panels: 'metal', rail: 'metal' },
      },
    ],
  ),
  kind(
    'awning',
    'cover',
    'Awning',
    'wall',
    [width(2, 1, 4), height(2.3, 1.8, 2.6), p('drop', 'Extension', 1, 0.3, 2)],
    { canopy: SCANDI.linen, cassette: SCANDI.slate },
    { canopy: 'fabric', cassette: 'metal' },
    TOGGLE_LEVEL,
    [
      { id: 'folding', label: 'Fold Reach' },
      {
        id: 'pergola',
        label: 'Pleat Pergola',
        params: { width: 3, height: 2.4, drop: 2 },
        colors: { canopy: SCANDI.linen, cassette: SCANDI.charcoal },
        materials: { canopy: 'fabric', cassette: 'metal' },
      },
    ],
  ),

  kind(
    'christmas_tree',
    'decor',
    'Christmas tree',
    'floor',
    [size(1.1, 0.4, 1.8), height(1.9, 0.6, 3)],
    { needles: '#2f5a3a', trunk: '#6b4a32', stand: '#b0864f' },
    { needles: 'matte', trunk: 'wood', stand: 'wood' },
    TOGGLE,
    [
      { id: 'fir', label: 'Nordic Fir' },
      // A bare branching tree strung with lights, no needles at all.
      {
        id: 'bare',
        label: 'Winter Birch',
        params: { size: 1.2, height: 2 },
        colors: { needles: '#e8e3da', trunk: '#e8e3da', stand: '#cdb68f' },
        materials: { needles: 'matte', trunk: 'matte', stand: 'wood' },
      },
    ],
  ),
  // Security and sensors
  kind(
    'camera',
    'security',
    'Camera',
    'wall',
    [size(0.1, 0.06, 0.2), height(2.2, 1.2, 2.5)],
    { body: SCANDI.offWhite, lens: SCANDI.charcoal, mount: SCANDI.slate },
    { body: 'matte', lens: 'ceramic', mount: 'metal' },
    TOGGLE,
  ),
  kind(
    'doorbell',
    'security',
    'Doorbell',
    'wall',
    [size(0.07, 0.04, 0.14), height(1.4, 0.9, 1.8)],
    { body: SCANDI.slate, lens: SCANDI.charcoal, button: SCANDI.charcoal },
    { body: 'metal', lens: 'ceramic', button: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'motion_sensor',
    'security',
    'Motion sensor',
    'wall',
    [size(0.07, 0.04, 0.14), height(2.3, 1.2, 2.5)],
    // The ball's color, which turns teal while it sees someone.
    { body: SCANDI.offWhite, accent: '#ffffff' },
    { body: 'matte', accent: 'ceramic' },
    TOGGLE,
  ),
  kind(
    'smoke_detector',
    'security',
    'Smoke detector',
    'ceiling',
    [size(0.14, 0.08, 0.25)],
    { body: SCANDI.offWhite, vents: SCANDI.slate },
    { body: 'matte', vents: 'matte' },
    // A smoke binary sensor, or a sensor that reads carbon monoxide or says
    // in words that it has found something.
    ['toggle', 'value', 'enum'],
  ),
  kind(
    'leak_sensor',
    'security',
    'Leak sensor',
    'floor',
    [size(0.06, 0.04, 0.1)],
    { body: SCANDI.offWhite, probes: '#b8bcc0' },
    { body: 'matte', probes: 'metal' },
    TOGGLE,
  ),
  kind(
    'alarm_panel',
    'security',
    'Alarm panel',
    'wall',
    [size(0.16, 0.1, 0.3), height(1.5, 0.9, 2)],
    { body: SCANDI.offWhite, glass: SCANDI.charcoal, screen: SCANDI.mist, keys: SCANDI.slate },
    { body: 'matte', glass: 'ceramic', screen: 'ceramic', keys: 'matte' },
    READOUT,
  ),
  kind(
    'smart_lock',
    'security',
    'Smart lock',
    'wall',
    [size(0.09, 0.05, 0.16), height(1.05, 0.7, 1.4)],
    { body: SCANDI.slate, turn: SCANDI.slate },
    { body: 'metal', turn: 'metal' },
    TOGGLE,
  ),
  kind(
    'air_quality',
    'security',
    'Air quality sensor',
    'floor',
    [size(0.1, 0.06, 0.2), lift(0)],
    { body: SCANDI.offWhite, screen: SCANDI.mist, vents: SCANDI.slate },
    { body: 'matte', screen: 'ceramic', vents: 'matte' },
    READOUT,
  ),

  // Utility
  kind(
    'vacuum_robot',
    'utility',
    'Robot vacuum',
    'floor',
    [size(0.35, 0.25, 0.45)],
    // Dark grey, the way most of them are sold now, with a lighter grey
    // bumper and dock so the bumper reads against the body.
    { body: '#575a5c', bumper: '#818283', brushes: SCANDI.ink },
    { body: 'matte', bumper: 'matte', brushes: 'matte' },
    TOGGLE,
  ),
  kind(
    'pet_feeder',
    'utility',
    'Pet feeder',
    'floor',
    [size(0.22, 0.12, 0.4), height(0.38, 0.1, 0.6), lift(0)],
    { body: '#3c3f42', food: '#9a6a3c', bowl: '#c9ced2' },
    { body: 'matte', food: 'matte', bowl: 'metal' },
    TOGGLE,
    [
      { id: 'food', label: 'Kibble Tower' },
      {
        id: 'fountain',
        label: 'Flow Bowl',
        params: { size: 0.22, height: 0.16 },
        colors: { body: '#3c3f42', bowl: '#3c3f42' },
        materials: { body: 'matte', bowl: 'ceramic' },
      },
    ],
  ),
  kind(
    'litter_box',
    'utility',
    'Litter box',
    'floor',
    [width(0.56, 0.3, 1.2), depth(0.69, 0.3, 1.4), height(0.75, 0.35, 1.5)],
    { body: '#f0f0ef', drum: '#2a2c2f', trim: '#9a9da0' },
    { body: 'matte', drum: 'matte', trim: 'matte' },
    TOGGLE,
    [
      // A self cleaning globe: a white sphere with a wide opening framed in
      // dark in its front, turning on a base that holds the waste drawer.
      { id: 'globe', label: 'Orbit Globe' },
      {
        // A wooden pod on a drawer base, rolled over by hand on its crank to
        // sift the litter.
        id: 'moon',
        label: 'Moon Roller',
        params: { width: 0.42, depth: 0.56, height: 0.71 },
        colors: { body: '#b88a5e', drum: '#d6b98d', trim: '#3c3f42' },
        materials: { body: 'wood', drum: 'wood', trim: 'matte' },
      },
    ],
  ),
  kind(
    'water_heater',
    'utility',
    'Water heater',
    'wall',
    // The height is the top of the case, the way the other wall units hang.
    [width(0.42, 0.3, 0.7), height(1.9, 1.2, 2.5)],
    { body: SCANDI.offWhite, trim: '#d9d7d2', pipes: '#b87333' },
    { body: 'matte', trim: 'matte', pipes: 'metal' },
    TOGGLE,
    [
      { id: 'combi', label: 'Wall Combi' },
      {
        id: 'tank',
        label: 'Tall Cylinder',
        params: { width: 0.5, height: 2.2 },
        colors: { body: SCANDI.offWhite, trim: SCANDI.ink },
        materials: { body: 'matte', trim: 'matte' },
      },
    ],
  ),
  kind(
    'printer_3d',
    'utility',
    '3D printer',
    'floor',
    // After the Bambu Lab P1S: 38.9 by 38.9 cm and 45.8 cm tall, a closed
    // cube with a glass door and lid round its bed and toolhead.
    [width(0.39, 0.25, 0.7), depth(0.39, 0.25, 0.7), height(0.46, 0.3, 0.8), lift(0.75)],
    { frame: '#2e3033', glass: '#a9b4ba', bed: '#3b3d40', toolhead: '#d9dcde', print: '#e07a3f' },
    { frame: 'matte', glass: 'ceramic', bed: 'metal', toolhead: 'matte', print: 'matte' },
    PRINTER_SIGNALS,
  ),
  kind(
    'router',
    'utility',
    'Router',
    'floor',
    // Size is the router's width. Each style starts at its own.
    [p('size', 'Width', 0.26, 0.08, 0.5), lift(0.75)],
    { body: '#2b2d30', antennas: '#2b2d30' },
    { body: 'matte', antennas: 'matte' },
    TOGGLE,
    [
      // After the TP-Link Archer AX55: 26.1 by 13.5 cm and 4.1 cm tall,
      // with four antennas that stand 13 cm over it.
      { id: 'antenna', label: 'Four Antenna' },
      {
        id: 'mesh',
        label: 'Mesh Puck',
        // After the Google Nest Wifi: Ø11 cm and 9 cm tall.
        params: { size: 0.11 },
        colors: { body: '#f2f1ee', top: '#e2e0db' },
        materials: { body: 'matte', top: 'matte' },
      },
    ],
  ),

  // Garden and outdoor
  kind(
    'hot_tub',
    'outdoor',
    'Hot tub',
    'floor',
    [size(2, 1.2, 2.6), height(0.9, 0.6, 1.2)],
    { cabinet: '#5a4a3c', shell: '#e9ecee' },
    { cabinet: 'wood', shell: 'ceramic' },
    TOGGLE,
    [
      { id: 'spa', label: 'Square Spa' },
      {
        id: 'barrel',
        label: 'Cedar Round',
        params: { size: 1.8, height: 1 },
        colors: { cabinet: '#b98a5e', shell: '#9b7452' },
        materials: { cabinet: 'wood', shell: 'wood' },
      },
    ],
  ),
  kind(
    'louvred_pergola',
    'outdoor',
    'Louvred pergola',
    'floor',
    [width(3.5, 2, 6), depth(3, 2, 5), height(2.5, 2.2, 3)],
    { frame: '#3a3d40', louvres: '#3a3d40' },
    { frame: 'metal', louvres: 'metal' },
    TOGGLE_LEVEL,
    [
      // Four aluminium posts and a roof of blades that turn open.
      { id: 'alu', label: 'Slat Roof' },
      {
        id: 'timber',
        label: 'Cedar Slat',
        colors: { frame: '#9a7350', louvres: '#b88a5e' },
        materials: { frame: 'wood', louvres: 'wood' },
      },
    ],
  ),
  kind(
    'sauna',
    'outdoor',
    'Sauna',
    'floor',
    [width(2, 1.5, 3), depth(2.2, 1.5, 3), height(2.1, 1.9, 2.6)],
    { wood: '#b88a5e', roof: '#3a3d40', glass: '#8a9aa0' },
    { wood: 'wood', roof: 'matte', glass: 'ceramic' },
    TOGGLE,
    [
      // A cedar barrel on its cradles, a glass door in one end.
      { id: 'barrel', label: 'Cedar Cask' },
      {
        id: 'cabin',
        label: 'Nordic Cabin',
        // A square cabin with a pent roof and a glass front.
        params: { width: 2.2, depth: 2, height: 2.3 },
        colors: { wood: '#5a4636', roof: '#2b2e31', glass: '#8a9aa0' },
        materials: { wood: 'wood', roof: 'matte', glass: 'ceramic' },
      },
    ],
  ),
  kind(
    'pool',
    'outdoor',
    'Pool',
    'floor',
    [width(4, 2, 10), depth(2.5, 1.5, 6), height(0.9, 0.5, 1.4)],
    { frame: '#a57f5a', liner: '#7fc3dc' },
    { frame: 'wood', liner: 'ceramic' },
    TOGGLE,
    [
      { id: 'deck', label: 'Deck Plunge' },
      {
        id: 'frame',
        label: 'Steel Frame',
        params: { width: 3.6, depth: 2, height: 0.8 },
        colors: { frame: '#6d7478', liner: '#5a9fbf' },
        materials: { frame: 'metal', liner: 'matte' },
      },
    ],
  ),
  kind(
    'sprinkler',
    'outdoor',
    'Sprinkler',
    'floor',
    // How far it throws, or how long the drip line runs.
    [p('size', 'Reach', 3, 0.5, 8)],
    { body: '#2f3133', nozzle: '#c9a23a' },
    { body: 'matte', nozzle: 'matte' },
    TOGGLE,
    [
      { id: 'rotor', label: 'Pop Rotor' },
      { id: 'oscillating', label: 'Arc Bar', params: { size: 2.5 }, colors: { body: '#3f7a4a', nozzle: '#c9ced2' } },
      {
        id: 'drip',
        label: 'Drip Line',
        params: { size: 1.5 },
        colors: { body: '#4a3a2c', nozzle: SCANDI.ink },
      },
    ],
  ),
  kind(
    'driveway_gate',
    'outdoor',
    'Driveway gate',
    'floor',
    // Width is the opening between the posts and height the gate's. A
    // swing gate opens its two leaves by the cover's position, and a
    // sliding one runs to the side along the fence.
    [
      width(3.6, 2, 5),
      height(1.6, 1, 2.4),
      only(flag('back', 'Open the other way'), ['swing']),
      only(flag('flip', 'Slide left'), ['sliding']),
    ],
    { frame: '#3a3d40', infill: '#b88a5e', posts: '#3a3d40' },
    { frame: 'metal', infill: 'wood', posts: 'metal' },
    TOGGLE_LEVEL,
    [
      // A pair of 1.8 m leaves, 1.6 m tall: horizontal larch boards on an
      // anthracite steel frame, hung on square steel posts.
      { id: 'swing', label: 'Double Swing' },
      {
        id: 'sliding',
        label: 'Sliding Bars',
        // A 4 m cantilever gate, 1.6 m tall, of upright anthracite bars,
        // that runs along the fence on rollers in a post beside it.
        params: { width: 4 },
        colors: { frame: '#2f3235', infill: '#2f3235', posts: '#2f3235' },
        materials: { frame: 'metal', infill: 'metal', posts: 'metal' },
      },
    ],
  ),

  // Asked for in #108: a nursery, a loft bed, a rocking chair, string
  // lights, a fan with a light, a bathroom fan, a chest freezer and a
  // kennel.
  kind(
    'crib',
    'bed',
    'Crib',
    'floor',
    // Around a 60 by 120 cm mattress, its top rail 90 cm up.
    [width(1.26, 0.9, 1.5), depth(0.66, 0.5, 0.8), height(0.9, 0.3, 1.6)],
    { frame: SCANDI.oak, mattress: '#f4f1ea' },
    { frame: 'wood', mattress: 'fabric' },
    NONE,
    [
      // Oak posts and rails with upright slats on every side.
      { id: 'slatted', label: 'Oak Slatted' },
      {
        id: 'panel',
        label: 'White Panel',
        // Solid ends between round topped posts, slats along the sides.
        colors: { frame: '#f3f1ec', mattress: '#dfe6ea' },
        materials: { frame: 'matte', mattress: 'fabric' },
      },
      {
        id: 'house',
        label: 'Montessori House',
        // A mattress on a low frame under the outline of a house, open to
        // climb in and out of.
        params: { height: 1.45 },
        colors: { frame: SCANDI.birch, mattress: '#efe7da' },
        materials: { frame: 'wood', mattress: 'fabric' },
      },
    ],
  ),
  kind(
    'bassinet',
    'bed',
    'Bassinet',
    'floor',
    [width(0.85, 0.6, 1.1), depth(0.5, 0.35, 0.7), height(0.82, 0.3, 1)],
    { basket: '#d9c39b', stand: SCANDI.walnut, mattress: '#f4f1ea' },
    { basket: 'fabric', stand: 'wood', mattress: 'fabric' },
    NONE,
    [
      // An oval woven basket on a crossed wooden stand.
      { id: 'woven', label: 'Woven Moses' },
      {
        id: 'bedside',
        label: 'Bedside Sleeper',
        // A soft walled box on four legs, its side to the bed let down.
        colors: { basket: '#cfd3d4', stand: '#f3f1ec', mattress: '#f4f1ea' },
        materials: { basket: 'fabric', stand: 'matte', mattress: 'fabric' },
      },
      {
        id: 'cradle',
        label: 'Rocking Cradle',
        // A wooden box on two rockers, low to the floor.
        params: { height: 0.55 },
        colors: { basket: SCANDI.oak, stand: SCANDI.oak, mattress: '#f4f1ea' },
        materials: { basket: 'wood', stand: 'wood', mattress: 'fabric' },
      },
    ],
  ),
  kind(
    'loft_bed',
    'bed',
    'Loft bed',
    'floor',
    // A 90 by 200 cm mattress up on a frame, with room to stand under it.
    [width(2.07, 1.5, 2.3), depth(0.97, 0.8, 1.5), height(1.8, 1.3, 2.2)],
    { frame: '#e3c99a', mattress: '#e6ded1', desk: '#e3c99a' },
    { frame: 'wood', mattress: 'fabric', desk: 'wood' },
    NONE,
    [
      // Square pine posts and slatted guards, the ladder on the front.
      { id: 'pine', label: 'Pine Loft' },
      {
        id: 'desk',
        label: 'Loft With Desk',
        // White steel, a ladder at the end and a desk underneath.
        colors: { frame: '#f3f1ec', mattress: '#e6ded1', desk: SCANDI.oak },
        materials: { frame: 'metal', mattress: 'fabric', desk: 'wood' },
      },
    ],
  ),
  kind(
    'kids_sofa',
    'seating',
    'Kids sofa',
    'floor',
    [width(1.5, 0.6, 2), depth(0.68, 0.4, 0.9), height(0.45, 0.25, 0.7)],
    { base: '#7fa3b8', cushions: '#e8b77a' },
    { base: 'fabric', cushions: 'fabric' },
    NONE,
    [
      // Foam blocks after the Nugget: a base, a seat and two triangle
      // pillows against the back, in two colors.
      { id: 'blocks', label: 'Play Couch' },
      {
        id: 'mini',
        label: 'Little Sofa',
        // A small upholstered sofa on short oak legs.
        params: { width: 0.9, height: 0.5 },
        colors: { base: '#d9cfc0', cushions: '#e8e1d5' },
        materials: { base: 'fabric', cushions: 'fabric' },
      },
      {
        id: 'bean',
        label: 'Kids Beanbag',
        params: { width: 0.7, depth: 0.7, height: 0.5 },
        colors: { base: '#c98f6e', cushions: '#c98f6e' },
        materials: { base: 'fabric', cushions: 'fabric' },
      },
    ],
  ),
  kind(
    'rocking_chair',
    'seating',
    'Rocking chair',
    'floor',
    [width(0.65, 0.5, 1), depth(0.85, 0.6, 1.1), height(1.05, 0.8, 1.3)],
    { frame: SCANDI.oak, seat: SCANDI.linen },
    { frame: 'wood', seat: 'fabric' },
    NONE,
    [
      // A wooden rocker with a spindle back and curved arms.
      { id: 'windsor', label: 'Windsor Rocker' },
      {
        id: 'glider',
        label: 'Nursery Glider',
        // An upholstered chair on curved wooden rockers.
        params: { width: 0.75, height: 1.0 },
        colors: { frame: SCANDI.walnut, seat: '#cdd6d8' },
        materials: { frame: 'wood', seat: 'fabric' },
      },
      {
        id: 'recliner',
        label: 'Wingback Recliner',
        // A deep fabric armchair with wings, on a plinth instead of rockers.
        params: { width: 0.85, depth: 0.9, height: 1.05 },
        colors: { frame: SCANDI.charcoal, seat: '#9aa3a8' },
        materials: { frame: 'matte', seat: 'fabric' },
      },
    ],
  ),
  kind(
    'sound_machine',
    'media',
    'Sound machine',
    'floor',
    [p('size', 'Width', 0.14, 0.08, 0.25), lift(0.75)],
    { body: '#f2efe9', top: '#f6e7cf' },
    { body: 'matte', top: 'matte' },
    TOGGLE_LEVEL,
    [
      // After the Hatch Rest: a round base with a glowing dome on top.
      { id: 'nightlight', label: 'Glow Dome' },
      {
        id: 'pixel',
        label: 'Pixel Player',
        // After the Yoto Player: a box with a pixel screen and two knobs.
        params: { size: 0.11 },
        colors: { body: '#f06a3a', top: '#2b2e31' },
        materials: { body: 'matte', top: 'matte' },
      },
      {
        id: 'cube',
        label: 'Story Cube',
        // After the Toniebox: a soft cube with a figure stood on top.
        params: { size: 0.12 },
        colors: { body: '#e6627a', top: '#f2c14e' },
        materials: { body: 'fabric', top: 'matte' },
      },
    ],
  ),
  kind(
    'light_string',
    'light',
    'String lights',
    'floor',
    // Hung between two points the length apart, at the height, sagging
    // between them.
    [length(3, 0.5, 10), height(2.2, 0.5, 3), p('sag', 'Sag', 0.25, 0, 1)],
    { cable: '#2b2c2d', bulbs: '#fff4dc' },
    { cable: 'matte', bulbs: 'ceramic' },
    LIGHT_SIGNALS,
    [
      // Large round bulbs on a black cable, between two posts.
      { id: 'festoon', label: 'Festoon Posts' },
      {
        id: 'fairy',
        label: 'Fairy Wire',
        // Tiny warm points along a thin copper wire.
        params: { sag: 0.15 },
        colors: { cable: '#b87333', bulbs: '#fff1cc' },
        materials: { cable: 'metal', bulbs: 'ceramic' },
      },
      {
        id: 'globes',
        label: 'Paper Globes',
        // White paper globes on a white cord.
        colors: { cable: '#f2efe9', bulbs: '#fbf7ef' },
        materials: { cable: 'matte', bulbs: 'fabric' },
      },
    ],
  ),
  kind(
    'light_fan',
    'light',
    'Ceiling fan light',
    'ceiling',
    // A ceiling fan with a light in it, standing for the light.
    [size(1.1, 0.6, 1.6), p('drop', 'Drop', 0.35, 0.1, 1)],
    { housing: SCANDI.offWhite, blades: SCANDI.oak, light: LIGHT_SHADE_COLOR },
    { housing: 'matte', blades: 'wood', light: 'ceramic' },
    LIGHT_SIGNALS,
    [
      {
        id: 'bowl',
        label: 'Bowl Light',
        // Five wooden paddles over a frosted glass bowl.
        params: { size: 1.3, drop: 0.4 },
        colors: { housing: '#9a8466', blades: '#5b4432', light: '#f1ede4' },
        materials: { housing: 'metal', blades: 'wood', light: 'ceramic' },
      },
      // Three slim blades round an LED disc.
      { id: 'disc', label: 'LED Disc' },
      {
        id: 'globe',
        label: 'Loft Globe',
        // Four black blades over a schoolhouse globe.
        colors: { housing: '#2b2c2d', blades: '#2b2c2d', light: '#f4f1ea' },
        materials: { housing: 'metal', blades: 'matte', light: 'ceramic' },
      },
    ],
  ),
  kind(
    'bath_fan',
    'climate',
    'Bathroom fan',
    'ceiling',
    [size(0.3, 0.15, 0.5)],
    { grille: '#f4f3ef', light: LIGHT_SHADE_COLOR },
    { grille: 'matte', light: 'ceramic' },
    TOGGLE,
    [
      // A square grille of slots.
      { id: 'grille', label: 'Square Grille' },
      // The grille with a round light in its middle, lit while it runs.
      { id: 'light', label: 'Grille With Light' },
      {
        id: 'round',
        label: 'Round LED Ring',
        // A round plate with a ring of light round its rim.
        params: { size: 0.25 },
      },
    ],
  ),
  kind(
    'chest_freezer',
    'kitchen',
    'Chest freezer',
    'floor',
    [width(0.9, 0.5, 1.6), depth(0.65, 0.5, 0.8), height(0.85, 0.6, 0.95)],
    { body: '#f4f3ef', lid: '#f4f3ef', handle: '#9aa3a8' },
    { body: 'ceramic', lid: 'ceramic', handle: 'metal' },
    TOGGLE,
    [
      // A white chest with a recessed handle along its lid.
      { id: 'white', label: 'Classic Chest' },
      {
        id: 'compact',
        label: 'Compact Steel',
        params: { width: 0.55, height: 0.84 },
        colors: { body: '#c9ccce', lid: '#c9ccce', handle: '#2b2c2d' },
        materials: { body: 'metal', lid: 'metal', handle: 'matte' },
      },
    ],
  ),
  kind(
    'dog_kennel',
    'decor',
    'Dog kennel',
    'floor',
    [width(0.7, 0.4, 1.2), depth(0.9, 0.5, 1.4), height(0.75, 0.4, 1.1)],
    { body: SCANDI.oak, roof: '#7d8a8f' },
    { body: 'wood', roof: 'matte' },
    NONE,
    [
      // A wooden house with a pitched roof and a round topped door.
      { id: 'house', label: 'Wooden House' },
      {
        id: 'crate',
        label: 'Wire Crate',
        params: { width: 0.6, depth: 0.9, height: 0.65 },
        colors: { body: '#2b2c2d', roof: '#4a4f52' },
        materials: { body: 'metal', roof: 'matte' },
      },
      {
        id: 'table',
        label: 'Crate Table',
        // A crate that is furniture: a solid top, slatted sides and door.
        params: { width: 0.9, depth: 0.6, height: 0.7 },
        colors: { body: SCANDI.walnut, roof: SCANDI.walnut },
        materials: { body: 'wood', roof: 'wood' },
      },
    ],
  ),
]

// A kind from the catalog, or one made from a model the card imported.
export const decorationKind = (id: string) => DECORATION_KINDS.find(k => k.id === id) ?? modelKind(id)

// A saved size onto the stops its slider actually offers. A plan written
// before a slider's steps changed can hold a value between two of them, or
// outside the range altogether, and a slider cannot show either: the thumb
// lands somewhere the number is not. Everything reads its sizes through
// here, so the plan is drawn at the size the editor would show.
export function snapParam(spec: DecorationParam, value: number) {
  if (!Number.isFinite(value)) return spec.default
  const inside = Math.min(Math.max(value, spec.min), spec.max)
  const stops = Math.round((inside - spec.min) / spec.step)
  return round2(spec.min + stops * spec.step)
}

// A parameter's value where it counts, which is nothing for one whose
// switch is off: a sideboard on its legs is not off the floor, whatever its
// hanging height was left at.
export function liveParam(
  kind: DecorationKind,
  params: Record<string, number> | undefined,
  id: string,
  variant?: string,
) {
  const when = kind.params.find(p => p.id === id)?.when
  if (when && paramValue(kind, params, when, variant) <= 0.5) return 0
  return paramValue(kind, params, id, variant)
}

export function paramValue(
  kind: DecorationKind,
  params: Record<string, number> | undefined,
  id: string,
  variant?: string,
) {
  const spec = kind.params.find(p => p.id === id)
  const saved = params?.[id]
  if (!spec) return saved ?? 0
  if (saved !== undefined) return snapParam(spec, saved)
  // Nothing saved: the style's own default, then the kind's.
  const own = decorationVariant(kind, variant)?.params?.[id]
  return own === undefined ? spec.default : snapParam(spec, own)
}

// The style an item is drawn in: the one it names, or the kind's first.
export function decorationVariant(kind: DecorationKind, variant: string | undefined) {
  if (!kind.variants || kind.variants.length === 0) return undefined
  return kind.variants.find(v => v.id === variant) ?? kind.variants[0]
}

// An item's saved parameters once it changes style. Whatever the new style
// has a real default for is dropped, so a pendant switched to another lamp
// takes that lamp's size rather than keeping the last one's.
export function withoutStyleDefaults(
  kind: DecorationKind,
  params: Record<string, number> | undefined,
  variant: string,
) {
  const own = decorationVariant(kind, variant)?.params
  if (!params || !own) return params
  const kept = Object.fromEntries(Object.entries(params).filter(([id]) => !(id in own)))
  return Object.keys(kept).length > 0 ? kept : undefined
}

// The slots a style paints, which stand in for the kind's own when it has
// any. A style that paints the same parts brings none and uses the kind's.
export function kindColors(kind: DecorationKind, variant?: string) {
  return decorationVariant(kind, variant)?.colors ?? kind.colors
}

export function kindMaterials(kind: DecorationKind, variant?: string) {
  return decorationVariant(kind, variant)?.materials ?? kind.materials
}

export function colorValue(
  kind: DecorationKind,
  colors: Record<string, string> | undefined,
  slot: string,
  variant?: string,
) {
  return colors?.[slot] ?? kindColors(kind, variant)[slot] ?? '#ffffff'
}

// The surface of a slot is part of what the piece is, so it comes from the
// kind. Only the color is the viewer's to pick.
export function materialValue(kind: DecorationKind, slot: string, variant?: string) {
  return kindMaterials(kind, variant)?.[slot] ?? 'matte'
}

// Footprint on the plan, for the 2D editor.
// A screen's diagonal in inches as its width and height in meters, always
// in 16:9.
export function screenSize(inches: number): [number, number] {
  const diagonal = inches * 0.0254
  return [(diagonal * 16) / Math.hypot(16, 9), (diagonal * 9) / Math.hypot(16, 9)]
}

export function footprint(
  kind: DecorationKind,
  params: Record<string, number> | undefined,
  variant?: string,
): [number, number] {
  // A strip lies along its length, which is the x of its model, so the plan
  // has to read the same way round or the two disagree by a right angle.
  if (kind.family === 'light' && kind.params.some(x => x.id === 'length')) {
    return [paramValue(kind, params, 'length', variant), 0.08]
  }
  // A railing is a thin run, as deep as its handrail.
  if (kind.id === 'railing') return [paramValue(kind, params, 'width', variant), 0.08]
  // A quarter turn stair takes its second flight out to the side.
  if (kind.id === 'stairs' && decorationVariant(kind, variant)?.id === 'quarter') {
    const v = (id: string) => paramValue(kind, params, id, variant)
    return [v('width') + v('reach'), v('length')]
  }
  const screen = kind.params.some(x => x.id === 'inches')
  const w = screen
    ? screenSize(paramValue(kind, params, 'inches', variant))[0]
    : paramValue(kind, params, 'width', variant) || paramValue(kind, params, 'size', variant) || 0.3
  // A chaise reaches out past the depth, when the style has one and, if it
  // can be switched off, it is on.
  const chaise = !kind.params.some(p => p.id === 'chaise') || paramValue(kind, params, 'chaise', variant) > 0.5
  const reach = chaise && styleParams(kind, variant).some(p => p.id === 'reach')
  const d =
    (reach
      ? Math.max(paramValue(kind, params, 'reach', variant), paramValue(kind, params, 'depth', variant) + 0.3)
      : 0) ||
    paramValue(kind, params, 'depth', variant) ||
    paramValue(kind, params, 'length', variant) ||
    (kind.params.some(p => p.id === 'size') ? w : 0.3)
  return [w, d]
}

// Items that hang on a wall but stand on the floor, so their height
// parameter is their own size and not how high they are mounted.
const FLOOR_STANDING = new Set(['door', 'sliding_door', 'garage_door', 'radiator'])

// How high above the floor an item's own origin sits. Lights build
// themselves at full height, ceiling items hang from the ceiling, a window
// starts at its sill, and most wall items hang at their height parameter.
export function mountHeight(kind: DecorationKind, params: Record<string, number> | undefined): number {
  if (kind.family === 'light') return 0
  if (kind.mount === 'ceiling') return CEILING_HEIGHT_M
  if (kind.mount !== 'wall') return 0
  if (FLOOR_STANDING.has(kind.id)) return 0
  if (kind.id === 'window') return paramValue(kind, params, 'sill')
  // A towel rail hangs by its top, its own height above how far off the
  // floor it starts.
  if (kind.id === 'towel_rail') return paramValue(kind, params, 'sill') + paramValue(kind, params, 'height')
  // An imported model hangs by its bottom edge, its height being its size.
  if (isModelKind(kind)) return paramValue(kind, params, 'sill')
  return paramValue(kind, params, 'height')
}

// How many leaves a run of a given width is divided into, each one between
// `min` and `max` meters wide.
export function leafCount(width: number, min = 0.5, max = 1) {
  const fewest = Math.ceil(width / max)
  const most = Math.max(1, Math.floor(width / min))
  return Math.min(Math.max(Math.round(width / 0.75), fewest), Math.max(fewest, most))
}

// The base units of a counter run, left to right, as widths. All are a full
// unit but one, which takes up what is left and stands at place `grow`. It
// runs from nothing to a unit, or with `wide` from a unit to just short of
// two, so the run adds a unit each time that one reaches its limit.
export const COUNTER_UNIT = 0.6

export function counterModules(width: number, wide: boolean, grow: number) {
  const full = Math.floor(width / COUNTER_UNIT + 1e-6)
  const rest = Math.max(0, width - full * COUNTER_UNIT)
  const units = wide ? Math.max(full - 1, 0) : full
  const growing = wide ? width - units * COUNTER_UNIT : rest
  const count = units + (growing > 0.005 ? 1 : 0)
  const at = ((grow % count) + count) % count
  return Array.from({ length: count }, (_, i) => (count > units && i === at ? growing : COUNTER_UNIT))
}

// The most shelves a bookshelf takes, however tall.
export const MAX_SHELVES = 12

// How many shelves stand between a bookshelf's bottom and its top: about
// one every 36 cm of height, and `extra` more or fewer.
export function bookshelfShelves(height: number, extra: number) {
  const auto = Math.max(1, Math.round((height - 0.06) / 0.36)) - 1
  return Math.min(Math.max(auto + Math.round(extra), 0), MAX_SHELVES)
}

// The count an adjust parameter ends at, and the most it can reach.
export function adjustedCount(kind: DecorationKind, params: Record<string, number> | undefined, variant?: string) {
  const v = (id: string) => paramValue(kind, params, id, variant)
  if (kind.id !== 'bookshelf') return { count: 0, max: 0 }
  return { count: bookshelfShelves(v('height'), v('shelves')), max: MAX_SHELVES }
}

// How many places a cycle parameter steps through.
export function cycleLength(kind: DecorationKind, params: Record<string, number> | undefined, variant?: string) {
  if (kind.id !== 'kitchen_counter' && kind.id !== 'upper_cabinets') return 1
  const v = (id: string) => paramValue(kind, params, id, variant)
  return counterModules(v('width'), v('wide') > 0.5, 0).length
}

// Items with a flat top that other things can stand on, and how high that
// top is: their own height parameter, or a fixed height when they have none.
// A parameter, a height, or a height for each style. A wall shelf's top is
// its board, up from the height it hangs at.
const SURFACE_TOPS: Record<string, string | number | Record<string, number>> = {
  dining_table: 'height',
  coffee_table: 'height',
  side_table: 'height',
  desk: 'height',
  sideboard: 'height',
  dresser: 'height',
  shoe_rack: 'height',
  bookshelf: 'height',
  stool: 'height',
  kitchen_counter: 'height',
  washing_machine: 'height',
  dryer: 'height',
  half_wall: 'height',
  bench: 'height',
  pouf: 'height',
  piano: 'height',
  basin: 'height',
  wall_shelf: { floating: 0.05, ledge: 0.035, string: 0.034 },
}

// Items let into a worktop rather than set on it, and how far their origin
// moves for it: down into the worktop, or up when the item hangs below its
// own rim. The hob and the sink both keep their origin on the worktop and
// draw nothing facing up in its plane, since two surfaces in the same plane
// fight over which one is drawn. The counter cuts the holes a sink needs.
const BUILT_IN: Record<string, number> = { hob: 0, kitchen_sink: 0 }

export const isSupport = (kind: DecorationKind) => kind.id in SURFACE_TOPS
// Anything with a height of its own to stand at is meant to stand on something.
export const canRide = (kind: DecorationKind) => kind.params.some(p => p.id === 'lift')
export const isBuiltIn = (kind: DecorationKind) => kind.id in BUILT_IN
// Positive sinks the item into the top, negative lifts it clear of it.
export const builtInDepth = (kind: DecorationKind) => BUILT_IN[kind.id] ?? 0

// Height of an item's top surface above its own base.
export function surfaceTop(kind: DecorationKind, params: Record<string, number> | undefined, variant?: string) {
  const top = SURFACE_TOPS[kind.id]
  if (typeof top === 'number') return top
  if (typeof top === 'string') return paramValue(kind, params, top, variant)
  return top[decorationVariant(kind, variant)?.id ?? ''] ?? 0
}

// Usable area of a top, inset so things do not hang over the edge.
export function surfaceRect(
  kind: DecorationKind,
  params: Record<string, number> | undefined,
  variant?: string,
): [number, number] {
  const [w, d] = footprint(kind, params, variant)
  return [Math.max(w - 0.1, w * 0.4), Math.max(d - 0.1, d * 0.4)]
}
