import { iconButton } from '#/editor/look.ts'
import { SIGNAL_HINTS, SIGNAL_ICONS, SIGNAL_LABELS } from '#/editor/signalIcons.ts'
import { cn } from '#/lib/utils.ts'
import type { Signal } from '#/signals.ts'
import { faRotateLeft, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react'

// Pieces both sidebars share.

// Stays at the top of the sidebar while the rest of it scrolls.
export function Sticky({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('sticky top-0 z-10 -mx-1 flex flex-col gap-2.5 bg-(--card-background-color) px-1 pb-3', className)}
    >
      {children}
    </div>
  )
}

// Title of whatever is selected, with the way back to the list. The cross
// is in the text's own color, not the accent, so it reads as a way out and
// not as something switched on.
export function SelectedHeader({ title, tag, onBack }: { title: string; tag?: ReactNode; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight">{title}</p>
      {tag}
      <button
        type="button"
        aria-label="Back to the list"
        onClick={onBack}
        className={cn(
          iconButton,
          'bg-fill-strong text-label-2 size-7 shrink-0 rounded-full hover:text-(--primary-text-color)',
        )}
      >
        <FontAwesomeIcon icon={faXmark} className="size-3" />
      </button>
    </div>
  )
}

// The controls a device has, or the ones an item can express.
export function Signals({ signals, accent, size = 'md' }: { signals: Signal[]; accent?: string; size?: 'sm' | 'md' }) {
  if (signals.length === 0) return null
  // Small is the icons alone, each naming itself on hover, for the places
  // where the words would crowd the row out.
  if (size === 'sm') {
    return (
      <span className="flex shrink-0 items-center gap-1.5">
        {signals.map(s => (
          <FontAwesomeIcon
            key={s}
            icon={SIGNAL_ICONS[s]}
            title={`${SIGNAL_LABELS[s]}. ${SIGNAL_HINTS[s]}`}
            className={cn('size-3', !accent && 'text-label-2')}
            style={accent ? { color: accent } : undefined}
          />
        ))}
      </span>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map(s => (
        <span
          key={s}
          title={SIGNAL_HINTS[s]}
          className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,currentColor_13%,transparent)] px-2.5 py-1 text-xs font-medium"
          style={{ color: accent }}
        >
          <FontAwesomeIcon icon={SIGNAL_ICONS[s]} className="size-3" />
          {SIGNAL_LABELS[s]}
        </span>
      ))}
    </div>
  )
}

// Drag to make the 3D preview above it taller or shorter.
export function PreviewHandle({ onDrag }: { onDrag: (deltaY: number) => void }) {
  const start = useRef(0)
  return (
    <div
      className="group -my-1 flex h-4 cursor-row-resize touch-none items-center justify-center"
      onPointerDown={e => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = e.clientY
      }}
      onPointerMove={e => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        onDrag(e.clientY - start.current)
        start.current = e.clientY
      }}
      onPointerUp={e => e.currentTarget.releasePointerCapture(e.pointerId)}
    >
      <span className="bg-fill-stronger group-hover:bg-label-2 h-[5px] w-9 rounded-full transition-colors" />
    </div>
  )
}

// An on and off switch, for the states a piece can be tried in.
export function Switch({
  checked,
  onChange,
  accent,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  accent: string
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] shrink-0 justify-self-start rounded-full transition-colors duration-200',
        !checked && 'bg-fill-stronger',
      )}
      style={checked ? { backgroundColor: accent } : undefined}
    >
      <span
        className={cn(
          'absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.2),0_0_1px_rgba(0,0,0,0.2)] transition-transform duration-200 ease-out',
          checked && 'translate-x-4',
        )}
      />
    </button>
  )
}

// A slider: a thin track filled in the tint up to a white lozenge of a
// thumb. It is the native range input underneath, so the keyboard and screen
// readers work it as they would any other.
export function Slider({
  value,
  min,
  max,
  className,
  style,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max'> & {
  value: number
  min: number
  max: number
}) {
  const share = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      className={cn('dio-slider', className)}
      style={{ '--dio-share': share, ...style } as CSSProperties}
      {...rest}
    />
  )
}

// Back to the value a setting comes with. It is there beside every setting a
// piece or a room has, and only shows once the value has left its default.
// At the default it still holds its place, so each row lines up with the
// next.
export function ResetButton({ label, changed, onReset }: { label: string; changed: boolean; onReset: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Reset ${label.toLowerCase()} to default`}
      title="Reset to default"
      disabled={!changed}
      aria-hidden={!changed}
      onClick={e => {
        // Inside a label, a click would also land on the control it names.
        e.preventDefault()
        onReset()
      }}
      className={cn(
        iconButton,
        'text-label-2 size-6 rounded-full hover:text-(--primary-text-color)',
        !changed && 'invisible',
      )}
    >
      <FontAwesomeIcon icon={faRotateLeft} className="size-3" />
    </button>
  )
}
