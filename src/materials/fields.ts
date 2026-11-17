// The patterns of the procedural surfaces, worked out pixel by pixel. Plain
// numbers and nothing from three, so a worker can build them away from the
// page, see bake.worker.ts.

export type SurfaceKind =
  'wood' | 'wood_floor' | 'tiles' | 'terracotta' | 'carpet' | 'concrete' | 'fabric' | 'ceramic' | 'metal' | 'matte'

export const SIZE = 512

// Deterministic value noise, so every load looks the same.
function hash2(x: number, y: number, seed: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

// The lattice wraps, so a field built from it meets itself at the edge of the
// tile. Without this every surface carried a seam where the tile repeated.
function lattice(x: number, y: number, seed: number, px: number, py: number) {
  return hash2(((x % px) + px) % px, ((y % py) + py) % py, seed)
}

function smoothNoise(x: number, y: number, seed: number, px: number, py: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = lattice(x0, y0, seed, px, py)
  const b = lattice(x0 + 1, y0, seed, px, py)
  const c = lattice(x0, y0 + 1, seed, px, py)
  const d = lattice(x0 + 1, y0 + 1, seed, px, py)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

// `u` and `v` run 0 to 1 across the tile. `fx` and `fy` are how many features
// fit in it, and have to be whole numbers for the tile to wrap.
function fbm(u: number, v: number, fx: number, fy: number, seed: number, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += smoothNoise(u * fx * f, v * fy * f, seed + i, fx * f, fy * f) * amp
    amp *= 0.5
    f *= 2
  }
  return sum
}

// Height and brightness per pixel, both 0 to 1, u and v in 0 to 1 tiling.
type Field = (u: number, v: number) => { height: number; light: number }

// `repeat` is how many times the tile fits in a meter, so a surface keeps the
// same physical scale on a small stool and on a whole floor.

export const FIELDS: Record<
  SurfaceKind,
  { field: Field; roughness: number; repeat: number; stretch?: number; normalScale: number }
> = {
  wood: {
    // Furniture oak: a continuous grain with no plank seams, in long streaks.
    field: (u, v) => {
      const grain = fbm(u, v, 2, 9, 41, 3)
      const fleck = fbm(u, v, 6, 26, 43, 2)
      return { height: 0.5 + grain * 0.35 + fleck * 0.15, light: 0.9 + grain * 0.07 + fleck * 0.03 }
    },
    roughness: 0.65,
    repeat: 4,
    normalScale: 0.18,
  },
  wood_floor: {
    // Floorboards. The tile is eight boards across and four boards long, and
    // it is stretched five times along u, so a board is 16 cm wide and 1.6 m
    // long. Every row is offset by its own amount, so the short joints only
    // line up again after eight boards, more than a meter across the room.
    field: (u, v) => {
      const rows = 8
      const row = Math.floor(v * rows)
      const along = u + hash2(row, 1, 7)
      const board = Math.floor(along * 4)
      const joint = Math.abs(v * rows - row - 0.5) > 0.475 || Math.abs(along * 4 - board - 0.5) > 0.4955
      // Grain runs the length of the board, so it is slow along u and fine
      // across v. Anything busy along u would read as another joint.
      const grain = fbm(u, v, 2, 56, 1)
      const tone = 0.9 + grain * 0.05 + (hash2(row, board, 3) - 0.5) * 0.07
      return { height: joint ? 0.45 : 0.62 + grain * 0.1, light: joint ? tone * 0.92 : tone }
    },
    roughness: 0.7,
    repeat: 0.78,
    stretch: 5,
    normalScale: 0.12,
  },
  tiles: {
    // Square tiles with grout lines. Three per tile at 0.83 tiles per meter,
    // so a tile is 40 cm across.
    field: (u, v) => {
      const gu = Math.abs(((u * 3) % 1) - 0.5) > 0.487
      const gv = Math.abs(((v * 3) % 1) - 0.5) > 0.487
      const grout = gu || gv
      const speck = fbm(u, v, 9, 9, 5)
      return { height: grout ? 0.45 : 0.7 + speck * 0.1, light: grout ? 0.86 : 0.95 + speck * 0.05 }
    },
    roughness: 0.35,
    repeat: 0.83,
    normalScale: 0.22,
  },
  terracotta: {
    // Larger warm tiles, slightly uneven. Two per tile at 1.25 tiles per
    // meter, so a tile is 40 cm across.
    field: (u, v) => {
      const gu = Math.abs(((u * 2) % 1) - 0.5) > 0.485
      const gv = Math.abs(((v * 2) % 1) - 0.5) > 0.485
      const grout = gu || gv
      const wobble = fbm(u, v, 5, 5, 9)
      return { height: grout ? 0.3 : 0.55 + wobble * 0.35, light: grout ? 0.82 : 0.92 + wobble * 0.07 }
    },
    roughness: 0.85,
    repeat: 1.25,
    normalScale: 0.3,
  },
  carpet: {
    // Soft pile: clumps of about 8 cm with a fine fuzz over them.
    field: (u, v) => {
      const n = fbm(u, v, 10, 10, 13, 3) * 0.7 + fbm(u, v, 34, 34, 15, 2) * 0.3
      return { height: n, light: 0.9 + n * 0.09 }
    },
    roughness: 1,
    repeat: 1.2,
    normalScale: 0.3,
  },
  concrete: {
    // Poured concrete: broad cloudy patches, a faint trowel swirl over them
    // and fine aggregate speckle.
    field: (u, v) => {
      const broad = fbm(u, v, 3, 3, 17)
      const swirl = fbm(u, v, 7, 7, 19, 3)
      const speck = fbm(u, v, 40, 40, 21, 2)
      return {
        height: broad * 0.5 + swirl * 0.3 + speck * 0.2,
        light: 0.9 + broad * 0.06 + swirl * 0.03 + speck * 0.04,
      }
    },
    roughness: 0.9,
    repeat: 0.55,
    normalScale: 0.12,
  },
  fabric: {
    // A quiet weave: just enough cross hatch to catch the light.
    field: (u, v) => {
      const weave = (Math.sin(u * Math.PI * 14) + Math.sin(v * Math.PI * 14)) * 0.25 + 0.5
      const n = fbm(u, v, 9, 9, 23, 2)
      return { height: weave * 0.5 + n * 0.5, light: 0.94 + weave * 0.03 + n * 0.03 }
    },
    roughness: 1,
    repeat: 7,
    normalScale: 0.1,
  },
  ceramic: {
    // Smooth with faint glaze ripples.
    field: (u, v) => {
      const n = fbm(u, v, 5, 5, 29, 3)
      return { height: n, light: 0.96 + n * 0.04 }
    },
    roughness: 0.25,
    repeat: 3,
    normalScale: 0.06,
  },
  metal: {
    // Fine brushed lines in one direction.
    field: (u, v) => {
      const brush = fbm(u, v, 2, 40, 31, 2)
      return { height: brush, light: 0.9 + brush * 0.1 }
    },
    roughness: 0.4,
    repeat: 4,
    normalScale: 0.08,
  },
  matte: {
    field: (u, v) => {
      const n = fbm(u, v, 8, 8, 37, 2)
      return { height: n, light: 0.97 + n * 0.03 }
    },
    roughness: 0.95,
    repeat: 4,
    normalScale: 0.05,
  },
}

// A kind's pattern: the brightness of each pixel, which the color map is
// baked from at each intensity, and the normal map, RGBA, which every
// intensity shares since the material scales the relief.
export type Baked = { light: Float32Array; normal: Uint8Array }

export function bake(kind: SurfaceKind): Baked {
  const spec = FIELDS[kind]
  const heights = new Float32Array(SIZE * SIZE)
  const light = new Float32Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const texel = spec.field(x / SIZE, y / SIZE)
      heights[y * SIZE + x] = texel.height
      light[y * SIZE + x] = texel.light
    }
  }

  // Normal map from the height field with a Sobel filter, tiling at the edges.
  const normal = new Uint8Array(SIZE * SIZE * 4)
  const h = (x: number, y: number) => heights[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]
  const strength = 6
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx =
        (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x - 1, y) - h(x - 1, y + 1)) *
        strength
      const dy =
        (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1) - h(x - 1, y - 1) - 2 * h(x, y - 1) - h(x + 1, y - 1)) *
        strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * SIZE + x) * 4
      normal[i] = Math.round((-dx / len) * 127 + 128)
      normal[i + 1] = Math.round((-dy / len) * 127 + 128)
      normal[i + 2] = Math.round((1 / len) * 127 + 128)
      normal[i + 3] = 255
    }
  }
  return { light, normal }
}

// The color map at an intensity, as RGBA, into `into`.
export function paint(light: Float32Array, intensity: number, into: Uint8Array) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Toward plain white as the intensity drops, past the design as it rises.
      const shown = 1 - (1 - light[y * SIZE + x]) * intensity
      const l = Math.round(Math.min(Math.max(shown, 0), 1) * 255)
      // The map used to be a canvas, which three uploads upside down. Its
      // rows are stored the other way round here, so the pattern still lies
      // the way it always has.
      const i = ((SIZE - 1 - y) * SIZE + x) * 4
      into[i] = l
      into[i + 1] = l
      into[i + 2] = l
      into[i + 3] = 255
    }
  }
}
