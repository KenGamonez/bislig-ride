import { supabase } from './supabase'
import { formatCentavos } from './fare'

export type AdminLiveRideOffer = {
  id: string
  dispatchRound: number
  expiresAt: string
  driverId: string | null
}

export type LiveAdminRide = {
  id: string
  Rider: string
  customerPhone: string
  driver: string
  passengerType: string
  pickup: string
  destination: string
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled'
  requestedAt: string
  requestedAtIso: string
  fare: string
  paymentMethod: string
  driverId: string | null
  customerAuthId: string | null
}

export type LiveAdminCustomer = {
  id: string
  name: string
  phone: string
  rides: number
  lastRide: string
  status: string
}

export async function fetchAdminLiveRides(): Promise<LiveAdminRide[]> {
  const { data: rides, error } = await supabase
    .from('rides')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  const driverIds = [...new Set(
    (rides ?? [])
      .map((ride) => ride.driver_id)
      .filter((id): id is string => Boolean(id))
  )]

  let driverMap = new Map<string, string>()

  if (driverIds.length > 0) {
    const { data: drivers, error: driverError } = await supabase
      .from('drivers')
      .select('id, full_name')
      .in('id', driverIds)

    if (driverError) throw driverError

    driverMap = new Map(
      (drivers ?? []).map((driver) => [driver.id, driver.full_name])
    )
  }

  return (rides ?? []).map((ride) => ({
    id: ride.id,
    Rider: ride.customer_name,
    customerPhone: ride.customer_phone,
    driver: ride.driver_id
      ? driverMap.get(ride.driver_id) ?? 'Assigned driver'
      : 'Unassigned',
    passengerType: `${ride.passenger_count} passenger${ride.passenger_count === 1 ? '' : 's'}`,
    pickup: ride.pickup_address,
    destination: ride.destination_address,
    status: ride.status,
    requestedAt: new Date(ride.created_at).toLocaleString(),
    requestedAtIso: ride.created_at,
    fare: typeof ride.fare_cents === 'number' ? `₱${formatCentavos(ride.fare_cents)}` : 'Not set',
    paymentMethod: 'Not connected',
    driverId: ride.driver_id,
    customerAuthId: ride.customer_auth_id,
  }))
}

export async function fetchAdminLiveRideOffers(rideIds: string[]): Promise<Record<string, AdminLiveRideOffer>> {
  const liveOffers: Record<string, AdminLiveRideOffer> = {}

  if (rideIds.length === 0) {
    return liveOffers
  }

  // Live offer uses the exact dispatch-core definition: offered and unexpired.
  const { data: offers, error } = await supabase
    .from('ride_offers')
    .select('id, ride_id, driver_id, dispatch_round, expires_at')
    .in('ride_id', rideIds)
    .eq('status', 'offered')
    .gt('expires_at', new Date().toISOString())

  if (error) throw error

  for (const offer of offers ?? []) {
    if (!liveOffers[offer.ride_id]) {
      liveOffers[offer.ride_id] = {
        id: offer.id,
        dispatchRound: offer.dispatch_round,
        expiresAt: offer.expires_at,
        driverId: offer.driver_id,
      }
    }
  }

  return liveOffers
}

export function subscribeToAdminRideNow(onInvalidate: () => void): () => void {
  let refreshTimer: number | null = null

  const scheduleRefresh = () => {
    if (refreshTimer !== null) {
      return
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      onInvalidate()
    }, 600)
  }

  const channel = supabase
    .channel('admin-ride-now-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rides' }, scheduleRefresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rides' }, scheduleRefresh)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_offers' }, scheduleRefresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ride_offers' }, scheduleRefresh)
    .subscribe()

  return () => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    void supabase.removeChannel(channel)
  }
}

export type AdminRideOffer = {
  id: string
  rideId: string
  driverId: string | null
  dispatchRound: number
  status: string
  offeredAt: string
  expiresAt: string
  decidedAt: string | null
}

export async function fetchAdminRideOfferHistory(rideId: string): Promise<AdminRideOffer[]> {
  if (!rideId) {
    return []
  }

  const { data: offers, error } = await supabase
    .from('ride_offers')
    .select('id, ride_id, driver_id, dispatch_round, status, offered_at, expires_at, decided_at')
    .eq('ride_id', rideId)
    .order('dispatch_round', { ascending: true })
    .order('offered_at', { ascending: true })

  if (error) throw error

  return (offers ?? []).map((offer) => ({
    id: offer.id,
    rideId: offer.ride_id,
    driverId: offer.driver_id,
    dispatchRound: offer.dispatch_round,
    status: offer.status,
    offeredAt: offer.offered_at,
    expiresAt: offer.expires_at,
    decidedAt: offer.decided_at,
  }))
}

export async function fetchAdminLiveCustomers(): Promise<LiveAdminCustomer[]> {
  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, customer_name, customer_phone, customer_auth_id, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  const customers = new Map<string, LiveAdminCustomer>()

  for (const ride of rides ?? []) {
    const key = ride.customer_auth_id ||
      `${ride.customer_name.toLowerCase()}|${ride.customer_phone}`

    const existing = customers.get(key)

    if (existing) {
      existing.rides += 1
      continue
    }

    customers.set(key, {
      id: key,
      name: ride.customer_name,
      phone: ride.customer_phone,
      rides: 1,
      lastRide: new Date(ride.created_at).toLocaleString(),
      status: 'Rider',
    })
  }

  return [...customers.values()]
}

