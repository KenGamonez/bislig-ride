import { supabase } from './supabase'

export type DriverLocation = {
  driver_id: string
  latitude: number
  longitude: number
  updated_at: string
}

export async function updateDriverLocation(driverId: string, latitude: number, longitude: number): Promise<DriverLocation> {
  const { data, error } = await supabase
    .from('driver_locations')
    .upsert(
      {
        driver_id: driverId,
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'driver_id' },
    )
    .select()
    .single()

  if (error) {
    throw error
  }

  return data as DriverLocation
}

export async function getDriverLocation(driverId: string): Promise<DriverLocation | null> {
  const { data, error } = await supabase
    .from('driver_locations')
    .select('*')
    .eq('driver_id', driverId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as DriverLocation | null) ?? null
}

export function subscribeToDriverLocation(
  driverId: string,
  callback: (location: DriverLocation) => void,
): () => void {
  void getDriverLocation(driverId).then((location) => {
    if (location) callback(location)
  })

  const channel = supabase
    .channel(`driver-location:${driverId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `driver_id=eq.${driverId}`,
      },
      (payload) => {
        if (payload.eventType === 'DELETE') {
          return
        }

        callback(payload.new as DriverLocation)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

