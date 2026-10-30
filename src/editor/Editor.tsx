import Canvas from '#/editor/Canvas.tsx'
import CardPanel from '#/editor/CardPanel.tsx'
import DecorationPanel from '#/editor/DecorationPanel.tsx'
import Scene, { type CameraHandle } from '#/scene/Scene.tsx'
import Overlay from '#/editor/Overlay.tsx'
import RoomInfo from '#/editor/RoomInfo.tsx'
import { plainButton } from '#/editor/look.ts'
import Toolbar from '#/editor/Toolbar.tsx'
import { traceFrom, useTrace } from '#/editor/trace.ts'
import type { Selection, Tool } from '#/editor/types.ts'
import { fitView, roomCenter, round, type View } from '#/editor/view.ts'
import { snapToWall } from '#/editor/walls.ts'
import { freePlacement, isValidRoom, pointOnBoundary, pointStrictlyInside } from '#/geometry/overlap.ts'
import { decorationKind, type DecorationKind } from '#/decoration/catalog.ts'
import { modelKindId, registerModels } from '#/decoration/models.ts'
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
} from '#/components/ui/alert-dialog.tsx'
import { faCamera, faCheck, faEye, faFloppyDisk, faXmark, type IconDefinition } from '@fortawesome/free-solid-svg-icons'
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
  // A copied item, kept whole so it can be pasted into another room later,
  // even after the original is gone.
  const [clipboard, setClipboard] = useState<DecorationConfig | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [floors, setFloors] = useState<FloorConfig[]>(
    config.floors && config.floors.length > 0
      ? config.floors
      : [{ id: 'floor-0', name: 'Planta Baja', elevation: 0 }]
  )
  const [activeFloorId, setActiveFloorId] = useState<string>(floors[0]?.id ?? 'floor-0')

  const addFloor = () => {
    const nextNum = floors.length
    const id = 'floor-' + nextNum
    const newElevation = (floors[floors.length - 1]?.elevation ?? 0) + 3.0
    const newFloor: FloorConfig = {
      id,
      name: 'Planta ' + nextNum,
      elevation: Math.round(newElevation * 100) / 100,
    }
    const nextFloors = [...floors, newFloor]
    setFloors(nextFloors)
    setActiveFloorId(id)
    setFloors(nextFloors)
    commit(rooms, devices, decorations, config.models, nextFloors)
  }

  const reorderFloors = (nextFloors: FloorConfig[]) => {
    // Collect the sorted elevations from lowest to highest
    const sortedElevations = [...floors].map(f => f.elevation).sort((a, b) => a - b)
    // Assign sorted elevations according to the new visual order (left-to-right = bottom-to-top)
    const withUpdatedElevations = nextFloors.map((floor, index) => ({
      ...floor,
      elevation: sortedElevations[index] ?? floor.elevation,
    }))
    setFloors(withUpdatedElevations)
    setFloors(withUpdatedElevations)
    commit(rooms, devices, decorations, config.models, withUpdatedElevations)
  }

  const updateFloor = (floorId: string, patch: Partial<FloorConfig>) => {
    const nextFloors = floors.map(f => (f.id === floorId ? { ...f, ...patch } : f))
    setFloors(nextFloors)
    setFloors(nextFloors)
    commit(rooms, devices, decorations, config.models, nextFloors)
  }

  const deleteFloor = (floorId: string) => {
    if (floors.length <= 1) return
    const nextFloors = floors.filter(f => f.id !== floorId)
    setFloors(nextFloors)
    if (activeFloorId === floorId) {
      setActiveFloorId(nextFloors[0]?.id ?? 'floor-0')
    }
    setFloors(nextFloors)
    commit(rooms, devices, decorations, config.models, nextFloors)
  }
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
  const [trace, setTrace] = useTrace(activeFloorId)
  const [traceSelected, setTraceSelected] = useState(false)
  const pickTrace = async (file: File) => {
    setTrace(await traceFrom(file, rooms))
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
    return device && home ? deviceTry(home, device, kind) : initialTry(kind)
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
    }
    setSelectedDecoration(id)
  }
  // The 3D view's camera, to save where it stands or send it somewhere.
  // Null while the view is closed.
  const camera = useRef<CameraHandle | null>(null)
  // The view the card opens with, taken from where the camera stands now.
  // The save button shows for a moment that the view was taken.
  const [mainViewSaved, flashMainViewSaved] = useFlash()
  const saveMainView = () => {
    const view = camera.current?.view()
    if (!view) return
    onChange({ ...config, camera: view })
    flashMainViewSaved()
  }
  const clearMainView = () => {
    const { camera: _dropped, ...rest } = config
    onChange(rest)
    // Back on the view the card comes with, and the camera goes there.
    if (camera.current) camera.current.flyTo(camera.current.frame())
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
    if (camera.current) camera.current.flyTo(config.camera ?? camera.current.frame())
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
    const incoming = serialize(config.rooms ?? [], config.devices ?? [], config.decorations ?? [], config.models, config.floors)
    if (incoming === lastEmitted.current) return
    lastEmitted.current = incoming
    setRooms(config.rooms ?? [])
    setDevices(config.devices ?? [])
    setDecorations(config.decorations ?? [])
    if (config.floors) setFloors(config.floors)
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
    if (nextFloors && nextFloors.length > 0) next.floors = nextFloors
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
    commit(rooms, devices, [...decorations, item], models)
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

  const updateDecoration = (id: string, patch: Partial<DecorationConfig>) =>
    commit(
      rooms,
      devices,
      decorations.map(d => (d.id === id ? { ...d, ...patch } : d)),
    )

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
    commit(rooms, devices, [...decorations, copy])
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
    const room = selectedRoom ?? rooms.find(r => r.id === item.room) ?? targetRoom()
    if (!room) return
    const copy = offsetCopy(item, room)
    copy.id = nextDecorationId(item.kind)
    if (!within(copy.position, room.points)) copy.position = pointInside(room.points)
    commit(rooms, devices, [...decorations, copy])
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
      rooms.map(r => r.points),
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
    const others = rooms.filter(r => r.id !== room.id).map(r => r.points)
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

  // Sets custom slab thickness for a room's floor, or resets to standard.
  const setThickness = (roomId: string, thickness: number | undefined) =>
    commit(
      rooms.map(r => {
        if (r.id !== roomId) return r
        const { thickness: _dropped, ...rest } = r
        return thickness ? { ...rest, thickness } : rest
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

  const selectedRoom = rooms.find(r => r.id === selection.roomId) ?? null

  // Where a new piece lands: the selected room, the room the selected piece
  // stands in, the last room either of them was in, or any room at all.
  const targetRoom = () => {
    if (selectedRoom) return selectedRoom
    const item = decorations.find(d => d.id === selectedDecoration)
    const its = item ? rooms.find(r => r.id === item.room) : undefined
    if (its) return its
    const last = rooms.find(r => r.id === addRoom)
    if (last) return last
    return rooms.length > 0 ? rooms[Math.floor(Math.random() * rooms.length)] : null
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
    if (opened.floors) setFloors(opened.floors)
    commit(opened.rooms, opened.devices, opened.decorations, opened.models, opened.floors ?? floors)
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
    const activeRooms = rooms.filter(r => (r.floor_id ?? 'floor-0') === activeFloorId)
    if (
      draft.length < 3 ||
      !isValidRoom(
        draft,
        activeRooms.map(r => r.points),
      )
    )
      return
    const n = nextRoomId(rooms)
    const room: RoomConfig = {
      id: `room-${n}`,
      name: `Room ${n}`,
      floor_id: activeFloorId,
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
      activeFloorId={activeFloorId}
      rooms={rooms}
      devices={devices}
      decorations={decorations}
      selectedDecoration={selectedDecoration}
      onDecorations={(next, done) => (done ? commit(rooms, devices, next) : setDecorations(next))}
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
      onRooms={(next, done) => (done ? commit(next) : setRooms(next))}
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
        floors={floors}
        activeFloorId={activeFloorId}
        onSelectFloor={setActiveFloorId}
        onAddFloor={addFloor}
        onReorderFloors={reorderFloors}
        onUpdateFloor={updateFloor}
        onDeleteFloor={deleteFloor}
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
        rooms={rooms}
        areas={Object.values(hass?.areas ?? {})}
        onRename={renameRoom}
        onRenameDone={flushRename}
        onAssignArea={assignArea}
        onFloor={setFloor}
        onElevation={setElevation}
        onThickness={setThickness}
        floors={floors}
        onAssignFloor={(roomId, floorId) => updateRoom(roomId, { floor_id: floorId })}
        hass={hass}
        onPresence={setPresence}
        decorations={decorations}
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
      rooms={rooms}
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
                        disabled={!config.camera}
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
                          mainViewSaved ? 'View saved' : config.camera ? 'Replace opening view' : 'Save opening view'
                        }
                        title={
                          config.camera
                            ? 'Replace the view the card opens with by where the camera stands now'
                            : 'Open the card with the view the camera has now'
                        }
                        done={mainViewSaved}
                        onClick={saveMainView}
                      />
                    </div>
                    <Scene
                      hass={home ?? hass}
                      config={{ ...config, rooms, devices, decorations, floors }}
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
