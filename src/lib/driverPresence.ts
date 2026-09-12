import { appSupabasePublishableKey, appSupabaseUrl, supabase } from './supabase'
import { updateDriverLocation } from './driverLocations'

export type DriverPosition = {
  latitude: number
  longitude: number
}

export type DriverLocationStatus = 'active' | 'stale' | 'lost'

const FRESH_WINDOW_MS = 45_000
const STALE_WINDOW_MS = 120_000
const HEARTBEAT_INTERVAL_MS = 20_000

export function hasGeolocation(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

export function requestFirstFix(timeoutMs = 15000): Promise<DriverPosition> {
  return new Promise((resolve, reject) => {
    if (!hasGeolocation()) {
      reject(new Error('Geolocation is not supported on this device.'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
      },
      (error) => {
        reject(error)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
  })
}

export function driverLocationStatus(updatedAtIso: string | null | undefined): DriverLocationStatus {
  if (!updatedAtIso) {
    return 'lost'
  }

  const ageMs = Date.now() - new Date(updatedAtIso).getTime()

  if (ageMs <= FRESH_WINDOW_MS) return 'active'
  if (ageMs <= STALE_WINDOW_MS) return 'stale'
  return 'lost'
}

type TrackingCallbacks = {
  onPosition?: (position: DriverPosition) => void
  onError?: (error: GeolocationPositionError) => void
}

export function startDriverLocationTracking(
  driverId: string,
  callbacks: TrackingCallbacks = {},
): () => void {
  if (!hasGeolocation()) {
    return () => {}
  }

  let lastKnown: DriverPosition | null = null
  let watchId = 0
  let heartbeatId = 0

  const publish = (position: DriverPosition) => {
    void updateDriverLocation(driverId, position.latitude, position.longitude).catch((error) => {
      console.warn('Unable to publish driver location:', error)
    })
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      lastKnown = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      callbacks.onPosition?.(lastKnown)
      publish(lastKnown)
    },
    (error) => {
      callbacks.onError?.(error)
    },
    { enableHighAccuracy: true },
  )

  heartbeatId = window.setInterval(() => {
    if (lastKnown) {
      publish(lastKnown)
    }
  }, HEARTBEAT_INTERVAL_MS)

  return () => {
    navigator.geolocation.clearWatch(watchId)
    window.clearInterval(heartbeatId)
  }
}

export function persistOfflineBestEffort() {
  try {
    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token

      if (!token) {
        return
      }

      void fetch(`${appSupabaseUrl}/rest/v1/rpc/set_driver_presence`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: appSupabasePublishableKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_online: false, p_available: false, p_auto_accept: false }),
      }).catch(() => {
        // Best effort only — presence is restored the next time the driver
        // signs in and toggles availability.
      })
    })
  } catch {
    // Best effort only.
  }
}