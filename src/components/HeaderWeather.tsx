import { useEffect, useRef, useState } from 'react'
import {
  buildCurrentWeatherUrl,
  buildLegacyWeatherUrl,
  describeWeatherCode,
  parseCurrentPayload,
  parseLegacyPayload,
  type BisligWeather,
} from '../lib/bisligWeather'
import { useLanguage } from '../lib/i18n'

type WeatherStatus =
  | { state: 'loading' }
  | { state: 'ready'; weather: BisligWeather }
  | { state: 'unavailable' }

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal })

  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`)
  }

  return (await response.json()) as unknown
}

export function HeaderWeather() {
  const { t } = useLanguage()
  const [status, setStatus] = useState<WeatherStatus>({ state: 'loading' })
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 10000)

    const load = async () => {
      try {
        const parsed = parseCurrentPayload(await fetchJson(buildCurrentWeatherUrl(), controller.signal))

        if (!cancelled) {
          setStatus(parsed ? { state: 'ready', weather: parsed } : { state: 'unavailable' })
        }

        return
      } catch {
        // Fall through to the legacy endpoint below.
      }

      try {
        const fallback = parseLegacyPayload(await fetch(buildLegacyWeatherUrl()).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Weather fallback failed with status ${response.status}`)
          }

          return (await response.json()) as unknown
        }))

        if (!cancelled) {
          setStatus(fallback ? { state: 'ready', weather: fallback } : { state: 'unavailable' })
        }
      } catch {
        if (!cancelled) {
          setStatus({ state: 'unavailable' })
        }
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }

    const handleOutsidePointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node | null)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open ])

  const weather = status.state === 'ready' ? status.weather : null
  const condition = weather ? describeWeatherCode(weather.code, weather.isDay) : null
  const icon = condition ? condition.icon : '☁️'
  const temperatureLabel =
    weather !== null ? `${Math.round(weather.temperatureC)}°` : status.state === 'loading' ? '…' : '--°'

  const minutesAgo =
    weather !== null
      ? Math.max(0, Math.floor((Date.now() - weather.fetchedAt.getTime()) / 60000))
      : 0
  const updatedLabel =
    minutesAgo === 0 ? t('weather.updatedNow') : t('weather.updatedAgo', { minutes: minutesAgo })

  return (
    <div className="header-weather" ref={wrapRef}>
      <button
        type="button"
        className="header-weather-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('weather.label')}
        title={t('weather.label')}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">{icon}</span>
        <span>{temperatureLabel}</span>
      </button>

      {open ? (
        <div className="header-weather-popup" role="dialog" aria-label={t('weather.label')}>
          <div className="header-weather-place">
            <span aria-hidden="true">{icon}</span>
            <strong>{t('header.footerCity')}</strong>
          </div>

          {weather !== null && condition !== null ? (
            <>
              <p className="header-weather-temp">{Math.round(weather.temperatureC)}°C</p>
              <p className="header-weather-cond">{t(`weather.${condition.labelKey}`)}</p>

              {weather.feelsLikeC !== null ? (
                <p className="header-weather-meta">
                  {t('weather.feelsLike')} {Math.round(weather.feelsLikeC)}°C
                </p>
              ) : null}

              {weather.humidityPct !== null ? (
                <p className="header-weather-meta">
                  {t('weather.humidity')} {Math.round(weather.humidityPct)}%
                </p>
              ) : null}

              <p className="header-weather-updated">{updatedLabel}</p>
            </>
          ) : (
            <p className="header-weather-meta">{t('weather.unavailable')}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
