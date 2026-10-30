import {
  adjustedCount,
  cycleLength,
  DECORATION_KINDS,
  decorationKind,
  decorationVariant,
  itemLevels,
  kindColors,
  paramValue,
  preferredDomains,
  styleParams,
  withoutStyleDefaults,
  type DecorationKind,
} from '#/decoration/catalog.ts'
import { levelsAt } from '#/decoration/surfaces.ts'
import { isModelKind, MODEL_FAMILY, modelIdOf, modelKinds } from '#/decoration/models.ts'
import { heavyNote, importFiles, importLink, sizeNote } from '#/editor/importModel.ts'
import { placeableEntities } from '#/devices/catalog.ts'
import ModelPreview from '#/editor/ModelPreview.tsx'
import TrySection from '#/editor/TrySection.tsx'
import { canTry, type TryState, type TryStates } from '#/editor/tryState.ts'
import { PreviewHandle, ResetButton, SelectedHeader, Signals, Slider, Sticky, Switch } from '#/editor/panel.tsx'
import { snapToWall } from '#/editor/walls.ts'
import { Select } from '#/components/ui/select.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog.tsx'
import { cn } from '#/lib/utils.ts'
import { deviceSignals, levelChannels } from '#/signals.ts'
import { EDITOR_BOUND_COLOR, EDITOR_TINT_COLOR, ROOM_COLORS } from '#/theme.ts'
import { colorWell, deleteButton, field, group, groupTitle, iconButton, note, plainButton, row } from '#/editor/look.ts'
import type { DecorationConfig, DeviceConfig, HomeAssistant, ModelConfig, RoomConfig } from '#/types.ts'
import { decorationIcon, FAMILY_LABELS } from '#/decoration/icons.ts'
import {
  faArrowsRotate,
  faChevronDown,
  faChevronUp,
  faFileImport,
  faLink,
  faMagnifyingGlass,
  faMinus,
  faPlus,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useRef, useState } from 'react'

type Props = {
  hass: HomeAssistant | null
  rooms: RoomConfig[]
  devices: DeviceConfig[]
  decorations: DecorationConfig[]
  // The models imported into the catalog, by id.
  models: Record<string, ModelConfig> | undefined
  selected: string | null
  onAdd: (kind: DecorationKind) => void
  onImportModel: (id: string, model: ModelConfig) => void
  onUpdateModel: (id: string, patch: Partial<ModelConfig>) => void
  onRemoveModel: (id: string) => void
  onUpdate: (id: string, patch: Partial<DecorationConfig>) => void
  onRemove: (id: string) => void
  onBind: (id: string, entityId: string | null) => void
  onDeviceLevels: (entityId: string, levels: Record<string, string>) => void
  onStandOn: (id: string, level: { on: string | null; floor: boolean }) => void
  onSelect: (id: string | null) => void
  // States tried on pieces with no device, only while editing.
  tries: TryStates
  // Where trying a piece starts: its device as the home was, or off.
  tryStart: (id: string, kind: DecorationKind) => TryState
  onTry: (id: string, state: TryState | null) => void
}

const accent = EDITOR_TINT_COLOR

// A saved map without one of its keys, or nothing once it is empty, so a
// setting put back to its default leaves no trace in the card's config.
function without(values: Record<string, string>, key: string): Record<string, string> | undefined
function without(values: Record<string, number>, key: string): Record<string, number> | undefined
function without(values: Record<string, string | number>, key: string) {
  const { [key]: _, ...rest } = values
  return Object.keys(rest).length > 0 ? rest : undefined
}

export default function DecorationPanel({
  hass,
  rooms,
  devices,
  decorations,
  models,
  selected,
  onAdd,
  onImportModel,
  onUpdateModel,
  onRemoveModel,
  onUpdate,
  onRemove,
  onBind,
  onDeviceLevels,
  onStandOn,
  onSelect,
  tries,
  tryStart,
  onTry,
}: Props) {
  const [hovered, setHovered] = useState<DecorationKind | null>(null)
  const [query, setQuery] = useState('')
  // Null until the handle is dragged: the preview is square by default, so
  // it takes the shape of the sidebar it sits in, whatever that is.
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  const previewBox = useRef<HTMLDivElement>(null)
  // Dragging starts from whatever the square came out as, which only the
  // laid out element knows.
  const resize = (dy: number) =>
    setPreviewHeight(h => {
      const from = h ?? previewBox.current?.getBoundingClientRect().height ?? 240
      return Math.min(Math.max(from + dy, 120), 520)
    })
  const previewShape = {
    className: cn('bg-fill w-full overflow-hidden rounded-2xl', !previewHeight && 'aspect-square'),
    style: previewHeight ? { height: previewHeight } : undefined,
  }
  // The item a trash icon in the device's list was clicked on, waiting for
  // the yes.
  const [unbinding, setUnbinding] = useState<DecorationConfig | null>(null)
  // The model whose bin was clicked in the catalog, waiting for the yes.
  const [removing, setRemoving] = useState<DecorationKind | null>(null)
  // A model on its way in, and what went wrong with the last one.
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [linking, setLinking] = useState(false)
  const [link, setLink] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const bring = async (work: () => Promise<{ id: string; model: ModelConfig }>) => {
    setImporting(true)
    setImportError(null)
    try {
      const { id, model } = await work()
      onImportModel(id, model)
      setLinking(false)
      setLink('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'The model could not be imported.')
    } finally {
      setImporting(false)
    }
  }
  const item = selected ? decorations.find(d => d.id === selected) : undefined
  const kind = item ? decorationKind(item.kind) : undefined

  if (item && kind) {
    const boundDevice = devices.find(d => d.decorations?.includes(item.id))
    const boundSignals = hass && boundDevice ? deviceSignals(hass, boundDevice.entity_id) : []
    const channels = hass && boundDevice ? levelChannels(hass, boundDevice.entity_id) : []
    // The other pieces the same device stands behind, so what it drives can
    // be seen and let go of from here.
    const siblings = (boundDevice?.decorations ?? [])
      .filter(id => id !== item.id)
      .map(id => decorations.find(d => d.id === id))
      .filter((d): d is DecorationConfig => !!d)
    // What a device already stands behind, named by the pieces themselves.
    const driving = (entityId: string) =>
      (devices.find(d => d.entity_id === entityId)?.decorations ?? [])
        .map(id => decorations.find(x => x.id === id))
        .filter((d): d is DecorationConfig => !!d)
        .map(d => ({ id: d.id, label: decorationKind(d.kind)?.label ?? d.kind }))
    // Entities that drive at least one of the things this item can show,
    // the ones that fit best first: a device of the piece's own kind, a
    // cover for a blind, then the ones that show the most of it. A device
    // can stand behind several pieces at once, so one already in use is
    // still on offer.
    const shared = (entityId: string) =>
      hass ? deviceSignals(hass, entityId).filter(x => kind.expresses.includes(x)).length : 0
    const own = preferredDomains(kind)
    const ownKind = (entityId: string) => (own.includes(entityId.split('.')[0]) ? 1 : 0)
    const fits = (hass ? placeableEntities(hass) : [])
      .filter(e => shared(e.entity_id) > 0)
      .sort(
        (a, b) =>
          ownKind(b.entity_id) - ownKind(a.entity_id) ||
          shared(b.entity_id) - shared(a.entity_id) ||
          a.name.localeCompare(b.name),
      )
    // The heights it can stand at where it is: the floor, its own height
    // and the tops under it.
    const levels = levelsAt(item, decorations)
    const levelAt = levels.findIndex(l => l.current)
    const levelName = (l: (typeof levels)[number]) => {
      const under = l.on ? decorations.find(d => d.id === l.on) : undefined
      if (under) return decorationKind(under.kind)?.label ?? under.kind
      return l.floor ? 'The floor' : 'On its own'
    }
    const itemRoom = rooms.find(r => r.id === item.room)
    // A piece on a wall turns to face into the room, as it does when it is
    // put there. Any other piece faces straight ahead.
    const defaultRotation = kind.mount === 'wall' && itemRoom ? snapToWall(item.position, itemRoom.points).rotation : 0
    const roomIndex = rooms.findIndex(r => r.id === item.room)
    const roomTag = itemRoom ? (
      <span
        className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-black/80"
        style={{ backgroundColor: itemRoom.color ?? ROOM_COLORS[roomIndex % ROOM_COLORS.length] }}
      >
        {itemRoom.name ?? itemRoom.id}
      </span>
    ) : undefined
    return (
      <div className="flex flex-col gap-3">
        <Sticky>
          <SelectedHeader title={kind.label} tag={roomTag} onBack={() => onSelect(null)} />
          <ModelPreview item={item} boxRef={previewBox} interactive {...previewShape} />
          <PreviewHandle onDrag={resize} />
          <Signals signals={kind.expresses} accent={accent} />
        </Sticky>

        <div className={group}>
          {/* Which style of the kind this one is. A pendant is listed once in
            the catalog and says here which of them it is. */}
          {kind.variants && kind.variants.length > 1 && (
            <label className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
              Style
              <Select
                aria-label="Style"
                value={decorationVariant(kind, item.variant)?.id ?? ''}
                options={kind.variants.map(v => ({ value: v.id, label: v.label }))}
                onChange={v => onUpdate(item.id, { variant: v, params: withoutStyleDefaults(kind, item.params, v) })}
              />
              <ResetButton
                label="Style"
                changed={decorationVariant(kind, item.variant)?.id !== kind.variants[0].id}
                onReset={() =>
                  onUpdate(item.id, {
                    variant: undefined,
                    params: withoutStyleDefaults(kind, item.params, kind.variants![0].id),
                  })
                }
              />
            </label>
          )}

          {styleParams(kind, item.variant, item.params).map(p => {
            // Read through the catalog, so a size saved before this slider's
            // steps changed shows on a stop rather than between two of them.
            const value = paramValue(kind, item.params, p.id, item.variant)
            // What it starts at for this style: a pendant's real size. Going
            // back to it forgets the saved value, so the item follows its
            // style again.
            const initial = paramValue(kind, undefined, p.id, item.variant)
            const reset = (
              <ResetButton
                label={p.label}
                changed={value !== initial}
                onReset={() => onUpdate(item.id, { params: without(item.params ?? {}, p.id) })}
              />
            )
            // A two state parameter is a switch, not a slider with two stops.
            if (p.toggle)
              return (
                <label key={p.id} className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                  {p.label}
                  <Switch
                    checked={value > 0.5}
                    accent={accent}
                    label={p.label}
                    onChange={on => onUpdate(item.id, { params: { ...item.params, [p.id]: on ? 1 : 0 } })}
                  />
                  {reset}
                </label>
              )
            // A place in a row is stepped through with a button, and wraps
            // round however many places there are now.
            if (p.cycle) {
              const count = cycleLength(kind, item.params, item.variant)
              const at = ((Math.round(value) % count) + count) % count
              return (
                <div key={p.id} className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                  {p.label}
                  <button
                    type="button"
                    disabled={count < 2}
                    onClick={() => onUpdate(item.id, { params: { ...item.params, [p.id]: (at + 1) % count } })}
                    className={cn(plainButton, 'h-7 justify-self-start px-2.5 text-xs tabular-nums')}
                  >
                    <FontAwesomeIcon icon={faArrowsRotate} className="size-3" />
                    {at + 1} of {count}
                  </button>
                  {reset}
                </div>
              )
            }
            // A count the size gives, with parts added or taken away. The
            // buttons show and step the count that results, and the value
            // saved is how far it is from what the size gives.
            if (p.adjust) {
              const { count, max } = adjustedCount(kind, item.params, item.variant)
              const step = (by: number) =>
                onUpdate(item.id, { params: { ...item.params, [p.id]: Math.round(value) + by } })
              const stepper =
                'flex h-7 w-9 items-center justify-center text-(--primary-text-color) transition-colors hover:bg-fill-strong active:bg-fill-stronger disabled:pointer-events-none disabled:opacity-35'
              return (
                <div key={p.id} className={cn(row, 'grid-cols-[96px_1fr_24px]')}>
                  {p.label}
                  <div className="bg-fill-strong flex items-center justify-self-start overflow-hidden rounded-lg">
                    <button
                      type="button"
                      aria-label={`Fewer ${p.label.toLowerCase()}`}
                      disabled={count <= 0 || value <= p.min}
                      onClick={() => step(-1)}
                      className={stepper}
                    >
                      <FontAwesomeIcon icon={faMinus} className="size-3" />
                    </button>
                    <span className="bg-separator h-4 w-px" />
                    <span className="w-7 text-center text-xs font-medium tabular-nums">{count}</span>
                    <span className="bg-separator h-4 w-px" />
                    <button
                      type="button"
                      aria-label={`More ${p.label.toLowerCase()}`}
                      disabled={count >= max || value >= p.max}
                      onClick={() => step(1)}
                      className={stepper}
                    >
                      <FontAwesomeIcon icon={faPlus} className="size-3" />
                    </button>
                  </div>
                  {reset}
                </div>
              )
            }
            return (
              <label key={p.id} className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
                {p.label}
                <Slider
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  value={value}
                  onChange={e => onUpdate(item.id, { params: { ...item.params, [p.id]: Number(e.target.value) } })}
                />
                <span className="text-label-2 text-right text-xs tabular-nums">
                  {/* The parameter says its unit, and means meters when silent. */}
                  {p.unit === undefined ? `${value.toFixed(2)} m` : `${value}${p.unit}`}
                </span>
                {reset}
              </label>
            )
          })}
          <label className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
            Rotation
            {/* On the same five degree steps the handle on the plan turns it by. */}
            <Slider
              min={0}
              max={355}
              step={5}
              value={item.rotation ?? 0}
              onChange={e => onUpdate(item.id, { rotation: Number(e.target.value) })}
            />
            <span className="text-label-2 text-right text-xs tabular-nums">{item.rotation ?? 0}°</span>
            <ResetButton
              label="Rotation"
              changed={(item.rotation ?? 0) !== defaultRotation}
              onReset={() => onUpdate(item.id, { rotation: defaultRotation })}
            />
          </label>
          {/* The four square turns in one press. A wall piece faces its wall
              whichever way it is turned, so it has none. */}
          {kind.mount !== 'wall' && (
            <div className={cn(row, 'grid-cols-[96px_1fr_56px_24px]')}>
              Turn
              <div className="bg-fill-strong col-span-2 flex rounded-[8px] p-0.5">
                {[0, 90, 180, 270].map(angle => (
                  <button
                    key={angle}
                    type="button"
                    aria-pressed={(item.rotation ?? 0) === angle}
                    onClick={() => onUpdate(item.id, { rotation: angle })}
                    className={cn(
                      'flex-1 rounded-[6px] py-1 text-xs font-medium tabular-nums transition-colors',
                      (item.rotation ?? 0) === angle
                        ? 'bg-raised text-(--primary-text-color) shadow-[0_1px_3px_rgba(0,0,0,0.2)]'
                        : 'text-label-2 hover:text-(--primary-text-color)',
                    )}
                  >
                    {angle}°
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* An imported model's name and mount are the model's own, so
            they change every piece placed from it. */}
        {isModelKind(kind) &&
          (() => {
            const id = modelIdOf(kind.id)
            const model = id ? models?.[id] : undefined
            if (!id || !model) return null
            const heavy = heavyNote(model)
            return (
              <div className={group}>
                <p className={groupTitle}>Model</p>
                <label className={cn(row, 'grid-cols-[96px_1fr]')}>
                  Name
                  <input
                    className={field}
                    aria-label="Model name"
                    value={model.name}
                    onChange={e => onUpdateModel(id, { name: e.target.value })}
                    onBlur={e => {
                      if (!e.target.value.trim()) onUpdateModel(id, { name: 'Model' })
                    }}
                  />
                </label>
                <label className={cn(row, 'grid-cols-[96px_1fr]')}>
                  Mount
                  <Select
                    aria-label="Mount"
                    value={model.mount ?? 'floor'}
                    options={[
                      { value: 'floor', label: 'On the floor' },
                      { value: 'wall', label: 'On a wall' },
                      { value: 'ceiling', label: 'From the ceiling' },
                    ]}
                    onChange={v => onUpdateModel(id, { mount: v as ModelConfig['mount'] })}
                  />
                </label>
                <p className={note}>Every piece of this model changes with its name and mount. {sizeNote(model)}</p>
                {heavy && <p className="text-xs leading-snug text-[var(--warning-color,#ffa600)]">{heavy}</p>}
              </div>
            )
          })()}

        {/* Up and down through the heights there are where it stands. With
            only one, there is nothing to step through. */}
        {levels.length > 1 && levelAt >= 0 && (
          <div className={group}>
            <p className={groupTitle}>Standing on</p>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">
                {levelName(levels[levelAt])}
                <span className="text-label-2 ml-2 text-xs tabular-nums">
                  {Math.round(levels[levelAt].height * 100)} cm
                </span>
              </span>
              {(
                [
                  [-1, 'Lower', faChevronDown],
                  [1, 'Higher', faChevronUp],
                ] as const
              ).map(([by, label, icon]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  title={levels[levelAt + by] ? `${label}: ${levelName(levels[levelAt + by])}` : label}
                  disabled={!levels[levelAt + by]}
                  onClick={() => onStandOn(item.id, levels[levelAt + by])}
                  className={cn(iconButton, 'bg-fill-strong hover:bg-fill-stronger size-7')}
                >
                  <FontAwesomeIcon icon={icon} className="size-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The surface of each part is part of what the piece is. Only its
            color is the viewer's to pick. */}
        <div className={group}>
          <p className={groupTitle}>Colors</p>
          {Object.entries(kindColors(kind, item.variant)).map(([slot, fallback]) => (
            <label key={slot} className={cn(row, 'grid-cols-[96px_1fr_24px] capitalize')}>
              {slot}
              <input
                type="color"
                className={colorWell}
                value={item.colors?.[slot] ?? fallback}
                onChange={e => onUpdate(item.id, { colors: { ...item.colors, [slot]: e.target.value } })}
              />
              <ResetButton
                label={slot}
                changed={
                  item.colors?.[slot] !== undefined && item.colors[slot].toLowerCase() !== fallback.toLowerCase()
                }
                onReset={() => onUpdate(item.id, { colors: without(item.colors ?? {}, slot) })}
              />
            </label>
          ))}
        </div>

        {/* Every look the piece has, tried in the editor only. One with a
            device starts from the device and never changes the real one. */}
        {canTry(kind) && (
          <TrySection
            kind={kind}
            state={tries[item.id]}
            start={tryStart(item.id, kind)}
            accent={accent}
            onChange={s => onTry(item.id, s)}
          />
        )}

        {/* What in Home Assistant this piece stands for. Only entities that
            can drive at least one thing the item does are on offer, each
            listed with the controls it brings. */}
        <div className={group}>
          <p className={groupTitle}>Device</p>
          {kind.expresses.length === 0 ? (
            <p className={note}>This item shows nothing a device could drive, so it stands for nothing.</p>
          ) : (
            <>
              <Select
                aria-label="Device"
                value={boundDevice?.entity_id ?? ''}
                style={boundDevice ? { borderColor: EDITOR_BOUND_COLOR } : undefined}
                options={[
                  { value: '', label: 'None' },
                  // Each entity says what it brings, as the icons used
                  // everywhere else, and lists the pieces it already drives
                  // under its name: one to a line, since a device can stand
                  // behind several and that is worth seeing before adding
                  // one more.
                  ...fits.map(e => ({
                    value: e.entity_id,
                    label: e.name,
                    keywords: e.entity_id,
                    area: e.area_name ?? undefined,
                    device: e.device_name ?? undefined,
                    badge: hass ? (
                      <Signals signals={deviceSignals(hass, e.entity_id)} size="sm" accent={accent} />
                    ) : undefined,
                    detail:
                      driving(e.entity_id).length > 0 ? (
                        <span className="text-label-2 block text-xs">
                          {driving(e.entity_id).map(d => (
                            <span key={d.id} className="block truncate">
                              {d.label}
                            </span>
                          ))}
                        </span>
                      ) : undefined,
                  })),
                ]}
                onChange={v => onBind(item.id, v || null)}
              />
              {fits.length === 0 && <p className={note}>Nothing in Home Assistant drives what this item shows.</p>}
              {boundDevice && (
                <>
                  <Signals signals={boundSignals} accent={accent} />
                  {/* Which of the device's percentages drives each of the
                      item's: how far it opens, how far it tilts. Only worth
                      asking when there is a choice to make. */}
                  {channels.length > 0 &&
                    (channels.length > 1 || itemLevels(kind).length > 1) &&
                    itemLevels(kind).map(level => (
                      <label key={level.id} className={cn(row, 'grid-cols-[96px_1fr]')}>
                        {level.label}
                        <Select
                          aria-label={level.label}
                          value={boundDevice.levels?.[level.id] ?? ''}
                          options={[
                            {
                              value: '',
                              label: level.id === 'tilt' ? 'None' : (channels[0]?.label ?? 'None'),
                            },
                            ...channels.map(ch => ({ value: ch.id, label: ch.label })),
                          ]}
                          onChange={v =>
                            onDeviceLevels(boundDevice.entity_id, { ...boundDevice.levels, [level.id]: v })
                          }
                        />
                      </label>
                    ))}
                  {/* The other pieces this same device drives. A row goes to
                      that piece, the bin lets go of it. */}
                  {siblings.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      <p className={cn(groupTitle, 'mt-1 mb-0.5')}>Also driving</p>
                      {siblings.map(other => {
                        const k = decorationKind(other.kind)
                        const room = rooms.find(r => r.id === other.room)
                        return (
                          <div key={other.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelect(other.id)}
                              className="hover:bg-fill-strong active:bg-fill-stronger flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-[13px] transition-colors"
                            >
                              <FontAwesomeIcon
                                icon={decorationIcon(other.kind, k?.family ?? 'decor')}
                                className="text-label-2 size-3.5 shrink-0"
                              />
                              <span className="min-w-0 flex-1 truncate">{k?.label ?? other.kind}</span>
                              {room && <span className="text-label-2 shrink-0 text-xs">{room.name ?? room.id}</span>}
                            </button>
                            <button
                              type="button"
                              aria-label={`Unbind ${k?.label ?? other.kind}`}
                              onClick={() => setUnbinding(other)}
                              className="text-danger/70 hover:bg-danger/10 hover:text-danger flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
                            >
                              <FontAwesomeIcon icon={faTrash} className="size-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <label className={cn(row, 'grid-cols-[1fr_auto]')}>
                    Only show its state
                    <Switch
                      checked={!!item.show_only}
                      accent={accent}
                      label="Only show its state"
                      onChange={on => onUpdate(item.id, { show_only: on || undefined })}
                    />
                  </label>
                  <p className={note}>
                    {item.show_only
                      ? "Clicking this item in 3D opens the device's own dialog in Home Assistant, and never switches it."
                      : "Clicking this item in 3D acts on the device. Right click it, or hold it on a touch screen, for the device's own dialog in Home Assistant, where brightness, color and the rest live."}
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <button type="button" onClick={() => onRemove(item.id)} className={deleteButton}>
          <FontAwesomeIcon icon={faTrash} className="size-3.5" />
          Delete {kind.label}
        </button>

        <AlertDialog open={unbinding !== null} onOpenChange={open => !open && setUnbinding(null)}>
          <AlertDialogHeader>
            <AlertDialogTitle>Let go of this piece?</AlertDialogTitle>
            <AlertDialogDescription>
              {decorationKind(unbinding?.kind ?? '')?.label ?? 'The item'} stops standing in for this device. The piece
              itself stays on the plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUnbinding(null)}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (unbinding) onBind(unbinding.id, null)
                setUnbinding(null)
              }}
            >
              Unbind
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialog>
      </div>
    )
  }

  const families = [...new Set(DECORATION_KINDS.map(k => k.family))]
  const mine = modelKinds(models)
  const piecesOf = (kind: DecorationKind) => decorations.filter(d => d.kind === kind.id).length
  const previewItem: DecorationConfig | null = hovered
    ? { id: 'preview', kind: hovered.id, room: '', position: [0, 0] }
    : null

  return (
    <div className="flex flex-col gap-3">
      {rooms.length === 0 && (
        <p className="bg-fill text-label-2 rounded-xl px-3 py-2.5 text-[13px]">
          Draw a room first, with the draw tool.
        </p>
      )}

      <Sticky>
        <div ref={previewBox} {...previewShape}>
          {previewItem ? (
            <ModelPreview item={previewItem} className="h-full w-full" />
          ) : (
            <div className="text-label-2 flex h-full items-center justify-center text-xs">
              Hover an item to preview it
            </div>
          )}
        </div>
        <PreviewHandle onDrag={resize} />
        <div className="relative flex min-w-0 items-center">
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="text-label-2 pointer-events-none absolute left-2.5 size-3"
          />
          <input
            className={cn(field, 'h-9 w-full rounded-[10px] pr-8 pl-8')}
            placeholder="Search items"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear the search"
              onClick={() => setQuery('')}
              className="bg-label-2/60 hover:bg-label-2 absolute right-2 flex size-[18px] items-center justify-center rounded-full text-(--card-background-color) transition-colors"
            >
              <FontAwesomeIcon icon={faXmark} className="size-2.5" />
            </button>
          )}
        </div>
      </Sticky>

      {/* The models brought in from a file, first since they are the
          viewer's own, with the way to bring in another under them. */}
      {(() => {
        const q = query.trim().toLowerCase()
        const familyMatch = !!q && 'my models'.includes(q)
        const shown = mine.filter(k => !q || familyMatch || k.label.toLowerCase().includes(q))
        if (q && shown.length === 0) return null
        return (
          <div className="flex flex-col gap-1.5">
            <p className={cn(groupTitle, 'px-2')}>{FAMILY_LABELS[MODEL_FAMILY]}</p>
            <div className="bg-fill flex flex-col overflow-hidden rounded-xl p-1">
              {shown.map(k => (
                <div
                  key={k.id}
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg transition-colors',
                    hovered?.id === k.id && 'bg-fill-strong',
                  )}
                  onMouseEnter={() => setHovered(k)}
                  onMouseLeave={() => setHovered(h => (h?.id === k.id ? null : h))}
                >
                  <button
                    type="button"
                    disabled={rooms.length === 0}
                    aria-label={`Add ${k.label}`}
                    onClick={() => onAdd(k)}
                    className="active:bg-fill-stronger grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default"
                  >
                    <span className="bg-fill-strong flex size-7 items-center justify-center rounded-[7px]">
                      <FontAwesomeIcon icon={decorationIcon(k.id, k.family)} className="text-label-2 size-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-(--primary-text-color)">{k.label}</p>
                      <p className="text-label-2 truncate text-[11px] capitalize">{k.mount}</p>
                    </div>
                    {rooms.length > 0 ? (
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full transition-colors',
                          hovered?.id === k.id ? 'bg-tint/22' : 'bg-tint/12',
                        )}
                        style={{ color: accent }}
                      >
                        <FontAwesomeIcon icon={faPlus} className="size-3" />
                      </span>
                    ) : (
                      <span />
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${k.label} from my models`}
                    title="Remove from my models"
                    onClick={() => setRemoving(k)}
                    className="text-label-2 hover:bg-danger/10 hover:text-danger mr-1 flex size-7 items-center justify-center rounded-lg transition-colors"
                  >
                    <FontAwesomeIcon icon={faTrash} className="size-3" />
                  </button>
                </div>
              ))}
              {!q && (
                <div className={cn('flex flex-col gap-2 p-1', shown.length > 0 && 'pt-2')}>
                  <div className="grid grid-cols-[1fr_auto] gap-1.5">
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => fileInput.current?.click()}
                      className={cn(plainButton, 'w-full')}
                    >
                      <FontAwesomeIcon icon={faFileImport} className="size-3" />
                      {importing ? 'Importing...' : 'Import a model'}
                    </button>
                    <button
                      type="button"
                      aria-label="Link to a model file"
                      title="Link to a file in your www folder"
                      aria-pressed={linking}
                      disabled={importing}
                      onClick={() => setLinking(on => !on)}
                      className={cn(plainButton, 'w-9 px-0', linking && 'bg-tint/22')}
                    >
                      <FontAwesomeIcon icon={faLink} className="size-3" />
                    </button>
                  </div>
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept=".glb,.gltf,.bin,model/gltf-binary,model/gltf+json,image/*"
                    className="hidden"
                    onChange={e => {
                      const files = [...(e.target.files ?? [])]
                      e.target.value = ''
                      if (files.length > 0) void bring(() => importFiles(files, models))
                    }}
                  />
                  {linking && (
                    <form
                      className="grid grid-cols-[1fr_auto] gap-1.5"
                      onSubmit={e => {
                        e.preventDefault()
                        if (link.trim()) void bring(() => importLink(link, models))
                      }}
                    >
                      <input
                        className={field}
                        aria-label="Model link"
                        placeholder="/local/models/chair.glb"
                        value={link}
                        onChange={e => setLink(e.target.value)}
                      />
                      <button type="submit" disabled={importing || !link.trim()} className={plainButton}>
                        Add
                      </button>
                    </form>
                  )}
                  {importError ? (
                    <p className="text-danger text-xs leading-snug">{importError}</p>
                  ) : (
                    <p className={note}>
                      {linking
                        ? 'A file in your Home Assistant www folder, read by every screen that shows the card.'
                        : "A .glb or .gltf file, kept in the card so it shows on every screen. It is drawn in the card's own colors, a color for each of its parts."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {families.map(family => {
        // A family name matches everything in it, so searching kitchen
        // lists the whole kitchen.
        const q = query.trim().toLowerCase()
        const familyMatch = !!q && (FAMILY_LABELS[family] ?? family).toLowerCase().includes(q)
        const shown = DECORATION_KINDS.filter(
          k => k.family === family && (!q || familyMatch || k.label.toLowerCase().includes(q)),
        )
        if (shown.length === 0) return null
        return (
          <div key={family} className="flex flex-col gap-1.5">
            <p className={cn(groupTitle, 'px-2')}>{FAMILY_LABELS[family] ?? family}</p>
            <div className="bg-fill flex flex-col overflow-hidden rounded-xl p-1">
              {shown.map(k => (
                // The whole row adds the piece, not the plus alone: the plus
                // is what the row does, not the only place it can be asked.
                <button
                  key={k.id}
                  type="button"
                  disabled={rooms.length === 0}
                  aria-label={`Add ${k.label}`}
                  onMouseEnter={() => setHovered(k)}
                  onMouseLeave={() => setHovered(h => (h?.id === k.id ? null : h))}
                  onClick={() => onAdd(k)}
                  className={cn(
                    'active:bg-fill-stronger grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors disabled:cursor-default',
                    hovered?.id === k.id && 'bg-fill-strong',
                  )}
                >
                  <span className="bg-fill-strong flex size-7 items-center justify-center rounded-[7px]">
                    <FontAwesomeIcon icon={decorationIcon(k.id, k.family)} className="text-label-2 size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-[13px] text-(--primary-text-color)">
                      <span className="truncate">{k.label}</span>
                      <Signals signals={k.expresses} size="sm" />
                    </p>
                    <p className="text-label-2 truncate text-[11px] capitalize">{k.mount}</p>
                  </div>
                  {rooms.length > 0 ? (
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full transition-colors',
                        hovered?.id === k.id ? 'bg-tint/22' : 'bg-tint/12',
                      )}
                      style={{ color: accent }}
                    >
                      <FontAwesomeIcon icon={faPlus} className="size-3" />
                    </span>
                  ) : (
                    <span />
                  )}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      <AlertDialog open={removing !== null} onOpenChange={open => !open && setRemoving(null)}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {removing?.label ?? 'this model'}?</AlertDialogTitle>
          <AlertDialogDescription>
            {removing && piecesOf(removing) > 0
              ? `It leaves your models, and the ${piecesOf(removing) === 1 ? 'piece' : `${piecesOf(removing)} pieces`} of it on the plan go with it.`
              : 'It leaves your models. Nothing on the plan uses it.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setRemoving(null)}>Keep it</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              const id = removing ? modelIdOf(removing.id) : null
              if (id) onRemoveModel(id)
              setRemoving(null)
            }}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialog>
    </div>
  )
}
