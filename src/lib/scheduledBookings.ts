import { supabase } from './supabase'
import type { PakyawanBooking, PakyawanBookingInsert, PakyawanChatRole, PakyawanMessage, PakyawanOffer, PakyawanOfferWithBooking } from '../types/scheduledBooking'

export async function createPakyawanBooking(booking: PakyawanBookingInsert) {
  const { data, error } = await supabase
    .rpc('create_pakyawan_booking', {
      p_customer_id: booking.customer_id,
      p_customer_name: booking.customer_name,
      p_customer_phone: booking.customer_phone,
      p_booking_date: booking.booking_date,
      p_pickup_time: booking.pickup_time,
      p_pickup_location: booking.pickup_location,
      p_destination: booking.destination,
      p_passengers: booking.passengers,
      p_trip_type: booking.trip_type,
      p_estimated_hours: booking.estimated_hours,
      p_special_requests: booking.special_requests,
    })
    .single<{ id: string; access_token: string }>()

  if (error) throw error
  return data
}

export async function getPakyawanBooking(bookingId: string, accessToken: string): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('get_pakyawan_booking', { p_booking_id: bookingId, p_access_token: accessToken })
    .single()

  if (error) throw error

  const row = data as PakyawanBooking & { access_token?: string }
  delete row.access_token
  return row
}

export async function confirmPakyawanBooking(bookingId: string, accessToken: string): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('confirm_pakyawan_booking', { p_booking_id: bookingId, p_access_token: accessToken })
    .single()

  if (error) throw error

  const row = data as PakyawanBooking & { access_token?: string }
  delete row.access_token
  return row
}

export function formatPakyawanTiming(
  bookingDate: string | null | undefined,
  pickupTime: string | null | undefined,
): string {
  if (!bookingDate) {
    return 'ASAP'
  }

  return pickupTime ? `${bookingDate} · ${pickupTime}` : bookingDate
}

export function isPakyawanDue(
  bookingDate: string | null | undefined,
  pickupTime: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!bookingDate) {
    return true
  }

  const scheduled = new Date(`${bookingDate}T${pickupTime || '00:00'}`)

  if (!Number.isFinite(scheduled.getTime())) {
    return true
  }

  return scheduled <= now
}

export async function fetchAvailablePakyawanBookings(): Promise<PakyawanBooking[]> {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .select('*')
    .eq('status', 'pending')
    .is('driver_id', null)
    .order('booking_date', { ascending: true })
    .order('pickup_time', { ascending: true })

  if (error) throw error

  return ((data ?? []) as PakyawanBooking[]).filter((booking) =>
    isPakyawanDue(booking.booking_date, booking.pickup_time),
  )
}

export async function fetchPakyawanBookings(): Promise<PakyawanBooking[]> {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .select('*')
    .order('booking_date', { ascending: true })
    .order('pickup_time', { ascending: true })

  if (error) throw error

  return (data ?? []) as PakyawanBooking[]
}

export async function quotePakyawanBooking(bookingId: string, priceCents: number): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('admin_quote_pakyawan', { p_booking_id: bookingId, p_price_cents: priceCents })
    .single()

  if (error) throw error

  return data as PakyawanBooking
}

export type AdminCancelPakyawanResult = {
  booking_id: string
  success: boolean
  already_cancelled: boolean
  previous_status: string | null
  new_status: string | null
  reason: string
}

export async function adminCancelPakyawanBooking(bookingId: string, reason: string): Promise<AdminCancelPakyawanResult> {
  const { data, error } = await supabase
    .rpc('admin_cancel_pakyawan', { p_booking_id: bookingId, p_reason: reason })
    .single()

  if (error) throw error

  return data as AdminCancelPakyawanResult
}

const PAKYAWAN_OFFER_BOOKING_COLUMNS =
  'id,customer_name,customer_phone,booking_date,pickup_time,pickup_location,destination,passengers,trip_type,estimated_hours,special_requests,status,driver_id,created_at'

export async function fetchDriverPakyawanOffers(driverId: string): Promise<PakyawanOfferWithBooking[]> {
  const { data, error } = await supabase
    .from('pakyawan_offers')
    .select(`id,booking_id,driver_id,dispatch_round,status,offered_at,expires_at,decided_at,booking:pakyawan_bookings(${PAKYAWAN_OFFER_BOOKING_COLUMNS})`)
    .eq('driver_id', driverId)
    .eq('status', 'offered')
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })

  if (error) throw error

  const rows = (data ?? []) as unknown as Array<{
    id: string
    booking_id: string
    driver_id: string
    dispatch_round: number
    status: string
    offered_at: string
    expires_at: string
    decided_at: string | null
    booking: PakyawanBooking | PakyawanBooking[] | null
  }>

  const toBooking = (value: PakyawanBooking | PakyawanBooking[] | null): PakyawanBooking | null =>
    Array.isArray(value) ? (value[0] ?? null) : value

  return rows
    .filter((row) => toBooking(row.booking) !== null)
    .map((row) => ({
      id: row.id,
      booking_id: row.booking_id,
      driver_id: row.driver_id,
      dispatch_round: row.dispatch_round,
      status: row.status as PakyawanOffer['status'],
      offered_at: row.offered_at,
      expires_at: row.expires_at,
      decided_at: row.decided_at,
      booking: toBooking(row.booking) as PakyawanBooking,
    }))
}

export async function acceptPakyawanOffer(offerId: string): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('accept_pakyawan_offer', { p_offer_id: offerId })
    .single()

  if (error) throw error

  return data as PakyawanBooking
}

export async function declinePakyawanOffer(offerId: string): Promise<PakyawanOffer> {
  const { data, error } = await supabase
    .rpc('decline_pakyawan_offer', { p_offer_id: offerId })
    .single()

  if (error) throw error

  return data as PakyawanOffer
}

export async function setPakyawanDriverPrice(bookingId: string, priceCents: number): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('set_pakyawan_driver_price', { p_booking_id: bookingId, p_price_cents: priceCents })
    .single()

  if (error) throw error

  return data as PakyawanBooking
}

export type PakyawanTripLifecycleStatus = 'scheduled' | 'driver_on_way' | 'driver_arrived' | 'in_progress' | 'completed'

export async function fetchDriverPakyawanBookings(driverId: string): Promise<PakyawanBooking[]> {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['assigned', 'quoted', 'scheduled', 'driver_on_way', 'driver_arrived', 'in_progress'])
    .order('booking_date', { ascending: true })
    .order('pickup_time', { ascending: true })

  if (error) throw error

  return (data ?? []) as PakyawanBooking[]
}

export async function advancePakyawanStatus(bookingId: string, nextStatus: PakyawanTripLifecycleStatus): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .rpc('advance_pakyawan_status', { p_booking_id: bookingId, p_next_status: nextStatus })
    .single()

  if (error) throw error

  return data as PakyawanBooking
}

export async function acceptPakyawanBooking(bookingId: string, driverId: string): Promise<PakyawanBooking> {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .update({ status: 'assigned', driver_id: driverId })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select()
    .single<PakyawanBooking>()

  if (error) throw error

  return data
}

export async function sendPakyawanMessage(args: {
  bookingId: string
  accessToken?: string | null
  senderRole: PakyawanChatRole
  message: string
}): Promise<PakyawanMessage> {
  const { data, error } = await supabase
    .rpc('send_pakyawan_message', {
      p_booking_id: args.bookingId,
      p_access_token: args.accessToken ?? null,
      p_sender_role: args.senderRole,
      p_message: args.message,
    })
    .single()

  if (error) throw error

  return data as PakyawanMessage
}

export async function listPakyawanMessages(
  bookingId: string,
  accessToken?: string | null,
): Promise<PakyawanMessage[]> {
  const { data, error } = await supabase.rpc('list_pakyawan_messages', {
    p_booking_id: bookingId,
    p_access_token: accessToken ?? null,
  })

  if (error) throw error

  return (data ?? []) as PakyawanMessage[]
}