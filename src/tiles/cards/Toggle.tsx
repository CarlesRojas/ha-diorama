import { formatPower, powerOf } from '#/signals.ts'
import { callService, type TileEnv } from '#/tiles/actions.ts'
import { ConfirmTile } from '#/tiles/cards/Confirm.tsx'
import { FillTile, PositionTile } from '#/tiles/cards/Fill.tsx'
import { FAN, SET_POSITION } from '#/tiles/features/cover.tsx'
import { dims, inWhite, rgb } from '#/tiles/features/light.tsx'
import { membersOn, numberOf, supports } from '#/tiles/features/parts.tsx'
import type { TileConfig } from '#/tiles/host.tsx'
import { Tile } from '#/tiles/Tile.tsx'

type Props = { env: TileEnv; config: TileConfig }

const OFF = ['off', 'standby', 'unavailable', 'unknown']

// A light, a switch, a boolean helper, or anything else that is either on
// or off, like a humidifier, a siren or an automation. A tap turns it on or
// off. A light that is on and dims says how bright it is. Switches take the
// light's color, since most of them drive a light. A valve is open or
// closed instead, and takes the cover's color. A light that is on washes
// its tile from the top left corner with the color it shines in, read from
// its hue and saturation at full brightness, and its icon takes that color
// too. A light that dims, with the brightness feature, is its brightness
// across the whole tile, a fan with the speed feature its speed, and a
// valve with the position feature how far it is open, and a humidifier
// with the humidity slider the humidity it holds the room at. A switch on
// a device with a power sensor, a smart plug, says what it draws. A group,
// like a light group, says how many of its members are on. With confirm
// it turns on or off only on a second tap, and has no other control. A
// player, like a TV's, is offered only that way.
export default function Toggle({ env, config }: Props) {
  const entity = env.hass.states[config.entity!]
  const domain = config.entity!.split('.')[0]
  const valve = domain === 'valve'
  // A player is on whatever it is doing, playing, paused or idle.
  const on = valve
    ? entity?.state === 'open' || entity?.state === 'opening'
    : domain === 'media_player'
      ? !!entity && !OFF.includes(entity.state)
      : entity?.state === 'on'
  const brightness = entity?.attributes.brightness
  const percentage = numberOf(entity, 'percentage')
  // A group that is on says how many of its members are.
  const members = membersOn(env.hass, entity)
  const word = valve
    ? on
      ? 'Open'
      : 'Closed'
    : !on
      ? 'Off'
      : members !== null
        ? `${members} on`
        : typeof brightness === 'number'
          ? `${Math.max(1, Math.round((brightness / 255) * 100))}%`
          : domain === 'fan' && percentage !== null && percentage > 0
            ? `${Math.round(percentage)}%`
            : 'On'
  // What it is at beside the word, as Home Assistant says it: how humid
  // the room is for a humidifier, and how far open a valve is.
  const reading = numberOf(entity, valve ? 'current_position' : domain === 'humidifier' ? 'current_humidity' : '')
  // A smart plug that is on says what it draws, from the power sensor on its
  // device.
  const watts = domain === 'switch' && on ? powerOf(env.hass, config.entity!) : undefined
  const state =
    reading !== null
      ? `${word} · ${Math.round(reading)}%`
      : watts !== undefined
        ? `${word} · ${formatPower(watts)}`
        : word
  const hs = entity?.attributes.hs_color
  // A light in a white shines in its kelvin, though it also gives a hue.
  const kelvin = entity && inWhite(entity) ? numberOf(entity, 'color_temp_kelvin') : null
  const colored = domain === 'light' && Array.isArray(hs) && kelvin == null
  const glow = colored
    ? `hsl(${hs[0]} 100% ${100 - hs[1] / 2}%)`
    : kelvin != null
      ? rgb(kelvin)
      : domain === 'light'
        ? 'var(--_accent-light)'
        : undefined
  // The icon a little deeper than the light, so a pale color still shows on
  // the light tile.
  const accent = colored
    ? `hsl(${hs[0]} 100% ${Math.min(58, 100 - hs[1] / 2)}%)`
    : valve
      ? 'var(--_accent-cover)'
      : domain === 'input_boolean' || domain === 'automation'
        ? 'var(--_accent)'
        : 'var(--_accent-light)'
  const unavailable = !entity || entity.state === 'unavailable' || entity.state === 'unknown'
  const toggle = () => callService(env.hass, `${domain}.toggle`, { entity_id: config.entity })
  const { feature: _, ...plain } = config
  // Two taps only turn it on or off, over any control it was set to have.
  if (config.confirm)
    return (
      <ConfirmTile
        env={env}
        config={plain}
        entity={entity}
        on={on}
        role="switch"
        accent={accent}
        glow={glow}
        state={state}
        prompt={
          valve
            ? on
              ? 'Tap again to close'
              : 'Tap again to open'
            : on
              ? 'Tap again to turn off'
              : 'Tap again to turn on'
        }
        onConfirm={toggle}
      />
    )
  if (domain === 'light' && config.feature === 'brightness' && !unavailable && dims(entity)) {
    return (
      <FillTile
        env={env}
        config={plain}
        entity={entity}
        value={on ? Math.max(1, Math.round(((typeof brightness === 'number' ? brightness : 255) / 255) * 100)) : 0}
        accent={accent}
        glow={glow}
        onTap={toggle}
        onSend={v =>
          v === 0
            ? callService(env.hass, 'light.turn_off', { entity_id: entity.entity_id })
            : callService(env.hass, 'light.turn_on', { entity_id: entity.entity_id, brightness_pct: v })
        }
      />
    )
  }
  if (valve && config.feature === 'position' && !unavailable && supports(entity, SET_POSITION))
    return <PositionTile env={env} config={plain} entity={entity} />
  if (domain === 'fan' && config.feature === 'speed' && !unavailable && supports(entity, FAN.speed)) {
    return (
      <FillTile
        env={env}
        config={plain}
        entity={entity}
        value={on ? (numberOf(entity, 'percentage') ?? 100) : 0}
        step={numberOf(entity, 'percentage_step') ?? 1}
        accent={accent}
        onTap={toggle}
        onSend={v => callService(env.hass, 'fan.set_percentage', { entity_id: entity.entity_id, percentage: v })}
      />
    )
  }
  if (domain === 'humidifier' && config.feature === 'humidity-slider' && !unavailable) {
    const min = numberOf(entity, 'min_humidity') ?? 0
    const max = numberOf(entity, 'max_humidity') ?? 100
    const target = numberOf(entity, 'humidity')
    return (
      <FillTile
        env={env}
        config={plain}
        entity={entity}
        value={on && target !== null ? Math.round(target) : 0}
        accent={accent}
        format={v => (v === 0 ? 'Off' : reading !== null ? `To ${v}% · ${Math.round(reading)}%` : `To ${v}%`)}
        onTap={toggle}
        onSend={v =>
          v === 0
            ? callService(env.hass, 'humidifier.turn_off', { entity_id: entity.entity_id })
            : Promise.all([
                callService(env.hass, 'humidifier.set_humidity', {
                  entity_id: entity.entity_id,
                  humidity: Math.min(max, Math.max(min, v)),
                }),
                !on && callService(env.hass, 'humidifier.turn_on', { entity_id: entity.entity_id }),
              ])
        }
      />
    )
  }
  return (
    <Tile
      env={env}
      config={config}
      entity={entity}
      active={on}
      role="switch"
      accent={accent}
      state={state}
      onTap={toggle}
      glow={glow}
    />
  )
}
