import {
  CAMERA_FIT_MARGIN,
  CAMERA_FLIGHT_S,
  CAMERA_NARROW_PX,
  CAMERA_ROOM_FIT_MARGIN,
  CAMERA_SPILL,
  CAMERA_TURN_S,
} from '#/constants.ts'
import { passageFootprint, passagesOf } from '#/geometry/passages.ts'
import { held } from '#/scene/drags.ts'
import { flights } from '#/scene/flights.ts'
import { fitView, frameRooms, sceneHeight } from '#/scene/framing.ts'
import { multiTouchSince, sent } from '#/scene/touches.ts'
import type { CameraView, DecorationConfig, RoomConfig } from '#/types.ts'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type RefObject } from 'react'
import { MathUtils, Spherical, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js'

// What the outside can ask of the camera: where it is now, as a view that
// can be saved, to travel to a saved view, and to go back to the view it
// opened with. It also says where it would stand to look at one room alone,
// which is the view of a room that has none saved, and where it stands to
// show a room in this card, its saved view fitted to the card's shape.
export type CameraHandle = {
  view: () => CameraView
  frame: (room?: RoomConfig) => CameraView
  show: (room: RoomConfig) => CameraView
  flyTo: (view: CameraView) => void
  reset: () => void
}

type Props = {
  rooms: RoomConfig[]
  decorations: DecorationConfig[]
  // Whether the wheel zooms. In a card on a dashboard that scrolls it
  // scrolls the page instead.
  wheelZoom?: boolean
  // The angle to open with, closer in when the whole plan fits. Without one
  // the camera frames the plan from the standard side.
  view?: CameraView
  // The rooms the view of the whole home frames, as room ids. Every room
  // when empty or none of them is there.
  framed?: string[]
  // The room the card has flown to, which the camera keeps fitted to the
  // card as it changes shape until the viewer moves it.
  focus?: string | null
  handle?: RefObject<CameraHandle | null>
  // Told when the camera leaves the view it opened with, and when it is
  // back there.
  onAway?: (away: boolean) => void
}

// How far the pointer has to come, in pixels, before a press is a drag.
const DRAG_SLOP_PX = 6
// How far two fingers have to spread or slide before they are read as a
// pinch or a drag.
const PAIR_SLOP_PX = 12
// How fast a finger turns the camera, against a mouse at 1.
const TOUCH_ROTATE_SPEED = 0.5
// How far the mouse drags with the wheel pressed to halve or double the
// camera's distance. The controls would step the zoom by a fixed part on
// every move event, whatever the distance dragged, which is quick or wild
// depending on the mouse, so the drag is measured here instead.
const MOUSE_ZOOM_HALVE_PX = 400

// Scratch for the flight, so no frame allocates.
const A = new Vector3()
const B = new Vector3()
const C = new Vector3()
const D = new Vector3()
const S = new Spherical()

// Where the camera stands around what it looks at: how far, how high up
// and which way round. A flight moves each on its own, so a view from the
// other side of the home is reached by going round it, at the height the
// camera is at, rather than straight across, which passed over the top.
type Stance = { radius: number; phi: number; theta: number }

const stance = (view: CameraView): Stance => {
  S.setFromVector3(A.set(...view.position).sub(B.set(...view.target)))
  return { radius: S.radius, phi: S.phi, theta: S.theta }
}

// A flight under way: where from, where to, the stance at each end, how far
// round to turn, how long it takes and how far along it is, 0 to 1. A flight
// home lands the camera back on the view it opened with.
type Flight = {
  from: CameraView
  to: CameraView
  a: Stance
  b: Stance
  around: number
  duration: number
  t: number
  // When the flight last moved, in milliseconds. Frames are drawn only when
  // asked for, so the frame that starts a flight may come seconds after the
  // one before it, and the time between the two is not time flown: counted
  // as such, the camera jumped most of the way and only flew the rest.
  last: number
  home: boolean
}

// The most a single frame may carry a flight forward, in seconds. A stall
// mid flight picks up where it was rather than skipping ahead.
const MAX_STEP_S = 0.1

// The shortest way round from one heading to another, in radians.
const turn = (from: number, to: number) => MathUtils.euclideanModulo(to - from + Math.PI, 2 * Math.PI) - Math.PI

const round = (v: number) => Math.round(v * 100) / 100
const triple = (v: Vector3): [number, number, number] => [round(v.x), round(v.y), round(v.z)]

// Puts the camera at its view on mount and whenever the plan or the viewport
// change. No animation. Once the viewer has orbited, panned or zoomed, the
// camera is theirs and is never moved again, so editing the plan does not
// throw the view away. A flight to a saved view is the one exception, and
// the camera is the viewer's again the moment it lands.
export default function CameraRig({
  rooms,
  decorations,
  view,
  framed,
  focus,
  handle,
  onAway,
  wheelZoom = false,
}: Props) {
  const camera = useThree(state => state.camera)
  const size = useThree(state => state.size)
  const controls = useThree(state => state.controls) as OrbitControlsImpl | null
  const invalidate = useThree(state => state.invalidate)
  // Where the scene hears its pointer events: the element around the
  // canvas that three fiber listens on.
  const canvas = useThree(state => (state.events.connected as HTMLElement | undefined) ?? state.gl.domElement)
  const moved = useRef(false)
  // Whether the camera stands where it was last sent, untouched since.
  const resting = useRef(true)
  const flight = useRef<Flight | null>(null)
  // The fade around a focused room reads how long the flight there takes.
  useLayoutEffect(() => {
    flights.set(camera, flight)
  }, [camera])
  // Whether the camera has left the view it opened with. Only a change is
  // reported, and to whatever was passed last.
  const away = useRef(false)
  const latestAway = useRef(onAway)
  useLayoutEffect(() => {
    latestAway.current = onAway
  })
  const setAway = (value: boolean) => {
    if (away.current === value) return
    away.current = value
    latestAway.current?.(value)
  }

  const place = useCallback(
    (position: Vector3, target: Vector3) => {
      camera.position.copy(position)
      camera.lookAt(target)
      camera.updateProjectionMatrix()
      if (controls) {
        controls.target.copy(target)
        controls.update()
      }
    },
    [camera, controls],
  )

  // The target is what the controls orbit around. Without controls the
  // camera looks a fixed way, and a point ahead of it stands in.
  const current = (): CameraView => {
    const target = controls ? controls.target : camera.getWorldDirection(new Vector3()).add(camera.position)
    return { position: triple(camera.position), target: triple(target) }
  }

  // A saved view, or none, fitted to the card's shape around these rooms:
  // kept when they all show in it, and otherwise backed off along its angle
  // until they do. Either way the angle then frames them closely, so they
  // fill the card. With no view they are framed from the standard side.
  // A narrow card, as on a phone, has the home and a room spill a little
  // past its sides so they fill it. A wider one frames them right to its
  // edges, whole.
  const narrow = size.width < CAMERA_NARROW_PX
  const spill = narrow ? CAMERA_SPILL : 1
  const homeMargin = narrow ? CAMERA_FIT_MARGIN : 1

  const fit = (
    saved: CameraView | undefined,
    shown: RoomConfig[],
    items: DecorationConfig[],
    margin = homeMargin,
    whole: RoomConfig[] = [],
  ): CameraView => {
    const aspect = size.width / size.height
    const height = sceneHeight(items)
    const { position, target } = saved
      ? fitView(saved, shown, aspect, height, margin, true, spill, whole)
      : frameRooms(shown, aspect, height, undefined, margin, true, spill, whole)
    return { position: triple(position), target: triple(target) }
  }

  // What the view of the whole home frames: the chosen rooms and what is
  // in them, or all of it.
  const chosen = rooms.filter(room => framed?.includes(room.id))
  const homeRooms = chosen.length > 0 ? chosen : rooms
  const homeItems =
    chosen.length > 0 ? decorations.filter(item => chosen.some(room => room.id === item.room)) : decorations

  // The view the camera opened with.
  const home = () => fit(view, homeRooms, homeItems)

  // One room alone, filling the picture, looked at from the same side and
  // height as the opening view, so flying there only closes in.
  // With no room, the whole plan from the standard side, which is the view
  // the card opens with when none is saved.
  const frame = (room?: RoomConfig, signs: RoomConfig[] = []): CameraView => {
    if (!room) {
      const whole = frameRooms(
        homeRooms,
        size.width / size.height,
        sceneHeight(homeItems),
        undefined,
        homeMargin,
        true,
        spill,
      )
      return { position: triple(whole.position), target: triple(whole.target) }
    }
    const opening = home()
    const from = A.set(...opening.position).sub(B.set(...opening.target))
    const height = sceneHeight(decorations.filter(d => d.room === room.id))
    const { position, target } = frameRooms(
      [room],
      size.width / size.height,
      height,
      [from.x, from.y, from.z],
      CAMERA_ROOM_FIT_MARGIN,
      true,
      spill,
      signs,
    )
    return { position: triple(position), target: triple(target) }
  }

  // A room as the card shows it, worked out in full before the camera sets
  // off so the flight goes straight there: its saved view fitted to this
  // card the way the opening view is, or without one, the room framed from
  // the opening view's side.
  // The signs on the floor that lead out of it into the rooms beside it are
  // kept wholly in the picture too, never past its sides.
  const show = (room: RoomConfig): CameraView => {
    const signs = passagesOf(room, rooms, decorations).map((passage): RoomConfig => ({
      id: '',
      points: passageFootprint(passage),
    }))
    return room.camera
      ? fit(
          room.camera,
          [room],
          decorations.filter(d => d.room === room.id),
          CAMERA_ROOM_FIT_MARGIN,
          signs,
        )
      : frame(room, signs)
  }

  // A flight that turns further round the home takes longer, so it moves
  // no faster than a short one.
  const plan = (to: CameraView, isHome: boolean): Flight => {
    const from = current()
    const a = stance(from)
    const b = stance(to)
    const around = turn(a.theta, b.theta)
    return {
      from,
      to,
      a,
      b,
      around,
      duration: CAMERA_FLIGHT_S + (CAMERA_TURN_S * Math.abs(around)) / Math.PI,
      t: 0,
      last: performance.now(),
      home: isHome,
    }
  }

  useImperativeHandle(handle, () => ({
    view: current,
    frame,
    show,
    flyTo: to => {
      moved.current = true
      resting.current = true
      setAway(true)
      // Any input during a flight, an orbit or a wheel, takes it over.
      flight.current = plan(to, false)
      invalidate()
    },
    reset: () => {
      resting.current = true
      flight.current = plan(home(), true)
      invalidate()
    },
  }))

  useFrame(() => {
    const f = flight.current
    if (!f) return
    const now = performance.now()
    const step = Math.min(MAX_STEP_S, (now - f.last) / 1000)
    f.last = now
    f.t = Math.min(1, f.t + step / f.duration)
    // Eases out of the start and into the landing.
    const k = f.t * f.t * (3 - 2 * f.t)
    const target = C.set(...f.from.target).lerp(D.set(...f.to.target), k)
    S.radius = MathUtils.lerp(f.a.radius, f.b.radius, k)
    S.phi = MathUtils.lerp(f.a.phi, f.b.phi, k)
    S.theta = f.a.theta + f.around * k
    const position = A.setFromSpherical(S).add(target)
    place(position, target)
    if (f.t < 1) {
      invalidate()
      return
    }
    flight.current = null
    // Landed home, the camera frames the plan again as if never touched.
    if (f.home) {
      moved.current = false
      setAway(false)
    }
  })

  // OrbitControls only fires start on real input, never on our own update.
  useEffect(() => {
    if (!controls) return
    const onStart = () => {
      moved.current = true
      resting.current = false
      flight.current = null
      setAway(true)
    }
    controls.addEventListener('start', onStart)
    return () => controls.removeEventListener('start', onStart)
  }, [controls])

  // A click is not a drag. The controls take any press as the start of a
  // turn, so a click on a lamp nudged the camera a hair, and that counted
  // as leaving the opening view. The controls listen on an element around
  // the one the scene hears on, so a press reaches them only by bubbling,
  // and here it is stopped before it does, once the scene has had it. It is
  // held until the pointer has come a few pixels from where it went down,
  // and handed to the controls from there, as a press at that spot, so the
  // turn starts under the pointer with no jump. A press let go before that
  // never reaches them.
  //
  // Two fingers are held together until they have shown what they are
  // doing. Fingers moving apart or together are a pinch, and only zoom.
  // Fingers moving the same way are a drag, and only pan. The controls would
  // do both at once from any two fingers, and a pan always carried a bit of
  // zoom with it. If the first finger was already turning the camera, it is
  // taken back from the controls first, so the pair starts clean. The two
  // are then handed over as presses where they are now, so nothing jumps.
  //
  // A finger covers more of a small screen than a mouse does of a big one,
  // so a finger turns the camera at half the pace.
  useEffect(() => {
    if (!controls) return
    const element = controls.domElement as HTMLElement | null
    if (!element || element === canvas) return
    const page = element.ownerDocument
    const mouseRotateSpeed = controls.rotateSpeed
    const zoomable = controls.enableZoom
    const pannable = controls.enablePan
    // Every pointer that went down on the canvas and is still down: the
    // press as it came, where it started and where it is now.
    type Press = { event: PointerEvent; id: number; sx: number; sy: number; x: number; y: number }
    const presses = new Map<number, Press>()
    // The pointers the controls have been handed and not yet given back.
    const given = new Set<number>()
    // The middle button drags zooming here, by the pixel, and their last y.
    const zooms = new Map<number, number>()
    // Two fingers held until their gesture is read: where they started.
    let pair: { a: Press; b: Press; distance: number; cx: number; cy: number } | null = null
    // Whether the controls are held to one of zoom or pan for a gesture.
    let exclusive = false
    // When the pointers last started from none down, for the clicks after.
    let pressAt = 0

    const touches = () => [...presses.values()].filter(p => p.event.pointerType === 'touch')
    const hand = (press: Press) => {
      given.add(press.id)
      controls.rotateSpeed = press.event.pointerType === 'touch' ? TOUCH_ROTATE_SPEED : mouseRotateSpeed
      const { event } = press
      // The controls read where a pointer is on the page, scroll included,
      // and an event made here only knows the scroll when it is given the
      // window. Without it, on a dashboard scrolled down, this press sat
      // above every move that followed by the distance scrolled, and the
      // gesture opened with a leap: a zoom, a pan or a tilt.
      const down = new PointerEvent('pointerdown', {
        view: page.defaultView,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        buttons: event.buttons,
        clientX: press.x,
        clientY: press.y,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      })
      sent.add(down)
      element.dispatchEvent(down)
    }
    // Tells the controls a pointer they were handed came up, the way the
    // browser would. They listen for it on the document once a pointer is
    // down.
    const takeBack = (press: Press) => {
      given.delete(press.id)
      const up = new PointerEvent('pointerup', {
        view: page.defaultView,
        pointerId: press.id,
        pointerType: press.event.pointerType,
        clientX: press.x,
        clientY: press.y,
        bubbles: true,
      })
      sent.add(up)
      page.dispatchEvent(up)
    }
    const free = () => {
      if (!exclusive) return
      exclusive = false
      controls.enableZoom = zoomable
      controls.enablePan = pannable
    }
    const forget = (id: number) => {
      zooms.delete(id)
      const press = presses.get(id)
      presses.delete(id)
      given.delete(id)
      if (press && pair && (pair.a === press || pair.b === press)) {
        // The pair broke before it was read. The finger left is a press of
        // its own from where it is now.
        const other = pair.a === press ? pair.b : pair.a
        other.sx = other.x
        other.sy = other.y
        pair = null
      }
      if (touches().length < 2) free()
    }
    const drop = () => {
      presses.clear()
      given.clear()
      pair = null
      free()
    }
    const onDown = (event: PointerEvent) => {
      if (sent.has(event)) return
      event.stopPropagation()
      if (presses.size === 0) pressAt = performance.now()
      const press: Press = {
        event,
        id: event.pointerId,
        sx: event.clientX,
        sy: event.clientY,
        x: event.clientX,
        y: event.clientY,
      }
      const before = event.pointerType === 'touch' ? touches() : []
      presses.set(press.id, press)
      if (before.length !== 1) return
      // A second finger. Whatever the first was doing, the two are read
      // together from here.
      const first = before[0]
      if (given.has(first.id)) takeBack(first)
      pair = {
        a: first,
        b: press,
        distance: Math.hypot(press.x - first.x, press.y - first.y),
        cx: (first.x + press.x) / 2,
        cy: (first.y + press.y) / 2,
      }
    }
    const onMove = (event: PointerEvent) => {
      if (sent.has(event)) return
      const press = presses.get(event.pointerId)
      if (!press) return
      press.x = event.clientX
      press.y = event.clientY
      if (pair) {
        if (press !== pair.a && press !== pair.b) return
        const { a, b } = pair
        const spread = Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - pair.distance)
        const slide = Math.hypot((a.x + b.x) / 2 - pair.cx, (a.y + b.y) / 2 - pair.cy)
        if (Math.max(spread, slide) < PAIR_SLOP_PX) return
        pair = null
        exclusive = true
        controls.enableZoom = spread >= slide
        controls.enablePan = spread < slide
        hand(a)
        hand(b)
        return
      }
      if (given.has(press.id)) return
      // A piece is dragging it, or deciding whether to.
      if (held.has(press.id)) return
      // A move with nothing held is a release that was never heard.
      if (event.pointerType !== 'touch' && event.buttons === 0) return forget(press.id)
      const last = zooms.get(press.id)
      if (last !== undefined) {
        const dy = event.clientY - last
        zooms.set(press.id, event.clientY)
        const scale = Math.pow(0.5, Math.abs(dy) / MOUSE_ZOOM_HALVE_PX)
        if (dy > 0) controls.dollyOut(scale)
        else if (dy < 0) controls.dollyIn(scale)
        return
      }
      if (Math.hypot(press.x - press.sx, press.y - press.sy) < DRAG_SLOP_PX) return
      // Dragging with the wheel pressed zooms, and the controls step that by
      // a fixed part on every move event, so it is done here by the pixel.
      if (press.event.pointerType === 'mouse' && press.event.button === 1) {
        zooms.set(press.id, event.clientY)
        // The camera is the viewer's from here, as any orbit makes it.
        controls.dispatchEvent({ type: 'start' })
        return
      }
      hand(press)
    }
    const onUp = (event: PointerEvent) => {
      if (!sent.has(event)) forget(event.pointerId)
    }
    // A pinch ends with one finger lifting last, and some browsers make a
    // click of that. Nothing was clicked: not a piece, not a room's floor,
    // and not the air around the home, which would take the camera back.
    const onClick = (event: MouseEvent) => {
      if (multiTouchSince(pressAt)) event.stopPropagation()
    }
    canvas.addEventListener('pointerdown', onDown)
    element.addEventListener('click', onClick, { capture: true })
    page.addEventListener('pointermove', onMove, { capture: true })
    page.addEventListener('pointerup', onUp, { capture: true })
    page.addEventListener('pointercancel', onUp, { capture: true })
    page.defaultView?.addEventListener('blur', drop)
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      element.removeEventListener('click', onClick, { capture: true })
      page.removeEventListener('pointermove', onMove, { capture: true })
      page.removeEventListener('pointerup', onUp, { capture: true })
      page.removeEventListener('pointercancel', onUp, { capture: true })
      page.defaultView?.removeEventListener('blur', drop)
      drop()
    }
  }, [controls, canvas])

  // Unless the view has nothing to scroll, the wheel scrolls the page, as
  // it does everywhere else on a dashboard.
  // The controls would zoom on it, which caught anyone scrolling past the
  // card, so the event is stopped before it reaches them and left to the
  // browser. Zoom by mouse is the middle button dragged.
  useEffect(() => {
    if (!controls || wheelZoom) return
    const element = controls.domElement as HTMLElement | null
    if (!element) return
    const onWheel = (event: WheelEvent) => event.stopImmediatePropagation()
    element.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => element.removeEventListener('wheel', onWheel, { capture: true })
  }, [controls, wheelZoom])

  // A right or middle drag let go outside the window never hears its button
  // come up in some browsers, and the pan or zoom it started would carry on
  // with no button held. So such a drag ends the moment the pointer leaves
  // the window, or the window loses focus, or a move comes in with no
  // button down, each as the release would have. A left drag is left
  // alone, so a turn can run out past the edge and come back.
  useEffect(() => {
    if (!controls) return
    const element = controls.domElement as HTMLElement | null
    if (!element) return
    const page = element.ownerDocument
    const view = page.defaultView
    // The mouse buttons the controls were told went down and have not yet
    // been told came up. The controls keep their own list, but out of reach,
    // so this one is kept alongside from the same events.
    const held = new Map<number, { x: number; y: number }>()
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') held.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    const onUp = (event: PointerEvent) => held.delete(event.pointerId)
    // Tells the controls the button came up, the way the browser would have.
    // They listen for it on the document once a button is down.
    const release = (pointerId: number, at: { x: number; y: number }) => {
      held.delete(pointerId)
      const up = new PointerEvent('pointerup', {
        view,
        pointerId,
        pointerType: 'mouse',
        clientX: at.x,
        clientY: at.y,
        bubbles: true,
      })
      sent.add(up)
      page.dispatchEvent(up)
    }
    const outside = (event: PointerEvent) =>
      !!view &&
      (event.clientX <= 0 ||
        event.clientY <= 0 ||
        event.clientX >= view.innerWidth ||
        event.clientY >= view.innerHeight)
    const at = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY })
    const onMove = (event: PointerEvent) => {
      if (!held.has(event.pointerId)) return
      // The left button is bit one; anything else held is a pan or zoom.
      if (event.buttons === 0 || ((event.buttons & ~1) !== 0 && outside(event))) release(event.pointerId, at(event))
      else held.set(event.pointerId, at(event))
    }
    const onLeave = (event: PointerEvent) => {
      if (held.has(event.pointerId) && (event.buttons & ~1) !== 0) release(event.pointerId, at(event))
    }
    const onBlur = () => {
      for (const [id, last] of [...held]) release(id, last)
    }
    // The controls follow a drag on the whole document, and once the pointer
    // comes back it may be over anything, so the checks listen there too and
    // run ahead of them.
    // Only the presses that reach the controls count, so this listens where
    // they do, and not ahead of them.
    element.addEventListener('pointerdown', onDown)
    page.addEventListener('pointerup', onUp, { capture: true })
    page.addEventListener('pointermove', onMove, { capture: true })
    page.addEventListener('pointerleave', onLeave, { capture: true })
    page.addEventListener('pointercancel', onLeave, { capture: true })
    view?.addEventListener('blur', onBlur)
    return () => {
      element.removeEventListener('pointerdown', onDown)
      page.removeEventListener('pointerup', onUp, { capture: true })
      page.removeEventListener('pointermove', onMove, { capture: true })
      page.removeEventListener('pointerleave', onLeave, { capture: true })
      page.removeEventListener('pointercancel', onLeave, { capture: true })
      view?.removeEventListener('blur', onBlur)
    }
  }, [controls])

  // The camera follows the card's shape: the opening view while untouched,
  // and the room flown to while it rests there. A flight under way is sent
  // on to where its end now is, so it still lands in one move.
  const room = focus ? rooms.find(r => r.id === focus) : undefined
  useLayoutEffect(() => {
    // A canvas that has not been laid out yet has no shape to frame for.
    if (size.width <= 0 || size.height <= 0) return
    const f = flight.current
    if (f) {
      const to = f.home ? home() : room ? show(room) : null
      if (!to) return
      f.to = to
      f.b = stance(to)
      f.around = turn(f.a.theta, f.b.theta)
      invalidate()
      return
    }
    if (room) {
      if (!resting.current) return
      const { position, target } = show(room)
      place(C.set(...position), D.set(...target))
      // A card that opens on a room, as one built again does, is away from
      // the opening view from the start.
      moved.current = true
      setAway(true)
      return
    }
    if (moved.current) return
    const { position, target } = home()
    place(C.set(...position), D.set(...target))
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, decorations, view, framed, room, size.width, size.height, place])

  return null
}
