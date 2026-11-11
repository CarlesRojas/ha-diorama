import Card from '#/Card.tsx'
import { decorationKind } from '#/decoration/catalog.ts'
import { modelIdOf, registerModels, validModel } from '#/decoration/models.ts'
import Editor from '#/editor/Editor.tsx'
import { persistCard } from '#/editor/persist.ts'
import { ReactHost } from '#/host.tsx'
import { registerTiles } from '#/tiles/index.tsx'
import { sameButBackground, ViewBackground } from '#/lib/background.ts'
import { cardKey } from '#/lib/lastRoom.ts'
import { closest, closestClass, inPanelView } from '#/lib/panelView.ts'
import WithSidePanel from '#/tiles/WithSidePanel.tsx'
import pickerPicture from '#/assets/picker.jpg?inline'
import type { BackgroundConfig, CardConfig, TileChoice, TileChoices } from '#/types.ts'

const CARD_TYPE = 'diorama-card'
const EDITOR_TYPE = `${CARD_TYPE}-editor`
// The name the card had before it was renamed.
const OLD_TYPE = 'floorplan-3d'

// Kinds that were renamed or folded into another one. A plan written
// before the change still names the old one, and without this the piece
// would quietly vanish from the plan: the catalog would not know it.
const RENAMED: Record<string, { kind: string; variant?: string; params?: Record<string, number> }> = {
  // The Globo Cesta was its own kind for a moment, then became a style of
  // the pendant, since swapped for the smaller Globo Cestita.
  light_globe: { kind: 'light_pendant', variant: 'globo_cestita' },
  // The office table became a style of the desk.
  office_table: { kind: 'desk', variant: 'office_table' },
  // The armchair became a narrow sofa, at the armchair's old size unless it
  // had one of its own.
  armchair: { kind: 'sofa', variant: 'dresde', params: { width: 0.78, depth: 0.8 } },
  // The island became a style of the counter.
  kitchen_island: { kind: 'kitchen_counter', variant: 'island' },
  // The crib was dropped, and a saved one becomes the narrowest bed.
  crib: { kind: 'bed_double', params: { width: 0.9, length: 1.8 } },
  // The nightstand became a style of the side table.
  nightstand: { kind: 'side_table', variant: 'nightstand' },
  // The standing fan and the tower fan became styles of the floor fan.
  fan_standing: { kind: 'fan_floor', variant: 'pedestal' },
  fan_tower: { kind: 'fan_floor', variant: 'disc' },
  // The roller shutter became a style of the blind, and the sliding glass
  // door a style of the sliding door.
  roller_shutter: { kind: 'blind', variant: 'shutter' },
  sliding_glass: { kind: 'sliding_door', variant: 'glass' },
}

// Kinds that were dropped with nothing to take their place. A saved one is
// left out.
const DROPPED = new Set(['picture', 'basket'])

// Parameters that were split in two, per kind. The side table was square,
// with one size for both sides, before it had a width and a depth.
const SPLIT: Record<string, Record<string, string[]>> = {
  side_table: { size: ['width', 'depth'] },
}

// Styles that were renamed, per kind. The pendant's first two were loose
// takes on the Nagoya and the Globo Cesta, then became those lamps, and the
// Globo Cesta gave way to the smaller Globo Cestita. The
// dining chair's first style was a Pilma chair, then a molded shell, then
// the Jin, and each of those is now the slab chair that took its place.
// The toilet's back to wall style gave way to a square close coupled one.
// The sofa's chaise was a style of its own before every style could have
// one, and a saved one keeps its chaise and its old width. The curtain's
// linen pleat was dropped for the sheer wave, and the station clock for a
// digital one. Both rubber plants gave way to the mango plant, the tower
// fan to the disc fan, the Dutch hood awning to the pergola, and the
// swivel shell office chair to the racer. A style can bring parameters that
// the item's own saved ones override.
type Restyle = string | { variant: string; params: Record<string, number> }
const RESTYLED: Record<string, Record<string, Restyle>> = {
  light_pendant: { slatted: 'nagoya', globe: 'globo_cestita', globo_cesta: 'globo_cestita' },
  dining_chair: { aix: 'oia', molded: 'oia', jin: 'oia' },
  toilet: { back_to_wall: 'square' },
  awning: { drop_arm: 'pergola', hood: 'pergola' },
  plant_wall: { staghorn: 'pothos', moss: 'pearls' },
  sofa: { dresde_chaise: { variant: 'dresde', params: { chaise: 1, width: 2.98 } } },
  curtain: { pleat: 'wave' },
  wall_clock: { station: 'digital' },
  sideboard: { usm: 'credenza' },
  bed_double: { platform: { variant: 'headboard', params: { headboard: 0 } } },
  plant_large: { rubber: 'mango', rubber_full: 'mango' },
  fan_floor: { tower: 'disc' },
  office_chair: { shell: 'racer' },
  christmas_tree: { slim: 'bare' },
  projector_ust: { dark: 'box' },
}

function migrate(config: CardConfig): CardConfig {
  const rooms = Array.isArray(config.rooms) ? config.rooms : []
  const known = new Set(rooms.map(r => r.id))
  const next = { ...config }
  // The card's own models are made into kinds first, so its pieces find them.
  registerModels(config.models)
  const models = config.models && typeof config.models === 'object' ? config.models : {}
  // A piece of a model the card no longer has, or one it cannot read.
  const lost = (kind: string) => {
    const id = modelIdOf(kind)
    return id !== null && !validModel(models[id])
  }
  if (Array.isArray(config.decorations)) {
    next.decorations = config.decorations
      // A piece whose room is gone has nowhere to be drawn. It is left out
      // rather than taken as a reason to refuse the whole card.
      .filter(d => known.has(d.room) && !DROPPED.has(d.kind) && !lost(d.kind))
      .map(d => {
        const now = RENAMED[d.kind]
        if (!now) return d
        const params = now.params ? { ...now.params, ...d.params } : d.params
        // A style the new kind does not know, and that no rename below will
        // catch, is dropped for the one the rename names, so the piece is
        // not drawn in the new kind's first style by accident.
        const kept =
          d.variant &&
          (decorationKind(now.kind)?.variants?.some(v => v.id === d.variant) || RESTYLED[now.kind]?.[d.variant])
        return { ...d, kind: now.kind, variant: kept ? d.variant : now.variant, params }
      })
      .map(d => {
        const style = d.variant ? RESTYLED[d.kind]?.[d.variant] : undefined
        if (!style) return d
        if (typeof style === 'string') return { ...d, variant: style }
        return { ...d, variant: style.variant, params: { ...style.params, ...d.params } }
      })
      .map(d => {
        const split = SPLIT[d.kind]
        if (!split || !d.params) return d
        const params = { ...d.params }
        for (const [old, now] of Object.entries(split)) {
          if (params[old] === undefined) continue
          for (const id of now) params[id] ??= params[old]
          delete params[old]
        }
        return { ...d, params }
      })
  }
  if (Array.isArray(config.devices)) next.devices = config.devices.filter(d => known.has(d.room))
  // The names the card and its tiles had before they were renamed.
  if (config.type === `custom:${OLD_TYPE}`) next.type = `custom:${CARD_TYPE}`
  if (rooms.some(r => r.tiles)) next.rooms = rooms.map(r => (r.tiles ? { ...r, tiles: renameTiles(r.tiles) } : r))
  if (config.home?.tiles) next.home = { ...config.home, tiles: renameTiles(config.home.tiles) }
  return next
}

function renameTiles(tiles: TileChoices): TileChoices {
  const rename = (tile: TileChoice) =>
    typeof tile.type === 'string' ? { ...tile, type: tile.type.replace(/^custom:fp-/, 'custom:dio-') } : tile
  return Object.fromEntries(
    Object.entries(tiles).map(([id, tile]) => [id, Array.isArray(tile) ? tile.map(rename) : rename(tile)]),
  )
}

function validate(config: CardConfig) {
  if (config.floors !== undefined && !Array.isArray(config.floors)) throw new Error('floors must be a list')
  for (const floor of config.floors ?? []) if (!floor?.id) throw new Error('Every floor needs an id')
  if (config.rooms !== undefined && !Array.isArray(config.rooms)) throw new Error('rooms must be a list')
  for (const room of config.rooms ?? []) {
    if (!room.id) throw new Error('Every room needs an id')
    if (!Array.isArray(room.points) || room.points.length < 3)
      throw new Error(`Room ${room.id} needs at least 3 points`)
  }
  if (config.devices !== undefined && !Array.isArray(config.devices)) throw new Error('devices must be a list')
  for (const device of config.devices ?? []) {
    if (!device.entity_id) throw new Error('Every device needs an entity_id')
    if (!Array.isArray(device.position) || device.position.length !== 2)
      throw new Error(`Device ${device.entity_id} needs a position`)
  }
  if (config.decorations !== undefined && !Array.isArray(config.decorations))
    throw new Error('decorations must be a list')
  if (config.models !== undefined && (typeof config.models !== 'object' || Array.isArray(config.models)))
    throw new Error('models must be a map of model ids')
  for (const item of config.decorations ?? []) {
    if (!item.id) throw new Error('Every decoration needs an id')
    if (!item.kind) throw new Error(`Decoration ${item.id} needs a kind`)
    if (!Array.isArray(item.position) || item.position.length !== 2)
      throw new Error(`Decoration ${item.id} needs a position`)
  }
}

// How long the tree of a card Home Assistant threw away waits for a card
// built again in its place to take it over.
const KEEP_MS = 1000

class DioramaCard extends ReactHost<CardConfig> {
  private background = new ViewBackground(this)

  static getConfigElement() {
    return document.createElement(EDITOR_TYPE)
  }

  static getStubConfig(): Omit<CardConfig, 'type'> {
    return { rooms: [] }
  }

  // Called by HA once with the YAML config for this card.
  setConfig(config: CardConfig) {
    // Migrated first, so a plan from an older version is checked in the
    // shape it will be drawn in.
    const next = migrate(config)
    validate(next)
    this.backdrop = next.background
    this._config = this.keep(this._config, next)
    this.render()
  }

  // The background the config asks for. It is kept apart from the config
  // the tree is drawn with, so choosing another one changes only the
  // background and does not draw the flat again.
  private backdrop: BackgroundConfig | undefined

  // `before` when `next` only changes the background, so the tree is handed
  // the very same config and has nothing to redo.
  private keep(before: CardConfig | null, next: CardConfig) {
    return before && sameButBackground(before, next) ? before : next
  }

  // Rough height in 50px rows for the masonry layout.
  getCardSize() {
    return this._config?.side_panel ? 12 : 6
  }

  // In a sections view, the whole width with the side panel on, and the
  // section's width without it.
  getGridOptions() {
    return { columns: this._config?.side_panel ? 'full' : 12, rows: 'auto' }
  }

  // The view's background follows the config and the dashboard's dark mode,
  // so it is laid again on every render.
  protected render() {
    super.render()
    if (this.picked) return
    // The copy of the card in the side panel leaves it to the card around it.
    if (this._config && !closest(this, 'dio-side-panel')) this.background.apply(this.backdrop, this._hass)
  }

  // In the "add card" picker the card stands for itself with a picture of
  // the demo flat, as wide as the picker's tile, instead of an empty 3D view.
  private picked = false

  // The preview in the card dialog throws its card away on every change of
  // the config and builds a new one. The new one takes over the old one's
  // tree, so a change only updates what it touches instead of loading the
  // whole flat again.
  private previewed = false

  // Home Assistant also builds the whole dashboard again when the app comes
  // back from the background. The new card takes over the old one's tree
  // the same way, so the flat stays on screen, on the room it showed,
  // instead of loading again. Trees are kept by the card's page and rooms,
  // and apart for the copy inside the side panel.
  private key: string | null = null

  connectedCallback() {
    const holder = this.parentElement
    this.picked = (this.getRootNode() as ShadowRoot).host?.localName === 'hui-card-picker'
    if (this.picked) {
      // The picker sets its previews 20px in from every edge below the name.
      // The picture fills all of that space, with the tile's corners.
      const inset = 'var(--ha-space-5, 20px)'
      const radius = 'var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px))'
      Object.assign(this.style, {
        display: 'block',
        width: `calc(100% + 2 * ${inset})`,
        margin: `calc(-1 * ${inset})`,
        alignSelf: 'stretch',
        overflow: 'hidden',
        borderRadius: `0 0 ${radius} ${radius}`,
      })
    }
    this.previewed = holder?.localName === 'hui-card' && !!holder.parentElement?.classList.contains('element-preview')
    this.key = null
    if (this.previewed) this.take('preview')
    else if (!this.picked && this._config) {
      const key = `${closest(this, 'dio-side-panel') ? 'panel' : 'card'}|${cardKey(this._config)}`
      this.key = key
      // The old card may only leave once the new one is in, so a new card
      // with nothing to take yet waits a tick before building its own.
      if (!this.take(key) && !this.mounted) {
        this.held = true
        setTimeout(() => {
          this.held = false
          if (this.isConnected && this.key === key) this.take(key)
          this.render()
        }, 0)
      }
    }
    super.connectedCallback()
  }

  // Takes over a tree parked under `key`, keeping the config it was drawn
  // with when only the background differs. Says whether there was one.
  private take(key: string) {
    const before = this.adopt(key)
    if (before === undefined) return false
    if (this._config) this._config = this.keep(before, this._config)
    return true
  }

  disconnectedCallback() {
    if (this.previewed) this.park('preview')
    else if (this.key) this.park(this.key, KEEP_MS)
    super.disconnectedCallback()
    // A card only moved is back by the next tick and keeps its background.
    setTimeout(() => {
      if (!this.isConnected) this.background.release()
    }, 0)
  }

  // The config with the card filling its height, kept so the tree is
  // handed the same one while the config does not change.
  private filled: { from: CardConfig; config: CardConfig } | null = null

  // In a sections view with a set number of rows, the diorama fills the
  // height the grid gives it rather than keeping its shape and spilling out.
  private shaped(config: CardConfig) {
    const fit = !inPanelView(this) && !!closestClass(this, 'fit-rows')
    this.style.display = fit ? 'block' : ''
    this.style.height = fit ? '100%' : ''
    if (!fit) return config
    if (this.filled?.from !== config) this.filled = { from: config, config: { ...config, aspect_ratio: 'fill' } }
    return this.filled.config
  }

  protected view() {
    if (this.picked) return <img src={pickerPicture} alt="" className="block h-full min-h-40 w-full object-cover" />
    if (this._config!.side_panel) return <WithSidePanel hass={this._hass} config={this._config!} />
    return (
      <Card
        hass={this._hass}
        config={this.shaped(this._config!)}
        panel={inPanelView(this)}
        preview={!!closest(this, 'hui-dialog-edit-card')}
      />
    )
  }
}

// How long the editor waits for a slider or a color to settle before telling
// Home Assistant. Every change it is told of rebuilds the dialog's own copy
// of the card, a second 3D view, so a drag that told it on every step drew
// the flat twice over on every step.
const SETTLE_MS = 250

class DioramaEditor extends ReactHost<CardConfig> {
  private pending: CardConfig | null = null
  private timer: ReturnType<typeof setTimeout> | undefined

  setConfig(config: CardConfig) {
    this._config = migrate(config)
    this.render()
  }

  // The editor itself follows every change at once. Home Assistant hears of
  // the last one once they settle, when the press or the key is let go, and
  // before anything saves.
  private emit = (config: CardConfig) => {
    this._config = config
    this.render()
    this.pending = config
    clearTimeout(this.timer)
    this.timer = setTimeout(this.flush, SETTLE_MS)
  }

  private flush = () => {
    clearTimeout(this.timer)
    const config = this.pending
    if (!config) return
    this.pending = null
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }))
  }

  connectedCallback() {
    super.connectedCallback()
    window.addEventListener('pointerup', this.flush, true)
    window.addEventListener('keyup', this.flush, true)
  }

  disconnectedCallback() {
    // A change still waiting to settle when the dialog closes is sent now,
    // so nothing edited in the last moment is lost.
    this.flush()
    window.removeEventListener('pointerup', this.flush, true)
    window.removeEventListener('keyup', this.flush, true)
    super.disconnectedCallback()
  }

  protected view() {
    return (
      <Editor
        hass={this._hass}
        config={this._config!}
        onChange={this.emit}
        onSave={() => {
          this.flush()
          return persistCard(this)
        }}
      />
    )
  }
}

// Says which version is loaded, the way most custom cards do, so a stale
// card.js in the browser's cache is easy to spot.
console.info(
  `%c DIORAMA %c v${__CARD_VERSION__} `,
  'color: white; background: #3f5f7a; font-weight: bold; border-radius: 4px 0 0 4px',
  'color: #3f5f7a; background: #e6eef5; font-weight: bold; border-radius: 0 4px 4px 0',
)

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, DioramaCard)
if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, DioramaEditor)
// The names the card had before it was renamed, so a dashboard written then
// still finds it. They are left out of the card picker.
if (!customElements.get(OLD_TYPE)) customElements.define(OLD_TYPE, class extends DioramaCard {})
if (!customElements.get(`${OLD_TYPE}-editor`))
  customElements.define(`${OLD_TYPE}-editor`, class extends DioramaEditor {})

// Makes the card show up in the "add card" picker.
// Loaded twice, once as a module and once by a resource of an older
// version, it would otherwise show up twice in the picker.
window.customCards = window.customCards ?? []
if (!window.customCards.some(card => card.type === CARD_TYPE))
  window.customCards.push({
    type: CARD_TYPE,
    name: 'Diorama',
    description: 'Your home as a 3D model, with your devices in it',
    preview: true,
  })

registerTiles()
