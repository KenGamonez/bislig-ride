import { useEffect, useState } from 'react'
import { useLanguage } from '../lib/i18n'

const BISLIG_LATITUDE = 8.1789
const BISLIG_LONGITUDE = 126.3216
const REFRESH_INTERVAL = 15 * 60 * 1000

type WeatherData = {
  temperature: number
  feelsLike: number
  humidity: number
  precipitation: number
  weatherCode: number
  isDay: number
  updatedAt: Date
}

type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    precipitation: number
    weather_code: number
    is_day: number
  }
}

const getWeatherIcon = (code: number, isDay: number) => {
  if (code === 0) return isDay ? '☀' : '☾'
  if ([1, 2].includes(code)) return isDay ? '◐' : '◑'
  if ([3, 45, 48].includes(code)) return '☁'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '☂'
  if ([95, 96, 99].includes(code)) return '⚡'
  return '○'
}

export function WeatherWidget() {
  const { t } = useLanguage()
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const getWeatherDescription = (code: number) => {
    if (code === 0) return t('weather.clear')
    if ([1, 2].includes(code)) return t('weather.sunny')
    if (code === 3) return t('weather.cloudy')
    if ([45, 48].includes(code)) return t('weather.foggy')
    if ([51, 53, 55, 56, 57].includes(code)) return t('weather.drizzle')
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return t('weather.lightRain')
    if ([71, 73, 75, 77, 85, 86].includes(code)) return t('weather.snow')
    if ([95, 96, 99].includes(code)) return t('weather.storm')
    return t('weather.mixed')
  }

  const formatUpdatedTime = (updatedAt: Date) => {
    const minutesAgo = Math.max(0, Math.floor((Date.now() - updatedAt.getTime()) / 60000))
    return minutesAgo === 0 ? t('weather.updatedNow') : t('weather.updatedAgo', { minutes: minutesAgo })
  }

  useEffect(() => {
    let isMounted = true

    const loadWeather = async () => {
      try {
        const params = new URLSearchParams({
          latitude: String(BISLIG_LATITUDE),
          longitude: String(BISLIG_LONGITUDE),
          current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day',
          timezone: 'Asia/Manila',
        })
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
        if (!response.ok) throw new Error(`Weather request failed with status ${response.status}`)
        const result = await response.json() as OpenMeteoResponse
        if (!isMounted) return

        setWeather({
          temperature: result.current.temperature_2m,
          feelsLike: result.current.apparent_temperature,
          humidity: result.current.relative_humidity_2m,
          precipitation: result.current.precipitation,
          weatherCode: result.current.weather_code,
          isDay: result.current.is_day,
          updatedAt: new Date(),
        })
        setHasError(false)
      } catch (error) {
        console.error('Unable to load Bislig weather:', error)
        if (isMounted) setHasError(true)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadWeather()
    const refreshTimer = window.setInterval(() => void loadWeather(), REFRESH_INTERVAL)
    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
    }
  }, [])

  return (
    <section className="weather-widget" aria-label={t('weather.label')}>
      <div className="weather-header">
        <div><p className="weather-label">{t('weather.label')}</p><p className="weather-context">{t('weather.context')}</p></div>
        {weather ? <span className="weather-icon" aria-hidden="true">{getWeatherIcon(weather.weatherCode, weather.isDay)}</span> : null}
      </div>
      {isLoading ? <p className="weather-status">{t('weather.checking')}</p> : hasError || !weather ? <p className="weather-status">{t('weather.unavailable')}</p> : <>
        <div className="weather-main"><strong>{Math.round(weather.temperature)}°C</strong><span>{getWeatherDescription(weather.weatherCode)}</span></div>
        <div className="weather-details"><span>{t('weather.feelsLike')} <strong>{Math.round(weather.feelsLike)}°C</strong></span><span>{t('weather.humidity')} <strong>{weather.humidity}%</strong></span><span>{t('weather.rain')} <strong>{weather.precipitation} mm</strong></span></div>
        <p className="weather-updated">{formatUpdatedTime(weather.updatedAt)}</p>
      </>}
    </section>
  )
}