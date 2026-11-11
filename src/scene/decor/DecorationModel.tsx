import type { Between } from '#/decoration/between.ts'
import { decorationKind, paramValue } from '#/decoration/catalog.ts'
import { usePressActions, type PressAction } from '#/scene/decor/press.ts'
import { DragBadge, DragGhost, travelOf, useDrag, type DragAction } from '#/scene/decor/drag.tsx'
import { grabs, type Grab } from '#/scene/drags.ts'
import { standHeight } from '#/decoration/surfaces.ts'
import { elevationOf } from '#/geometry/elevation.ts'
import ApplianceModel from '#/scene/decor/ApplianceModel.tsx'
import CustomModel from '#/scene/decor/CustomModel.tsx'
import HouseholdModel from '#/scene/decor/Household.tsx'
import NurseryModel from '#/scene/decor/Nursery.tsx'
import DecorModel from '#/scene/decor/DecorModel.tsx'
import DeviceModel from '#/scene/decor/DeviceModel.tsx'
import FurnitureModel from '#/scene/decor/FurnitureModel.tsx'
import HearthModel from '#/scene/decor/Hearth.tsx'
import GadgetModel from '#/scene/decor/Gadgets.tsx'
import CountertopModel from '#/scene/decor/Countertop.tsx'
import GardenModel from '#/scene/decor/Garden.tsx'
import LightModel from '#/scene/decor/LightModel.tsx'
import OutdoorModel from '#/scene/decor/Outdoor.tsx'
import PlugModel from '#/scene/decor/Plug.tsx'
import TechModel from '#/scene/decor/Tech.tsx'
import { sameState, type ItemState } from '#/scene/decor/state.ts'
import type { DecorationKind } from '#/decoration/catalog.ts'
import { memo, useLayoutEffect, useMemo, type ReactNode } from 'react'
import type { DecorationConfig, RoomConfig } from '#/types.ts'
import { MathUtils } from 'three'
import { useEased } from '#/scene/decor/ease.ts'
import { pressedState, usePressed } from '#/scene/decor/pressed.ts'

type Props = {
  item: DecorationConfig
  // Every item in the plan, so one standing on another can follow its top.
  all: DecorationConfig[]
  // The room it stands in, for the models that have to know the floor they
  // are on. Absent in the sidebar's preview, where there is no room.
  room?: RoomConfig
  // The rooms it belongs to, for a piece in a wall between two. Absent for
  // a piece that has only its own.
  between?: Between | null
  // How high the floor it stands on is, in meters. A piece in a wall
  // between two rooms stands with the higher one. Taken from `room` when
  // absent.
  floor?: number
  state: ItemState | null
  // How far the standing desks under it have carried it up.
  raise?: number
  onClick?: PressAction
  // A right click, or a long press, asks Home Assistant for the entity's own
  // dialog, where everything a click cannot do lives: brightness, color,
  // position.
  onOpen?: PressAction
  // The click is only for a press that lands on the piece, not near it.
  exact?: boolean
  // A cover that runs along a line, like a blind, follows a finger dragged
  // along it, and this sends it where it was let go.
  onDrag?: DragAction
  // A drag on this piece moves another one, a blind over a window, which the
  // press finds by where it landed.
  passDrag?: Grab
}

type FamilyModel = (props: {
  kind: DecorationKind
  item: DecorationConfig
  state: ItemState | null
  room?: RoomConfig
  all: DecorationConfig[]
}) => ReactNode

const FAMILY_MODELS: Record<string, FamilyModel> = {
  light: LightModel,
  seating: FurnitureModel,
  table: FurnitureModel,
  storage: FurnitureModel,
  bed: FurnitureModel,
  kitchen: ApplianceModel,
  laundry: ApplianceModel,
  bathroom: ApplianceModel,
  media: DeviceModel,
  climate: DeviceModel,
  cover: DeviceModel,
  security: DeviceModel,
  utility: DeviceModel,
  decor: DecorModel,
  outdoor: OutdoorModel,
  // The models imported into the catalog.
  custom: CustomModel,
}

// Kinds drawn by a model other than their family's: the pieces that come
// alive when they are on, a fire, a tree's lights, a feeder, a litter box
// and a boiler, all live together, as do the desk gadgets, the small kitchen
// appliances, the garden buildings and gates, and the printer, the router
// and the wall tablet, and the smart plug.
const KIND_MODELS: Record<string, FamilyModel> = {
  fireplace: HearthModel,
  christmas_tree: HearthModel,
  pet_feeder: HearthModel,
  litter_box: HearthModel,
  water_heater: HearthModel,
  pc_tower: GadgetModel,
  laptop: GadgetModel,
  wireless_charger: GadgetModel,
  projector_ust: GadgetModel,
  printer_3d: TechModel,
  router: TechModel,
  wall_tablet: TechModel,
  smart_plug: PlugModel,
  toaster: CountertopModel,
  cooking_robot: CountertopModel,
  air_fryer: CountertopModel,
  louvred_pergola: GardenModel,
  sauna: GardenModel,
  driveway_gate: GardenModel,
  crib: NurseryModel,
  bassinet: NurseryModel,
  loft_bed: NurseryModel,
  kids_sofa: NurseryModel,
  rocking_chair: NurseryModel,
  sound_machine: NurseryModel,
  bath_fan: HouseholdModel,
  chest_freezer: HouseholdModel,
  dog_kennel: HouseholdModel,
}

// The models that read the rest of the plan, not just the piece they stand
// on: the vacuum finds its way round everything on the floor, and a counter
// cuts holes for the sinks standing on it.
const READS_PLAN = new Set(['vacuum_robot', 'kitchen_counter'])

// Places one decoration item in the scene. Wall and ceiling items are lifted
// to their mounting height here, so every model can be built from its own
// base up around its origin.
function DecorationModel({
  item,
  all,
  room,
  between,
  floor,
  state,
  raise = 0,
  onClick,
  onOpen,
  exact,
  onDrag,
  passDrag,
}: Props) {
  const interactive = usePressActions(onClick, onOpen)
  const rise = useEased(raise, 2)
  // A press shows as the piece switched on for as long as it runs.
  const pressed = usePressed(item.kind, state?.presses)
  if (pressed && state) state = pressedState(item.kind, state)
  const kind = decorationKind(item.kind)
  const travel = useMemo(() => (kind && onDrag ? travelOf(kind, item) : null), [kind, item, onDrag])
  const level = state?.levels.open ?? (state?.on ? 1 : 0)
  const { frame, level: real, dragged, sent, start } = useDrag(travel, level, state?.text, onDrag)
  if (state && real !== level) state = { ...state, level: real, levels: { ...state.levels, open: real } }
  // Kept fresh on every render, so a press on the window under it starts the
  // drag the piece would.
  useLayoutEffect(() => {
    if (!start) return
    grabs.set(item.id, start)
    return () => {
      if (grabs.get(item.id) === start) grabs.delete(item.id)
    }
  })
  const grab: Grab | undefined = start ?? passDrag
  if (!kind) return null
  const Model = KIND_MODELS[kind.id] ?? FAMILY_MODELS[kind.family]
  if (!Model) return null

  const rotation = MathUtils.degToRad(item.rotation ?? 0)
  // A piece stands on its room's floor, however far that is raised or sunk.
  const lift = (floor ?? elevationOf(room)) + standHeight(item, all) + rise
  // A piece told to hang on the other side of its wall is turned round where
  // it meets the wall. The piece itself keeps facing its room, so it is still
  // in that room and its clicks still go where they did.
  const outside = paramValue(kind, item.params, 'outside', item.variant) > 0.5

  return (
    <group
      // Named so the editor's outline can find the piece that is picked.
      name={`decoration:${item.id}`}
      position={[item.position[0], lift, -item.position[1]]}
      rotation={[0, rotation, 0]}
      // A press that lands near this item rather than on it finds these. A
      // piece with nothing to do says which room it stands in instead, so a
      // press on it counts as one on that room's floor. Both say the room,
      // which is how the rest of the home is told from a focused room, and a
      // piece in a wall between two rooms says both.
      userData={{
        ...(onClick && { pick: { click: onClick, open: onOpen ?? onClick, exact } }),
        ...(grab && { drag: grab }),
        room: item.room,
        ...(between && { rooms: between.rooms, between }),
      }}
      {...interactive}
      onPointerDown={e => {
        interactive.onPointerDown?.(e)
        grab?.(e.nativeEvent, e.point)
      }}
    >
      <group ref={frame} rotation={[0, outside ? Math.PI : 0, 0]}>
        <Model kind={kind} item={item} state={state} room={room} all={all} />
        {travel && state && (
          // The ghost is where the finger takes it, with no easing.
          <DragGhost level={dragged ?? sent}>
            {open => (
              <Model
                kind={kind}
                item={item}
                state={{ ...state, on: open > 0, level: open, levels: { ...state.levels, open }, dragged: true }}
                room={room}
                all={all}
              />
            )}
          </DragGhost>
        )}
        {travel && <DragBadge travel={travel} dragged={dragged} />}
      </group>
    </group>
  )
}

// A piece is only drawn again when something it shows has changed. Moving a
// slider on one piece, or a device reporting on another, used to rebuild
// every model in the flat, and the plan a piece stands in changes with every
// edit, so it only counts through the height it lifts the piece to.
function unchanged(a: Props, b: Props) {
  if (a.raise !== b.raise || a.floor !== b.floor) return false
  if (JSON.stringify(a.between ?? null) !== JSON.stringify(b.between ?? null)) return false
  if (a.item !== b.item || a.room !== b.room || a.onClick !== b.onClick || a.onOpen !== b.onOpen || a.exact !== b.exact)
    return false
  if (a.onDrag !== b.onDrag || a.passDrag !== b.passDrag) return false
  if (!sameState(a.state, b.state)) return false
  if (a.all === b.all) return true
  return !READS_PLAN.has(a.item.kind) && standHeight(a.item, a.all) === standHeight(b.item, b.all)
}

export default memo(DecorationModel, unchanged)
