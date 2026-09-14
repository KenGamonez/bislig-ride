import { useEffect, useState } from 'react'
import { fetchDriverById, type DriverProfileView } from '../lib/drivers'
import { fetchCustomerReputation, type ReputationSummary } from '../lib/reputation'
import { fetchCustomerRideHistory } from '../lib/rides'
import { getCustomerAuthId } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import type { Ride } from '../types/ride'

type DriverDetails = DriverProfileView | null

const activeStatuses: Ride['status'][] = [
  'requested',
  'accepted',
  'arrived',
  'in_progress',
]

export function CustomerProfile() {
  const { t } = useLanguage()
  const [rides, setRides] = useState<Ride[]>([])
  const [driverDetails, setDriverDetails] = useState<Record<string, DriverDetails>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [reputation, setReputation] = useState<ReputationSummary | null>(null)

  const formatStatus = (status: Ride['status']) => {
    switch (status) {
      case 'requested':
        return t('profile.statusFinding')
      case 'accepted':
        return t('profile.statusAccepted')
      case 'arrived':
        return t('profile.statusArrived')
      case 'in_progress':
        return t('profile.statusInProgress')
      case 'completed':
        return t('profile.statusCompleted')
      case 'cancelled':
        return t('profile.statusCancelled')
      default:
        return status
    }
  }

  useEffect(() => {
    let isMounted = true

    const loadReputation = async () => {
      try {
        const customerAuthId = await getCustomerAuthId()
        const summary = await fetchCustomerReputation(customerAuthId)

        if (isMounted) {
          setReputation(summary)
        }
      } catch (error) {
        console.error('Failed to load Rider reputation:', error)
      }
    }

    void loadReputation()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadRides = async () => {
      setIsLoading(true)

      try {
        const customerRides = await fetchCustomerRideHistory()

        if (!isMounted) {
          return
        }

        setRides(customerRides)

        const driverIds = [
          ...new Set(
            customerRides
              .map((ride) => ride.driver_id)
              .filter((driverId): driverId is string => Boolean(driverId))
              .map(String),
          ),
        ]

        if (driverIds.length === 0) {
          setDriverDetails({})
          return
        }

        const results = await Promise.all(
          driverIds.map(async (driverId) => {
            const driver = await fetchDriverById(driverId)
            return [driverId, driver] as const
          }),
        )

        if (isMounted) {
          setDriverDetails(Object.fromEntries(results))
        }
      } catch (error) {
        console.error('Failed to load Rider rides:', error)

        if (isMounted) {
          setRides([])
          setDriverDetails({})
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadRides()

    return () => {
      isMounted = false
    }
  }, [])

  const activeRide = rides.find((ride) => activeStatuses.includes(ride.status))
  const historyRides = rides.filter((ride) => ride.id !== activeRide?.id)

  const renderRide = (ride: Ride, isActive = false) => {
    const driver = ride.driver_id
      ? driverDetails[String(ride.driver_id)]
      : null

    return (
      <article
        key={ride.id}
        className="Rider-profile-history-item"
      >
        <div>
          <strong>
            {ride.pickup_address} {'->'} {ride.destination_address}
          </strong>

          <p>
            {isActive
              ? formatStatus(ride.status)
              : new Date(ride.created_at).toLocaleDateString()}
            {' '}
            {isActive ? '' : formatStatus(ride.status)}
          </p>

{driver ? (
            <>
              <p>{t('profile.driver')} {driver.full_name}</p>

              {driver.vehicle_type || driver.vehicle_model ? (
                <p>
                  {t('profile.vehicle')}{' '}
                  {[driver.vehicle_type, driver.vehicle_model]
                    .filter(Boolean)
                    .join(' - ')}
                </p>
              ) : null}

              {driver.vehicle_color ? (
                <p>{t('profile.color')} {driver.vehicle_color}</p>
              ) : null}

              {driver.plate_number ? (
                <p>{t('profile.plate')} {driver.plate_number}</p>
              ) : null}

              {driver.rating_average !== null &&
              driver.rating_average !== undefined ? (
                <p>
                  {t('profile.driverRating', { rating: Number(driver.rating_average).toFixed(1) })}
                </p>
              ) : null}
            </>
          ) : isActive && ride.status !== 'requested' ? (
            <p>{t('profile.driverLoading')}</p>
          ) : null}

          {ride.rating ? (
            <p>
              {t('profile.yourRating', { rating: ride.rating })}
              {ride.rating_comment
                ? ` - ${ride.rating_comment}`
                : ''}
            </p>
          ) : null}
        </div>
      </article>
    )
  }

  return (
<section className="Rider-profile">
      <div className="Rider-profile-header">
        <h2>{t('nav.myRides')}</h2>
        <p>{t('profile.subtitle')}</p>
      </div>

      {reputation ? (
        <div className="driver-metrics">
          <div className="metric-card">
            <span>{t('profile.completedRides')}</span>
            <strong>{reputation.completedRides}</strong>
            <small>{t('profile.allTime')}</small>
          </div>
          <div className="metric-card">
            <span>{t('profile.rating')}</span>
            <strong>{reputation.averageStars.toFixed(1)}</strong>
            <small>{reputation.totalRatings} {reputation.totalRatings === 1 ? t('profile.ratingCount') : t('profile.ratingCounts')}</small>
          </div>
          <div className="metric-card">
            <span>{t('profile.cancellations')}</span>
            <strong>{`${reputation.cancelledRides} (${reputation.cancellationRate}%)`}</strong>
            <small>{t('profile.ofCompleted')}</small>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="Rider-profile-empty">
          {t('profile.loading')}
        </div>
      ) : rides.length === 0 ? (
        <div className="Rider-profile-empty">
          <strong>{t('profile.noRides')}</strong>
          <p>{t('profile.noRidesText')}</p>
        </div>
      ) : (
        <div className="Rider-profile-history">
          {activeRide ? (
            <>
              <h3>{t('profile.activeRide')}</h3>
              {renderRide(activeRide, true)}
            </>
          ) : null}

          {historyRides.length > 0 ? (
            <>
              <h3>{t('profile.rideHistory')}</h3>
              {historyRides.map((ride) => renderRide(ride))}
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}
