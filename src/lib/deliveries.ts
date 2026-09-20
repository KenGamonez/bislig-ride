import { supabase } from './supabase'
import type { DeliveryBooking, DeliveryBookingInsert, DeliveryOffer, DeliveryOfferWithBooking } from '../types/delivery'

export type DeliveryLifecycleStatus = 'driver_on_way' | 'driver_arrived' | 'picked_up' | 'in_transit' | 'delivered'

export async function fetchDriverDeliveries(driverId: string): Promise<DeliveryBooking[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['assigned', 'quoted', 'confirmed', 'driver_on_way', 'driver_arrived', 'picked_up', 'in_transit'])
    .order('preferred_date', { ascending: true })
    .order('preferred_time', { ascending: true })

  if (error) throw error

  return (data ?? []) as DeliveryBooking[]
}

export async function fetchAvailableDeliveries(): Promise<DeliveryBooking[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .in('status', ['pending', 'dispatching'])
    .is('driver_id', null)
    .order('preferred_date', { ascending: true })
    .order('preferred_time', { ascending: true })

  if (error) throw error

  return (data ?? []) as DeliveryBooking[]
}

export async function acceptDeliveryBooking(deliveryId: string, driverId: string): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .from('deliveries')
    .update({ status: 'assigned', driver_id: driverId })
    .eq('id', deliveryId)
    .in('status', ['pending', 'dispatching'])
    .is('driver_id', null)
    .select()
    .single<DeliveryBooking>()

  if (error) throw error

  return data
}

export async function advanceDeliveryStatus(deliveryId: string, nextStatus: DeliveryLifecycleStatus): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('advance_delivery_status', { p_delivery_id: deliveryId, p_next_status: nextStatus })
    .single()

  if (error) throw error

  return data as DeliveryBooking
}

export async function completeDeliveryWithProof(deliveryId: string, storagePath: string): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('complete_delivery_with_proof', { p_delivery_id: deliveryId, p_storage_path: storagePath })
    .single()

  if (error) throw error

  return data as DeliveryBooking
}

export async function fetchDeliveriesForAdmin(): Promise<DeliveryBooking[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []) as DeliveryBooking[]
}

export async function fetchDeliveryProofIds(deliveryIds: string[]): Promise<Set<string>> {
  if (deliveryIds.length === 0) return new Set()

  const { data, error } = await supabase
    .from('delivery_proofs')
    .select('delivery_id')
    .in('delivery_id', deliveryIds)

  if (error) throw error

  return new Set(((data ?? []) as Array<{ delivery_id: string }>).map((row) => row.delivery_id))
}

export async function acceptDeliveryOffer(offerId: string): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('accept_delivery_offer', { p_offer_id: offerId })
    .single()

  if (error) throw error

  const row = data as DeliveryBooking & { access_token?: string }
  delete row.access_token
  return row
}

export async function setDeliveryDriverPrice(deliveryId: string, priceCents: number): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('set_delivery_driver_price', { p_delivery_id: deliveryId, p_price_cents: priceCents })
    .single()

  if (error) throw error

  return data as DeliveryBooking
}

export async function confirmDeliveryQuote(deliveryId: string, accessToken: string): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('confirm_delivery_quote', { p_delivery_id: deliveryId, p_access_token: accessToken })
    .single()

  if (error) throw error

  const row = data as DeliveryBooking & { access_token?: string }
  delete row.access_token
  return row
}

export async function createDeliveryBooking(booking: DeliveryBookingInsert) {
  const { data, error } = await supabase
    .rpc('create_delivery_booking', {
      p_customer_id: booking.customer_id,
      p_sender_name: booking.sender_name,
      p_sender_phone: booking.sender_phone,
      p_package_type: booking.package_type,
      p_package_details: booking.package_details,
      p_package_size: booking.package_size,
      p_pickup_address: booking.pickup_address,
      p_delivery_address: booking.delivery_address,
      p_preferred_date: booking.preferred_date,
      p_preferred_time: booking.preferred_time,
    })
    .single<{ id: string; access_token: string }>()

  if (error) throw error
  return data
}

export async function getDeliveryBooking(deliveryId: string, accessToken: string): Promise<DeliveryBooking> {
  const { data, error } = await supabase
    .rpc('get_delivery_booking', { p_delivery_id: deliveryId, p_access_token: accessToken })
    .single()

  if (error) throw error

  const row = data as DeliveryBooking & { access_token?: string }
  delete row.access_token
  return row
}

const DELIVERY_OFFER_BOOKING_COLUMNS =
  'id,sender_name,sender_phone,package_type,package_details,package_size,pickup_address,delivery_address,preferred_date,preferred_time,status,driver_id,created_at'

export async function fetchDriverDeliveryOffers(driverId: string): Promise<DeliveryOfferWithBooking[]> {
  const { data, error } = await supabase
    .from('delivery_offers')
    .select(`id,delivery_id,driver_id,dispatch_round,status,offered_at,expires_at,decided_at,booking:deliveries(${DELIVERY_OFFER_BOOKING_COLUMNS})`)
    .eq('driver_id', driverId)
    .eq('status', 'offered')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    delivery_id: string
    driver_id: string
    dispatch_round: number
    status: string
    offered_at: string
    expires_at: string
    decided_at: string | null
    booking: DeliveryBooking | DeliveryBooking[] | null
  }>

  const toBooking = (value: DeliveryBooking | DeliveryBooking[] | null): DeliveryBooking | null =>
    Array.isArray(value) ? (value[0] ?? null) : value

  return rows
    .filter((row) => toBooking(row.booking) !== null)
    .map((row) => ({
      id: row.id,
      delivery_id: row.delivery_id,
      driver_id: row.driver_id,
      dispatch_round: row.dispatch_round,
      status: row.status as DeliveryOffer['status'],
      offered_at: row.offered_at,
      expires_at: row.expires_at,
      decided_at: row.decided_at,
      booking: toBooking(row.booking) as DeliveryBooking,
    }))
}
