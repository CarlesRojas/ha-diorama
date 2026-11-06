import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from '#/components/ui/context-menu.tsx'
import {
  EDITOR_AUTOPAN_MARGIN_PX,
  EDITOR_AUTOPAN_SPEED_PX_S,
  EDITOR_CANVAS_HEIGHT_PX,
  EDITOR_DEVICE_GRID_M,
  EDITOR_FINE_GRID_M,
  EDITOR_DEVICE_RADIUS_PX,
  EDITOR_GRID_M,
  EDITOR_HANDLE_PX,
} from '#/constants.ts'
import { canRide, decorationKind, footprint, isSupport } from '#/decoration/catalog.ts'
import { ridersOf, standHeight, supportUnder } from '#/decoration/surfaces.ts'
import { decorationIcon } from '#/decoration/icons.ts'
import { TRACE_LEAST_WIDTH_M, traceCovers, type Trace } from '#/editor/trace.ts'
import { TraceFrame, TraceImage } from '#/editor/TraceLayer.tsx'
import type { Selection, Tool } from '#/editor/types.ts'
import { round, snap, toPlan, toScreen, zoomAt, type View } from '#/editor/view.ts'
import { snapToWall } from '#/editor/walls.ts'
import {
  freePlacement,
  furthestValid,
  isValidRoom,
  pointOnBoundary,
  pointStrictlyInside,
  segmentEntersAny,
} from '#/geometry/overlap.ts'
import { shortcut } from '#/lib/shortcuts.ts'
import { cn } from '#/lib/utils.ts'
import { EDITOR_BOUND_COLOR, EDITOR_SELECTED_COLOR } from '#/theme.ts'
import type { DecorationConfig, DeviceConfig, Point, RoomConfig } from '#/types.ts'
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons'
import { useEffect, useRef, useState } from 'react'
import { useResizeObserver } from 'usehooks-ts'

type Props = {
  activeFloorId?: string
  rooms: RoomConfig[]
  // Read only, to mark the items that stand in for one.
  devices: DeviceConfig[]
  decorations: DecorationConfig[]
  selectedDecoration: string | null
  onDecorations: (decorations: DecorationConfig[], done: boolean) => void
  onSelectDecoration: (id: string | null) => void
  onRemoveDecoration: (id: string) => void
  onRotateDecoration: (id: string) => void
  onDuplicateDecoration: (id: string) => void
  onCopyDecoration: (id: string) => void
  onPasteDecoration: () => void
  canPaste: boolean
  onDuplicateRoom: (roomId: string) => void
  // Fresh ids, so a copy made mid drag can be dragged right away.
  newDecorationId: (kindId: string) => string
  newRoomName: () => { id: string; name: string }
  tool: Tool
  showLengths: boolean
  selection: Selection
  draft: Point[]
  view: View | null
  onView: (view: View | null) => void
  fit: (width: number, height: number) => View
  onSelect: (selection: Selection) => void
  onRooms: (rooms: RoomConfig[], done: boolean) => void
  onDraftPoint: (point: Point) => void
  onCloseDraft: () => void
  onDeleteRoom: (roomId: string) => void
  onTool: (tool: Tool) => void
  // The picture the rooms are traced over, and whether it is the thing
  // selected, which is when it can be moved and sized.
  trace: Trace | null
  traceSelected: boolean
  onTrace: (trace: Trace) => void
  onSelectTrace: (selected: boolean) => void
  fill?: boolean
}

type Drag =
  | { kind: 'pan'; start: Point; view: View }
  | { kind: 'vertex'; roomId: string; index: number }
  | { kind: 'edge'; roomId: string; index: number; start: Point; origin: Point[] }
  | { kind: 'room'; roomId: string; start: Point; origin: Point[]; already: boolean }
  | { kind: 'decoration'; id: string; start: Point; origin: Point; already: boolean }
  | { kind: 'rotate'; id: string; center: Point }
  | { kind: 'trace'; start: Point; origin: Point }
  | { kind: 'trace-size'; reach: number; width: number }

type Menu =
  | { kind: 'vertex'; roomId: string; index: number }
  | { kind: 'edge'; roomId: string; index: number; point: Point }
  | { kind: 'room'; roomId: string }
  | { kind: 'decoration'; id: string }
  | { kind: 'canvas' }

const HANDLE = EDITOR_HANDLE_PX
const EDGE_HIT_PX = 10
// How far a press may wander and still be a click rather than a drag.
const CLICK_PX = 4

export default function Canvas({
  rooms,
  devices,
  decorations,
  selectedDecoration,
  onDecorations,
  onSelectDecoration,
  onRemoveDecoration,
  onRotateDecoration,
  onDuplicateDecoration,
  onCopyDecoration,
  onPasteDecoration,
  canPaste,
  onDuplicateRoom,
  newDecorationId,
  newRoomName,
  tool,
  showLengths,
  selection,
  draft,
  view: viewProp,
  onView,
  fit,
  onSelect,
  onRooms,
  onDraftPoint,
  onCloseDraft,
  onDeleteRoom,
  onTool,
  trace,
  traceSelected,
  onTrace,
  onSelectTrace,
  fill = false,
  activeFloorId = 'floor-0',
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { width = 0, height = 0 } = useResizeObserver({
    ref: svgRef as unknown as React.RefObject<HTMLElement>,
    box: 'border-box',
  })
  const [hover, setHover] = useState<Point | null>(null)
  const drag = useRef<Drag | null>(null)
  // Shift held, to draw and place to the centimeter instead of on the grid.
  // Kept from the last pointer or key event, so an autopan keeps it too.
  const fine = useRef(false)
  const grid = () => (fine.current ? EDITOR_FINE_GRID_M : EDITOR_GRID_M)
  // The same for the point drawn under the pointer, which is drawn from it.
  const [fineShown, setFineShown] = useState(false)
  useEffect(() => {
    // Caught on the way down, since the editor's dialog stops keys from
    // going any further up.
    const track = (e: KeyboardEvent) => {
      if (e.key !== 'Shift') return
      fine.current = e.type === 'keydown'
      setFineShown(fine.current)
    }
    window.addEventListener('keydown', track, true)
    window.addEventListener('keyup', track, true)
    return () => {
      window.removeEventListener('keydown', track, true)
      window.removeEventListener('keyup', track, true)
    }
  }, [])
  // Where on the canvas the last press landed, to tell a click from a drag.
  const pressed = useRef<Point | null>(null)
  // Where clicking down through a pile reached the room, on the plan.
  const roomCycle = useRef<Point | null>(null)
  // Rooms at their last valid positions during a drag. The dragged room
  // itself is shown following the pointer, red when that spot is invalid,
  // and lands on this resolved position when released. Kept in a ref since
  // pointer moves can arrive faster than React re-renders.
  const liveRooms = useRef<RoomConfig[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const liveDecorations = useRef<DecorationConfig[] | null>(null)
  const [draggingDecoration, setDraggingDecoration] = useState<string | null>(null)
  // The item a dragged one would come to rest on, highlighted while it is
  // over it.
  const [hoverSupport, setHoverSupport] = useState<string | null>(null)
  const [panning, setPanning] = useState(false)
  // The room a drag just copied, so an overlapping release can be resolved
  // to a free spot instead of landing on top of the original.
  const duplicatedRoom = useRef<string | null>(null)
  // While a copy is being dragged out, the room it came from does not block
  // it, so the drag follows the pointer instead of sticking to the original.
  const duplicateSource = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ at: ContextMenuPosition; target: Menu } | null>(null)

  // The view only changes on pan, zoom, fit or auto-pan. It is fitted when
  // unset, and again when the canvas changes shape while the view is still
  // exactly where it was fitted, so opening the 3D pane or dragging the
  // divider does not leave the plan half out of frame. Once the viewer has
  // panned or zoomed, the view is theirs and is left alone.
  const view = viewProp ?? (width && height ? fit(width, height) : null)
  const lastFit = useRef<{ size: string; view: View } | null>(null)
  useEffect(() => {
    if (!width || !height) return
    const size = `${width}x${height}`
    if (!viewProp || (lastFit.current?.view === viewProp && lastFit.current.size !== size)) {
      const fitted = fit(width, height)
      lastFit.current = { size, view: fitted }
      onView(fitted)
    }
  }, [viewProp, width, height, fit, onView])

  // Latest values for the auto-pan loop and the document wide draft
  // listener, which both run outside React renders.
  const latest = useRef<{
    view: View | null
    rooms: RoomConfig[]
    decorations: DecorationConfig[]
    draft: Point[]
    tool: Tool
    updateAutopan: (screen: Point) => void
  }>({ view, rooms, decorations, draft, tool, updateAutopan: () => {} })
  const lastScreen = useRef<Point | null>(null)
  const autopan = useRef<{ raf: number; time: number; vx: number; vy: number } | null>(null)

  // React registers wheel listeners as passive, so preventDefault needs a native one.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (!view) return
      onView(zoomAt(view, Math.exp(-e.deltaY * 0.0015), [e.clientX - rect.left, e.clientY - rect.top]))
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [onView, view])

  // Dragging the handle swings the item around its own center.
  const onRotateDown = (e: React.PointerEvent, item: DecorationConfig) => {
    if (e.button !== 0) return
    e.stopPropagation()
    capture(e)
    onSelectDecoration(item.id)
    liveDecorations.current = decorations
    drag.current = { kind: 'rotate', id: item.id, center: item.position }
  }

  const onDecorationDown = (e: React.PointerEvent, item: DecorationConfig) => {
    if (e.button === 2) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    capture(e)
    // The picture under the plan is the last stop of the way down through a
    // pile: once clicking the same spot has reached the room, the next click
    // picks the picture, and the one after starts again from the top.
    const from = roomCycle.current
    roomCycle.current = null
    const p = planPoint(e)
    if (
      from &&
      trace &&
      view &&
      !e.altKey &&
      selection.roomId &&
      traceCovers(trace, p) &&
      Math.hypot(p[0] - from[0], p[1] - from[1]) * view.scale < CLICK_PX
    ) {
      pickTrace()
      return
    }
    // Alt or Option drags a copy out and leaves the original behind, the way
    // every drawing program does it.
    let dragged = item
    if (e.altKey) {
      dragged = { ...item, id: newDecorationId(item.kind) }
      const next = [...decorations, dragged]
      liveDecorations.current = next
      onDecorations(next, false)
    } else liveDecorations.current = decorations
    // Whether this one was already picked, since clicking it again is what
    // steps down to whatever is under it.
    const already = selectedDecoration === dragged.id
    // One thing at a time is selected: picking a piece lets go of the room.
    // The room it is in only lifts a little while it is being dragged.
    onSelect({ roomId: null, vertex: null })
    onSelectDecoration(dragged.id)
    drag.current = { kind: 'decoration', id: dragged.id, start: planPoint(e), origin: item.position, already }
    setDraggingDecoration(dragged.id)
  }

  const applyDrag = (screen: Point, v: View, renderedRooms: RoomConfig[]) => {
    const p = toPlan(v, screen)
    const d = drag.current
    if (!d) return
    if (d.kind === 'trace' || d.kind === 'trace-size') {
      if (!trace) return
      if (d.kind === 'trace')
        onTrace({ ...trace, center: [d.origin[0] + p[0] - d.start[0], d.origin[1] + p[1] - d.start[1]] })
      else {
        const reach = Math.hypot(p[0] - trace.center[0], p[1] - trace.center[1])
        onTrace({ ...trace, width: Math.max(TRACE_LEAST_WIDTH_M, (d.width * reach) / d.reach) })
      }
      return
    }
    const currentRooms = liveRooms.current ?? renderedRooms
    // A move that would overlap another room or fold the polygon is ignored,
    // so the room stays where it last was valid. Candidates are tried in
    // order, which lets a blocked move still slide along the free axis.
    // The first candidate is where the pointer puts the room and is what gets
    // shown. The resolved position is the first valid candidate, or the
    // furthest valid point on the way to one, so a blocked room still slides
    // along the free axis and lands right against its neighbour on release.
    const patch = (roomId: string, candidates: Point[][]) => {
      const roomTarget = currentRooms.find(r => r.id === roomId)
      const targetFloorId = roomTarget?.floor_id ?? 'floor-0'
      const others = currentRooms
        .filter(r => r.id !== roomId && r.id !== duplicateSource.current && (r.floor_id ?? 'floor-0') === targetFloorId)
        .map(r => r.points)
      const from = roomTarget!.points
      let resolved: Point[] = from
      for (const target of candidates) {
        if (isValidRoom(target, others)) {
          resolved = target
          break
        }
        const reached = furthestValid(from, target, others)
        if (reached) {
          resolved = reached
          break
        }
      }
      liveRooms.current = currentRooms.map(r => (r.id === roomId ? { ...r, points: resolved } : r))
      onRooms(
        currentRooms.map(r => (r.id === roomId ? { ...r, points: candidates[0] } : r)),
        false,
      )
    }
    // Full move first, then the axis with the larger displacement, then the other.
    const axisOrder = (dx: number, dy: number): Point[] =>
      Math.abs(dx) >= Math.abs(dy)
        ? [
            [dx, dy],
            [dx, 0],
            [0, dy],
          ]
        : [
            [dx, dy],
            [0, dy],
            [dx, 0],
          ]
    switch (d.kind) {
      case 'pan': {
        onView({ ...d.view, tx: d.view.tx + screen[0] - d.start[0], ty: d.view.ty + screen[1] - d.start[1] })
        break
      }
      case 'vertex': {
        const room = currentRooms.find(r => r.id === d.roomId)!
        const current = room.points[d.index]
        const snapped = snap(p, v, currentRooms, { roomId: d.roomId, index: d.index }, [], grid())
        patch(
          d.roomId,
          axisOrder(snapped[0] - current[0], snapped[1] - current[1]).map(([dx, dy]) =>
            room.points.map((q, i) => (i === d.index ? ([current[0] + dx, current[1] + dy] as Point) : q)),
          ),
        )
        break
      }
      case 'edge': {
        // Move both ends of the edge along its normal, so it stays parallel.
        const n = d.origin.length
        const a = d.origin[d.index]
        const b = d.origin[(d.index + 1) % n]
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const nx = -(b[1] - a[1]) / len
        const ny = (b[0] - a[0]) / len
        const t = (p[0] - d.start[0]) * nx + (p[1] - d.start[1]) * ny
        const others = currentRooms.filter(r => r.id !== d.roomId)
        const moved: Point = [a[0] + nx * t, a[1] + ny * t]
        const snapped = snap(moved, v, others, undefined, [], grid())
        const ts = (snapped[0] - a[0]) * nx + (snapped[1] - a[1]) * ny
        patch(d.roomId, [
          d.origin.map((q, i) =>
            i === d.index || i === (d.index + 1) % n ? ([q[0] + nx * ts, q[1] + ny * ts] as Point) : q,
          ),
        ])
        break
      }
      case 'room': {
        const others = currentRooms.filter(r => r.id !== d.roomId)
        const current = currentRooms.find(r => r.id === d.roomId)!.points
        const dx = p[0] - d.start[0]
        const dy = p[1] - d.start[1]
        // Snap the moved first corner, then apply the same offset to the rest.
        const first: Point = [d.origin[0][0] + dx, d.origin[0][1] + dy]
        const snapped = snap(first, v, others, undefined, [], grid())
        const ox = snapped[0] - d.origin[0][0]
        const oy = snapped[1] - d.origin[0][1]
        // Where the room is right now, as an offset from where the drag began.
        const cx = current[0][0] - d.origin[0][0]
        const cy = current[0][1] - d.origin[0][1]
        const move = ([ax, ay]: Point) => d.origin.map(([x, y]) => [x + ax, y + ay] as Point)
        const xFirst = Math.abs(ox - cx) >= Math.abs(oy - cy)
        const single: Point[] = xFirst
          ? [
              [ox, cy],
              [cx, oy],
            ]
          : [
              [cx, oy],
              [ox, cy],
            ]
        patch(d.roomId, [move([ox, oy]), ...single.map(move)])
        break
      }
      case 'rotate': {
        const current = liveDecorations.current ?? latest.current.decorations
        // The handle sits at the item's front, which faces plan -y at zero.
        const degrees = (Math.atan2(p[1] - d.center[1], p[0] - d.center[0]) * 180) / Math.PI + 90
        const rotation = (((Math.round(degrees / 5) * 5) % 360) + 360) % 360
        const next = current.map(x => (x.id === d.id ? { ...x, rotation } : x))
        liveDecorations.current = next
        onDecorations(next, false)
        break
      }
      case 'decoration': {
        const current = liveDecorations.current ?? latest.current.decorations
        const item = current.find(x => x.id === d.id)
        if (!item) break
        const kind = decorationKind(item.kind)
        const g = fine.current ? EDITOR_FINE_GRID_M : EDITOR_DEVICE_GRID_M
        const target: Point = [
          Math.round((d.origin[0] + p[0] - d.start[0]) / g) * g,
          Math.round((d.origin[1] + p[1] - d.start[1]) / g) * g,
        ]
        const within = (q: Point, points: Point[]) => pointStrictlyInside(q, points) || pointOnBoundary(q, points)
        // Only allow dropping or binding decorations to rooms on the active floor
        const activeFloorRooms = currentRooms.filter(r => (r.floor_id ?? 'floor-0') === activeFloorId)
        const over = activeFloorRooms.find(r => within(target, r.points))
        const home = activeFloorRooms.find(r => r.id === item.room) ?? activeFloorRooms[0]
        const roomFor = over ?? home
        let landing: DecorationConfig = { ...item, position: target, room: roomFor?.id ?? item.room }
        if (kind?.id === 'stairs') {
          // Stairs connect rooms or levels across voids and must not be clamped to room boundaries.
          landing = { ...item, position: target, room: roomFor?.id ?? item.room }
        } else if (kind?.mount === 'wall' && roomFor) {
          // Wall items sit on the nearest wall of the room and face inward.
          const snapped = snapToWall(target, roomFor.points)
          landing = { ...landing, position: snapped.point, rotation: snapped.rotation }
        } else if (!over && home) {
          const from = item.position
          let lo = 0
          let hi = 1
          for (let i = 0; i < 16; i++) {
            const mid = (lo + hi) / 2
            const q: Point = [from[0] + (target[0] - from[0]) * mid, from[1] + (target[1] - from[1]) * mid]
            if (within(q, home.points)) lo = mid
            else hi = mid
          }
          // Held at the wall, on the grid when that is still inside.
          const edge: Point = [from[0] + (target[0] - from[0]) * lo, from[1] + (target[1] - from[1]) * lo]
          const onGrid: Point = [Math.round(edge[0] / g) * g, Math.round(edge[1] / g) * g]
          const held = within(onGrid, home.points) ? onGrid : edge
          landing = {
            ...item,
            position: [Math.round(held[0] * 100) / 100, Math.round(held[1] * 100) / 100],
          }
        }
        // What it comes to rest on: the highest top under it, or the floor.
        // A piece put on the floor from its panel stays there, so it can be
        // slid under a table without climbing onto it.
        if (kind && canRide(kind) && !(item.floor && !item.on)) {
          const support = supportUnder(landing.position, { ...item, room: landing.room }, current)
          if (support) {
            const { floor: _floor, ...rest } = landing
            landing = { ...rest, on: support.id, room: support.room }
          } else if (landing.on) {
            const { on: _dropped, ...rest } = landing
            landing = rest
          }
          setHoverSupport(support?.id ?? null)
        }
        // Whatever stands on this item travels with it.
        const riders = new Set(ridersOf(d.id, current).map(r => r.id))
        const dx = landing.position[0] - item.position[0]
        const dy = landing.position[1] - item.position[1]
        const carry = (x: DecorationConfig): DecorationConfig =>
          riders.has(x.id)
            ? {
                ...x,
                position: [round(x.position[0] + dx), round(x.position[1] + dy)] as Point,
                room: landing.room,
              }
            : x
        liveDecorations.current = current.map(x => (x.id === d.id ? landing : carry(x)))
        const shown =
          kind?.mount === 'wall' ? landing : { ...landing, position: target, room: over?.id ?? landing.room }
        onDecorations(
          current.map(x => (x.id === d.id ? shown : carry(x))),
          false,
        )
        break
      }
    }
  }

  // Pans the view while a drag or a draft nears the canvas border. It only
  // ever pushes outward, it never zooms and never comes back on its own.
  const stopAutopan = () => {
    if (autopan.current) cancelAnimationFrame(autopan.current.raf)
    autopan.current = null
  }
  // The pan must not run on after the canvas has gone.
  useEffect(
    () => () => {
      if (autopan.current) cancelAnimationFrame(autopan.current.raf)
      autopan.current = null
    },
    [],
  )

  const autopanTick = (time: number) => {
    const state = autopan.current
    const { view: v, rooms: currentRooms, draft: currentDraft, tool: currentTool } = latest.current
    const screen = lastScreen.current
    if (!state || !v || !screen) return
    const dt = state.time ? Math.min((time - state.time) / 1000, 0.05) : 0
    state.time = time
    const next = { ...v, tx: v.tx - state.vx * dt, ty: v.ty - state.vy * dt }
    onView(next)
    const d = drag.current
    if (d && d.kind !== 'pan') applyDrag(screen, next, currentRooms)
    else if (currentTool === 'draw' && currentDraft.length > 0) setHover(toPlan(next, screen))
    state.raf = requestAnimationFrame(autopanTick)
  }

  const updateAutopan = (screen: Point) => {
    const d = drag.current
    const active = (d && d.kind !== 'pan') || (tool === 'draw' && draft.length > 0)
    const m = EDITOR_AUTOPAN_MARGIN_PX
    const speed = (depth: number) => (Math.min(Math.max(depth, 0), m) / m) * EDITOR_AUTOPAN_SPEED_PX_S
    const vx = speed(m - screen[0]) * -1 + speed(screen[0] - (width - m))
    const vy = speed(m - screen[1]) * -1 + speed(screen[1] - (height - m))
    if (!active || (vx === 0 && vy === 0)) {
      stopAutopan()
      return
    }
    if (autopan.current) {
      autopan.current.vx = vx
      autopan.current.vy = vy
      return
    }
    autopan.current = { raf: requestAnimationFrame(autopanTick), time: 0, vx, vy }
  }

  useEffect(() => {
    latest.current = { view, rooms, decorations, draft, tool, updateAutopan }
  })

  // A drag captures the pointer, so moves outside the canvas still arrive.
  // Drawing does not, so while a draft is open the pointer is followed
  // document wide, and the preview and auto-pan keep working past the border.
  const drafting = tool === 'draw' && draft.length > 0
  useEffect(() => {
    if (!drafting) return
    const svg = svgRef.current
    if (!svg) return
    const onMove = (e: PointerEvent) => {
      if (e.composedPath().includes(svg)) return
      const rect = svg.getBoundingClientRect()
      const screen: Point = [e.clientX - rect.left, e.clientY - rect.top]
      lastScreen.current = screen
      const v = latest.current.view
      if (v) setHover(toPlan(v, screen))
      latest.current.updateAutopan(screen)
    }
    document.addEventListener('pointermove', onMove, true)
    return () => document.removeEventListener('pointermove', onMove, true)
  }, [drafting])

  const sizing = fill ? 'h-full w-full' : 'w-full'
  const style = fill ? undefined : { height: EDITOR_CANVAS_HEIGHT_PX }

  if (!view) return <svg ref={svgRef} className={cn(sizing, 'rounded-2xl')} style={style} />

  const screenPoint = (e: React.PointerEvent | React.MouseEvent): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }
  const planPoint = (e: React.PointerEvent | React.MouseEvent) => toPlan(view, screenPoint(e))

  const activeRooms = rooms.filter(r => (r.floor_id ?? 'floor-0') === activeFloorId)
  const ghostRooms = rooms.filter(r => (r.floor_id ?? 'floor-0') !== activeFloorId)
  const selectedRoom = activeRooms.find(r => r.id === selection.roomId)
  const roomPolygons = activeRooms.map(r => r.points)

  // A new corner may not land inside a room, and the segment from the last
  // corner may not run through one.
  const draftPointValid = (p: Point) => {
    if (roomPolygons.some(o => pointStrictlyInside(p, o))) return false
    if (draft.length === 0) return true
    return !segmentEntersAny(draft[draft.length - 1], p, roomPolygons)
  }
  const draftClosable = draft.length >= 3 && isValidRoom(draft, roomPolygons)

  const updateRoom = (roomId: string, points: Point[], done: boolean) =>
    onRooms(
      rooms.map(r => (r.id === roomId ? { ...r, points } : r)),
      done,
    )

  const capture = (e: React.PointerEvent) => {
    svgRef.current!.setPointerCapture(e.pointerId)
    svgRef.current!.focus()
    pressed.current = screenPoint(e)
  }

  // One thing at a time is selected: picking the picture lets go of the rest.
  const pickTrace = () => {
    onSelect({ roomId: null, vertex: null })
    onSelectDecoration(null)
    onSelectTrace(true)
  }

  // Dragging a corner of the selected picture sizes it around its middle.
  const onTraceCornerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !trace) return
    e.stopPropagation()
    capture(e)
    const p = planPoint(e)
    const reach = Math.hypot(p[0] - trace.center[0], p[1] - trace.center[1])
    drag.current = { kind: 'trace-size', reach: Math.max(reach, 1e-6), width: trace.width }
  }

  const onBackgroundDown = (e: React.PointerEvent) => {
    // A press that reaches the background found nothing drawn over the
    // picture there, so on the selected picture it moves it.
    if (tool === 'select' && e.button === 0 && trace && traceSelected) {
      const p = planPoint(e)
      if (traceCovers(trace, p)) {
        drag.current = { kind: 'trace', start: p, origin: trace.center }
        return
      }
    }
    if (e.button === 1 || tool === 'select') {
      drag.current = { kind: 'pan', start: screenPoint(e), view }
      setPanning(true)
      if (tool === 'select' && e.button === 0) {
        onSelect({ roomId: null, vertex: null })
        onSelectDecoration(null)
        onSelectTrace(false)
      }
      return
    }
    if (tool === 'draw') {
      const p = planPoint(e)
      if (draft.length >= 3) {
        const [fx, fy] = toScreen(view, draft[0])
        const [sx, sy] = screenPoint(e)
        // Check distance to the starting handle (or if snapped point equals starting point)
        const hitStart = Math.hypot(fx - sx, fy - sy) < Math.max(HANDLE * 3.5, 24) || (p[0] === draft[0][0] && p[1] === draft[0][1])
        if (hitStart) {
          if (draftClosable) onCloseDraft()
          return
        }
      }
      const next = snap(p, view, rooms, undefined, draft, grid())
      if (draftPointValid(next)) onDraftPoint(next)
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    fine.current = e.shiftKey
    // A right button press must not capture the pointer, or the context
    // menu event that follows is redirected to the canvas.
    if (e.button === 2) return
    capture(e)
    onBackgroundDown(e)
  }

  const onRoomDown = (e: React.PointerEvent, room: RoomConfig) => {
    if (e.button === 2) {
      e.stopPropagation()
      return
    }
    if (tool !== 'select' || e.button !== 0) return
    e.stopPropagation()
    capture(e)
    roomCycle.current = null
    // Whether this room was already picked, since clicking it again is what
    // steps down to the picture under it.
    const already = selection.roomId === room.id && !selectedDecoration && !e.altKey
    // Bare floor picks the room itself, and lets go of whatever item was
    // selected: one thing at a time is selected on the plan.
    onSelectDecoration(null)
    onSelect({ roomId: room.id, vertex: null })
    // Alt or Option drags out a copy of the room, shape, floor and all.
    if (e.altKey) {
      const { id, name } = newRoomName()
      const { area_id: _dropped, ...rest } = room
      const copy: RoomConfig = { ...rest, id, name, points: room.points.map(p => [...p] as Point) }
      const next = [...rooms, copy]
      liveRooms.current = next
      duplicatedRoom.current = id
      duplicateSource.current = room.id
      onRooms(next, false)
      onSelect({ roomId: id, vertex: null })
      drag.current = { kind: 'room', roomId: id, start: planPoint(e), origin: copy.points, already }
      setDraggingId(id)
      return
    }
    liveRooms.current = rooms
    drag.current = { kind: 'room', roomId: room.id, start: planPoint(e), origin: room.points, already }
    setDraggingId(room.id)
  }

  const onVertexDown = (e: React.PointerEvent, room: RoomConfig, index: number) => {
    if (e.button === 2) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    capture(e)
    onSelect({ roomId: room.id, vertex: index })
    liveRooms.current = rooms
    drag.current = { kind: 'vertex', roomId: room.id, index }
    setDraggingId(room.id)
  }

  const onEdgeDown = (e: React.PointerEvent, room: RoomConfig, index: number) => {
    if (e.button === 2) {
      e.stopPropagation()
      return
    }
    if (e.button !== 0) return
    e.stopPropagation()
    capture(e)
    onSelect({ roomId: room.id, vertex: null })
    liveRooms.current = rooms
    drag.current = { kind: 'edge', roomId: room.id, index, start: planPoint(e), origin: room.points }
    setDraggingId(room.id)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    fine.current = e.shiftKey
    setFineShown(e.shiftKey)
    const screen = screenPoint(e)
    lastScreen.current = screen
    setHover(toPlan(view, screen))
    applyDrag(screen, view, rooms)
    updateAutopan(screen)
  }

  // Everything whose footprint covers a point on the plan, in the order they
  // are drawn, so the last one is the one on top. A press that does not turn
  // into a drag steps down through them, since something underneath cannot
  // be reached any other way.
  const stackAt = (point: Point): DecorationConfig[] => {
    const covers = (item: DecorationConfig) => {
      const kind = decorationKind(item.kind)
      if (!kind) return false
      const [fw, fd] = footprint(kind, item.params, item.variant)
      const least = EDITOR_DEVICE_RADIUS_PX / view.scale
      const halfW = Math.max(fw / 2, least)
      const halfD = Math.max(kind.mount === 'wall' ? 0.05 : fd / 2, least)
      const a = (-(item.rotation ?? 0) * Math.PI) / 180
      const dx = point[0] - item.position[0]
      const dy = point[1] - item.position[1]
      const lx = dx * Math.cos(a) - dy * Math.sin(a)
      const ly = dx * Math.sin(a) + dy * Math.cos(a)
      return Math.abs(lx) <= halfW && Math.abs(ly) <= halfD
    }
    const activeFloorRooms = latest.current.rooms.filter(r => (r.floor_id ?? 'floor-0') === activeFloorId)
    const activeFloorRoomIds = new Set(activeFloorRooms.map(r => r.id))
    const all = latest.current.decorations.filter(d => activeFloorRoomIds.has(d.room))
    // Highest first, so clicking again keeps going down through the pile.
    return all.filter(covers).sort((x, y) => standHeight(y, all) - standHeight(x, all))
  }

  const roomAt = (point: Point) =>
    latest.current.rooms.find(
      r => (r.floor_id ?? 'floor-0') === activeFloorId && (pointStrictlyInside(point, r.points) || pointOnBoundary(point, r.points)),
    ) ?? null

  // What the next click on the same spot should pick: the item under the one
  // already picked, then the room they all stand in, then round again.
  const stepDown = (point: Point): { decoration: string } | { room: RoomConfig | null } | null => {
    const stack = stackAt(point)
    if (stack.length === 0) return null
    const at = stack.findIndex(x => x.id === selectedDecoration)
    if (at < 0) return { decoration: stack[0].id }
    return at + 1 < stack.length ? { decoration: stack[at + 1].id } : { room: roomAt(point) }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    const resolved = liveRooms.current
    const resolvedDecorations = liveDecorations.current
    drag.current = null
    liveRooms.current = null
    liveDecorations.current = null
    setDraggingId(null)
    setDraggingDecoration(null)
    setHoverSupport(null)
    setPanning(false)
    stopAutopan()
    svgRef.current?.releasePointerCapture(e.pointerId)
    if (!d) return
    const [ux, uy] = screenPoint(e)
    const still = !!pressed.current && Math.hypot(ux - pressed.current[0], uy - pressed.current[1]) < CLICK_PX
    if (d.kind === 'pan') {
      // A click on the picture with nothing drawn over it there picks it.
      if (still && tool === 'select' && e.button === 0 && trace && traceCovers(trace, toPlan(view, d.start)))
        pickTrace()
      return
    }
    if (d.kind === 'trace' || d.kind === 'trace-size') return
    // A click on the room already picked steps down to the picture under it.
    if (d.kind === 'room' && d.already && still && trace && traceCovers(trace, d.start)) pickTrace()
    if (d.kind === 'rotate' || d.kind === 'decoration') {
      const source = resolvedDecorations ?? decorations
      onDecorations(
        source.map(x => ({ ...x, position: [round(x.position[0]), round(x.position[1])] as Point })),
        true,
      )
      // A press that moved nothing was a click, so it picks what is under
      // the one already picked instead of picking the same thing again.
      if (d.kind === 'decoration') {
        const landed = source.find(x => x.id === d.id)
        const still = landed && landed.position[0] === d.origin[0] && landed.position[1] === d.origin[1]
        // A click on something already picked goes deeper. A first click
        // just picks it.
        if (still && d.already) {
          const next = stepDown(d.start)
          if (next && 'decoration' in next) {
            if (next.decoration !== d.id) onSelectDecoration(next.decoration)
          } else if (next) {
            onSelectDecoration(null)
            onSelect({ roomId: next.room?.id ?? null, vertex: null })
            roomCycle.current = next.room ? d.start : null
          }
        }
      }
      return
    }
    // Land on the resolved position, whatever the pointer showed.
    const source = resolved ?? rooms
    let landed = source.map(r => ({ ...r, points: r.points.map(([x, y]) => [round(x), round(y)] as Point) }))
    // A copy released while it still overlaps goes to the nearest free spot,
    // and is dropped only when the plan has no room for it at all.
    const copied = duplicatedRoom.current
    duplicatedRoom.current = null
    duplicateSource.current = null
    if (copied) {
      const copy = landed.find(r => r.id === copied)
      const targetFloorId = copy?.floor_id ?? 'floor-0'
      const others = landed
        .filter(r => r.id !== copied && (r.floor_id ?? 'floor-0') === targetFloorId)
        .map(r => r.points)
      if (copy && !isValidRoom(copy.points, others)) {
        const placed = freePlacement(copy.points, others)
        landed = placed
          ? landed.map(r =>
              r.id === copied ? { ...r, points: placed.map(([x, y]) => [round(x), round(y)] as Point) } : r,
            )
          : landed.filter(r => r.id !== copied)
      }
    }
    onRooms(landed, true)
  }

  const openMenu = (e: React.MouseEvent, target: Menu) => {
    e.preventDefault()
    e.stopPropagation()
    if (target.kind === 'room') onSelect({ roomId: target.roomId, vertex: null })
    if (target.kind === 'vertex') onSelect({ roomId: target.roomId, vertex: target.index })
    if (target.kind === 'decoration') {
      onSelect({ roomId: null, vertex: null })
      onSelectDecoration(target.id)
    }
    setMenu({ at: { x: e.clientX, y: e.clientY }, target })
  }

  const closeMenu = () => setMenu(null)

  const canDeleteVertex = (roomId: string, index: number) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room || room.points.length <= 3) return false
    const targetFloorId = room.floor_id ?? 'floor-0'
    const others = rooms
      .filter(r => r.id !== roomId && (r.floor_id ?? 'floor-0') === targetFloorId)
      .map(r => r.points)
    return isValidRoom(
      room.points.filter((_, i) => i !== index),
      others,
    )
  }

  const deleteVertex = (roomId: string, index: number) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room || !canDeleteVertex(roomId, index)) return
    updateRoom(
      roomId,
      room.points.filter((_, i) => i !== index),
      true,
    )
    onSelect({ roomId, vertex: null })
  }

  const insertVertex = (roomId: string, index: number, point: Point) => {
    const room = rooms.find(r => r.id === roomId)
    if (!room) return
    const p = snap(point, view, rooms, undefined, [], grid()).map(round) as Point
    updateRoom(roomId, [...room.points.slice(0, index + 1), p, ...room.points.slice(index + 1)], true)
    onSelect({ roomId, vertex: index + 1 })
  }

  const cursor = tool === 'draw' ? 'crosshair' : panning ? 'grabbing' : 'default'
  const hoverSnapped =
    tool === 'draw' && hover
      ? snap(hover, view, rooms, undefined, draft, fineShown ? EDITOR_FINE_GRID_M : EDITOR_GRID_M)
      : null
  const polygon = (points: Point[]) => points.map(p => toScreen(view, p).join(',')).join(' ')

  const edgeCursor = (a: Point, b: Point) => {
    const angle = Math.abs(Math.atan2(b[1] - a[1], b[0] - a[0]))
    const horizontal = angle < Math.PI / 8 || angle > (7 * Math.PI) / 8
    const vertical = Math.abs(angle - Math.PI / 2) < Math.PI / 8
    return horizontal ? 'ns-resize' : vertical ? 'ew-resize' : 'move'
  }

  const menuItems = () => {
    if (!menu) return null
    const t = menu.target
    switch (t.kind) {
      case 'vertex': {
        return (
          <ContextMenuItem
            variant="destructive"
            disabled={!canDeleteVertex(t.roomId, t.index)}
            onSelect={() => {
              deleteVertex(t.roomId, t.index)
              closeMenu()
            }}
            shortcut="Del"
          >
            Delete corner
          </ContextMenuItem>
        )
      }
      case 'edge':
        return (
          <ContextMenuItem
            onSelect={() => {
              insertVertex(t.roomId, t.index, t.point)
              closeMenu()
            }}
          >
            Add corner here
          </ContextMenuItem>
        )
      case 'room': {
        const room = rooms.find(r => r.id === t.roomId)
        return (
          <>
            <ContextMenuItem
              onSelect={() => {
                onDuplicateRoom(t.roomId)
                closeMenu()
              }}
              shortcut={shortcut('D', true)}
            >
              Duplicate room
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                onView(null)
                closeMenu()
              }}
              shortcut="F"
            >
              Fit view
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                closeMenu()
                if (room && window.confirm(`Delete ${room.name ?? room.id}?`)) onDeleteRoom(t.roomId)
              }}
              shortcut="Del"
            >
              Delete room
            </ContextMenuItem>
          </>
        )
      }
      case 'decoration': {
        const label = decorationKind(decorations.find(d => d.id === t.id)?.kind ?? '')?.label ?? 'item'
        return (
          <>
            <ContextMenuItem
              onSelect={() => {
                onDuplicateDecoration(t.id)
                closeMenu()
              }}
              shortcut={shortcut('D', true)}
            >
              Duplicate
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                onCopyDecoration(t.id)
                closeMenu()
              }}
              shortcut={shortcut('C', true)}
            >
              Copy
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canPaste}
              onSelect={() => {
                onPasteDecoration()
                closeMenu()
              }}
              shortcut={shortcut('V', true)}
            >
              Paste
            </ContextMenuItem>
            <ContextMenuItem
              onSelect={() => {
                onRotateDecoration(t.id)
                closeMenu()
              }}
              shortcut="R"
            >
              Rotate 90°
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              onSelect={() => {
                onRemoveDecoration(t.id)
                closeMenu()
              }}
              shortcut="Del"
            >
              Delete {label}
            </ContextMenuItem>
          </>
        )
      }
      case 'canvas':
        return (
          <>
            <ContextMenuItem
              onSelect={() => {
                onTool('draw')
                closeMenu()
              }}
              shortcut="D"
            >
              Draw room
            </ContextMenuItem>
            <ContextMenuSeparator />
            {
              <>
                <ContextMenuItem
                  disabled={!canPaste}
                  onSelect={() => {
                    onPasteDecoration()
                    closeMenu()
                  }}
                  shortcut={shortcut('V', true)}
                >
                  Paste
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            }
            <ContextMenuItem
              onSelect={() => {
                onView(null)
                closeMenu()
              }}
              shortcut="F"
            >
              Fit view
            </ContextMenuItem>
          </>
        )
    }
  }

  return (
    <>
      <svg
        ref={svgRef}
        tabIndex={-1}
        className={cn(
          sizing,
          'ring-separator touch-none rounded-2xl bg-(--secondary-background-color) ring-1 outline-none select-none',
        )}
        style={{ ...style, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          if (drafting) return
          setHover(null)
          stopAutopan()
        }}
        onDoubleClick={() => tool === 'draw' && draftClosable && onCloseDraft()}
        onContextMenu={e => openMenu(e, { kind: 'canvas' })}
      >
        <defs>
          {/* The soft shadow the markers and handles float on. */}
          <filter id="dio-lift" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.35" />
          </filter>
        </defs>
        <Grid view={view} width={width} height={height} />
        {trace && <TraceImage trace={trace} view={view} />}

        {/* Ghost rooms from other floors as onion skin reference */}
        {ghostRooms.map(room => (
          <polygon
            key={'ghost-' + room.id}
            points={polygon(room.points)}
            fill="var(--primary-text-color)"
            fillOpacity={0.02}
            stroke="var(--secondary-text-color)"
            strokeOpacity={0.25}
            strokeWidth={1}
            strokeDasharray="4 4"
            strokeLinejoin="round"
            className="pointer-events-none"
          />
        ))}

        {activeRooms.map(room => {
          // While an item is dragged, the room under the pointer lifts a
          // little. Enough to see which one it would land in, no more.
          const dropTarget =
            draggingDecoration !== null && decorations.find(x => x.id === draggingDecoration)?.room === room.id
          const picked = selection.roomId === room.id
          const invalid =
            draggingId === room.id &&
            !isValidRoom(
              room.points,
              activeRooms.filter(r => r.id !== room.id).map(r => r.points),
            )
          return (
            <polygon
              key={room.id}
              points={polygon(room.points)}
              // Every room the same light gray, told apart by its outline,
              // so the pieces on it are what carries the color.
              fill={invalid ? 'var(--error-color)' : picked ? EDITOR_SELECTED_COLOR : 'var(--primary-text-color)'}
              fillOpacity={invalid ? 0.3 : picked ? 0.08 : dropTarget ? 0.12 : 0.06}
              stroke={
                invalid
                  ? 'var(--error-color)'
                  : dropTarget
                    ? EDITOR_BOUND_COLOR
                    : picked
                      ? EDITOR_SELECTED_COLOR
                      : 'var(--primary-text-color)'
              }
              strokeOpacity={dropTarget || picked || invalid ? 1 : 0.4}
              strokeWidth={dropTarget || picked ? 2 : 1.5}
              strokeLinejoin="round"
              className={tool === 'select' ? 'cursor-pointer' : 'pointer-events-none'}
              onPointerDown={e => onRoomDown(e, room)}
              onContextMenu={e => openMenu(e, { kind: 'room', roomId: room.id })}
            />
          )
        })}

        {[...decorations]
          .sort((a, b) => {
            // Whatever is selected goes last: on top, and first to take a
            // press when two items sit over each other.
            if (a.id === selectedDecoration) return 1
            if (b.id === selectedDecoration) return -1
            return standHeight(a, decorations) - standHeight(b, decorations)
          })
          .map(item => {
            const room = rooms.find(r => r.id === item.room)
            const kind = decorationKind(item.kind)
            if (!room || !kind) return null
            const isCurrentFloor = (room.floor_id ?? 'floor-0') === activeFloorId
            // Only show decorations belonging to rooms on the active floor
            if (!isCurrentFloor) return null
            const [sx, sy] = toScreen(view, item.position)
            const bound = devices.some(d => d.decorations?.includes(item.id))
            const isStairs = item.kind === 'stairs'
            const invalid =
              !isStairs &&
              draggingDecoration === item.id &&
              !(pointStrictlyInside(item.position, room.points) || pointOnBoundary(item.position, room.points))
            const isSelected = selectedDecoration === item.id
            const target = hoverSupport === item.id
            // What is selected turns blue, so it reads apart from the rest.
            // An item a device stands behind wears amber, so what is wired up
            // reads at a glance. The rest are in the text's own color.
            const color = invalid
              ? 'var(--error-color)'
              : isSelected
                ? EDITOR_SELECTED_COLOR
                : bound
                  ? EDITOR_BOUND_COLOR
                  : 'var(--primary-text-color)'
            const plain = !invalid && !isSelected && !bound
            const angle = -(item.rotation ?? 0)
            const [fw, fd] = footprint(kind, item.params, item.variant)
            const r = EDITOR_DEVICE_RADIUS_PX
            // The footprint at its true size, at every zoom. It used to be
            // kept at least as big as the icon on it, so zoomed out far enough
            // that a piece was smaller on screen than its icon, its box
            // stopped shrinking while the room around it kept going, and
            // pieces suddenly read too big for the plan. The icon keeps its
            // size so it stays legible, and picking keeps its own minimum.
            const halfW = (fw / 2) * view.scale
            const halfD = (fd / 2) * view.scale
            // Zero rotation faces plan -y, so the handle starts below the item.
            const handleAngle = ((item.rotation ?? 0) - 90) * (Math.PI / 180)
            // Clear of the icon as well as the box, since a small piece's box
            // can now sit inside its icon.
            const handleDist = Math.max(halfW, halfD, r) + 22
            return (
              <g
                key={item.id}
                className="cursor-move"
                onPointerDown={e => onDecorationDown(e, item)}
                onContextMenu={e => openMenu(e, { kind: 'decoration', id: item.id })}
              >
                {/* The item's real footprint, rotated with it. Wall items read as
                  a bar on the wall, ceiling items as a dashed outline. */}
                <rect
                  x={sx - halfW}
                  y={sy - (kind.mount === 'wall' ? 3 : halfD)}
                  width={halfW * 2}
                  height={kind.mount === 'wall' ? 6 : halfD * 2}
                  rx={kind.mount === 'wall' ? 3 : Math.min(5, Math.min(halfW, halfD) * 0.3)}
                  transform={`rotate(${angle} ${sx} ${sy})`}
                  fill={color}
                  fillOpacity={kind.mount === 'wall' ? (plain ? 0.55 : 0.85) : isSelected ? 0.2 : plain ? 0.06 : 0.12}
                  stroke={color}
                  strokeOpacity={kind.mount === 'wall' ? 0 : isSelected ? 0.9 : plain ? 0.35 : 0.55}
                  strokeWidth={1}
                  strokeDasharray={kind.mount === 'ceiling' ? '3 3' : undefined}
                />
                {/* The usable part of a top, lit up while something is over it. */}
                {target && isSupport(kind) && (
                  <rect
                    x={sx - halfW + 4}
                    y={sy - halfD + 4}
                    width={Math.max(halfW * 2 - 8, 4)}
                    height={Math.max(halfD * 2 - 8, 4)}
                    rx={6}
                    transform={`rotate(${angle} ${sx} ${sy})`}
                    fill={color}
                    fillOpacity={0.25}
                    stroke={color}
                    strokeWidth={1.5}
                  />
                )}
                {isSelected && (
                  <>
                    {/* Rotation handle on the item's front, with a stem. */}
                    <line
                      x1={sx}
                      y1={sy}
                      x2={sx + Math.cos(handleAngle) * handleDist}
                      y2={sy - Math.sin(handleAngle) * handleDist}
                      stroke={color}
                      strokeWidth={1}
                      strokeOpacity={0.7}
                      className="pointer-events-none"
                    />
                    <circle
                      cx={sx + Math.cos(handleAngle) * handleDist}
                      cy={sy - Math.sin(handleAngle) * handleDist}
                      r={7}
                      fill="#fff"
                      stroke={color}
                      strokeWidth={2}
                      filter="url(#dio-lift)"
                      className="cursor-grab"
                      onPointerDown={e => onRotateDown(e, item)}
                    />
                  </>
                )}
                {/* A disc in the item's color: solid once selected, a soft
                  tint of it over the card otherwise, with the icon in it. */}
                <circle cx={sx} cy={sy} r={r} fill="var(--card-background-color)" filter="url(#dio-lift)" />
                <circle cx={sx} cy={sy} r={r} fill={color} fillOpacity={isSelected ? 1 : plain ? 0.14 : 0.2} />
                <IconGlyph
                  icon={decorationIcon(item.kind, kind.family)}
                  x={sx}
                  y={sy}
                  size={r * 0.85}
                  fill={isSelected ? '#fff' : color}
                />
              </g>
            )
          })}

        {tool === 'draw' && draft.length > 0 && (
          <>
            <polyline
              points={polygon(hoverSnapped ? [...draft, hoverSnapped] : draft)}
              fill="none"
              stroke={hoverSnapped && !draftPointValid(hoverSnapped) ? 'var(--error-color)' : EDITOR_SELECTED_COLOR}
              strokeWidth={2}
              strokeDasharray="6 4"
              className="pointer-events-none"
            />
            {draft.map((p, i) => {
              const [sx, sy] = toScreen(view, p)
              return (
                <circle
                  key={i}
                  cx={sx}
                  cy={sy}
                  r={i === 0 ? HANDLE : HANDLE * 0.6}
                  fill={i === 0 ? EDITOR_SELECTED_COLOR : 'var(--card-background-color)'}
                  stroke={EDITOR_SELECTED_COLOR}
                  strokeWidth={2}
                  className="pointer-events-none"
                />
              )
            })}
          </>
        )}

        {/* The selected room's corners and edges are drawn after the
            furniture, not before it. SVG hands a press to whatever is painted
            on top, so a piece standing over a corner used to take it, and a
            corner under a sofa could not be grabbed at all. With the room
            selected, reshaping it is what is being done. */}
        {selectedRoom && !selectedDecoration && tool === 'select' && (
          <>
            {selectedRoom.points.map((p, i) => {
              const q = selectedRoom.points[(i + 1) % selectedRoom.points.length]
              const [ax, ay] = toScreen(view, p)
              const [bx, by] = toScreen(view, q)
              return (
                <line
                  key={`e${i}`}
                  x1={ax}
                  y1={ay}
                  x2={bx}
                  y2={by}
                  stroke="transparent"
                  strokeWidth={EDGE_HIT_PX}
                  style={{ cursor: edgeCursor(p, q) }}
                  onPointerDown={e => onEdgeDown(e, selectedRoom, i)}
                  onContextMenu={e =>
                    openMenu(e, { kind: 'edge', roomId: selectedRoom.id, index: i, point: planPoint(e) })
                  }
                />
              )
            })}
            {showLengths &&
              selectedRoom.points.map((p, i) => {
                const q = selectedRoom.points[(i + 1) % selectedRoom.points.length]
                const length = Math.hypot(q[0] - p[0], q[1] - p[1])
                const [mx, my] = toScreen(view, [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2])
                const label = `${length.toFixed(2)} m`
                const w = label.length * 7 + 12
                return (
                  <g key={`l${i}`} className="pointer-events-none">
                    <rect
                      x={mx - w / 2}
                      y={my - 10}
                      width={w}
                      height={20}
                      rx={10}
                      fill="var(--card-background-color)"
                      filter="url(#dio-lift)"
                    />
                    <text
                      x={mx}
                      y={my + 4}
                      textAnchor="middle"
                      className="font-system fill-(--primary-text-color) text-[11px] font-semibold tabular-nums"
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
            {selectedRoom.points.map((p, i) => {
              const [sx, sy] = toScreen(view, p)
              return (
                <circle
                  key={`v${i}`}
                  cx={sx}
                  cy={sy}
                  r={HANDLE}
                  fill={selection.vertex === i ? EDITOR_SELECTED_COLOR : '#fff'}
                  stroke={EDITOR_SELECTED_COLOR}
                  strokeWidth={2}
                  filter="url(#dio-lift)"
                  className="cursor-move"
                  onPointerDown={e => onVertexDown(e, selectedRoom, i)}
                  onContextMenu={e => openMenu(e, { kind: 'vertex', roomId: selectedRoom.id, index: i })}
                />
              )
            })}
          </>
        )}

        {trace && traceSelected && <TraceFrame trace={trace} view={view} onCornerDown={onTraceCornerDown} />}
        <ScaleBar view={view} height={height} />
      </svg>

      <ContextMenu position={menu?.at ?? null} onClose={closeMenu}>
        {menuItems()}
      </ContextMenu>
    </>
  )
}

function Grid({ view, width, height }: { view: View; width: number; height: number }) {
  const [minX, maxY] = toPlan(view, [0, 0])
  const [maxX, minY] = toPlan(view, [width, height])
  const step = view.scale >= 30 ? EDITOR_GRID_M : view.scale >= 6 ? 1 : 5
  const lines: React.ReactNode[] = []
  for (let x = Math.floor(minX / step) * step; x <= maxX; x += step) {
    const major = Math.abs(x - Math.round(x)) < 1e-6
    const [sx] = toScreen(view, [x, 0])
    lines.push(
      <line
        key={`x${x}`}
        x1={sx}
        y1={0}
        x2={sx}
        y2={height}
        stroke="currentColor"
        strokeOpacity={major ? 0.07 : 0.03}
      />,
    )
  }
  for (let y = Math.floor(minY / step) * step; y <= maxY; y += step) {
    const major = Math.abs(y - Math.round(y)) < 1e-6
    const [, sy] = toScreen(view, [0, y])
    lines.push(
      <line
        key={`y${y}`}
        x1={0}
        y1={sy}
        x2={width}
        y2={sy}
        stroke="currentColor"
        strokeOpacity={major ? 0.07 : 0.03}
      />,
    )
  }
  // Faint, so the rooms on it are what the eye goes to.
  return <g className="pointer-events-none text-(--primary-text-color)">{lines}</g>
}

function ScaleBar({ view, height }: { view: View; height: number }) {
  // Pick a round length that stays between about 60 and 300 pixels.
  const meters = [0.5, 1, 2, 5, 10, 20, 50].find(m => m * view.scale >= 60) ?? 100
  const px = meters * view.scale
  // A pill in the corner, with the ruler and its length side by side.
  const label = `${meters} m`
  const pad = 10
  const w = pad + px + 8 + label.length * 6.5 + pad
  const h = 24
  const x = 12
  const y = height - 12 - h
  const mid = y + h / 2
  return (
    <g className="pointer-events-none text-(--primary-text-color)">
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={h / 2}
        fill="var(--card-background-color)"
        fillOpacity={0.85}
        filter="url(#dio-lift)"
      />
      <line
        x1={x + pad}
        y1={mid}
        x2={x + pad + px}
        y2={mid}
        stroke="currentColor"
        strokeOpacity={0.7}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <text
        x={x + pad + px + 8}
        y={mid + 4}
        className="font-system fill-current text-[11px] font-semibold tabular-nums"
        fillOpacity={0.85}
      >
        {label}
      </text>
    </g>
  )
}

// Draws a Font Awesome icon centered at a point, as a plain path so it can
// live inside the canvas svg.
function IconGlyph({
  icon,
  x,
  y,
  size,
  fill,
}: {
  icon: IconDefinition
  x: number
  y: number
  size: number
  fill: string
}) {
  const [w, h, , , path] = icon.icon
  const d = Array.isArray(path) ? path.join(' ') : path
  const scale = size / Math.max(w, h)
  return (
    <path
      d={d}
      fill={fill}
      className="pointer-events-none"
      transform={`translate(${x - (w * scale) / 2} ${y - (h * scale) / 2}) scale(${scale})`}
    />
  )
}
