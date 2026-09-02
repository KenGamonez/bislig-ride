import { supabase } from './supabase'
import type { DriverAvailability, DriverProfile, DriverProfileInput, DriverStatus } from '../types/driver'

export type DriverRecord = DriverProfile
export type DriverInput = DriverProfileInput
export type { DriverAvailability, DriverStatus }

export async function fetchDrivers(): Promise<DriverRecord[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as DriverRecord[]
}

export async function fetchDriverByAuthUserId(authUserId: string): Promise<DriverRecord | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as DriverRecord | null) ?? null
}

export async function createDriver(input: DriverInput): Promise<DriverRecord> {
  const payload = {
    full_name: input.full_name,
    phone: input.phone,
    email: input.email ?? null,
    profile_photo_url: input.profile_photo_url ?? null,
    vehicle_type: input.vehicle_type ?? null,
    vehicle_model: input.vehicle_model ?? null,
    plate_number: input.plate_number ?? null,
    status: input.status ?? 'active',
    availability: input.availability ?? 'offline',
    auth_user_id: input.auth_user_id ?? null,
  }

  const { data, error } = await supabase.from('drivers').insert(payload).select().single()

  if (error) {
    throw error
  }

  return data as DriverRecord
}

export async function updateDriver(id: number | string, updates: Partial<DriverInput>): Promise<DriverRecord> {
  const { data, error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as DriverRecord
}

export async function updateDriverAvailability(id: number | string, availability: DriverAvailability): Promise<DriverRecord> {
  return updateDriver(id, { availability })
}
