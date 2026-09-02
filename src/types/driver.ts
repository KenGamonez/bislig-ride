export type DriverStatus = 'active' | 'inactive'
export type DriverAvailability = 'offline' | 'online' | 'busy'

export type DriverProfile = {
  id: number | string
  full_name: string
  phone: string
  email: string | null
  profile_photo_url: string | null
  vehicle_type: string | null
  vehicle_model: string | null
  plate_number: string | null
  status: DriverStatus
  availability: DriverAvailability
  auth_user_id: string | null
  created_at?: string
  updated_at?: string
}

export type DriverProfileInput = {
  full_name: string
  phone: string
  email?: string | null
  profile_photo_url?: string | null
  vehicle_type?: string | null
  vehicle_model?: string | null
  plate_number?: string | null
  status?: DriverStatus
  availability?: DriverAvailability
  auth_user_id?: string | null
}

export type DriverAuthUser = {
  id: string
  email?: string | null
  phone?: string | null
}
