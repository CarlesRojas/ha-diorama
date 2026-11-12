import { itemLevels, type DecorationKind } from '#/decoration/catalog.ts'
import { isModelKind, modelIsPositioned } from '#/decoration/models.ts'
import type { ItemState } from '#/scene/decor/state.ts'
import { kelvinToRgb } from '#/signals.ts'
import { LIGHT_GLOW_COLOR } from '#/theme.ts'
import { Color, SRGBColorSpace } from 'three'

// States tried out in the editor, so every look a piece has can be seen. A
// piece with a device starts from it, but trying never reaches the device.
// They live in the editor only: nothing here is saved, and the card never
// sees them.

export type Tint = { mode: 'white'; kelvin: number } | { mode: 'color'; hex: string }

export type TryState = {
  on: boolean
  // 0 to 1, by the item's own level ids: open, tilt.
  levels: Record<string, number>
  // Lights only. Missing is the light's own glow, the one it shows bound to
  // a light that says nothing about its color: the piece's light color, or
  // the warm default.
  tint?: Tint
  // How many times its button has been tried, for the pieces that do one
  // thing for a press.
  presses?: number
}

export type TryStates = Record<string, TryState>

// The warm white a light shows when nothing says otherwise.
export const WARM_WHITE_K = 2700
export const KELVIN_MIN = 2000
export const KELVIN_MAX = 6500

// Pieces whose percentage is where they are, not how hard they run: a blind
// is as open as its position says, whatever its switch. For these the switch
// and the position are one thing, as a cover's are in Home Assistant.
const POSITIONED_FAMILIES = new Set(['cover'])
const POSITIONED_KINDS = new Set(['curtain', 'projector_screen', 'driveway_gate'])

export const isPositioned = (kind: DecorationKind) =>
  POSITIONED_FAMILIES.has(kind.family) ||
  POSITIONED_KINDS.has(kind.id) ||
  (isModelKind(kind) && modelIsPositioned(kind.id))

// Whether a piece has anything to try: more than the one look.
export const canTry = (kind: DecorationKind) => kind.expresses.length > 0 || itemLevels(kind).length > 0

// What a piece shows before it is touched: off, shut, every level at nothing.
export function initialTry(kind: DecorationKind): TryState {
  const levels: Record<string, number> = {}
  for (const level of itemLevels(kind)) levels[level.id] = 0
  return { on: false, levels }
}

// A click on the piece in 3D, the way a click on a bound one toggles its
// device. It goes all the way on or all the way off.
export function toggleTry(kind: DecorationKind, state: TryState): TryState {
  return switchTry(kind, state, !state.on)
}

// The switch and the main level are one thing: switching on takes the level
// to full and switching off takes it to nothing, the way a cover driven by a
// device that only switches is fully open or fully shut. A blind's slats
// are left where they are.
export function switchTry(kind: DecorationKind, state: TryState, on: boolean): TryState {
  if (!('open' in state.levels)) return { ...state, on }
  return levelTry(kind, state, 'open', on ? 1 : 0)
}

// A window's handle either opens it or tilts it, so opening one stands its
// tilt back at nothing.
const unTilt = (kind: DecorationKind, levels: Record<string, number>) =>
  kind.id === 'window' && levels.open > 0 && 'tilt' in levels ? { ...levels, tilt: 0 } : levels

// The main level, where anything above nothing counts as on and nothing at
// all as off.
export function levelTry(kind: DecorationKind, state: TryState, id: string, value: number): TryState {
  const levels = { ...state.levels, [id]: value }
  if (id !== 'open') return { ...state, levels }
  return { ...state, on: value > 0, levels: unTilt(kind, levels) }
}

const fromSrgb = (r: number, g: number, b: number): [number, number, number] => {
  const c = new Color().setRGB(r, g, b, SRGBColorSpace)
  return [c.r, c.g, c.b]
}

// What the model is handed, the same shape a device's state takes. A light
// with no tint glows in its own color, the one the piece is set to.
export function tryItemState(kind: DecorationKind, state: TryState, lightColor?: string): ItemState {
  const tint = state.tint
  let glow: [number, number, number]
  if (tint?.mode === 'white') glow = fromSrgb(...kelvinToRgb(tint.kelvin))
  else {
    // Hex colors are sRGB, and three turns them linear on the way in.
    const c = new Color(tint?.mode === 'color' ? tint.hex : (lightColor ?? LIGHT_GLOW_COLOR))
    glow = [c.r, c.g, c.b]
  }
  return {
    on: state.on,
    level: kind.expresses.includes('level') ? state.levels.open : undefined,
    levels: state.levels,
    glow,
    // Left out until it is pressed, so a device's own count shows through.
    ...(state.presses !== undefined && { presses: state.presses }),
  }
}
