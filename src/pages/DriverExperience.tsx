import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { CancelRideModal } from '../components/CancelRideModal'
import { MapView } from '../components/MapView'
import { RideChat } from '../components/RideChat'
import { supabase } from '../lib/supabase'
import { demoDriver } from '../lib/demoDriver'
import { formatCentavos, MULTIPLE_DESTINATIONS_FARE_NOTE } from '../lib/fare'
import { updateDriverLocation } from '../lib/driverLocations'
import { fetchLatestRideCancellation, subscribeToRideCancellations } from '../lib/rideCancellations'
import { fetchDriverReputation, fetchReputationFor, formatCancellationRate, type ReputationSummary } from '../lib/reputation'
import {
  acceptRide,
  cancelRide,
  fetchAssignedRidesForDriver,
  fetchPendingRides,
  fetchRideById,
  hasRatedRide,
  submitPassengerRating,
  updateRideStatus,
} from '../lib/rides'
import type { Ride, RideCancellation } from '../types/ride'

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

const renderStarRating = (average: number) => (
  <span className="rating-stars-inline" aria-hidden="true">
    {[1, 2, 3, 4, 5].map((value) => (
      <svg
        key={value}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={value <= Math.round(average) ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    ))}
  </span>
)

const fareDisplayFor = (ride: Ride | null): string => {
  if (!ride) {
    return '—'
  }

  if (ride.destination_mode === 'multiple') {
    return MULTIPLE_DESTINATIONS_FARE_NOTE
  }

  if (typeof ride.fare_cents === 'number' && Number.isFinite(ride.fare_cents)) {
    return `₱${formatCentavos(ride.fare_cents)}`
  }

  return 'Fare handled traditionally with the driver.'
}

const renderRideStops = (ride: Ride | null) => {
  if (
    !ride ||
    ride.destination_mode !== 'multiple' ||
    !Array.isArray(ride.destination_stops) ||
    ride.destination_stops.length === 0
  ) {
    return null
  }

  return (
    <div className="ride-stops">
      <p className="section-label">DROP-OFFS</p>
      <ol className="ride-stops-list">
        {ride.destination_stops.map((stop, index) => (
          <li key={index}>{stop}</li>
        ))}
      </ol>
    </div>
  )
}

export function DriverExperience({
  onBack,
  view,
  onViewChange,
}: {
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}) {
  const [driverOnline, setDriverOnline] = useState(false)
  const [phase, setPhase] = useState<DriverPhase>('offline')
  const [request, setRequest] = useState<Ride | null>(null)
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [driverId, setDriverId] = useState(TEST_DRIVER_ID)
  const [driverAuthId, setDriverAuthId] = useState<string | null>(null)
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancellationNotice, setCancellationNotice] = useState<RideCancellation | null>(null)
  const [passengerRating, setPassengerRating] = useState(0)
  const [passengerRatingComment, setPassengerRatingComment] = useState('')
  const [passengerRatingSubmitted, setPassengerRatingSubmitted] = useState(false)
  const [isSubmittingPassengerRating, setIsSubmittingPassengerRating] = useState(false)
  const [reputation, setReputation] = useState<ReputationSummary | null>(null)
  const [passengerReputation, setPassengerReputation] = useState<ReputationSummary | null>(null)
  const [passengerRatingError, setPassengerRatingError] = useState('')
  const lastActiveRideIdRef = useRef<string | null>(null)
  const completedRideIdRef = useRef<string | null>(null)
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
    let mounted = true

    const loadReputation = async () => {
      const summary = await fetchDriverReputation(driverId)

      if (mounted) {
        setReputation(summary)
      }
    }

    void loadReputation()

return () => {
      mounted = false
    }
  }, [driverId])

  useEffect(() => {
    const targetCustomerId = request?.customer_auth_id ?? activeRide?.customer_auth_id ?? null

    if (!targetCustomerId) {
      return
    }

    let mounted = true

    const loadPassengerReputation = async () => {
      const summary = await fetchReputationFor(targetCustomerId, false)

      if (mounted) {
        setPassengerReputation(summary)
      }
    }

    void loadPassengerReputation()

    return () => {
      mounted = false
    }
  }, [request?.customer_auth_id, activeRide?.customer_auth_id])

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
    let mounted = true

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
        const previousActiveRideId = lastActiveRideIdRef.current

        if (activeAssignedRide) {
          lastActiveRideIdRef.current = activeAssignedRide.id
          setActiveRide(activeAssignedRide)
          setRequest(null)

          if (activeAssignedRide.status === 'accepted') {
            setPhase('heading_to_pickup')
          } else if (activeAssignedRide.status === 'arrived') {
            setPhase('arrived')
          } else if (activeAssignedRide.status === 'in_progress') {
            setPhase('in_progress')
          }
          return
        }

        setActiveRide(null)
        setRequest(null)

        if (previousActiveRideId && !pendingRides.some((ride) => ride.id === previousActiveRideId)) {
          try {
            const previous = await fetchRideById(previousActiveRideId)

            if (mounted && previous) {
              if (previous.status === 'cancelled') {
                const latestCancellation = await fetchLatestRideCancellation(previous.id)

                if (mounted && latestCancellation) {
                  setCancellationNotice(latestCancellation)
                }
              } else if (previous.status === 'completed' && completedRideIdRef.current === previous.id) {
                lastActiveRideIdRef.current = previous.id
                setActiveRide(previous)
                setPhase('completed')
                return
              }
            }
          } catch (error) {
            console.error('Unable to check previously active ride:', error)
          }
        }

        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null

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

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
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

  useEffect(() => {
    if (!activeRide?.id) {
      return
    }

    const unsubscribe = subscribeToRideCancellations(activeRide.id, (incoming) => {
      if (incoming.cancelled_by_role !== 'customer') {
        return
      }

      completedRideIdRef.current = null
      lastActiveRideIdRef.current = null
      setCancellationNotice(incoming)
      setActiveRide(null)
      setRequest(null)
      setPhase(driverOnline ? 'online' : 'offline')
    })

    return unsubscribe
  }, [activeRide?.id, driverOnline])
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
    completedRideIdRef.current = null
    lastActiveRideIdRef.current = null
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
      completedRideIdRef.current = activeRide.id
      setActiveRide(updatedRide)
      setPhase('completed')
    } catch (error) {
      console.error('Unable to update ride to completed:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleBackToDashboard = () => {
    completedRideIdRef.current = null
    lastActiveRideIdRef.current = null
    setRequest(null)
    setActiveRide(null)
    setCancellationNotice(null)
    setPassengerRating(0)
    setPassengerRatingComment('')
    setPassengerRatingSubmitted(false)
    setPassengerRatingError('')
    setPhase(driverOnline ? 'online' : 'offline')
  }

  useEffect(() => {
    if (!activeRide?.id || activeRide.status !== 'completed') {
      return
    }

    let mounted = true

    const checkExistingRating = async () => {
      const alreadyRated = await hasRatedRide(activeRide.id, driverId)

      if (mounted) {
        setPassengerRatingSubmitted(alreadyRated)
      }
    }

    void checkExistingRating()

    return () => {
      mounted = false
    }
  }, [activeRide?.id, activeRide?.status, driverId])

  const handleConfirmCancellation = async (reason: string) => {
    if (!activeRide || cancelSubmitting) {
      return
    }

    setCancelError('')
    setCancelSubmitting(true)

    try {
      await cancelRide(activeRide.id, driverId, 'driver', reason)
      completedRideIdRef.current = null
      lastActiveRideIdRef.current = null
      setCancellationNotice(null)
      setShowCancelModal(false)
      setActiveRide(null)
      setRequest(null)
      setPhase(driverOnline ? 'online' : 'offline')
    } catch (error) {
      console.error('Unable to cancel ride:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to cancel this ride right now. Please try again.'

      setCancelError(message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  const handleSubmitPassengerRating = async () => {
    if (!activeRide || passengerRating < 1 || passengerRating > 5 || isSubmittingPassengerRating) {
      return
    }

    setIsSubmittingPassengerRating(true)
    setPassengerRatingError('')

    try {
      const alreadyRated = await hasRatedRide(activeRide.id, driverId)

      if (alreadyRated) {
        setPassengerRatingSubmitted(true)
        return
      }

      await submitPassengerRating(
        activeRide.id,
        driverId,
        passengerRating,
        passengerRatingComment,
      )

      setPassengerRatingSubmitted(true)
    } catch (error) {
      console.error('Unable to rate passenger:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to submit your rating. Please try again.'

      setPassengerRatingError(message)
    } finally {
      setIsSubmittingPassengerRating(false)
    }
  }

  const renderSummary = () => (
    <section className="driver-card driver-overview">
      <div className="driver-identity">
        <img src={demoDriver.profilePhoto} alt={demoDriver.name} className="driver-photo" />
        <div className="driver-identity-copy">
          <p className="section-label">DRIVER ACCOUNT</p>
          <h3>{demoDriver.name}</h3>
          <p className="driver-rating"><span className="rating-stars-inline">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
          </span> {demoDriver.rating}</p>
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
          <strong>{reputation ? reputation.completedRides : recentRides.length}</strong>
          <small>All-time trips</small>
        </div>
        <div className="metric-card">
          <span>Rating</span>
          <strong>{reputation ? reputation.averageStars.toFixed(1) : String(demoDriver.rating)}</strong>
          <small>{reputation ? `${reputation.totalRatings} rating${reputation.totalRatings === 1 ? '' : 's'}` : 'Passenger feedback'}</small>
        </div>
        <div className="metric-card">
          <span>Cancellations</span>
          <strong>{reputation ? `${reputation.cancelledRides} (${reputation.cancellationRate}%)` : '0'}</strong>
          <small>Of all completed rides</small>
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

  const renderPassengerReputationRow = () => {
    if (!passengerReputation) {
      return <strong>Loading reputation...</strong>
    }

    if (passengerReputation.totalRatings === 0) {
      return <strong>New passenger · no ratings yet</strong>
    }

    return (
      <strong>
        <span className="rating-stars-inline">
          {renderStarRating(passengerReputation.averageStars)}
        </span>
        {' '}
        {passengerReputation.averageStars.toFixed(1)}/5 (
        {passengerReputation.totalRatings} rating{passengerReputation.totalRatings === 1 ? '' : 's'})
        {' '}· {formatCancellationRate(passengerReputation.cancellationRate)} cancellation rate
      </strong>
    )
  }

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
        <span>{request?.destination_mode === 'multiple' ? 'FARE' : 'ESTIMATED FARE'}</span>
        <strong>{fareDisplayFor(request)}</strong>
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
        <div><span>Passenger type</span><strong>{request?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Phone</span><strong>{request?.customer_phone}</strong></div>
        <div><span>Requested</span><strong>{request ? new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</strong></div>
      </div>

      {renderRideStops(request)}

      <div className="passenger-reputation" aria-label="Passenger rating">
        <span>Passenger rating</span>
        {renderPassengerReputationRow()}
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

      {renderRideStops(activeRide)}

      <div className="ride-info-grid">
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="passenger-reputation" aria-label="Passenger rating">
        <span>Passenger rating</span>
        {renderPassengerReputationRow()}
      </div>

      <div className="driver-map-panel"><MapView driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={activeRide?.pickup_lat} pickupLongitude={activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
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
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
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

      {renderRideStops(activeRide)}

      <div className="ride-info-grid">
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-map-panel"><MapView driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={activeRide?.pickup_lat} pickupLongitude={activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
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
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
        <div><span>Payment</span><strong>Cash or GCash</strong></div>
      </div>

      {!passengerRatingSubmitted ? (
        <div className="driver-passenger-rating">
          <p className="section-label">RATE YOUR PASSENGER</p>
          <h3>How was your passenger?</h3>

          <div
            className="rating-stars"
            role="radiogroup"
            aria-label="Rate your passenger from 1 to 5 stars"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={star <= passengerRating ? 'rating-star selected' : 'rating-star'}
                onClick={() => setPassengerRating(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                aria-checked={star === passengerRating}
                role="radio"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill={star <= passengerRating ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="passenger-rating-comment">
            Comment <span>(optional)</span>
          </label>

          <textarea
            id="passenger-rating-comment"
            className="text-input"
            value={passengerRatingComment}
            onChange={(event) => setPassengerRatingComment(event.target.value)}
            placeholder="Tell us about your passenger..."
            rows={4}
            maxLength={500}
          />

          {passengerRatingError ? (
            <p className="form-error-message" role="alert">
              {passengerRatingError}
            </p>
          ) : null}

          <button
            type="button"
            className="primary-action"
            onClick={() => void handleSubmitPassengerRating()}
            disabled={passengerRating === 0 || isSubmittingPassengerRating}
          >
            {isSubmittingPassengerRating ? 'Submitting...' : 'Submit Passenger Rating'}
          </button>
        </div>
      ) : (
        <p className="driver-passenger-rated-note">
          You rated this passenger. Thanks for the feedback!
        </p>
      )}

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
    <>
      <AppHeader
        view={view}
        onViewChange={onViewChange}
        primaryLabel="My Rides"
        onPrimaryAction={() => onViewChange('Rider')}
      />

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

      <button type="button" className="secondary-action compact-button driver-back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        Back to Rider
      </button>

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

      {cancellationNotice ? (
        <section className="ride-cancelled-notice" role="alert">
          <div>
            <strong>Ride cancelled by the passenger</strong>
            <span>
              {activeRide
                ? `${activeRide.customer_name} cancelled this ride. `
                : 'Your passenger cancelled this ride. '}
              Reason: {cancellationNotice.reason}
            </span>
          </div>
          <button type="button" onClick={() => setCancellationNotice(null)}>
            Dismiss
          </button>
        </section>
      ) : null}

      {!driverOnline || phase === 'offline' ? renderRecentRides() : null}

      {showCancelModal && activeRide && (
        <CancelRideModal
          open={showCancelModal}
          role="driver"
          submitting={cancelSubmitting}
          error={cancelError}
          onClose={() => {
            setShowCancelModal(false)
            setCancelError('')
          }}
          onConfirm={(reason) => void handleConfirmCancellation(reason)}
        />
      )}
    </div>
    </>
  )
}









