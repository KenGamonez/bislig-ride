import type { CancelledByRole, RideCancellation } from '../types/ride'
import { supabase } from './supabase'

export type RecordCancellationInput = {
  ride_id: string
  cancelled_by: string
  cancelled_by_role: CancelledByRole
  reason: string
}

export async function recordRideCancellation(
  input: RecordCancellationInput,
): Promise<RideCancellation> {
  const { data, error } = await supabase
    .from('ride_cancellations')
    .insert({
      ride_id: input.ride_id,
      cancelled_by: input.cancelled_by,
      cancelled_by_role: input.cancelled_by_role,
      reason: input.reason.trim(),
    })
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as RideCancellation
}

export async function fetchRideCancellations(rideId: string): Promise<RideCancellation[]> {
  try {
    const { data, error } = await supabase
      .from('ride_cancellations')
      .select('*')
      .eq('ride_id', rideId)
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Unable to fetch ride cancellations:', error.message)
      return []
    }

    return (data ?? []) as RideCancellation[]
  } catch (err) {
    console.warn('Error fetching ride cancellations:', err)
    return []
  }
}

export async function fetchLatestRideCancellation(
  rideId: string,
): Promise<RideCancellation | null> {
  const cancellations = await fetchRideCancellations(rideId)
  return cancellations[0] ?? null
}

export type AdminCancellation = RideCancellation & {
  riderName: string
  driverName: string
  cancelledByName: string
  pickupAddress: string
  destinationAddress: string
}

type CancellationRow = {
  id: string
  ride_id: string
  cancelled_by: string
  cancelled_by_role: CancelledByRole
  reason: string
  created_at: string
  rides?: {
    customer_name?: string | null
    driver_id?: string | null
    pickup_address?: string | null
    destination_address?: string | null
  } | null
}

export async function fetchAdminRideCancellations(): Promise<AdminCancellation[]> {
  const { data, error } = await supabase
    .from('ride_cancellations')
    .select(
      'id, ride_id, cancelled_by, cancelled_by_role, reason, created_at, rides(customer_name, driver_id, pickup_address, destination_address)',
    )
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = (data ?? []) as CancellationRow[]

  const driverIds = [...new Set(
    rows
      .map((cancellation) => cancellation.rides?.driver_id)
      .filter((id): id is string => Boolean(id)),
  )]

  let driverMap = new Map<string, string>()

  if (driverIds.length > 0) {
    const { data: drivers, error: driverError } = await supabase
      .from('drivers')
      .select('id, full_name')
      .in('id', driverIds)

    if (driverError) throw driverError

    driverMap = new Map(
      (drivers ?? []).map((driver) => [driver.id, driver.full_name]),
    )
  }

  return rows.map((cancellation) => {
    const ride = cancellation.rides ?? null
    const riderName = ride?.customer_name ?? 'Unknown rider'
    const driverName = ride?.driver_id
      ? driverMap.get(ride.driver_id) ?? 'Assigned driver'
      : 'Unassigned'

    return {
      id: cancellation.id,
      ride_id: cancellation.ride_id,
      cancelled_by: cancellation.cancelled_by,
      cancelled_by_role: cancellation.cancelled_by_role,
      reason: cancellation.reason,
      created_at: cancellation.created_at,
      riderName,
      driverName,
      cancelledByName:
        cancellation.cancelled_by_role === 'driver' ? driverName : riderName,
      pickupAddress: ride?.pickup_address || '—',
      destinationAddress: ride?.destination_address || '—',
    }
  })
}

export function subscribeToRideCancellations(
  rideId: string,
  onCancellation: (cancellation: RideCancellation) => void,
): () => void {
  const channel = supabase
    .channel(`ride-cancellations-${rideId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_cancellations',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        const incoming = payload.new as RideCancellation | undefined

        if (incoming && incoming.ride_id === rideId) {
          onCancellation(incoming)
        }
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}