import { aspectRatioNumber } from '#/lib/aspect.ts'
import { BACKGROUNDS, DEFAULT_BACKGROUND, PLAIN_SWATCH, THEME_BACKGROUND } from '#/lib/background.ts'
import { setDevSettings, useDevSettings } from '#/lib/devSettings.ts'
import { setPreviewRoom } from '#/lib/previewRoom.ts'
import { screenName, thisScreen, withScreen } from '#/lib/screen.ts'
import { cn } from '#/lib/utils.ts'
import { field, group, groupTitle, note } from '#/editor/look.ts'
import ControlsGuide from '#/editor/ControlsGuide.tsx'
import { ResetButton, Slider, Switch } from '#/editor/panel.tsx'
import { SUN_DIRECTION_DEG } from '#/constants.ts'
import { EDITOR_TINT_COLOR } from '#/theme.ts'
import { entityName } from '#/devices/catalog.ts'
import type { BackgroundConfig, CardConfig, HomeAssistant, HomeConfig, RoomConfig, TileChoice, TileChoices } from '#/types.ts'
import {
  autoTiles,
  choicesOf,
  keyEntity,
  panelRooms,
  panelWidgets,
  widgetKey,
  type AutoCard,
  type PanelWidget,
} from '#/tiles/auto.ts'
import { choiceFor, labelled, labelsOf, setupKey, TilePicker, type Labels } from '#/editor/TilePicker.tsx'
import { IconPicker } from '#/editor/IconPicker.tsx'
import { WidgetGrid } from '#/editor/WidgetGrid.tsx'
import { Icon } from '#/tiles/Icon.tsx'
import { defaultIcon } from '#/tiles/icons.ts'
import {
  faArrowLeft,
  faChevronDown,
  faChevronUp,
  faCirclePlus,
  faEyeSlash,
  faLocationArrow,
  faMagnifyingGlass,
  faPenRuler,
  faSpinner,
  faTableCellsLarge,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  onChange: (config: CardConfig) => void
  opening: boolean
  onOpen: () => void
}

// What the card's tab in Home Assistant's dialog shows: the way into the
// editor first, then how the card answers a click and where its light
// comes from, then the side panel and what goes in it, the background, and
// how to move the view last.
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

export default function CardPanel({ hass, config, onChange, opening, onOpen }: Props) {
  const rooms = config.rooms ?? []
  const sidePanel = config.side_panel === true
  // The page of widgets, in place of the settings, and on top of it the
  // tile whose card is being picked. Going back from either scrolls to what
  // opened it.
  const [widgets, setWidgets] = useState(false)
  const [choosing, setChoosing] = useState<Choosing | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const back = useRef<string | null>(null)
  const choose = (room: string | null, id: string, index: number) => {
    back.current = null
    setPreviewRoom(room)
    setChoosing({ room, id, index })
  }
  const close = () => {
    if (choosing) back.current = `[data-choose="${CSS.escape(widgetKey(choosing.id, choosing.index))}"]`
    setChoosing(null)
  }
  const openWidgets = (on: boolean) => {
    back.current = on ? null : '[data-open="widgets"]'
    setPreviewRoom(null)
    setWidgets(on)
  }
  useLayoutEffect(() => {
    if (back.current) root.current?.querySelector(back.current)?.scrollIntoView({ block: 'center' })
    else root.current?.scrollIntoView({ block: 'start' })
  }, [choosing, widgets])
  // The preview starts on the whole home each time the settings open.
  useEffect(() => () => setPreviewRoom(null), [])

  // What a click on a device goes to first in the card. Devices first is
  // what the card does when nothing is said, so it is not written down.
  const roomsFirst = config.first_click === 'room'
  const setRoomsFirst = (on: boolean) => {
    const { first_click: _, ...rest } = config
    onChange(on ? { ...rest, first_click: 'room' } : rest)
  }

  // Which way the sun comes from, left out of the YAML at its default.
  const sun = config.sun_direction ?? SUN_DIRECTION_DEG
  const setSun = (degrees: number) => {
    const { sun_direction: _, ...rest } = config
    onChange(degrees === SUN_DIRECTION_DEG ? rest : { ...rest, sun_direction: degrees })
  }

  // How tall the diorama is on a phone, in percent of its width. With
  // nothing said it is square, or the card's own shape when one is given,
  // so square is only left out of the YAML when nothing else is given.
  const wideShape = config.aspect_ratio && config.aspect_ratio !== 'fill' ? config.aspect_ratio : undefined
  const tall = Math.round(100 / aspectRatioNumber(config.aspect_ratio_mobile ?? wideShape ?? '1:1'))
  const setTall = (percent: number) => {
    const { aspect_ratio_mobile: _, ...rest } = config
    const d = gcd(100, percent)
    onChange(percent === 100 && !wideShape ? rest : { ...rest, aspect_ratio_mobile: `${100 / d}:${percent / d}` })
  }

  // Whether the Diorama tiles elsewhere on the dashboard follow the room
  // in view. Off is the default, so it is not written down.
  const filterTiles = config.filter_tiles === true
  const setFilterTiles = (on: boolean) => {
    const { filter_tiles: _, ...rest } = config
    onChange(on ? { ...rest, filter_tiles: true } : rest)
  }

  // The rooms the view of the whole home frames. None chosen frames them
  // all, so an empty list is not written down.
  const framed = config.frame_rooms ?? []
  const setFramed = (id: string, on: boolean) => {
    const next = on ? [...framed, id] : framed.filter(other => other !== id)
    const { frame_rooms: _, ...rest } = config
    onChange(
      next.length > 0 ? { ...rest, frame_rooms: rooms.map(room => room.id).filter(r => next.includes(r)) } : rest,
    )
  }

  // A room's name, or the area's when it is left empty.
  const renameRoom = (roomId: string, name: string) =>
    onChange({
      ...config,
      rooms: rooms.map(room => {
        if (room.id !== roomId) return room
        const { name: _, ...rest } = room
        return name ? { ...rest, name } : rest
      }),
    })

  // How much of the screen the diorama takes beside the tiles and over
  // them, on this screen only. Nothing is written down at the defaults.
  const screenSizes = thisScreen(config)
  const setScreen = (key: 'width' | 'height', value: number | undefined) =>
    onChange(withScreen(config, { [key]: value }))

  const setSidePanel = (on: boolean) => {
    const { side_panel: _, ...rest } = config
    onChange(on ? { ...rest, side_panel: true } : rest)
  }

  // Writes a room's entities, tile order and chosen cards, leaving out what
  // is empty so the YAML stays as short as it was.
  const setRoom = (roomId: string, lists: RoomLists) => {
    const next = rooms.map(room => {
      if (room.id !== roomId) return room
      const updated: RoomConfig = { ...room, ...lists }
      if (!updated.entities?.length) delete updated.entities
      if (!updated.order?.length) delete updated.order
      if (!updated.hidden?.length) delete updated.hidden
      if (!Object.keys(updated.tiles ?? {}).length) delete updated.tiles
      return updated
    })
    onChange({ ...config, rooms: next })
  }

  // Moves a room up or down the side panel, by one place.
  const ordered = panelRooms(config)
  const moveRoom = (roomId: string, by: number) => {
    const ids = ordered.map(room => room.id)
    const from = ids.indexOf(roomId)
    ids.splice(from, 1)
    ids.splice(from + by, 0, roomId)
    onChange({ ...config, room_order: ids })
  }

  // Writes the home section, leaving out what is empty so the YAML stays
  // as short as it was.
  const home = config.home ?? {}
  const homeEntities = home.entities ?? []
  const homeWidgets = panelWidgets(config, null)
  const setHome = (changes: HomeConfig) => {
    const next: HomeConfig = { ...home, ...changes }
    if (!next.name) delete next.name
    if (!next.show_rooms) delete next.show_rooms
    if (!next.entities?.length) delete next.entities
    if (!Object.keys(next.tiles ?? {}).length) delete next.tiles
    const { home: _, ...rest } = config
    onChange(Object.keys(next).length ? { ...rest, home: next } : rest)
  }

  // Writes the background for one mode, leaving out the default so the YAML
  // stays as short as it was.
  const setBackground = (mode: 'light' | 'dark', id: string) => {
    const next: BackgroundConfig = { ...config.background, [mode]: id }
    if (next[mode] === DEFAULT_BACKGROUND) delete next[mode]
    writeBackground(next)
  }
  // Turned off, the card lays no background, but keeps the ones picked for
  // when it is turned on again.
  const showBackground = config.background?.show !== false
  const setShowBackground = (on: boolean) => {
    const { show: _, ...next }: BackgroundConfig = { ...config.background }
    writeBackground(on ? next : { show: false, ...next })
  }
  const writeBackground = (next: BackgroundConfig) => {
    const { background: _, ...rest } = config
    onChange(Object.keys(next).length ? { ...rest, background: next } : rest)
  }

  // An entity has one place: a piece on the plan, or one room's list.
  const taken = [
    ...(config.devices ?? []).map(device => device.entity_id),
    ...rooms.flatMap(room => room.entities ?? []),
  ]

  const light = hass?.themes?.darkMode === false || undefined
  const picking = choosing && hass && pickPage(hass, config, choosing)
  if (picking) {
    const { auto, tiles, room } = picking
    const id = choosing!.id
    const picked = choicesOf(tiles, id)
    // The widget whose pen opened the page, or the last one left once
    // others are taken away.
    const editing = Math.min(choosing!.index, picked.length - 1)
    const labels = labelsOf(picked[editing])
    // A widget taken away leaves the order naming the entity no more times
    // than it has widgets.
    const save = (picked: (TileChoice | undefined)[]) => {
      const next = withChoices(tiles, id, auto, picked)
      if (room) setRoom(room.id, { tiles: next, order: room.order && trimmed(room.order, id, picked.length) })
      else setHome({ tiles: next, entities: trimmed(homeEntities, id, picked.length) })
    }
    const setLabels = (changes: Labels) => {
      const next = [...picked]
      next[editing] = labelled(picked[editing] ?? spelled(auto), { ...labels, ...changes })
      save(next)
    }
    const own = entityName(hass, id)
    return (
      <Page
        root={root}
        light={light}
        title={labels.name ?? own}
        subtitle={`Its widgets in the side panel, ${room ? roomName(hass, room) : home.name || 'Home'}`}
        onBack={close}
        onDone={close}
      >
        <div className={group}>
          <p className={groupTitle}>{picked.length > 1 ? `Widget ${editing + 1} of ${picked.length}` : 'Widget'}</p>
          <label className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-2 text-[13px]">
            <span>Name</span>
            <input
              type="text"
              value={labels.name ?? ''}
              placeholder={own}
              aria-label="Name"
              onChange={event => setLabels({ name: event.target.value })}
              className={field}
            />
          </label>
          <div className="grid grid-cols-[52px_minmax(0,1fr)] items-start gap-2 text-[13px]">
            <span className="leading-8">Icon</span>
            <IconPicker
              value={labels.icon}
              fallback={fallbackIcon(hass, auto)}
              onChange={icon => setLabels({ icon })}
            />
          </div>
          <p className={note}>Shown on this widget in place of the entity's own. Left empty, it keeps them.</p>
        </div>
        <p className={cn(groupTitle, 'pt-2')}>Card</p>
        <TilePicker hass={hass} auto={auto} picked={picked} editing={editing} onChange={save} />
      </Page>
    )
  }

  if (widgets && sidePanel)
    return (
      <Page
        root={root}
        light={light}
        title="Widgets"
        subtitle="The side panel as it will look"
        onBack={() => openWidgets(false)}
      >
        <div className="flex flex-col gap-8 pt-2">
          <div className="flex flex-col gap-3" {...showsInPreview(null)}>
            <HeadingInput value={home.name ?? ''} placeholder="Home" label="Home" onChange={name => setHome({ name })} />
            {hass && homeEntities.length > 0 && (
              <WidgetGrid
                hass={hass}
                widgets={homeWidgets.map(widget => ({
                  ...gridWidget(widget),
                  onRemove: () =>
                    setHome({
                      entities: homeEntities.filter(other => other !== widget.entity),
                      tiles: without(home.tiles, widget.entity),
                    }),
                }))}
                onReorder={keys => {
                  const { order, tiles } = reordered(keys, homeWidgets, home.tiles)
                  setHome({ entities: order, tiles })
                }}
                onSize={(key, choice) => setHome({ tiles: resized(homeWidgets, home.tiles, key, choice) })}
                onEdit={(entity, index) => choose(null, entity, index)}
              />
            )}
            {hass && (
              <EntityPicker
                hass={hass}
                exclude={homeEntities}
                onPick={id => !homeEntities.includes(id) && setHome({ entities: [...homeEntities, id] })}
              />
            )}
          </div>
          {ordered.map((room, i) => (
            <RoomEntities
              key={room.id}
              hass={hass}
              config={config}
              room={room}
              taken={taken}
              onChange={lists => setRoom(room.id, lists)}
              onRename={name => renameRoom(room.id, name)}
              onUp={i > 0 ? () => moveRoom(room.id, -1) : undefined}
              onDown={i < ordered.length - 1 ? () => moveRoom(room.id, 1) : undefined}
              onChoose={(id, index) => choose(room.id, id, index)}
            />
          ))}
        </div>
      </Page>
    )

  return (
    <div
      ref={root}
      data-light={light}
      className="dio-editor font-system flex flex-col gap-6 px-5 py-6 text-(--primary-text-color) antialiased"
    >
      <Section title="Diorama">
        <div className={cn(group, 'flex-row items-center gap-3')}>
          <span className="bg-tint-fill flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white">
            <FontAwesomeIcon icon={faPenRuler} className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-semibold">Diorama editor</span>
            <span className="text-label-2 truncate text-xs">Rooms, furniture and devices</span>
          </span>
          <button
            type="button"
            onClick={onOpen}
            disabled={opening}
            aria-busy={opening}
            className="bg-tint-fill flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold text-white transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.97] disabled:cursor-progress disabled:opacity-70"
          >
            {opening && <FontAwesomeIcon icon={faSpinner} spin className="size-3" />}
            {opening ? 'Opening…' : 'Open editor'}
          </button>
        </div>
      </Section>

      <Section title="In the card">
        <div className={cn(group, 'gap-0 py-0')}>
          <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px]">Rooms first</span>
              <span className="text-label-2 text-xs">
                On, tap a room before its devices. Off, tap any device straight away
              </span>
            </span>
            <Switch checked={roomsFirst} accent={EDITOR_TINT_COLOR} label="Rooms first" onChange={setRoomsFirst} />
          </label>
          <label className="border-separator flex cursor-pointer items-center justify-between gap-4 border-t py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px]">Hide other rooms' widgets</span>
              <span className="text-label-2 text-xs">
                With a room in view, the Diorama widgets on the dashboard from other areas hide
              </span>
            </span>
            <Switch
              checked={filterTiles}
              accent={EDITOR_TINT_COLOR}
              label="Hide other rooms' widgets"
              onChange={setFilterTiles}
            />
          </label>
          <div className="border-separator flex flex-col gap-2 border-t py-3">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon
                icon={faLocationArrow}
                className="text-label-2 size-3"
                // The arrow points the way the light falls, away from the sun.
                style={{ transform: `rotate(${sun + 135}deg)` }}
              />
              <span className="flex-1 text-[13px]">Sun from the {compass(sun)}</span>
              <span className="text-label-2 text-xs tabular-nums">{sun}°</span>
              <ResetButton
                label="Sun direction"
                changed={sun !== SUN_DIRECTION_DEG}
                onReset={() => setSun(SUN_DIRECTION_DEG)}
              />
            </div>
            <Slider
              aria-label="Sun direction"
              className="w-full"
              min={0}
              max={355}
              step={5}
              value={sun}
              onChange={e => setSun(Number(e.target.value))}
            />
          </div>
          <div className="border-separator flex flex-col gap-2 border-t py-3">
            <div className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px]">Height on a phone</span>
                <span className="text-label-2 text-xs">On a card narrower than 600 px, over the side panel too</span>
              </span>
              <span className="text-label-2 text-xs tabular-nums">{tall}%</span>
              <ResetButton
                label="Height on a phone"
                changed={config.aspect_ratio_mobile !== undefined}
                onReset={() => {
                  const { aspect_ratio_mobile: _, ...rest } = config
                  onChange(rest)
                }}
              />
            </div>
            <Slider
              aria-label="Height on a phone"
              className="w-full"
              min={40}
              max={150}
              step={1}
              value={tall}
              onChange={e => setTall(Number(e.target.value))}
            />
          </div>
        </div>
      </Section>

      <Section title="Side panel">
        <div className={cn(group, 'gap-0 py-0')}>
          <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
            <span className="text-[13px]">Show widgets beside the 3D view</span>
            <Switch
              checked={sidePanel}
              accent={EDITOR_TINT_COLOR}
              label="Show widgets beside the 3D view"
              onChange={setSidePanel}
            />
          </label>
          {sidePanel && (
            <label className="border-separator flex cursor-pointer items-center justify-between gap-4 border-t py-2.5">
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px]">Show all widgets on the home view</span>
                <span className="text-label-2 text-xs">
                  With the whole home in view, every room's widgets follow the Home ones. Off, only the Home ones show.
                </span>
              </span>
              <Switch
                checked={home.show_rooms === true}
                accent={EDITOR_TINT_COLOR}
                label="Show all widgets on the home view"
                onChange={on => setHome({ show_rooms: on })}
              />
            </label>
          )}
          {sidePanel && (
            <>
              <ShareSlider
                label="3D width with widgets beside"
                hint={`On this screen only (${screenSizes?.name ?? screenName()})`}
                min={40}
                max={85}
                fallback={67}
                value={screenSizes?.width}
                onChange={value => setScreen('width', value)}
              />
              <ShareSlider
                label="3D height with widgets under"
                hint="On this screen only, in a panel view. Auto keeps the phone height above."
                min={25}
                max={85}
                fallback={55}
                value={screenSizes?.height}
                onChange={value => setScreen('height', value)}
              />
            </>
          )}
          {sidePanel && (
            <div className="border-separator flex items-center gap-3 border-t py-3">
              <span className="bg-tint-fill flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white">
                <FontAwesomeIcon icon={faTableCellsLarge} className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[13px] font-semibold">Widgets</span>
                <span className="text-label-2 truncate text-xs">Rooms and what each one shows</span>
              </span>
              <button
                type="button"
                data-open="widgets"
                onClick={() => openWidgets(true)}
                className="bg-tint-fill flex h-8 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-semibold text-white transition-[filter,transform] hover:brightness-[1.06] active:scale-[0.97]"
              >
                Edit widgets
              </button>
            </div>
          )}
        </div>
      </Section>

      {rooms.length > 0 && (
        <Section
          title="Framed rooms"
          subtitle="What the whole home's view zooms in on. None on frames them all."
        >
          <div className={cn(group, 'gap-0 py-0')}>
            {rooms.map((room, i) => {
              const name = roomName(hass, room)
              return (
                <label
                  key={room.id}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-4 py-2.5',
                    i > 0 && 'border-separator border-t',
                  )}
                >
                  <span className="truncate text-[13px]">{name}</span>
                  <Switch
                    checked={framed.includes(room.id)}
                    accent={EDITOR_TINT_COLOR}
                    label={`Frame ${name}`}
                    onChange={on => setFramed(room.id, on)}
                  />
                </label>
              )
            })}
          </div>
        </Section>
      )}

      <Section title="Background">
        <div className={cn(group, 'gap-0 py-0')}>
          <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
            <span className="flex min-w-0 flex-col">
              <span className="text-[13px]">Use a background</span>
              <span className="text-label-2 text-xs">Off, the dashboard keeps its own background.</span>
            </span>
            <Switch
              checked={showBackground}
              accent={EDITOR_TINT_COLOR}
              label="Use a background"
              onChange={setShowBackground}
            />
          </label>
          {showBackground && (
            <div className="border-separator flex flex-col gap-4 border-t py-3">
              <BackgroundPicker
                title="Light"
                mode="light"
                value={config.background?.light ?? DEFAULT_BACKGROUND}
                onChange={id => setBackground('light', id)}
              />
              <BackgroundPicker
                title="Dark"
                mode="dark"
                value={config.background?.dark ?? DEFAULT_BACKGROUND}
                onChange={id => setBackground('dark', id)}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Moving the view">
        <div className={cn(group, 'py-3')}>
          <ControlsGuide className="justify-start" />
        </div>
      </Section>

      <Footer />
    </div>
  )
}

// How many taps on the version, each soon after the last, open or close the
// developer settings.
const DEV_TAPS = 6
const DEV_TAP_GAP_MS = 1000

// The card's name and version at the foot of the settings. Tapping the
// version six times shows the developer settings below it, and six more
// hide them again.
function Footer() {
  const dev = useDevSettings()
  const taps = useRef({ count: 0, last: 0 })
  const tap = () => {
    const now = performance.now()
    const t = taps.current
    t.count = now - t.last < DEV_TAP_GAP_MS ? t.count + 1 : 1
    t.last = now
    if (t.count < DEV_TAPS) return
    t.count = 0
    setDevSettings({ open: !dev.open })
  }
  return (
    <footer className="flex flex-col gap-6 pt-2">
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-label-2 text-[13px] font-semibold">Diorama</span>
        <button
          type="button"
          onClick={tap}
          className="text-label-2 cursor-default text-xs tabular-nums select-none"
        >
          v{__CARD_VERSION__}
        </button>
      </div>
      {dev.open && (
        <div className="dio-rise">
          <Section title="Developer settings">
            <div className={cn(group, 'gap-0 py-0')}>
              <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px]">Frames per second</span>
                  <span className="text-label-2 text-xs">
                    How many frames the card draws each second, in its top right corner, on this browser
                  </span>
                </span>
                <Switch
                  checked={dev.fps}
                  accent={EDITOR_TINT_COLOR}
                  label="Frames per second"
                  onChange={fps => setDevSettings({ fps })}
                />
              </label>
              <label className="border-separator flex cursor-pointer items-center justify-between gap-4 border-t py-2.5">
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px]">Performance mode on touch screens</span>
                  <span className="text-label-2 text-xs">
                    At most 24 frames a second and no shadows on a phone or tablet. Turn it off here for the full picture on this browser
                  </span>
                </span>
                <Switch
                  checked={dev.touchPerformance}
                  accent={EDITOR_TINT_COLOR}
                  label="Performance mode on touch screens"
                  onChange={touchPerformance => setDevSettings({ touchPerformance })}
                />
              </label>
            </div>
          </Section>
        </div>
      )}
    </footer>
  )
}

const POINTS = ['north', 'north east', 'east', 'south east', 'south', 'south west', 'west', 'north west']

// The nearest compass point to a bearing, for naming where the sun is.
function compass(degrees: number) {
  const turns = ((degrees % 360) + 360) % 360
  return POINTS[Math.round(turns / 45) % POINTS.length]
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-3">
        <h3 className="text-label-2 text-[13px] font-semibold">{title}</h3>
        {subtitle && <p className="text-label-2 text-xs leading-snug">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

// A page in place of the settings, with a way back to them at the top.
function Page({
  root,
  light,
  title,
  subtitle,
  onBack,
  onDone,
  children,
}: {
  root: RefObject<HTMLDivElement | null>
  light: true | undefined
  title: string
  subtitle: string
  onBack: () => void
  // A button kept at the foot of the page that goes back too.
  onDone?: () => void
  children: ReactNode
}) {
  return (
    <div
      ref={root}
      data-light={light}
      // The dialog's own color, so the page has no background of its own
      // and the header still hides the cards scrolled under it.
      style={
        {
          '--dio-surface': 'var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color)))',
        } as CSSProperties
      }
      className="dio-editor font-system flex min-h-full flex-col gap-3 px-4 pb-6 text-(--primary-text-color) antialiased"
    >
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 bg-(--dio-surface) px-4 pt-3 pb-2">
        {/* Said in words and filled, so the way back is plain to see. */}
        <button
          type="button"
          onClick={onBack}
          className="bg-tint-fill flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full pr-4 pl-3.5 text-[13px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.97]"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="size-3.5" />
          Back
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-[17px] font-semibold tracking-tight">{title}</h2>
          <p className="text-label-2 truncate text-xs">{subtitle}</p>
        </div>
      </header>
      {children}
      {onDone && (
        <footer className="sticky bottom-0 z-30 -mx-4 mt-auto bg-(--dio-surface) px-4 pt-3 pb-1">
          <button
            type="button"
            onClick={onDone}
            className="bg-tint-fill h-10 w-full cursor-pointer rounded-full text-[14px] font-semibold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
          >
            Done
          </button>
        </footer>
      )}
    </div>
  )
}

// A row of swatches, one for each background in the given mode and one for
// the theme's own, with the chosen one ringed.
function BackgroundPicker({
  title,
  mode,
  value,
  onChange,
}: {
  title: string
  mode: 'light' | 'dark'
  value: string
  onChange: (id: string) => void
}) {
  const options = [
    ...BACKGROUNDS.map(b => ({ id: b.id, name: b.name, swatch: b[mode] })),
    { id: THEME_BACKGROUND, name: 'Plain', swatch: PLAIN_SWATCH[mode] },
  ]
  return (
    <div className="flex flex-col gap-2">
      <p className="px-0.5 text-[13px] font-medium">{title}</p>
      <div role="radiogroup" aria-label={`${title} background`} className="grid grid-cols-3 gap-x-2.5 gap-y-3">
        {options.map(option => {
          const chosen = option.id === value
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => onChange(option.id)}
              className="group flex cursor-pointer flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  'block aspect-[16/10] w-full rounded-[10px] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.12)] ring-offset-2 ring-offset-(--card-background-color) transition-[box-shadow,transform] group-active:scale-[0.97]',
                  chosen ? 'ring-tint ring-[2.5px]' : 'group-hover:ring-separator group-hover:ring-2',
                )}
                style={{ background: option.swatch }}
              />
              <span className={cn('text-xs', chosen ? 'text-tint font-semibold' : 'text-label-2')}>{option.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function roomName(hass: HomeAssistant | null, room: RoomConfig) {
  return room.name ?? (room.area_id && hass?.areas[room.area_id]?.name) ?? room.id
}

// A press or the focus anywhere in a group of tiles takes the preview to
// the room they are for, or back to the whole home, so a tile added, moved
// or taken away is seen where it lands.
const showsInPreview = (room: string | null) => ({
  onPointerDownCapture: () => setPreviewRoom(room),
  onFocusCapture: () => setPreviewRoom(room),
})

function RoomEntities({
  hass,
  config,
  room,
  taken,
  onChange,
  onRename,
  onUp,
  onDown,
  onChoose,
}: {
  hass: HomeAssistant | null
  config: CardConfig
  room: RoomConfig
  taken: string[]
  onChange: (lists: RoomLists) => void
  onRename: (name: string) => void
  // Moves the room a place up or down the panel, none at either end.
  onUp?: () => void
  onDown?: () => void
  onChoose: (id: string, index: number) => void
}) {
  const extra = room.entities ?? []
  const hidden = room.hidden ?? []
  const tiles = [...autoTiles(config, room)]
  const shown = panelWidgets(config, room).filter(widget => !hidden.includes(widget.entity))
  const remove = (id: string) =>
    onChange({
      entities: extra.filter(other => other !== id),
      order: room.order?.filter(other => other !== id),
      tiles: without(room.tiles, id),
    })
  const hide = (id: string, on: boolean) =>
    onChange({ hidden: on ? [...hidden, id] : hidden.filter(other => other !== id) })

  return (
    <div className="flex flex-col gap-3" {...showsInPreview(room.id)}>
      <div className="flex items-center gap-2">
        <HeadingInput
          value={room.name ?? ''}
          placeholder={roomName(hass, { ...room, name: undefined })}
          label={`${roomName(hass, room)} name`}
          onChange={onRename}
        />
        <button type="button" aria-label={`Move ${roomName(hass, room)} up`} title="Move up" disabled={!onUp} onClick={onUp} className={arrow}>
          <FontAwesomeIcon icon={faChevronUp} className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label={`Move ${roomName(hass, room)} down`}
          title="Move down"
          disabled={!onDown}
          onClick={onDown}
          className={arrow}
        >
          <FontAwesomeIcon icon={faChevronDown} className="size-3.5" />
        </button>
      </div>
      {hass && shown.length > 0 && (
        <WidgetGrid
          hass={hass}
          widgets={shown.map(widget =>
            extra.includes(widget.entity)
              ? { ...gridWidget(widget), onRemove: () => remove(widget.entity) }
              : { ...gridWidget(widget), onHide: () => hide(widget.entity, true) },
          )}
          // The hidden ones keep their place after the rest.
          onReorder={keys => {
            const { order, tiles } = reordered(keys, shown, room.tiles)
            onChange({ order: [...order, ...hidden], tiles })
          }}
          onSize={(key, choice) => onChange({ tiles: resized(shown, room.tiles, key, choice) })}
          onEdit={onChoose}
        />
      )}
      {hass && hidden.length > 0 && (
        <ul className={cn(group, 'gap-0 py-0')} aria-label="Hidden from the side panel">
          {tiles
            .filter(([id]) => hidden.includes(id))
            .map(([id, auto], i) => {
              const name = entityName(hass, id)
              return (
                <li
                  key={id}
                  className={cn('flex items-center gap-2.5 py-2', i > 0 && 'border-separator border-t')}
                >
                  <span className="bg-fill-strong text-label-2 flex size-7 flex-none items-center justify-center rounded-md">
                    <Icon
                      icon={typeof auto.piece_icon === 'string' ? auto.piece_icon : entityIcon(hass, id)}
                      className="size-4 [--mdc-icon-size:16px] [&>svg]:size-full"
                    />
                  </span>
                  <span className="text-label-2 min-w-0 flex-1 truncate text-[13px]">{name}</span>
                  <button
                    type="button"
                    aria-label={`Show ${name} in the side panel`}
                    title="Show in the side panel"
                    onClick={() => hide(id, false)}
                    className="text-label-2 hover:bg-fill-strong flex size-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:text-(--primary-text-color)"
                  >
                    <FontAwesomeIcon icon={faEyeSlash} className="size-3.5" />
                  </button>
                </li>
              )
            })}
        </ul>
      )}
      {hass && <EntityPicker hass={hass} exclude={taken} onPick={id => onChange({ entities: [...extra, id] })} />}
    </div>
  )
}

// A room's or the home's name over its widgets, large as in the panel, and
// edited in place.
function HeadingInput({
  value,
  placeholder,
  label,
  onChange,
}: {
  value: string
  placeholder: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={event => onChange(event.target.value)}
      className={cn(
        heading,
        'hover:bg-fill focus:bg-fill placeholder:text-(--primary-text-color) -mx-1.5 min-w-0 rounded-lg px-1.5 outline-none',
      )}
    />
  )
}

// The icon a widget shows with none of its own, as a tile works it out.
function fallbackIcon(hass: HomeAssistant, auto: AutoCard) {
  const id = String(auto.entity)
  const state = hass.states[id]
  if (typeof state?.attributes.icon === 'string') return state.attributes.icon
  if (typeof auto.piece_icon === 'string') return auto.piece_icon
  return defaultIcon(id, state?.attributes.device_class, state?.state)
}

// The icon Home Assistant gives an entity.
function entityIcon(hass: HomeAssistant, id: string) {
  const state = hass.states[id]
  return typeof state?.attributes.icon === 'string'
    ? state.attributes.icon
    : defaultIcon(id, state?.attributes.device_class, state?.state)
}

// A room's or the home's heading over its widgets, large as in the panel.
const arrow =
  'bg-fill text-label-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[color,transform] hover:text-(--primary-text-color) active:scale-90 disabled:cursor-default disabled:opacity-35 disabled:hover:text-label-2 disabled:active:scale-100'

const heading = 'h-10 w-full truncate text-[26px] leading-10 font-bold tracking-[-0.02em] font-title'

type RoomLists = { entities?: string[]; order?: string[]; hidden?: string[]; tiles?: TileChoices }

// The chosen cards without the ones for an entity.
function without(tiles: TileChoices | undefined, id: string) {
  const { [id]: _, ...rest } = tiles ?? {}
  return rest
}

// A widget of the panel as the grid takes it.
const gridWidget = ({ key, entity, index, auto, choice }: PanelWidget) => ({ id: key, entity, index, auto, choice })

// The card the panel picks for an entity, written out as a choice.
function spelled({ type, size }: AutoCard): TileChoice {
  return size ? { type, size } : { type }
}

// The chosen cards with an entity's set to these, one for each of its
// widgets. One that is the card the panel picks anyway is left out, and
// with several it is written out in the list.
function withChoices(
  tiles: TileChoices | undefined,
  id: string,
  auto: AutoCard,
  picked: (TileChoice | undefined)[],
): TileChoices {
  const rest = without(tiles, id)
  const autoKey = setupKey(auto)
  if (picked.length === 1) {
    const choice = picked[0] && choiceFor(autoKey, picked[0])
    return choice ? { ...rest, [id]: choice } : rest
  }
  return { ...rest, [id]: picked.map(choice => choice ?? spelled(auto)) }
}

// The chosen cards with one widget's set to this.
function resized(widgets: PanelWidget[], tiles: TileChoices | undefined, key: string, choice: TileChoice | undefined) {
  const widget = widgets.find(other => other.key === key)!
  const picked = choicesOf(tiles, widget.entity)
  picked[widget.index] = choice
  return withChoices(tiles, widget.entity, widget.auto, picked)
}

// A section's widgets put in a new order: their entities, each named once
// for each of its widgets, and the cards of an entity with several put in
// the order its widgets now show.
function reordered(keys: string[], widgets: PanelWidget[], tiles: TileChoices | undefined) {
  const byKey = new Map(widgets.map(widget => [widget.key, widget]))
  let next = tiles
  for (const widget of widgets) {
    if (widget.index !== 1) continue
    const picked = keys.filter(key => keyEntity(key) === widget.entity).map(key => byKey.get(key)!.choice)
    next = withChoices(next, widget.entity, widget.auto, picked)
  }
  return { order: keys.map(keyEntity), tiles: next }
}

// An order naming an entity no more than this many times.
function trimmed(order: string[], id: string, most: number) {
  let seen = 0
  return order.filter(other => other !== id || ++seen <= Math.max(1, most))
}

// The entity whose cards are being picked, and which of its widgets opened
// the page.
type Choosing = { room: string | null; id: string; index: number }

// What the page for picking a tile's card needs: the tile the panel would
// make, the cards already picked beside it, and the room it is in, or none
// for the home.
function pickPage(hass: HomeAssistant, config: CardConfig, { room: roomId, id }: Choosing) {
  const room = roomId === null ? null : config.rooms?.find(other => other.id === roomId)
  if (room === undefined) return null
  const auto = autoTiles(config, room).get(id)
  if (!auto || !hass.states[id]) return null
  return { auto, room, tiles: room ? room.tiles : config.home?.tiles }
}

// How many matches the search lists at once. Typing narrows it further.
const PICKER_LIMIT = 50

// A button that opens a search over every entity in Home Assistant, right
// under it. Picking one hands it on and closes the search, ready for the
// next one. Arrows move through the matches, Enter picks and Escape closes.
function EntityPicker({
  hass,
  exclude,
  onPick,
}: {
  hass: HomeAssistant
  exclude: string[]
  onPick: (entityId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  // A press anywhere else closes it. The press is read from the event's
  // path, since the card's shadow root hides where it really landed.
  useEffect(() => {
    if (!open) return
    const away = (event: globalThis.PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) close()
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [open])

  // Every word typed has to be in the name or the id, in any order.
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = open
    ? Object.keys(hass.states)
        .filter(id => !exclude.includes(id))
        .map(id => ({ id, name: entityName(hass, id) }))
        .filter(({ id, name }) => {
          const text = `${name} ${id}`.toLowerCase()
          return words.every(word => text.includes(word))
        })
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, PICKER_LIMIT)
    : []
  const at = Math.min(active, Math.max(matches.length - 1, 0))

  useEffect(() => {
    list.current?.children[at]?.scrollIntoView({ block: 'nearest' })
  }, [at])

  const pick = (id: string) => {
    onPick(id)
    close()
  }

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((at + step + matches.length) % Math.max(matches.length, 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (matches[at]) pick(matches[at].id)
    } else if (event.key === 'Escape') {
      // Only the search closes, not Home Assistant's dialog around it.
      event.preventDefault()
      event.stopPropagation()
      close()
    }
  }

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-tint hover:bg-fill-strong active:bg-fill-stronger flex h-10 w-full items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium transition-colors"
      >
        <FontAwesomeIcon icon={faCirclePlus} className="size-4" />
        Add entity
      </button>
    )

  return (
    <div ref={root} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label className="bg-fill-strong focus-within:ring-tint/30 flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 transition-shadow focus-within:ring-3">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="text-label-2 size-3.5" />
          <input
            type="text"
            autoFocus
            value={query}
            placeholder="Search entities"
            aria-label="Search entities"
            role="combobox"
            aria-expanded
            aria-controls="dio-entity-matches"
            aria-activedescendant={matches[at] ? `dio-entity-${at}` : undefined}
            onChange={event => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKey}
            className="placeholder:text-label-2 min-w-0 flex-1 bg-transparent text-[13px] text-(--primary-text-color) outline-none"
          />
        </label>
        <button
          type="button"
          onClick={close}
          className="text-tint rounded-md px-1.5 py-1 text-[13px] font-medium transition-opacity hover:opacity-70"
        >
          Cancel
        </button>
      </div>
      {matches.length === 0 ? (
        <p className="text-label-2 px-3 py-2 text-[13px]">No entities match.</p>
      ) : (
        <ul
          ref={list}
          id="dio-entity-matches"
          role="listbox"
          className="bg-raised max-h-64 overflow-y-auto overscroll-contain rounded-lg py-1"
        >
          {matches.map(({ id, name }, index) => {
            const icon = entityIcon(hass, id)
            return (
              <li
                key={id}
                id={`dio-entity-${index}`}
                role="option"
                aria-selected={index === at}
                onPointerMove={() => index !== at && setActive(index)}
                onClick={() => pick(id)}
                className={cn(
                  'mx-1 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5',
                  index === at && 'bg-fill-strong',
                )}
              >
                <span className="bg-fill-strong text-label-2 flex size-7 flex-none items-center justify-center rounded-md">
                  <Icon icon={icon} className="size-4 [--mdc-icon-size:16px] [&>svg]:size-full" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px]">{name}</span>
                  <span className="text-label-2 truncate text-[11px]">{id}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// A share of the screen for the diorama, in percent, on this screen only.
// Unset, it shows where the default would be, or Auto when there is none.
function ShareSlider({
  label,
  hint,
  min,
  max,
  fallback,
  value,
  onChange,
}: {
  label: string
  hint: string
  min: number
  max: number
  fallback: number
  value: number | undefined
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className="border-separator flex flex-col gap-2 border-t py-3">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px]">{label}</span>
          <span className="text-label-2 text-xs">{hint}</span>
        </span>
        <span className="text-label-2 text-xs tabular-nums">{value === undefined ? 'Auto' : `${value}%`}</span>
        <ResetButton label={label} changed={value !== undefined} onReset={() => onChange(undefined)} />
      </div>
      <Slider
        aria-label={label}
        className="w-full"
        min={min}
        max={max}
        step={1}
        value={value ?? fallback}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  )
}
