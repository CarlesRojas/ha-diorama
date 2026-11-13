import type { DecorationKind, DecorationParam, Mount } from '#/decoration/catalog.ts'
import { cleanTops, modelOpens, modelPreferredDomains, modelSignals } from '#/decoration/modelTags.ts'
import { SCANDI } from '#/theme.ts'
import type { ModelConfig, ModelTop } from '#/types.ts'

// Models imported into the editor's catalog. The catalog itself is fixed,
// but each card brings its own models in its config, so their kinds are made
// from there and kept here, where everything that asks the catalog for a
// kind finds them too. A piece placed from one names it in its kind, as
// `model:<id>`, which is how one model placed many times is kept once.

export const MODEL_FAMILY = 'custom'
const PREFIX = 'model:'

export const modelKindId = (id: string) => `${PREFIX}${id}`
export const modelIdOf = (kindId: string) => (kindId.startsWith(PREFIX) ? kindId.slice(PREFIX.length) : null)

// Every part starts in the same neutral color, for the viewer to paint.
export const MODEL_COLOR = SCANDI.linen

// What a model may weigh. The card config is saved in one websocket message
// with the rest of its dashboard, which Home Assistant takes up to 4 MB of,
// so a model is kept well under that and all of a card's models together
// leave room for everything else. The triangles are what a wall tablet has
// to draw every frame: past the warning it may stutter, past the limit it
// is refused.
export const MODEL_MAX_TRIANGLES = 60000
export const MODEL_WARN_TRIANGLES = 20000
export const MODEL_MAX_BYTES = 1_000_000
export const MODELS_MAX_BYTES = 2_500_000
// A model with more parts than this has its parts gathered by what they are
// made of, each part a color slot and a draw call of its own.
export const MODEL_MAX_PARTS = 16

type Entry = { kind: DecorationKind; model: ModelConfig; signature: string; tops: ModelTop[] }
const registry = new Map<string, Entry>()

const round2 = (value: number) => Math.round(value * 100) / 100
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

// A size slider for one side of the model, starting at its own size and
// reaching well past it both ways, by the centimeter.
function side(id: string, label: string, own: number): DecorationParam {
  const d = clamp(round2(own), 0.01, 30)
  return {
    id,
    label,
    default: d,
    min: round2(Math.max(0.01, d * 0.2)),
    max: round2(Math.max(d * 3, d + 1)),
    step: 0.01,
  }
}

// Everything the parts and the stored shape say that a kind is made from.
// The shape itself is left out: once imported it never changes.
const signatureOf = (model: ModelConfig) =>
  JSON.stringify([
    model.name,
    model.size,
    model.mount,
    model.url,
    model.tops,
    model.parts.map(p => [p.name, p.motion, p.look, p.color, p.finish]),
  ])

function kindOf(id: string, model: ModelConfig): DecorationKind {
  const mount: Mount = model.mount === 'wall' || model.mount === 'ceiling' ? model.mount : 'floor'
  const [w, d, h] = model.size
  const params: DecorationParam[] = [side('width', 'Width', w), side('depth', 'Depth', d), side('height', 'Height', h)]
  // On the floor it can stand on a table like a lamp can, and starts on the
  // floor. On a wall it hangs with its middle at eye height, which is how
  // high its bottom edge starts.
  if (mount === 'floor')
    params.push({ id: 'lift', label: 'Standing on', default: 0, min: 0, max: 1.5, step: 0.05, hidden: true })
  if (mount === 'wall') {
    const sill = clamp(round2(1.5 - h / 2), 0, 2.5)
    params.push({ id: 'sill', label: 'Off floor', default: sill, min: 0, max: 3, step: 0.01 })
  }
  // Each part starts in the paint its material in the file gave it, or in
  // the neutral linen when it had none.
  const hex = (c: unknown) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : MODEL_COLOR)
  const colors = Object.fromEntries(model.parts.map(p => [p.name, hex(p.color)]))
  const materials = Object.fromEntries(
    model.parts.filter(p => typeof p.finish === 'string').map(p => [p.name, p.finish as string]),
  )
  return {
    id: modelKindId(id),
    family: MODEL_FAMILY,
    label: model.name,
    mount,
    params,
    colors,
    materials,
    // What its parts do with a device, read from the tags in their names
    // when it was imported. A model that only stands there shows nothing.
    expresses: modelSignals(model.parts),
  }
}

// The tops of a model other pieces can stand on, lowest first, at the size
// the model was made in. None for a model without a part tagged for it, and
// none for one hanging from the ceiling.
const topsOf = (model: ModelConfig) => (model.mount === 'ceiling' ? [] : cleanTops(model.tops))
const NO_TOPS: ModelTop[] = []

// Makes the kinds for a card's models, keeping the ones that did not change
// so whatever holds on to a kind is handed the same one.
export function registerModels(models: Record<string, ModelConfig> | undefined) {
  if (!models || typeof models !== 'object') return
  for (const [id, model] of Object.entries(models)) {
    if (!validModel(model)) continue
    const key = modelKindId(id)
    const signature = signatureOf(model)
    const known = registry.get(key)
    if (known && known.signature === signature) {
      known.model = model
      continue
    }
    registry.set(key, { kind: kindOf(id, model), model, signature, tops: topsOf(model) })
  }
}

export function validModel(model: unknown): model is ModelConfig {
  const m = model as ModelConfig | null
  return (
    !!m &&
    typeof m === 'object' &&
    typeof m.name === 'string' &&
    Array.isArray(m.size) &&
    m.size.length === 3 &&
    m.size.every(n => typeof n === 'number' && n > 0) &&
    Array.isArray(m.parts) &&
    m.parts.length > 0 &&
    m.parts.every(p => p && typeof p.name === 'string')
  )
}

export const modelKind = (kindId: string) => registry.get(kindId)?.kind
export const modelOf = (kindId: string) => registry.get(kindId)?.model
export const modelTops = (kindId: string) => registry.get(kindId)?.tops ?? NO_TOPS
export const isModelKind = (kind: DecorationKind) => kind.family === MODEL_FAMILY
// The kinds of device offered first for a model, from what its parts do.
export const modelDomains = (kindId: string) => modelPreferredDomains(modelOf(kindId)?.parts ?? [])
// Whether its percentage is how far it is open, a door or a drawer.
export const modelIsPositioned = (kindId: string) => modelOpens(modelOf(kindId)?.parts ?? [])

// The kinds of a card's models, in the order they were imported.
export function modelKinds(models: Record<string, ModelConfig> | undefined): DecorationKind[] {
  registerModels(models)
  return Object.keys(models ?? {})
    .map(id => modelKind(modelKindId(id)))
    .filter((k): k is DecorationKind => !!k)
}

// How much room a model takes in the config, which is about its length
// once written out.
export const modelBytes = (model: ModelConfig) =>
  model.parts.reduce((sum, p) => sum + (p.vertices?.length ?? 0) + (p.triangles?.length ?? 0), 0)
