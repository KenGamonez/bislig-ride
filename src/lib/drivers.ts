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
  status: 'active' | 'inactive'
  availability: 'offline' | 'online' | 'busy'
  created_at: string
  auth_user_id: string | null
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
  status?: 'active' | 'inactive'
  availability?: 'offline' | 'online' | 'busy'
  vehicle_color?: string | null
  profile_photo_url?: string | null
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
    | 'plate_number'
    | 'status'
    | 'availability'
    | 'vehicle_color'
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
export async function fetchDriverById(driverId: string) {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', driverId)
    .single<DriverRecord>()

  if (error) throw error

  return data
}

