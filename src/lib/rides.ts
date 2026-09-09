import type { CancelledByRole, Ride, RideRating, RideStatus } from '../types/ride'
import { getCustomerAuthId, supabase } from './supabase'

export type CreateRideInput = {
  customer_auth_id: string
  customer_name: string
  customer_phone: string
  pickup_address: string
  pickup_lat?: number | null
  pickup_lng?: number | null
  destination_address: string
  destination_lat?: number | null
  destination_lng?: number | null
  driver_id?: string | null
  passenger_count: string | number
  passenger_type?: string
  destination_mode?: 'same' | 'multiple'
  destination_stops?: string[]
  fare_cents?: number | null
  fare_source?: 'matrix' | 'distance' | null
  status?: RideStatus
}

export async function createRide(input: CreateRideInput): Promise<Ride> {
  const normalizedPassengerCount = Number.parseInt(String(input.passenger_count), 10)

  const { data, error } = await supabase
    .from('rides')
    .insert({
      customer_auth_id: input.customer_auth_id,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      pickup_address: input.pickup_address,
      pickup_lat: input.pickup_lat ?? null,
      pickup_lng: input.pickup_lng ?? null,
      destination_address: input.destination_address,
      destination_lat: input.destination_lat ?? null,
      destination_lng: input.destination_lng ?? null,
      driver_id: input.driver_id ?? null,
      passenger_count: Number.isFinite(normalizedPassengerCount) ? normalizedPassengerCount : 1,
      passenger_type: input.passenger_type ?? 'Regular',
      destination_mode: input.destination_mode ?? 'same',
      destination_stops: (input.destination_stops ?? []).filter(Boolean),
      fare_cents: input.fare_cents ?? null,
      fare_source: input.fare_source ?? null,
      status: input.status ?? 'requested',
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Ride
}

export async function fetchPendingRides(): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('status', 'requested')
    .is('driver_id', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as Ride[]
}

export async function fetchRideById(rideId: string): Promise<Ride | null> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('id', rideId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as Ride | null) ?? null
}

export async function acceptRide(rideId: string, driverId: string): Promise<Ride> {
  const { data, error } = await supabase
    .from('rides')
    .update({
      driver_id: driverId,
      status: 'accepted',
    })
    .eq('id', rideId)
    .eq('status', 'requested')
    .is('driver_id', null)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Ride
}

export async function updateRideStatus(rideId: string, status: RideStatus, driverId?: string): Promise<Ride> {
  let query = supabase
    .from('rides')
    .update({ status })
    .eq('id', rideId)

  if (driverId) {
    query = query.eq('driver_id', driverId)
  }

  const { data, error } = await query.select().single()

  if (error) {
    throw error
  }

  return data as Ride
}

export async function fetchAssignedRidesForDriver(driverId: string): Promise<Ride[]> {
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'arrived', 'in_progress'])

  if (error) {
    throw error
  }

  return (data ?? []) as Ride[]
}

export async function submitRideRating(rideId: string, rating: number, comment?: string): Promise<Ride | null> {
  const ride = await fetchRideById(rideId)

  if (!ride || ride.status !== 'completed' || !ride.driver_id || !ride.customer_auth_id) {
    throw new Error('This ride is not eligible for rating.')
  }

  const { error: ratingError } = await supabase.from('ride_ratings').insert({
    ride_id: ride.id,
    rater_id: ride.customer_auth_id,
    rated_user_id: ride.driver_id,
    stars: rating,
    comment: comment?.trim() || null,
  })

  if (ratingError) {
    throw ratingError
  }

  const { data, error } = await supabase
    .from('rides')
    .update({
      rating,
      rating_comment: comment?.trim() || null,
    })
    .eq('id', rideId)
    .select()
    .maybeSingle()

  if (error) {
    console.warn('Unable to backfill rating onto the ride record (non-fatal):', error.message)
    return ride
  }

  return (data ?? ride) as Ride
}

export async function submitPassengerRating(
  rideId: string,
  driverId: string,
  stars: number,
  comment?: string,
): Promise<RideRating> {
  const ride = await fetchRideById(rideId)

  if (!ride || ride.status !== 'completed' || ride.driver_id !== driverId || !ride.customer_auth_id) {
    throw new Error('This ride is not eligible for rating.')
  }

  const { data, error } = await supabase
    .from('ride_ratings')
    .insert({
      ride_id: ride.id,
      rater_id: driverId,
      rated_user_id: ride.customer_auth_id,
      stars,
      comment: comment?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as RideRating
}

export async function hasRatedRide(rideId: string, raterId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ride_ratings')
      .select('id')
      .eq('ride_id', rideId)
      .eq('rater_id', raterId)
      .maybeSingle()

    if (error) {
      console.warn('Unable to check for existing rating:', error.message)
      return false
    }

    return Boolean(data)
  } catch (err) {
    console.warn('Error checking for existing rating:', err)
    return false
  }
}

export async function cancelRide(
  rideId: string,
  actorId: string,
  role: CancelledByRole,
  reason: string,
): Promise<Ride> {
  const { data, error } = await supabase
    .rpc('cancel_ride', {
      p_ride_id: rideId,
      p_cancelled_by: actorId,
      p_cancelled_by_role: role,
      p_reason: reason,
    })
    .single()

  if (error) {
    throw error
  }

  return data as Ride
}

export async function fetchCustomerRideHistory(): Promise<Ride[]> {
  const customerAuthId = await getCustomerAuthId()

  try {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('customer_auth_id', customerAuthId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      console.warn('Unable to fetch Rider ride history:', error.message)
      return []
    }

    return (data ?? []) as Ride[]
  } catch (err) {
    console.warn('Error in fetchCustomerRideHistory:', err)
    return []
  }
}
