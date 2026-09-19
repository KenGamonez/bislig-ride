import { supabase } from './supabase'
import type { PakyawanBooking, PakyawanBookingInsert } from '../types/scheduledBooking'

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

export async function fetchAvailablePakyawanBookings(): Promise<PakyawanBooking[]> {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .select('*')
    .eq('status', 'pending')
    .is('driver_id', null)
    .order('booking_date', { ascending: true })
    .order('pickup_time', { ascending: true })

  if (error) throw error

  return data ?? []
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