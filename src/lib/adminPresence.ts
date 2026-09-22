import { supabase } from './supabase'

export type AdminDriverPresence = {
  driverId: string
  isOnline: boolean
  isAvailable: boolean
  currentRideId: string | null
  updatedAt: string
}

export async function fetchAdminDriverPresence(): Promise<Record<string, AdminDriverPresence>> {
  const presence: Record<string, AdminDriverPresence> = {}

  // Projection columns only — never driver_locations, never GPS.
  const { data, error } = await supabase
    .from('admin_driver_presence')
    .select('driver_id, is_online, is_available, current_ride_id, updated_at')

  if (error) throw error

  for (const row of data ?? []) {
    presence[row.driver_id] = {
      driverId: row.driver_id,
      isOnline: row.is_online,
      isAvailable: row.is_available,
      currentRideId: row.current_ride_id,
      updatedAt: row.updated_at,
    }
  }

  return presence
}

export function subscribeToAdminPresence(onInvalidate: () => void): () => void {
  let refreshTimer: number | null = null

  const scheduleRefresh = () => {
    if (refreshTimer !== null) {
      return
    }

    refreshTimer = window.setTimeout(() => {
      refreshTimer = null
      onInvalidate()
    }, 600)
  }

  const channel = supabase
    .channel('admin-driver-presence-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_driver_presence' }, scheduleRefresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_driver_presence' }, scheduleRefresh)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'admin_driver_presence' }, scheduleRefresh)
    .subscribe()

  return () => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    void supabase.removeChannel(channel)
  }
}
