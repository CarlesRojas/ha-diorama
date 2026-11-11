import { Select, type SelectOption } from '#/components/ui/select.tsx'
import { entityName } from '#/devices/catalog.ts'
import { group } from '#/editor/look.ts'
import {
  FOLLOW_ANYONE,
  FOLLOW_ME,
  followedPerson,
  followedRoom,
  followedSensor,
  personOfUser,
  roomSensors,
  sensorsOfPerson,
} from '#/lib/follow.ts'
import { screenName, thisScreen, withScreen } from '#/lib/screen.ts'
import { cn } from '#/lib/utils.ts'
import type { CardConfig, FollowConfig, HomeAssistant, RoomConfig } from '#/types.ts'

const OFF = ''
const AUTO = ''

type Props = {
  hass: HomeAssistant | null
  config: CardConfig
  onChange: (config: CardConfig) => void
  roomName: (room: RoomConfig) => string
}

// Who the card follows from room to room on this screen, and the sensor it
// learns their room from. Off unless turned on, screen by screen, so a
// tablet on the wall never moves on its own.
export function FollowSection({ hass, config, onChange, roomName }: Props) {
  const rooms = config.rooms ?? []
  const screen = thisScreen(config)
  const follow = screen?.follow
  const set = (next: FollowConfig | undefined) => onChange(withScreen(config, { follow: next }))

  const me = hass ? personOfUser(hass) : undefined
  const people = Object.keys(hass?.states ?? {}).filter(id => id.startsWith('person.'))
  const name = (id: string) => (hass ? entityName(hass, id) : id)
  const whoOptions: SelectOption[] = [
    { value: OFF, label: 'Off' },
    { value: FOLLOW_ME, label: me ? `Me (${name(me)})` : 'Me', detail: me ? undefined : 'No person is linked to you' },
    ...people.filter(id => id !== me).map(id => ({ value: id, label: name(id), keywords: id })),
    { value: FOLLOW_ANYONE, label: 'Anyone', detail: 'The only room with someone in it' },
  ]

  const person = hass && follow ? followedPerson(hass, follow) : undefined
  const found = hass && person ? sensorsOfPerson(hass, rooms, person) : []
  const sensors = hass ? [...new Set([...found, ...roomSensors(hass, rooms)])] : []
  if (follow?.sensor && !sensors.includes(follow.sensor)) sensors.push(follow.sensor)
  const sensorOptions: SelectOption[] = [
    { value: AUTO, label: found[0] ? `Found: ${name(found[0])}` : 'Found from the person' },
    ...sensors.map(id => ({ value: id, label: name(id), keywords: id })),
  ]

  const sensor = hass && follow ? followedSensor(hass, rooms, follow) : undefined
  const now = followedRoom(hass, config, follow)
  const nowRoom = rooms.find(room => room.id === now)
  const withPresence = rooms.filter(room => room.presence?.entity).length

  // What the card makes of it right now, or why it cannot follow.
  let status: string | undefined
  if (follow?.who === FOLLOW_ANYONE) {
    status =
      withPresence === 0
        ? 'No room has a presence sensor yet. Set one under Presence for each room in the editor.'
        : nowRoom
          ? `Someone is in ${roomName(nowRoom)} now.`
          : 'No single room has someone in it now, so the view stays.'
  } else if (follow) {
    status = !person
      ? 'No person is linked to the user logged in here.'
      : !sensor
        ? 'No sensor says which room they are in. Bermuda or ESPresense make one for a phone or a watch.'
        : nowRoom
          ? `In ${roomName(nowRoom)} now.`
          : 'Not in any room of the diorama now.'
  }

  return (
    <div className={cn(group, 'gap-0 py-0')}>
      <label className="flex items-center justify-between gap-4 py-2.5">
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px]">Follow</span>
          <span className="text-label-2 text-xs">On this screen only ({screen?.name ?? screenName()})</span>
        </span>
        <Select
          aria-label="Follow"
          className="w-44 shrink-0"
          value={follow?.who ?? OFF}
          options={whoOptions}
          onChange={who => set(who ? { who } : undefined)}
        />
      </label>
      {follow && follow.who !== FOLLOW_ANYONE && (
        <label className="border-separator flex items-center justify-between gap-4 border-t py-2.5">
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px]">Their location</span>
            <span className="text-label-2 text-xs">From their phone or watch, like Bermuda's area sensor</span>
          </span>
          <Select
            aria-label="Their location"
            className="w-44 shrink-0"
            value={follow.sensor ?? AUTO}
            options={sensorOptions}
            onChange={value => set(value ? { ...follow, sensor: value } : { who: follow.who })}
          />
        </label>
      )}
      <p className={cn('text-label-2 text-xs leading-snug', follow && 'border-separator border-t', 'py-2.5')}>
        {status ? `${status} ` : ''}
        The view flies to their room when they move, and waits a minute after you last touched the card.
      </p>
    </div>
  )
}
