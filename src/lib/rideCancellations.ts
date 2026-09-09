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