import { supabase } from './supabase'
import type {
  DriverApplication,
  DriverApplicationInsert,
  DriverApplicationStatus,
} from '../types/driverApplication'

export async function createDriverApplication(application: DriverApplicationInsert) {
  const { data, error } = await supabase
    .from('driver_applications')
    .insert(application)
    .select()
    .single<DriverApplication>()

  if (error) {
    throw error
  }

  return data
}

export async function fetchDriverApplications() {
  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return (data ?? []) as DriverApplication[]
}

export async function updateDriverApplicationStatus(id: string, status: DriverApplicationStatus) {
  const { data, error } = await supabase
    .from('driver_applications')
    .update({ status })
    .eq('id', id)
    .select()
    .single<DriverApplication>()

  if (error) {
    throw error
  }

  return data
}