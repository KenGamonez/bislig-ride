import { useEffect, useState } from 'react'
import { fetchDriverById } from '../lib/drivers'
import { fetchCustomerRideHistory } from '../lib/rides'
import type { Ride } from '../types/ride'
import type { DriverProfile } from '../types/driver'

type DriverDetails = DriverProfile | null

const activeStatuses: Ride['status'][] = [
  'requested',
  'accepted',
  'arrived',
  'in_progress',
]

const formatStatus = (status: Ride['status']) => {
  switch (status) {
    case 'requested':
      return 'Finding a driver'
    case 'accepted':
      return 'Driver accepted'
    case 'arrived':
      return 'Driver arrived'
    case 'in_progress':
      return 'Ride in progress'
    case 'completed':
      return 'Completed'
    default:
      return status
  }
}

export function CustomerProfile() {
  const [rides, setRides] = useState<Ride[]>([])
  const [driverDetails, setDriverDetails] = useState<Record<string, DriverDetails>>({})
  const [isLoading, setIsLoading] = useState(true)

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
              <p>Driver: {driver.full_name}</p>

              {driver.vehicle_type || driver.vehicle_model ? (
                <p>
                  Vehicle:{' '}
                  {[driver.vehicle_type, driver.vehicle_model]
                    .filter(Boolean)
                    .join(' - ')}
                </p>
              ) : null}

              {driver.vehicle_color ? (
                <p>Color: {driver.vehicle_color}</p>
              ) : null}

              {driver.plate_number ? (
                <p>Plate: {driver.plate_number}</p>
              ) : null}

              {driver.rating_average !== null &&
              driver.rating_average !== undefined ? (
                <p>
                  Driver rating: {Number(driver.rating_average).toFixed(1)}/5
                </p>
              ) : null}
            </>
          ) : isActive && ride.status !== 'requested' ? (
            <p>Driver information is loading...</p>
          ) : null}

          {ride.rating ? (
            <p>
              Your rating: {ride.rating}/5
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
        <h2>My Rides</h2>
        <p>Your current and previous Bislig Ride trips.</p>
      </div>

      {isLoading ? (
        <div className="Rider-profile-empty">
          Loading your rides...
        </div>
      ) : rides.length === 0 ? (
        <div className="Rider-profile-empty">
          <strong>No rides yet.</strong>
          <p>Your completed and active rides will appear here automatically.</p>
        </div>
      ) : (
        <div className="Rider-profile-history">
          {activeRide ? (
            <>
              <h3>Active Ride</h3>
              {renderRide(activeRide, true)}
            </>
          ) : null}

          {historyRides.length > 0 ? (
            <>
              <h3>Ride History</h3>
              {historyRides.map((ride) => renderRide(ride))}
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}
