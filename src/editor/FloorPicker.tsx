import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
  type ContextMenuPosition,
} from '#/components/ui/context-menu.tsx'
import { floating, iconButton } from '#/editor/look.ts'
import type { Floor } from '#/lib/floors.ts'
import { cn } from '#/lib/utils.ts'
import { EDITOR_TINT_COLOR } from '#/theme.ts'
import { faArrowDown, faArrowUp, faLayerGroup, faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useRef, useState } from 'react'

type Props = {
  // From the lowest up, read left to right. A home with one floor, or none
  // yet, has nothing to pick, and only the button that adds one shows.
  floors: Floor[]
  active: string | null
  onPick: (id: string) => void
  onAdd: (below: boolean) => void
  // The floors in their new order, from the lowest up.
  onOrder: (ids: string[]) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

// The floors of the home as one control, the floor being edited raised the
// way the chosen tool is. Drag a floor to put it above or below another,
// double click it to rename it, and right click it for the rest.
export default function FloorPicker({ floors, active, onPick, onAdd, onOrder, onRename, onDelete }: Props) {
  const [menu, setMenu] = useState<{ at: ContextMenuPosition; id: string } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const single = floors.length < 2
  const current = active ?? floors[0]?.id ?? null

  const move = (id: string, to: number) => {
    const from = floors.findIndex(floor => floor.id === id)
    if (from < 0 || to < 0 || to >= floors.length || from === to) return
    const ids = floors.map(floor => floor.id)
    ids.splice(from, 1)
    ids.splice(to, 0, id)
    onOrder(ids)
  }

  const picked = floors.find(floor => floor.id === menu?.id)
  const index = picked ? floors.indexOf(picked) : -1

  if (single) return <AddButton onAdd={() => onAdd(false)} first />

  return (
    <>
      <div className="bg-fill-strong flex items-center gap-0.5 rounded-[10px] p-0.5">
        {floors.map((floor, i) => {
          const on = floor.id === current
          if (renaming === floor.id)
            return (
              <RenameField
                key={floor.id}
                floor={floor}
                onDone={name => {
                  setRenaming(null)
                  if (name !== null) onRename(floor.id, name)
                }}
              />
            )
          return (
            <button
              key={floor.id}
              type="button"
              draggable
              title={`${floor.name}. Drag to move it up or down, double click to rename it.`}
              onClick={() => onPick(floor.id)}
              onDoubleClick={() => setRenaming(floor.id)}
              onContextMenu={e => {
                e.preventDefault()
                setMenu({ at: { x: e.clientX, y: e.clientY }, id: floor.id })
              }}
              onDragStart={e => {
                e.dataTransfer.setData('text/plain', floor.id)
                e.dataTransfer.effectAllowed = 'move'
                setDragged(floor.id)
              }}
              onDragOver={e => {
                if (!dragged) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }}
              onDrop={e => {
                e.preventDefault()
                if (dragged) move(dragged, i)
                setDragged(null)
              }}
              onDragEnd={() => setDragged(null)}
              style={on ? { color: EDITOR_TINT_COLOR } : undefined}
              className={cn(
                'flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors select-none',
                on && 'bg-raised shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
                !on && 'text-label-2 hover:text-(--primary-text-color)',
                dragged === floor.id && 'opacity-40',
              )}
            >
              {floor.name}
            </button>
          )
        })}
        <AddButton onAdd={() => onAdd(false)} first={false} />
      </div>

      {menu && picked && (
        <ContextMenu position={menu.at} onClose={() => setMenu(null)}>
          <ContextMenuItem
            onSelect={() => {
              setRenaming(picked.id)
              setMenu(null)
            }}
          >
            <FontAwesomeIcon icon={faPen} className="size-3" /> Rename
          </ContextMenuItem>
          <ContextMenuItem
            disabled={index >= floors.length - 1}
            onSelect={() => {
              move(picked.id, index + 1)
              setMenu(null)
            }}
          >
            <FontAwesomeIcon icon={faArrowUp} className="size-3" /> Move up a floor
          </ContextMenuItem>
          <ContextMenuItem
            disabled={index <= 0}
            onSelect={() => {
              move(picked.id, index - 1)
              setMenu(null)
            }}
          >
            <FontAwesomeIcon icon={faArrowDown} className="size-3" /> Move down a floor
          </ContextMenuItem>
          {index === 0 && (
            <ContextMenuItem
              onSelect={() => {
                onAdd(true)
                setMenu(null)
              }}
            >
              <FontAwesomeIcon icon={faPlus} className="size-3" /> Add a floor below
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              onDelete(picked.id)
              setMenu(null)
            }}
          >
            <FontAwesomeIcon icon={faTrash} className="size-3" />
            Delete floor
          </ContextMenuItem>
        </ContextMenu>
      )}
    </>
  )
}

// The floor's name as a field, typed over in place. Enter or leaving it
// keeps the name, Escape keeps the old one.
function RenameField({ floor, onDone }: { floor: Floor; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(floor.name)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  return (
    <input
      ref={input}
      aria-label="Floor name"
      value={name}
      size={Math.max(name.length, 6)}
      onChange={e => setName(e.target.value)}
      onBlur={() => onDone(name)}
      onKeyDown={e => {
        if (e.key === 'Enter') onDone(name)
        else if (e.key === 'Escape') onDone(null)
        // The editor's own shortcuts are not for the name.
        e.stopPropagation()
      }}
      className="bg-raised focus:ring-tint/30 h-8 rounded-lg border-none px-2.5 text-[13px] font-medium text-(--primary-text-color) outline-none focus:ring-3"
    />
  )
}

// Adds a floor over the highest. On a home with one floor it stands alone
// among the toolbar's tools, as a stack of floors rather than a bare plus,
// with a tip like theirs.
function AddButton({ onAdd, first }: { onAdd: () => void; first: boolean }) {
  return (
    <div className="group relative">
      <button type="button" aria-label="Add a floor" onClick={onAdd} className={cn(iconButton, 'size-8')}>
        <FontAwesomeIcon icon={first ? faLayerGroup : faPlus} className={first ? 'size-[15px]' : 'size-3'} />
      </button>
      <div
        className={cn(
          floating,
          'pointer-events-none invisible absolute top-full left-0 z-10 mt-2 w-56 translate-y-0.5 p-3 opacity-0 transition-[opacity,visibility,translate] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-hover:delay-500',
        )}
      >
        <p className="text-[13px] font-semibold">Add a floor</p>
        <p className="text-label-2 mt-0.5 text-xs leading-snug">
          {first
            ? 'Builds a floor over this one. The card then shows one floor at a time.'
            : 'Builds a floor over the highest one. Right click the lowest to add one below it.'}
        </p>
      </div>
    </div>
  )
}
