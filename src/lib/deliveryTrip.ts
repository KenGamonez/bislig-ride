import type { DeliveryBooking } from '../types/delivery'

/**
 * Pure selector for the driver's single current Delivery transaction.
 *
 * Ranking follows the real operational lifecycle (later stage wins):
 * in_transit > picked_up > driver_arrived > driver_on_way >
 * confirmed > quoted > assigned.
 *
 * pending / dispatching / delivered / cancelled / failed / no_driver are
 * never current driver-workspace transactions. Ties break on updated_at,
 * then created_at (most recent wins). Missing timestamps sort oldest.
 */

export const DELIVERY_LIFECYCLE_RANK: Record<string, number> = {
  assigned: 1,
  quoted: 2,
  confirmed: 3,
  driver_on_way: 4,
  driver_arrived: 5,
  picked_up: 6,
  in_transit: 7,
}

export function deliveryLifecycleRank(status: string): number {
  return DELIVERY_LIFECYCLE_RANK[status] ?? 0
}

export function isCurrentDeliveryStatus(status: string): boolean {
  return deliveryLifecycleRank(status) > 0
}

export type DeliveryTripCandidate = Pick<
  DeliveryBooking,
  'id' | 'status' | 'driver_id' | 'created_at' | 'updated_at'
>

export function selectCurrentDeliveryTrip<T extends DeliveryTripCandidate>(
  bookings: readonly T[],
): T | null {
  let best: T | null = null
  let bestRank = 0
  let bestUpdated = ''
  let bestCreated = ''

  for (const booking of bookings) {
    const rank = deliveryLifecycleRank(booking.status)

    if (rank === 0) {
      continue
    }

    const updated = booking.updated_at ?? ''
    const created = booking.created_at ?? ''

    if (
      best === null ||
      rank > bestRank ||
      (rank === bestRank && (updated > bestUpdated || (updated === bestUpdated && created > bestCreated)))
    ) {
      best = booking
      bestRank = rank
      bestUpdated = updated
      bestCreated = created
    }
  }

  return best
}
