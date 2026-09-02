import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { demoDriver, type DemoPassengerType } from '../lib/demoDriver'

type DriverPhase = 'offline' | 'online' | 'incoming_request' | 'heading_to_pickup' | 'arrived' | 'in_progress' | 'completed'

type DemoRideRequest = {
  id: number
  passengerName: string
  passengerPhone: string
  pickup: string
  destination: string
  passengerType: DemoPassengerType
  createdAt: string
  demoFare: string
}

const rideRequests: DemoRideRequest[] = [
  {
    id: 1,
    passengerName: 'Maria Santos',
    passengerPhone: '09171234567',
    pickup: 'Bislig City Public Market',
    destination: 'Mangagoy Terminal',
    passengerType: 'Regular',
    createdAt: '9:14 AM',
    demoFare: '₱120 • DEMO',
  },
  {
    id: 2,
    passengerName: 'Renzo Dela Cruz',
    passengerPhone: '09981234567',
    pickup: 'St. Joseph Street',
    destination: 'Barangay San Vicente',
    passengerType: 'Student',
    createdAt: '9:26 AM',
    demoFare: '₱95 • DEMO',
  },
  {
    id: 3,
    passengerName: 'Lola Valdez',
    passengerPhone: '09234567890',
    pickup: 'Bislig City Gym',
    destination: 'Barangay Mahanub',
    passengerType: 'Senior Citizen',
    createdAt: '9:42 AM',
    demoFare: '₱110 • DEMO',
  },
]

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

const generateRequest = (): DemoRideRequest => {
  const queue = [...rideRequests]
  const next = queue[Math.floor(Math.random() * queue.length)]

  return {
    ...next,
    id: Date.now(),
  }
}

export function DriverExperience() {
  const [driverOnline, setDriverOnline] = useState(false)
  const [phase, setPhase] = useState<DriverPhase>('offline')
  const [request, setRequest] = useState<DemoRideRequest | null>(null)
  const [activeRide, setActiveRide] = useState<DemoRideRequest | null>(null)
  const [transitioning, setTransitioning] = useState(false)

  useEffect(() => {
    if (!driverOnline || phase === 'incoming_request' || phase === 'heading_to_pickup' || phase === 'arrived' || phase === 'in_progress' || phase === 'completed') {
      return
    }

    const timer = window.setTimeout(() => {
      setRequest(generateRequest())
      setPhase('incoming_request')
    }, 2200)

    return () => window.clearTimeout(timer)
  }, [driverOnline, phase])

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

    window.setTimeout(() => {
      setRequest(generateRequest())
      setPhase('incoming_request')
      setTransitioning(false)
    }, 1200)
  }

  const handleAcceptRide = () => {
    if (!request || transitioning) {
      return
    }

    setTransitioning(true)
    setActiveRide(request)
    setRequest(null)
    setPhase('heading_to_pickup')
    window.setTimeout(() => setTransitioning(false), 200)
  }

  const handleArrived = () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)
    setPhase('arrived')
    window.setTimeout(() => setTransitioning(false), 200)
  }

  const handleStartRide = () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)
    setPhase('in_progress')
    window.setTimeout(() => setTransitioning(false), 200)
  }

  const handleCompleteRide = () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)
    setPhase('completed')
    window.setTimeout(() => setTransitioning(false), 200)
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
          <h3>{request?.passengerName}</h3>
        </div>
        <span className="mini-tag urgent">Live</span>
      </div>

      <div className="ride-meta">
        <div>
          <dt>Passenger</dt>
          <dd>{request?.passengerName}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{request?.passengerPhone}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{request?.pickup}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{request?.destination}</dd>
        </div>
        <div>
          <dt>Passenger Type</dt>
          <dd>{request?.passengerType}</dd>
        </div>
        <div>
          <dt>Demo fare</dt>
          <dd>{request?.demoFare}</dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{request?.createdAt}</dd>
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
          <dd>{activeRide?.passengerName}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{activeRide?.passengerPhone}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination}</dd>
        </div>
        <div>
          <dt>Passenger Type</dt>
          <dd>{activeRide?.passengerType}</dd>
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
          <dd>{activeRide?.passengerName}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination}</dd>
        </div>
        <div>
          <dt>Passenger Type</dt>
          <dd>{activeRide?.passengerType}</dd>
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
          <dd>{activeRide?.passengerName}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination}</dd>
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
          <dd>{activeRide?.passengerName}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{activeRide?.pickup}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{activeRide?.destination}</dd>
        </div>
        <div>
          <dt>Demo fare</dt>
          <dd>{activeRide?.demoFare}</dd>
        </div>
        <div>
          <dt>Payment</dt>
          <dd>Cash or GCash</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>18 minutes • DEMO</dd>
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
