import { supabase } from './supabase'
import { fetchRideById } from './rides'
import type { DispatchResult, DriverPresence, PendingOffer, RideOffer } from '../types/dispatch'
import type { Ride } from '../types/ride'

export async function setDriverPresence(
  online: boolean,
  available: boolean,
  autoAccept: boolean,
): Promise<DriverPresence> {
  const { data, error } = await supabase
    .rpc('set_driver_presence', {
      p_online: online,
      p_available: available,
      p_auto_accept: autoAccept,
    })
    .single()

  if (error) {
    throw error
  }

  return data as DriverPresence
}

export async function dispatchRide(rideId: string): Promise<DispatchResult> {
  const { data, error } = await supabase.rpc('dispatch_ride', { p_ride_id: rideId }).single()

  if (error) {
    throw error
  }

  return data as DispatchResult
}

export async function acceptRideOffer(rideId: string, driverId: string): Promise<Ride> {
  const { data, error } = await supabase
    .rpc('accept_ride_offer', {
      p_ride_id: rideId,
      p_driver_id: driverId,
    })
    .single()

  if (error) {
    throw error
  }

  return data as Ride
}

export async function declineRideOffer(rideId: string, driverId: string): Promise<DispatchResult> {
  const { data, error } = await supabase
    .rpc('decline_ride_offer', {
      p_ride_id: rideId,
      p_driver_id: driverId,
    })
    .single()

  if (error) {
    throw error
  }

  return data as DispatchResult
}

export async function fetchPendingOffer(driverId: string): Promise<PendingOffer | null> {
  const { data, error } = await supabase
    .from('ride_offers')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'offered')
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  const offer = data as RideOffer | null

  if (!offer) {
    return null
  }

  const ride = await fetchRideById(offer.ride_id)

  if (!ride || ride.status !== 'requested') {
    return null
  }

  return { offer, ride }
}

export function subscribeToDriverOffers(
  driverId: string,
  callback: (pending: PendingOffer) => void,
): () => void {
  void fetchPendingOffer(driverId).then((pending) => {
    if (pending) callback(pending)
  })

  const channel = supabase
    .channel(`driver-offers-${driverId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ride_offers',
        filter: `driver_id=eq.${driverId},status=eq.offered`,
      },
      async (payload) => {
        const ride = await fetchRideById((payload.new as RideOffer).ride_id)

        if (!ride || ride.status !== 'requested') {
          return
        }

        callback({ offer: payload.new as RideOffer, ride })
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}