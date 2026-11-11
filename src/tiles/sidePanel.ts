import { aspectRatioCss } from '#/lib/aspect.ts'
import { closest, closestClass, inPanelView } from '#/lib/panelView.ts'
import { onRoomFilter, roomFilter } from '#/lib/roomFilter.ts'
import { thisScreen } from '#/lib/screen.ts'
import { autoGroups } from '#/tiles/auto.ts'
import type { CardConfig as PlanConfig, HomeAssistant } from '#/types.ts'

type CardConfig = {
  type: string
  size?: string
  grid_options?: { columns?: number | 'full'; rows?: number | 'auto' }
  [key: string]: unknown
}

// Whether a grid of sections gives the card a set height, from its rows,
// rather than letting it grow to fit.
const setHeight = (element: HTMLElement) => !!closestClass(element, 'fit-rows')

const PLAN_TYPE = 'custom:diorama-card'
export const SIDE_PANEL = 'dio-side-panel'

// Below this width the panel goes under the diorama, which then takes the
// whole width.
const STACK_PX = 900

type HuiCard = HTMLElement & {
  config: CardConfig
  hass: HomeAssistant
  preview: boolean
  load?: () => void
  setConfig?: (config: CardConfig) => void
}

export const ROW_PX = 56
export const GAP_PX = 10

// How long the tiles take to fade out of a room, and the next room's to
// fade in, in milliseconds.
const FADE_OUT_MS = 140
const FADE_IN_MS = 220
// What a floor in view with no room is kept as, in place of a room's id.
const FLOOR_KEY = 'floor:'

// How many of the 12 columns and how many rows a side card takes, read from
// its config so the layout is known before the card has loaded. One of our
// cards says so itself, as it would to Home Assistant's grid, with how
// narrow and how short it can be made, when it can be made smaller, or that
// it is fixed at its size.
type Grid = {
  columns?: number | 'full'
  rows?: number | 'auto'
  min_columns?: number
  min_rows?: number
  fixed?: boolean
}
type Sized = { prototype: { getGridOptions?: (this: object) => Grid } }
export function span(config: CardConfig, hass: HomeAssistant | null) {
  const own = config.grid_options
  const type = config.type.replace(/^custom:/, '')
  const element = /^(dio|fp)-/.test(type) ? (customElements.get(type) as Sized | undefined) : undefined
  const grid = element?.prototype.getGridOptions?.call({ _config: config, _hass: hass }) ?? {}
  const columns = own?.columns ?? grid.columns ?? 12
  const rows = own?.rows ?? grid.rows ?? 'auto'
  return {
    columns: columns === 'full' ? 12 : Math.min(12, columns),
    rows,
    minColumns: grid.min_columns,
    minRows: grid.min_rows,
    fixed: grid.fixed === true,
  }
}

const CSS = `
:host {
  display: block;
  height: 100%;
  --_gap: var(--dio-tile-gap, var(--fp-tile-gap, ${GAP_PX}px));
}
.split {
  display: grid;
  grid-template-columns: var(--_columns, 2fr 1fr);
  gap: 24px;
  box-sizing: border-box;
  height: calc(100vh - var(--_reserved, calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px))));
  height: calc(100dvh - var(--_reserved, calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px))));
  padding: 0 24px 0 8px;
}
.main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
/* The diorama fills its column, which sets its shape. */
.main[data-fill] {
  justify-content: stretch;
}
.main[data-fill] > hui-card,
.main[data-fill] > hui-card > * {
  display: block;
  height: 100%;
}
.side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  /* Room on both sides for a tile that grows in focus, which the scrolling
     would otherwise clip, while the tiles stay where they were. */
  margin-inline: -12px;
  padding-inline: 12px;
  overflow-y: auto;
  scrollbar-width: none;
  /* Tiles scrolled past an edge fade into the background rather than
     being cut off there. Each fade is as tall as the room the tiles keep
     at that end, so at rest it falls on nothing. */
  --_fade-top: 24px;
  --_fade-bottom: 24px;
  mask-image: linear-gradient(
    to bottom,
    transparent,
    #000 var(--_fade-top),
    #000 calc(100% - var(--_fade-bottom)),
    transparent
  );
}
.side::-webkit-scrollbar {
  display: none;
}
/* Centered while it fits, scrolling from the top once it does not. */
.cards {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: var(--_gap);
  margin-block: auto;
  padding-block: 24px;
}
.cards > hui-card[data-sized] > * {
  display: block;
  height: 100%;
}
.cards > [hidden],
.cards > [data-off],
.cards > [data-away] {
  display: none;
}
.empty {
  grid-column: 1 / -1;
  padding: 24px 4px;
  color: var(--primary-text-color, #fff);
  font-family: var(--dio-font-tile, var(--fp-font-tile, 'Inter', system-ui, sans-serif));
  font-size: 15px;
  text-align: center;
  opacity: 0.6;
}
/* Anywhere but a panel view the diorama keeps its own shape and the
   panel beside it scrolls within the same height. */
.split:not([data-panel]) {
  height: auto;
  padding: 0;
}
.split:not([data-panel]):not([data-stacked]) .side {
  contain: size;
}
/* Stacked, the tiles start right under the diorama, with no space
   kept between them past what the heading has of its own. */
.split[data-stacked] {
  grid-template-columns: 1fr;
  gap: 0;
  height: auto;
  padding: 0;
}
.split[data-stacked] .main[data-fill] {
  aspect-ratio: var(--_stacked-aspect, 1 / 1);
}
/* In a card given a set height, the tiles under the diorama take what
   they need of it, up to all but 45% left to the diorama, and scroll
   in that rather than spill over what is under the card. */
.split[data-fit] {
  height: 100%;
  grid-template-rows: minmax(45%, 1fr) minmax(0, auto);
}
.split[data-fit] .main[data-fill] {
  aspect-ratio: auto;
}
/* With this screen's own share of the height, a panel view keeps the
   diorama at that part of the screen and the tiles scroll in the rest. */
.split[data-panel][data-stacked][data-rows] {
  height: calc(100vh - var(--_reserved, calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px))));
  height: calc(100dvh - var(--_reserved, calc(var(--header-height, 56px) + env(safe-area-inset-top, 0px))));
  grid-template-rows: var(--_rows);
}
.split[data-panel][data-stacked][data-rows] .main[data-fill] {
  aspect-ratio: auto;
}
.split[data-stacked] .side {
  margin-inline: 0;
  padding-inline: 0;
  --_fade-top: 0px;
}
.split[data-stacked] .cards {
  padding: 0 12px 24px;
}
`

// The diorama card with its side panel on: the diorama, drawn again
// without one, on the left two thirds and the tiles on the right third,
// centered. Every child goes in Home Assistant's own hui-card, which hides
// it when the tile hides itself.
export class SidePanel extends HTMLElement {
  private _config: PlanConfig | null = null
  private _hass: HomeAssistant | null = null
  private _preview = false
  private main: HuiCard | null = null
  private side: HuiCard[] = []
  private root: HTMLDivElement
  private mainSlot: HTMLDivElement
  private sideSlot: HTMLDivElement
  private cardsSlot: HTMLDivElement
  private empty: HTMLDivElement
  private observer: ResizeObserver
  private unsubscribe: (() => void) | null = null
  private panel = false
  // Whether the diorama fills what the tiles under it leave of a card of
  // a set height, rather than keeping its own shape.
  private fit = false
  // The room whose tiles show, null for the whole home, and undefined
  // before any show.
  private shown: string | null | undefined = undefined
  private fade: Animation | null = null
  private fadingOut = false

  constructor() {
    super()
    const shadow = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = CSS
    shadow.appendChild(style)
    this.root = document.createElement('div')
    this.root.className = 'split'
    this.mainSlot = document.createElement('div')
    this.mainSlot.className = 'main'
    const side = document.createElement('div')
    side.className = 'side'
    this.sideSlot = side
    this.cardsSlot = document.createElement('div')
    this.cardsSlot.className = 'cards'
    this.empty = document.createElement('div')
    this.empty.className = 'empty'
    this.empty.textContent = 'Nothing to control here'
    side.appendChild(this.cardsSlot)
    this.root.append(this.mainSlot, side)
    shadow.appendChild(this.root)
    // Caught on the way down, before a hui-card can stop it.
    this.cardsSlot.addEventListener('card-visibility-changed', () => queueMicrotask(() => this.updateEmpty()), true)
    this.observer = new ResizeObserver(() => {
      this.updateStacked()
      this.updateReserved()
    })
  }

  setConfig(config: PlanConfig) {
    if (config === this._config) return
    this._config = config
    // Over the tiles, the diorama takes the card's shape on a phone.
    this.root.style.setProperty('--_stacked-aspect', aspectRatioCss(config.aspect_ratio_mobile, '1 / 1'))
    // This screen's own share for the diorama, beside the tiles and over them.
    const { width, height } = thisScreen(config) ?? {}
    if (width) this.root.style.setProperty('--_columns', `minmax(0, ${width}fr) minmax(0, ${100 - width}fr)`)
    else this.root.style.removeProperty('--_columns')
    if (height) this.root.style.setProperty('--_rows', `minmax(0, ${height}fr) minmax(0, ${100 - height}fr)`)
    else this.root.style.removeProperty('--_rows')
    this.root.toggleAttribute('data-rows', !!height)
    void this.build()
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass
    for (const card of this.cards()) card.hass = hass
  }

  get hass() {
    return this._hass as HomeAssistant
  }

  set preview(preview: boolean) {
    this._preview = preview
    for (const card of this.cards()) card.preview = preview
  }

  get preview() {
    return this._preview
  }

  connectedCallback() {
    const panel = inPanelView(this)
    this.root.toggleAttribute('data-panel', panel)
    if (panel !== this.panel) {
      this.panel = panel
      if (this._config) void this.build()
    }
    this.observer.observe(this)
    this.updateStacked()
    this.updateReserved()
    window.addEventListener('resize', this.onResize)
    this.unsubscribe ??= onRoomFilter(() => this.updateRoom())
    this.updateRoom()
  }

  disconnectedCallback() {
    this.observer.disconnect()
    window.removeEventListener('resize', this.onResize)
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private cards() {
    return this.main ? [this.main, ...this.side] : this.side
  }

  private async build() {
    const config = this._config!
    await customElements.whenDefined('hui-card')
    if (config !== this._config) return
    // In a panel view the diorama fills its column, at the full height of
    // the screen. Anywhere else it keeps the shape it is given.
    const fill = this.panel || this.fit
    this.mainSlot.toggleAttribute('data-fill', fill)
    const main: CardConfig = { ...config, type: PLAN_TYPE, side_panel: false }
    if (fill) main.aspect_ratio = 'fill'
    // The diorama already there takes the new config as it is, so a
    // change to the tiles, like their order, leaves its camera where it is
    // rather than opening it again on the whole home. Home Assistant would
    // build it anew while the dashboard is edited.
    const plan = this.main?.firstElementChild as (HTMLElement & { setConfig?: (c: CardConfig) => void }) | null
    // One that will not take it is built anew, to show Home Assistant's error.
    let kept = false
    if (plan?.setConfig && plan.localName === PLAN_TYPE.replace(/^custom:/, '')) {
      try {
        plan.setConfig(main)
        kept = true
      } catch {
        // Left to the new one below.
      }
    }
    if (!kept) {
      this.main = this.create(main)
      this.mainSlot.replaceChildren(this.main)
    }
    // Each card knows its room, so only the room in view shows.
    const children = autoGroups(config).flatMap(group => group.cards.map(card => ({ card, room: group.room })))
    this.side = children.map(({ card: child, room }) => {
      const card = this.create(child)
      const { columns, rows } = span(child, this._hass)
      card.style.gridColumn = `span ${columns}`
      card.toggleAttribute('data-sized', rows !== 'auto')
      if (rows !== 'auto') card.style.height = `calc(${rows * ROW_PX}px + ${rows - 1} * var(--_gap))`
      if (room) card.dataset.room = room
      else card.dataset.home = ''
      return card
    })
    this.cardsSlot.replaceChildren(...this.side, this.empty)
    this.updateRoom()
  }

  private create(config: CardConfig) {
    const card = document.createElement('hui-card') as HuiCard
    if (this._hass) card.hass = this._hass
    card.preview = this._preview
    // Older Home Assistant, such as 2024.6, builds the card in setConfig and
    // has no load, so the side panel came up empty there.
    if (typeof card.load === 'function') {
      card.config = config
      card.load()
    } else card.setConfig?.(config)
    return card
  }

  // A change of room fades the tiles of the one before out and those of
  // the next one in, unless the panel cannot be seen or asks for no motion.
  // A floor in view with no room counts as a room of its own here, so going
  // from one floor to another fades the tiles over too.
  private updateRoom() {
    const filter = roomFilter()
    const room = filter?.room_id ?? (filter?.floor ? `${FLOOR_KEY}${filter.floor.id}` : null)
    const before = this.shown
    this.shown = room
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (
      before === undefined ||
      before === room ||
      still ||
      !this.isConnected ||
      !this.cardsSlot.getClientRects().length
    ) {
      if (before !== room) this.cancelFade()
      return this.showRoom(room)
    }
    // Fading out already, it shows whichever room is in view once it is done.
    if (this.fadingOut) return
    this.cancelFade()
    this.fadingOut = true
    const out = this.cardsSlot.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(6px)' }], {
      duration: FADE_OUT_MS,
      easing: 'ease-in',
      fill: 'forwards',
    })
    this.fade = out
    out.onfinish = () => {
      this.fadingOut = false
      // The room may have changed again while this one faded out.
      this.showRoom(this.shown ?? null)
      this.sideSlot.scrollTop = 0
      this.fade = this.cardsSlot.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1 }], {
        duration: FADE_IN_MS,
        easing: 'ease-out',
      })
      out.cancel()
    }
  }

  private cancelFade() {
    this.fade?.cancel()
    this.fade = null
    this.fadingOut = false
  }

  // A card is away while another room is in view. With the home's own
  // tiles set, they are all the whole home shows, unless it keeps the
  // rooms' too, and they go away once a room is in view.
  // On a floor with no room in view, the rooms of the other floors are away.
  private showRoom(shown: string | null) {
    const room = shown?.startsWith(FLOOR_KEY) ? null : shown
    const floor = room ? undefined : roomFilter()?.floor
    const home = this._config?.home?.show_rooms !== true && this.side.some(card => card.dataset.home !== undefined)
    for (const card of this.side) {
      const elsewhere = !!floor && !!card.dataset.room && !floor.rooms.includes(card.dataset.room)
      const away =
        card.dataset.home !== undefined
          ? !!room
          : room
            ? !!card.dataset.room && card.dataset.room !== room
            : home || elsewhere
      card.toggleAttribute('data-away', away)
    }
    this.updateEmpty()
  }

  // A card is off when its hui-card is hidden, or the card inside it is.
  private updateEmpty() {
    let any = false
    for (const card of this.side) {
      const off = card.hidden === true || (card.firstElementChild as HTMLElement | null)?.hidden === true
      card.toggleAttribute('data-off', off)
      any ||= !off && !card.hasAttribute('data-away')
    }
    this.empty.hidden = any
  }

  private onResize = () => this.updateReserved()

  // In a panel view the diorama and the panel fill the screen below the
  // header. The space they leave is measured rather than assumed, since the
  // header grows a row of tabs while the dashboard is edited, and the bar
  // with the edit button sits under the card then.
  private updateReserved() {
    if (!this.panel) return this.root.style.removeProperty('--_reserved')
    const options = closest(this, 'hui-card-options')
    const card = options?.shadowRoot?.querySelector('.card')
    const below = card ? Math.max(0, options!.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom) : 0
    const above = this.getBoundingClientRect().top + window.scrollY
    this.root.style.setProperty('--_reserved', `${Math.round(above + below)}px`)
  }

  // A card given a set height, like one a grid of sections sizes to its
  // rows, has the panel under the diorama fit in it, and the diorama
  // fills what the tiles leave, so nothing spills over what is under it.
  private updateStacked() {
    const stacked = this.clientWidth > 0 && this.clientWidth < STACK_PX
    this.root.toggleAttribute('data-stacked', stacked)
    const fit = stacked && !this.panel && setHeight(this)
    this.root.toggleAttribute('data-fit', fit)
    if (fit !== this.fit) {
      this.fit = fit
      if (this._config) void this.build()
    }
  }
}

if (!customElements.get(SIDE_PANEL)) customElements.define(SIDE_PANEL, SidePanel)
