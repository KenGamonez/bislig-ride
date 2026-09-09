import { useEffect, useMemo, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'
import { AppHeader } from '../components/AppHeader'
import { CancelRideModal } from '../components/CancelRideModal'
import { CustomerProfile } from '../components/CustomerProfile'
import { RideChat } from '../components/RideChat'
import { LocationInput } from '../components/LocationInput'
import { MapView } from '../components/MapView'
import { WeatherWidget } from '../components/WeatherWidget'
import { passengerTypes, type DemoPassengerType } from '../lib/demoDriver'
import { fetchDriverById } from '../lib/drivers'
import type { DriverProfile } from '../types/driver'
import { subscribeToDriverLocation } from '../lib/driverLocations'
import { fetchLatestRideCancellation, subscribeToRideCancellations } from '../lib/rideCancellations'
import { fetchReputationFor, formatCancellationRate, type ReputationSummary } from '../lib/reputation'
import { cancelRide, createRide, fetchRideById, hasRatedRide, submitRideRating } from '../lib/rides'
import { getCustomerAuthId, supabase } from '../lib/supabase'
import type { Ride, RideCancellation } from '../types/ride'

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

type RidePhase = 'request' | 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'rating' | 'payment' | 'payment_confirmed'

type PaymentMethod = 'Cash' | 'GCash'

type ViewMode = 'Rider' | 'driver' | 'admin'

const initialFormState: CustomerFormState = {
  pickup: '',
  destination: '',
  name: '',
  phone: '',
  passengerType: 'Regular',
  passengerCount: '1 passenger',
}

const rideStatusToLabel: Record<Exclude<RidePhase, 'request' | 'cancelled' | 'rating' | 'payment' | 'payment_confirmed'>, string> = {
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

const renderStars = (average: number) => (
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
    case 'cancelled':
      return 'cancelled'
    default:
      return 'request'
  }
}

type CustomerExperienceProps = {
  currentView?: ViewMode
  onSwitchView?: (view: ViewMode) => void
}

export function CustomerExperience({ currentView = 'Rider', onSwitchView }: CustomerExperienceProps) {
  const [formData, setFormData] = useState<CustomerFormState>(initialFormState)
  const [validationErrors, setValidationErrors] = useState<CustomerValidation>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [customerAuthId, setCustomerAuthId] = useState<string | null>(null)
  const [assignedDriver, setAssignedDriver] = useState<DriverProfile | null>(null)
  const [driverReputation, setDriverReputation] = useState<ReputationSummary | null>(null)
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
  const [ratingError, setRatingError] = useState('')
const [isSubmittingRating, setIsSubmittingRating] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancellation, setCancellation] = useState<RideCancellation | null>(null)
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(null)

  useEffect(() => {
    void getCustomerAuthId()
      .then(setCustomerAuthId)
      .catch((error) => console.error('Unable to establish Rider session:', error))
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

        if (latestRide.status === 'cancelled') {
          const latestCancellation = await fetchLatestRideCancellation(latestRide.id)
          if (latestCancellation) {
            setCancellation(latestCancellation)
          }
        }
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

  const toggleMobileSection = (id: string) => {
    setOpenMobileSection((current) => (current === id ? null : id))
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
      nextErrors.name = 'Please enter your name.'
    }

    setValidationErrors(nextErrors)

    if (nextErrors.pickup) {
      setOpenMobileSection('pickup')
    } else if (nextErrors.destination) {
      setOpenMobileSection('destination')
    } else if (nextErrors.name) {
      setOpenMobileSection('passenger')
    }

    return Object.keys(nextErrors).length === 0
  }

const handleUseCurrentLocation = () => {
    setOpenMobileSection('pickup')

    if (!navigator.geolocation) {
      setPickupLocationError(
        'Your device does not support location access. You can enter a pickup landmark instead.',
      )
      return
    }

    setPickupLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords

        console.log('Bislig Ride rider location:', {
          latitude,
          longitude,
          accuracy,
        })

        if (!Number.isFinite(accuracy)) {
          setPickupLocation(null)
          setPickupLocationError(
            'Your device could not determine location accuracy. Please turn on precise location/GPS and try again.',
          )
          return
        }

        // Excellent / good location: accept immediately.
        if (accuracy <= 100) {
          setPickupLocation({
            latitude,
            longitude,
          })
          setValidationErrors((current) => ({ ...current, pickup: undefined }))
          return
        }

        // Usable but not ideal: accept up to 300m.
        // This avoids unnecessarily rejecting legitimate mobile GPS fixes.
        if (accuracy <= 300) {
          setPickupLocation({
            latitude,
            longitude,
          })
          setValidationErrors((current) => ({ ...current, pickup: undefined }))
          setPickupLocationError(
            `Location detected with approximately ${Math.round(accuracy)}m accuracy. Please confirm your pickup point on the map.`,
          )
          return
        }

        // Anything above 300m is too coarse for a reliable ride pickup.
        setPickupLocation(null)

        if (accuracy >= 10000) {
          setPickupLocationError(
            'Your computer or device cannot provide a precise location. Please use a phone with precise location/GPS enabled, or enter your pickup landmark manually.',
          )
        } else {
          setPickupLocationError(
            `Your device returned an inaccurate location (${Math.round(accuracy)}m accuracy). Please turn on precise location/GPS and try again.`,
          )
        }
      },
      (error) => {
        console.error('Unable to get Rider pickup location:', error)

        if (error.code === error.PERMISSION_DENIED) {
          setPickupLocationError(
            'Location permission was denied. Please allow location access and try again.',
          )
        } else if (error.code === error.TIMEOUT) {
          setPickupLocationError(
            'Location lookup timed out. Please move to an area with a clearer GPS signal and try again.',
          )
        } else {
          setPickupLocationError(
            'Unable to access your location. Please turn on precise location/GPS and try again.',
          )
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
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

        if (latestRide.status === 'cancelled') {
          const latestCancellation = await fetchLatestRideCancellation(ride.id)
          if (isMounted && latestCancellation) {
            setCancellation(latestCancellation)
          }
        }
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
    if (!ride.driver_id) {
      return
    }

    let cancelled = false

    const loadDriverReputation = async () => {
      const summary = await fetchReputationFor(String(ride.driver_id), true)

      if (!cancelled) {
        setDriverReputation(summary)
      }
    }

    void loadDriverReputation()

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

  useEffect(() => {
    if (!ride.id || !['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status)) {
      return
    }

    let mounted = true

    const unsubscribe = subscribeToRideCancellations(ride.id, (incoming) => {
      if (!mounted) {
        return
      }

      if (incoming.cancelled_by_role === 'customer' && incoming.cancelled_by === customerAuthId) {
        return
      }

      setCancellation(incoming)
      setRide((current) => ({ ...current, status: 'cancelled' }))
      setPhase('cancelled')
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [ride.id, ride.status, customerAuthId])
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
    if (!ride.id || rating < 1 || rating > 5 || isSubmittingRating || ratingSubmitted) {
      return
    }

    setRatingError('')
    setIsSubmittingRating(true)

    try {
      const alreadyRated = await hasRatedRide(ride.id, customerAuthId ?? (await getCustomerAuthId()))

      if (alreadyRated) {
        setRatingSubmitted(true)
        return
      }

      const savedRide = await submitRideRating(ride.id, rating, ratingComment)

      if (savedRide) {
        setRide(savedRide)
      }

setRatingSubmitted(true)
    } catch (error) {
      console.warn('Unable to submit rating:', error)

      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Unable to submit your rating. Please try again.'

      setRatingError(message)
    } finally {
      setIsSubmittingRating(false)
    }
  }

  useEffect(() => {
    if (phase !== 'rating' || !ride.id || !customerAuthId) {
      return
    }

    let mounted = true

    const checkExistingRating = async () => {
      const alreadyRated = await hasRatedRide(ride.id, customerAuthId)

      if (mounted) {
        setRatingSubmitted(alreadyRated)
      }
    }

    void checkExistingRating()

    return () => {
      mounted = false
    }
  }, [phase, ride.id, customerAuthId])

  const handleConfirmCancellation = async (reason: string) => {
    if (!ride.id || !customerAuthId || cancelSubmitting) {
      return
    }

    setCancelError('')
    setCancelSubmitting(true)

    try {
      const cancelledRide = await cancelRide(ride.id, customerAuthId, 'customer', reason)
      setRide(cancelledRide)
      setPhase('cancelled')

      const latestCancellation = await fetchLatestRideCancellation(ride.id)
      if (latestCancellation) {
        setCancellation(latestCancellation)
      }

      setShowCancelModal(false)
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

  const handleBackToHome = () => {
    window.localStorage.removeItem(rideIdStorageKey)
    setRide(initialRide)
    setPhase('request')
    setPaymentMethod('Cash')
    setRating(0)
    setRatingComment('')
    setRatingSubmitted(false)
    setRatingError('')
    setCancellation(null)
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
    cancelled: 'Ride cancelled',
    rating: 'Rate your ride',
  }

  const renderRequestScreen = () => (
    <form className="ride-form" onSubmit={handleSubmit} noValidate>
      <div className="desktop-booking-flow">
      <section className="booking-section route-section">
        <div className="booking-section-heading route-heading">
          <span className="booking-section-number">01</span>
          <div>
            <strong>Trip details</strong>
            <span>Choose your pickup and destination</span>
          </div>
        </div>

        <div className="form-stack route-fields">
          <div className="pickup-field-block">
<LocationInput
              label={pickupLocation ? 'Pickup landmark (optional)' : 'Pickup'}
              value={formData.pickup}
              placeholder={pickupLocation ? 'Add a nearby landmark (optional)' : 'Enter pickup location'}
              error={validationErrors.pickup}
              onChange={(value) => handleInput('pickup', value)}
            />

            <p className="pickup-help-note">
              Enter your pickup location, or tap <strong>Use my current location</strong>.
            </p>

            {pickupLocation ? (
              <div className="field-note pickup-detected-note">
                <span className="pickup-check" aria-hidden="true"></span>
                <span>Your current location has been located.</span>
              </div>
            ) : null}

            {pickupLocationError ? (
              <p className="form-error-message pickup-location-error">
                {pickupLocationError}
              </p>
            ) : null}
          </div>

          <div className="destination-field-block">
            <LocationInput
              label="Destination"
              value={formData.destination}
              placeholder="Where to?"
              error={validationErrors.destination}
              onChange={(value) => handleInput('destination', value)}
            />
          </div>
</div>
      </section>

      <section className="booking-section passenger-section">
        <div className="booking-section-heading passenger-heading">
          <div>
            <strong>Passenger details</strong>
            <span>So your driver knows who to meet</span>
          </div>
        </div>

        <div className="Rider-details passenger-details">
          <LocationInput
            label="Name"
            value={formData.name}
            placeholder="Enter your name"
            error={validationErrors.name}
            onChange={(value) => handleInput('name', value)}
          />
        </div>
      </section>

      <section className="booking-section preferences-section">
        <div className="booking-section-heading preferences-heading">
          <span className="booking-section-number">03</span>
          <div>
            <strong>Ride preferences</strong>
            <span>Set up your trip before requesting</span>
          </div>
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
            <span className="field-label">Passenger type</span>
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
            <small className="field-note">
              Fare is calculated based on the official Bislig City fare matrix.
            </small>
          </div>
        </div>
      </section>
      </div>

      <div className="mobile-booking-flow">
<button
          type="button"
          className="mobile-location-action"
          onClick={handleUseCurrentLocation}
          disabled={isSubmitting}
        >
          <span className="location-icon" aria-hidden="true"></span>
          Use my current location
        </button>

        <section className="booking-accordion" aria-label="Booking details">
          <div className={openMobileSection === 'pickup' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'pickup'}
              onClick={() => toggleMobileSection('pickup')}
            >
              <span className="accordion-number">01</span>
              <span className="accordion-titles">
                <strong>Pickup</strong>
                <small>Where should we pick you up?</small>
              </span>
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label="Pickup"
                  value={formData.pickup}
                  placeholder="Enter pickup location"
                  error={validationErrors.pickup}
                  onChange={(value) => handleInput('pickup', value)}
                />

                <p className="pickup-help-note">
                  Enter your pickup location, or tap <strong>Use my current location</strong>.
                </p>

                {pickupLocation ? (
                  <div className="field-note pickup-detected-note">
                    <span className="pickup-check" aria-hidden="true"></span>
                    <span>Your current location has been located.</span>
                  </div>
                ) : null}

                {pickupLocationError ? (
                  <p className="form-error-message pickup-location-error">
                    {pickupLocationError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className={openMobileSection === 'destination' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'destination'}
              onClick={() => toggleMobileSection('destination')}
            >
              <span className="accordion-number">02</span>
              <span className="accordion-titles">
                <strong>Destination</strong>
                <small>Where are you going?</small>
              </span>
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label="Destination"
                  value={formData.destination}
                  placeholder="Enter destination location"
                  error={validationErrors.destination}
                  onChange={(value) => handleInput('destination', value)}
                />
              </div>
            </div>
          </div>
          <div className={openMobileSection === 'passenger' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'passenger'}
              onClick={() => toggleMobileSection('passenger')}
            >
<span className="accordion-number">03</span>
              <span className="accordion-titles">
                <strong>Passenger details</strong>
                <small>Passenger name</small>
              </span>
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label="Name"
                  value={formData.name}
                  placeholder="Enter your name"
                  error={validationErrors.name}
                  onChange={(value) => handleInput('name', value)}
                />
              </div>
            </div>
          </div>

          <div className={openMobileSection === 'preferences' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'preferences'}
              onClick={() => toggleMobileSection('preferences')}
            >
<span className="accordion-number">04</span>
              <span className="accordion-titles">
                <strong>Ride preferences</strong>
                <small>Passengers, type &amp; fare</small>
              </span>
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
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
                  <span className="field-label">Passenger type</span>
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
                </div>

                <p className="fare-note">
                  Fare is calculated based on the official Bislig City fare matrix.
                  <small>Ordinance No. 2023-21</small>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {submitError ? (
        <p className="form-error-message submit-error">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        className="primary-action request-ride-action"
        disabled={isSubmitting}
      >
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

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
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
          <p className="driver-rating">
            <span className="rating-stars-inline">
              {renderStars(driverReputation?.averageStars ?? 5)}
            </span>
            {' '}
            {!driverReputation
              ? 'Loading reputation...'
              : driverReputation.totalRatings === 0
                ? 'New driver · no ratings yet'
                : `${driverReputation.averageStars.toFixed(1)}/5 (${driverReputation.totalRatings} rating${driverReputation.totalRatings === 1 ? '' : 's'}) · ${formatCancellationRate(driverReputation.cancellationRate)} cancellation rate`}
          </p>
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
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button><button type="button" className="secondary-action" onClick={() => setShowChat(true)}>Chat</button>
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

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
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
        <span className="progress-arrow">?</span>
        <span className="progress-step complete">Arrived</span>
        <span className="progress-arrow">?</span>
        <span className="progress-step active">Ride in progress</span>
        <span className="progress-arrow">?</span>
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

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
      </div>
      <p className="lead-paragraph">Your ride is in progress. Your driver will complete the trip when you reach your destination.</p>
    </div>
  )

  const renderCancelledScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge">CANCELLED</span>
      </div>

      <h2>{statusCopy.cancelled}</h2>
      <p>
        {cancellation?.cancelled_by_role === 'driver'
          ? 'Your driver cancelled this ride.'
          : 'You cancelled this ride.'}
      </p>

      <div className="ride-summary compact">
        <div>
          <dt>Reason</dt>
          <dd>{cancellation?.reason ?? 'No reason provided.'}</dd>
        </div>
        <div>
          <dt>Pickup</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>Destination</dt>
          <dd>{ride.destination_address}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToHome}>
        Back to Home
      </button>
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
          <dd>{ride.pickup_address} ? {ride.destination_address}</dd>
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
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill={star <= rating ? 'currentColor' : 'none'}
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

{ratingError ? (
            <p className="form-error-message" role="alert">
              {ratingError}
            </p>
          ) : null}

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
              <dd className="rating-summary-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <svg
                    key={value}
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill={value <= rating ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                ))}
              </dd>
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
    <div className="app-wrapper">
<AppHeader
        view={currentView}
        onViewChange={onSwitchView}
        primaryLabel={showProfile ? 'Book a Ride' : 'My Rides'}
        onPrimaryAction={() => setShowProfile((current) => !current)}
      />

      <main className={openMobileSection === 'pickup' ? 'customer-layout pickup-open' : 'customer-layout'}>
        <section className="primary-panel">
          <div className="section-header">
            <p className="eyebrow">BISLIG CITY</p>
            <h1>Where are you going?</h1>
            <p className="subtitle">Get a reliable ride around Bislig City - simple, convenient, and made for your everyday trips.</p>
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
            ) : phase === 'cancelled' ? (
              renderCancelledScreen()
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
        {showCancelModal && ride.id && (
          <CancelRideModal
            open={showCancelModal}
            role="customer"
            submitting={cancelSubmitting}
            error={cancelError}
            onClose={() => {
              setShowCancelModal(false)
              setCancelError('')
            }}
            onConfirm={(reason) => void handleConfirmCancellation(reason)}
          />
        )}
        <aside className="map-panel" aria-label="Bislig City map preview">
          <div className="map-stage">
            <MapView
              className="map-view"
              driverLatitude={driverLocation?.latitude}
              driverLongitude={driverLocation?.longitude}
              pickupLatitude={pickupLocation?.latitude}
              pickupLongitude={pickupLocation?.longitude}
            />

            <button
              type="button"
              className="map-location-action"
              onClick={handleUseCurrentLocation}
              disabled={isSubmitting}
            >
              <span className="location-icon" aria-hidden="true"></span>
              Use my current location
            </button>
          </div>

          <div className="map-location-status">
            {pickupLocation ? (
              <p className="field-note map-location-confirmed">
                <span className="pickup-check" aria-hidden="true"></span>
                Your current location has been located.
              </p>
            ) : null}

            {pickupLocationError ? (
              <p className="form-error-message">
                {pickupLocationError}
              </p>
            ) : null}
          </div>

          <WeatherWidget />
        </aside>
      </main>

      <footer className="announcement-ticker" role="marquee" aria-label="Coming soon announcement">
        <div className="ticker-track">
          <span className="ticker-content">
            BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span>
          </span>
          <span className="ticker-content" aria-hidden="true">
            BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span> BISLIG RIDE - COMING SOON <span className="ticker-dot" aria-hidden="true"></span> WE'RE ONBOARDING OUR FOUNDING DRIVERS <span className="ticker-dot" aria-hidden="true"></span>
          </span>
        </div>
      </footer>
    </div>
  )
}



