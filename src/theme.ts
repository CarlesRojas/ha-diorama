// Visual settings meant to be tweaked by hand. Units are in the names:
// _M meters, _PX pixels, _DEG degrees.

// Rooms

// Distance between neighbouring rooms.
export const ROOM_GAP_M = 0
// Height of the flat band round the floor slab, between the rounding of its
// top edge and of its bottom one. The slab is this and two roundings thick.
export const ROOM_SLAB_THICKNESS_M = 0.01
export const ROOM_SLAB_STEP_MAX_DROP_M = 0.50
export const ROOM_THICKNESS_MIN_M = 0.01
export const ROOM_THICKNESS_MAX_M = 1.0
export const ROOM_THICKNESS_STEP_M = 0.01
// Rounding of the slab's top and bottom edges where it stands free. Where two
// floors touch they meet square.
export const ROOM_SLAB_EDGE_RADIUS_M = 0.07
// Rounding of the room corners, seen from above: the same as the edge's, and
// like it only for the corners that touch no other room.
export const ROOM_CORNER_RADIUS_M = ROOM_SLAB_EDGE_RADIUS_M
// How far a room's floor can be raised or sunk, and the step its slider
// moves in: enough for platforms, steps and a half level.
export const ROOM_ELEVATION_MIN_M = -5
export const ROOM_ELEVATION_MAX_M = 8
export const ROOM_ELEVATION_STEP_M = 0.01
// The sign on the floor that leads into a room open beside the focused one
// is made of that room's floor, and under the pointer darkens by this much,
// as if black laid over it to multiply, so it answers without standing out
// the rest of the time.
export const PASSAGE_HOVER_SHADE = 0.2
// Fill colors, assigned to rooms in order. A room can override with `color`.
export const ROOM_COLORS = ['#7c9cbf', '#c9a27e', '#9bb38a', '#b58fb0', '#d6b56a', '#8fb6b3']

// Card

// The card has no background of its own: the home stands on whatever the
// dashboard is, in any theme. The editor's preview stands on the same thing.
export const SCENE_BACKGROUND_CSS = 'var(--lovelace-background, var(--primary-background-color))'
// The picture fades away to nothing towards the card's edges, so a home
// that reaches one dissolves into the dashboard and the card has no border
// to be cut by. The fade is as deep along the sides as round the corners,
// and the corners are true quarter circles whatever the card's shape, the
// way a vignette's are. Both in hundredths of the card's shorter side: how
// deep the fade is, and the radius of the corner where it reaches nothing.
const EDGE_FADE_DEPTH = 7
const EDGE_FADE_CORNER = 10
// The mask is a picture the size of the card: a rounded shape, and over its
// rim a stack of ever narrower outlines that each take a little more of it
// away, so it thins out towards the edge in steps too fine to see. All of
// them share one centre, so there is no seam for a line to show along. The
// ramp eases in and out, so the fade has no line where it starts or ends.
const EDGE_FADE_STEPS = 32
const ease = (t: number) => t * t * (3 - 2 * t)
const fadeRings = Array.from({ length: EDGE_FADE_STEPS }, (_, i) => {
  // What is left of the picture just inside this ring and just outside it.
  const inside = i === EDGE_FADE_STEPS - 1 ? 1 : ease((i + 1.5) / EDGE_FADE_STEPS)
  const here = i === 0 ? 0 : ease((i + 0.5) / EDGE_FADE_STEPS)
  const opacity = (1 - here / inside).toFixed(4)
  // A stroke lies half inside its outline, so it is twice as wide as it is deep.
  const width = ((2 * EDGE_FADE_DEPTH * (i + 1)) / EDGE_FADE_STEPS).toFixed(3)
  return `<rect width="100%" height="100%" rx="${EDGE_FADE_CORNER}vmin" fill="none" stroke="#000" stroke-opacity="${opacity}" stroke-width="${width}vmin"/>`
}).join('')
const EDGE_FADE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><mask id="m"><rect width="100%" height="100%" rx="${EDGE_FADE_CORNER}vmin" fill="#fff"/>${fadeRings}</mask><rect width="100%" height="100%" mask="url(#m)"/></svg>`
export const EDGE_FADE_MASK = `url("data:image/svg+xml,${encodeURIComponent(EDGE_FADE_SVG)}") center / 100% 100% no-repeat`

// Editor

// What is selected on the canvas is drawn in this, whatever the mode.
export const EDITOR_SELECTED_COLOR = '#0a84ff'
// The tint of the editor's controls: sliders, switches, the tool in use, the
// buttons that add. The same blue, set in the stylesheet so it can deepen
// over a light theme, where the bright one is too faint for text.
export const EDITOR_TINT_COLOR = 'var(--dio-tint)'

// The editor's own colors: what it draws and picks, and the amber that
// marks an item a device stands behind.
export const EDITOR_ACCENT_COLOR = '#30d158'
export const EDITOR_BOUND_COLOR = '#ff9f0a'

// Decoration

// Height of the ceiling that pendants and ceiling lights hang from.
export const CEILING_HEIGHT_M = 2.6
// Default colors of the material slots of the light family.
// The Scandinavian palette every model draws from: pale woods, chalky
// whites, muted greens and clays, soft greys.
export const SCANDI = {
  oak: '#dcc3a0',
  birch: '#ead9c0',
  walnut: '#a8845c',
  offWhite: '#f2efe9',
  linen: '#e6ded1',
  straw: '#d9c9a3',
  mist: '#cdd6d8',
  slate: '#9aa3a8',
  charcoal: '#4a4f52',
  sage: '#b6c3ae',
  leaf: '#7f9c6d',
  clay: '#cfa08a',
  // Near black, for screens and the devices built around them.
  ink: '#2b2e31',
}

// A screen that is off: almost black, with just enough life to catch the
// room light.
export const SCREEN_OFF_COLOR = '#16191b'

// Scandinavian defaults: warm white fabric shades, light oak, grey cords.
export const LIGHT_SHADE_COLOR = '#f4eee3'
export const LIGHT_BASE_COLOR = '#d8b98e'
export const LIGHT_CORD_COLOR = '#8f877b'
// Glow of a light that is on, before level and color are applied. A lamp
// with no color temperature to read sits around 3200 K: warm white, well
// short of the amber of a candle.
export const LIGHT_GLOW_COLOR = '#ffe8ca'
// How much light a lamp at full brightness puts into the room. Kept low, so
// a lamp lights the things around it and a few of them together still
// leave the room its shadows.
export const LIGHT_POINT_INTENSITY = 1.5
// How a lamp's light divides: the part that leaves the shade and casts
// shadows, and the part that comes through the shade itself and casts none.
export const LAMP_KEY_SHARE = 0.7
export const LAMP_THROUGH_SHARE = 0.4
// What each kind of lamp puts into the room, as a share of the rest. A
// pendant hangs close over a table and sends its light down through a
// diffuser, so it gives less than a floor lamp standing in the open.
export const LAMP_OUTPUT: Record<string, number> = {
  light_pendant: 0.5,
  light_globe: 0.6,
  light_table: 0.75,
  light_desk: 0.6,
  light_wall: 0.8,
  light_ceiling: 0.9,
}
// Daylight and night. The room is warm at both ends of the day: sunlight
// comes in golden along the horizon and near white overhead, and once the
// sun is down the wash left behind is dim and warm so the lamps carry the
// room.
export const DAY_SKY_COLOR = '#f6f2ec'
export const DAY_GROUND_COLOR = '#e6dbcb'
export const DAY_SUN_COLOR = '#fff6ea'
// The same three at sunrise and sunset, when the light comes in low.
export const HORIZON_SKY_COLOR = '#ffdcbb'
export const HORIZON_GROUND_COLOR = '#e3c2a2'
export const HORIZON_SUN_COLOR = '#ffb877'
export const NIGHT_SKY_COLOR = '#e9ddcd'
export const NIGHT_GROUND_COLOR = '#b9ad9e'
export const NIGHT_SUN_COLOR = '#e6dccd'
// Ambient and sky fill, day and night.
export const DAY_AMBIENT_INTENSITY = 0.07
export const DAY_HEMISPHERE_INTENSITY = 0.32
export const NIGHT_AMBIENT_INTENSITY = 0.09
export const NIGHT_HEMISPHERE_INTENSITY = 0.24
// How much the ambient and sky fill are raised on a white dashboard, as a
// multiple of the above. A pale dashboard sets the eye brighter than a dark
// one, and the room lit for the dark one looks muddy on it. The raise
// follows how light the dashboard is, so a mid grey gets part of it and a
// dark one none. The sun and the lamps are left as they are.
export const LIGHT_BACKDROP_AMBIENT_BOOST = 3
export const LIGHT_BACKDROP_HEMISPHERE_BOOST = 1.8
// The sun itself. It is kept gentle, and its shadow map is deliberately
// coarse, so daylight models the room without cutting hard edges into it.
// Daytime is kept on the dim side on purpose, so the lamps still read as
// lit and the model stays moody rather than washed out.
export const DAY_SUN_INTENSITY = 0.72
export const NIGHT_SUN_INTENSITY = 0.05

// How far from a press the card looks for something to act on, in pixels.
// A ray hits one point, so a press that lands on nothing is tried again in
// rings out to this radius.
export const PICK_RADIUS_PX = 48
// How far through those rings a press that has found nothing is checked
// against the floor, as a share of all the points tried, 0 to 1. Devices
// keep the press up to that point, so a press near a lamp goes to the lamp
// and not to the room under it. At 0 the floor is checked before the first
// ring, at 1 only once every point has been tried.
export const PICK_ROOM_AT = 1
// The same two for a finger, which lands less exactly than a mouse and
// covers what it presses.
export const PICK_RADIUS_TOUCH_PX = 52
export const PICK_ROOM_AT_TOUCH = 1
// Radius of the sphere shown for a device with no decoration bound.
export const DEVICE_SPHERE_RADIUS_M = 0.12
export const DEVICE_SPHERE_COLOR = '#ffffff'

// Floor

// Floor materials a room can have. Color is the default tint, roughness the
// sheen of the surface.
// What a room is floored with until it is told otherwise: warm oak boards.
export const DEFAULT_FLOOR_MATERIAL = 'wood'
// How far a floor's pattern is moved along both axes of the plan. The sides
// of the slab take the line of the pattern right above them, and a room drawn
// from a round number would have a joint there. Half a floorboard's width.
export const FLOOR_PATTERN_SHIFT_M = 0.08

export const FLOOR_MATERIALS: Record<string, { label: string; color: string; surface: string }> = {
  wood: { label: 'Wood', color: '#dcc3a0', surface: 'wood_floor' },
  tiles: { label: 'Tiles', color: '#d9d2c5', surface: 'tiles' },
  terracotta: { label: 'Terracotta', color: '#c4764f', surface: 'terracotta' },
  carpet: { label: 'Carpet', color: '#9fb3c8', surface: 'carpet' },
  concrete: { label: 'Concrete', color: '#b3b3b0', surface: 'concrete' },
}
