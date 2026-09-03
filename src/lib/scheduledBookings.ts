import { supabase } from './supabase'
import type { ScheduledBooking, ScheduledBookingInsert } from '../types/scheduledBooking'

export async function createScheduledBooking(booking: ScheduledBookingInsert) {
  const { data, error } = await supabase
    .from('scheduled_bookings')
    .insert(booking)
    .select()
    .single<ScheduledBooking>()

  if (error) throw error
  return data
}