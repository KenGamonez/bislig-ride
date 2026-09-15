import { supabase } from './supabase'

export type RideLocationMessage = {
  user: string
  latitude: number
  longitude: number
  timestamp: number
}

export type RideLocationWatchOptions = {
  user: string
  onLocation?: (latitude: number, longitude: number) => void
  onError?: (error: GeolocationPositionError) => void
  onUnsupported?: () => void
}

export const RIDE_LOCATION_CHANNEL_PREFIX = 'ride:'
export const RIDE_LOCATION_EVENT = 'location'
export const RIDE_LOCATION_THROTTLE_MS = 3000
const RIDE_LOCATION_MIN_MOVE = 0.00008

export function rideLocationChannel(rideId: string): string {
  return `${RIDE_LOCATION_CHANNEL_PREFIX}${rideId}`
}

export function subscribeToRideLocation(
  rideId: string,
  callback: (message: RideLocationMessage) => void,
): () => void {
  const channel = supabase
    .channel(rideLocationChannel(rideId), { config: { private: true } })
    .on('broadcast', { event: RIDE_LOCATION_EVENT }, (payload) => {
      callback(payload as unknown as RideLocationMessage)
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function startRideLocationWatch(
  rideId: string,
  options: RideLocationWatchOptions,
): () => void {
  if (!navigator.geolocation) {
    options.onUnsupported?.()
    return () => {}
  }

  const channel = supabase
    .channel(rideLocationChannel(rideId), { config: { private: true } })
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') {
        return
      }

      subscribed = true

      if (pendingFirstFix) {
        publish(pendingFirstFix.latitude, pendingFirstFix.longitude, pendingFirstFix.timestamp)
        pendingFirstFix = null
      }
    })

  let subscribed = false
  let watchId = 0
  let pendingFirstFix: RideLocationMessage | null = null
  let lastLatitude = 0
  let lastLongitude = 0
  let lastPublishedAt = 0

  const publish = (latitude: number, longitude: number, timestamp: number) => {
    lastLatitude = latitude
    lastLongitude = longitude
    lastPublishedAt = timestamp

    void channel.send({
      type: 'broadcast',
      event: RIDE_LOCATION_EVENT,
      payload: {
        user: options.user,
        latitude,
        longitude,
        timestamp,
      },
    })
  }

  const onPosition = (position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords
    const now = Date.now()
    const moved =
      Math.abs(latitude - lastLatitude) >= RIDE_LOCATION_MIN_MOVE ||
      Math.abs(longitude - lastLongitude) >= RIDE_LOCATION_MIN_MOVE

    options.onLocation?.(latitude, longitude)

    if (!moved || now - lastPublishedAt < RIDE_LOCATION_THROTTLE_MS) {
      return
    }

    if (!subscribed) {
      pendingFirstFix = { user: options.user, latitude, longitude, timestamp: now }
      return
    }

    publish(latitude, longitude, now)
  }

  const onError = (error: GeolocationPositionError) => {
    options.onError?.(error)
  }

  watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true })

  return () => {
    if (watchId !== 0) {
      navigator.geolocation.clearWatch(watchId)
    }

    void supabase.removeChannel(channel)
  }
}