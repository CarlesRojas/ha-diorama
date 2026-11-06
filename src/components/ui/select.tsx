import { cn } from '#/lib/utils.ts'
import { field, floating } from '#/editor/look.ts'
import { faCheck, faChevronDown, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

// Select in the shadcn style, for the same reason the context menu is: the
// fullscreen editor stops pointer and key events at its boundary, so a
// library that dismisses through plain document listeners never hears them.
// A native select is no good here either, since an option can hold only
// text, and a device has to show the controls it offers and the pieces it
// already drives alongside its name.
//
// A long list searches itself, the way shadcn's combobox does: a box at the
// top of the panel filters as you type, the arrow keys walk what is left and
// Enter takes it. A home with fifty lights is not a list worth scrolling.

// How many options it takes before the search box is worth the room.
const SEARCH_FROM = 7

export type SelectOption = {
  value: string
  label: string
  // Shown at the end of the row the label is on, for example the controls a
  // device offers.
  badge?: ReactNode
  // Shown under the label, indented beneath it, for example the pieces a
  // device already drives.
  detail?: ReactNode
  // Matched by the search as well as the label, for example an entity id.
  keywords?: string
  // Listed but not taken, for example an area another room already has.
  disabled?: boolean
  // The area the option belongs to, for example the area a device is in.
  area?: string
  // The device the option belongs to, for example the device a piece is driving.
  device?: string
}

type Props = {
  value: string
  options: SelectOption[]
  placeholder?: string
  searchPlaceholder?: string
  onChange: (value: string) => void
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export function Select({
  value,
  options,
  placeholder = 'None',
  searchPlaceholder = 'Search',
  onChange,
  className,
  style,
  ...rest
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [drop, setDrop] = useState<{ x: number; y: number; width: number } | null>(null)
  const current = options.find(o => o.value === value)

  const searchable = options.length >= SEARCH_FROM
  const q = query.trim().toLowerCase()
  const shown =
    searchable && q ? options.filter(o => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q)) : options

  // The list is fixed rather than absolute, so the sidebar's own scrolling
  // does not clip it. That means placing it by hand, above the trigger when
  // there is no room below.
  useLayoutEffect(() => {
    if (!open || !box.current) {
      setDrop(null)
      return
    }
    const rect = box.current.getBoundingClientRect()
    const height = list.current?.getBoundingClientRect().height ?? 0
    const below = window.innerHeight - rect.bottom
    const above = height > below && rect.top > below
    setDrop({ x: rect.left, y: above ? Math.max(rect.top - height - 4, 8) : rect.bottom + 4, width: rect.width })
  }, [open, shown.length])

  // Opening puts the caret in the search box, so the list can be narrowed
  // without reaching for it.
  useEffect(() => {
    if (open) search.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const path = e.composedPath()
      if (box.current && path.includes(box.current)) return
      if (list.current && path.includes(list.current)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Without preventDefault the browser still reads Escape as a request
      // to close the dialog the editor lives in, and the whole editor goes.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', away, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  // The arrows walk the list and Enter takes what they are on, so the whole
  // thing works without leaving the search box.
  const onSearchKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (shown.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : shown.length - 1
      setActive(at => (at + step) % shown.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (shown[active] && !shown[active].disabled) pick(shown[active].value)
    }
  }

  return (
    <div className="relative min-w-0" ref={box}>
      <button
        type="button"
        aria-label={rest['aria-label']}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          // Every opening starts over, with nothing typed and the first row
          // under the arrows.
          if (!open) {
            setQuery('')
            setActive(0)
          }
          setOpen(!open)
        }}
        style={style}
        className={cn(field, 'flex w-full items-center gap-2 text-left', open && 'ring-tint/30 ring-3', className)}
      >
        <span className={cn('min-w-0 flex-1 truncate', !current && 'text-label-2')}>
          {current?.label ?? placeholder}
        </span>
        <FontAwesomeIcon icon={faChevronDown} className="text-label-2 size-2.5 shrink-0" />
      </button>
      {open && (
        <div
          ref={list}
          className={cn(
            floating,
            'fixed z-50 flex max-h-80 flex-col overflow-hidden transition-opacity duration-100',
            // Hidden by opacity, not by visibility, for the one frame before
            // it is placed: a hidden element cannot take focus, and the
            // search box wants it the moment the panel opens.
            !drop && 'pointer-events-none opacity-0',
          )}
          style={{ left: drop?.x, top: drop?.y, width: drop?.width }}
        >
          {searchable && (
            <div className="bg-fill m-1.5 mb-0 flex items-center gap-2 rounded-lg px-2.5">
              <FontAwesomeIcon icon={faMagnifyingGlass} className="text-label-2 size-3 shrink-0" />
              <input
                ref={search}
                value={query}
                placeholder={searchPlaceholder}
                onChange={e => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={onSearchKey}
                className="placeholder:text-label-2 min-w-0 flex-1 bg-transparent py-1.5 text-[13px] text-(--primary-text-color) outline-none"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear the search"
                  onClick={() => {
                    setQuery('')
                    setActive(0)
                    search.current?.focus()
                  }}
                  className="bg-label-2/60 hover:bg-label-2 flex size-[18px] shrink-0 items-center justify-center rounded-full text-(--card-background-color) transition-colors"
                >
                  <FontAwesomeIcon icon={faXmark} className="size-2.5" />
                </button>
              )}
            </div>
          )}
          <div role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {shown.length === 0 && <p className="text-label-2 px-2 py-3 text-center text-[13px]">Nothing matches.</p>}
            {shown.map((o, i) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                disabled={o.disabled}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[13px]',
                  i === active && !o.disabled && 'bg-fill-strong',
                  o.disabled && 'text-label-2',
                )}
              >
                <FontAwesomeIcon
                  icon={faCheck}
                  className={cn('text-tint mt-[3px] size-3 shrink-0', o.value === value ? 'opacity-100' : 'opacity-0')}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.badge}
                  </div>
                  {(o.device || o.area) && (
                    <div className="flex items-center gap-2">
                      {o.area && <span className="text-label-2 text-xs">{o.area}</span>}
                      {(o.device && o.area) && <span className="text-label-2 text-xs">•</span>}
                      {o.device && <span className="text-label-2 text-xs">{o.device}</span>}
                    </div>
                  )}
                  {o.detail && <div className="mt-0.5 pl-3">{o.detail}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
