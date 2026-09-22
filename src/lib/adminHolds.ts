import { supabase } from './supabase'

export type AdminDriverHold = {
  id: string
  driverId: string
  action: string
  reason: string
  createdBy: string | null
  createdAt: string
  releasedAt: string | null
  releasedBy: string | null
}

export type ForceOfflineResult = {
  driver_id: string
  success: boolean
  already_offline: boolean
  active_ride_id: string | null
  offers_withdrawn: number
  hold_id: string
}

export type ReleaseHoldResult = {
  hold_id: string
  driver_id: string
  released: boolean
  already_released: boolean
}

export async function fetchAdminDriverHolds(): Promise<Record<string, AdminDriverHold>> {
  const holds: Record<string, AdminDriverHold> = {}

  // Open holds only; explicit column allowlist, never select('*').
  const { data, error } = await supabase
    .from('admin_driver_holds')
    .select('id, driver_id, action, reason, created_by, created_at, released_at, released_by')
    .is('released_at', null)

  if (error) throw error

  for (const hold of data ?? []) {
    holds[hold.driver_id] = {
      id: hold.id,
      driverId: hold.driver_id,
      action: hold.action,
      reason: hold.reason,
      createdBy: hold.created_by,
      createdAt: hold.created_at,
      releasedAt: hold.released_at,
      releasedBy: hold.released_by,
    }
  }

  return holds
}

export async function forceDriverOffline(driverId: string, reason: string): Promise<ForceOfflineResult> {
  const { data, error } = await supabase
    .rpc('admin_force_driver_offline', {
      p_driver_id: driverId,
      p_reason: reason,
    })
    .single()

  if (error) {
    throw error
  }

  return data as ForceOfflineResult
}

export async function releaseDriverHold(holdId: string): Promise<ReleaseHoldResult> {
  const { data, error } = await supabase
    .rpc('admin_release_driver_hold', {
      p_hold_id: holdId,
    })
    .single()

  if (error) {
    throw error
  }

  return data as ReleaseHoldResult
}

export function subscribeToAdminHolds(onInvalidate: () => void): () => void {
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
    .channel('admin-driver-holds-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_driver_holds' }, scheduleRefresh)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_driver_holds' }, scheduleRefresh)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'admin_driver_holds' }, scheduleRefresh)
    .subscribe()

  return () => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    void supabase.removeChannel(channel)
  }
}
