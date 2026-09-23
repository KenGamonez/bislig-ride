import { supabase } from './supabase'
import type { DeliveryBooking, DeliveryBookingInsert, DeliveryChatRole, DeliveryMessage, DeliveryOffer, DeliveryOfferWithBooking, DeliveryRating } from '../types/delivery'

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

export function formatDeliveryTiming(
  preferredDate: string | null | undefined,
  preferredTime: string | null | undefined,
): string {
  if (!preferredDate) {
    return 'ASAP'
  }

  return preferredTime ? `${preferredDate} · ${preferredTime}` : preferredDate
}

export function isDeliveryDue(
  preferredDate: string | null | undefined,
  preferredTime: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!preferredDate) {
    return true
  }

  const scheduled = new Date(`${preferredDate}T${preferredTime || '00:00'}`)

  if (!Number.isFinite(scheduled.getTime())) {
    return true
  }

  return scheduled <= now
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

  // Client-side mirror of the server due-gate: hide future-scheduled
  // deliveries so drivers are not offered jobs they cannot yet accept.
  // The RLS policy remains the authoritative enforcement.
  return ((data ?? []) as DeliveryBooking[]).filter((delivery) =>
    isDeliveryDue(delivery.preferred_date, delivery.preferred_time),
  )
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

export async function fetchDeliveryProofPaths(deliveryIds: string[]): Promise<Record<string, string>> {
  if (deliveryIds.length === 0) return {}

  const { data, error } = await supabase
    .from('delivery_proofs')
    .select('delivery_id,storage_path')
    .in('delivery_id', deliveryIds)

  if (error) throw error

  const paths: Record<string, string> = {}

  for (const row of (data ?? []) as Array<{ delivery_id: string; storage_path: string }>) {
    if (row.delivery_id && row.storage_path && !paths[row.delivery_id]) {
      paths[row.delivery_id] = row.storage_path
    }
  }

  return paths
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

export type AdminCancelDeliveryResult = {
  delivery_id: string
  success: boolean
  already_cancelled: boolean
  previous_status: string | null
  new_status: string | null
  reason: string
}

export async function adminCancelDelivery(deliveryId: string, reason: string): Promise<AdminCancelDeliveryResult> {
  const { data, error } = await supabase
    .rpc('admin_cancel_delivery', { p_delivery_id: deliveryId, p_reason: reason })
    .single()

  if (error) throw error

  return data as AdminCancelDeliveryResult
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

export async function fetchDriverDeliveredDeliveries(driverId: string): Promise<DeliveryBooking[]> {
  const { data, error } = await supabase
    .from('deliveries')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'delivered')
    .order('preferred_date', { ascending: false })
    .order('preferred_time', { ascending: false })
    .limit(10)

  if (error) throw error

  return (data ?? []) as DeliveryBooking[]
}

export async function sendDeliveryMessage(args: {
  deliveryId: string
  accessToken?: string | null
  senderRole: DeliveryChatRole
  message: string
}): Promise<DeliveryMessage> {
  const { data, error } = await supabase
    .rpc('send_delivery_message', {
      p_delivery_id: args.deliveryId,
      p_access_token: args.accessToken ?? null,
      p_sender_role: args.senderRole,
      p_message: args.message,
    })
    .single()

  if (error) throw error

  return data as DeliveryMessage
}

export async function listDeliveryMessages(
  deliveryId: string,
  accessToken?: string | null,
): Promise<DeliveryMessage[]> {
  const { data, error } = await supabase.rpc('list_delivery_messages', {
    p_delivery_id: deliveryId,
    p_access_token: accessToken ?? null,
  })

  if (error) throw error

  return (data ?? []) as DeliveryMessage[]
}

export async function submitDeliveryRating(args: {
  deliveryId: string
  accessToken?: string | null
  raterRole: DeliveryChatRole
  stars: number
  comment: string
}): Promise<DeliveryRating> {
  const { data, error } = await supabase
    .rpc('submit_delivery_rating', {
      p_delivery_id: args.deliveryId,
      p_access_token: args.accessToken ?? null,
      p_rater_role: args.raterRole,
      p_stars: args.stars,
      p_comment: args.comment,
    })
    .single()

  if (error) throw error

  return data as DeliveryRating
}

export async function getDeliveryRatings(
  deliveryId: string,
  accessToken?: string | null,
): Promise<DeliveryRating[]> {
  const { data, error } = await supabase.rpc('get_delivery_ratings', {
    p_delivery_id: deliveryId,
    p_access_token: accessToken ?? null,
  })

  if (error) throw error

  return (data ?? []) as DeliveryRating[]
}
