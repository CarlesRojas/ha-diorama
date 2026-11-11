import { cn } from '#/lib/utils.ts'
import { floating } from '#/editor/look.ts'
import { useEffect, type ReactNode } from 'react'

// Confirmation dialog in the shadcn style, without Radix for the same reason
// as the context menu: it must live inside the fullscreen editor's own
// dialog, where document level listeners never fire.

type AlertDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  // For what cannot be undone and takes a lot with it: the dialog is drawn
  // in red, edge and wash, so it cannot be taken for an everyday question.
  danger?: boolean
}

export function AlertDialog({ open, onOpenChange, children, danger = false }: AlertDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onOpenChange(false)
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[3px]"
      onPointerDown={() => onOpenChange(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className={cn(
          floating,
          'w-full max-w-[300px] rounded-[20px] bg-(--card-background-color)/90 px-5 pt-5 pb-4 text-center text-(--primary-text-color)',
          danger &&
            'border-danger ring-danger/50 bg-[color-mix(in_srgb,var(--color-danger)_24%,var(--card-background-color))] ring-2',
        )}
        onPointerDown={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export function AlertDialogHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>
}

export function AlertDialogTitle({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return <h2 className={cn('text-[17px] font-semibold tracking-tight', danger && 'text-danger')}>{children}</h2>
}

export function AlertDialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-label-2 text-[13px] leading-snug">{children}</p>
}

export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-5 grid grid-cols-2 gap-2.5">{children}</div>
}

const button =
  'inline-flex h-10 cursor-pointer items-center justify-center rounded-xl px-4 text-[15px] font-semibold transition-[background-color,filter,transform] outline-none active:scale-[0.98]'

export function AlertDialogCancel({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn(button, 'bg-fill-strong hover:bg-fill-stronger')}>
      {children}
    </button>
  )
}

export function AlertDialogAction({
  children,
  onClick,
  variant = 'default',
  className,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
  className?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        button,
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'destructive'
          ? 'bg-danger-fill text-white hover:brightness-[1.06]'
          : 'bg-tint-fill text-white hover:brightness-[1.06]',
        className,
      )}
    >
      {children}
    </button>
  )
}
