import { entityArea } from '#/devices/catalog.ts'
import { injectProperties, ReactHost } from '#/host.tsx'
import { onRoomFilter, roomFilter } from '#/lib/roomFilter.ts'
import type { ActionConfig } from '#/tiles/actions.ts'
import { isWide, tileRows } from '#/tiles/features/index.tsx'
import tilesCss from '#/tiles/tiles.css?inline'
import type { HomeAssistant } from '#/types.ts'

// What every tile's config can hold, on top of its own options.
export type TileConfig = {
  type: string
  entity?: string
  name?: string
  icon?: string
  // The icon of the piece on the plan the tile stands for, which the icon
  // set for the entity in Home Assistant takes over.
  piece_icon?: string
  // The color the icon takes while the tile is on, any CSS color.
  color?: string
  // Replaces the line under the name.
  state_text?: string
  // Large only means something to the weather tile.
  size?: 'small' | 'wide' | 'large'
  // A row of controls along the bottom, like a brightness slider or the
  // modes of an alarm, by the names Home Assistant gives its own tile
  // features. It makes the tile a row taller.
  feature?: string
  // The positions in percent a favorite positions feature offers.
  favorites?: number[]
  // The area the tile belongs to for the room filter, when its entity's
  // own is not the right one.
  area?: string
  // How the tile follows the room in view. hide and show are what a tile
  // with no area does while a room is in view. room shows the tile only
  // while its own room is in view, home only while the whole home is.
  room_filter?: 'hide' | 'show' | 'room' | 'home'
  // Keeps the tile showing whatever room is in view, like room_filter show.
  never_hide?: boolean
  tap_action?: ActionConfig
  hold_action?: ActionConfig
  haptic?: boolean
  // Acts only on a second tap, so a stray one never does. Only buttons and
  // tiles that turn on and off read it.
  confirm?: boolean
  grid_options?: GridOptions
}

export type GridOptions = {
  columns?: number | 'full'
  rows?: number | 'auto'
  min_columns?: number
  max_columns?: number
  min_rows?: number
  // Ours alone: a card that always takes the size it says, never made
  // narrower, wider, shorter or taller in the side panel's editor.
  fixed?: boolean
}

const FONTS_ID = 'dio-tiles-fonts'
const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&family=Inter+Tight:wght@500..800&display=swap'

// Like the card's own fonts, these must be in the document to apply.
function injectFonts() {
  if (document.getElementById(FONTS_ID)) return
  const link = document.createElement('link')
  link.id = FONTS_ID
  link.rel = 'stylesheet'
  link.href = FONTS_URL
  document.head.appendChild(link)
}

// Tiles with no area are told of once, in one list, the first time a room
// filter would have needed it.
const missing = new Set<string>()
let missingTimer: ReturnType<typeof setTimeout> | undefined
let missingNew: string[] = []
function noteMissingArea(label: string) {
  if (missing.has(label)) return
  missing.add(label)
  missingNew.push(label)
  clearTimeout(missingTimer)
  missingTimer = setTimeout(() => {
    console.warn(
      `Diorama tiles: no area found for ${missingNew.join(', ')}. Set area on these cards, or never_hide: true to keep them in every room.`,
    )
    missingNew = []
  }, 500)
}

// Accepts an area's id or its name.
export function resolveArea(hass: HomeAssistant, area: string | undefined, entityId: string | undefined) {
  if (area) {
    if (hass.areas[area]) return area
    const named = Object.values(hass.areas).find(a => a.name.toLowerCase() === area.toLowerCase())
    return named?.area_id ?? area
  }
  return entityId ? entityArea(hass, entityId) : null
}

// A section of a dashboard about as wide as Home Assistant makes one, in
// twelve columns with a gap between each, and the height of one of its rows.
const SECTION_WIDTH = 360
const GRID_GAP = 8
const ROW_HEIGHT = 56

// The states of an entity that is not in use.
const IDLE = ['off', 'standby', 'idle', 'unavailable', 'unknown']

export function stubEntity(hass: HomeAssistant | undefined, domains: string[]) {
  const ids = Object.keys(hass?.states ?? {})
  // One in use first, like a player that is playing, so the preview shows
  // its controls.
  const idle = (id: string) => IDLE.includes(hass!.states[id].state)
  // Domain by domain in the card's order, so a toggle shows a light first.
  for (const domain of domains) {
    const all = ids.filter(id => id.split('.')[0] === domain)
    const id = all.find(id => !idle(id)) ?? all[0]
    if (id) return id
  }
}

// The base of every tile. It follows the diorama card's room filter:
// a tile whose area is not the room in view hides itself and tells Home
// Assistant, which takes it out of the grid and folds a section left with
// nothing showing. It stays connected while hidden, so it hears when to
// come back.
export abstract class TileHost<C extends TileConfig> extends ReactHost<C> {
  // Read by Home Assistant's hui-card.
  connectedWhileHidden = true
  // Which entity domains this tile takes, 'any' for an entity of any
  // domain, or null for no entity at all.
  protected abstract readonly domains: string[] | 'any' | null
  private _preview = false
  private unsubscribe: (() => void) | null = null
  private pickerBox: ResizeObserver | null = null

  constructor() {
    super()
    injectFonts()
    injectProperties(tilesCss, 'diorama-tiles-properties')
    const style = document.createElement('style')
    style.textContent = tilesCss
    this.shadowRoot!.appendChild(style)
  }

  setConfig(config: C) {
    if (this.domains) {
      if (!config.entity) throw new Error('entity is required')
      const domain = config.entity.split('.')[0]
      if (this.domains !== 'any' && !this.domains.includes(domain))
        throw new Error(`${config.entity} is not one of ${this.domains.map(d => `${d}.*`).join(', ')}`)
    }
    if (config.size && !['small', 'wide', 'large'].includes(config.size))
      throw new Error('size must be small, wide or large')
    if (config.room_filter && !['hide', 'show', 'room', 'home'].includes(config.room_filter))
      throw new Error('room_filter must be hide, show, room or home')
    this._config = config
    this.applyFilter()
    this.fitPicker()
    this.render()
  }

  getCardSize(): number {
    return this._config ? tileRows(this._config, this._hass?.states[this._config.entity ?? '']) : 2
  }

  getGridOptions(): GridOptions {
    const rows = this._config ? tileRows(this._config, this._hass?.states[this._config.entity ?? '']) : 2
    return {
      columns: this._config && isWide(this._config, this._hass?.states[this._config.entity ?? '']) ? 12 : 6,
      rows,
    }
  }

  // Set by Home Assistant while the dashboard is edited, when every card
  // shows whatever the filter says.
  set preview(preview: boolean) {
    this._preview = preview
    this.applyFilter()
  }

  get preview() {
    return this._preview
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass
    this.toggleAttribute('data-light', hass.themes?.darkMode === false)
    this.applyFilter()
    this.fitPicker()
    this.render()
  }

  get hass() {
    return this._hass as HomeAssistant
  }

  connectedCallback() {
    super.connectedCallback()
    this.unsubscribe ??= onRoomFilter(() => this.applyFilter())
    this.applyFilter()
    const box = this.pickerPreview()
    if (box) {
      this.pickerBox = new ResizeObserver(() => this.fitPicker())
      this.pickerBox.observe(box)
    }
  }

  disconnectedCallback() {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.pickerBox?.disconnect()
    this.pickerBox = null
    super.disconnectedCallback()
  }

  // The box Home Assistant shows the card in while a card is picked, by
  // card or as a suggestion for an entity, where the card sits in a hui-card.
  private pickerPreview() {
    const box = this.parentElement?.localName === 'hui-card' ? this.parentElement.parentElement : this.parentElement
    const picker = (box?.getRootNode() as ShadowRoot | undefined)?.host?.localName
    return box?.classList.contains('preview') && (picker === 'hui-card-picker' || picker === 'hui-suggestion-card')
      ? box
      : null
  }

  // Home Assistant's card picker shows each card in a narrow box that gives
  // it no height. There the card takes the width and rows it would in a
  // section and shrinks to fit the box, so it looks as it will once added.
  private fitPicker() {
    const box = this.pickerPreview()
    if (!this.pickerBox || !box || !this._config) return
    const { columns: wanted, rows } = { ...this.getGridOptions(), ...this._config.grid_options }
    const columns = typeof wanted === 'number' ? Math.min(wanted, 12) : 12
    const column = (SECTION_WIDTH - 11 * GRID_GAP) / 12
    const width = columns * column + (columns - 1) * GRID_GAP
    this.style.width = `${width}px`
    this.style.marginInline = 'auto'
    this.style.height = typeof rows === 'number' ? `${rows * ROW_HEIGHT + (rows - 1) * GRID_GAP}px` : ''
    this.style.zoom = `${Math.min(1, box.clientWidth / width)}`
  }

  protected area() {
    if (!this._hass || !this._config) return null
    return resolveArea(this._hass, this._config.area, this._config.entity)
  }

  private visible() {
    if (!this._config || !this._hass || this._preview) return true
    // A diorama card that leaves the dashboard's tiles alone shows them
    // the whole home whatever room it is in.
    const filter = roomFilter()?.tiles ? roomFilter() : null
    const mode = this._config.room_filter
    if (this._config.never_hide || mode === 'show') return true
    // A floor in view with no room is the home, seen one floor at a time:
    // only a tile of an area that is on another floor alone steps aside.
    const home = !filter?.room_id
    if (mode === 'home') return home
    if (home) {
      if (mode === 'room') return false
      const away = filter?.floor?.away
      if (!away?.length) return true
      const area = this.area()
      return !area || !away.includes(area)
    }
    if (!filter) return mode !== 'room'
    // A room with no area matches no tile.
    if (!filter.area_id) return mode !== 'room'
    const area = this.area()
    if (area) return area === filter.area_id
    if (mode === 'room') return false
    const { type, entity, name, title } = this._config as C & { title?: string }
    noteMissingArea(entity ?? `${type} ${name ?? title ?? ''}`.trim())
    return false
  }

  private applyFilter() {
    const visible = this.visible()
    if (this.hidden === !visible) return
    this.hidden = !visible
    this.dispatchEvent(
      new CustomEvent('card-visibility-changed', { detail: { value: visible }, bubbles: true, composed: true }),
    )
  }
}
