export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'

export type Ride = {
  id: string
  customer_auth_id: string | null
  customer_name: string
  customer_phone: string
  pickup_address: string
  pickup_lat: number | null
  pickup_lng: number | null
  destination_address: string
  destination_lat: number | null
  destination_lng: number | null
  driver_id: string | null
  passenger_count: number
  status: RideStatus
  rating?: number | null
  rating_comment?: string | null
  created_at: string
}
