import { supabase } from './supabase'

export type PassengerLocation = {
  ride_id: string
  latitude: number
  longitude: number
  updated_at: string
}

export async function updatePassengerLocation(
  rideId: string,
  latitude: number,
  longitude: number,
): Promise<PassengerLocation> {
  const { data, error } = await supabase
    .from('passenger_locations')
    .upsert(
      {
        ride_id: rideId,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'ride_id' },
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as PassengerLocation
}

export async function getPassengerLocation(rideId: string): Promise<PassengerLocation | null> {
  const { data, error } = await supabase
    .from('passenger_locations')
    .select('*')
    .eq('ride_id', rideId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as PassengerLocation | null) ?? null
}

export function subscribeToPassengerLocation(
  rideId: string,
  callback: (location: PassengerLocation) => void,
): () => void {
  void getPassengerLocation(rideId).then((location) => {
    if (location) callback(location)
  })

  const channel = supabase
    .channel(`passenger-location:${rideId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'passenger_locations',
        filter: `ride_id=eq.${rideId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          return
        }

        callback(payload.new as PassengerLocation)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}