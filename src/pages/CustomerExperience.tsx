import { useEffect, useMemo, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'
import { CustomerProfile } from '../components/CustomerProfile'
import { LocationInput } from '../components/LocationInput'
import { MapView } from '../components/MapView'
import { demoDriver, passengerTypes, type DemoPassengerType } from '../lib/demoDriver'
import type { Ride } from '../types/ride'

type CustomerFormState = {
  pickup: string
  destination: string
  name: string
  phone: string
  passengerType: DemoPassengerType
}

type CustomerValidation = Partial<Record<keyof CustomerFormState, string>>

type RidePhase = 'request' | 'searching' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'payment' | 'payment_confirmed'

type PaymentMethod = 'Cash' | 'GCash'

const initialFormState: CustomerFormState = {
  pickup: '',
  destination: '',
  name: '',
  phone: '',
  passengerType: 'Regular',
}

const rideStatusToLabel: Record<Exclude<RidePhase, 'request' | 'payment' | 'payment_confirmed'>, string> = {
  searching: 'SEARCHING',
  accepted: 'DRIVER ON THE WAY',
  arrived: 'ARRIVED',
  in_progress: 'RIDE IN PROGRESS',
  completed: 'RIDE COMPLETED',
}

const initialRide: Ride = {
  id: 1,
  customer_name: '',
  customer_phone: '',
  pickup_address: '',
  pickup_lat: null,
  pickup_lng: null,
  destination_address: '',
  destination_lat: null,
  destination_lng: null,
  driver_id: demoDriver.id,
  status: 'requested',
  created_at: new Date().toISOString(),
}

export function CustomerExperience() {
  const [formData, setFormData] = useState<CustomerFormState>(initialFormState)
  const [validationErrors, setValidationErrors] = useState<CustomerValidation>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [ride, setRide] = useState<Ride>(initialRide)
  const [phase, setPhase] = useState<RidePhase>('request')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')

  const formValues = useMemo(
    () => ({
      pickup: formData.pickup.trim(),
      destination: formData.destination.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
      passengerType: formData.passengerType,
    }),
    [formData],
  )

  const resetForm = () => {
    setFormData(initialFormState)
    setValidationErrors({})
    setSubmitError('')
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

    if (!formValues.pickup) {
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

  useEffect(() => {
    if (phase !== 'searching') {
      return
    }

    const timer = window.setTimeout(() => {
      setPhase('accepted')
      setRide((current) => ({
        ...current,
        status: 'accepted',
      }))
    }, 2200)

    return () => window.clearTimeout(timer)
  }, [phase])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitError('')
    setIsSubmitting(true)

    const nextRide: Ride = {
      ...initialRide,
      id: Date.now(),
      customer_name: formValues.name,
      customer_phone: formValues.phone,
      pickup_address: formValues.pickup,
      destination_address: formValues.destination,
      status: 'requested',
      created_at: new Date().toISOString(),
    }

    setRide(nextRide)
    setPhase('searching')
    setIsSubmitting(false)
  }

  const handleBackToHome = () => {
    setRide(initialRide)
    setPhase('request')
    setPaymentMethod('Cash')
    resetForm()
  }

  const isRequesting = phase === 'request'
  const showCustomerForm = isRequesting && !showProfile
  const showDemoRideState = phase !== 'request' && !showProfile

  const renderRequestScreen = () => (
    <form className="ride-form" onSubmit={handleSubmit} noValidate>
      <div className="form-stack">
        <LocationInput
          label="Pickup"
          value={formData.pickup}
          placeholder="Enter pickup location"
          error={validationErrors.pickup}
          onChange={(value) => handleInput('pickup', value)}
        />

        <LocationInput
          label="Destination"
          value={formData.destination}
          placeholder="Where to?"
          error={validationErrors.destination}
          onChange={(value) => handleInput('destination', value)}
        />
      </div>

      <div className="customer-details">
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

      <h2>Finding your driver</h2>
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
        <img src={demoDriver.profilePhoto} alt={demoDriver.name} className="driver-photo" />
        <div>
          <h3>{demoDriver.name}</h3>
          <p className="driver-rating">★★★★★ {demoDriver.rating}</p>
          <p className="driver-vehicle">{demoDriver.vehicleType}</p>
        </div>
      </div>

      <div className="driver-badge-row">
        <div>
          <span>Vehicle</span>
          <strong>{demoDriver.vehicleModel}</strong>
        </div>
        <div>
          <span>Plate</span>
          <strong>{demoDriver.plateNumber}</strong>
        </div>
      </div>

      <p className="lead-paragraph">Your driver has accepted the ride.</p>
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
        <button type="button" className="secondary-action" disabled>
          Call Driver
        </button>
        <button type="button" className="secondary-action" disabled>
          Message
        </button>
      </div>

      <button type="button" className="primary-action" onClick={() => setPhase('arrived')}>
        Driver Arrived
      </button>
    </div>
  )

  const renderArrivedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge warning">ARRIVED</span>
      </div>

      <div className="driver-identity-row">
        <img src={demoDriver.profilePhoto} alt={demoDriver.name} className="driver-photo" />
        <div>
          <h3>{demoDriver.name}</h3>
          <p className="driver-rating">{demoDriver.vehicleType}</p>
          <p className="driver-vehicle">Plate: {demoDriver.plateNumber}</p>
        </div>
      </div>

      <p className="lead-paragraph">Your driver has arrived.</p>

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

      <button type="button" className="primary-action" onClick={() => setPhase('in_progress')}>
        Start Ride
      </button>
    </div>
  )

  const renderInProgressScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{rideStatusToLabel.in_progress}</span>
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
          <dt>Driver</dt>
          <dd>{demoDriver.name}</dd>
        </div>
        <div>
          <dt>Vehicle</dt>
          <dd>{demoDriver.vehicleModel}</dd>
        </div>
      </div>

      <button type="button" className="primary-action accent" onClick={() => setPhase('completed')}>
        Complete Ride
      </button>
    </div>
  )

  const renderCompletedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">RIDE COMPLETED</span>
      </div>

      <h2>Ride completed</h2>
      <p>Thanks for riding with Bislig Ride.</p>

      <div className="ride-summary compact">
        <div>
          <dt>Driver</dt>
          <dd>{demoDriver.name}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>{ride.pickup_address} → {ride.destination_address}</dd>
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

      <button type="button" className="primary-action" onClick={() => setPhase('payment_confirmed')}>
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
          <dd>{demoDriver.name}</dd>
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
          <button type="button" className="nav-button" onClick={() => setShowProfile(false)}>
            Help
          </button>
          <button type="button" className="nav-button" onClick={() => setShowProfile((current) => !current)}>
            {showProfile ? 'Back to ride' : 'Profile'}
          </button>
        </nav>
      </header>

      <main className="customer-layout">
        <section className="primary-panel">
          <div className="section-header">
            <p className="eyebrow">BISLIG CITY</p>
            <h1>Where are you going?</h1>
            <p className="subtitle">Get a reliable ride around Bislig City — simple, convenient, and made for your everyday trips.</p>
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
            ) : phase === 'payment' ? (
              renderPaymentScreen()
            ) : (
              renderPaymentConfirmedScreen()
            )
          ) : null}
        </section>

        <aside className="map-panel" aria-label="Bislig City map preview">
          <MapView />
        </aside>
      </main>
    </div>
  )
}
