import type { CardConfig, ScreenConfig } from '#/types.ts'

// Each screen the card is seen on, like a phone or a tablet on the wall,
// can have its own sizes, and its own follow, in the card's config. A screen
// is known by an id it is given the first time and keeps in its own storage,
// so it stays the same across dashboards and reloads, and differs from every
// other screen.
const KEY = 'diorama-screen'

let id: string | null = null

export function screenId(): string {
  if (id) return id
  try {
    id = localStorage.getItem(KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2, 8)
      localStorage.setItem(KEY, id)
    }
  } catch {
    // Kept for this page only, when the browser keeps nothing.
    id ??= Math.random().toString(36).slice(2, 8)
  }
  return id
}

// A name for this screen, to tell it apart in the YAML. It can be changed
// there, since only the id is looked at.
export function screenName(): string {
  const touch = matchMedia('(pointer: coarse)').matches
  if (!touch) return 'Computer'
  return Math.min(screen.width, screen.height) < 600 ? 'Phone' : 'Tablet'
}

// This screen's own settings, if it has any.
export const thisScreen = (config: CardConfig): ScreenConfig | undefined => config.screens?.[screenId()]

// The config with this screen's settings changed, leaving out what is empty so
// the YAML stays as short as it was.
export function withScreen(config: CardConfig, change: Partial<ScreenConfig>): CardConfig {
  const { screens = {}, ...rest } = config
  const { [screenId()]: before, ...others } = screens
  const next: ScreenConfig = { name: before?.name ?? screenName(), ...before, ...change }
  for (const key of ['width', 'height', 'follow'] as const) if (next[key] === undefined) delete next[key]
  const empty = next.width === undefined && next.height === undefined && next.follow === undefined
  const all = empty ? others : { ...others, [screenId()]: next }
  return Object.keys(all).length ? { ...rest, screens: all } : rest
}
