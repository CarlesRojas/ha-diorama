import { betweenOf, coverAt, coversOver, roomLookedFrom, type Between } from '#/decoration/between.ts'
import { decorationKind, type DecorationKind } from '#/decoration/catalog.ts'
import { canTry, initialTry, tryItemState, type TryState, type TryStates } from '#/editor/tryState.ts'
import { elevationOf } from '#/geometry/elevation.ts'
import { DOOR_KINDS } from '#/geometry/passages.ts'
import DecorationModel from '#/scene/decor/DecorationModel.tsx'
import type { DragAction } from '#/scene/decor/drag.tsx'
import { grabs, type Grab } from '#/scene/drags.ts'
import type { PressAction } from '#/scene/decor/press.ts'
import { deskRise } from '#/scene/decor/state.ts'
import { showingOf } from '#/scene/decor/showing.ts'
import type { ItemState } from '#/scene/decor/state.ts'
import {
  clickAction,
  clickOutcome,
  deviceSignals,
  kelvinToRgb,
  levelChannels,
  levelValues,
  signalValues,
} from '#/signals.ts'
import { LIGHT_GLOW_COLOR } from '#/theme.ts'
import type { CardConfig, DeviceConfig, HomeAssistant } from '#/types.ts'
import { useThree } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import { Color, MathUtils, SRGBColorSpace, Vector3 } from 'three'

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  // In the editor, a press also picks the piece it landed on.
  onPick?: (id: string) => void
  // In the editor, the states tried on pieces, and a click on one steps its
  // state the way a device's click would. A piece with a device starts from
  // what the device says, and its click never reaches the device.
  tries?: TryStates
  onTry?: (id: string) => void
  // Asked before a click acts on a device, with the room its piece stands
  // in. True means the click was spent on the room instead. Only asked, it
  // says whether a click would be, and goes nowhere.
  roomFirst?: (room: string, ask?: boolean) => boolean
  // In the card, a click that is for a room and nothing else, with the
  // rooms on either side of the wall the piece it landed on stands in.
  onRoom?: (room: string, through: string[]) => void
}

// The last color each light was seen with. Home Assistant drops rgb_color
// and brightness the moment a light goes off, so without this the shade
// jumps to the default warm glow for the length of the fade out: a flicker
// of the wrong color on the way down.
const lastGlow = new Map<string, [number, number, number]>()
// The default glow, and a scratch color for converting Home Assistant's,
// built once rather than on every state change of every light.
const baseGlow = new Color(LIGHT_GLOW_COLOR)
const scratch = new Color()

// What a click said a device would be, until Home Assistant reports it or
// this long goes by. Home Assistant's own toggles do the same: they flip at
// once and fall back if nothing confirms them. Without it a piece sat still
// for as long as the device took to answer, which for a lamp on a cloud
// account can be a second or two.
const GUESS_MS = 2000

// The bit in a cover's supported features that says it takes a position.
const SET_POSITION = 4

// The presses each button has had since the card opened, and the last time
// Home Assistant gave for one. A click counts its press at once. The new
// time Home Assistant then reports for it, if it comes within the guess's
// wait, is that same press and not another one.
type Presses = { count: number; seen?: string; until: number }
const NO_PRESSES = new Map<string, Presses>()

function countPresses(presses: Map<string, Presses>, entityId: string, pressed: string | undefined) {
  const p = presses.get(entityId)
  // The time the card first sees is a press from before it opened.
  if (!p) {
    presses.set(entityId, { count: 0, seen: pressed, until: 0 })
    return 0
  }
  if (pressed !== p.seen) {
    p.seen = pressed
    if (pressed !== undefined && Date.now() > p.until) p.count++
  }
  return p.count
}

// What a bound device tells its decoration items. Null when the device says
// nothing a model can draw, so the item stays neutral.
// A click's press, counted before Home Assistant has said anything. False
// when the piece has not been drawn yet, so there is nothing to play it on.
function clickPress(presses: Map<string, Presses>, entityId: string) {
  const p = presses.get(entityId)
  if (!p) return false
  p.count++
  p.until = Date.now() + GUESS_MS
  return true
}

function itemState(
  hass: HomeAssistant,
  device: DeviceConfig,
  guesses: Map<string, boolean>,
  presses: Map<string, Presses> = NO_PRESSES,
): ItemState | null {
  const entityId = device.entity_id
  const signals = deviceSignals(hass, entityId)
  if (signals.length === 0) return null
  const v = signalValues(hass, entityId)
  // A guess stands until the device agrees with it, or its timer ends it.
  if (guesses.get(entityId) === v.on) guesses.delete(entityId)
  const on = guesses.get(entityId) ?? v.on ?? false
  let glow: [number, number, number] = [baseGlow.r, baseGlow.g, baseGlow.b]
  // Home Assistant's colors are sRGB. Handing the raw numbers to three,
  // which works in linear, washed every color out toward white: a magenta
  // light came out pale pink.
  const fromSrgb = ([r, g, b]: [number, number, number]): [number, number, number] => {
    const c = scratch.setRGB(r, g, b, SRGBColorSpace)
    return [c.r, c.g, c.b]
  }
  if (v.color) glow = fromSrgb([v.color[0] / 255, v.color[1] / 255, v.color[2] / 255])
  else if (v.warmth) glow = fromSrgb(kelvinToRgb(v.warmth))
  if (v.color || v.warmth) lastGlow.set(entityId, glow)
  // Saying nothing about its color: off, or guessed on before Home Assistant
  // has said what color it is. Either way it shows the color it was last
  // lit with.
  else glow = lastGlow.get(entityId) ?? glow

  // Which of the device's percentages feeds each of the item's. What the
  // device was told to use wins, then one of the same name, then its first
  // percentage for whatever the item calls its main one.
  const channels = levelChannels(hass, entityId)
  const values = levelValues(hass, entityId)
  const pick = (itemChannel: string) => {
    const chosen = device.levels?.[itemChannel]
    if (chosen) return values[chosen]
    if (values[itemChannel] !== undefined) return values[itemChannel]
    return itemChannel === 'tilt' ? undefined : channels[0] && values[channels[0].id]
  }
  const levels: Record<string, number> = {}
  for (const id of ['open', 'tilt']) {
    const value = pick(id)
    if (value !== undefined) levels[id] = value
  }
  return {
    on,
    // Missing, not one, when the device has no percentage: a device that
    // only switches must not read as fully open.
    level: signals.includes('level') ? levels.open : undefined,
    levels,
    glow,
    value: v.value,
    moisture: v.moisture,
    text: v.state,
    presses: signals.includes('press') ? countPresses(presses, entityId, v.pressed) : undefined,
    showing: showingOf(hass, entityId),
  }
}

// What a piece with a device is tried from in the editor: the device as it
// is, put in the editor's own terms, so trying it starts where the home is.
export function deviceTry(hass: HomeAssistant, device: DeviceConfig, kind: DecorationKind): TryState {
  const start = initialTry(kind)
  const state = itemState(hass, device, new Map())
  if (!state) return start
  const v = signalValues(hass, device.entity_id)
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  const tint: TryState['tint'] = v.color
    ? { mode: 'color', hex: `#${v.color.map(hex).join('')}` }
    : v.warmth
      ? { mode: 'white', kelvin: v.warmth }
      : undefined
  return { on: state.on, levels: { ...start.levels, ...state.levels }, tint }
}

export default function Devices({ hass, config, onPick, tries, onTry, roomFirst, onRoom }: Props) {
  const devices = config.devices ?? []
  const decorations = config.decorations ?? []
  const rooms = config.rooms ?? []
  const boundTo = new Map<string, DeviceConfig>()
  for (const device of devices) for (const id of device.decorations ?? []) boundTo.set(id, device)
  // By id, so a plan of a few hundred pieces is not searched end to end
  // for every one of them on every state change.
  const byId = new Map(decorations.map(d => [d.id, d]))
  const roomById = new Map(rooms.map(r => [r.id, r]))
  // A piece in a wall between two rooms stands with the higher floor, so a
  // door up to a raised room reaches its floor.
  const floorUnder = (room: string, between: Between | null) =>
    Math.max(...(between?.rooms ?? [room]).map(id => elevationOf(roomById.get(id), config.floors)))

  // The guesses clicks have made, by entity, and the timers that end them.
  // A guess that runs out has to be drawn again to fall back, and nothing
  // else prompts a render just then.
  const [guesses] = useState(() => new Map<string, boolean>())
  const [presses] = useState(() => new Map<string, Presses>())
  const [timers] = useState(() => new Map<string, ReturnType<typeof setTimeout>>())
  const [, redraw] = useState(0)
  useEffect(
    () => () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
    [timers],
  )

  // Home Assistant's own dialog for the entity, which carries the controls a
  // click cannot stand in for: brightness, color, a cover's position. The
  // event has to cross the card's shadow root to reach it.
  const gl = useThree(state => state.gl)
  const get = useThree(state => state.get)
  const openMoreInfo = (entityId: string) => {
    gl.domElement.dispatchEvent(
      new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }),
    )
  }

  // A device a click has nothing to switch on, like a camera or a
  // thermostat, opens its dialog instead.
  const act = (entityId: string) => {
    if (!hass) return
    const entity = hass.states[entityId]
    const action = clickAction(entityId, entity?.state, entity?.attributes)
    if (!action) return openMoreInfo(entityId)
    // A press plays on the piece at once.
    if (deviceSignals(hass, entityId).includes('press') && clickPress(presses, entityId)) redraw(n => n + 1)
    // A second click before the first is answered flips the guess, not the
    // device, so two quick clicks show what two toggles leave.
    const outcome = clickOutcome(hass, entityId, guesses.get(entityId))
    if (outcome !== undefined) {
      guesses.set(entityId, outcome)
      // A second click on the same piece starts its wait over.
      const earlier = timers.get(entityId)
      if (earlier !== undefined) clearTimeout(earlier)
      timers.set(
        entityId,
        setTimeout(() => {
          timers.delete(entityId)
          guesses.delete(entityId)
          redraw(n => n + 1)
        }, GUESS_MS),
      )
      redraw(n => n + 1)
    }
    // A call Home Assistant refuses must not surface as an unhandled
    // rejection in the dashboard. Its own toast already says what went wrong.
    hass.callService(action.domain, action.service, { entity_id: entityId }, undefined, false).catch(() => {})
  }

  // What a press on each piece does. The models are only drawn again when
  // they change, so each is handed a handler that stays the same and calls
  // whatever this render says a press does now.
  const [actions] = useState(
    () => new Map<string, { click?: PressAction; open?: PressAction; drag?: DragAction; pass?: Grab }>(),
  )
  const [handlers] = useState(
    () => new Map<string, { click: PressAction; open: PressAction; drag: DragAction; pass: Grab }>(),
  )
  const handler = (id: string) => {
    let h = handlers.get(id)
    if (!h) {
      h = {
        click: at => actions.get(id)?.click?.(at),
        open: at => actions.get(id)?.open?.(at),
        drag: {
          may: () => actions.get(id)?.drag?.may() ?? false,
          drop: level => actions.get(id)?.drag?.drop(level),
        },
        pass: (down, at) => actions.get(id)?.pass?.(down, at),
      }
      handlers.set(id, h)
    }
    return h
  }

  // A cover Home Assistant can send to any position, fed by that position,
  // can be dragged there. Not in the editor, which leaves the real one be.
  const draggable = (device: DeviceConfig | undefined) => {
    if (!hass || !device || onTry || onPick || !device.entity_id.startsWith('cover.')) return false
    const entity = hass.states[device.entity_id]
    if (!entity || entity.state === 'unavailable') return false
    const features = Number(entity.attributes.supported_features ?? 0)
    const fed = device.levels?.open
    return (
      (features & SET_POSITION) !== 0 &&
      (!fed || fed === 'position') &&
      typeof entity.attributes.current_position === 'number'
    )
  }

  const stateOf = (item: (typeof decorations)[number]) => {
    const device = boundTo.get(item.id)
    const kind = decorationKind(item.kind)
    // In the editor, a piece that has states to try shows the one tried
    // last, and a click steps it. Until then one with a device shows the
    // device, and one without shows its first look.
    const tried = onTry && kind && canTry(kind)
    const tryState = tried ? tries?.[item.id] : undefined
    const real = device && hass ? itemState(hass, device, guesses, presses) : null
    // What the device says that trying has no control for, like a reading,
    // is kept.
    const state = kind && tryState ? { ...real, ...tryItemState(kind, tryState) } : real
    return { device, kind, tried, state }
  }
  const states = new Map(decorations.map(item => [item.id, stateOf(item)]))
  // How far each piece is carried up by the standing desks it stands on,
  // directly or on something else that stands on one.
  const raise = (item: (typeof decorations)[number]) => {
    let total = 0
    let at = item
    for (let depth = 0; at.on && depth < 6; depth++) {
      const below = byId.get(at.on)
      if (!below) break
      if (below.kind === 'desk') total += deskRise(states.get(below.id)?.state ?? null)
      at = below
    }
    return total
  }

  return (
    <>
      {decorations.map(item => {
        const { device, tried, state } = states.get(item.id) ?? stateOf(item)
        // A piece in a wall between two rooms sends its first click to the
        // room it is looked at from, the one the camera looks out of.
        const between = betweenOf(item, rooms)
        const roomOf = () => {
          if (!between) return item.room
          const turn = MathUtils.degToRad(item.rotation ?? 0)
          const camera = get().camera
          const look = camera.getWorldDirection(new Vector3())
          return roomLookedFrom(between, item.position[0], -item.position[1], turn, look, camera.position)
        }
        // A press does what the device says, and in the editor also picks
        // the piece. A piece with nothing behind it is still pickable.
        // In the card, a piece in a wall with no device still takes the
        // press, for the room beyond it, as walking through a door from the
        // room it is looked at from would. Left to pass through, the press
        // would go to whatever stands behind the piece, in that far room.
        // From a focused room the same press goes through to the other one.
        // A window or a door with no device and a blind or a curtain over
        // it takes that cover's presses, so a press on the glass works the
        // blind whichever of the two is in front. With more than one over
        // it, the press is for the one over the stretch it landed on. A door
        // into another room still leads there first, and only its long press
        // goes to the cover.
        const covers = !device && !onPick && !tried ? coversOver(item, decorations, id => boundTo.has(id)) : []
        const leads = !!between && !!onRoom && DOOR_KINDS.has(item.kind)
        const covering = (at?: Vector3) => {
          const cover = coverAt(covers, at ? [at.x, -at.z] : item.position)
          return cover && boundTo.get(cover.id)
        }
        const onClick: PressAction | undefined =
          device || onPick || tried
            ? () => {
                onPick?.(item.id)
                // The editor only tries a device, and leaves the real one be.
                if (onTry) {
                  if (tried && !(device && roomFirst?.(roomOf()))) onTry(item.id)
                } else if (device && !roomFirst?.(roomOf())) {
                  // A piece set to only show its device opens its dialog
                  // instead of switching it.
                  if (item.show_only) openMoreInfo(device.entity_id)
                  else act(device.entity_id)
                }
              }
            : covers.length > 0 && !leads
              ? at => {
                  const over = covering(at)
                  if (over && !roomFirst?.(roomOf())) act(over.entity_id)
                }
              : between && onRoom
                ? () => onRoom(roomOf() === between.front ? between.back : between.front, between.rooms)
                : undefined
        // Home Assistant's dialog would let the editor change the real
        // device, so the editor has none.
        const onOpen: PressAction | undefined = onTry
          ? undefined
          : device
            ? () => openMoreInfo(device.entity_id)
            : covers.length > 0
              ? at => {
                  const over = covering(at)
                  if (over) openMoreInfo(over.entity_id)
                }
              : undefined
        // A drag never flies to the room first. Where a click would, it is
        // left to turn the camera.
        const drag: DragAction | undefined =
          draggable(device) && !item.show_only
            ? {
                may: () => !roomFirst?.(roomOf(), true),
                drop: level =>
                  hass!
                    .callService(
                      'cover',
                      'set_cover_position',
                      { entity_id: device!.entity_id, position: Math.round(level * 100) },
                      undefined,
                      false,
                    )
                    .catch(() => {}),
              }
            : undefined
        // A drag on the window is a drag on the cover over where it landed,
        // as a click on it is, when that cover can be dragged.
        const pass: Grab | undefined =
          covers.length > 0 && !leads
            ? (down, at) => {
                const cover = coverAt(covers, [at.x, -at.z])
                if (cover) grabs.get(cover.id)?.(down)
              }
            : undefined
        actions.set(item.id, { click: onClick, open: onOpen, drag, pass })
        const h = handler(item.id)
        return (
          <DecorationModel
            key={item.id}
            item={item}
            all={decorations}
            room={roomById.get(item.room)}
            between={between}
            floor={floorUnder(item.room, between)}
            state={state}
            raise={raise(item)}
            onClick={onClick && h.click}
            onOpen={onOpen && h.open}
            exact={!device && !onPick && !tried}
            onDrag={drag && h.drag}
            passDrag={pass && h.pass}
          />
        )
      })}
    </>
  )
}
