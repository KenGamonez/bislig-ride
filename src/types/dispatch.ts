import type { Ride } from './ride'

export type RideOfferStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'withdrawn'

export type RideOffer = {
  id: string
  ride_id: string
  driver_id: string | null
  dispatch_round: number
  status: RideOfferStatus
  offered_at: string
  expires_at: string
  decided_at: string | null
}

export type DriverPresence = {
  driver_id: string
  latitude: number | null
  longitude: number | null
  updated_at: string
  is_online: boolean
  is_available: boolean
  auto_accept: boolean
  current_ride_id: string | null
}

export type DispatchResult = {
  ride_id: string
  ride_status: Ride['status'] | null
  driver_assigned: string | null
  offer_id: string | null
  no_driver_found: boolean
  no_driver_candidates: number
}

export type PendingOffer = {
  offer: RideOffer
  ride: Ride
}