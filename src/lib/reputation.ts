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