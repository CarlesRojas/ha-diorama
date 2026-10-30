export type EntityState = {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
}

export type Area = {
  area_id: string
  name: string
  floor_id: string | null
  icon: string | null
}

export type EntityRegistryEntry = {
  entity_id: string
  device_id?: string | null
  area_id?: string | null
  name?: string | null
  hidden?: boolean
  entity_category?: string | null
  // The integration it comes from, like androidtv_remote.
  platform?: string
}

export type DeviceRegistryEntry = {
  id: string
  area_id?: string | null
  name?: string | null
  name_by_user?: string | null
}

// Minimal subset of the hass object HA passes to cards.
export type HomeAssistant = {
  states: Record<string, EntityState>
  areas: Record<string, Area>
  entities?: Record<string, EntityRegistryEntry>
  devices?: Record<string, DeviceRegistryEntry>
  callService: (
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
    notifyOnError?: boolean,
  ) => Promise<unknown>
  themes: { darkMode: boolean }
  locale?: { language: string }
  language?: string
  // The state and attributes as Home Assistant words them, translated and
  // with their units. Missing on very old versions.
  formatEntityState?: (entity: EntityState, state?: string) => string
  formatEntityAttributeValue?: (entity: EntityState, attribute: string, value?: unknown) => string
  // A message on the websocket that gets one answer, like a stretch of history.
  callWS?: <T>(message: Record<string, unknown>) => Promise<T>
  // A call to the REST API, like the events of a calendar.
  callApi?: <T>(method: 'GET' | 'POST', path: string, data?: Record<string, unknown>) => Promise<T>
  // The websocket, for what is only sent to those who ask, like a forecast.
  connection?: {
    subscribeMessage: <T>(callback: (message: T) => void, message: Record<string, unknown>) => Promise<() => void>
  }
  // Inside the companion app, the way to send it messages.
  auth?: { external?: { fireMessage: (message: { type: string }) => void } }
}

// Plan coordinates in meters. x grows to the right, y grows upward on the plan.
export type Point = [number, number]

// Where the camera stands and what it looks at, in scene meters: x as on
// the plan, y up, z the plan's y with its sign flipped. Saved from the
// editor's 3D view, never written by hand.
export type CameraView = {
  position: [number, number, number]
  target: [number, number, number]
}

export type FloorConfig = {
  id: string
  name: string
  elevation: number
}

export type RoomConfig = {
  id: string
  name?: string
  area_id?: string
  floor_id?: string
  points: Point[]
  radius?: number
  color?: string
  // How far the floor stands above the rest of the home, or below it when
  // negative, in meters: a raised platform, a step or a sunken living room.
  // Everything in the room stands on it.
  elevation?: number
  thickness?: number
  // A sensor that says someone is in the room. While it does, the floor is
  // seen through a filter of `color`, black by default, laid over it at
  // `strength`, from 0 to 1.
  presence?: { entity: string; color?: string; strength?: number }
  // Floor material from the theme's list, with an optional color tint.
  floor?: { material: string; color?: string; scale?: number; rotation?: number; intensity?: number }
  // Where the camera goes when the room is clicked in the card. A room
  // without one is framed alone, from the side the card opens on.
  camera?: CameraView
  // Entities with no piece on the plan that still get a tile in this room's
  // part of the side panel, such as a scene, a sensor or a thermostat.
  entities?: string[]
  // The order of the room's tiles in the side panel, as entity ids, both
  // the devices on the plan and the entities above. An entity with several
  // widgets is named once for each.
  order?: string[]
  // Devices on the plan whose tile the side panel leaves out, as entity ids.
  hidden?: string[]
  // The card each entity's tile is, by entity id, in place of the one the
  // side panel picks for its domain.
  tiles?: TileChoices
  // Rooms open beside this one whose sign on the floor is left out of this
  // room's view, as room ids.
  hide_arrows?: string[]
}

// The side panel's section for the whole home.
export type HomeConfig = {
  name?: string
  // The home's entities, in the order their tiles show, an entity with
  // several widgets named once for each.
  entities?: string[]
  tiles?: TileChoices
  // Keeps every room's tiles under the home's own with the whole home in
  // view, instead of the home's alone. A room in view still shows only its
  // own.
  show_rooms?: boolean
}

// A card of the side panel chosen for an entity: its type and its options,
// with the entity left out since it is the key. A list gives the entity a
// widget for each card in it.
export type TileChoice = { type: string; [key: string]: unknown }
export type TileChoices = Record<string, TileChoice | TileChoice[]>

// The background laid behind the view the card is in, for a light and for
// a dark dashboard: one of the card's own by its id, or `theme` to leave
// the dashboard's. Graphite when not set. With `show` false the card lays
// none at all and the dashboard keeps its own, whatever the two say.
export type BackgroundConfig = {
  show?: boolean
  light?: string
  dark?: string
}

// A Home Assistant entity placed in a room.
// An entity a decoration item stands in for. A device is never placed on
// its own: the room and position follow the item that stands behind it.
export type DeviceConfig = {
  entity_id: string
  room: string
  position: Point
  // Which of the device's percentages feeds each percentage of the items it
  // stands behind, for example its tilt driving a blind's slats.
  levels?: Record<string, string>
  // Decoration items that stand in for this device in 3D.
  decorations?: string[]
}

// A decoration item placed in a room: furniture, lamps, plants and the like.
export type DecorationConfig = {
  id: string
  // One of the kinds in the decoration catalog.
  kind: string
  room: string
  position: Point
  // Degrees, counter clockwise on the plan.
  rotation?: number
  // Id of the item this one stands on, for example the table under a lamp.
  // Its height follows that item's top, and it moves when that item moves.
  on?: string
  // Shows its device's state and does not act on it: a click opens the
  // device's dialog in Home Assistant instead of switching it.
  show_only?: boolean
  // Stands on the floor, where it would stand at the height of its own
  // otherwise. Only read while it stands on nothing.
  floor?: boolean
  // Kind specific numbers, for example size or cord length, in meters.
  params?: Record<string, number>
  // Colors per material slot, as hex strings.
  colors?: Record<string, string>
  // Which of the kind's styles it is drawn in. The kind's first when absent.
  variant?: string
}

// A 3D model imported into the editor's catalog, by id. Pieces placed from
// it name it in their kind as `model:<id>`, so it is kept once however many
// times it is placed.
export type ModelConfig = {
  // What the catalog calls it, the file's name to start with.
  name: string
  // Its own size in meters, as width, depth and height, after the unit it
  // was made in is guessed. Its sliders start here.
  size: [number, number, number]
  // Where it goes: on the floor, the default, on a wall or from the ceiling.
  mount?: 'floor' | 'wall' | 'ceiling'
  // How many triangles it has, all its parts together.
  triangles: number
  // Its parts, each one a color the item panel can set. A part's shape is
  // kept here, `vertices` as three 16 bit numbers per corner across the
  // model's own box and `triangles` as indexes into them, both base64.
  parts: { name: string; vertices?: string; triangles?: string }[]
  // A file to read the shape from instead, like one in /config/www, which
  // Home Assistant serves as /local/. The parts then only name the colors.
  url?: string
}

export type CardConfig = {
  type: string
  floors?: FloorConfig[]
  rooms?: RoomConfig[]
  devices?: DeviceConfig[]
  decorations?: DecorationConfig[]
  // Models imported into the editor's catalog, by id.
  models?: Record<string, ModelConfig>
  // Corner radius in meters applied to rooms without their own.
  radius?: number
  // Gap in meters between adjacent rooms.
  gap?: number
  // Card aspect ratio as "width:height". 16:9 without one. fill takes the
  // whole of whatever holds the card, which then sets its shape.
  aspect_ratio?: string
  // The aspect ratio while the card is narrower than 600 px, as on a phone.
  // Without it the card keeps `aspect_ratio` at every width, or is square
  // when that is not set either.
  aspect_ratio_mobile?: string
  // Where the sun comes from, in degrees clockwise from the top of the plan.
  // 0 puts it beyond the top edge, 90 to the right of it.
  sun_direction?: number
  // The view the card opens with. Without one the camera frames the plan.
  camera?: CameraView
  // The rooms the view of the whole home frames, as room ids, as if they
  // were the only ones. The others still show where they fall in it and
  // still take clicks. Every room when empty or not set.
  frame_rooms?: string[]
  // What a click on a device goes to first. `device`, the default, acts on
  // the device wherever it is clicked from. `room` takes the click for the
  // room the device stands in while that room is not the one the camera has
  // flown to, so a device only answers from inside its room.
  first_click?: 'device' | 'room'
  // Puts the diorama on two thirds of the width and a panel of tiles on
  // the rest: a heading per room, then a tile for each of its devices and
  // of its `entities`. On a narrow card the panel goes under the diorama.
  side_panel?: boolean
  // Hides the Diorama tiles elsewhere on the dashboard that belong to
  // another area while a room is in view. Off, they all stay. The side
  // panel follows the room either way.
  filter_tiles?: boolean
  // The side panel's own section for the whole home, under its `name`,
  // Home by default: the tiles of its `entities`, in this order. With any
  // set, it is all the panel shows with the whole home in view, unless
  // `show_rooms` is on, and each room's tiles show only while that room is
  // in view.
  home?: HomeConfig
  // The order of the rooms in the side panel, by id. A room it does not name
  // follows the ones it does, in the plan's order.
  room_order?: string[]
  background?: BackgroundConfig
  // Sizes of the side panel's layout for each screen it is seen on, by the
  // id the screen gave itself. Set from the card's settings on that screen.
  screens?: Record<string, ScreenConfig>
}

// One screen's sizes. Without them the diorama takes two thirds of the
// width beside the tiles and the shape of `aspect_ratio_mobile` over them.
export type ScreenConfig = {
  // Only there to tell the screens apart.
  name?: string
  // The part of the width the diorama takes with the tiles beside it, in
  // percent.
  width?: number
  // The part of the height the diorama takes with the tiles under it, in
  // percent, in a panel view.
  height?: number
}

// A card Home Assistant's card picker offers for an entity.
type Suggestion = { label?: string; config: Record<string, unknown> }

declare global {
  interface Window {
    customCards?: {
      type: string
      name: string
      description?: string
      // Draws the card from its stub config in Home Assistant's card picker.
      preview?: boolean
      // The cards Home Assistant offers for an entity picked by entity.
      getEntitySuggestion?: (hass: HomeAssistant, entityId: string) => Suggestion | Suggestion[] | null
    }[]
  }
}
