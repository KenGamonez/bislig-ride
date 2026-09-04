import { useEffect, useMemo, useState } from 'react'
import { MapView } from '../components/MapView'
import { RideChat } from '../components/RideChat'
import { supabase } from '../lib/supabase'
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
    date: 'Today Ã¢â‚¬Â¢ 8:20 AM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±115',
  },
  {
    id: 102,
    passenger: 'Chris Lim',
    pickup: 'Mangagoy',
    destination: 'Alabel Road',
    date: 'Today Ã¢â‚¬Â¢ 7:05 AM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±140',
  },
  {
    id: 103,
    passenger: 'Nina Flores',
    pickup: 'Barangay San Roque',
    destination: 'Bislig City Plaza',
    date: 'Yesterday Ã¢â‚¬Â¢ 9:10 PM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±130',
  },
]

export function DriverExperience() {
  const [driverOnline, setDriverOnline] = useState(false)
  const [phase, setPhase] = useState<DriverPhase>('offline')
  const [request, setRequest] = useState<Ride | null>(null)
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [driverId, setDriverId] = useState(TEST_DRIVER_ID)
  const [driverAuthId, setDriverAuthId] = useState<string | null>(null)
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  useEffect(() => {
    let mounted = true

    const loadDriverIdentity = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data.session?.user) {
        console.error('Unable to load driver session:', error)
        return
      }

      const authUserId = data.session.user.id

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, auth_user_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (driverError || !driver) {
        console.error('Unable to find driver profile for authenticated user:', driverError)
        return
      }

      if (mounted) {
        setDriverId(driver.id)
        setDriverAuthId(authUserId)
      }
    }

    void loadDriverIdentity()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setDriverAuthId(null)
        setDriverId(TEST_DRIVER_ID)
        return
      }

      void loadDriverIdentity()
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!driverOnline || !navigator.geolocation) {
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setDriverLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        void updateDriverLocation(driverId, position.coords.latitude, position.coords.longitude).catch((error) => {
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
  }, [driverOnline, driverId])

  useEffect(() => {
    const refreshRides = async () => {
      try {
        const [pendingRides, assignedRides] = await Promise.all([
          fetchPendingRides(),
          fetchAssignedRidesForDriver(driverId),
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
  }, [driverOnline, driverId])

  useEffect(() => {
    if (!activeRide?.id || !driverAuthId) {
      return
    }

    const channel = supabase
      .channel(`driver-ride-chat-${activeRide.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_id=eq.${activeRide.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id?: string
            ride_id?: string
            sender_role?: string
          }

          if (
            incoming.ride_id === activeRide.id &&
            incoming.sender_role === 'Rider'
          ) {
            setShowChat(true)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeRide?.id, driverAuthId])
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
      const acceptedRide = await acceptRide(request.id, driverId)
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
      const updatedRide = await updateRideStatus(activeRide.id, 'arrived', driverId)
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
      const updatedRide = await updateRideStatus(activeRide.id, 'in_progress', driverId)
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
      const updatedRide = await updateRideStatus(activeRide.id, 'completed', driverId)
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
    <section className="driver-card driver-overview">
      <div className="driver-identity">
        <img src={demoDriver.profilePhoto} alt={demoDriver.name} className="driver-photo" />
        <div className="driver-identity-copy">
          <p className="section-label">DRIVER ACCOUNT</p>
          <h3>{demoDriver.name}</h3>
          <p className="driver-rating">★★★★★ {demoDriver.rating}</p>
          <p className="driver-vehicle">{demoDriver.vehicleType} · {demoDriver.vehicleModel} · {demoDriver.plateNumber}</p>
        </div>
      </div>

      <div className={driverOnline ? "driver-status-panel is-online" : "driver-status-panel is-offline"}>
        <div>
          <span className="status-indicator" aria-hidden="true" />
          <div>
            <strong>{driverOnline ? "You're Online" : "You're Offline"}</strong>
            <span>{driverOnline ? "Ready to receive ride requests" : "You won't receive new requests"}</span>
          </div>
        </div>
        <button
          type="button"
          className="status-toggle"
          onClick={handleToggleOnline}
          disabled={transitioning}
          aria-label={driverOnline ? "Go offline" : "Go online"}
        >
          {driverOnline ? "GO OFFLINE" : "GO ONLINE"}
        </button>
      </div>

      <div className="driver-metrics">
        <div className="metric-card metric-earnings">
          <span>Today's earnings</span>
          <strong>₱{todayEarnings.toFixed(0)}</strong>
          <small>100% of your fares</small>
        </div>
        <div className="metric-card">
          <span>Completed rides</span>
          <strong>{recentRides.length}</strong>
          <small>Today's trips</small>
        </div>
      </div>
    </section>
  )

  const renderOfflineState = () => (
    <section className="driver-card work-state offline-state">
      <div className="state-heading">
        <div>
          <p className="section-label">AVAILABILITY</p>
          <h3>You're currently offline</h3>
          <p>You are not receiving new ride requests.</p>
        </div>
        <span className="state-badge offline-badge">OFFLINE</span>
      </div>

      <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning}>
        Go Online
      </button>
    </section>
  )

  const renderOnlineState = () => (
    <section className="driver-card work-state waiting-state">
      <div className="state-heading">
        <div>
          <p className="section-label">RIDE QUEUE</p>
          <h3>Waiting for your next ride</h3>
          <p>Your vehicle is available and ready.</p>
        </div>
        <span className="state-badge online-badge">ONLINE</span>
      </div>

      <div className="waiting-box">
        <div className="search-loader" aria-hidden="true" />
        <div>
          <strong>Looking for nearby requests</strong>
          <span>Keep the dashboard open while you're available.</span>
        </div>
      </div>

      <div className="availability-details">
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
    <section className="driver-card work-state incoming-state">
      <div className="state-heading">
        <div>
          <p className="section-label">NEW RIDE REQUEST</p>
          <h3>{request?.customer_name}</h3>
          <p>Review the trip details before accepting.</p>
        </div>
        <span className="state-badge request-badge">NEW</span>
      </div>

      <div className="fare-highlight">
        <span>Ride request</span>
        <strong>Review & accept</strong>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div>
            <small>PICKUP</small>
            <strong>{request?.pickup_address}</strong>
          </div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div>
            <small>DESTINATION</small>
            <strong>{request?.destination_address}</strong>
          </div>
        </div>
      </div>

      <div className="ride-info-grid">
        <div><span>Passenger</span><strong>{request?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{request?.passenger_count}</strong></div>
        <div><span>Phone</span><strong>{request?.customer_phone}</strong></div>
        <div><span>Requested</span><strong>{request ? new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</strong></div>
      </div>

      <div className="action-row request-actions">
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
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
          <h3>Heading to passenger</h3>
          <p>{activeRide?.customer_name} · {activeRide?.passenger_count} passenger(s)</p>
        </div>
        <span className="state-badge progress-badge">EN ROUTE</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      <div className="driver-map-panel"><MapView driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={activeRide?.pickup_lat} pickupLongitude={activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <a href={"tel:" + (activeRide?.customer_phone?.replace(/[^\d+]/g, ""))} className="secondary-action">Call Passenger</a>
        <button type="button" className="secondary-action" onClick={() => setShowChat(true)}>Chat</button>
      </div>

      <button type="button" className="primary-action" onClick={handleArrived} disabled={transitioning}>
        Arrived at Pickup
      </button>
    </section>
  )

  const renderArrivedState = () => (
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
          <h3>Passenger pickup</h3>
          <p>You've arrived at the pickup location.</p>
        </div>
        <span className="state-badge arrived-badge">ARRIVED</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      <div className="ride-info-grid">
        <div><span>Passenger</span><strong>{activeRide?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
      </div>

      <div className="driver-contact-actions">
        <a href={"tel:" + (activeRide?.customer_phone?.replace(/[^\d+]/g, ""))} className="secondary-action">Call Passenger</a>
        <button type="button" className="secondary-action" onClick={() => setShowChat(true)}>Chat</button>
      </div>

      <button type="button" className="primary-action" onClick={handleStartRide} disabled={transitioning}>
        Start Ride
      </button>
    </section>
  )

  const renderInProgressState = () => (
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
          <h3>Ride in progress</h3>
          <p>{activeRide?.customer_name} is on board.</p>
        </div>
        <span className="state-badge live-badge">IN PROGRESS</span>
      </div>

      <div className="ride-progress">
        <span className="progress-complete">ACCEPTED</span>
        <span className="progress-arrow">→</span>
        <span className="progress-complete">ARRIVED</span>
        <span className="progress-arrow">→</span>
        <span className="progress-active">IN PROGRESS</span>
        <span className="progress-arrow">→</span>
        <span>DESTINATION</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      <div className="driver-map-panel"><MapView driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={activeRide?.pickup_lat} pickupLongitude={activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <a href={"tel:" + (activeRide?.customer_phone?.replace(/[^\d+]/g, ""))} className="secondary-action">Call Passenger</a>
        <button type="button" className="secondary-action" onClick={() => setShowChat(true)}>Chat</button>
      </div>

      <button type="button" className="primary-action" onClick={handleCompleteRide} disabled={transitioning}>
        Complete Ride
      </button>
    </section>
  )

  const renderCompletedState = () => (
    <section className="driver-card work-state completed-state">
      <div className="state-heading">
        <div>
          <p className="section-label">RIDE COMPLETE</p>
          <h3>Trip completed</h3>
          <p>Great job. Your ride has been completed.</p>
        </div>
        <span className="state-badge completed-badge">COMPLETED</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      <div className="ride-info-grid">
        <div><span>Passenger</span><strong>{activeRide?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Payment</span><strong>Cash or GCash</strong></div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToDashboard}>
        Back to Dashboard
      </button>
    </section>
  )

  const renderRecentRides = () => (
    <section className="driver-card history-card">
      <div className="section-heading">
        <div>
          <p className="section-label">RIDE HISTORY</p>
          <h3>Recent trips</h3>
        </div>
        <span className="history-count">{recentRides.length} today</span>
      </div>

      <ul className="history-list">
        {recentRides.map((ride) => (
          <li key={ride.id} className="history-item">
            <div className="history-main">
              <div className="history-passenger">
                <strong>{ride.passenger}</strong>
                <span>{ride.date}</span>
              </div>
              <span className="completed-badge">{ride.status}</span>
            </div>
            <div className="history-route">
              <span>{ride.pickup}</span>
              <strong>→</strong>
              <span>{ride.destination}</span>
            </div>
            <div className="history-footer">
              <span>Completed trip</span>
              <strong>{ride.fare}</strong>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <div className="driver-shell">
      {showChat && activeRide?.id && (
        <RideChat
          rideId={activeRide.id}
          otherPartyName={activeRide.customer_name}
          currentRole="driver"
          currentDriverId={driverId}
          driverAuthId={driverAuthId}
          onClose={() => setShowChat(false)}
        />
      )}

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









