import Canvas from '#/editor/Canvas.tsx'
import CardPanel from '#/editor/CardPanel.tsx'
import DecorationPanel from '#/editor/DecorationPanel.tsx'
import Scene, { type CameraHandle } from '#/scene/Scene.tsx'
import Overlay from '#/editor/Overlay.tsx'
import RoomInfo from '#/editor/RoomInfo.tsx'
import { field, plainButton } from '#/editor/look.ts'
import Toolbar from '#/editor/Toolbar.tsx'
import FloorPicker from '#/editor/FloorPicker.tsx'
import {
  floorOf,
  floorsOf,
  floorView,
  levelName,
  matchStoreyStairs,
  stairLinks,
  pieceOutline,
  startFloor,
} from '#/lib/floors.ts'
import { traceFrom, useTrace } from '#/editor/trace.ts'
import type { Selection, Tool } from '#/editor/types.ts'
import { fitView, roomCenter, round, type View } from '#/editor/view.ts'
import { snapToWall } from '#/editor/walls.ts'
import { freePlacement, isValidRoom, pointOnBoundary, pointStrictlyInside } from '#/geometry/overlap.ts'
import { decorationKind, type DecorationKind } from '#/decoration/catalog.ts'
import { modelKindId, registerModels } from '#/decoration/models.ts'
import { ridersOf, spotOn } from '#/decoration/surfaces.ts'
import { entityGone } from '#/devices/catalog.ts'
import { initialTry, toggleTry, type TryState, type TryStates } from '#/editor/tryState.ts'
import { deviceTry } from '#/scene/Devices.tsx'
import { DEFAULT_FLOOR_MATERIAL, SCENE_BACKGROUND_CSS } from '#/theme.ts'
import { useBackButton } from '#/lib/backButton.ts'
import { useFlash } from '#/lib/flash.ts'
import { cn } from '#/lib/utils.ts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  MUTED_DANGER_FILL,
  MUTED_DANGER_TEXT,
} from '#/components/ui/alert-dialog.tsx'
import {
  faCamera,
  faCheck,
  faEye,
  faFloppyDisk,
  faTriangleExclamation,
  faXmark,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  EDITOR_DEVICE_GRID_M,
  EDITOR_GRID_M,
  EDITOR_PREVIEW_FRACTION,
  EDITOR_PREVIEW_MIN_PX,
  EDITOR_SIDEBAR_MIN_PX,
  EDITOR_HOUR,
  EDITOR_NIGHT_HOUR,
  EDITOR_SIDEBAR_WIDTH_PX,
} from '#/constants.ts'
import type {
  CameraView,
  FloorConfig,
  CardConfig,
  DecorationConfig,
  DeviceConfig,
  HomeAssistant,
  ModelConfig,
  Point,
  RoomConfig,
} from '#/types.ts'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { EDITOR_TEXT_COMMIT_DELAY_MS } from '#/constants.ts'

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  onChange: (config: CardConfig) => void
  // Saves the card to the dashboard, not only to the dialog holding it.
  // Throws when the save failed, so the editor stays open with the edits.
  onSave?: () => Promise<unknown>
}

type Models = Record<string, ModelConfig> | undefined

// What of the imported models counts as a change. Their shape never changes
// once imported, so it is left out, which keeps a long one from being written
// out again on every edit.
const modelSummary = (models: Models) => Object.entries(models ?? {}).map(([id, m]) => [id, m.name, m.mount ?? 'floor'])

function nextRoomId(rooms: RoomConfig[]) {
  let n = rooms.length + 1
  while (rooms.some(r => r.id === `room-${n}`)) n++
  return n
}

export default function Editor({ hass, config, onChange, onSave }: Props) {
  const [rooms, setRooms] = useState<RoomConfig[]>(config.rooms ?? [])
  const [devices, setDevices] = useState<DeviceConfig[]>(config.devices ?? [])
  const [decorations, setDecorations] = useState<DecorationConfig[]>(config.decorations ?? [])
  const [selectedDecoration, setSelectedDecoration] = useState<string | null>(null)
  // A top named in the selected piece's panel, marked on the plan while the
  // pointer is over its name.
  const [pointedTop, setPointedTop] = useState<string | null>(null)
  // A copied item, kept whole so it can be pasted into another room later,
  // even after the original is gone.
  const [clipboard, setClipboard] = useState<DecorationConfig | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  // The floors of the home. With fewer than two every room is on the same
  // one, as in a card from before floors, and none are written.
  const [floors, setFloors] = useState<FloorConfig[]>(config.floors ?? [])
  const levels = floorsOf({ floors })
  const multi = levels.length > 1
  // The floor being edited. Drawing, dragging, overlaps and placing pieces
  // all work on its rooms alone, and the others show faintly under it.
  const [floorAsked, setFloorAsked] = useState<string | null>(null)
  const activeFloor = multi ? (levels.find(f => f.id === floorAsked)?.id ?? startFloor(levels)?.id ?? null) : null
  const onActive = (room: RoomConfig) => !multi || floorOf(room, levels) === activeFloor
  const floorRooms = rooms.filter(onActive)
  const floorRoomIds = new Set(floorRooms.map(r => r.id))
  const floorDecorations = decorations.filter(d => floorRoomIds.has(d.room))
  // The plan hands back the rooms and pieces of the floor it was given. Put
  // back among the rest, each keeps its place in the list, which is the
  // order the side panel shows rooms in, and what is new goes at the end.
  const merged = <T extends { id: string }>(all: T[], mine: (item: T) => boolean, next: T[]) => {
    const byId = new Map(next.map(item => [item.id, item]))
    const kept = all.flatMap(item => (mine(item) ? (byId.has(item.id) ? [byId.get(item.id)!] : []) : [item]))
    return [...kept, ...next.filter(item => !all.some(other => other.id === item.id))]
  }
  const mergeRooms = (next: RoomConfig[]) =>
    merged(rooms, onActive, next).map(r => (multi && !r.floor_id && activeFloor ? { ...r, floor_id: activeFloor } : r))
  const mergeDecorations = (next: DecorationConfig[]) => merged(decorations, d => floorRoomIds.has(d.room), next)
  const [selection, setSelection] = useState<Selection>({ roomId: null, vertex: null })
  const [draft, setDraft] = useState<Point[]>([])
  const [view, setView] = useState<View | null>(null)
  // Closed until Open editor is pressed, so editing the card lands on Home
  // Assistant's own dialog first, with its visibility and layout tabs.
  const [fullscreen, setFullscreen] = useState(false)
  // Pressed, and the editor on its way. Its first draw builds the whole 3D
  // view and takes a moment, during which the button shows it is working.
  const [opening, setOpening] = useState(false)
  const [showLengths, setShowLengths] = useState(false)
  // The picture the rooms are traced over. It is selected like anything
  // else on the plan, which is when it can be moved and sized, and it opens
  // selected when it is first chosen.
  // Each floor has a picture of its own to trace, the first floor the one
  // the home had before it had floors.
  const [trace, setTrace] = useTrace(activeFloor && activeFloor !== startFloor(levels)?.id ? activeFloor : null)
  const [traceSelected, setTraceSelected] = useState(false)
  const pickTrace = async (file: File) => {
    setTrace(await traceFrom(file, floorRooms.length > 0 ? floorRooms : rooms))
    setSelection({ roomId: null, vertex: null })
    setSelectedDecoration(null)
    setTraceSelected(true)
  }
  // One thing at a time is selected: picking a room or a piece, or starting
  // to draw, lets go of the picture.
  if (traceSelected && (selection.roomId || selectedDecoration || tool === 'draw')) setTraceSelected(false)
  const [showPreview, setShowPreview] = useState(true)
  // The hour the preview is lit at. The editor never follows the sun: what
  // is being drawn should look the same whatever the time outside, and the
  // toolbar's slider moves it through the day.
  const [hour, setHour] = useState(EDITOR_HOUR)
  const flipHour = () => setHour(current => (current > 6.5 && current < 21.5 ? EDITOR_NIGHT_HOUR : EDITOR_HOUR))
  // Whether the selected room fills the sidebar. Picking a room opens it,
  // the cross closes it again.
  const [showRoom, setShowRoom] = useState(true)
  // The room the next piece goes in. Picking a room or a piece sets it, and
  // it outlives both, so a run of pieces added one after another all land in
  // the room that was picked rather than scattering once the selection moves
  // to the piece just added.
  const [addRoom, setAddRoom] = useState<string | null>(null)
  // One thing at a time is selected, a room or a piece, never both. Picking
  // either lets go of the other.
  const pickRoom = (next: Selection) => {
    if (next.roomId) {
      setShowRoom(true)
      setSelectedDecoration(null)
      setAddRoom(next.roomId)
    }
    setSelection(next)
  }
  // The home as it was when the editor opened. The editor's 3D view draws
  // it and never anything newer, and trying a piece starts from it.
  const [home, setHome] = useState(hass)
  // States tried on pieces, to see every look they have, the ones with a
  // device included: in the editor a click only tries a device and never
  // switches the real one. Held here only: never saved, and dropped when the
  // editor opens again, so it starts from the home as it is.
  const [tries, setTries] = useState<TryStates>({})
  // Where trying a piece starts: its device as the home had it, or off.
  const startOf = (id: string, kind: DecorationKind) => {
    const device = devices.find(d => d.decorations?.includes(id))
    return device && home
      ? deviceTry(
          home,
          device,
          kind,
          decorations.find(d => d.id === id),
        )
      : initialTry(kind)
  }
  // The pieces trying one also sets, the way a device moves every piece it
  // stands behind. Only those of the same kind, which share its controls.
  const together = (id: string, kind: string) => {
    const device = devices.find(d => d.decorations?.includes(id))
    return (device?.decorations ?? [id]).filter(
      other => other === id || decorations.find(d => d.id === other)?.kind === kind,
    )
  }
  const setTry = (id: string, state: TryState | null) =>
    setTries(all => {
      const next = { ...all }
      for (const other of together(id, decorations.find(d => d.id === id)?.kind ?? '')) {
        if (state) next[other] = state
        else delete next[other]
      }
      return next
    })
  const stepTry = (id: string) => {
    const kind = decorationKind(decorations.find(d => d.id === id)?.kind ?? '')
    if (!kind) return
    setTries(all => {
      const state = toggleTry(kind, all[id] ?? startOf(id, kind))
      const next = { ...all }
      for (const other of together(id, kind.id)) next[other] = state
      return next
    })
  }
  const pickDecoration = (id: string | null) => {
    if (id) {
      setSelection({ roomId: null, vertex: null })
      const item = decorations.find(d => d.id === id)
      if (item) setAddRoom(item.room)
      // A piece on another floor, like another one a device drives, takes
      // the plan to that floor.
      const room = item && rooms.find(r => r.id === item.room)
      if (multi && room && !onActive(room)) setFloorAsked(floorOf(room, levels) ?? null)
    }
    setSelectedDecoration(id)
  }
  // The 3D view's camera, to save where it stands or send it somewhere.
  // Null while the view is closed.
  const camera = useRef<CameraHandle | null>(null)
  // The view the card opens with, taken from where the camera stands now.
  // The save button shows for a moment that the view was taken.
  // With floors, each floor has a view of its own, saved while it is the one
  // being edited, and one with none takes the card's.
  const [mainViewSaved, flashMainViewSaved] = useFlash()
  const savedFloorView = multi ? floors.find(f => f.id === activeFloor)?.camera : undefined
  const openingView = multi ? savedFloorView : config.camera
  const setFloorCamera = (view: CameraView | undefined) =>
    commit(
      rooms,
      devices,
      decorations,
      config.models,
      floors.map(f => {
        if (f.id !== activeFloor) return f
        const { camera: _dropped, ...rest } = f
        return view ? { ...rest, camera: view } : rest
      }),
    )
  const saveMainView = () => {
    const view = camera.current?.view()
    if (!view) return
    if (multi) setFloorCamera(view)
    else onChange({ ...config, camera: view })
    flashMainViewSaved()
  }
  const clearMainView = () => {
    if (multi) setFloorCamera(undefined)
    else {
      const { camera: _dropped, ...rest } = config
      onChange(rest)
    }
    // Back on the view the card comes with, and the camera goes there.
    if (camera.current) camera.current.flyTo((multi && config.camera) || camera.current.frame())
  }
  const setRoomCamera = (roomId: string, view: RoomConfig['camera']) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        if (!view) {
          const { camera: _dropped, ...rest } = r
          return rest
        }
        return { ...r, camera: view }
      }),
    )
  // A room with its view forgotten is back on the one it comes with, and
  // the camera goes there to show it.
  const clearRoomCamera = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    setRoomCamera(roomId, undefined)
    if (room && camera.current) camera.current.flyTo(camera.current.frame(room))
  }
  const saveRoomCamera = (roomId: string) => {
    const view = camera.current?.view()
    if (view) setRoomCamera(roomId, view)
  }
  // With no view saved the card opens on the whole plan, framed.
  const showMainView = () => {
    if (camera.current) camera.current.flyTo(openingView ?? config.camera ?? camera.current.frame())
  }
  const showRoomCamera = (roomId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (room && camera.current) camera.current.flyTo(room.camera ?? camera.current.frame(room))
  }
  const [sidebarWidth, setSidebarWidth] = useState(EDITOR_SIDEBAR_WIDTH_PX)
  const sidebarDrag = useRef<{ startX: number; width: number } | null>(null)
  // Share of the column under the toolbar that the 3D preview takes.
  const [previewShare, setPreviewShare] = useState(EDITOR_PREVIEW_FRACTION)
  const previewDrag = useRef<{ startY: number; share: number; height: number } | null>(null)
  const plan = useRef<HTMLDivElement>(null)
  // Rooms as they were when the fullscreen editor opened, for Discard.
  const [opened, setOpened] = useState<{
    rooms: RoomConfig[]
    devices: DeviceConfig[]
    decorations: DecorationConfig[]
    models: Models
    floors?: FloorConfig[]
  }>({
    rooms: config.rooms ?? [],
    devices: config.devices ?? [],
    decorations: config.decorations ?? [],
    models: config.models,
    floors: config.floors,
  })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const serialize = (r: RoomConfig[], d: DeviceConfig[], x: DecorationConfig[], m: Models, fl?: FloorConfig[]) =>
    JSON.stringify({ rooms: r, devices: d, decorations: x, models: modelSummary(m), floors: fl })
  const lastEmitted = useRef<string>(
    serialize(config.rooms ?? [], config.devices ?? [], config.decorations ?? [], config.models, config.floors),
  )

  // Pick up edits made outside, for example in the YAML editor.
  useEffect(() => {
    const incoming = serialize(
      config.rooms ?? [],
      config.devices ?? [],
      config.decorations ?? [],
      config.models,
      config.floors,
    )
    if (incoming === lastEmitted.current) return
    lastEmitted.current = incoming
    setRooms(config.rooms ?? [])
    setDevices(config.devices ?? [])
    setDecorations(config.decorations ?? [])
    setFloors(config.floors ?? [])
  }, [config])

  // A device is only ever a binding: one with nothing standing in for it is
  // dropped, and the ones that are left follow the item they stand behind,
  // so a device never has a place of its own on the plan.
  const settle = (list: DeviceConfig[], items: DecorationConfig[]): DeviceConfig[] => {
    const out: DeviceConfig[] = []
    for (const device of list) {
      const bound = (device.decorations ?? []).filter(id => items.some(d => d.id === id))
      if (bound.length === 0) continue
      const first = items.find(d => d.id === bound[0])!
      out.push({ ...device, decorations: bound, room: first.room, position: first.position })
    }
    return out
  }

  const commit = (
    nextRooms: RoomConfig[],
    devicesIn: DeviceConfig[] = devices,
    nextDecorations: DecorationConfig[] = decorations,
    nextModels: Models = config.models,
    nextFloors: FloorConfig[] = floors,
  ) => {
    const nextDevices = settle(devicesIn, nextDecorations)
    setFloors(nextFloors)
    setRooms(nextRooms)
    setDevices(nextDevices)
    setDecorations(nextDecorations)
    const serialized = serialize(nextRooms, nextDevices, nextDecorations, nextModels, nextFloors)
    if (serialized === lastEmitted.current) return
    lastEmitted.current = serialized
    const next: CardConfig = { ...config, rooms: nextRooms }
    if (nextDevices.length > 0) next.devices = nextDevices
    else delete next.devices
    if (nextDecorations.length > 0) next.decorations = nextDecorations
    else delete next.decorations
    if (nextModels && Object.keys(nextModels).length > 0) next.models = nextModels
    else delete next.models
    if (nextFloors.length > 0) next.floors = nextFloors
    else delete next.floors
    onChange(next)
  }

  // A device removed from Home Assistant lets go of what it drove, so the
  // card never holds on to an entity that is no longer there.
  useEffect(() => {
    if (!hass) return
    const kept = devices.filter(d => !entityGone(hass, d.entity_id))
    if (kept.length !== devices.length) commit(rooms, kept)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hass, devices])

  // Decoration

  const nextDecorationId = (kindId: string) => {
    // A model's kind says `model:` before its id, which an item's id does not need.
    const base = kindId.replace(':', '-')
    let n = 1
    while (decorations.some(d => d.id === `${base}-${n}`)) n++
    return `${base}-${n}`
  }

  // Inside the room, or on its wall for a wall item.
  const within = (p: Point, points: Point[]) => pointStrictlyInside(p, points) || pointOnBoundary(p, points)

  const addDecoration = (kind: DecorationKind, models: Models = config.models) => {
    const room = targetRoom()
    if (!room) {
      if (models !== config.models) commit(rooms, devices, decorations, models)
      return
    }
    const item: DecorationConfig = {
      id: nextDecorationId(kind.id),
      kind: kind.id,
      room: room.id,
      position: pointInside(room.points),
    }
    if (kind.mount === 'wall') {
      const snapped = snapToWall(item.position, room.points)
      item.position = snapped.point
      item.rotation = snapped.rotation
    }
    // A flight that climbs a storey climbs as high as the others on its floor.
    commit(rooms, devices, matchStoreyStairs({ floors, rooms }, [...decorations, item], item.id, true), models)
    setSelection({ roomId: null, vertex: null })
    setAddRoom(room.id)
    setSelectedDecoration(item.id)
  }

  // A model imported into the catalog goes in with one of it placed, the
  // way a click on a row of the catalog places one.
  const importModel = (id: string, model: ModelConfig) => {
    registerModels({ [id]: model })
    const models = { ...config.models, [id]: model }
    const kind = decorationKind(modelKindId(id))
    if (kind) addDecoration(kind, models)
    else commit(rooms, devices, decorations, models)
  }

  // A model's name and mount are the model's, so they change every piece of
  // it. A change of mount moves them: onto the nearest wall for a wall, and
  // off whatever they stood on for anything but the floor.
  const updateModel = (id: string, patch: Partial<ModelConfig>) => {
    const before = config.models?.[id]
    if (!before) return
    const model = { ...before, ...patch }
    registerModels({ [id]: model })
    const kindId = modelKindId(id)
    const remounted = patch.mount !== undefined && patch.mount !== (before.mount ?? 'floor')
    const next = !remounted
      ? decorations
      : decorations.map(d => {
          if (d.kind !== kindId) {
            // What stood on a piece that leaves the floor stands on the floor.
            const below = d.on ? decorations.find(x => x.id === d.on) : undefined
            if (below?.kind !== kindId || patch.mount === 'floor') return d
            const { on: _on, ...rest } = d
            return rest
          }
          const { on: _on, floor: _floor, ...rest } = d
          const params = Object.fromEntries(
            Object.entries(d.params ?? {}).filter(([key]) => ['width', 'depth', 'height'].includes(key)),
          )
          const moved: DecorationConfig = { ...rest, params: Object.keys(params).length > 0 ? params : undefined }
          if (!moved.params) delete moved.params
          const room = rooms.find(r => r.id === d.room)
          if (patch.mount === 'wall' && room) {
            const snapped = snapToWall(d.position, room.points)
            moved.position = snapped.point
            moved.rotation = snapped.rotation
          } else if (before.mount === 'wall' && room) {
            // Off the wall it stands where it hung, its back to the wall
            // rather than its middle on it.
            const half = (d.params?.depth ?? model.size[1]) / 2
            const turn = ((d.rotation ?? 0) * Math.PI) / 180
            const inside: Point = [
              round(d.position[0] + Math.sin(turn) * half),
              round(d.position[1] - Math.cos(turn) * half),
            ]
            if (within(inside, room.points)) moved.position = inside
          }
          return moved
        })
    commit(rooms, devices, next, { ...config.models, [id]: model })
  }

  // Taking a model out of the catalog takes every piece of it off the plan.
  const removeModel = (id: string) => {
    const kindId = modelKindId(id)
    const gone = new Set(decorations.filter(d => d.kind === kindId).map(d => d.id))
    const left = decorations
      .filter(d => !gone.has(d.id))
      .map(d => {
        if (!d.on || !gone.has(d.on)) return d
        const { on: _dropped, ...rest } = d
        return rest
      })
    let list = devices
    for (const piece of gone) list = unbindEverywhere(list, piece)
    const { [id]: _removed, ...models } = config.models ?? {}
    commit(rooms, list, left, models)
    if (selectedDecoration && gone.has(selectedDecoration)) setSelectedDecoration(null)
  }

  // A flight that climbs a storey takes the others on its floor with it,
  // and one moved to another room takes theirs.
  const updateDecoration = (id: string, patch: Partial<DecorationConfig>) => {
    const moved = patch.room !== undefined && patch.room !== decorations.find(d => d.id === id)?.room
    commit(
      rooms,
      devices,
      matchStoreyStairs(
        { floors, rooms },
        decorations.map(d => (d.id === id ? { ...d, ...patch } : d)),
        id,
        moved,
      ),
    )
  }

  // Unbinds the item from every device, so it stands in for at most one.
  const unbindEverywhere = (list: DeviceConfig[], id: string): DeviceConfig[] =>
    list.map(d => {
      if (!d.decorations?.includes(id)) return d
      const rest = d.decorations.filter(x => x !== id)
      const { decorations: _dropped, ...withoutKey } = d
      return rest.length > 0 ? { ...d, decorations: rest } : withoutKey
    })

  const removeDecoration = (id: string) => {
    // Whatever stood on it drops to the floor rather than disappearing.
    const left = decorations
      .filter(d => d.id !== id)
      .map(d => {
        if (d.on !== id) return d
        const { on: _dropped, ...rest } = d
        return rest
      })
    commit(rooms, unbindEverywhere(devices, id), left)
    if (selectedDecoration === id) setSelectedDecoration(null)
  }

  // Stands an item at another height where it is: on one of the tops under
  // it, on the floor, or at the height it has on its own.
  const standOn = (id: string, level: { on: string | null; floor: boolean }) => {
    commit(
      rooms,
      devices,
      decorations.map(d => {
        if (d.id !== id) return d
        const { on: _on, floor: _floor, ...rest } = d
        if (level.on) return { ...rest, on: level.on }
        return level.floor ? { ...rest, floor: true } : rest
      }),
    )
  }

  // Moves an item onto a top picked in its panel: onto a free spot on it,
  // facing the way it faces, with whatever stands on the item along.
  const putOn = (id: string, supportId: string) => {
    const item = decorations.find(d => d.id === id)
    const support = decorations.find(d => d.id === supportId)
    if (!item || !support) return
    const { position, rotation } = spotOn(item, support, decorations)
    const dx = position[0] - item.position[0]
    const dy = position[1] - item.position[1]
    const riders = new Set(ridersOf(id, decorations).map(r => r.id))
    commit(
      rooms,
      devices,
      decorations.map(d => {
        if (d.id === id) {
          const { floor: _floor, ...rest } = d
          return { ...rest, position, rotation, room: support.room, on: support.id }
        }
        if (!riders.has(d.id)) return d
        return { ...d, position: [round(d.position[0] + dx), round(d.position[1] + dy)] as Point }
      }),
    )
  }

  // A copy sits one grid step away, so it does not hide under the original.
  const offsetCopy = (item: DecorationConfig, room: RoomConfig | undefined): DecorationConfig => {
    const kind = decorationKind(item.kind)
    const copy: DecorationConfig = {
      ...item,
      params: item.params ? { ...item.params } : undefined,
      colors: item.colors ? { ...item.colors } : undefined,
      room: room?.id ?? item.room,
    }
    if (!copy.params) delete copy.params
    if (!copy.colors) delete copy.colors
    if (!room) return copy
    const step: Point = [round(item.position[0] + EDITOR_GRID_M), round(item.position[1] - EDITOR_GRID_M)]
    copy.position = within(step, room.points) ? step : item.position
    if (!within(copy.position, room.points)) copy.position = pointInside(room.points)
    if (kind?.mount === 'wall') {
      const snapped = snapToWall(copy.position, room.points)
      copy.position = snapped.point
      copy.rotation = snapped.rotation
    }
    return copy
  }

  const duplicateDecoration = (id: string) => {
    const item = decorations.find(d => d.id === id)
    if (!item) return
    const copy = offsetCopy(
      item,
      rooms.find(r => r.id === item.room),
    )
    copy.id = nextDecorationId(item.kind)
    commit(rooms, devices, matchStoreyStairs({ floors, rooms }, [...decorations, copy], copy.id, true))
    setSelection({ roomId: null, vertex: null })
    setSelectedDecoration(copy.id)
  }

  const copyDecoration = (id: string) => {
    const item = decorations.find(d => d.id === id)
    if (item) setClipboard(item)
  }

  const pasteDecoration = () => {
    const item = clipboard
    if (!item) return
    const room = selectedRoom ?? floorRooms.find(r => r.id === item.room) ?? targetRoom()
    if (!room) return
    const copy = offsetCopy(item, room)
    copy.id = nextDecorationId(item.kind)
    if (!within(copy.position, room.points)) copy.position = pointInside(room.points)
    commit(rooms, devices, matchStoreyStairs({ floors, rooms }, [...decorations, copy], copy.id, true))
    setSelection({ roomId: null, vertex: null })
    setSelectedDecoration(copy.id)
  }

  // A duplicated room keeps its shape and floor but not its area, since an
  // area can stand for one room only.
  const duplicateRoom = (id: string) => {
    const room = rooms.find(r => r.id === id)
    if (!room) return
    const placed = freePlacement(
      room.points,
      rooms.filter(r => floorOf(r, levels) === floorOf(room, levels)).map(r => r.points),
    )
    if (!placed) return
    const n = nextRoomId(rooms)
    const { area_id: _dropped, ...rest } = room
    const copy: RoomConfig = {
      ...rest,
      id: `room-${n}`,
      name: room.name ? `${room.name} copy` : `Room ${n}`,
      points: placed.map(([x, y]) => [round(x), round(y)] as Point),
    }
    commit([...rooms, copy])
    setSelection({ roomId: copy.id, vertex: null })
  }

  // Arrow keys move whatever is selected by one grid step, or by the fine
  // step while Shift is held.
  const nudge = (dx: number, dy: number, fine: boolean) => {
    const step = fine ? EDITOR_DEVICE_GRID_M : EDITOR_GRID_M
    const move = ([x, y]: Point): Point => [round(x + dx * step), round(y + dy * step)]
    if (selectedDecoration) {
      const item = decorations.find(d => d.id === selectedDecoration)
      const room = rooms.find(r => r.id === item?.room)
      if (!item || !room) return
      const target = move(item.position)
      if (!within(target, room.points)) return
      const kind = decorationKind(item.kind)
      if (kind?.mount === 'wall') {
        const snapped = snapToWall(target, room.points)
        updateDecoration(item.id, { position: snapped.point, rotation: snapped.rotation })
      } else updateDecoration(item.id, { position: target })
      return
    }
    const room = selectedRoom
    if (!room) return
    const others = floorRooms.filter(r => r.id !== room.id).map(r => r.points)
    const points =
      selection.vertex === null
        ? room.points.map(move)
        : room.points.map((p, i) => (i === selection.vertex ? move(p) : p))
    if (isValidRoom(points, others)) updateRoom(room.id, { points })
  }

  const duplicateSelected = () => {
    if (selectedDecoration) duplicateDecoration(selectedDecoration)
    else if (selection.roomId) duplicateRoom(selection.roomId)
  }

  const rotateSelected = () => {
    if (selectedDecoration) rotateDecoration(selectedDecoration)
  }

  const rotateDecoration = (id: string) => {
    const item = decorations.find(d => d.id === id)
    if (item) updateDecoration(id, { rotation: ((item.rotation ?? 0) + 90) % 360 })
  }

  // A device is nothing but a binding: picking one for an item creates it,
  // dropping it leaves nothing behind. Its room and position follow the item
  // that stands in for it, since it is never placed on the plan itself.
  const bindDecoration = (id: string, entityId: string | null) => {
    const item = decorations.find(d => d.id === id)
    if (!item) return
    const cleared = unbindEverywhere(devices, id)
    if (!entityId) {
      commit(rooms, cleared)
      return
    }
    const existing = cleared.find(d => d.entity_id === entityId)
    const next = existing
      ? cleared.map(d =>
          d.entity_id === entityId
            ? { ...d, room: item.room, position: item.position, decorations: [...(d.decorations ?? []), id] }
            : d,
        )
      : [
          ...cleared,
          {
            entity_id: entityId,
            room: item.room,
            position: item.position,
            decorations: [id],
          } as DeviceConfig,
        ]
    commit(rooms, next)
  }

  const setFloor = (roomId: string, floor: RoomConfig['floor']) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        if (!floor) {
          const { floor: _dropped, ...rest } = r
          return rest
        }
        return { ...r, floor }
      }),
    )

  // Raises or sinks a room's floor, or brings it back level.
  const setElevation = (roomId: string, elevation: number | undefined) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        const { elevation: _dropped, ...rest } = r
        return elevation ? { ...rest, elevation } : rest
      }),
    )

  // Sets the sensor that says someone is in a room and the filter laid over
  // its floor while it does, or takes it away.
  const setPresence = (roomId: string, presence: RoomConfig['presence']) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        const { presence: _dropped, ...rest } = r
        return presence ? { ...rest, presence } : rest
      }),
    )

  // Shows or hides, in a room's view, the sign on the floor into a room
  // open beside it.
  const setArrow = (roomId: string, other: string, shown: boolean) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        const hidden = (r.hide_arrows ?? []).filter(id => id !== other)
        if (!shown) hidden.push(other)
        const { hide_arrows: _dropped, ...rest } = r
        return hidden.length > 0 ? { ...rest, hide_arrows: hidden } : rest
      }),
    )

  const selectedRoom = floorRooms.find(r => r.id === selection.roomId) ?? null

  // Where a new piece lands: the selected room, the room the selected piece
  // stands in, the last room either of them was in, or any room at all, all
  // on the floor being edited.
  const targetRoom = () => {
    if (selectedRoom) return selectedRoom
    const item = decorations.find(d => d.id === selectedDecoration)
    const its = item ? floorRooms.find(r => r.id === item.room) : undefined
    if (its) return its
    const last = floorRooms.find(r => r.id === addRoom)
    if (last) return last
    return floorRooms.length > 0 ? floorRooms[Math.floor(Math.random() * floorRooms.length)] : null
  }

  // Which of a device's percentages drives which movement of the item.
  const setDeviceLevels = (entityId: string, levels: Record<string, string>) =>
    commit(
      rooms,
      devices.map(d => (d.entity_id === entityId ? { ...d, levels } : d)),
    )

  const assignArea = (roomId: string, areaId: string | undefined) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room || room.area_id === areaId) return
    commit(rooms.map(r => (r.id === roomId ? { ...r, area_id: areaId } : r)))
  }

  const updateRoom = (id: string, patch: Partial<RoomConfig>) =>
    commit(rooms.map(r => (r.id === id ? { ...r, ...patch } : r)))

  // Text edits update the canvas at once but reach Home Assistant only after a
  // pause, since HA rebuilds the preview card on every config change.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRooms = useRef<RoomConfig[] | null>(null)
  const flushRename = () => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    if (pendingRooms.current) commit(pendingRooms.current)
    pendingRooms.current = null
  }
  const renameRoom = (id: string, name: string | undefined) => {
    const next = rooms.map(r => (r.id === id ? { ...r, name } : r))
    setRooms(next)
    pendingRooms.current = next
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(flushRename, EDITOR_TEXT_COMMIT_DELAY_MS)
  }
  // A rename still on its pause when the editor goes is sent as it goes,
  // rather than firing on an editor that is no longer there.
  const latestFlush = useRef(flushRename)
  useEffect(() => {
    latestFlush.current = flushRename
  })
  useEffect(() => () => latestFlush.current(), [])

  const deleteRoom = (id: string) => {
    const gone = new Set(decorations.filter(d => d.room === id).map(d => d.id))
    let nextDevices = devices.filter(d => d.room !== id)
    for (const g of gone) nextDevices = unbindEverywhere(nextDevices, g)
    commit(
      rooms.filter(r => r.id !== id),
      nextDevices,
      decorations.filter(d => d.room !== id),
    )
    if (selection.roomId === id) setSelection({ roomId: null, vertex: null })
  }

  // Floors

  // Another floor to edit lets go of whatever was picked on this one.
  const goToFloor = (id: string) => {
    setFloorAsked(id)
    setSelection({ roomId: null, vertex: null })
    setSelectedDecoration(null)
    setTraceSelected(false)
    setDraft([])
    setAddRoom(null)
  }

  const newFloorId = (list: { id: string }[]) => {
    let n = 1
    while (list.some(f => f.id === `floor-${n}`)) n++
    return `floor-${n}`
  }

  // A floor over the highest, or under the lowest. The first one added to
  // a home with none makes the floor every room is on its ground floor, and
  // writes it on each room, so moving the floors round later moves no room.
  // A floor as written back, its name and level filled in and whatever else
  // it had, like its view, kept.
  const written = (floor: { id: string; name: string; level: number }): FloorConfig => ({
    ...floors.find(f => f.id === floor.id),
    id: floor.id,
    name: floor.name,
    level: floor.level,
  })

  const addFloor = (below: boolean) => {
    let list: FloorConfig[] = multi ? levels.map(written) : []
    let nextRooms = rooms
    if (list.length === 0) {
      const ground = levels[0] ?? { id: newFloorId([]), name: levelName(0), level: 0 }
      list = [written(ground)]
      nextRooms = rooms.map(r => ({ ...r, floor_id: ground.id }))
    }
    const level = below ? (list[0].level ?? 0) - 1 : (list[list.length - 1].level ?? 0) + 1
    const floor: FloorConfig = { id: newFloorId(list), name: levelName(level), level }
    commit(nextRooms, devices, decorations, config.models, below ? [floor, ...list] : [...list, floor])
    goToFloor(floor.id)
  }

  // The floors in a new order, from the lowest up. They keep the levels
  // there were, handed out again in the new order, and a floor still called
  // what its old level is called takes the name of its new one.
  const orderFloors = (ids: string[]) => {
    const steps = levels.map(f => f.level)
    const next = ids.flatMap((id, i) => {
      const floor = levels.find(f => f.id === id)
      if (!floor) return []
      const level = steps[i]
      return [written({ id, name: floor.name === levelName(floor.level) ? levelName(level) : floor.name, level })]
    })
    commit(rooms, devices, decorations, config.models, next)
  }

  const renameFloor = (id: string, name: string) => {
    const next = levels.map(f => written({ ...f, name: f.id === id ? name.trim() || levelName(f.level) : f.name }))
    commit(rooms, devices, decorations, config.models, next)
  }

  // A floor goes with its rooms, everything in them and the devices bound
  // to those pieces. An empty floor goes at once, one with rooms only once
  // the red dialog below has had its name typed in. With one floor left the
  // home has none again, and its rooms say no floor, as in a card from
  // before floors.
  const [floorToDelete, setFloorToDelete] = useState<string | null>(null)
  const [floorTyped, setFloorTyped] = useState('')
  const askDeleteFloor = (id: string) => {
    if (!rooms.some(r => floorOf(r, levels) === id)) return deleteFloor(id)
    setFloorTyped('')
    setFloorToDelete(id)
  }
  const deleteFloor = (id: string) => {
    setFloorToDelete(null)
    const gone = new Set(rooms.filter(r => floorOf(r, levels) === id).map(r => r.id))
    const goneItems = new Set(decorations.filter(d => gone.has(d.room)).map(d => d.id))
    let nextDevices = devices.filter(d => !gone.has(d.room))
    for (const item of goneItems) nextDevices = unbindEverywhere(nextDevices, item)
    const nextRooms = rooms.filter(r => !gone.has(r.id))
    const nextDecorations = decorations
      .filter(d => !goneItems.has(d.id))
      .map(d => {
        if (!d.on || !goneItems.has(d.on)) return d
        const { on: _dropped, ...rest } = d
        return rest
      })
    const left = levels.filter(f => f.id !== id).map(written)
    if (left.length > 1) commit(nextRooms, nextDevices, nextDecorations, config.models, left)
    else
      commit(
        nextRooms.map(({ floor_id: _dropped, ...rest }) => rest),
        nextDevices,
        nextDecorations,
        config.models,
        [],
      )
    if (activeFloor === id) goToFloor(left[0]?.id ?? '')
  }

  // A room taken to another floor takes everything in it along. Where it
  // would overlap a room already there it moves to the nearest free spot,
  // and the plan goes to that floor with the room still picked.
  const moveToFloor = (roomId: string, floorId: string) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room || floorOf(room, levels) === floorId) return
    const there = rooms.filter(r => r.id !== roomId && floorOf(r, levels) === floorId).map(r => r.points)
    const points = isValidRoom(room.points, there) ? room.points : freePlacement(room.points, there)
    if (!points) return
    const dx = points[0][0] - room.points[0][0]
    const dy = points[0][1] - room.points[0][1]
    const shift = ([x, y]: Point): Point => [round(x + dx), round(y + dy)]
    commit(
      rooms.map(r =>
        r.id === roomId
          ? { ...r, floor_id: floorId, points: points.map(([x, y]) => [round(x), round(y)] as Point) }
          : r,
      ),
      devices,
      dx === 0 && dy === 0
        ? decorations
        : decorations.map(d => (d.room === roomId ? { ...d, position: shift(d.position) } : d)),
    )
    setFloorAsked(floorId)
    setSelection({ roomId, vertex: null })
  }

  // What the floor about to be deleted takes with it, for its dialog.
  const doomed = levels.find(f => f.id === floorToDelete)
  const doomedRooms = rooms.filter(r => doomed && floorOf(r, levels) === doomed.id)
  const doomedPieces = decorations.filter(d => doomedRooms.some(r => r.id === d.room)).length
  const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

  // The flights that come up to the floor being edited from below, drawn on
  // its plan.
  const linkConfig = { ...config, rooms, decorations, floors }
  const arriving = multi
    ? stairLinks(linkConfig)
        .filter(link => link.upper.floor === activeFloor)
        .flatMap(link => {
          const item = decorations.find(d => d.id === link.id)
          return item ? [pieceOutline(item)] : []
        })
    : []

  // The pieces of the floor right below the one being edited, faint under
  // its plan with that floor's rooms, to build this one over them.
  const below = multi ? levels[levels.findIndex(f => f.id === activeFloor) - 1] : undefined
  const belowRooms = new Set(rooms.filter(r => below && floorOf(r, levels) === below.id).map(r => r.id))
  const ghostPieces = decorations.filter(d => belowRooms.has(d.room)).map(pieceOutline)

  const togglePreview = () => setShowPreview(!showPreview)

  const openEditor = () => {
    if (opening) return
    setOpening(true)
    // The editor's first draw would land in the same paint as the button's
    // change, so the button would never be seen loading. Two frames later
    // the browser has shown it, and the editor can take its time.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setOpened({ rooms, devices, decorations, models: config.models, floors })
        setHome(hass)
        setTries({})
        setFullscreen(true)
        setOpening(false)
      }),
    )
  }

  // Saves the card to the dashboard and leaves, with Home Assistant's own
  // dialog still open behind for visibility and layout. A rename still
  // waiting on its pause is sent first, so the save carries it. If the save
  // fails the editor stays open, so nothing is lost.
  const [saving, setSaving] = useState<'save' | 'close' | null>(null)
  // Saves the card to the dashboard. A rename still waiting on its pause is
  // sent first, so the save carries it, and what was saved becomes what
  // Discard goes back to. True when it went through; a failed save says why
  // and leaves everything where it is.
  const persist = async (how: 'save' | 'close') => {
    if (saving) return false
    flushRename()
    setSaving(how)
    try {
      await onSave?.()
    } catch {
      setSaving(null)
      return false
    }
    setSaving(null)
    setOpened({ rooms, devices, decorations, models: config.models, floors })
    return true
  }

  // Saves and stays, for a checkpoint in the middle of a long edit.
  const save = () => void persist('save')

  // Saves and leaves, with Home Assistant's own dialog still open behind for
  // visibility and layout. If the save fails the editor stays open, so
  // nothing is lost.
  const saveAndClose = async () => {
    if (!(await persist('close'))) return
    setDraft([])
    setFullscreen(false)
  }

  const discard = () => {
    if (pending.current) clearTimeout(pending.current)
    pending.current = null
    pendingRooms.current = null
    setDraft([])
    setSelection({ roomId: null, vertex: null })
    setSelectedDecoration(null)
    registerModels(opened.models)
    commit(opened.rooms, opened.devices, opened.decorations, opened.models, opened.floors ?? [])
    setConfirmDiscard(false)
    setFullscreen(false)
  }

  // Closing asks first only when there is something it would throw away.
  // False when it asked rather than closed.
  const close = () => {
    const changed =
      draft.length > 0 ||
      serialize(rooms, devices, decorations, config.models, floors) !==
        serialize(opened.rooms, opened.devices, opened.decorations, opened.models, opened.floors)
    if (changed) setConfirmDiscard(true)
    else discard()
    return !changed
  }
  // The back button, a phone's own too, closes the editor the same way,
  // and stays in it while there is something to save or throw away.
  useBackButton(fullscreen, close)

  const closeDraft = () => {
    if (
      draft.length < 3 ||
      !isValidRoom(
        draft,
        floorRooms.map(r => r.points),
      )
    )
      return
    const n = nextRoomId(rooms)
    const room: RoomConfig = {
      id: `room-${n}`,
      name: `Room ${n}`,
      ...(multi && activeFloor && { floor_id: activeFloor }),
      points: draft.map(([x, y]) => [round(x), round(y)]),
      floor: { material: DEFAULT_FLOOR_MATERIAL },
    }
    commit([...rooms, room])
    setDraft([])
    setSelection({ roomId: room.id, vertex: null })
    setTool('select')
  }

  const deleteSelectedVertex = () => {
    const room = rooms.find(r => r.id === selection.roomId)
    if (!room || selection.vertex === null || room.points.length <= 3) return
    updateRoom(room.id, { points: room.points.filter((_, i) => i !== selection.vertex) })
    setSelection({ roomId: room.id, vertex: null })
  }

  const onKeyDown = (e: KeyboardEvent) => {
    // Listening on the document, the target is retargeted to the shadow host,
    // so look at the real element through the composed path.
    const target = e.composedPath()[0] as HTMLElement
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) return
    // The usual editing commands, on Ctrl everywhere and Cmd on a Mac.
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 'd':
          duplicateSelected()
          break
        case 'c':
          if (selectedDecoration) copyDecoration(selectedDecoration)
          break
        case 'v':
          pasteDecoration()
          break
        default:
          return
      }
      e.preventDefault()
      return
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return
    switch (e.key) {
      case 'ArrowLeft':
        nudge(-1, 0, e.shiftKey)
        break
      case 'ArrowRight':
        nudge(1, 0, e.shiftKey)
        break
      case 'ArrowUp':
        nudge(0, 1, e.shiftKey)
        break
      case 'ArrowDown':
        nudge(0, -1, e.shiftKey)
        break
      case 'r':
      case 'R':
        rotateSelected()
        break
      case 'v':
      case 'V':
        setTool('select')
        break
      case 'd':
      case 'D':
        setTool('draw')
        break
      case 'f':
      case 'F':
        setView(null)
        break
      case 'l':
      case 'L':
        setShowLengths(!showLengths)
        break
      case 'p':
      case 'P':
        togglePreview()
        break
      case 'n':
      case 'N':
        flipHour()
        break
      case 'Enter':
        closeDraft()
        break
      case 'Escape':
        setTraceSelected(false)
        setDraft([])
        setSelection({ roomId: null, vertex: null })
        setSelectedDecoration(null)
        break
      case 'Delete':
      case 'Backspace':
        if (traceSelected) {
          setTrace(null)
          setTraceSelected(false)
        } else if (selectedDecoration) removeDecoration(selectedDecoration)
        else deleteSelectedVertex()
        break
      default:
        return
    }
    e.preventDefault()
  }

  // Shortcuts work wherever focus is while the editor is fullscreen. The
  // overlay stops key events at its boundary in the bubble phase, so listen
  // in the capture phase.
  const keyHandler = useRef(onKeyDown)
  useEffect(() => {
    keyHandler.current = onKeyDown
  })
  useEffect(() => {
    if (!fullscreen) return
    const listener = (e: KeyboardEvent) => keyHandler.current(e)
    document.addEventListener('keydown', listener, true)
    return () => document.removeEventListener('keydown', listener, true)
  }, [fullscreen])

  const fit = useCallback((w: number, h: number) => fitView(rooms, w, h), [rooms])

  const canvas = (
    <Canvas
      rooms={floorRooms}
      ghosts={rooms.filter(r => !onActive(r))}
      arriving={arriving}
      ghostPieces={ghostPieces}
      devices={devices}
      decorations={floorDecorations}
      selectedDecoration={selectedDecoration}
      pointedTop={selectedDecoration ? pointedTop : null}
      onDecorations={(next, done) =>
        done ? commit(rooms, devices, mergeDecorations(next)) : setDecorations(mergeDecorations(next))
      }
      onSelectDecoration={pickDecoration}
      onRemoveDecoration={removeDecoration}
      onRotateDecoration={rotateDecoration}
      onDuplicateDecoration={duplicateDecoration}
      onCopyDecoration={copyDecoration}
      onPasteDecoration={pasteDecoration}
      canPaste={clipboard !== null}
      onDuplicateRoom={duplicateRoom}
      newDecorationId={nextDecorationId}
      newRoomName={() => {
        const n = nextRoomId(rooms)
        return { id: `room-${n}`, name: `Room ${n}` }
      }}
      tool={tool}
      showLengths={showLengths}
      selection={selection}
      draft={draft}
      view={view}
      onView={setView}
      fit={fit}
      onSelect={pickRoom}
      onRooms={(next, done) => (done ? commit(mergeRooms(next)) : setRooms(mergeRooms(next)))}
      onDraftPoint={p => setDraft([...draft, p])}
      onCloseDraft={closeDraft}
      onDeleteRoom={deleteRoom}
      onTool={setTool}
      trace={trace}
      traceSelected={traceSelected}
      onTrace={setTrace}
      onSelectTrace={setTraceSelected}
      fill
    />
  )

  const toolbar = (
    <div className="flex items-center gap-3">
      <Toolbar
        tool={tool}
        onTool={setTool}
        floors={
          <FloorPicker
            floors={multi ? levels : [{ id: '', name: levels[0]?.name ?? levelName(0), level: 0 }]}
            active={activeFloor}
            onPick={id => multi && goToFloor(id)}
            onAdd={addFloor}
            onOrder={orderFloors}
            onRename={renameFloor}
            onDelete={askDeleteFloor}
          />
        }
        onFit={() => setView(null)}
        showLengths={showLengths}
        onShowLengths={setShowLengths}
        showPreview={showPreview}
        onShowPreview={togglePreview}
        hour={hour}
        onHour={setHour}
        trace={trace}
        onTrace={next => {
          setTrace(next)
          if (!next) setTraceSelected(false)
        }}
        onPickTrace={pickTrace}
      />
    </div>
  )

  // The selected room fills the sidebar on its own, in place of the
  // catalog, the way a selected item does. Selecting something inside the
  // room is what is being looked at then, so the room steps aside.
  // The cross closes the room's block and brings the catalog back without
  // letting go of the room, since what is added next still belongs in it.
  const roomInfo =
    selectedRoom && showRoom ? (
      <RoomInfo
        room={selectedRoom}
        rooms={floorRooms}
        everyRoom={rooms}
        floorId={activeFloor}
        areas={Object.values(hass?.areas ?? {})}
        onRename={renameRoom}
        onRenameDone={flushRename}
        onAssignArea={assignArea}
        onFloor={setFloor}
        onElevation={setElevation}
        floors={multi ? levels : undefined}
        onAssignFloor={moveToFloor}
        hass={hass}
        onPresence={setPresence}
        decorations={floorDecorations}
        onArrow={setArrow}
        onSaveCamera={saveRoomCamera}
        onShowCamera={showRoomCamera}
        onClearCamera={clearRoomCamera}
        hasPreview={showPreview}
        onDelete={deleteRoom}
        onDeselect={() => setShowRoom(false)}
      />
    ) : null

  // The catalog keeps its place. Adding an item opens that item in the
  // sidebar, and coming back to the list finds it scrolled where it was
  // rather than back at the top.
  const catalogShown = !roomInfo && !selectedDecoration
  const sidebar = useRef<HTMLDivElement>(null)
  const catalogScroll = useRef(0)
  useLayoutEffect(() => {
    if (catalogShown && sidebar.current) sidebar.current.scrollTop = catalogScroll.current
  }, [catalogShown])

  const panels = (
    <DecorationPanel
      hass={hass}
      rooms={floorRooms}
      devices={devices}
      decorations={decorations}
      models={config.models}
      selected={selectedDecoration}
      onAdd={kind => addDecoration(kind)}
      onImportModel={importModel}
      onUpdateModel={updateModel}
      onRemoveModel={removeModel}
      onUpdate={updateDecoration}
      onRemove={removeDecoration}
      onBind={bindDecoration}
      onDeviceLevels={setDeviceLevels}
      onStandOn={standOn}
      onPutOn={putOn}
      onPointTop={setPointedTop}
      onSelect={pickDecoration}
      tries={tries}
      tryStart={startOf}
      onTry={setTry}
    />
  )

  if (fullscreen) {
    return (
      <Overlay>
        <div
          data-light={hass?.themes?.darkMode === false || undefined}
          className="dio-editor font-system flex h-full flex-col gap-3 bg-(--card-background-color) px-4 pt-3 pb-4 text-(--primary-text-color) antialiased outline-none"
        >
          <div className="flex h-10 items-center justify-between">
            {toolbar}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} disabled={saving !== null} className={plainButton}>
                <FontAwesomeIcon icon={faXmark} className="size-3" />
                Close
              </button>
              <button type="button" onClick={save} disabled={saving !== null} className={plainButton}>
                <FontAwesomeIcon icon={faFloppyDisk} className="size-3" />
                {saving === 'save' ? 'Saving' : 'Save'}
              </button>
              <button
                type="button"
                onClick={saveAndClose}
                disabled={saving !== null}
                className="bg-tint-fill flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.98] active:brightness-95 disabled:opacity-50"
              >
                <FontAwesomeIcon icon={faCheck} className="size-3" />
                {saving === 'close' ? 'Saving' : 'Save & Close'}
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 gap-1">
            <div ref={plan} className="flex min-w-0 flex-1 flex-col">
              <div className="flex min-h-0" style={{ flex: showPreview ? 1 - previewShare : 1 }}>
                {canvas}
              </div>
              {showPreview && (
                <>
                  {/* Drag to share the column between the plan and the view. */}
                  <div
                    className="group flex h-4 shrink-0 cursor-row-resize touch-none items-center justify-center"
                    onPointerDown={e => {
                      if (e.button !== 0) return
                      e.currentTarget.setPointerCapture(e.pointerId)
                      previewDrag.current = {
                        startY: e.clientY,
                        share: previewShare,
                        height: plan.current?.clientHeight ?? window.innerHeight,
                      }
                    }}
                    onPointerMove={e => {
                      const d = previewDrag.current
                      if (!d || d.height <= 0) return
                      const next = d.share - (e.clientY - d.startY) / d.height
                      const min = EDITOR_PREVIEW_MIN_PX / d.height
                      setPreviewShare(Math.min(Math.max(next, min), 1 - min))
                    }}
                    onPointerUp={e => {
                      previewDrag.current = null
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    }}
                  >
                    <span className="bg-fill-stronger group-hover:bg-label-2 h-[5px] w-10 rounded-full transition-colors" />
                  </div>
                  <div
                    className="ring-separator relative min-h-0 overflow-hidden rounded-2xl ring-1"
                    style={{ flex: previewShare, background: SCENE_BACKGROUND_CSS }}
                  >
                    {/* The view the card opens with: saved from where the
                        camera stands, flown back to, or forgotten. Named
                        buttons in the corner, over the view. */}
                    <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                      <PreviewButton
                        icon={faXmark}
                        label="Forget view"
                        title="Forget the saved view and go back to the one the card comes with, the whole plan framed"
                        disabled={!openingView}
                        onClick={clearMainView}
                      />
                      <PreviewButton
                        icon={faEye}
                        label="Fly to view"
                        title="Fly the camera to the view the card opens with"
                        onClick={showMainView}
                      />
                      <PreviewButton
                        icon={mainViewSaved ? faCheck : faCamera}
                        label={
                          mainViewSaved ? 'View saved' : openingView ? 'Replace opening view' : 'Save opening view'
                        }
                        title={
                          openingView
                            ? 'Replace the view the card opens with by where the camera stands now'
                            : 'Open the card with the view the camera has now'
                        }
                        done={mainViewSaved}
                        onClick={saveMainView}
                      />
                    </div>
                    <Scene
                      hass={home ?? hass}
                      config={floorView({ ...config, rooms, devices, decorations, floors }, activeFloor)}
                      floor={activeFloor}
                      sky={hour}
                      wheelZoom
                      onPickDecoration={pickDecoration}
                      cameraRef={camera}
                      tries={tries}
                      onTry={stepTry}
                      onPickRoom={id => pickRoom({ roomId: id, vertex: null })}
                      selected={
                        selectedDecoration
                          ? `decoration:${selectedDecoration}`
                          : selection.roomId
                            ? `room:${selection.roomId}`
                            : null
                      }
                      onPickNothing={() => {
                        setSelection({ roomId: null, vertex: null })
                        setSelectedDecoration(null)
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            {/* Drag to resize the sidebar, between a minimum and half the window. */}
            <div
              className="group flex w-4 shrink-0 cursor-col-resize touch-none items-center justify-center"
              onPointerDown={e => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                sidebarDrag.current = { startX: e.clientX, width: sidebarWidth }
              }}
              onPointerMove={e => {
                const d = sidebarDrag.current
                if (!d) return
                const next = d.width - (e.clientX - d.startX)
                setSidebarWidth(Math.min(Math.max(next, EDITOR_SIDEBAR_MIN_PX), window.innerWidth / 2))
              }}
              onPointerUp={e => {
                sidebarDrag.current = null
                e.currentTarget.releasePointerCapture(e.pointerId)
              }}
            >
              <span className="bg-fill-stronger group-hover:bg-label-2 h-10 w-[5px] rounded-full transition-colors" />
            </div>
            <div
              ref={sidebar}
              onScroll={e => {
                if (catalogShown) catalogScroll.current = e.currentTarget.scrollTop
              }}
              className="flex shrink-0 flex-col gap-3 overflow-y-auto pr-1 pl-1"
              style={{ width: sidebarWidth }}
            >
              {roomInfo ?? panels}
            </div>
          </div>
          {/* Deleting a floor with rooms on it takes a lot that cannot be
            brought back, so it is asked in red, and only goes once the
            floor's name is typed in. */}
          <AlertDialog danger open={doomed !== undefined} onOpenChange={open => !open && setFloorToDelete(null)}>
            <AlertDialogHeader>
              <FontAwesomeIcon icon={faTriangleExclamation} className={cn(MUTED_DANGER_TEXT, 'mx-auto mb-1 size-7')} />
              <AlertDialogTitle danger>Delete {doomed?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Its {count(doomedRooms.length, 'room')} and the {count(doomedPieces, 'piece')} in them are deleted with
                it, and the devices bound to those pieces are let go. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="text-label-2 mt-4 flex flex-col gap-1.5 text-left text-xs">
              Type {doomed?.name} to delete it
              <input
                aria-label="Floor name to confirm"
                autoFocus
                value={floorTyped}
                onChange={e => setFloorTyped(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && doomed && floorTyped.trim() === doomed.name) deleteFloor(doomed.id)
                }}
                className={cn(field, 'h-9')}
              />
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setFloorToDelete(null)}>Keep it</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                className={MUTED_DANGER_FILL}
                disabled={!doomed || floorTyped.trim() !== doomed.name}
                onClick={() => doomed && deleteFloor(doomed.id)}
              >
                Delete floor
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialog>
          {/* Inside the editor, so it wears the editor's colors. */}
          <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
            <AlertDialogHeader>
              <AlertDialogTitle>Save changes?</AlertDialogTitle>
              <AlertDialogDescription>
                Discarding them takes the rooms back to how they were when you opened the editor. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction
                className="col-span-2"
                onClick={() => {
                  setConfirmDiscard(false)
                  void saveAndClose()
                }}
              >
                Save & Close
              </AlertDialogAction>
              <AlertDialogCancel onClick={() => setConfirmDiscard(false)}>Keep editing</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={discard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialog>
        </div>
      </Overlay>
    )
  }

  return <CardPanel hass={hass} config={config} onChange={onChange} opening={opening} onOpen={openEditor} />
}

// A named button in the corner of the 3D view. Greyed out when there is no
// saved view for it to act on.
function PreviewButton({
  icon,
  label,
  title,
  disabled,
  done,
  onClick,
}: {
  icon: IconDefinition
  label: string
  title: string
  disabled?: boolean
  // For a moment after it did its thing, the button says so in green.
  done?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'dio-floating border-separator flex h-7 items-center gap-1.5 rounded-full border bg-(--card-background-color)/75 px-3 text-xs font-medium text-(--primary-text-color) shadow-[0_2px_10px_-2px_rgba(0,0,0,0.25)] backdrop-blur-xl backdrop-saturate-150 transition-[background-color,transform] hover:bg-(--card-background-color)/95 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45',
        done && 'text-success',
      )}
    >
      <FontAwesomeIcon icon={icon} className="size-3" />
      <span>{label}</span>
    </button>
  )
}

// A point inside the polygon to drop a new device on. The centroid works for
// convex rooms. For an L shape it can fall outside, so walk toward a corner.
// The point found is put on the grid pieces move on, when that keeps it in.
function pointInside(points: Point[]): Point {
  const c = roomCenter(points)
  const inside = (p: Point) => pointStrictlyInside(p, points) || pointOnBoundary(p, points)
  const g = EDITOR_DEVICE_GRID_M
  const onGrid = (p: Point): Point => {
    const q: Point = [round(Math.round(p[0] / g) * g), round(Math.round(p[1] / g) * g)]
    return inside(q) ? q : [round(p[0]), round(p[1])]
  }
  if (inside(c)) return onGrid(c)
  for (const v of points) {
    for (const t of [0.5, 0.25, 0.75]) {
      const p: Point = [c[0] + (v[0] - c[0]) * t, c[1] + (v[1] - c[1]) * t]
      if (pointStrictlyInside(p, points)) return onGrid(p)
    }
  }
  return points[0]
}
