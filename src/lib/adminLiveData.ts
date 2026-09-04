import { supabase } from './supabase'

export type LiveAdminRide = {
  id: string
  Rider: string
  customerPhone: string
  driver: string
  passengerType: string
  pickup: string
  destination: string
  status: 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed'
  requestedAt: string
  fare: string
  paymentMethod: string
  driverId: string | null
  customerAuthId: string | null
}

export type LiveAdminCustomer = {
  id: string
  name: string
  phone: string
  rides: number
  lastRide: string
  status: string
}

export async function fetchAdminLiveRides(): Promise<LiveAdminRide[]> {
  const { data: rides, error } = await supabase
    .from('rides')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  const driverIds = [...new Set(
    (rides ?? [])
      .map((ride) => ride.driver_id)
      .filter((id): id is string => Boolean(id))
  )]

  let driverMap = new Map<string, string>()

  if (driverIds.length > 0) {
    const { data: drivers, error: driverError } = await supabase
      .from('drivers')
      .select('id, full_name')
      .in('id', driverIds)

    if (driverError) throw driverError

    driverMap = new Map(
      (drivers ?? []).map((driver) => [driver.id, driver.full_name])
    )
  }

  return (rides ?? []).map((ride) => ({
    id: ride.id,
    Rider: ride.customer_name,
    customerPhone: ride.customer_phone,
    driver: ride.driver_id
      ? driverMap.get(ride.driver_id) ?? 'Assigned driver'
      : 'Unassigned',
    passengerType: `${ride.passenger_count} passenger${ride.passenger_count === 1 ? '' : 's'}`,
    pickup: ride.pickup_address,
    destination: ride.destination_address,
    status: ride.status,
    requestedAt: new Date(ride.created_at).toLocaleString(),
    fare: '—',
    paymentMethod: 'Not connected',
    driverId: ride.driver_id,
    customerAuthId: ride.customer_auth_id,
  }))
}

export async function fetchAdminLiveCustomers(): Promise<LiveAdminCustomer[]> {
  const { data: rides, error } = await supabase
    .from('rides')
    .select('id, customer_name, customer_phone, customer_auth_id, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error

  const customers = new Map<string, LiveAdminCustomer>()

  for (const ride of rides ?? []) {
    const key = ride.customer_auth_id ||
      `${ride.customer_name.toLowerCase()}|${ride.customer_phone}`

    const existing = customers.get(key)

    if (existing) {
      existing.rides += 1
      continue
    }

    customers.set(key, {
      id: key,
      name: ride.customer_name,
      phone: ride.customer_phone,
      rides: 1,
      lastRide: new Date(ride.created_at).toLocaleString(),
      status: 'Rider',
    })
  }

  return [...customers.values()]
}

