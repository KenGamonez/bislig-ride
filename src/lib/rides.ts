import type { Ride, RideStatus } from '../types/ride'
import { supabase } from './supabase'

export type CreateRideInput = {
  customer_name: string
  customer_phone: string
  pickup_address: string
  pickup_lat?: number | null
  pickup_lng?: number | null
  destination_address: string
  destination_lat?: number | null
  destination_lng?: number | null
  driver_id?: string | null
  status?: RideStatus
}

export async function createRide(input: CreateRideInput): Promise<Ride> {
  const { data, error } = await supabase
    .from('rides')
    .insert({
      customer_name: input.customer_name,
      customer_phone: input.customer_phone,
      pickup_address: input.pickup_address,
      pickup_lat: input.pickup_lat ?? null,
      pickup_lng: input.pickup_lng ?? null,
      destination_address: input.destination_address,
      destination_lat: input.destination_lat ?? null,
      destination_lng: input.destination_lng ?? null,
      driver_id: input.driver_id ?? null,
      status: input.status ?? 'requested',
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as Ride
}
