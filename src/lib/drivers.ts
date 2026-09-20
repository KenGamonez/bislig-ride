import { supabase } from './supabase'

export type DriverRecord = {
  id: string
  full_name: string
  phone: string
  email: string | null
  profile_photo_url: string | null
vehicle_type: string
  vehicle_model: string
  plate_number: string
  vehicle_capacity: number | null
  status: 'active' | 'inactive'
  availability: 'offline' | 'online' | 'busy'
  can_accept_pakyawan: boolean
  can_accept_deliveries: boolean
  created_at: string
  auth_user_id: string | null
  username: string | null
  vehicle_color: string | null
  rating_average: number | null
  total_ratings: number | null
}

export async function fetchDrivers() {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []) as DriverRecord[]
}

export async function createDriver(driver: {
  full_name: string
  phone: string
  email?: string | null
  vehicle_type: string
  vehicle_model: string
  plate_number: string
  vehicle_capacity?: number | null
  status?: 'active' | 'inactive'
  availability?: 'offline' | 'online' | 'busy'
  can_accept_pakyawan?: boolean
  can_accept_deliveries?: boolean
  vehicle_color?: string | null
  profile_photo_url?: string | null
  username?: string | null
  auth_user_id?: string | null
}) {
  const { data, error } = await supabase
    .from('drivers')
    .insert(driver)
    .select('*')
    .single<DriverRecord>()

  if (error) throw error

  return data
}

export async function updateDriver(
  id: string,
  updates: Partial<Pick<
    DriverRecord,
    | 'full_name'
    | 'phone'
    | 'email'
    | 'vehicle_type'
    | 'vehicle_model'
    | 'vehicle_capacity'
    | 'plate_number'
    | 'status'
    | 'availability'
    | 'can_accept_pakyawan'
    | 'can_accept_deliveries'
    | 'vehicle_color'
    | 'username'
    | 'auth_user_id'
  >>
) {
  const { data, error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single<DriverRecord>()

  if (error) throw error

  return data
}
export type DriverProfileView = {
  id: string
  full_name: string
  profile_photo_url: string | null
  vehicle_type: string | null
  vehicle_model: string | null
  vehicle_color: string | null
  vehicle_capacity: number | null
  plate_number: string | null
  rating_average: number | null
  total_ratings: number | null
}

export async function removeDriver(driverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_remove_driver', {
    p_driver_id: driverId,
  })

  if (error) throw error

  return data === true
}

export async function fetchDriverById(driverId: string): Promise<DriverProfileView | null> {
  const { data, error } = await supabase
    .from('driver_profiles')
    .select('*')
    .eq('id', driverId)
    .maybeSingle<DriverProfileView>()

  if (error) throw error

  return data
}

