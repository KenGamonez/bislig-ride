import { useMemo, useState } from 'react'
import { CustomerProfile } from '../components/CustomerProfile'
import { LocationInput } from '../components/LocationInput'
import { MapView } from '../components/MapView'
import { createRide } from '../lib/rides'
import type { Ride } from '../types/ride'

type CustomerFormState = {
  pickup: string
  destination: string
  name: string
  phone: string
}

type CustomerValidation = Partial<Record<keyof CustomerFormState, string>>

const initialFormState: CustomerFormState = {
  pickup: '',
  destination: '',
  name: '',
  phone: '',
}

export function CustomerExperience() {
  const [formData, setFormData] = useState<CustomerFormState>(initialFormState)
  const [validationErrors, setValidationErrors] = useState<CustomerValidation>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestedRide, setRequestedRide] = useState<Ride | null>(null)
  const [showProfile, setShowProfile] = useState(false)

  const hasRequestedRide = Boolean(requestedRide)

  const formValues = useMemo(
    () => ({
      pickup: formData.pickup.trim(),
      destination: formData.destination.trim(),
      name: formData.name.trim(),
      phone: formData.phone.trim(),
    }),
    [formData],
  )

  const handleInput = (field: keyof CustomerFormState, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }))

    setValidationErrors((current) => ({
      ...current,
      [field]: undefined,
    }))
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitError('')
    setIsSubmitting(true)

    try {
      const createdRide = await createRide({
        customer_name: formValues.name,
        customer_phone: formValues.phone,
        pickup_address: formValues.pickup,
        pickup_lat: null,
        pickup_lng: null,
        destination_address: formValues.destination,
        destination_lat: null,
        destination_lng: null,
        driver_id: null,
        status: 'requested',
      })

      setRequestedRide(createdRide)
    } catch (error) {
      console.error('Failed to create ride request:', error)
      setSubmitError('We could not send your ride request right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelRequest = () => {
    setRequestedRide(null)
    setFormData(initialFormState)
    setValidationErrors({})
    setSubmitError('')
    setIsSubmitting(false)
  }

  return (
    <div className="shell-container">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-badge" aria-hidden="true">
            B
          </div>
          <div>
            <p className="brand-name">Bislig Ride</p>
            <span className="brand-location">Bislig City</span>
          </div>
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
            <p className="eyebrow">Your city. Your ride.</p>
            <h1>Where are you going?</h1>
            <p className="subtitle">Request a ride anywhere in Bislig City.</p>
          </div>

          {showProfile ? (
            <CustomerProfile />
          ) : !hasRequestedRide ? (
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

              {submitError ? <p className="form-error-message">{submitError}</p> : null}

              <button type="submit" className="primary-action" disabled={isSubmitting}>
                {isSubmitting ? 'Requesting...' : 'Request Ride'}
              </button>
            </form>
          ) : null}

          {hasRequestedRide && requestedRide && !showProfile ? (
            <div className="request-confirmation">
              <div className="confirmation-heading">
                <span className="status-dot success-dot" aria-hidden="true" />
                <div>
                  <p className="confirmation-title">Ride requested</p>
                  <p className="confirmation-subtitle">Your driver request has been received.</p>
                </div>
              </div>

              <dl className="ride-summary">
                <div>
                  <dt>Pickup</dt>
                  <dd>{requestedRide.pickup_address}</dd>
                </div>
                <div>
                  <dt>Destination</dt>
                  <dd>{requestedRide.destination_address}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Looking for a driver</dd>
                </div>
                <div>
                  <dt>Ride ID</dt>
                  <dd>#{requestedRide.id}</dd>
                </div>
              </dl>

              <button type="button" className="secondary-action" onClick={handleCancelRequest}>
                Cancel request
              </button>
            </div>
          ) : null}
        </section>

        <aside className="map-panel" aria-label="Bislig City map preview">
          <MapView />
        </aside>
      </main>
    </div>
  )
}
