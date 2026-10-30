import type { HomeAssistant } from '#/types.ts'

// The domains a decoration item can stand in for. Anything else is left out
// of the picker: it has nothing a model could show.
const PLACEABLE_DOMAINS = [
  'light',
  'switch',
  'cover',
  'media_player',
  'fan',
  'climate',
  'humidifier',
  'lock',
  'camera',
  'vacuum',
  'sensor',
  'binary_sensor',
  'button',
  'input_button',
]

// Sensors are many, and these kinds of reading are what a home has dozens
// of and no piece could show: meters, radio and battery levels, clocks.
// Every other sensor is offered, and every binary sensor, whatever its
// class, a washing machine's door among them.
const NOISY_SENSORS = new Set([
  'power',
  'energy',
  'voltage',
  'current',
  'frequency',
  'power_factor',
  'apparent_power',
  'reactive_power',
  'signal_strength',
  'data_rate',
  'data_size',
  'timestamp',
  'duration',
  'distance',
  'speed',
  'gas',
  'water',
  'volume',
  'weight',
  'monetary',
  'battery',
])
// The entities a device keeps for its settings and its diagnostics are left
// out, except the sensors among them: a door left open is often one.
const READINGS = ['sensor', 'binary_sensor']

export const domainOf = (entityId: string) => entityId.split('.')[0]

export type EntityInfo = {
  entity_id: string
  name: string
  domain: string
  // Area the entity belongs to in Home Assistant, directly or through its device.
  area_id: string | null
  area_name: string | null
  // Device the entity belongs to in Home Assistant, if any.
  device_id: string | null
  device_name: string | null
}

export function entityName(hass: HomeAssistant, entityId: string) {
  const state = hass.states[entityId]
  const friendly = state?.attributes.friendly_name
  if (typeof friendly === 'string' && friendly) return friendly
  return hass.entities?.[entityId]?.name ?? entityId
}

// Whether Home Assistant still has the entity. Only answered once it has
// sent its lists: before that every entity looks missing. One that is only
// unavailable, a device that is off or out of reach, is still there.
export function entityGone(hass: HomeAssistant, entityId: string) {
  const loaded = Object.keys(hass.entities ?? {}).length > 0 && Object.keys(hass.states).length > 0
  return loaded && !hass.entities?.[entityId] && !hass.states[entityId]
}

export function entityArea(hass: HomeAssistant, entityId: string): string | null {
  const entry = hass.entities?.[entityId]
  if (!entry) return null
  return entry.area_id ?? (entry.device_id ? (hass.devices?.[entry.device_id]?.area_id ?? null) : null)
}

export function areaName(hass: HomeAssistant, areaId: string | null): string | null {
  if (!areaId) return null
  return hass.areas?.[areaId]?.name ?? null
}

export function deviceName(hass: HomeAssistant, entityId: string, deviceId: string | null): string | null {
  if (!deviceId) return null
  const name = hass.devices?.[deviceId]?.name
  if (!name) return null
  // If the entity has a friendly name that matches the device, don't show it
  // again. The device name is already in the list of devices, and the entity
  // name is already in the list of entities. Only show it if they differ.
  return hass.states?.[entityId]?.attributes.friendly_name === name ? null : name
}

// Every entity a decoration item can be bound to, from the entity registry.
// Areas are not required: Home Assistant does not force one on anything.
// Hidden entities are in too: Home Assistant hides the lights in a group,
// and each spot of a ceiling may stand on the plan on its own.
export function placeableEntities(hass: HomeAssistant): EntityInfo[] {
  const out: EntityInfo[] = []
  for (const entry of Object.values(hass.entities ?? {})) {
    const domain = domainOf(entry.entity_id)
    if (!PLACEABLE_DOMAINS.includes(domain)) continue
    if (entry.entity_category && !READINGS.includes(domain)) continue
    if (domain === 'sensor') {
      const deviceClass = hass.states[entry.entity_id]?.attributes.device_class
      if (typeof deviceClass === 'string' && NOISY_SENSORS.has(deviceClass)) continue
    }
    const areaId = entityArea(hass, entry.entity_id);
    out.push({
      entity_id: entry.entity_id,
      name: entityName(hass, entry.entity_id),
      domain,
      area_id: areaId,
      area_name: areaName(hass, areaId),
      device_id: entry.device_id ?? null,
      device_name: deviceName(hass, entry.entity_id, entry.device_id ?? null),
    })
  }
  return out.sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))
}
