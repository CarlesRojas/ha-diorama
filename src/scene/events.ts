import { events as pointerEvents } from '@react-three/fiber'

// Three looks for what is under the pointer on every move, with a ray
// against every piece that takes a press. A mouse sends a move for every
// pixel, faster than frames are drawn, and a finger turning the home sends
// one on every step of the turn, so the card was casting rays all through
// the very moments it most needed its time to draw.
//
// Moves over the card are now looked at once a frame at most, the last one
// standing for those before it. And once a press has moved far enough to be
// a turn of the camera, and that move has been seen, so whatever it was
// pressed on knows it is no longer a press, no further move of it is looked
// at until it is let go. Nothing under a turning camera is hovered anyway.

// A little past how far a press may move and still be a press, so the move
// that tells a piece its press is spent is always seen.
const TURN_PX = 12

type Store = Parameters<typeof pointerEvents>[0]

export function calmEvents(store: Store) {
  const base = pointerEvents(store)
  const move = base.handlers?.onPointerMove as ((e: PointerEvent) => void) | undefined
  const down = base.handlers?.onPointerDown as ((e: PointerEvent) => void) | undefined
  const up = base.handlers?.onPointerUp as ((e: PointerEvent) => void) | undefined
  const cancel = base.handlers?.onPointerCancel as ((e: PointerEvent) => void) | undefined
  if (!move || !down || !up) return base

  // Where each press went down, and whether it has become a turn.
  const presses = new Map<number, { x: number; y: number; turned: boolean }>()
  let waiting: PointerEvent | null = null
  let frame = 0

  const flush = () => {
    frame = 0
    const e = waiting
    waiting = null
    if (e) move(e)
  }

  const onPointerMove = (e: PointerEvent) => {
    const press = presses.get(e.pointerId)
    if (press) {
      if (press.turned) return
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TURN_PX) press.turned = true
      // A press's moves are seen as they come, so it is told at once.
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      waiting = null
      return move(e)
    }
    waiting = e
    if (!frame) frame = requestAnimationFrame(flush)
  }

  const settle = (e: PointerEvent) => {
    presses.delete(e.pointerId)
    // A move still waiting is seen before the press that follows it.
    if (frame) {
      cancelAnimationFrame(frame)
      flush()
    }
  }

  return {
    ...base,
    handlers: {
      ...base.handlers,
      onPointerMove,
      onPointerDown: (e: PointerEvent) => {
        settle(e)
        presses.set(e.pointerId, { x: e.clientX, y: e.clientY, turned: false })
        down(e)
      },
      onPointerUp: (e: PointerEvent) => {
        settle(e)
        up(e)
      },
      onPointerCancel: (e: PointerEvent) => {
        settle(e)
        cancel?.(e)
      },
    },
  } as typeof base
}
