export type DeliveryBookingInsert = {
  customer_id: string | null
  sender_name: string
  sender_phone: string
  package_type: string
  package_details: string | null
  package_size: string
  pickup_address: string
  delivery_address: string
  preferred_date: string
  preferred_time: string
}

export type DeliveryBooking = DeliveryBookingInsert & {
  id: string
  vehicle_preference: string | null
  price_cents: number | null
  status: string
  driver_id: string | null
  created_at: string
  updated_at: string
  proof_available?: boolean
}

export type DeliveryOfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn'

export type DeliveryOffer = {
  id: string
  delivery_id: string
  driver_id: string
  dispatch_round: number
  status: DeliveryOfferStatus
  offered_at: string
  expires_at: string
  decided_at: string | null
}

export type DeliveryOfferWithBooking = DeliveryOffer & {
  booking: DeliveryBooking
}
