import type { ModelLook, ModelMotion, ModelPart, ModelTop } from '#/types.ts'
import type { Signal } from '#/signals.ts'

// What the parts of an imported model do with the device behind its piece.
// A part says it in the name of its node, or of a node above it in the file,
// as a tag in square brackets after the name:
//
//   Shade [glow]          shines in the light's color and lights the room
//   Shade [glow 0.6]      the same, giving 0.6 of what a lamp gives
//   Display [led]         shines in the light's color, lights nothing
//   Flame [on]            only there while the device is on
//   Dark screen [off]     only there while the device is off
//   Door [hinge y 90]     turns 90 degrees round y as the piece opens
//   Door [hinge -y 110]   the other way round, further
//   Drawer [slide z 0.4]  comes 40 cm out toward the front as it opens
//   Rotor [spin y 1.5]    turns one and a half times a second while on
//   Board [top]           other pieces can stand on its upper face
//
// A motion turns or moves the part round the origin of the node the tag is
// on, which is where a hinge goes in Blender: set the object's origin on
// the hinge. Every mesh under that node moves with it and keeps its own
// name, so a door's leaf and its handle keep a color each. The axes are the
// model's: x to the right, y up and z toward the front, which is -y in
// Blender before it exports. A part takes the nearest motion and the
// nearest look above it, so a glowing shade can sit on a hinged arm.

export type PartTags = {
  motion?: Omit<ModelMotion, 'pivot'>
  look?: ModelLook
  // Its upper face is a top for other pieces to stand on.
  top?: boolean
}

const AXES: Record<string, [number, number, number]> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
}

function axisOf(word: string | undefined): [number, number, number] | null {
  if (!word) return null
  const m = /^([+-]?)([xyz])$/i.exec(word)
  if (!m) return null
  const [x, y, z] = AXES[m[2].toLowerCase()]
  const s = m[1] === '-' ? -1 : 1
  return [x * s, y * s, z * s]
}

const number = (word: string | undefined, fallback: number) => {
  const n = word === undefined ? NaN : Number(word.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

const MOTION_DEFAULTS = { hinge: 90, slide: 0.3, spin: 1 } as const

// The tags in a name, at most one motion and one look. Words that are not
// a tag are left alone, so a name with brackets of its own still reads.
export function parseTags(raw: string | undefined): PartTags {
  const out: PartTags = {}
  if (!raw) return out
  for (const match of raw.matchAll(/\[([^\]]*)\]/g)) {
    const [verb, ...args] = match[1].trim().split(/\s+/)
    const type = verb?.toLowerCase()
    if (type === 'hinge' || type === 'slide' || type === 'spin') {
      if (out.motion) continue
      const axis = axisOf(args[0]) ?? [0, 1, 0]
      out.motion = { type, axis, amount: number(args[1], MOTION_DEFAULTS[type]) }
    } else if (type === 'glow' || type === 'led' || type === 'on' || type === 'off') {
      if (out.look) continue
      out.look = type === 'glow' ? { type, output: Math.min(Math.max(number(args[0], 1), 0.05), 3) } : { type }
    } else if (type === 'top') {
      out.top = true
    }
  }
  return out
}

// A name with its tags taken out, as the color slot calls it.
export const untagged = (raw: string) => raw.replace(/\[[^\]]*\]/g, ' ')

// The parts that come from a device: anything with a motion or a look.
export const isActive = (part: Pick<ModelPart, 'motion' | 'look'>) => !!part.motion || !!part.look

// What a part, as read back from the card config, may be trusted to say.
// A hand edited config can hold anything, and a part that says nothing
// sensible is drawn still.
export function cleanMotion(motion: unknown): ModelMotion | undefined {
  const m = motion as ModelMotion | undefined
  if (!m || typeof m !== 'object') return undefined
  if (m.type !== 'hinge' && m.type !== 'slide' && m.type !== 'spin') return undefined
  const vec = (v: unknown) =>
    Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))
  if (!vec(m.axis) || !vec(m.pivot) || typeof m.amount !== 'number' || !Number.isFinite(m.amount)) return undefined
  const length = Math.hypot(...m.axis)
  if (length < 1e-6) return undefined
  return {
    type: m.type,
    axis: m.axis.map(n => n / length) as [number, number, number],
    amount: m.amount,
    pivot: m.pivot,
  }
}

export function cleanLook(look: unknown): ModelLook | undefined {
  const l = look as ModelLook | undefined
  if (!l || typeof l !== 'object') return undefined
  if (l.type === 'glow') {
    const output = typeof l.output === 'number' && Number.isFinite(l.output) ? l.output : 1
    return { type: 'glow', output: Math.min(Math.max(output, 0.05), 3) }
  }
  if (l.type === 'led' || l.type === 'on' || l.type === 'off') return { type: l.type }
  return undefined
}

// The most tops a model keeps, the widest ones when it has more.
export const MODEL_MAX_TOPS = 12

// The tops of a model as read back from the card config, lowest first. A
// hand edited config can hold anything, and a top that says nothing
// sensible is left out.
export function cleanTops(tops: unknown): ModelTop[] {
  if (!Array.isArray(tops)) return []
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  return tops
    .filter((t): t is ModelTop => !!t && typeof t === 'object' && [t.y, t.x, t.z, t.w, t.d].every(ok))
    .filter(t => t.y >= 0 && t.w > 0 && t.d > 0)
    .slice(0, MODEL_MAX_TOPS)
    .map(t => ({ y: t.y, x: t.x, z: t.z, w: t.w, d: t.d }))
    .sort((a, b) => a.y - b.y)
}

// What a model can show of a device, from what its parts do. A model whose
// parts all stand still shows nothing, and stands for no device.
export function modelSignals(parts: Pick<ModelPart, 'motion' | 'look'>[]): Signal[] {
  const out = new Set<Signal>()
  for (const part of parts) {
    const look = cleanLook(part.look)
    const motion = part.motion?.type
    if (look?.type === 'glow' || look?.type === 'led')
      for (const s of ['toggle', 'level', 'color', 'warmth'] as const) out.add(s)
    if (look?.type === 'on' || look?.type === 'off') out.add('toggle')
    if (motion === 'hinge' || motion === 'slide' || motion === 'spin') {
      out.add('toggle')
      out.add('level')
    }
  }
  // Like every catalog piece that switches, it also plays once for a press.
  if (out.has('toggle')) out.add('press')
  return [...out]
}

// The kinds of Home Assistant device offered first for it: a light for a
// model that glows, a cover for one that opens, a fan for one that spins.
export function modelPreferredDomains(parts: Pick<ModelPart, 'motion' | 'look'>[]): string[] {
  const out = new Set<string>()
  for (const part of parts) {
    const look = cleanLook(part.look)?.type
    if (look === 'glow' || look === 'led') out.add('light')
    const motion = part.motion?.type
    if (motion === 'hinge' || motion === 'slide') out.add('cover')
    if (motion === 'spin') out.add('fan')
  }
  return [...out]
}

// A model whose percentage is where it stands, a door or a drawer, rather
// than how hard it runs.
export const modelOpens = (parts: Pick<ModelPart, 'motion'>[]) =>
  parts.some(p => p.motion?.type === 'hinge' || p.motion?.type === 'slide')
