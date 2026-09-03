export const scheduledBookingTripTypes = ['One Way', 'Round Trip', 'Whole Day / Private Hire'] as const
export type ScheduledBookingTripType = (typeof scheduledBookingTripTypes)[number]

export type ScheduledBookingInsert = {
  customer_id: string | null
  customer_name: string
  customer_phone: string
  booking_date: string
  pickup_time: string
  pickup_location: string
  destination: string
  passengers: number
  trip_type: ScheduledBookingTripType
  special_requests: string | null
}

export type ScheduledBooking = ScheduledBookingInsert & {
  id: string
  status: 'pending' | 'quoted' | 'confirmed' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  quoted_fare: number | null
  driver_id: string | null
  vehicle_id: string | null
  created_at: string
  updated_at: string
}