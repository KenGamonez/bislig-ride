/* Bislig Hub — Pakyawan current-transaction selection.
 *
 * Pure presentation rule (no backend changes): rank the driver's held
 * bookings by existing lifecycle meaning so the workspace shows the ONE
 * transaction that most needs the driver's attention.
 *
 * Rank order (higher = more current):
 *   in_progress (passenger aboard) > driver_arrived (passenger waiting) >
 *   driver_on_way (en route) > scheduled (confirmed upcoming) >
 *   confirmed (just confirmed) > assigned (driver action: send price) >
 *   quoted (waiting on passenger — nothing for the driver to do).
 * Completed/cancelled/pending/unknown states are never current.
 * Ties break by most recently updated, then most recently created.
 */

import type { PakyawanBooking } from '../types/scheduledBooking'

const PAKYAWAN_ACTIVE_RANK: Record<string, number> = {
  in_progress: 60,
  driver_arrived: 50,
  driver_on_way: 40,
  scheduled: 30,
  confirmed: 25,
  assigned: 20,
  quoted: 10,
}

function rankOf(status: string): number {
  return PAKYAWAN_ACTIVE_RANK[status] ?? -1
}

function timeOf(value: string | null | undefined): number {
  if (!value) {
    return 0
  }

  const parsed = Date.parse(value)

  return Number.isFinite(parsed) ? parsed : 0
}

export function selectCurrentPakyawanTrip(
  bookings: PakyawanBooking[],
): PakyawanBooking | null {
  let best: PakyawanBooking | null = null
  let bestRank = -1
  let bestTime = -1

  for (const booking of bookings) {
    const rank = rankOf(booking.status)

    if (rank < 0) {
      continue
    }

    const stamp = Math.max(timeOf(booking.updated_at), timeOf(booking.created_at))

    if (best === null || rank > bestRank || (rank === bestRank && stamp > bestTime)) {
      best = booking
      bestRank = rank
      bestTime = stamp
    }
  }

  return best
}
