export const pakyawanTripTypes = ['One Way', 'Round Trip', 'Whole Day / Private Hire'] as const
export type PakyawanTripType = (typeof pakyawanTripTypes)[number]

export type PakyawanBookingInsert = {
  customer_id: string | null
  customer_name: string
  customer_phone: string
  booking_date: string | null
  pickup_time: string | null
  pickup_location: string
  destination: string
  passengers: number
  trip_type: PakyawanTripType
  estimated_hours: number | null
  special_requests: string | null
}

export type PakyawanBooking = PakyawanBookingInsert & {
  id: string
  status: 'pending' | 'quoted' | 'confirmed' | 'assigned' | 'scheduled' | 'driver_on_way' | 'driver_arrived' | 'in_progress' | 'completed' | 'cancelled'
  driver_id: string | null
  vehicle_id: string | null
  vehicle_preference: string | null
  price_cents: number | null
  created_at: string
  updated_at: string
}

export type PakyawanOfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn'

export type PakyawanOffer = {
  id: string
  booking_id: string
  driver_id: string
  dispatch_round: number
  status: PakyawanOfferStatus
  offered_at: string
  expires_at: string
  decided_at: string | null
}

export type PakyawanOfferWithBooking = PakyawanOffer & {
  booking: PakyawanBooking
}

export type PakyawanChatRole = 'passenger' | 'driver'

export type PakyawanMessage = {
  id: string
  booking_id: string
  sender_role: PakyawanChatRole
  message: string
  created_at: string
}

