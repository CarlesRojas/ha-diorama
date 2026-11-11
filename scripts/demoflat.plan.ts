// The demo flat: a small, fully furnished home with a living room, a
// kitchen open to it, a bedroom, a bathroom, and a hall off the living room
// whose stairs climb to a first floor with a study, a children's room, a
// laundry and a roof terrace. scripts/demoflat.ts writes it to demoflat.yaml
// and the dev page at src/dev/demoflat.html draws it with made up devices,
// for the screenshots in the README.
import type {
  Area,
  CardConfig,
  DecorationConfig,
  DeviceConfig,
  EntityRegistryEntry,
  EntityState,
  Point,
} from '#/types.ts'

// The four rooms, counter clockwise on the plan. The kitchen is open to the
// living room, on the same floor behind the sofa, and the bedroom and the
// bathroom sit to their right.
const LIVING: Point[] = [
  [0, 0],
  [4.2, 0],
  [4.2, 3.05],
  [0, 3.05],
]
const KITCHEN: Point[] = [
  [0, 3.05],
  [4.2, 3.05],
  [4.2, 5.6],
  [0, 5.6],
]
const BEDROOM: Point[] = [
  [4.2, 2.2],
  [7.8, 2.2],
  [7.8, 5.6],
  [4.2, 5.6],
]
const BATHROOM: Point[] = [
  [4.2, 0],
  [7.8, 0],
  [7.8, 2.2],
  [4.2, 2.2],
]
// The hall along the left, through a door from the living room, with the
// stairs up its outside wall. In front of the door the hall is clear, and
// the stairs start just past it and climb away from it, so coming in from
// the living room there is room to step in and turn onto the first step.
const HALL: Point[] = [
  [-1.6, 0],
  [0, 0],
  [0, 5.6],
  [-1.6, 5.6],
]

// The first floor stands over the ground floor's rooms: the terrace over
// the living room, the children's room over the kitchen, the study over the
// bedroom and the laundry over the bathroom. Over the hall only its far end
// is floored, as the landing the stairs arrive on, and the rest is left open
// for the stairwell.
const TERRACE: Point[] = LIVING
const KIDS: Point[] = KITCHEN
const STUDY: Point[] = BEDROOM
const LAUNDRY: Point[] = BATHROOM
const LANDING: Point[] = [
  [-1.6, 4.6],
  [0, 4.6],
  [0, 5.6],
  [-1.6, 5.6],
]

// Every piece in the flat, placed and colored in the editor.
const decorations: DecorationConfig[] = [
  { id: 'sofa', kind: 'sofa', room: 'living', position: [2, 2.5], variant: 'block' },
  { id: 'rug', kind: 'rug', room: 'living', position: [2, 1.4], variant: 'kilim' },
  { id: 'coffee_table', kind: 'coffee_table', room: 'living', position: [2, 1.3], variant: 'slatted' },
  { id: 'books', kind: 'books', room: 'living', position: [1.7, 1.25], on: 'coffee_table', rotation: 300 },
  {
    id: 'coffee_plant',
    kind: 'plant_small',
    room: 'living',
    position: [2.3, 1.4],
    variant: 'pilea',
    on: 'coffee_table',
  },
  { id: 'sideboard', kind: 'sideboard', room: 'living', position: [2, 0.2], variant: 'oak', rotation: 180 },
  { id: 'tv', kind: 'tv_wall', room: 'living', position: [2, 0], rotation: 180 },
  {
    id: 'soundbar',
    kind: 'soundbar',
    room: 'living',
    position: [2, 0.2],
    variant: 'bar',
    rotation: 180,
    on: 'sideboard',
  },
  { id: 'living_plant', kind: 'plant_large', room: 'living', position: [3.8, 2.7], variant: 'fiddle' },
  { id: 'floor_lamp', kind: 'light_floor', room: 'living', position: [0.5, 2.45], variant: 'tmm' },
  {
    id: 'hall_window',
    kind: 'window',
    room: 'hall',
    position: [-1.6, 5.1],
    rotation: 90,
    variant: 'casement',
    params: { height: 1.45, sill: 0.65, width: 0.75 },
  },
  {
    id: 'hall_blind',
    kind: 'blind',
    room: 'hall',
    position: [-1.6, 5.1],
    rotation: 90,
    variant: 'venetian',
    params: { outside: 1, width: 0.75 },
  },
  { id: 'front_door', kind: 'door', room: 'living', position: [3.7, 0], rotation: 180, variant: 'panel' },
  { id: 'front_lock', kind: 'smart_lock', room: 'living', position: [3.05, 0], rotation: 180 },
  { id: 'thermostat', kind: 'thermostat', room: 'kitchen', position: [4.2, 4.15], rotation: 270 },
  { id: 'living_light', kind: 'light_ceiling', room: 'living', position: [2.3, 1.8] },
  { id: 'vacuum', kind: 'vacuum_robot', room: 'bathroom', position: [7.55, 0.35], rotation: 270 },
  { id: 'counter_a', kind: 'kitchen_counter', room: 'kitchen', position: [0.9, 5.3], variant: 'run' },
  { id: 'counter_b', kind: 'kitchen_counter', room: 'kitchen', position: [2.7, 5.3], variant: 'run' },
  { id: 'hob', kind: 'hob', room: 'kitchen', position: [0.9, 5.3], variant: 'induction' },
  {
    id: 'kettle',
    kind: 'kettle',
    room: 'kitchen',
    position: [0.15, 5.45],
    variant: 'jug',
    on: 'counter_a',
    colors: { body: '#7a7a7a', fittings: '#454545' },
  },
  {
    id: 'coffee_machine',
    kind: 'coffee_machine',
    room: 'kitchen',
    position: [1.9, 5.45],
    variant: 'bambino',
    on: 'counter_b',
  },
  { id: 'sink', kind: 'kitchen_sink', room: 'kitchen', position: [2.9, 5.3], variant: 'undermount', on: 'counter_b' },
  { id: 'toaster', kind: 'toaster', room: 'kitchen', position: [1.55, 5.45], variant: 'retro', on: 'counter_a' },
  { id: 'cabinets_a', kind: 'upper_cabinets', room: 'kitchen', position: [0.9, 5.6], rotation: 0 },
  { id: 'cabinets_b', kind: 'upper_cabinets', room: 'kitchen', position: [2.7, 5.6], rotation: 0 },
  {
    id: 'fridge',
    kind: 'fridge',
    room: 'kitchen',
    position: [3.9, 5.27],
    variant: 'bespoke',
    params: { flip: 1, height: 2.2 },
    colors: { body: '#9d9c9b', doors: '#acabaa' },
  },
  { id: 'island', kind: 'kitchen_counter', room: 'kitchen', position: [2.1, 4.1], variant: 'island' },
  {
    id: 'island_vase',
    kind: 'vase',
    room: 'kitchen',
    position: [2.65, 4.15],
    on: 'island',
    params: { height: 0.21, size: 0.16 },
  },
  { id: 'stool_a', kind: 'stool', room: 'kitchen', position: [1.7, 3.4], variant: 'lauta', rotation: 180 },
  { id: 'stool_b', kind: 'stool', room: 'kitchen', position: [2.5, 3.4], variant: 'lauta', rotation: 180 },
  { id: 'pendant_a', kind: 'light_pendant', room: 'kitchen', position: [1.65, 4.1], variant: 'globo_cestita' },
  { id: 'pendant_b', kind: 'light_pendant', room: 'kitchen', position: [2.55, 4.1], variant: 'globo_cestita' },
  { id: 'smoke', kind: 'smoke_detector', room: 'kitchen', position: [0.9, 4.8] },
  {
    id: 'bed',
    kind: 'bed_double',
    room: 'bedroom',
    position: [6, 4.3],
    variant: 'headboard',
    params: { headboard: 0 },
    colors: { bedding: '#6e6e6e', pillows: '#6e6e6e', frame: '#b99c74' },
  },
  { id: 'nightstand_a', kind: 'side_table', room: 'bedroom', position: [4.95, 5.17], variant: 'nightstand' },
  { id: 'nightstand_b', kind: 'side_table', room: 'bedroom', position: [7.05, 5.17], variant: 'nightstand' },
  {
    id: 'bedside_a',
    kind: 'light_table',
    room: 'bedroom',
    position: [4.95, 5.17],
    variant: 'cestita',
    on: 'nightstand_a',
  },
  {
    id: 'bedside_b',
    kind: 'light_table',
    room: 'bedroom',
    position: [7.05, 5.17],
    variant: 'cestita',
    on: 'nightstand_b',
  },
  { id: 'bedroom_light', kind: 'light_ceiling', room: 'bedroom', position: [6, 3.4] },
  {
    id: 'bedroom_window',
    kind: 'window',
    room: 'bedroom',
    position: [7.8, 4.45],
    rotation: 270,
    variant: 'casement',
    params: { height: 1.4, sill: 0.7, width: 0.75 },
  },
  {
    id: 'dresser',
    kind: 'dresser',
    room: 'bedroom',
    position: [7.55, 3.05],
    rotation: 270,
    variant: 'oak',
    params: { width: 1.35 },
  },
  {
    id: 'dresser_plant',
    kind: 'plant_small',
    room: 'bedroom',
    position: [7.55, 3.45],
    variant: 'pilea',
    on: 'dresser',
    params: { size: 0.39 },
  },
  { id: 'bedroom_door', kind: 'door', room: 'bedroom', position: [4.2, 3.5], rotation: 90, variant: 'flush' },
  {
    id: 'shower',
    kind: 'shower',
    room: 'bathroom',
    position: [7.1, 1.75],
    params: { width: 1.4, depth: 0.9, flip: 0 },
  },
  {
    id: 'toilet',
    kind: 'toilet',
    room: 'bathroom',
    position: [5.8, 0.3],
    variant: 'wall_hung',
    rotation: 180,
    params: { depth: 0.6 },
  },
  {
    id: 'basin',
    kind: 'basin',
    room: 'bathroom',
    position: [5.25, 1.95],
    variant: 'vanity',
    params: { width: 1.55, depth: 0.5 },
    colors: { vanity: '#c5ab87' },
  },
  {
    id: 'basin_plant',
    kind: 'plant_small',
    room: 'bathroom',
    position: [5.85, 2.05],
    variant: 'snake',
    params: { size: 0.23 },
    on: 'basin',
  },
  {
    id: 'bathroom_mirror',
    kind: 'wall_mirror',
    room: 'bathroom',
    position: [5.25, 2.2],
    rotation: 0,
    variant: 'square',
    params: { size: 0.85, height: 1.5 },
    colors: { frame: '#958a7e' },
  },
  {
    id: 'towel_rail',
    kind: 'towel_rail',
    room: 'bathroom',
    position: [6.75, 0],
    rotation: 180,
    variant: 'grouped',
    colors: { rail: '#353636' },
  },
  { id: 'bathroom_spot_a', kind: 'light_ceiling', room: 'bathroom', position: [5.15, 1] },
  { id: 'bathroom_spot_b', kind: 'light_ceiling', room: 'bathroom', position: [6.15, 1] },
  { id: 'bathroom_door', kind: 'door', room: 'bathroom', position: [4.2, 1.2], rotation: 90, variant: 'flush' },
  {
    id: 'fan_ceiling-1',
    kind: 'fan_ceiling',
    room: 'bedroom',
    position: [6, 4.5],
    variant: 'classic',
    params: { size: 0.95 },
  },
  {
    id: 'half_wall',
    kind: 'half_wall',
    room: 'bedroom',
    position: [6, 5.5],
    params: { width: 3.6, depth: 0.2, height: 1 },
  },
  {
    id: 'projector',
    kind: 'projector_portable',
    room: 'bedroom',
    position: [6, 5.5],
    on: 'half_wall',
    params: { throw: 3.2 },
  },
  { id: 'projector_screen', kind: 'projector_screen', room: 'bedroom', position: [6, 2.35], params: { inches: 130 } },
  { id: 'living_camera', kind: 'camera', room: 'living', position: [0, 2.1], rotation: 270 },
  { id: 'alarm', kind: 'alarm_panel', room: 'living', position: [3.05, 0], rotation: 180 },
  {
    id: 'kitchen_strip',
    kind: 'light_strip_wall',
    room: 'kitchen',
    position: [1.8, 5.6],
    rotation: 0,
    params: { length: 3, height: 1.45 },
  },
  { id: 'bedroom_speaker', kind: 'speaker', room: 'bedroom', position: [7.55, 2.65], on: 'dresser', variant: 'pod' },
  { id: 'humidifier', kind: 'humidifier', room: 'bedroom', position: [7.55, 5.15] },
  {
    id: 'water_heater',
    kind: 'water_heater',
    room: 'bathroom',
    position: [7.8, 0.85],
    rotation: 270,
    variant: 'combi',
  },
  { id: 'bathroom_leak', kind: 'leak_sensor', room: 'bathroom', position: [6.2, 1.95] },
  { id: 'bathroom_motion', kind: 'motion_sensor', room: 'bathroom', position: [4.2, 1.8], rotation: 90 },
  { id: 'litter_box', kind: 'litter_box', room: 'bathroom', position: [4.56, 0.32], rotation: 90 },

  // The hall, through a door from the living room, and the stairs that climb
  // from beside that door to the first floor, their foot to the south and
  // their top to the north, with the rail on their open side.
  { id: 'hall_door', kind: 'door', room: 'living', position: [0, 0.6], rotation: 90, variant: 'flush' },
  { id: 'stairs', kind: 'stairs', room: 'hall', position: [-1.13, 2.925] },
  { id: 'hall_light', kind: 'light_ceiling', room: 'hall', position: [-0.7, 0.65], variant: 'dome' },
  { id: 'shoe_rack', kind: 'shoe_rack', room: 'hall', position: [-0.8, 5.42] },
  { id: 'hall_plant', kind: 'plant_large', room: 'hall', position: [-1.3, 0.3], variant: 'fiddle' },

  // The landing at the top of the stairs, with a rail along the stairwell
  // beside the flight, and one along the terrace's side of it.
  { id: 'landing_rail', kind: 'railing', room: 'landing', position: [-0.34, 4.65], params: { width: 0.6 } },
  { id: 'landing_light', kind: 'light_ceiling', room: 'landing', position: [-0.8, 5.1], variant: 'dome' },
  { id: 'kids_landing_door', kind: 'door', room: 'kids', position: [0, 5.1], rotation: 90, variant: 'flush' },
  {
    id: 'kids_rail',
    kind: 'railing',
    room: 'kids',
    position: [0.05, 3.825],
    rotation: 90,
    params: { width: 1.5 },
  },
  {
    id: 'terrace_rail',
    kind: 'railing',
    room: 'terrace',
    position: [0.05, 1.525],
    rotation: 90,
    params: { width: 3 },
  },
  {
    id: 'study_window',
    kind: 'window',
    room: 'study',
    position: [7.8, 4.45],
    rotation: 270,
    variant: 'casement',
    params: { height: 1.4, sill: 0.7, width: 0.75 },
  },

  // The study, over the bedroom.
  { id: 'desk', kind: 'desk', room: 'study', position: [6, 5.25] },
  { id: 'monitor', kind: 'monitor', room: 'study', position: [6, 5.35], on: 'desk' },
  { id: 'desk_lamp', kind: 'light_desk', room: 'study', position: [6.6, 5.35], on: 'desk' },
  { id: 'office_chair', kind: 'office_chair', room: 'study', position: [6, 4.65], rotation: 180 },
  { id: 'study_shelf', kind: 'bookshelf', room: 'study', position: [4.4, 3.4], rotation: 90 },
  {
    id: 'study_speaker',
    kind: 'speaker',
    room: 'study',
    position: [4.4, 3.4],
    rotation: 90,
    variant: 'pod',
    on: 'study_shelf',
  },
  { id: 'study_plant', kind: 'plant_large', room: 'study', position: [7.4, 2.6], variant: 'fiddle' },
  { id: 'study_rug', kind: 'rug', room: 'study', position: [6, 4.1] },
  { id: 'kids_door', kind: 'door', room: 'study', position: [4.2, 4.6], rotation: 90, variant: 'flush' },
  { id: 'laundry_door', kind: 'door', room: 'laundry', position: [6.6, 2.2], rotation: 0, variant: 'flush' },

  // The children's room, over the kitchen.
  { id: 'loft_bed', kind: 'loft_bed', room: 'kids', position: [1.1, 5.0] },
  { id: 'kids_sofa', kind: 'kids_sofa', room: 'kids', position: [3.3, 5.2] },
  { id: 'kids_rug', kind: 'rug', room: 'kids', position: [2.4, 4.2], variant: 'kilim' },
  { id: 'kids_fan', kind: 'fan_floor', room: 'kids', position: [3.85, 3.4] },
  { id: 'terrace_door', kind: 'door', room: 'kids', position: [2.6, 3.05], rotation: 180, variant: 'glazed' },

  // The laundry, over the bathroom.
  { id: 'washer', kind: 'washing_machine', room: 'laundry', position: [5.0, 0.35], rotation: 180 },
  { id: 'dryer', kind: 'dryer', room: 'laundry', position: [5.7, 0.35], rotation: 180 },
  { id: 'laundry_light', kind: 'light_ceiling', room: 'laundry', position: [6, 1.1] },

  // The roof terrace, over the living room.
  { id: 'terrace_bench', kind: 'bench', room: 'terrace', position: [2.1, 0.35], rotation: 180 },
  { id: 'terrace_plant_a', kind: 'plant_large', room: 'terrace', position: [0.45, 0.45], variant: 'fiddle' },
  { id: 'terrace_plant_b', kind: 'plant_large', room: 'terrace', position: [3.75, 0.45] },
  { id: 'terrace_lights', kind: 'light_string', room: 'terrace', position: [2.1, 1.6] },
]

const devices: DeviceConfig[] = []

// A Home Assistant entity standing behind one or more pieces.
function device(entity_id: string, ...ids: string[]) {
  const first = decorations.find(d => d.id === ids[0])!
  devices.push({ entity_id, room: first.room, position: first.position, decorations: ids })
}

// The devices behind the pieces. The entity ids are made up: in your own
// card the editor binds the pieces to your real entities.
device('light.floor_lamp', 'floor_lamp')
device('light.kitchen_pendants', 'pendant_a', 'pendant_b')
device('vacuum.robot', 'vacuum')
device('light.bathroom', 'bathroom_spot_a', 'bathroom_spot_b')
device('light.bedside_lamps', 'bedside_a', 'bedside_b')
device('fan.ceiling_fan', 'fan_ceiling-1')
device('cover.hall_blind', 'hall_blind')
device('climate.thermostat', 'thermostat')
device('media_player.living_tv', 'tv', 'soundbar')
device('lock.front_door', 'front_lock')
device('switch.kitchen_strip', 'kitchen_strip')
device('camera.backyard', 'living_camera')
device('binary_sensor.bathroom_motion', 'bathroom_motion')
device('alarm_control_panel.home', 'alarm')
device('light.living_room', 'living_light')
device('light.bedroom', 'bedroom_light')
device('media_player.bedroom_speaker', 'bedroom_speaker')
device('humidifier.bedroom', 'humidifier')
device('cover.projector_screen', 'projector_screen')
device('media_player.bedroom_projector', 'projector')
device('water_heater.boiler', 'water_heater')
device('binary_sensor.bathroom_moisture', 'bathroom_leak')
device('button.litter_box_scoop', 'litter_box')
device('light.hall', 'hall_light', 'landing_light')
device('switch.desk_lamp', 'desk_lamp')
device('media_player.study_speaker', 'study_speaker')
device('fan.kids_fan', 'kids_fan')

export const DEMO_FLAT: CardConfig = {
  type: 'custom:diorama-card',
  side_panel: true,
  // A click on a piece in another room flies to that room first.
  first_click: 'room',
  // With the whole flat in view the panel shows only these, and each room's
  // tiles show once that room is.
  home: {
    entities: ['switch.projector_scene', 'switch.tv_scene', 'switch.all_lights', 'switch.cleaning', 'weather.home'],
  },
  floors: [
    { id: 'ground', name: 'Ground floor', level: 0 },
    { id: 'first', name: 'First floor', level: 1 },
  ],
  rooms: [
    {
      id: 'living',
      floor_id: 'ground',
      name: 'Living room',
      area_id: 'living_room',
      points: LIVING,
      floor: { material: 'wood' },
      camera: { position: [-0.4, 4.3, -4.68], target: [2.24, 0.3, -1.11] },
      order: [
        'light.living_room',
        'light.floor_lamp',
        'media_player.living_tv',
        'lock.front_door',
        'alarm_control_panel.home',
        'camera.backyard',
      ],
    },
    {
      id: 'kitchen',
      floor_id: 'ground',
      name: 'Kitchen',
      area_id: 'kitchen',
      points: KITCHEN,
      floor: { material: 'wood' },
      camera: { position: [-1.26, 3.91, -1.25], target: [2.29, 0.3, -4.94] },
      entities: ['weather.home'],
      hide_arrows: ['hall'],
      order: ['light.kitchen_pendants', 'switch.kitchen_strip', 'weather.home', 'climate.thermostat'],
    },
    {
      id: 'bedroom',
      floor_id: 'ground',
      name: 'Bedroom',
      area_id: 'bedroom',
      points: BEDROOM,
      floor: { material: 'carpet', color: '#ababab' },
      camera: { position: [10.82, 4.79, -5.06], target: [5.79, 0.3, -3.35] },
      order: [
        'light.bedside_lamps',
        'light.bedroom',
        'fan.ceiling_fan',
        'humidifier.bedroom',
        'media_player.bedroom_speaker',
        'media_player.bedroom_projector',
        'cover.projector_screen',
      ],
    },
    {
      id: 'bathroom',
      floor_id: 'ground',
      name: 'Bathroom',
      area_id: 'bathroom',
      points: BATHROOM,
      floor: { material: 'tiles', color: '#707070' },
      camera: { position: [8.29, 3.76, 2.7], target: [6.12, 0.91, -0.96] },
      order: [
        'light.bathroom',
        'binary_sensor.bathroom_motion',
        'vacuum.robot',
        'water_heater.boiler',
        'binary_sensor.bathroom_moisture',
        'button.litter_box_scoop',
      ],
    },
    {
      id: 'hall',
      floor_id: 'ground',
      name: 'Hall',
      area_id: 'hall',
      points: HALL,
      floor: { material: 'tiles', color: '#c9c1b3' },
      order: ['light.hall', 'cover.hall_blind'],
      // Open to the kitchen along their shared wall, but the way in is the
      // door from the living room.
      hide_arrows: ['kitchen'],
    },
    {
      id: 'landing',
      floor_id: 'first',
      name: 'Landing',
      area_id: 'landing',
      points: LANDING,
      floor: { material: 'wood' },
    },
    {
      id: 'study',
      floor_id: 'first',
      name: 'Study',
      area_id: 'study',
      points: STUDY,
      floor: { material: 'wood' },
      order: ['switch.desk_lamp', 'media_player.study_speaker'],
    },
    {
      id: 'kids',
      floor_id: 'first',
      name: "Children's room",
      area_id: 'kids_room',
      points: KIDS,
      floor: { material: 'carpet', color: '#b9b2a6' },
    },
    {
      id: 'laundry',
      floor_id: 'first',
      name: 'Laundry',
      area_id: 'laundry',
      points: LAUNDRY,
      floor: { material: 'tiles', color: '#8a8a8a' },
    },
    {
      id: 'terrace',
      floor_id: 'first',
      name: 'Terrace',
      area_id: 'terrace',
      points: TERRACE,
      floor: { material: 'terracotta' },
    },
  ],
  devices,
  decorations,
  // The view the card opens with: the whole flat from the front.
  camera: { position: [3.97, 8.58, 3.33], target: [3.97, 0.3, -3.08] },
}

// The same entities in Home Assistant's own Demo integration, for the
// dashboard in ha-demo, where the flat runs against a real Home Assistant.
export const HA_DEMO_IDS: Record<string, string> = {
  'light.floor_lamp': 'light.living_room_rgbww_lights',
  'light.kitchen_pendants': 'light.kitchen_lights',
  'vacuum.robot': 'vacuum.demo_vacuum_0_ground_floor',
  'light.bathroom': 'light.ceiling_lights',
  'light.bedside_lamps': 'light.bed_light',
  'fan.ceiling_fan': 'fan.ceiling_fan',
  'cover.hall_blind': 'cover.hall_window',
  'climate.thermostat': 'climate.hvac',
  'media_player.living_tv': 'media_player.living_room',
  'lock.front_door': 'lock.front_door',
  'switch.kitchen_strip': 'switch.decorative_lights',
  'camera.backyard': 'camera.backyard_camera',
  'binary_sensor.bathroom_motion': 'binary_sensor.movement_backyard',
  'alarm_control_panel.home': 'alarm_control_panel.security',
  'light.living_room': 'light.entrance_color_white_lights',
  'light.bedroom': 'light.office_rgbw_lights',
  'media_player.bedroom_speaker': 'media_player.walkman',
  'humidifier.bedroom': 'humidifier.humidifier',
  'cover.projector_screen': 'cover.projector_screen',
  'media_player.bedroom_projector': 'media_player.bedroom_projector',
  'water_heater.boiler': 'water_heater.demo_water_heater_celsius',
  'binary_sensor.bathroom_moisture': 'binary_sensor.basement_floor_wet',
  'button.litter_box_scoop': 'button.push',
  'weather.home': 'weather.demo_weather_south',
  'light.hall': 'light.hall_light',
  'switch.desk_lamp': 'switch.ac',
  'media_player.study_speaker': 'media_player.kitchen',
  'fan.kids_fan': 'fan.living_room_fan',
}

// What the made up devices report, for the dev page. Every entity starts
// off, closed, docked, locked or armed; the page flips the ones asked for.
const NAMES: Record<string, string> = {
  'light.living_room': 'Living room light',
  'light.floor_lamp': 'Floor lamp',
  'media_player.living_tv': 'Living room TV',
  'lock.front_door': 'Front door',
  'alarm_control_panel.home': 'Security',
  'camera.backyard': 'Backyard camera',
  'light.kitchen_pendants': 'Kitchen pendants',
  'switch.kitchen_strip': 'Kitchen light strip',
  'cover.hall_blind': 'Hall blind',
  'weather.home': 'Home',
  'climate.thermostat': 'Thermostat',
  'light.bedside_lamps': 'Bedside lamps',
  'light.bedroom': 'Bedroom light',
  'fan.ceiling_fan': 'Ceiling fan',
  'humidifier.bedroom': 'Humidifier',
  'media_player.bedroom_speaker': 'Bedroom speaker',
  'media_player.bedroom_projector': 'Projector',
  'cover.projector_screen': 'Projector screen',
  'light.bathroom': 'Bathroom light',
  'binary_sensor.bathroom_motion': 'Bathroom motion',
  'vacuum.robot': 'Robot vacuum',
  'water_heater.boiler': 'Water heater',
  'binary_sensor.bathroom_moisture': 'Bathroom leak',
  'button.litter_box_scoop': 'Scoop',
  'light.hall': 'Hall light',
  'switch.desk_lamp': 'Desk lamp',
  'media_player.study_speaker': 'Study speaker',
  'fan.kids_fan': 'Fan',
}

function initial(entityId: string): { state: string; attributes: Record<string, unknown> } {
  const domain = entityId.split('.')[0]
  switch (domain) {
    case 'light':
      return { state: 'off', attributes: { supported_color_modes: ['color_temp'] } }
    case 'cover':
      return {
        state: 'closed',
        attributes: { current_position: 0, device_class: 'blind', supported_features: 1 | 2 | 4 },
      }
    case 'media_player':
      return { state: 'off', attributes: {} }
    case 'climate':
      return {
        state: 'heat',
        attributes: {
          current_temperature: 21.5,
          temperature: 22,
          hvac_action: 'heating',
          hvac_modes: ['heat', 'cool', 'off'],
          min_temp: 7,
          max_temp: 35,
        },
      }
    case 'lock':
      return { state: 'locked', attributes: {} }
    case 'vacuum':
      return { state: 'docked', attributes: {} }
    case 'fan':
      return { state: 'off', attributes: { percentage: 0 } }
    case 'alarm_control_panel':
      return { state: 'armed_away', attributes: { code_arm_required: false } }
    case 'camera':
      return { state: 'idle', attributes: {} }
    case 'weather':
      return { state: 'sunny', attributes: { temperature: 19, temperature_unit: '°C', humidity: 54 } }
    case 'humidifier':
      return { state: 'off', attributes: { humidity: 50, min_humidity: 30, max_humidity: 70 } }
    case 'water_heater':
      return {
        state: 'eco',
        attributes: {
          current_temperature: 52,
          temperature: 55,
          min_temp: 40,
          max_temp: 70,
          operation_list: ['eco', 'off'],
        },
      }
    case 'button':
      return { state: 'unknown', attributes: {} }
    case 'binary_sensor':
      return { state: 'off', attributes: { device_class: entityId.split('.')[1].split('_').pop() } }
    default:
      return { state: 'off', attributes: {} }
  }
}

// The entity the other way: on, open, playing, unlocked, cleaning.
export function flip(entity: EntityState) {
  const domain = entity.entity_id.split('.')[0]
  const a = entity.attributes
  switch (domain) {
    case 'light':
      if (entity.state === 'on') {
        entity.state = 'off'
        delete a.brightness
      } else {
        entity.state = 'on'
        a.brightness = 255
      }
      break
    case 'cover':
      entity.state = entity.state === 'open' ? 'closed' : 'open'
      a.current_position = entity.state === 'open' ? 100 : 0
      break
    case 'media_player':
      entity.state = entity.state === 'off' ? 'playing' : 'off'
      break
    case 'climate':
      entity.state = entity.state === 'off' ? 'heat' : 'off'
      break
    case 'lock':
      entity.state = entity.state === 'locked' ? 'unlocked' : 'locked'
      break
    case 'vacuum':
      entity.state = entity.state === 'cleaning' ? 'docked' : 'cleaning'
      break
    case 'fan':
      entity.state = entity.state === 'on' ? 'off' : 'on'
      a.percentage = entity.state === 'on' ? 60 : 0
      break
    case 'alarm_control_panel':
      entity.state = entity.state === 'disarmed' ? 'armed_away' : 'disarmed'
      break
    case 'water_heater':
      entity.state = entity.state === 'off' ? 'eco' : 'off'
      break
    case 'camera':
    case 'weather':
    case 'button':
      break
    default:
      entity.state = entity.state === 'on' ? 'off' : 'on'
  }
}

const now = new Date().toISOString()
export const DEMO_STATES: Record<string, EntityState> = Object.fromEntries(
  Object.entries(NAMES).map(([entity_id, name]) => {
    const { state, attributes } = initial(entity_id)
    return [
      entity_id,
      { entity_id, state, attributes: { ...attributes, friendly_name: name }, last_changed: now, last_updated: now },
    ]
  }),
)

export const DEMO_ENTITIES: Record<string, EntityRegistryEntry> = Object.fromEntries(
  devices.map(d => [
    d.entity_id,
    { entity_id: d.entity_id, area_id: DEMO_FLAT.rooms!.find(r => r.id === d.room)!.area_id },
  ]),
)

export const DEMO_AREAS: Record<string, Area> = Object.fromEntries(
  DEMO_FLAT.rooms!.map(r => [r.area_id!, { area_id: r.area_id!, name: r.name!, floor_id: null, icon: null }]),
)
