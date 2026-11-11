import { field } from '#/editor/look.ts'
import { cn } from '#/lib/utils.ts'
import { Icon } from '#/tiles/Icon.tsx'
import { PHOSPHOR_ICONS } from '#/tiles/icons.ts'
import { faChevronDown, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useRef, useState } from 'react'

// The Phosphor icons bundled with the tiles.
const ICONS = PHOSPHOR_ICONS.map(name => `ph:${name}`)

// Any icon Home Assistant knows, written in full, like mdi:silverware.
const WRITTEN = /^[a-z0-9-]+:[a-z0-9-]+$/

// A button showing the icon picked, or the one the widget shows by itself
// when none is, that opens the bundled icons right under it. Typing narrows
// them down by name, and an icon written in full, like mdi:silverware, can
// be picked too, for any icon Home Assistant knows. Default, beside the
// search, goes back to the widget's own.
export function IconPicker({
  value,
  fallback,
  onChange,
}: {
  // The icon picked, none for the widget's own.
  value: string | undefined
  // The icon the widget shows by itself.
  fallback: string
  onChange: (icon: string | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const list = useRef<HTMLDivElement>(null)
  // Opened on the icon picked, wherever it is in the list, which scrolls
  // alone so the dialog stays where it is.
  useEffect(() => {
    const box = list.current
    const picked = box?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (box && picked) box.scrollTop = picked.offsetTop - (box.clientHeight - picked.offsetHeight) / 2
  }, [open])
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = ICONS.filter(icon => words.every(word => icon.includes(word)))
  const written = query.trim().toLowerCase()
  const typed = WRITTEN.test(written) && !ICONS.includes(written) ? written : null
  const pick = (icon: string | undefined) => {
    onChange(icon)
    setOpen(false)
    setQuery('')
  }

  const cell = (selected: boolean) =>
    cn(
      'hover:bg-fill-strong flex aspect-square cursor-pointer items-center justify-center rounded-lg text-(--primary-text-color) transition-[background-color,transform] active:scale-90',
      selected && 'bg-tint-fill hover:bg-tint-fill text-white',
    )
  const glyph = 'size-5 [--mdc-icon-size:20px] [&>svg]:size-full'

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Icon, ${value ?? 'default'}`}
        onClick={() => setOpen(!open)}
        className={cn(field, 'flex cursor-pointer items-center gap-2 text-left')}
      >
        <Icon
          icon={value ?? fallback}
          className={cn('size-4 [--mdc-icon-size:16px] [&>svg]:size-full', !value && 'opacity-60')}
        />
        <span className={cn('min-w-0 flex-1 truncate', !value && 'text-label-2')}>{value ?? 'Default'}</span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={cn('text-label-2 size-3 transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          <div className="flex min-w-0 gap-2">
            <label className="bg-fill-strong focus-within:ring-tint/30 flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 transition-shadow focus-within:ring-3">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-label-2 size-3" />
              <input
                type="text"
                autoFocus
                value={query}
                placeholder="Search, or type mdi:silverware"
                aria-label="Search icons"
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') setOpen(false)
                  if (event.key === 'Enter' && (typed ?? matches[0])) pick(typed ?? matches[0])
                }}
                className="placeholder:text-label-2 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
              />
            </label>
            <button
              type="button"
              aria-pressed={!value}
              onClick={() => pick(undefined)}
              className={cn(
                'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors',
                value ? 'bg-fill-strong hover:bg-fill-stronger' : 'bg-tint-fill text-white',
              )}
            >
              <Icon icon={fallback} className="size-4 [--mdc-icon-size:16px] [&>svg]:size-full" />
              Default
            </button>
          </div>
          <div
            ref={list}
            role="listbox"
            aria-label="Icons"
            className="relative grid max-h-56 grid-cols-[repeat(auto-fill,minmax(36px,1fr))] gap-1 overflow-y-auto"
          >
            {typed && (
              <button
                type="button"
                role="option"
                aria-selected={value === typed}
                title={typed}
                onClick={() => pick(typed)}
                className={cell(value === typed)}
              >
                <Icon icon={typed} className={glyph} />
              </button>
            )}
            {matches.map(icon => (
              <button
                key={icon}
                type="button"
                role="option"
                aria-selected={value === icon}
                title={icon.slice(3)}
                onClick={() => pick(icon)}
                className={cell(value === icon)}
              >
                <Icon icon={icon} className={glyph} />
              </button>
            ))}
          </div>
          {typed && <p className="text-label-2 text-xs">Press Enter, or pick the first icon, to use {typed}.</p>}
          {!typed && !matches.length && <p className="text-label-2 text-xs">No icon by that name.</p>}
        </div>
      )}
    </div>
  )
}
