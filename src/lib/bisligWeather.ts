/* Bislig Hub — compact header weather for Bislig City.
 *
 * Fixed city-level coordinates (no device geolocation, no permission prompt).
 * Uses Open-Meteo current weather, which needs no frontend API key.
 * Only the fields actually rendered are requested.
 */

export const BISLIG_CITY_LATITUDE = 8.21
export const BISLIG_CITY_LONGITUDE = 126.35

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'

export function buildCurrentWeatherUrl(): string {
  const params = new URLSearchParams({
    latitude: String(BISLIG_CITY_LATITUDE),
    longitude: String(BISLIG_CITY_LONGITUDE),
    current: 'temperature_2,relative_humidity_2,apparent_temperature,is_day,weather_code',
    timezone: 'Asia/Manila',
  })

  return `${OPEN_METEO_BASE}?${params.toString()}`
}

export function buildLegacyWeatherUrl(): string {
  const params = new URLSearchParams({
    latitude: String(BISLIG_CITY_LATITUDE),
    longitude: String(BISLIG_CITY_LONGITUDE),
    current_weather: 'true',
    timezone: 'Asia/Manila',
  })

  return `${OPEN_METEO_BASE}?${params.toString()}`
}

export type BisligConditionLabelKey =
  | 'clear'
  | 'sunny'
  | 'cloudy'
  | 'foggy'
  | 'drizzle'
  | 'lightRain'
  | 'snow'
  | 'storm'
  | 'mixed'

export function describeWeatherCode(
  code: number,
  isDay: boolean,
): { icon: string; labelKey: BisligConditionLabelKey } {
  if (code === 0) {
    return isDay ? { icon: '☀️', labelKey: 'clear' } : { icon: '🌙', labelKey: 'clear' }
  }

  if (code === 1) {
    return isDay ? { icon: '🌤️', labelKey: 'sunny' } : { icon: '🌙', labelKey: 'clear' }
  }

  if (code === 2) {
    return { icon: '⛅', labelKey: 'sunny' }
  }

  if (code === 3) {
    return { icon: '☁️', labelKey: 'cloudy' }
  }

  if (code === 45 || code === 48) {
    return { icon: '🌫️', labelKey: 'foggy' }
  }

  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    return { icon: '🌧️', labelKey: 'drizzle' }
  }

  if (
    code === 61 ||
    code === 63 ||
    code === 65 ||
    code === 66 ||
    code === 67 ||
    code === 80 ||
    code === 81 ||
    code === 82
  ) {
    return { icon: '🌧️', labelKey: 'lightRain' }
  }

  if (
    code === 71 ||
    code === 73 ||
    code === 75 ||
    code === 77 ||
    code === 85 ||
    code === 86
  ) {
    return { icon: '🌨️', labelKey: 'snow' }
  }

  if (code === 95 || code === 96 || code === 99) {
    return { icon: '⛈️', labelKey: 'storm' }
  }

  return { icon: '☁️', labelKey: 'mixed' }
}

export type BisligWeather = {
  temperatureC: number
  feelsLikeC: number | null
  humidityPct: number | null
  isDay: boolean
  code: number
  fetchedAt: Date
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseCurrentPayload(payload: unknown): BisligWeather | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const current = (payload as { current?: unknown }).current

  if (typeof current !== 'object' || current === null) {
    return null
  }

  const fields = current as Record<string, unknown>
  const temperatureC = asFiniteNumber(fields.temperature_2)

  if (temperatureC === null) {
    return null
  }

  return {
    temperatureC,
    feelsLikeC: asFiniteNumber(fields.apparent_temperature),
    humidityPct: asFiniteNumber(fields.relative_humidity_2),
    isDay: fields.is_day === 0 ? false : true,
    code: asFiniteNumber(fields.weather_code) ?? -1,
    fetchedAt: new Date(),
  }
}

export function parseLegacyPayload(payload: unknown): BisligWeather | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const current = (payload as { current_weather?: unknown }).current_weather

  if (typeof current !== 'object' || current === null) {
    return null
  }

  const fields = current as Record<string, unknown>
  const temperatureC = asFiniteNumber(fields.temperature)

  if (temperatureC === null) {
    return null
  }

  return {
    temperatureC,
    feelsLikeC: null,
    humidityPct: null,
    isDay: fields.is_day === 0 ? false : true,
    code: asFiniteNumber(fields.weathercode) ?? -1,
    fetchedAt: new Date(),
  }
}
