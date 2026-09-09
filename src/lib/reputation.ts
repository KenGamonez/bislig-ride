import { supabase } from './supabase'

export type ReputationSummary = {
  completedRides: number
  cancelledRides: number
  totalRides: number
  totalRatings: number
  averageStars: number
  cancellationRate: number
}

const emptySummary: ReputationSummary = {
  completedRides: 0,
  cancelledRides: 0,
  totalRides: 0,
  totalRatings: 0,
  averageStars: 0,
  cancellationRate: 0,
}

type ReputationRpcResult = {
  average_stars?: number | null
  rating_count?: number | null
  completed_rides?: number | null
  cancelled_rides?: number | null
  total_rides?: number | null
  cancellation_rate?: number | null
}

type ReputationAggregates = {
  completedRides: number
  cancelledRides: number
  averageStars: number | null
  totalRatings: number
}

async function fetchReputationAggregates(
  userColumn: 'driver_id' | 'customer_auth_id',
  userId: string,
): Promise<ReputationAggregates | null> {
  const { data: rides, error: ridesError } = await supabase
    .from('rides')
    .select('status')
    .eq(userColumn, userId)

  if (ridesError) {
    return null
  }

  const { data: ratings, error: ratingsError } = await supabase
    .from('ride_ratings')
    .select('stars')
    .eq('rated_user_id', userId)

  if (ratingsError) {
    return null
  }

  const completedRides = rides?.filter((ride) => ride.status === 'completed').length ?? 0
  const cancelledRides = rides?.filter((ride) => ride.status === 'cancelled').length ?? 0
  const totalRatings = ratings?.length ?? 0
  const averageStars =
    totalRatings === 0
      ? null
      : (ratings!.reduce((sum, rating) => sum + rating.stars, 0) / totalRatings)

  return { completedRides, cancelledRides, averageStars, totalRatings }
}

function toSummary(aggregates: ReputationAggregates | null): ReputationSummary {
  if (!aggregates) {
    return emptySummary
  }

  const totalRides = aggregates.completedRides + aggregates.cancelledRides

  return {
    completedRides: aggregates.completedRides,
    cancelledRides: aggregates.cancelledRides,
    totalRides,
    totalRatings: aggregates.totalRatings,
    averageStars: aggregates.averageStars ?? 0,
    cancellationRate:
      totalRides === 0 ? 0 : Math.round((aggregates.cancelledRides / totalRides) * 100),
  }
}

export async function fetchDriverReputation(driverId: string): Promise<ReputationSummary> {
  try {
    return toSummary(await fetchReputationAggregates('driver_id', driverId))
  } catch (err) {
    console.warn('Error fetching driver reputation:', err)
    return emptySummary
  }
}

export async function fetchCustomerReputation(customerAuthId: string): Promise<ReputationSummary> {
  try {
    return toSummary(await fetchReputationAggregates('customer_auth_id', customerAuthId))
  } catch (err) {
    console.warn('Error fetching customer reputation:', err)
    return emptySummary
  }
}

// Cross-role reputation views (rider viewing a driver, driver viewing a rider).
// Routes through public.get_reputation (security definer RPC) so unrelated trip
// and rating rows are never exposed to the caller. Falls back to empty on any
// failure (RPC not applied yet, unauthorized, network) so the UI degrades
// gracefully instead of crashing.
export async function fetchReputationFor(
  userId: string,
  isDriver: boolean,
): Promise<ReputationSummary> {
  try {
    const { data, error } = await supabase
      .rpc('get_reputation', { p_user_id: userId, p_is_driver: isDriver })
      .maybeSingle()

    if (error) {
      console.warn('Unable to fetch reputation:', error.message)
      return emptySummary
    }

    if (!data) {
      return emptySummary
    }

    const result = data as ReputationRpcResult

    return {
      completedRides: Number(result.completed_rides ?? 0),
      cancelledRides: Number(result.cancelled_rides ?? 0),
      totalRides: Number(result.total_rides ?? 0),
      totalRatings: Number(result.rating_count ?? 0),
      averageStars: Number(result.average_stars ?? 0),
      cancellationRate: Number(result.cancellation_rate ?? 0),
    }
  } catch (err) {
    console.warn(`Error fetching ${isDriver ? 'driver' : 'rider'} reputation:`, err)
    return emptySummary
  }
}

export const formatCancellationRate = (rate: number) =>
  Number.isInteger(rate) ? `${rate}%` : `${rate.toFixed(1)}%`