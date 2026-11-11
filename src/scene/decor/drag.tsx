import { decorationVariant, paramValue, screenSize, type DecorationKind } from '#/decoration/catalog.ts'
import { useUnechoed } from '#/lib/echo.ts'
import { awningHead } from '#/scene/decor/Awnings.tsx'
import { claim, LONG_PRESS_MS } from '#/lib/longPress.ts'
import { dropped, held } from '#/scene/drags.ts'
import { multiTouchSince } from '#/scene/touches.ts'
import type { DecorationConfig } from '#/types.ts'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Mesh, MeshStandardMaterial, Vector3, type Group, type Material } from 'three'

type Vec3 = [number, number, number]

// Where the edge of a cover that moves is when it is shut and when it is
// open, in the piece's own frame, and how far that edge reaches either way
// from its middle. A finger that drags the edge moves the cover with it.
export type Travel = { shut: Vec3; open: Vec3; span: Vec3 }

// What a drag on a piece does: whether one may start now, and what to do
// with the level it was let go at.
export type DragAction = { may: () => boolean; drop: (level: number) => void }

// Only the covers that run along a line, which a finger can follow. A door
// or a window swings, and a drag on one turns the camera as before.
export function travelOf(kind: DecorationKind, item: DecorationConfig): Travel | null {
  const p = (id: string) => paramValue(kind, item.params, id, item.variant)
  const style = decorationVariant(kind, item.variant)?.id ?? ''
  switch (kind.id) {
    case 'blind': {
      // The bottom rail, under the shutter's box or the blind's head rail.
      const top = style === 'shutter' ? 0.13 : 0.06
      const z = style === 'shutter' ? 0.1 : 0.08
      return { shut: [0, -top - p('drop'), z], open: [0, -top, z], span: [p('width') / 2, 0, 0] }
    }
    case 'projector_screen': {
      // The weighted bar along the bottom of the sheet.
      const [w, h] = screenSize(p('inches'))
      return { shut: [0, -0.09, 0.04], open: [0, -0.09 - h, 0.04], span: [w / 2, 0, 0] }
    }
    case 'garage_door':
      return { shut: [0, 0, 0.12], open: [0, p('height'), 0.12], span: [p('width') / 2, 0, 0] }
    case 'driveway_gate': {
      // The front end of a sliding gate, which runs the width of the
      // opening. A swing gate swings, like a door.
      if (style !== 'sliding') return null
      const side = p('flip') > 0.5 ? -1 : 1
      const w = p('width')
      const h = p('height')
      return { shut: [(-side * w) / 2, h / 2, -0.15], open: [(side * w) / 2, h / 2, -0.15], span: [0, h / 2, 0] }
    }
    case 'awning': {
      // The front profile, out along the arms at the awning's pitch.
      const head = style === 'pergola' ? { y: -0.1, z: 0.15, pitch: 0.1 } : awningHead(style)
      const reach = p('drop')
      return {
        shut: [0, head.y, head.z],
        open: [0, head.y - reach * Math.sin(head.pitch), head.z + reach * Math.cos(head.pitch)],
        span: [p('width') / 2, 0, 0],
      }
    }
    case 'sliding_door': {
      // The far edge of the panel that runs the furthest, the one a hand
      // pulls it by.
      const h = p('height')
      const side = p('flip') > 0.5 ? -1 : 1
      const count = Math.max(1, Math.round(p('panels')))
      const run = p('width') - 0.1
      const panelW = run / count
      const steps = count === 1 ? 1 - 0.06 / panelW : count - 1
      const x = (-side * run) / 2
      const z = (count * 0.035 + 0.03) / 2 + 0.02
      return { shut: [x, h / 2, z], open: [x + side * steps * panelW, h / 2, z], span: [0, h / 2, 0] }
    }
    default:
      return null
  }
}

// How far a press moves before it is read as a drag, or as the camera's.
const SLOP_PX = 8
// A cover whose whole travel is shorter than this on screen is too small to
// drag, and a press on it turns the camera.
const MIN_TRAVEL_PX = 24
// How close to either end a drop is taken as that end.
const END = 0.02
// How long a sent level waits for the cover to start moving, and is kept
// once it stops short of it.
const SETTLE_MS = 3000

const clamp = (v: number) => Math.min(Math.max(v, 0), 1)

// A press on a cover that runs along its travel on screen, up and down for a
// blind, moves the cover with it, and letting go sends it there. A press
// that runs across it, or is held still first, is left to the camera and to
// the long press. The piece always shows where the cover really is, and a
// ghost of it shows where the finger is taking it, then where it was sent
// while it travels there.
//
// The frame is the group the piece is drawn in, which the travel is in.
export function useDrag(travel: Travel | null, reported: number, text: string | undefined, action?: DragAction) {
  const frame = useRef<Group>(null)
  const camera = useThree(state => state.camera)
  const gl = useThree(state => state.gl)
  const [dragged, setDragged] = useState<number | null>(null)
  const [sent, setSent] = useState<number | null>(null)
  const moving = text === 'opening' || text === 'closing'
  // Where the cover really is, past the echo of where it was sent.
  const level = useUnechoed(reported, sent, moving, 0.015)
  // Read when a drag starts, so the drag starts where the ghost is, or where
  // the cover is when there is none.
  const latest = useRef(level)
  const arrived = sent !== null && Math.abs(level - sent) < 0.015
  const pending = sent !== null && !arrived ? sent : null
  useLayoutEffect(() => {
    latest.current = pending ?? level
  })
  const end = useRef<(() => void) | null>(null)
  // The pointer being followed. A press is handed to the piece once for each
  // of its parts under it, and only the first starts a drag.
  const following = useRef<number | null>(null)
  useEffect(() => () => end.current?.(), [])

  useEffect(() => {
    if (sent === null || (moving && !arrived)) return
    const timer = setTimeout(() => setSent(null), arrived ? 0 : SETTLE_MS)
    return () => clearTimeout(timer)
  }, [sent, moving, arrived])

  const start = (down: PointerEvent) => {
    const piece = frame.current
    if (!travel || !action || !piece || down.button !== 0) return
    if (end.current && following.current === down.pointerId) return
    if (!action.may()) return
    end.current?.()
    const rect = gl.domElement.getBoundingClientRect()
    const onScreen = (v: Vec3) => {
      const p = piece.localToWorld(new Vector3(...v)).project(camera)
      return [rect.left + ((p.x + 1) / 2) * rect.width, rect.top + ((1 - p.y) / 2) * rect.height]
    }
    const [ax, ay] = onScreen(travel.shut)
    const [bx, by] = onScreen(travel.open)
    const ux = bx - ax
    const uy = by - ay
    const length = Math.hypot(ux, uy)
    if (length < MIN_TRAVEL_PX) return
    const id = down.pointerId
    const sx = down.clientX
    const sy = down.clientY
    const at = performance.now()
    const from = latest.current
    const page = gl.domElement.ownerDocument
    const view = page.defaultView ?? window
    let mine = false
    const levelAt = (x: number, y: number) => {
      const v = clamp(from + ((x - sx) * ux + (y - sy) * uy) / (length * length))
      return v < END ? 0 : v > 1 - END ? 1 : v
    }
    const stop = () => {
      held.delete(id)
      page.removeEventListener('pointermove', onMove, { capture: true })
      page.removeEventListener('pointerup', onUp, { capture: true })
      page.removeEventListener('pointercancel', onUp, { capture: true })
      view.removeEventListener('blur', onBlur)
      if (mine) document.body.style.cursor = ''
      end.current = null
      following.current = null
    }
    const give = () => {
      stop()
      if (mine) setDragged(null)
    }
    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== id) return
      // A second finger makes it a pinch, and the camera's.
      if (multiTouchSince(at)) return give()
      const dx = event.clientX - sx
      const dy = event.clientY - sy
      if (!mine) {
        if (Math.hypot(dx, dy) < SLOP_PX) return
        const along = Math.abs(dx * ux + dy * uy) / length
        const across = Math.abs(dx * uy - dy * ux) / length
        if (along < across || performance.now() - at > LONG_PRESS_MS) return give()
        mine = true
        claim()
        document.body.style.cursor = 'grabbing'
      }
      setDragged(levelAt(event.clientX, event.clientY))
    }
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== id) return
      const was = mine
      give()
      if (!was) return
      dropped()
      if (event.type === 'pointercancel') return
      const to = levelAt(event.clientX, event.clientY)
      setSent(to)
      action.drop(to)
    }
    const onBlur = () => give()
    held.add(id)
    page.addEventListener('pointermove', onMove, { capture: true })
    page.addEventListener('pointerup', onUp, { capture: true })
    page.addEventListener('pointercancel', onUp, { capture: true })
    view.addEventListener('blur', onBlur)
    end.current = give
    following.current = id
  }

  return {
    frame,
    level,
    dragged,
    // Where the cover was sent, until it gets there or stops short.
    sent: dragged === null ? pending : null,
    // Starts following a press, from the piece itself, from a press that
    // landed near it, or from one on the window it hangs over.
    start: travel && action ? start : undefined,
  }
}

const at = (travel: Travel, level: number): Vec3 => [
  travel.shut[0] + (travel.open[0] - travel.shut[0]) * level,
  travel.shut[1] + (travel.open[1] - travel.shut[1]) * level,
  travel.shut[2] + (travel.open[2] - travel.shut[2]) * level,
]

// How see-through the ghost is, and how long it takes to show or go.
const GHOST_OPACITY = 0.28
const FADE_S = 0.25
// One blue for every part, so the ghost reads as where the piece is going
// rather than as a second piece.
const GHOST_COLOR = '#7ad3e6'
// The ghost is a little wider and deeper than the piece and sits a little
// in front of it, so it shows over the piece whichever way the cover goes.
const GHOST_SCALE: Vec3 = [1.02, 1, 1.02]
const GHOST_FORWARD = 0.012

// A see-through blue copy of the piece at the level a finger drags it to, and
// then at the level it was sent to until the cover gets there or stops. It
// fades in when it shows and out when it goes. It takes no presses and casts
// no shadow.
export function DragGhost({ level, children }: { level: number | null; children: (level: number) => ReactNode }) {
  // The last level it showed, kept while it fades out.
  const [last, setLast] = useState<number | null>(null)
  if (level !== null && level !== last) setLast(level)
  const shown = level ?? last
  const group = useRef<Group>(null)
  const opacity = useRef(0)
  // Each part's own material is swapped once for a see-through blue one, so
  // the piece and any other one sharing the material are left as they are.
  const [copies] = useState(() => new Set<Material>())
  useEffect(() => () => copies.forEach(m => m.dispose()), [copies])
  const invalidate = useThree(state => state.invalidate)
  useEffect(() => {
    invalidate()
  }, [level, invalidate])

  useFrame((_, delta) => {
    const ghost = group.current
    if (!ghost) return
    const aim = level !== null ? GHOST_OPACITY : 0
    if (opacity.current !== aim) {
      const step = (GHOST_OPACITY / FADE_S) * Math.min(delta, 0.1)
      const rest = aim - opacity.current
      opacity.current = Math.abs(rest) <= step ? aim : opacity.current + Math.sign(rest) * step
      invalidate()
    }
    ghost.traverse(part => {
      if (!(part instanceof Mesh)) return
      if (!part.userData.ghost) {
        part.raycast = () => {}
        part.castShadow = false
        part.receiveShadow = false
      }
      const see = (m: Material) => {
        if (copies.has(m)) return m
        const copy = new MeshStandardMaterial({
          color: GHOST_COLOR,
          emissive: GHOST_COLOR,
          emissiveIntensity: 0.35,
          roughness: 0.6,
          side: m.side,
          transparent: true,
          depthWrite: false,
          // Pulled toward the camera in the depth test, so where it lies
          // flat against the piece, like a screen's sheet, it still wins.
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          visible: m.visible,
        })
        copy.userData.opacity = m.opacity
        copies.add(copy)
        return copy
      }
      part.material = Array.isArray(part.material) ? part.material.map(see) : see(part.material)
      part.userData.ghost = true
      for (const m of Array.isArray(part.material) ? part.material : [part.material])
        m.opacity = (m.userData.opacity ?? 1) * opacity.current
    })
    if (level === null && opacity.current === 0) setLast(null)
  })

  if (shown === null) return null
  return (
    <group ref={group} position={[0, 0, GHOST_FORWARD]} scale={GHOST_SCALE}>
      {children(shown)}
    </group>
  )
}

// The level under the finger while it drags, over the ghost.
export function DragBadge({ travel, dragged }: { travel: Travel; dragged: number | null }) {
  if (dragged === null) return null
  return (
    <Html position={at(travel, dragged)} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: 'rgba(0, 0, 0, 0.65)',
          color: '#fff',
          font: '600 12px/1.4 Montserrat, system-ui, sans-serif',
          whiteSpace: 'nowrap',
          userSelect: 'none',
        }}
      >
        {Math.round(dragged * 100)}%
      </div>
    </Html>
  )
}
