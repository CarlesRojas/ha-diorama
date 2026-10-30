import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from '#/components/ui/context-menu.tsx'
import {
  faArrowLeft,
  faArrowRight,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { Select } from '#/components/ui/select.tsx'
import type { Trace, TraceMode } from '#/editor/trace.ts'
import type { Tool } from '#/editor/types.ts'
import type { FloorConfig } from '#/types.ts'
import { faGripVertical, faPlus } from '@fortawesome/free-solid-svg-icons'
import { cn } from '#/lib/utils.ts'
import { field, floating, iconButton, kbd, plainButton } from '#/editor/look.ts'
import { Slider } from '#/editor/panel.tsx'
import { EDITOR_TINT_COLOR } from '#/theme.ts'
import {
  type IconDefinition,
  faArrowPointer,
  faDrawPolygon,
  faExpand,
  faImage,
  faCube,
  faMoon,
  faRuler,
  faSun,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useRef, useState } from 'react'

type Action = {
  id: string
  icon: IconDefinition
  title: string
  description: string
  shortcut: string
}

const TOOLS: (Action & { id: Tool })[] = [
  {
    id: 'select',
    icon: faArrowPointer,
    title: 'Select',
    description: 'Pick rooms and items, drag them, drag corners and edges.',
    shortcut: 'V',
  },
  {
    id: 'draw',
    icon: faDrawPolygon,
    title: 'Draw room',
    description: 'Click corners, close on the first one.',
    shortcut: 'D',
  },
]

type Props = {
  tool: Tool
  onTool: (tool: Tool) => void
  floors?: FloorConfig[]
  activeFloorId?: string
  onSelectFloor?: (floorId: string) => void
  onAddFloor?: () => void
  onReorderFloors?: (nextFloors: FloorConfig[]) => void
  onUpdateFloor?: (floorId: string, patch: Partial<FloorConfig>) => void
  onDeleteFloor?: (floorId: string) => void
  onFit: () => void
  showLengths: boolean
  onShowLengths: (value: boolean) => void
  showPreview: boolean
  onShowPreview: () => void
  hour: number
  onHour: (hour: number) => void
  trace: Trace | null
  onTrace: (trace: Trace | null) => void
  onPickTrace: (file: File) => Promise<void>
}

export default function Toolbar({
  tool,
  onTool,
  floors = [],
  activeFloorId,
  onSelectFloor,
  onAddFloor,
  onReorderFloors,
  onUpdateFloor,
  onDeleteFloor,
  onFit,
  showLengths,
  onShowLengths,
  showPreview,
  onShowPreview,
  hour,
  onHour,
  trace,
  onTrace,
  onPickTrace,
}: Props) {
  const color = EDITOR_TINT_COLOR
  return (
    <div className="flex items-center gap-0.5">
      {/* The tools are one control, of which one is always chosen. */}
      <div className="bg-fill-strong flex items-center gap-0.5 rounded-[10px] p-0.5">
        {TOOLS.map(t => (
          <ToolButton key={t.id} action={t} active={tool === t.id} color={color} onClick={() => onTool(t.id)} />
        ))}
      </div>
      <span className="bg-separator mx-2 h-4 w-px" />
      {/* Floor selector pills with drag-and-drop & context menu */}
      <FloorPills
        floors={floors}
        activeFloorId={activeFloorId}
        onSelectFloor={onSelectFloor}
        onAddFloor={onAddFloor}
        onReorderFloors={onReorderFloors}
        onUpdateFloor={onUpdateFloor}
        onDeleteFloor={onDeleteFloor}
      />
      <span className="bg-separator mx-2 h-4 w-px" />
      <ToolButton
        action={{ id: 'fit', icon: faExpand, title: 'Fit view', description: 'Frame all rooms.', shortcut: 'F' }}
        color={color}
        onClick={onFit}
      />
      <ToolButton
        action={{
          id: 'preview',
          icon: faCube,
          title: '3D preview',
          description: 'Floating live preview of the card.',
          shortcut: 'P',
        }}
        active={showPreview}
        color={color}
        toggle
        onClick={onShowPreview}
      />
      {/* The hour of the day the preview is lit at, so a room can be seen
          at noon, at dusk or at night without waiting for it. */}
      <Dial
        icon={hour > 6.5 && hour < 21.5 ? faSun : faMoon}
        label="Time of day"
        shortcut="N"
        note={`${clock(hour)}. The preview only, never the card.`}
        color={color}
        value={hour}
        min={0}
        max={23.5}
        step={0.5}
        onChange={onHour}
      />
      <ToolButton
        action={{
          id: 'lengths',
          icon: faRuler,
          title: 'Edge lengths',
          description: 'Show the length of each edge of the selected room.',
          shortcut: 'L',
        }}
        active={showLengths}
        color={color}
        toggle
        onClick={() => onShowLengths(!showLengths)}
      />
      <TracePanel color={color} trace={trace} onTrace={onTrace} onPick={onPickTrace} />
    </div>
  )
}

// The hour of a day, as a clock.
function clock(hour: number) {
  const h = Math.floor(hour) % 24
  const m = Math.round((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Puts the panel a button opened away on a press anywhere else.
function useAway(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null)
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    // The composed path, since inside the editor's shadow root the target
    // is retargeted to the host by the time the event reaches the document.
    const away = (e: PointerEvent) => {
      if (box.current && !e.composedPath().includes(box.current)) latest.current()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  return box
}

// The picture of a plan to trace the rooms over: choosing it, how much it
// shows, how wide it is, and taking it away again. Moving and sizing it is
// done on the plan, by selecting it.
function TracePanel({
  color,
  trace,
  onTrace,
  onPick,
}: {
  color: string
  trace: Trace | null
  onTrace: (trace: Trace | null) => void
  onPick: (file: File) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const box = useAway(open, () => setOpen(false))
  const file = useRef<HTMLInputElement>(null)
  const pick = async (chosen: File | undefined) => {
    if (!chosen) return
    try {
      await onPick(chosen)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label="Trace image"
        onClick={() => setOpen(!open)}
        style={open || trace ? { color } : undefined}
        className={cn(iconButton, 'size-8', (open || trace) && 'bg-tint/12 hover:bg-tint/18')}
      >
        <FontAwesomeIcon icon={faImage} className="size-[15px]" />
      </button>
      {open && (
        <div className={cn(floating, 'absolute top-full left-0 z-20 mt-2 flex w-72 flex-col gap-3 p-4')}>
          <p className="text-[13px] font-semibold">Trace image</p>
          <p className="text-label-2 -mt-1.5 text-xs leading-snug">
            A picture of your plan under the drawing, to trace the rooms over. Click it on the plan to move and resize
            it. It stays in this browser and is never saved with the card.
          </p>
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              void pick(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {failed && <p className="text-danger text-xs">That file could not be read as a picture.</p>}
          {trace && (
            <>
              <label className="flex items-center justify-between gap-2 text-[13px]">
                Show
                <Select
                  aria-label="Show"
                  value={trace.mode ?? 'picture'}
                  className="w-auto"
                  options={[
                    { value: 'picture', label: 'Whole picture' },
                    { value: 'dark-lines', label: 'Dark lines only' },
                    { value: 'light-lines', label: 'Light lines only' },
                  ]}
                  onChange={v => onTrace({ ...trace, mode: v as TraceMode })}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px]">
                Opacity
                <Slider
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={trace.opacity}
                  onChange={e => onTrace({ ...trace, opacity: Number(e.target.value) })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-[13px]">
                Width in meters
                <input
                  type="number"
                  min={0.5}
                  step={0.1}
                  value={Math.round(trace.width * 100) / 100}
                  className={cn(field, 'w-24 text-right tabular-nums')}
                  onChange={e => {
                    const width = Number(e.target.value)
                    if (width >= 0.5) onTrace({ ...trace, width })
                  }}
                />
              </label>
            </>
          )}
          <div className="flex gap-2">
            <button type="button" className={cn(plainButton, 'flex-1')} onClick={() => file.current?.click()}>
              {trace ? 'Replace' : 'Choose image'}
            </button>
            {trace && (
              <button type="button" className={cn(plainButton, 'text-danger flex-1')} onClick={() => onTrace(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// A button that opens a slider under itself.
function Dial({
  icon,
  label,
  shortcut,
  note,
  color,
  value,
  min,
  max,
  step,
  onChange,
}: {
  icon: IconDefinition
  label: string
  shortcut: string
  note: string
  color: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useAway(open, () => setOpen(false))
  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen(!open)}
        style={open ? { color } : undefined}
        className={cn(iconButton, 'size-8', open && 'bg-tint/12 hover:bg-tint/18')}
      >
        <FontAwesomeIcon icon={icon} className="size-[15px]" />
      </button>
      {open && (
        <div className={cn(floating, 'absolute top-full left-0 z-20 mt-2 w-64 p-4')}>
          <p className="flex items-center justify-between gap-2 text-[13px] font-semibold">
            {label}
            <kbd className={kbd}>{shortcut}</kbd>
          </p>
          <p className="text-label-2 mt-0.5 text-xs tabular-nums">{note}</p>
          <Slider
            className="mt-3 w-full"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={e => onChange(Number(e.target.value))}
          />
        </div>
      )}
    </div>
  )
}

// A toggle shows its state through the icon color on a faint tint, a tool
// as the raised segment of the control the tools sit in.
function ToolButton({
  action,
  active,
  color,
  toggle = false,
  onClick,
}: {
  action: Action
  active?: boolean
  color: string
  toggle?: boolean
  onClick: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={action.title}
        onClick={onClick}
        style={active ? { color } : undefined}
        className={cn(
          iconButton,
          'size-8',
          active && !toggle && 'bg-raised hover:bg-raised active:bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
          active && toggle && 'bg-tint/12 hover:bg-tint/18',
        )}
      >
        <FontAwesomeIcon icon={action.icon} className="size-[15px]" />
      </button>
      {/* The tip waits a moment before it shows, so passing over the
          toolbar does not flash one up after another. */}
      <div
        className={cn(
          floating,
          'pointer-events-none invisible absolute top-full left-0 z-10 mt-2 w-56 translate-y-0.5 p-3 opacity-0 transition-[opacity,visibility,translate] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-500',
        )}
      >
        <p className="flex items-center justify-between gap-2 text-[13px] font-semibold">
          {action.title}
          <kbd className={kbd}>{action.shortcut}</kbd>
        </p>
        <p className="text-label-2 mt-0.5 text-xs leading-snug">{action.description}</p>
      </div>
    </div>
  )
}

type FloorPillsProps = {
  floors: FloorConfig[]
  activeFloorId?: string
  onSelectFloor?: (floorId: string) => void
  onAddFloor?: () => void
  onReorderFloors?: (nextFloors: FloorConfig[]) => void
  onUpdateFloor?: (floorId: string, patch: Partial<FloorConfig>) => void
  onDeleteFloor?: (floorId: string) => void
}

function FloorPills({
  floors,
  activeFloorId,
  onSelectFloor,
  onAddFloor,
  onReorderFloors,
  onUpdateFloor,
  onDeleteFloor,
}: FloorPillsProps) {
  const currentFloors = floors.length === 0 ? [{ id: 'floor-0', name: 'Planta Baja', elevation: 0 }] : floors
  const [contextMenu, setContextMenu] = useState<{ at: ContextMenuPosition; floorId: string } | null>(null)
  const [editingFloor, setEditingFloor] = useState<FloorConfig | null>(null)
  const [draggedFloorId, setDraggedFloorId] = useState<string | null>(null)

  const activeId = activeFloorId ?? currentFloors[0]?.id ?? 'floor-0'

  const moveFloor = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= currentFloors.length || toIndex >= currentFloors.length) return
    const next = [...currentFloors]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    onReorderFloors?.(next)
  }

  const selectedFloor = currentFloors.find(f => f.id === contextMenu?.floorId)
  const selectedIndex = selectedFloor ? currentFloors.indexOf(selectedFloor) : -1

  return (
    <>
      <div className="bg-fill-strong flex items-center gap-0.5 rounded-[10px] p-0.5">
        {currentFloors.map((f, i) => {
          const isActive = activeId === f.id
          return (
            <button
              key={f.id}
              type="button"
              draggable
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', f.id)
                setDraggedFloorId(f.id)
              }}
              onDragOver={e => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={e => {
                e.preventDefault()
                const fromId = e.dataTransfer.getData('text/plain')
                const fromIndex = currentFloors.findIndex(item => item.id === fromId)
                if (fromIndex !== -1 && fromIndex !== i) {
                  moveFloor(fromIndex, i)
                }
                setDraggedFloorId(null)
              }}
              onDragEnd={() => setDraggedFloorId(null)}
              onDoubleClick={e => {
                e.stopPropagation()
                setEditingFloor({ ...f })
              }}
              onContextMenu={e => {
                e.preventDefault()
                setContextMenu({ at: { x: e.clientX, y: e.clientY }, floorId: f.id })
              }}
              className={cn(
                'group flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-[8px] transition-all cursor-grab active:cursor-grabbing select-none',
                isActive
                  ? 'bg-fill text-(--primary-text-color) shadow-sm'
                  : 'text-(--secondary-text-color) hover:text-(--primary-text-color)',
                draggedFloorId === f.id && 'opacity-40',
              )}
              onClick={() => onSelectFloor?.(f.id)}
              title={`${f.name} (Elevación: ${f.elevation >= 0 ? '+' : ''}${f.elevation}m)
Arrastra para reordenar plantas. Doble clic para renombrar o editar elevación.`}
            >
              <FontAwesomeIcon
                icon={faGripVertical}
                className="size-2.5 opacity-35 group-hover:opacity-80 transition-opacity"
              />
              <span>{f.name}</span>
            </button>
          )
        })}
        {onAddFloor && (
          <button
            type="button"
            title="Añadir planta"
            className="flex items-center justify-center size-6 rounded-[8px] text-(--secondary-text-color) hover:text-(--primary-text-color) transition-colors cursor-pointer"
            onClick={onAddFloor}
          >
            <FontAwesomeIcon icon={faPlus} className="size-2.5" />
          </button>
        )}
      </div>

      {contextMenu && selectedFloor && (
        <ContextMenu position={contextMenu.at} onClose={() => setContextMenu(null)}>
          <ContextMenuItem
            onSelect={() => {
              setEditingFloor({ ...selectedFloor })
              setContextMenu(null)
            }}
          >
            Ajustar elevación y nombre
          </ContextMenuItem>
          {selectedIndex > 0 && (
            <ContextMenuItem
              onSelect={() => {
                moveFloor(selectedIndex, selectedIndex - 1)
                setContextMenu(null)
              }}
            >
              <FontAwesomeIcon icon={faArrowLeft} className="size-3" /> Mover hacia abajo / izquierda
            </ContextMenuItem>
          )}
          {selectedIndex < currentFloors.length - 1 && (
            <ContextMenuItem
              onSelect={() => {
                moveFloor(selectedIndex, selectedIndex + 1)
                setContextMenu(null)
              }}
            >
              <FontAwesomeIcon icon={faArrowRight} className="size-3" /> Mover hacia arriba / derecha
            </ContextMenuItem>
          )}
          {currentFloors.length > 1 && onDeleteFloor && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onSelect={() => {
                  onDeleteFloor(selectedFloor.id)
                  setContextMenu(null)
                }}
              >
                <FontAwesomeIcon icon={faTrash} className="size-3" /> Eliminar planta
              </ContextMenuItem>
            </>
          )}
        </ContextMenu>
      )}

      {/* Modal / Dialog para ajustar elevación y nombre de planta */}
      {editingFloor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
          onPointerDown={() => setEditingFloor(null)}
        >
          <div
            className={cn(floating, 'w-80 p-5 flex flex-col gap-4')}
            onPointerDown={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-(--primary-text-color)">Editar Planta</h3>
            <label className="flex flex-col gap-1.5 text-xs text-(--secondary-text-color)">
              Nombre de la planta
              <input
                type="text"
                className={field}
                value={editingFloor.name}
                onChange={e => setEditingFloor({ ...editingFloor, name: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-(--secondary-text-color)">
              Elevación del piso (metros)
              <input
                type="number"
                step="0.05"
                className={field}
                value={editingFloor.elevation}
                onChange={e => {
                  const val = parseFloat(e.target.value)
                  setEditingFloor({ ...editingFloor, elevation: isNaN(val) ? 0 : val })
                }}
              />
              <span className="text-[11px] text-label-2">Ej: -3.0 para sótano/planta inferior, 0.0 para planta baja, 3.0 para primera planta</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className={plainButton}
                onClick={() => setEditingFloor(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bg-tint-fill flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[13px] font-semibold text-white shadow-sm hover:brightness-105 active:scale-95"
                onClick={() => {
                  onUpdateFloor?.(editingFloor.id, {
                    name: editingFloor.name,
                    elevation: editingFloor.elevation,
                  })
                  setEditingFloor(null)
                }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
