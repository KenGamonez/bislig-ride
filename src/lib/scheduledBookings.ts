import { supabase } from './supabase'
import type { PakyawanBooking, PakyawanBookingInsert } from '../types/scheduledBooking'

export async function createPakyawanBooking(booking: PakyawanBookingInsert) {
  const { data, error } = await supabase
    .from('pakyawan_bookings')
    .insert(booking)
    .select()
    .single<PakyawanBooking>()

  if (error) throw error
  return data
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