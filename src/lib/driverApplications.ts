import { supabase } from './supabase'
import type {
  DriverApplication,
  DriverApplicationInsert,
  DriverApplicationStatus,
} from '../types/driverApplication'

type DatabaseDriverApplication = {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  vehicle_type: string | null
  vehicle_model: string | null
  vehicle_color: string | null
  plate_number: string | null
  license_number: string | null
  message: string | null
  mobile_number: string | null
  barangay: string | null
  vehicle_number: string | null
  driving_experience: number | null
  operating_area: string | null
  preferred_schedule: string | null
  reason: string | null
  contact_preference: string | null
  status: DriverApplicationStatus
  created_at: string
}

function mapApplication(row: DatabaseDriverApplication): DriverApplication {
  return {
    id: row.id,
    full_name: row.full_name,
    mobile_number: row.mobile_number ?? row.phone ?? '',
    barangay: row.barangay ?? row.address ?? '',
    email: row.email,
    vehicle_number: row.vehicle_number ?? row.vehicle_model ?? '',
    plate_number: row.plate_number,
    driving_experience: row.driving_experience ?? 0,
    operating_area: row.operating_area ?? '',
    preferred_schedule: row.preferred_schedule ?? '',
    reason: row.reason ?? row.message,
    contact_preference: row.contact_preference ?? 'Phone',
    status: row.status,
    created_at: row.created_at,
  }
}

export async function createDriverApplication(application: DriverApplicationInsert) {
  const { data, error } = await supabase
    .from('driver_applications')
    .insert(application)
    .select('*')
    .single()

  if (error) throw error

  return mapApplication(data as DatabaseDriverApplication)
}

export async function fetchDriverApplications() {
  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((row) =>
    mapApplication(row as DatabaseDriverApplication)
  )
}

export async function updateDriverApplicationStatus(
  id: string,
  status: DriverApplicationStatus
) {
  const { data, error } = await supabase
    .from('driver_applications')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  if (error) throw error

  return mapApplication(data as DatabaseDriverApplication)
}
