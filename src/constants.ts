// Internal values. Visual tweaks live in theme.ts.

// Card

// The card's shape when the config gives none: wide on a wide card, square
// on one as narrow as a phone.
export const DEFAULT_ASPECT_RATIO = '16 / 9'
export const DEFAULT_ASPECT_RATIO_MOBILE = '1 / 1'

// Rooms

// The rounded edge of a slab is five centimeters, and the corners a little
// more: this many steps round each comes out smooth at any distance the
// card is looked at from, and each step is a strip of triangles round the
// whole room.
export const SLAB_BEVEL_SEGMENTS = 8
export const SLAB_CURVE_SEGMENTS = 16

// Camera

export const CAMERA_FOV_DEG = 40
// Direction from the flat's center to the camera. Only the ratio matters.
export const CAMERA_DIRECTION: [number, number, number] = [0.6, 0.9, 0.8]
// Extra room around the flat when fitting it to a narrow card, as on a
// phone, as a factor. Kept thin, so the home fills as much of it as it can.
// A wider card fits it right to its edges.
export const CAMERA_FIT_MARGIN = 1.03
// A room flown to fills the card right to its edges, on any card.
export const CAMERA_ROOM_FIT_MARGIN = 1
// On a narrow card, the home and a room flown to run this far past the
// card's sides, as a factor of its width, so they fill the picture. The
// corners they lose are empty floor. A wider card shows them whole.
export const CAMERA_SPILL = 1.12
// Below this width, in pixels, the card is narrow, as on a phone. The same
// width the card switches to its narrow aspect at.
export const CAMERA_NARROW_PX = 600
export const CAMERA_MIN_DISTANCE_M = 2
export const CAMERA_MAX_DISTANCE_M = 60
export const CAMERA_MIN_POLAR_DEG = 6
export const CAMERA_MAX_POLAR_DEG = 82
export const CAMERA_NEAR_M = 0.1
export const CAMERA_FAR_M = 200
// How long the camera takes to travel to a saved view, and how much longer
// for a flight that has to turn all the way round the home on top.
export const CAMERA_FLIGHT_S = 0.35
export const CAMERA_TURN_S = 0.325
// How long the rest of the home takes to fade away around a focused room,
// and to fade back, when no flight of the camera sets the time.
export const FOCUS_FADE_S = 0.25

// Lights

// Where the sun stands: a compass bearing clockwise from the top of the
// plan, and how high it sits above the horizon. The bearing is what the
// editor's compass button turns, and it is saved with the card.
export const SUN_DIRECTION_DEG = 145
export const SUN_ELEVATION_DEG = 50
// What one press of that button turns the sun by.
export const SUN_DIRECTION_STEP_DEG = 45
export const SUN_SHADOW_MAP_PX = 1024
// How far each shadow's edge is spread, in texels of its map. A little past
// one softens the edge without washing out the shape of what casts it.
export const SUN_SHADOW_RADIUS = 2.5
// A lamp lights the room around it and casts shadows from what it stands
// among. Each one costs six shadow renders, so only the first few get them.
export const LAMP_SHADOW_MAP_PX = 512
export const LAMP_SHADOW_RADIUS = 2
// Every shadowed lamp is looked up in every pixel drawn, which a phone or
// a tablet can afford fewer of. Each one also takes a texture slot, and a
// pixel has sixteen: with the sun, a surface's two maps and the two the
// light strips need, ten lamps leave one to spare.
export const MAX_SHADOW_LAMPS = 10
export const MAX_SHADOW_LAMPS_TOUCH = 6
// Frames a second for what moves on its own, a fan, a screen, a flame, while
// nothing else is moving. Enough to read as motion, at a quarter of the work.
// A camera moving or a light fading still draws at the full rate.
export const LIVE_FPS = 16
// How long what moves on its own keeps moving after its device last changed,
// or after the card was last touched. Then it stops where it is, and a card
// where nothing else moves draws no frames at all.
export const LIVE_REST_MS = 2 * 60 * 1000
// The most frames a second, and in performance mode, on a phone or tablet.
export const MAX_FPS = 60
export const PERFORMANCE_MAX_FPS = 24
// The hour the editor lights its preview at, and the one its N key flips to.
export const EDITOR_HOUR = 13
export const EDITOR_NIGHT_HOUR = 23
// How long the daylight takes to catch up when the sun moves, in seconds.
export const DAYLIGHT_EASE_S = 1.2

// Editor

// Grid step for snapping.
export const EDITOR_GRID_M = 0.2
// The step instead while Shift is held, for drawing and placing to the
// centimeter.
export const EDITOR_FINE_GRID_M = 0.01
// How close, on screen, a point must be to snap to another vertex.
export const EDITOR_SNAP_PX = 10
// How close, on screen, a click must be to hit a vertex handle.
export const EDITOR_HANDLE_PX = 7
export const EDITOR_CANVAS_HEIGHT_PX = 440
export const EDITOR_SIDEBAR_WIDTH_PX = 400
// The sidebar never goes below this, nor past half the window.
export const EDITOR_SIDEBAR_MIN_PX = 260
// How long typing must pause before a text edit is sent to Home Assistant.
export const EDITOR_TEXT_COMMIT_DELAY_MS = 500
// Distance from the canvas border where dragging starts to pan the view.
export const EDITOR_AUTOPAN_MARGIN_PX = 48
// Pan speed when the pointer is right at the border.
export const EDITOR_AUTOPAN_SPEED_PX_S = 500
// Grid step for placing devices.
export const EDITOR_DEVICE_GRID_M = 0.05
// Radius of a device marker on the canvas.
export const EDITOR_DEVICE_RADIUS_PX = 14
// The 3D preview is docked under the plan. This is the share of their
// column it takes when it opens, and neither of them goes below this height.
export const EDITOR_PREVIEW_FRACTION = 0.5
export const EDITOR_PREVIEW_MIN_PX = 140
// Height of the 3D preview at the top of the sidebar, before it is dragged.
export const EDITOR_SIDEBAR_PREVIEW_PX = 224
