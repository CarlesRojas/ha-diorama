import type { Point, RoomConfig } from '#/types.ts'
import { useCallback, useRef, useState } from 'react'

// A picture of the home's plan, laid under the drawing to trace the rooms
// over, the way tracing paper is used. It belongs to the editor on this
// browser and is never part of the card: a plan is hundreds of kilobytes,
// which has no place in a dashboard's config, and it is thrown away once the
// rooms are drawn.
export type Trace = {
  // The picture, as a data URL.
  src: string
  // Height over width of the picture.
  aspect: number
  // Where its middle sits on the plan, and how wide it is, in meters.
  center: Point
  width: number
  opacity: number
  // What of the picture shows. A stored picture from before this existed
  // has none and shows whole.
  mode?: TraceMode
}

// The whole picture, or only its lines in the color of the theme's text with
// the paper left out: the dark lines of a plan on white paper, or the light
// lines of one on a dark background.
export type TraceMode = 'picture' | 'dark-lines' | 'light-lines'

const KEY = 'diorama:trace'
// Where the picture was kept before the card was renamed.
const OLD_KEY = 'floorplan-3d:trace'
// The longest side the picture is kept at. Enough to read a plan's lines
// zoomed in, and small enough to fit in the browser's storage.
const LONGEST_PX = 2400
export const TRACE_OPACITY = 1
const TRACE_WIDTH_M = 10
// The narrowest the picture can be dragged to, in meters.
export const TRACE_LEAST_WIDTH_M = 0.5
// How long the picture rests before it is stored again, since a drag changes
// it on every move and the whole picture is written each time.
const STORE_MS = 300

// Whether a point on the plan falls on the picture.
export function traceCovers(trace: Trace, [x, y]: Point) {
  return (
    Math.abs(x - trace.center[0]) <= trace.width / 2 &&
    Math.abs(y - trace.center[1]) <= (trace.width * trace.aspect) / 2
  )
}

function keyFor(floorId: string = 'floor-0') {
  return floorId === 'floor-0' ? KEY : `${KEY}:${floorId}`
}

function read(floorId: string = 'floor-0'): Trace | null {
  try {
    const k = keyFor(floorId)
    if (floorId === 'floor-0') {
      const old = localStorage.getItem(OLD_KEY)
      if (old !== null) {
        if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, old)
        localStorage.removeItem(OLD_KEY)
      }
    }
    const stored = localStorage.getItem(k)
    return stored ? (JSON.parse(stored) as Trace) : null
  } catch {
    return null
  }
}

function write(trace: Trace | null, floorId: string = 'floor-0') {
  try {
    const k = keyFor(floorId)
    if (trace) localStorage.setItem(k, JSON.stringify(trace))
    else localStorage.removeItem(k)
  } catch {
    // Too big for the browser's storage, or storage is off: the picture
    // stays for as long as the editor is open.
  }
}

export function useTrace(floorId: string = 'floor-0'): [Trace | null, (trace: Trace | null) => void] {
  const [trace, setTrace] = useState<Trace | null>(() => read(floorId))
  const timer = useRef(0)

  // Reload trace when floor changes
  useState(() => {
    setTrace(read(floorId))
  })

  const set = useCallback((next: Trace | null) => {
    setTrace(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => write(next, floorId), STORE_MS)
  }, [floorId])

  return [trace, set]
}

// Reads a picture from a file, scaled down if it is very large, and lays it
// over the rooms already drawn, or around the origin when there are none.
export async function traceFrom(file: File, rooms: RoomConfig[]): Promise<Trace> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const k = Math.min(1, LONGEST_PX / Math.max(image.naturalWidth, image.naturalHeight))
    const w = Math.max(1, Math.round(image.naturalWidth * k))
    const h = Math.max(1, Math.round(image.naturalHeight * k))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The picture could not be read')
    // A plan with a clear background would vanish over a dark theme.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, w, h)
    context.drawImage(image, 0, 0, w, h)
    const points = rooms.flatMap(room => room.points)
    const xs = points.map(p => p[0])
    const ys = points.map(p => p[1])
    const some = points.length > 0
    return {
      src: canvas.toDataURL('image/webp', 0.85),
      aspect: h / w,
      center: some ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [0, 0],
      width: some ? Math.max(Math.max(...xs) - Math.min(...xs), TRACE_WIDTH_M) : TRACE_WIDTH_M,
      opacity: TRACE_OPACITY,
      // Most plans are dark lines on white paper.
      mode: 'dark-lines',
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
