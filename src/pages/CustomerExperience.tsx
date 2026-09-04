import { useEffect, useMemo, useRef, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'
import { CustomerProfile } from '../components/CustomerProfile'
import { RideChat } from '../components/RideChat'
import { LocationInput } from '../components/LocationInput'
import { MapView } from '../components/MapView'
import { WeatherWidget } from '../components/WeatherWidget'
import { passengerTypes, type DemoPassengerType } from '../lib/demoDriver'
import { fetchDriverById } from '../lib/drivers'
import type { DriverProfile } from '../types/driver'
import { subscribeToDriverLocation } from '../lib/driverLocations'
import { createRide, fetchRideById, submitRideRating } from '../lib/rides'
import { getCustomerAuthId, supabase } from '../lib/supabase'
import type { Ride } from '../types/ride'

type PassengerCountOption = '1 passenger' | '2 passengers' | '3 passengers' | '4 passengers' | '5+ passengers'

const passengerCountOptions: PassengerCountOption[] = ['1 passenger', '2 passengers', '3 passengers', '4 passengers', '5+ passengers']

type CustomerFormState = {
  pickup: string
  destination: string
  name: string
  phone: string
  passengerType: DemoPassengerType
  passengerCount: PassengerCountOption
}

type CustomerValidation = Partial<Record<keyof CustomerFormState, string>>

type RidePhase = 'request' | 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'rating' | 'payment' | 'payment_confirmed'

type PaymentMethod = 'Cash' | 'GCash'

const initialFormState: CustomerFormState = {
  pickup: '',
  destination: '',
  name: '',
  phone: '',
  passengerType: 'Regular',
  passengerCount: '1 passenger',
}

const rideStatusToLabel: Record<Exclude<RidePhase, 'request' | 'rating' | 'payment' | 'payment_confirmed'>, string> = {
  searching: 'SEARCHING',
  accepted: 'DRIVER ON THE WAY',
  arrived: 'ARRIVED',
  in_progress: 'RIDE IN PROGRESS',
  completed: 'RIDE COMPLETED',
}

const formatPassengerCount = (value: string | number | null | undefined) => {
  const parsed = Number.parseInt(String(value ?? '1'), 10)
  const safeValue = Number.isFinite(parsed) ? parsed : 1

  if (safeValue >= 5) {
    return '5+ passengers'
  }

  return `${safeValue} passenger${safeValue === 1 ? '' : 's'}`
}

const initialRide: Ride = {
  id: '',
  customer_name: '',
  customer_phone: '',
  pickup_address: '',
  pickup_lat: null,
  pickup_lng: null,
  destination_address: '',
  destination_lat: null,
  destination_lng: null,
  customer_auth_id: null,
  driver_id: null,
  passenger_count: 1,
  status: 'requested',
  created_at: new Date().toISOString(),
}

const rideIdStorageKey = 'bislig-ride-last-ride-id'

const discoveryCategories = [
  'Restaurants',
  'Hotels & Resorts',
  'Tourist Destinations',
  'Upcoming Events',
  'Local Businesses',
]

const mapRideStatusToPhase = (status: Ride['status']): RidePhase => {
  switch (status) {
    case 'requested':
      return 'searching'
    case 'accepted':
      return 'accepted'
    case 'arrived':
      return 'arrived'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    default:
      return 'request'
  }
}

export function CustomerExperience() {
  const [formData, setFormData] = useState<CustomerFormState>(initialFormState)
  const [validationErrors, setValidationErrors] = useState<CustomerValidation>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [customerAuthId, setCustomerAuthId] = useState<string | null>(null)
  const [assignedDriver, setAssignedDriver] = useState<DriverProfile | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [ride, setRide] = useState<Ride>(initialRide)
          const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pickupLocation, setPickupLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pickupLocationError, setPickupLocationError] = useState('')
  const [phase, setPhase] = useState<RidePhase>('request')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
  const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [isSubmittingRating, setIsSubmittingRating] = useState(false)
  const [isExploreOpen, setIsExploreOpen] = useState(false)
  const exploreMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void getCustomerAuthId()
      .then(setCustomerAuthId)
      .catch((error) => console.error('Unable to establish Rider session:', error))
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!exploreMenuRef.current?.contains(event.target as Node)) {
        setIsExploreOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExploreOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    const persistedRideId = window.localStorage.getItem(rideIdStorageKey)
    if (!persistedRideId) {
      return
    }

    const restoreRide = async () => {
      try {
        const latestRide = await fetchRideById(persistedRideId)
        if (!latestRide) {
          return
        }

        setRide(latestRide)
        setPhase(mapRideStatusToPhase(latestRide.status))
      } catch (error) {
        console.error('Unable to restore ride state:', error)
      }
    }

    void restoreRide()
  }, [])

  const formValues = useMemo(
    () => ({
      pickup: formData.pickup.trim(),
      destination: formData.destination.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      passengerType: formData.passengerType,
      passengerCount: formData.passengerCount,
    }),
    [formData],
  )

  const resetForm = () => {
    setFormData(initialFormState)
    setValidationErrors({})
    setSubmitError('')
    setPickupLocation(null)
    setPickupLocationError('')
    setIsSubmitting(false)
  }

  const handleInput = (field: keyof CustomerFormState, value: string) => {
    if (field === 'passengerType') {
      setFormData((current) => ({ ...current, passengerType: value as DemoPassengerType }))
      return
    }

    setFormData((current) => ({ ...current, [field]: value }))
    setValidationErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validateForm = () => {
    const nextErrors: CustomerValidation = {}

    if (!formValues.pickup && !pickupLocation) {
      nextErrors.pickup = 'Pickup location is required.'
    }

    if (!formValues.destination) {
      nextErrors.destination = 'Destination is required.'
    }

    if (!formValues.name) {
      nextErrors.name = 'Please enter your full name.'
    }

    if (!formValues.phone) {
      nextErrors.phone = 'Phone number is required.'
    }

    setValidationErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setPickupLocationError('Your device does not support location access. You can enter a pickup landmark instead.')
      return
    }

    setPickupLocationError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPickupLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        })
        setValidationErrors((current) => ({ ...current, pickup: undefined }))
      },
      (error) => {
        console.error('Unable to get Rider pickup location:', error)
        setPickupLocationError('Unable to access your location. You can enter a pickup landmark instead.')
      },
      { enableHighAccuracy: true },
    )
  }

  useEffect(() => {
    if (!ride.id || phase === 'rating' || phase === 'payment' || phase === 'payment_confirmed') {
      return
    }

    let isMounted = true

    const syncRideStatus = async () => {
      try {
        const latestRide = await fetchRideById(ride.id)
        if (!isMounted || !latestRide) {
          return
        }

        setRide(latestRide)
        setPhase(mapRideStatusToPhase(latestRide.status))
      } catch (error) {
        console.error('Unable to refresh ride status:', error)
      }
    }

    void syncRideStatus()
    const timer = window.setInterval(() => {
      void syncRideStatus()
    }, 5000)

    return () => {
      isMounted = false
      window.clearInterval(timer)
    }
  }, [ride.id, phase])

  useEffect(() => {
    if (!ride.driver_id) {
      setAssignedDriver(null)
      return
    }

    let cancelled = false

    const loadAssignedDriver = async () => {
      const driver = await fetchDriverById(ride.driver_id as string)

      if (!cancelled) {
        setAssignedDriver(driver as DriverProfile | null)
      }
    }

    void loadAssignedDriver()

    return () => {
      cancelled = true
    }
  }, [ride.driver_id])

  useEffect(() => {
    const activeStatuses: Ride['status'][] = ['accepted', 'arrived', 'in_progress']

    if (!ride.driver_id || !activeStatuses.includes(ride.status)) {
      setDriverLocation(null)
      return
    }

    return subscribeToDriverLocation(ride.driver_id, (location) => {
      setDriverLocation({ latitude: location.latitude, longitude: location.longitude })
    })
  }, [ride.driver_id, ride.status])

  useEffect(() => {
    if (!ride.id || !customerAuthId) {
      return
    }

    const channel = supabase
      .channel(`Rider-ride-chat-${ride.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_id=eq.${ride.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id?: string
            ride_id?: string
            sender_role?: string
          }

          if (
            incoming.ride_id === ride.id &&
            incoming.sender_role === 'driver'
          ) {
            setShowChat(true)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ride.id, customerAuthId])
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitError('')
    setIsSubmitting(true)

    try {
      const createdRide = await createRide({
        customer_auth_id: customerAuthId ?? await getCustomerAuthId(),
        customer_name: formValues.name,
        customer_phone: formValues.phone,
        pickup_address: formValues.pickup,
        pickup_lat: pickupLocation?.latitude ?? null,
        pickup_lng: pickupLocation?.longitude ?? null,
        destination_address: formValues.destination,
        destination_lat: null,
        destination_lng: null,
        driver_id: null,
        passenger_count: formValues.passengerCount,
        status: 'requested',
      })

      setRide(createdRide)
      window.localStorage.setItem(rideIdStorageKey, String(createdRide.id))
      setPhase('searching')
    } catch (error) {
      console.error('Unable to create ride:', error)

      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Unable to request a ride right now. Please try again.'

      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitRating = async () => {
    if (!ride.id || rating < 1 || rating > 5 || isSubmittingRating) {
      return
    }

    setIsSubmittingRating(true)

    try {
      const savedRide = await submitRideRating(ride.id, rating, ratingComment)

      if (savedRide) {
        setRide(savedRide)
      }

      setRatingSubmitted(true)
    } finally {
      setIsSubmittingRating(false)
    }
  }
  const handleBackToHome = () => {
    window.localStorage.removeItem(rideIdStorageKey)
    setRide(initialRide)
    setPhase('request')
    setPaymentMethod('Cash')
    setRating(0)
    setRatingComment('')
    setRatingSubmitted(false)
    resetForm()
  }

  const isRequesting = phase === 'request'
  const showCustomerForm = isRequesting && !showProfile
  const showDemoRideState = phase !== 'request' && !showProfile

  const statusCopy: Record<Exclude<RidePhase, 'request' | 'payment' | 'payment_confirmed'>, string> = {
    searching: 'Finding a driver',
    accepted: 'Driver accepted',
    arrived: 'Your driver has arrived',
    in_progress: 'Ride in progress',
    completed: 'Ride completed',
    rating: 'Rate your ride',
  }

  const renderRequestScreen = () => (
    <form className="ride-form" onSubmit={handleSubmit} noValidate>
      <section className="booking-section route-section">
        <div className="booking-section-heading">
          <span className="booking-section-number">01</span>
          <div><strong>Trip details</strong><span>Choose your pickup and destination</span></div>
        </div>
        <div className="form-stack">
        <LocationInput
          label={pickupLocation ? 'Pickup landmark (optional)' : 'Pickup'}
          value={formData.pickup}
          placeholder={pickupLocation ? 'Add a nearby landmark (optional)' : 'Enter pickup location'}
          error={validationErrors.pickup}
          onChange={(value) => handleInput('pickup', value)}
        />

        <button type="button" className="secondary-action" onClick={handleUseCurrentLocation}>
          Use My Current Location
        </button>
        {pickupLocation ? (
          <div className="field-note">
            <strong>Pickup location detected</strong>
            <span>You don't need to enter an address.</span>
          </div>
        ) : null}
        {pickupLocationError ? <p className="form-error-message">{pickupLocationError}</p> : null}

        <LocationInput
          label="Destination"
          value={formData.destination}
          placeholder="Where to?"
          error={validationErrors.destination}
          onChange={(value) => handleInput('destination', value)}
        />
        </div>
      </section>

      <section className="booking-section">
        <div className="booking-section-heading">
          <span className="booking-section-number">02</span>
          <div><strong>Passenger details</strong><span>So your driver knows who to meet</span></div>
        </div>
        <div className="Rider-details">
        <LocationInput
          label="Full Name"
          value={formData.name}
          placeholder="Enter your full name"
          error={validationErrors.name}
          onChange={(value) => handleInput('name', value)}
        />

        <LocationInput
          label="Phone Number"
          value={formData.phone}
          placeholder="09XXXXXXXXX"
          error={validationErrors.phone}
          onChange={(value) => handleInput('phone', value)}
        />
        </div>
      </section>

      <section className="booking-section">
        <div className="booking-section-heading">
          <span className="booking-section-number">03</span>
          <div><strong>Ride preferences</strong><span>Set up your trip before requesting</span></div>
        </div>
        <div className="ride-options-grid">
      <div className="field-block">
        <span className="field-label">Number of passengers</span>
        <select
          className="input-field"
          value={formData.passengerCount}
          onChange={(event) => handleInput('passengerCount', event.target.value)}
        >
          {passengerCountOptions.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>

      <div className="field-block">
        <span className="field-label">Passenger Type</span>
        <select
          className="input-field"
          value={formData.passengerType}
          onChange={(event) => handleInput('passengerType', event.target.value)}
        >
          {passengerTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <small className="field-note">Fare is calculated based on the official Bislig City fare matrix.</small>
      </div>
        </div>
      </section>

      {submitError ? <p className="form-error-message">{submitError}</p> : null}

      <button type="submit" className="primary-action" disabled={isSubmitting}>
        {isSubmitting ? 'Requesting...' : 'Request Ride'}
      </button>
    </form>
  )

  const renderSearchingScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge">SEARCHING</span>
        <div className="search-loader" aria-label="Finding your driver" />
      </div>

      <h2>{statusCopy.searching}</h2>
      <p>Looking for an available Bislig Ride driver nearby...</p>

      <div className="ride-summary compact">
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>Passenger Type</dt>
          <dd>{formValues.passengerType}</dd>
        </div>
      </div>
    </div>
  )

  const renderDriverFoundScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge accent">DRIVER ON THE WAY</span>
      </div>

      <div className="driver-identity-row">
        <img src={assignedDriver?.profile_photo_url || bisligLogo} alt={assignedDriver?.full_name ?? 'John Doe'} className="driver-photo" />
        <div>
          <h3>{assignedDriver?.full_name ?? 'John Doe'}</h3>
          <p className="driver-rating">Ã¢Ëœâ€¦Ã¢Ëœâ€¦Ã¢Ëœâ€¦Ã¢Ëœâ€¦Ã¢Ëœâ€¦ {Number(assignedDriver?.rating_average ?? 5).toFixed(1)}</p>
          <p className="driver-vehicle">{assignedDriver?.vehicle_type ?? 'Tricycle'}</p>
        </div>
      </div>

      <div className="driver-badge-row">
        <div>
          <span>Vehicle</span>
          <strong>{assignedDriver?.vehicle_model ?? 'Demo Tricycle'}</strong>
        </div>
        <div>
          <span>Plate</span>
          <strong>{assignedDriver?.plate_number ?? 'TEST-0001'}</strong>
        </div>
      </div>

      <p className="lead-paragraph">{statusCopy.accepted}</p>
      <p className="lead-paragraph">Your driver is on the way.</p>

      <div className="ride-summary compact">
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{ride.destination_address}</dd>
        </div>
      </div>

      <div className="action-row compact-actions">
        <a href={"tel:" + (assignedDriver?.phone?.replace(/[^\d+]/g, ''))} className="secondary-action">Call Driver</a><button type="button" className="secondary-action" onClick={() => setShowChat(true)}>Chat</button>
      </div>
      <p className="lead-paragraph">Your driver will update the ride status when they arrive.</p>
    </div>
  )

  const renderArrivedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge warning">ARRIVED</span>
      </div>

      <div className="driver-identity-row">
        <img src={assignedDriver?.profile_photo_url || bisligLogo} alt={assignedDriver?.full_name ?? 'John Doe'} className="driver-photo" />
        <div>
          <h3>{assignedDriver?.full_name ?? 'John Doe'}</h3>
          <p className="driver-rating">{assignedDriver?.vehicle_type ?? 'Tricycle'}</p>
          <p className="driver-vehicle">Plate: {assignedDriver?.plate_number ?? 'TEST-0001'}</p>
        </div>
      </div>

      <p className="lead-paragraph">{statusCopy.arrived}</p>

      <div className="ride-summary compact">
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{ride.destination_address}</dd>
        </div>
      </div>
      <p className="lead-paragraph">Your driver has arrived. The trip will begin when your driver starts the ride.</p>
    </div>
  )

  const renderInProgressScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{rideStatusToLabel.in_progress}</span>
      </div>

      <div className="progress-steps">
        <span className="progress-step complete">Driver accepted</span>
        <span className="progress-arrow">Ã¢â€ â€œ</span>
        <span className="progress-step complete">Arrived</span>
        <span className="progress-arrow">Ã¢â€ â€œ</span>
        <span className="progress-step active">Ride in progress</span>
        <span className="progress-arrow">Ã¢â€ â€œ</span>
        <span className="progress-step">Destination</span>
      </div>

      <div className="ride-summary compact">
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{assignedDriver?.vehicle_model ?? 'Demo Tricycle'}</dd>
        </div>
      </div>
      <p className="lead-paragraph">Your ride is in progress. Your driver will complete the trip when you reach your destination.</p>
    </div>
  )

  const renderCompletedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">RIDE COMPLETED</span>
      </div>

      <h2>{statusCopy.completed}</h2>
      <p>Thanks for riding with Bislig Ride.</p>

      <div className="ride-summary compact">
        <div>
          <dt>Driver</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>{ride.pickup_address} â†’ {ride.destination_address}</dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>Passenger Type</dt>
          <dd>{formValues.passengerType}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={() => setPhase('payment')}>
        Continue to Payment
      </button>
    </div>
  )

  const renderRatingScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge success">RIDE COMPLETED</span>
      </div>

      {!ratingSubmitted ? (
        <>
          <h2>How was your ride?</h2>
          <p className="lead-paragraph">
            Rate your experience with {assignedDriver?.full_name ?? 'your driver'}.
          </p>

          <div
            className="rating-stars"
            role="radiogroup"
            aria-label="Rate your ride from 1 to 5 stars"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={star <= rating ? 'rating-star selected' : 'rating-star'}
                onClick={() => setRating(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                aria-checked={star === rating}
                role="radio"
              >
                ?
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="rating-comment">
            Comment <span>(optional)</span>
          </label>

          <textarea
            id="rating-comment"
            className="text-input"
            value={ratingComment}
            onChange={(event) => setRatingComment(event.target.value)}
            placeholder="Tell us about your experience..."
            rows={4}
            maxLength={500}
          />

          <button
            type="button"
            className="primary-action"
            onClick={() => void handleSubmitRating()}
            disabled={rating === 0 || isSubmittingRating}
          >
            {isSubmittingRating ? 'Submitting...' : 'Submit Rating'}
          </button>
        </>
      ) : (
        <>
          <h2>Thank you!</h2>
          <p className="lead-paragraph">
            Your feedback helps us improve Bislig Ride.
          </p>

          <div className="ride-summary compact">
            <div>
              <dt>Your rating</dt>
              <dd>{'?'.repeat(rating)}</dd>
            </div>
            <div>
              <dt>Driver</dt>
              <dd>{assignedDriver?.full_name ?? 'Your driver'}</dd>
            </div>
          </div>

          <button
            type="button"
            className="primary-action"
            onClick={handleBackToHome}
          >
            Back to Home
          </button>
        </>
      )}
    </div>
  )
  const renderPaymentScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge">PAYMENT</span>
      </div>

      <h2>Payment</h2>

      <div className="payment-options" role="radiogroup" aria-label="Payment method selection">
        {['Cash', 'GCash'].map((method) => (
          <button
            key={method}
            type="button"
            className={paymentMethod === method ? 'payment-option selected' : 'payment-option'}
            onClick={() => setPaymentMethod(method as PaymentMethod)}
          >
            <span className="payment-radio" aria-hidden="true" />
            {method}
          </button>
        ))}
      </div>

      <div className="payment-note">
        <p>
          {paymentMethod === 'Cash'
            ? 'Pay the driver directly.'
            : 'GCash payment will be confirmed manually.'}
        </p>
      </div>

      <div className="fare-box">
        <span className="field-label">Fare</span>
        <strong>Fare is calculated based on the official Bislig City fare matrix.</strong>
        <small>Ordinance No. 2023-21</small>
      </div>

      <button type="button" className="primary-action" onClick={() => setPhase('rating')}>
        Confirm Payment
      </button>
    </div>
  )

  const renderPaymentConfirmedScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge success">PAYMENT RECORDED</span>
      </div>

      <h2>Payment recorded</h2>

      <div className="ride-summary compact">
        <div>
          <dt>Payment method</dt>
          <dd>{paymentMethod}</dd>
        </div>
        <div>
          <dt>Ride</dt>
          <dd>Completed</dd>
        </div>
        <div>
          <dt>Driver</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToHome}>
        Back to Home
      </button>
    </div>
  )

  return (
    <div className="shell-container">
      <header className="app-header">
        <div className="brand-block">
          <img src={bisligLogo} alt="Bislig Ride logo" className="brand-logo" />
        </div>

        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link" href="/pakyawan">Book Pakyawan</a>
          <button type="button" className="nav-button" onClick={() => setShowProfile((current) => !current)}>
            {showProfile ? 'Book a Ride' : 'My Rides'}
          </button>
          <div
            className="explore-menu"
            ref={exploreMenuRef}
            onMouseEnter={() => setIsExploreOpen(true)}
            onMouseLeave={() => setIsExploreOpen(false)}
          >
            <button
              type="button"
              className="nav-button explore-trigger"
              aria-expanded={isExploreOpen}
              aria-haspopup="true"
              onClick={() => setIsExploreOpen((current) => !current)}
            >
              Explore Bislig <span className="explore-chevron" aria-hidden="true">âŒ„</span>
            </button>
            <div className={isExploreOpen ? 'explore-dropdown open' : 'explore-dropdown'} role="menu" aria-label="Explore Bislig categories">
              <div className="discovery-list">
                {discoveryCategories.map((category) => (
                  <button key={category} type="button" className="discovery-item" role="menuitem" onClick={() => setIsExploreOpen(false)}>
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <a className="nav-cta" href="/become-a-driver">Become a Driver</a>
          <a className="nav-link" href="/contact">Contact</a>
        </nav>
      </header>

      <main className="Rider-layout">
        <section className="primary-panel">
          <div className="section-header">
            <p className="eyebrow">BISLIG CITY</p>
            <div className="coming-soon-notice" role="status" aria-live="polite">
  <div className="coming-soon-kicker">BISLIG RIDE Â· COMING SOON</div>
  <div className="coming-soon-copy">We're onboarding our founding drivers.</div>
</div>
<h1>Where are you going?</h1>
            <p className="subtitle">Get a reliable ride around Bislig City â€” simple, convenient, and made for your everyday trips.</p>
          </div>

          {showProfile ? (
            <CustomerProfile />
          ) : showCustomerForm ? (
            renderRequestScreen()
          ) : showDemoRideState ? (
            phase === 'searching' ? (
              renderSearchingScreen()
            ) : phase === 'accepted' ? (
              renderDriverFoundScreen()
            ) : phase === 'arrived' ? (
              renderArrivedScreen()
            ) : phase === 'in_progress' ? (
              renderInProgressScreen()
            ) : phase === 'completed' ? (
              renderCompletedScreen()
            ) : phase === 'rating' ? (
              renderRatingScreen()
            ) : phase === 'payment' ? (
              renderPaymentScreen()
            ) : (
              renderPaymentConfirmedScreen()
            )
          ) : null}
        </section>        {showChat && ride.id && assignedDriver && (
          <RideChat
            rideId={ride.id}
            otherPartyName={assignedDriver.full_name ?? 'John Doe'}
            currentRole="Rider"
            onClose={() => setShowChat(false)}
          />
        )}
        <aside className="map-panel" aria-label="Bislig City map preview">
          <MapView
            driverLatitude={driverLocation?.latitude}
            driverLongitude={driverLocation?.longitude}
            pickupLatitude={pickupLocation?.latitude}
            pickupLongitude={pickupLocation?.longitude}
          />
          <WeatherWidget />
        </aside>
      </main>
    </div>
  )
}




















