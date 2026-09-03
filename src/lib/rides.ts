import type { Ride, RideStatus } from '../types/ride'
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
  try {
    const { data, error } = await supabase
      .from('rides')
      .update({
        rating,
        rating_comment: comment?.trim() || null,
      })
      .eq('id', rideId)
      .select()
      .single()

    if (error) {
      console.warn('Unable to persist ride rating to database (column may not exist yet):', error.message)
      return null
    }

    return data as Ride
  } catch (err) {
    console.warn('Error submitting ride rating:', err)
    return null
  }
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
      console.warn('Unable to fetch customer ride history:', error.message)
      return []
    }

    return (data ?? []) as Ride[]
  } catch (err) {
    console.warn('Error in fetchCustomerRideHistory:', err)
    return []
  }
}
