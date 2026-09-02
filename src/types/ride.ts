export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'

export type Ride = {
  id: number
  customer_name: string
  customer_phone: string
  pickup_address: string
  pickup_lat: number | null
  pickup_lng: number | null
  destination_address: string
  destination_lat: number | null
  destination_lng: number | null
  driver_id: string | null
  status: RideStatus
  created_at: string
}
