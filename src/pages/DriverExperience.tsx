import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { demoDriver } from '../lib/demoDriver'
import { updateDriverLocation } from '../lib/driverLocations'
import { acceptRide, fetchAssignedRidesForDriver, fetchPendingRides, updateRideStatus } from '../lib/rides'
import type { Ride } from '../types/ride'

const TEST_DRIVER_ID = '6b239660-14ae-4fea-82c0-905420260077'

type DriverPhase = 'offline' | 'online' | 'incoming_request' | 'heading_to_pickup' | 'arrived' | 'in_progress' | 'completed'

const recentRides = [
  {
    id: 101,
    passenger: 'Ana Ramos',
    pickup: 'Barangay Tabon',
    destination: 'Bislig City Public Market',
    date: 'Today • 8:20 AM',
    status: 'completed',
    fare: '₱115',
  },
  {
    id: 102,
    passenger: 'Chris Lim',
    pickup: 'Mangagoy',
    destination: 'Alabel Road',
    date: 'Today • 7:05 AM',
    status: 'completed',
    fare: '₱140',
  },
  {
    id: 103,
    passenger: 'Nina Flores',
    pickup: 'Barangay San Roque',
    destination: 'Bislig City Plaza',
    date: 'Yesterday • 9:10 PM',
    status: 'completed',
    fare: '₱130',
  },
]

export function DriverExperience() {
  const [driverOnline, setDriverOnline] = useState(false)
  const [phase, setPhase] = useState<DriverPhase>('offline')
  const [request, setRequest] = useState<Ride | null>(null)
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (!driverOnline || !navigator.geolocation) {
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        void updateDriverLocation(TEST_DRIVER_ID, position.coords.latitude, position.coords.longitude).catch((error) => {
          console.error('Unable to update driver location:', error)
        })
      },
      (error) => {
        console.error('Unable to get driver location:', error)
      },
      { enableHighAccuracy: true },
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [driverOnline])

  useEffect(() => {
    const refreshRides = async () => {
      try {
        const [pendingRides, assignedRides] = await Promise.all([
          fetchPendingRides(),
          fetchAssignedRidesForDriver(TEST_DRIVER_ID),
        ])

        if (!driverOnline) {
          setRequest(pendingRides[0] ?? null)
          setActiveRide(null)
          setPhase('offline')
          return
        }

        const activeAssignedRide = assignedRides[0] ?? null
        if (activeAssignedRide) {
          setActiveRide(activeAssignedRide)
          setRequest(null)

          if (activeAssignedRide.status === 'accepted') {
            setPhase('heading_to_pickup')
          } else if (activeAssignedRide.status === 'arrived') {
            setPhase('arrived')
          } else if (activeAssignedRide.status === 'in_progress') {
            setPhase('in_progress')
          } else if (activeAssignedRide.status === 'completed') {
            setPhase('completed')
          }
          return
        }

        const nextRequest = pendingRides[0] ?? null
        setRequest(nextRequest)
        setPhase(nextRequest ? 'incoming_request' : 'online')
      } catch (error) {
        console.error('Unable to load pending rides:', error)
      }
    }

    void refreshRides()
    const timer = window.setInterval(() => {
      void refreshRides()
    }, 5000)

    return () => window.clearInterval(timer)
  }, [driverOnline])

  const todayEarnings = useMemo(
    () => recentRides.reduce((sum, ride) => sum + Number(ride.fare.replace(/[^\d.]/g, '')), 0),
    [],
  )

  const handleToggleOnline = () => {
    if (transitioning) {
      return
    }

    const nextOnline = !driverOnline
    setTransitioning(true)
    setDriverOnline(nextOnline)

    if (nextOnline) {
      setRequest(null)
      setActiveRide(null)
      setPhase('online')
    } else {
      setRequest(null)
      setActiveRide(null)
      setPhase('offline')
    }

    window.setTimeout(() => setTransitioning(false), 200)
  }

  const handleDecline = () => {
    if (!request || transitioning) {
      return
    }

    setTransitioning(true)
    setRequest(null)
    setPhase('online')
    window.setTimeout(() => setTransitioning(false), 200)
  }

  const handleAcceptRide = async () => {
    if (!request || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const acceptedRide = await acceptRide(request.id, TEST_DRIVER_ID)
      setActiveRide(acceptedRide)
      setRequest(null)
      setPhase('heading_to_pickup')
    } catch (error) {
      console.error('Unable to accept ride:', error)
      setPhase('online')
      setRequest(request)
    } finally {
      window.setTimeout(() => setTransitioning(false), 200)
    }
  }

  const handleArrived = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'arrived', TEST_DRIVER_ID)
      setActiveRide(updatedRide)
      setPhase('arrived')
    } catch (error) {
      console.error('Unable to update ride to arrived:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleStartRide = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'in_progress', TEST_DRIVER_ID)
      setActiveRide(updatedRide)
      setPhase('in_progress')
    } catch (error) {
      console.error('Unable to update ride to in_progress:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleCompleteRide = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'completed', TEST_DRIVER_ID)
      setActiveRide(updatedRide)
      setPhase('completed')
    } catch (error) {
      console.error('Unable to update ride to completed:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleBackToDashboard = () => {
    setRequest(null)
    setActiveRide(null)
    setPhase(driverOnline ? 'online' : 'offline')
  }

  const renderSummary = () => (
    <section className="driver-card summary-card">
      <div className="request-header-row">
        <div className="driver-profile-row">
          <img src={demoDriver.profilePhoto} alt={demoDriver.name} className="driver-photo" />
          <div>
            <p className="section-label">Driver Profile</p>
            <h3>{demoDriver.name}</h3>
            <p className="driver-rating">★★★★★ {demoDriver.rating}</p>
          </div>
        </div>

        <div className="status-toggle-wrapper">
          <span className={driverOnline ? 'status-indicator online' : 'status-indicator offline'} aria-hidden="true" />
          <button
            type="button"
            className={driverOnline ? 'status-toggle online' : 'status-toggle offline'}
            onClick={handleToggleOnline}
            disabled={transitioning}
          >
            {driverOnline ? 'ONLINE' : 'OFFLINE'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-box">
          <span>Vehicle</span>
          <strong>{demoDriver.vehicleType}</strong>
        </div>
        <div className="stat-box">
          <span>Model</span>
          <strong>{demoDriver.vehicleModel}</strong>
        </div>
        <div className="stat-box">
          <span>Plate</span>
          <strong>{demoDriver.plateNumber}</strong>
        </div>
        <div className="stat-box">
          <span>Today</span>
          <strong>{recentRides.length} rides</strong>
        </div>
        <div className="stat-box accent-stat">
          <span>Today’s earnings</span>
          <strong>₱{todayEarnings.toFixed(0)}</strong>
        </div>
      </div>
    </section>
  )

  const renderOfflineState = () => (
    <section className="driver-card empty-state">
      <h3>You're Offline</h3>
      <p>You will not receive new ride requests while offline.</p>
      <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning}>
        Go Online
      </button>
    </section>
  )

  const renderOnlineState = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Status</p>
          <h3>You're Online</h3>
        </div>
        <span className="mini-tag">Waiting</span>
      </div>

      <div className="waiting-box">
        <div className="search-loader" aria-label="Waiting for ride requests" />
        <div>
          <p className="lead-paragraph">Waiting for ride requests...</p>
          <p className="soft-copy">Your vehicle is ready and available.</p>
        </div>
      </div>

      <div className="driver-meta-grid">
        <div>
          <span>Vehicle</span>
          <strong>{demoDriver.vehicleModel}</strong>
        </div>
        <div>
          <span>Plate</span>
          <strong>{demoDriver.plateNumber}</strong>
        </div>
      </div>
    </section>
  )

  const renderIncomingRequest = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">New Ride Request</p>
          <h3>{request?.customer_name}</h3>
        </div>
        <span className="mini-tag urgent">Live</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{request?.customer_name}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{request?.customer_phone}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{request?.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{request?.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{request?.passenger_count}</dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{request ? new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</dd>
        </div>
      </div>

      <div className="action-row">
        <button type="button" className="primary-action" onClick={handleAcceptRide} disabled={transitioning}>
          Accept Ride
        </button>
        <button type="button" className="secondary-action" onClick={handleDecline} disabled={transitioning}>
          Decline
        </button>
      </div>
    </section>
  )

  const renderHeadingToPickup = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Ride Status</p>
          <h3>Heading to Passenger</h3>
        </div>
        <span className="mini-tag">Driver en route</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{activeRide?.customer_name}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{activeRide?.customer_phone}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{activeRide?.passenger_count}</dd>
        </div>
      </div>

      <div className="driver-map-panel">
        <MapView />
      </div>

      <button type="button" className="primary-action" onClick={handleArrived} disabled={transitioning}>
        Arrived at Pickup
      </button>
    </section>
  )

  const renderArrivedState = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Ride Status</p>
          <h3>You're at the pickup location</h3>
        </div>
        <span className="mini-tag warning">Arrived</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{activeRide?.customer_name}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{activeRide?.passenger_count}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleStartRide} disabled={transitioning}>
        Start Ride
      </button>
    </section>
  )

  const renderInProgressState = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Ride Status</p>
          <h3>Ride in Progress</h3>
        </div>
        <span className="mini-tag success">Live</span>
      </div>

      <div className="progress-steps">
        <span className="progress-step complete">Driver accepted</span>
        <span className="progress-arrow">↓</span>
        <span className="progress-step complete">Arrived</span>
        <span className="progress-arrow">↓</span>
        <span className="progress-step active">Ride in progress</span>
        <span className="progress-arrow">↓</span>
        <span className="progress-step">Destination</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{activeRide?.customer_name}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination_address}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{demoDriver.vehicleModel}</dd>
        </div>
      </div>

      <div className="driver-map-panel">
        <MapView />
      </div>

      <button type="button" className="primary-action accent" onClick={handleCompleteRide} disabled={transitioning}>
        Complete Ride
      </button>
    </section>
  )

  const renderCompletedState = () => (
    <section className="driver-card request-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Ride Status</p>
          <h3>Ride Completed</h3>
        </div>
        <span className="mini-tag success">Completed</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{activeRide?.customer_name}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{activeRide?.passenger_count}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>Cash or GCash</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToDashboard}>
        Back to Dashboard
      </button>
    </section>
  )

  const renderRecentRides = () => (
    <section className="driver-card history-card">
      <div className="request-header-row compact-row">
        <div>
          <p className="section-label">Recent Rides</p>
          <h3>Today’s trips</h3>
        </div>
      </div>

      <ul className="history-list">
        {recentRides.map((ride) => (
          <li key={ride.id}>
            <div>
              <strong>{ride.passenger}</strong>
              <span>
                {ride.pickup} → {ride.destination}
              </span>
              <small>{ride.date}</small>
            </div>
            <span className="completed-badge">{ride.status}</span>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <div className="driver-shell">
      <header className="driver-header">
        <div>
          <p className="driver-kicker">Bislig Ride</p>
          <h2>Driver Dashboard</h2>
        </div>
      </header>

      {renderSummary()}

      {phase === 'offline' ? renderOfflineState() : null}
      {phase === 'online' ? renderOnlineState() : null}
      {phase === 'incoming_request' ? renderIncomingRequest() : null}
      {phase === 'heading_to_pickup' ? renderHeadingToPickup() : null}
      {phase === 'arrived' ? renderArrivedState() : null}
      {phase === 'in_progress' ? renderInProgressState() : null}
      {phase === 'completed' ? renderCompletedState() : null}

      {!driverOnline || phase === 'offline' ? renderRecentRides() : null}
    </div>
  )
}
