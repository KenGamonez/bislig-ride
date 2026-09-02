import { useMemo, useState } from 'react'
import type { Ride, RideStatus } from '../types/ride'

const demoRide: Ride = {
  id: 1,
  customer_name: 'Juan Dela Cruz',
  customer_phone: '09123456789',
  pickup_address: 'Bislig City National Highway',
  pickup_lat: null,
  pickup_lng: null,
  destination_address: 'Mangagoy',
  destination_lat: null,
  destination_lng: null,
  driver_id: null,
  status: 'requested',
  created_at: new Date().toISOString(),
}

const statusLabels: Record<RideStatus, string> = {
  requested: 'Requested',
  accepted: 'Ride accepted',
  arrived: 'Arrived',
  in_progress: 'Ride in progress',
  completed: 'Ride completed',
}

export function DriverExperience() {
  const [driverOnline, setDriverOnline] = useState(true)
  const [newRequest, setNewRequest] = useState<Ride | null>(demoRide)
  const [currentRide, setCurrentRide] = useState<Ride | null>(null)
  const [completedRides, setCompletedRides] = useState<Ride[]>([])
  const [showDetails, setShowDetails] = useState(false)

  const currentRideStatus = useMemo(
    () => (currentRide ? statusLabels[currentRide.status] : 'No active ride'),
    [currentRide],
  )

  const handleAcceptRide = () => {
    if (!newRequest) {
      return
    }

    setCurrentRide({
      ...newRequest,
      driver_id: 'driver-demo-1',
      status: 'accepted',
    })
    setNewRequest(null)
    setShowDetails(false)
  }

  const handleStatusChange = (nextStatus: Extract<RideStatus, 'arrived' | 'in_progress'>) => {
    if (!currentRide) {
      return
    }

    setCurrentRide({ ...currentRide, status: nextStatus })
  }

  const handleCompleteRide = () => {
    if (!currentRide) {
      return
    }

    const completedRide: Ride = {
      ...currentRide,
      status: 'completed',
    }

    setCompletedRides((items) => [completedRide, ...items])
    setCurrentRide(null)
  }

  const hasActiveRide = Boolean(currentRide)

  return (
    <div className="driver-shell">
      <header className="driver-header">
        <div>
          <p className="driver-kicker">Bislig Ride</p>
          <h2>Driver Dashboard</h2>
        </div>

        <div className="status-toggle-wrapper">
          <span
            className={driverOnline ? 'status-indicator online' : 'status-indicator offline'}
            aria-hidden="true"
          />
          <button
            type="button"
            className={driverOnline ? 'status-toggle online' : 'status-toggle offline'}
            onClick={() => setDriverOnline((current) => !current)}
          >
            {driverOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </header>

      {!driverOnline ? (
        <section className="driver-card empty-state">
          <h3>You're offline</h3>
          <p>Go online to receive ride requests.</p>
        </section>
      ) : null}

      {driverOnline && !hasActiveRide && newRequest ? (
        <section className="driver-card request-card">
          <div className="request-header-row">
            <div>
              <p className="section-label">New Ride Request</p>
              <h3>Customer: {newRequest.customer_name}</h3>
            </div>
            <span className="mini-tag">{statusLabels[newRequest.status]}</span>
          </div>

          <dl className="ride-meta">
            <div>
              <dt>Pickup</dt>
              <dd>{newRequest.pickup_address}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{newRequest.destination_address}</dd>
            </div>
            <div>
              <dt>Distance</dt>
              <dd>2.4 km</dd>
            </div>
            <div>
              <dt>Estimated fare</dt>
              <dd>₱120</dd>
            </div>
          </dl>

          <div className="action-row">
            <button type="button" className="primary-action" onClick={handleAcceptRide}>
              Accept Ride
            </button>
            <button type="button" className="secondary-action" onClick={() => setShowDetails((value) => !value)}>
              {showDetails ? 'Hide details' : 'View Details'}
            </button>
          </div>

          {showDetails ? (
            <div className="details-panel">
              <p>
                <strong>Customer:</strong> {newRequest.customer_name}
              </p>
              <p>
                <strong>Phone:</strong> {newRequest.customer_phone}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {currentRide ? (
        <section className="driver-card active-card">
          <div className="request-header-row">
            <div>
              <p className="section-label">Active Ride</p>
              <h3>Customer: {currentRide.customer_name}</h3>
            </div>
            <span className="mini-tag">{statusLabels[currentRide.status]}</span>
          </div>

          <dl className="ride-meta">
            <div>
              <dt>Pickup</dt>
              <dd>{currentRide.pickup_address}</dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd>{currentRide.destination_address}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{currentRideStatus}</dd>
            </div>
          </dl>

          <div className="action-stack">
            {currentRide.status === 'accepted' ? (
              <button type="button" className="primary-action" onClick={() => handleStatusChange('arrived')}>
                Arrived at pickup
              </button>
            ) : null}

            {currentRide.status === 'arrived' ? (
              <button type="button" className="primary-action" onClick={() => handleStatusChange('in_progress')}>
                Start Ride
              </button>
            ) : null}

            {currentRide.status === 'in_progress' ? (
              <button type="button" className="primary-action accent" onClick={handleCompleteRide}>
                Complete Ride
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {completedRides.length > 0 ? (
        <section className="driver-card history-card">
          <div className="request-header-row">
            <div>
              <p className="section-label">Completed Rides</p>
              <h3>Recent trips</h3>
            </div>
          </div>

          <ul className="history-list">
            {completedRides.map((ride) => (
              <li key={ride.id}>
                <div>
                  <strong>{ride.customer_name}</strong>
                  <span>
                    {ride.pickup_address} → {ride.destination_address}
                  </span>
                </div>
                <span className="completed-badge">Completed</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
