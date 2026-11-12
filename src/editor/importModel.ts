import {
  MODEL_MAX_BYTES,
  MODEL_MAX_TRIANGLES,
  MODEL_WARN_TRIANGLES,
  MODELS_MAX_BYTES,
  modelBytes,
} from '#/decoration/models.ts'
import { fetchShape } from '#/scene/decor/CustomModel.tsx'
import { encodeShape, readGltf, shapeOf, type Shape } from '#/scene/decor/modelShape.ts'
import type { ModelConfig } from '#/types.ts'

// Brings a 3D model into the catalog: a .glb, or a .gltf with the files it
// names, read in the browser and kept in the card config, so it is there
// on every screen the dashboard opens on. Or a link to a file Home
// Assistant serves, which is then only read when the card is drawn.

export type Imported = { id: string; model: ModelConfig }

type Models = Record<string, ModelConfig> | undefined

const thousands = (n: number) => Math.round(n).toLocaleString('en-US')
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`

// The name a file gives the model: its own name without the extension,
// with the underscores and dashes that stand for spaces taken out.
function nameFrom(file: string) {
  const bare = decodeURIComponent(file.split(/[\\/]/).pop() ?? '').replace(/\.(glb|gltf)$/i, '')
  const words = bare.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
  return words ? words[0].toUpperCase() + words.slice(1) : 'Model'
}

// A short id that reads as the model, unique in the card.
function idFor(name: string, models: Models) {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24) || 'model'
  for (;;) {
    const id = `${slug}_${Math.random().toString(36).slice(2, 6)}`
    if (!models?.[id]) return id
  }
}

function checkTriangles(shape: Shape) {
  if (shape.triangles > MODEL_MAX_TRIANGLES)
    throw new Error(
      `This model has ${thousands(shape.triangles)} triangles, more than the ${thousands(MODEL_MAX_TRIANGLES)} a wall tablet can draw smoothly. Simplify it first, for example with the Decimate modifier in Blender, and import it again.`,
    )
}

// What to say when a file could not be read, the one thing it lacks when
// that is known.
function unreadable(error: unknown, otherwise: string) {
  const message = error instanceof Error ? error.message : ''
  if (message === 'There is no shape in this file.') return message
  if (/draco/i.test(message))
    return 'This file is compressed with Draco, which the card cannot read. Export it again with Draco compression off, in Blender under Geometry in the glTF export options.'
  return otherwise
}

// A .gltf keeps its shape in files of its own, which have to be picked
// with it: one left behind would be asked of Home Assistant by its name and
// read as whatever comes back. Its pictures are never read, so they need not be.
function missingFiles(text: string, files: File[]) {
  let json: { buffers?: { uri?: string }[] }
  try {
    json = JSON.parse(text)
  } catch {
    return
  }
  const picked = new Set(files.map(f => f.name))
  const missing = (json.buffers ?? [])
    .map(b => b.uri)
    .filter((uri): uri is string => !!uri && !uri.startsWith('data:'))
    .map(uri => decodeURIComponent(uri.split(/[\\/]/).pop() ?? uri))
    .filter(name => !picked.has(name))
  if (missing.length > 0)
    throw new Error(`This .gltf keeps its shape in ${missing.join(', ')}. Pick it along with the .gltf.`)
}

const read = (file: File, as: 'text' | 'buffer') => (as === 'text' ? file.text() : file.arrayBuffer())

export async function importFiles(files: File[], models: Models): Promise<Imported> {
  const main = files.find(f => /\.glb$/i.test(f.name)) ?? files.find(f => /\.gltf$/i.test(f.name))
  if (!main) throw new Error('Pick a .glb file, or a .gltf file along with the files it comes with.')
  const data = await read(main, /\.gltf$/i.test(main.name) ? 'text' : 'buffer')
  if (typeof data === 'string') missingFiles(data, files)
  // The files picked with a .gltf, by their names, for it to find.
  const urls = new Map<string, string>()
  for (const file of files) if (file !== main) urls.set(file.name, URL.createObjectURL(file))
  let shape: Shape
  try {
    const gltf = await readGltf(data, urls)
    shape = shapeOf(gltf)
  } catch (error) {
    throw new Error(
      unreadable(
        error,
        `${main.name} could not be read as a 3D model. A .gltf needs the files it comes with picked along with it.`,
      ),
      {
        cause: error,
      },
    )
  } finally {
    for (const url of urls.values()) URL.revokeObjectURL(url)
  }
  checkTriangles(shape)
  const name = nameFrom(main.name)
  const model: ModelConfig = { name, size: shape.size, triangles: shape.triangles, parts: encodeShape(shape) }
  const bytes = modelBytes(model)
  if (bytes > MODEL_MAX_BYTES)
    throw new Error(
      `This model takes ${megabytes(bytes)} in the card, more than the ${megabytes(MODEL_MAX_BYTES)} one model can. Simplify it first, for example with the Decimate modifier in Blender, or put the file in your Home Assistant's www folder and link to it instead.`,
    )
  const others = Object.values(models ?? {}).reduce((sum, m) => sum + modelBytes(m), 0)
  if (others + bytes > MODELS_MAX_BYTES)
    throw new Error(
      `With this one your models would take ${megabytes(others + bytes)} in the card, more than the ${megabytes(MODELS_MAX_BYTES)} Home Assistant can save with the dashboard. Remove a model you do not use, or link to this file in your www folder instead.`,
    )
  return { id: idFor(name, models), model }
}

// A file Home Assistant serves, like /local/models/chair.glb for
// /config/www/models/chair.glb. It is read once now for its size and its
// parts, and again by every screen that draws the card.
export async function importLink(link: string, models: Models): Promise<Imported> {
  const url = link.trim()
  if (!/^(\/|https?:\/\/)/i.test(url) || !/\.(glb|gltf)(\?.*)?$/i.test(url))
    throw new Error('Link to a .glb or .gltf file, like /local/models/chair.glb for one in /config/www/models.')
  let shape: Shape
  try {
    shape = await fetchShape(url)
  } catch (error) {
    throw new Error(
      unreadable(error, `Nothing could be read at ${url}. Check that the file is there and is a .glb or .gltf.`),
      {
        cause: error,
      },
    )
  }
  checkTriangles(shape)
  const name = nameFrom(url.replace(/\?.*$/, ''))
  const model: ModelConfig = {
    name,
    size: shape.size,
    triangles: shape.triangles,
    // The file is read again on every screen, so only what the kind is
    // made from is kept: the names, the paint and what each part does.
    parts: shape.parts.map(p => ({
      name: p.name,
      ...(p.motion && { motion: p.motion }),
      ...(p.look && { look: p.look }),
      ...(p.color && { color: p.color }),
      ...(p.finish && { finish: p.finish }),
    })),
    url,
  }
  return { id: idFor(name, models), model }
}

// What the item panel says about a model that is heavy to draw.
export const heavyNote = (model: ModelConfig) =>
  model.triangles > MODEL_WARN_TRIANGLES
    ? `${thousands(model.triangles)} triangles. Fine on a computer, it may make a wall tablet stutter.`
    : null

export const sizeNote = (model: ModelConfig) =>
  model.url
    ? `Read from ${model.url}, ${thousands(model.triangles)} triangles.`
    : `${thousands(model.triangles)} triangles, ${Math.max(1, Math.round(modelBytes(model) / 1000))} kB in the card.`
