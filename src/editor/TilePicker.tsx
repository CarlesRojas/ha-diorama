import { cn } from '#/lib/utils.ts'
import type { AutoCard } from '#/tiles/auto.ts'
import { Icon } from '#/tiles/Icon.tsx'
import { tileOptions, type TileOption } from '#/tiles/index.tsx'
import { GAP_PX, ROW_PX, span } from '#/tiles/sidePanel.ts'
import type { HomeAssistant, TileChoice } from '#/types.ts'
import { useEffect, useRef } from 'react'

// What tells two setups of a card apart: everything in its config but the
// entity, what the panel adds to every tile, the name and icon it shows in
// place of its entity's, and the rows it was made taller or shorter by,
// which leave it the same card.
const PANEL_KEYS = new Set(['entity', 'room_filter', 'never_hide', 'piece_icon', 'invert', 'name', 'icon'])
export function setupKey(config: Record<string, unknown>) {
  const { rows: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const entries = Object.entries({ ...config, grid_options: Object.keys(grid).length > 0 ? grid : undefined }).filter(
    ([key, value]) => !PANEL_KEYS.has(key) && value !== undefined,
  )
  return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)))
}

// The name and icon a widget shows in place of its entity's own.
export type Labels = { name?: string; icon?: string }

export function labelsOf(config: Record<string, unknown> | undefined): Labels {
  const labels: Labels = {}
  if (typeof config?.name === 'string' && config.name) labels.name = config.name
  if (typeof config?.icon === 'string' && config.icon) labels.icon = config.icon
  return labels
}

// A card's setup showing these, an empty one left out so it shows its
// entity's own again.
export function labelled<T extends Record<string, unknown>>(config: T, labels: Labels): T {
  const { name: _, icon: __, ...rest } = config
  return { ...rest, ...labelsOf(labels) } as unknown as T
}

// The rows a card was set to, apart from the ones it takes by itself.
export const setRows = (config: Record<string, unknown> | undefined) => {
  const rows = (config?.grid_options as { rows?: unknown } | undefined)?.rows
  return typeof rows === 'number' ? rows : undefined
}

// A card's setup with its rows set, or left to the card when they are what
// it takes anyway.
export function withRows(config: Record<string, unknown>, rows: number | undefined, own?: number) {
  const { rows: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const next = rows === undefined || rows === own ? grid : { ...grid, rows }
  const { grid_options: __, ...rest } = config
  return Object.keys(next).length > 0 ? { ...rest, grid_options: next } : rest
}

type Choices = { options: TileOption[]; auto: string; current: string }

// The ways an entity's tile can be shown, with the one the panel picks for
// its domain among them, and which of them it shows now.
export function choices(hass: HomeAssistant, auto: AutoCard, chosen: TileChoice | undefined): Choices {
  const entityId = String(auto.entity)
  const options = tileOptions(hass, entityId)
  const autoKey = setupKey(auto)
  if (!options.some(option => setupKey(option.config) === autoKey))
    options.unshift({ name: auto.type.replace(/^custom:dio-/, ''), config: auto })
  return { options, auto: autoKey, current: chosen ? setupKey(chosen) : autoKey }
}

// What to keep in the YAML for an entity's tile set up as given: nothing
// when it is the one the panel picks anyway at the rows it takes by itself,
// with its entity's own name and icon.
export function choiceFor(autoKey: string, config: Record<string, unknown>): TileChoice | undefined {
  const plain = setupKey(config) === autoKey && setRows(config) === undefined
  if (plain && !Object.keys(labelsOf(config)).length) return undefined
  const { entity: _, ...choice } = config
  return choice as TileChoice
}

// Every card of ours the entity can be, each shown as it would be in the
// panel, at the size it takes there, with its name under it. A click on a
// card makes it the only one shown. Several can be shown, each a widget of
// its own in the panel: the plus in the corner of a card not shown adds it
// to the others, and the tick in the corner of one shown takes it away
// again, but for the last one left. Picking the one the panel would pick
// anyway leaves the choice out of the YAML. The widget being edited keeps
// its name and icon whichever card it becomes, and every card shows them.
export function TilePicker({
  hass,
  auto,
  picked,
  editing,
  onChange,
}: {
  hass: HomeAssistant
  auto: AutoCard
  // The cards picked, none for the one the panel picks.
  picked: (TileChoice | undefined)[]
  // Which of them is being edited.
  editing: number
  onChange: (picked: (TileChoice | undefined)[]) => void
}) {
  const { options, auto: autoKey } = choices(hass, auto, undefined)
  const keys = picked.map(choice => setupKey(unstretched(choice ?? auto)))
  const shown = showing(hass, String(auto.entity))
  const labels = labelsOf(picked[editing])
  return (
    <div role="group" aria-label="Widgets" className="grid grid-cols-12 items-start px-1.5 pt-1.5" style={{ gap: `18px ${GAP_PX}px` }}>
      {options.map(option => {
        const key = setupKey(option.config)
        const at = keys.indexOf(key)
        const on = at >= 0
        const only = () => {
          if (!on || picked.length > 1) onChange([choiceFor(autoKey, labelled(option.config, labels))])
        }
        const toggle = () => {
          if (!on) onChange([...picked, choiceFor(autoKey, option.config)])
          else if (picked.length > 1) onChange(picked.filter((_, i) => i !== at))
        }
        // Shown as the panel would show it, with the piece's icon kept.
        const { type: _, size: __, ...kept } = auto
        const plain: AutoCard = {
          ...kept,
          ...labelled(option.config, labels),
          type: String(option.config.type),
          entity: auto.entity,
        }
        const { columns, rows } = span(plain, shown)
        return (
          <div key={key} className="relative flex min-w-0 flex-col" style={{ gridColumn: `span ${columns}` }}>
            <button
              type="button"
              aria-pressed={on}
              aria-label={option.name}
              onClick={only}
              className="group flex min-w-0 cursor-pointer flex-col gap-1.5 text-left outline-none"
            >
              <span className="block transition-[transform,opacity] group-hover:opacity-85 group-focus-visible:opacity-85 group-active:scale-[0.98]">
                <TilePreview hass={shown} config={plain} height={rows === 'auto' ? undefined : rows} />
              </span>
              <span className="flex min-w-0 flex-col px-1">
                <span className={cn('flex items-center gap-1.5 text-xs font-semibold', on && 'text-tint')}>
                  {option.name}
                  {key === autoKey && (
                    <span className="bg-fill-strong text-label-2 rounded px-1 py-px text-[10px] font-medium">Auto</span>
                  )}
                </span>
              </span>
            </button>
            {/* Shown or not, beside the others: a tick on one shown, a plus on
              one that is not. */}
            <button
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-label={on ? `Remove ${option.name}` : `Add ${option.name}`}
              aria-disabled={on && picked.length === 1}
              onClick={toggle}
              className={cn(
                'absolute -top-1.5 -right-1.5 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full shadow-[0_0_0_3px_var(--dio-surface,var(--card-background-color))] transition-[transform,opacity] outline-none hover:opacity-85 focus-visible:opacity-85 active:scale-90',
                on ? 'bg-tint-fill text-white' : 'bg-(--dio-float) text-(--dio-float-icon)',
                on && picked.length === 1 && 'cursor-default',
              )}
            >
              <Icon
                icon={on ? 'ph:check-bold' : 'ph:plus-bold'}
                className="size-3.5 [--mdc-icon-size:14px] [&>svg]:size-full"
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// A card's setup without the width it was stretched to.
export function unstretched(config: Record<string, unknown>): Record<string, unknown> {
  const { columns: _, ...grid } = (config.grid_options ?? {}) as Record<string, unknown>
  const { grid_options: __, ...rest } = config
  return Object.keys(grid).length > 0 ? { ...rest, grid_options: grid } : rest
}

// What a media player plays while it is off, so each card shows all it has.
const SAMPLE_MEDIA = {
  media_title: 'Song title',
  media_artist: 'Artist',
  media_duration: 240,
  media_position: 80,
  volume_level: 0.4,
}

// The states the picker shows its cards with: a media player that is off
// as if it were playing, as most of what its cards have only shows then.
function showing(hass: HomeAssistant, entityId: string): HomeAssistant {
  const entity = hass.states[entityId]
  if (!entityId.startsWith('media_player.') || !entity || !['off', 'standby', 'idle'].includes(entity.state))
    return hass
  const playing = {
    ...entity,
    state: 'playing',
    attributes: { ...SAMPLE_MEDIA, media_position_updated_at: new Date().toISOString(), ...entity.attributes },
  }
  return { ...hass, states: { ...hass.states, [entityId]: playing } }
}

type Card = HTMLElement & { setConfig: (config: unknown) => void; hass: HomeAssistant; preview: boolean }

// One of our cards, live with the entity's state but out of reach, so a
// press on it picks it rather than working it.
export function TilePreview({
  hass,
  config,
  height,
}: {
  hass: HomeAssistant
  config: Record<string, unknown>
  height?: number
}) {
  const holder = useRef<HTMLSpanElement>(null)
  const card = useRef<Card | null>(null)
  const setup = JSON.stringify(config)

  useEffect(() => {
    const type = String(config.type).replace(/^custom:/, '')
    const element = document.createElement(type) as Card
    try {
      element.setConfig(config)
    } catch {
      return
    }
    element.preview = true
    element.hass = hass
    element.style.display = 'block'
    element.style.height = '100%'
    card.current = element
    holder.current!.replaceChildren(element)
    return () => {
      card.current = null
      element.remove()
    }
    // The card is made again only when its setup changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup])

  useEffect(() => {
    if (card.current) card.current.hass = hass
  }, [hass])

  return (
    <span
      ref={holder}
      inert
      className="pointer-events-none block"
      style={height ? { height: `calc(${height * ROW_PX}px + ${height - 1} * ${GAP_PX}px)` } : undefined}
    />
  )
}
