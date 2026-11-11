import type { CardConfig, DecorationConfig, DeviceConfig, RoomConfig, TileChoice, TileChoices } from '#/types.ts'

// The tiles of the diorama's side panel, made from the devices placed on
// the diorama and the entities given to each room: a heading per room,
// then a tile for each of its entities, in the room's order. The home's own
// entities come first, under the home's heading, in a group with no room.

export type AutoCard = { type: string; [key: string]: unknown }
export type AutoGroup = { room: string | null; cards: AutoCard[] }

const TILE_TYPES: Record<string, string> = {
  light: 'dio-toggle',
  switch: 'dio-toggle',
  input_boolean: 'dio-toggle',
  fan: 'dio-toggle',
  humidifier: 'dio-toggle',
  siren: 'dio-toggle',
  remote: 'dio-toggle',
  automation: 'dio-toggle',
  valve: 'dio-toggle',
  climate: 'dio-climate',
  water_heater: 'dio-climate',
  media_player: 'dio-media',
  lock: 'dio-lock',
  cover: 'dio-cover',
  vacuum: 'dio-vacuum',
  camera: 'dio-camera',
  button: 'dio-button',
  input_button: 'dio-button',
  script: 'dio-button',
  scene: 'dio-button',
  select: 'dio-select',
  input_select: 'dio-select',
  weather: 'dio-weather',
  calendar: 'dio-calendar',
  todo: 'dio-todo',
}

// Anything else, a sensor, a person or the weather, shows its state.
const FALLBACK = 'dio-entity'

// Tiles with buttons of their own are wide, so the buttons show.
const WIDE = new Set(['dio-cover', 'dio-vacuum', 'dio-climate', 'dio-media'])

// The icon for the piece a device stands behind, where it says more than
// the device's domain would.
const KIND_ICONS: Record<string, string> = {
  light_ceiling: 'ph:lightbulb',
  light_pendant: 'ph:lamp-pendant',
  light_floor: 'ph:lamp',
  light_table: 'ph:lamp',
  light_desk: 'ph:lamp',
  light_wall: 'ph:lightbulb',
  light_strip: 'ph:lightbulb-filament',
  light_strip_ceiling: 'ph:lightbulb-filament',
  light_strip_wall: 'ph:lightbulb-filament',
  blind: 'ph:rows',
  curtain: 'ph:rows',
  door: 'ph:door',
  sliding_door: 'ph:door',
  garage_door: 'ph:garage',
  driveway_gate: 'ph:door-open',
  awning: 'ph:sun',
  louvred_pergola: 'ph:sun',
  projector_screen: 'ph:projector-screen',
  projector: 'ph:film-strip',
  projector_portable: 'ph:film-strip',
  projector_ust: 'ph:film-strip',
  tv: 'ph:television',
  tv_wall: 'ph:television',
  wall_tablet: 'ph:device-tablet',
  monitor: 'ph:monitor',
  pc_tower: 'ph:desktop',
  printer_3d: 'ph:cube',
  router: 'ph:wifi-high',
  smart_plug: 'ph:plug',
  fan_ceiling: 'ph:fan',
  fan_floor: 'ph:fan',
  air_purifier: 'ph:wind',
  ac_unit: 'ph:snowflake',
  radiator: 'ph:fire',
  fireplace: 'ph:fire',
  towel_rail: 'ph:fire',
  christmas_tree: 'ph:tree',
  plant_large: 'ph:plant',
  plant_small: 'ph:plant',
  plant_wall: 'ph:plant',
  oven: 'ph:oven',
  coffee_machine: 'ph:cooking-pot',
  kettle: 'ph:cooking-pot',
  cooking_robot: 'ph:cooking-pot',
  air_fryer: 'ph:cooking-pot',
  bathtub: 'ph:bathtub',
  shower: 'ph:shower',
  toilet: 'ph:toilet',
  hot_tub: 'ph:bathtub',
  bed_double: 'ph:bed',
  sofa: 'ph:couch',
  desk: 'ph:desktop',
  pet_feeder: 'ph:paw-print',
  litter_box: 'ph:paw-print',
  vacuum_robot: 'ph:robot-vacuum',
  camera: 'ph:security-camera',
  doorbell: 'ph:bell',
  leak_sensor: 'ph:drop',
}

function entityTile(entityId: string): AutoCard {
  const type = TILE_TYPES[entityId.split('.')[0]] ?? FALLBACK
  const card: AutoCard = { type: `custom:${type}`, entity: entityId, never_hide: true }
  if (WIDE.has(type)) card.size = 'wide'
  return card
}

function tile(device: DeviceConfig, pieces: Map<string, DecorationConfig>): AutoCard {
  const card = entityTile(device.entity_id)
  const kind = device.decorations?.map(id => pieces.get(id)?.kind).find(Boolean)
  const icon = kind && KIND_ICONS[kind]
  if (icon) card.piece_icon = icon
  // A projector screen comes down to open.
  if (kind === 'projector_screen') card.invert = true
  return card
}

// The entities of a room's tiles, in the order they show: the devices on
// the plan in the plan's order, then the room's own entities, and then
// moved where the room's order puts them. An entity the order does not
// name keeps its place after the ones it does.
export function roomEntities(plan: CardConfig, room: RoomConfig) {
  const placed = (plan.devices ?? []).filter(device => device.room === room.id).map(device => device.entity_id)
  const ids = [...new Set([...placed, ...(room.entities ?? [])])]
  const rank = new Map((room.order ?? []).map((id, index) => [id, index]))
  return ids
    .map((id, index) => ({ id, index }))
    .sort((a, b) => (rank.get(a.id) ?? rank.size + a.index) - (rank.get(b.id) ?? rank.size + b.index))
    .map(entry => entry.id)
}

function heading(room: RoomConfig): AutoCard {
  const card: AutoCard = { type: 'custom:dio-title', never_hide: true }
  if (room.name) card.title = room.name
  else if (room.area_id) card.area = room.area_id
  else card.title = room.id
  return card
}

// An entity's tile as the panel shows it: the card chosen for it, if any,
// in place of the one picked for its domain, keeping the piece's icon.
export function chosen(card: AutoCard, choice: TileChoice | undefined): AutoCard {
  if (!choice) return card
  const { type: _, size: __, ...kept } = card
  return { ...kept, ...choice, entity: card.entity }
}

// The tiles a room or the home shows, by entity id, before any is chosen.
export function autoTiles(plan: CardConfig, room: RoomConfig | null): Map<string, AutoCard> {
  if (!room) return new Map([...new Set(plan.home?.entities)].map(id => [id, entityTile(id)]))
  const pieces = new Map((plan.decorations ?? []).map(piece => [piece.id, piece]))
  const devices = new Map(
    (plan.devices ?? []).filter(device => device.room === room.id).map(device => [device.entity_id, device]),
  )
  return new Map(
    roomEntities(plan, room).map(id => {
      const device = devices.get(id)
      return [id, device ? tile(device, pieces) : entityTile(id)]
    }),
  )
}

// The rooms in the order the side panel shows them.
export function panelRooms(plan: CardConfig): RoomConfig[] {
  const rooms = plan.rooms ?? []
  const rank = new Map((plan.room_order ?? []).map((id, index) => [id, index]))
  return rooms
    .map((room, index) => ({ room, index }))
    .sort((a, b) => (rank.get(a.room.id) ?? rank.size + a.index) - (rank.get(b.room.id) ?? rank.size + b.index))
    .map(entry => entry.room)
}

// The cards chosen for an entity, one for each of its widgets, with none
// chosen standing for the one the panel picks.
export function choicesOf(tiles: TileChoices | undefined, id: string): (TileChoice | undefined)[] {
  const choice = tiles?.[id]
  return Array.isArray(choice) ? (choice.length > 0 ? choice : [undefined]) : [choice]
}

// What tells an entity's widgets apart: the entity id for its first, and
// a number after it for the others.
export const widgetKey = (id: string, index: number) => (index > 0 ? `${id}#${index + 1}` : id)
export const keyEntity = (key: string) => key.replace(/#\d+$/, '')

export type PanelWidget = {
  key: string
  entity: string
  // Which of the entity's widgets it is.
  index: number
  // The tile the panel makes for the entity, and the card chosen for it.
  auto: AutoCard
  choice: TileChoice | undefined
}

// The widgets of a room or of the home, in the order they show. An entity
// has a widget for each card chosen for it. The order names an entity once
// for each of its widgets, its first, then its second, and so on. A widget
// the order does not name follows the entity's widget before it, or goes
// after the rest.
export function panelWidgets(plan: CardConfig, room: RoomConfig | null): PanelWidget[] {
  const tiles = room ? room.tiles : plan.home?.tiles
  const widgets = [...autoTiles(plan, room)].flatMap(([id, auto]) =>
    choicesOf(tiles, id).map((choice, index) => ({ key: widgetKey(id, index), entity: id, index, auto, choice })),
  )
  const byKey = new Map(widgets.map(widget => [widget.key, widget]))
  const counted = new Map<string, number>()
  const placed: PanelWidget[] = []
  for (const id of (room ? room.order : plan.home?.entities) ?? []) {
    const index = counted.get(id) ?? 0
    counted.set(id, index + 1)
    const widget = byKey.get(widgetKey(id, index))
    if (widget) placed.push(widget)
  }
  for (const widget of widgets) {
    if (placed.includes(widget)) continue
    const before = byKey.get(widgetKey(widget.entity, widget.index - 1))
    const at = before ? placed.indexOf(before) : -1
    if (at >= 0) placed.splice(at + 1, 0, widget)
    else placed.push(widget)
  }
  return placed
}

// A remote leaves out its power key when the same list already has a toggle
// or a card of what plays for its entity or another of its device, unless
// its own config says otherwise. Which device each is of is only known to
// the remote, so it is given the entities of those cards.
function sparePower(cards: AutoCard[]): AutoCard[] {
  const beside = cards
    .filter(card => ['custom:dio-toggle', 'custom:dio-media-control', 'custom:dio-media-remote'].includes(card.type))
    .map(card => card.entity)
    .filter(entity => typeof entity === 'string')
  if (!beside.length) return cards
  return cards.map(card =>
    card.type === 'custom:dio-remote' && card.power === undefined ? { ...card, power_beside: beside } : card,
  )
}

export function autoGroups(plan: CardConfig): AutoGroup[] {
  const groups: AutoGroup[] = []
  const home = sparePower(panelWidgets(plan, null).map(widget => chosen(widget.auto, widget.choice)))
  if (home.length) {
    const title: AutoCard = { type: 'custom:dio-title', title: plan.home?.name || 'Home', never_hide: true }
    groups.push({ room: null, cards: [title, ...home] })
  }
  for (const room of panelRooms(plan)) {
    const tiles = sparePower(
      panelWidgets(plan, room)
        .filter(widget => !room.hidden?.includes(widget.entity))
        .map(widget => chosen(widget.auto, widget.choice)),
    )
    if (tiles.length) groups.push({ room: room.id, cards: [heading(room), ...tiles] })
  }
  return groups
}
