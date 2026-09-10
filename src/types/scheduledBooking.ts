export const pakyawanTripTypes = ['One Way', 'Round Trip', 'Whole Day / Private Hire'] as const
export type PakyawanTripType = (typeof pakyawanTripTypes)[number]

export type PakyawanBookingInsert = {
  customer_id: string | null
  customer_name: string
  customer_phone: string
  booking_date: string
  pickup_time: string
  pickup_location: string
  destination: string
  passengers: number
  trip_type: PakyawanTripType
  estimated_hours: number | null
  special_requests: string | null
}

export type PakyawanBooking = PakyawanBookingInsert & {
  id: string
  status: 'pending' | 'quoted' | 'confirmed' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  driver_id: string | null
  vehicle_id: string | null
  created_at: string
  updated_at: string
}