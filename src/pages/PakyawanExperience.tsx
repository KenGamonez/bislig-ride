import { useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { createPakyawanBooking } from '../lib/scheduledBookings'
import { pakyawanTripTypes, type PakyawanTripType } from '../types/scheduledBooking'

const routeToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable — the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

type PakyawanBookingForm = {
  booking_date: string
  pickup_time: string
  pickup_location: string
  destination: string
  passengers: string
  trip_type: PakyawanTripType | ''
  estimated_hours: string
  special_requests: string
  customer_name: string
  customer_phone: string
}

type FormErrors = Partial<Record<keyof PakyawanBookingForm, string>>

const initialForm: PakyawanBookingForm = {
  booking_date: '',
  pickup_time: '',
  pickup_location: '',
  destination: '',
  passengers: '1',
  trip_type: '',
  estimated_hours: '',
  special_requests: '',
  customer_name: '',
  customer_phone: '',
}

const getToday = () => {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60000
  return new Date(today.getTime() - offset).toISOString().split('T')[0]
}

export function PakyawanExperience({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [step, setStep] = useState(1)
  const cardRef = useRef<HTMLFormElement>(null)

  const updateField = (field: keyof PakyawanBookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: FormErrors = {}
    const requiredFields: Array<keyof PakyawanBookingForm> = [
      'booking_date', 'pickup_time', 'pickup_location', 'destination', 'passengers', 'trip_type', 'customer_name', 'customer_phone',
    ]
    requiredFields.forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = 'This field is required.'
    })
    if (form.booking_date && form.booking_date < getToday()) nextErrors.booking_date = 'Please choose today or a future date.'
    if (form.passengers && (!/^\d+$/.test(form.passengers) || Number(form.passengers) < 1)) nextErrors.passengers = 'Enter at least one passenger.'
    if (form.estimated_hours && (!/^\d+$/.test(form.estimated_hours) || Number(form.estimated_hours) < 1)) nextErrors.estimated_hours = 'Enter the expected duration in hours.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (!form.booking_date.trim()) {
        nextErrors.booking_date = 'This field is required.'
      } else if (form.booking_date < getToday()) {
        nextErrors.booking_date = 'Please choose today or a future date.'
      }
      if (!form.pickup_time.trim()) nextErrors.pickup_time = 'This field is required.'
    }

    if (target === 2) {
      if (!form.pickup_location.trim()) nextErrors.pickup_location = 'This field is required.'
      if (!form.destination.trim()) nextErrors.destination = 'This field is required.'
      if (!form.trip_type.trim()) nextErrors.trip_type = 'This field is required.'
      const passengers = form.passengers.trim()
      if (!passengers) {
        nextErrors.passengers = 'This field is required.'
      } else if (!/^\d+$/.test(passengers) || Number(passengers) < 1) {
        nextErrors.passengers = 'Enter at least one passenger.'
      }
    }

    if (target === 3) {
      if (form.estimated_hours && (!/^\d+$/.test(form.estimated_hours) || Number(form.estimated_hours) < 1)) {
        nextErrors.estimated_hours = 'Enter the expected duration in hours.'
      }
      if (!form.customer_name.trim()) nextErrors.customer_name = 'This field is required.'
      if (!form.customer_phone.trim()) nextErrors.customer_phone = 'This field is required.'
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const goToStep = (nextStep: number) => {
    setStep(nextStep)
    setErrors({})
    if (window.innerWidth <= 767 && cardRef.current) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      cardRef.current.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
    }
  }

  const handleContinue = () => {
    if (!validateStep(step)) return
    goToStep(step + 1)
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step < 3) {
      handleContinue()
      return
    }
    if (!validate() || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createPakyawanBooking({
        customer_id: null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        booking_date: form.booking_date,
        pickup_time: form.pickup_time,
        pickup_location: form.pickup_location.trim(),
        destination: form.destination.trim(),
        passengers: Number(form.passengers),
        trip_type: form.trip_type as PakyawanTripType,
        estimated_hours: form.estimated_hours ? Number(form.estimated_hours) : null,
        special_requests: form.special_requests.trim() || null,
      })
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit pakyawan booking:', error)
      setSubmitError('We could not submit your booking request right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const adjustPassengers = (delta: number) => {
    const current = Number.parseInt(form.passengers, 10)
    const next = Number.isFinite(current) ? current + delta : 1
    updateField('passengers', String(Math.max(1, next)))
  }

  const field = (
    name: keyof PakyawanBookingForm,
    label: string,
    type: 'text' | 'tel' | 'date' | 'time' | 'number' = 'text',
    placeholder?: string,
    min?: string,
  ) => (
    <label className="field-block" key={name}>
      <span className="field-label">{label}</span>
      <input
        className={`input-field${errors[name] ? ' has-error' : ''}`}
        type={type}
        placeholder={placeholder}
        min={min}
        value={form[name]}
        onChange={(event) => updateField(name, event.target.value)}
      />
      {errors[name] ? <span className="field-error">{errors[name]}</span> : null}
    </label>
  )

  const renderStep = () => {
    if (step === 2) {
      return (
        <div className="flow-fields">
          <div className="flow-field-row">
            {field('pickup_location', 'Pickup Location')}
            {field('destination', 'Destination')}
          </div>
          <div className="flow-field-row">
            <label className="field-block">
              <span className="field-label">Number of Passengers</span>
              <div className={`flow-stepper${errors.passengers ? ' has-error' : ''}`}>
                <button type="button" aria-label="Decrease number of passengers" onClick={() => adjustPassengers(-1)}>
                  &minus;
                </button>
                <input
                  aria-label="Number of passengers"
                  inputMode="numeric"
                  type="text"
                  value={form.passengers}
                  onChange={(event) => updateField('passengers', event.target.value.replace(/[^0-9]/g, ''))}
                />
                <button type="button" aria-label="Increase number of passengers" onClick={() => adjustPassengers(1)}>
                  +
                </button>
              </div>
              {errors.passengers ? <span className="field-error">{errors.passengers}</span> : null}
            </label>
            <label className="field-block">
              <span className="field-label">Trip Type</span>
              <select
                className={`input-field${errors.trip_type ? ' has-error' : ''}`}
                value={form.trip_type}
                onChange={(event) => updateField('trip_type', event.target.value)}
              >
                <option value="">Select trip type</option>
                {pakyawanTripTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              {errors.trip_type ? <span className="field-error">{errors.trip_type}</span> : null}
            </label>
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div className="flow-fields">
          {field('estimated_hours', 'Estimated Duration (hours, optional)', 'number')}
          <label className="field-block">
            <span className="field-label">Additional Stops or Special Requests (Optional)</span>
            <textarea
              className="input-field textarea-field flow-notes"
              placeholder="Example: Stop at another location, extra luggage, special event, etc."
              value={form.special_requests}
              onChange={(event) => updateField('special_requests', event.target.value)}
            />
          </label>
          <div className="flow-subgroup">
            <span>Contact details</span>
          </div>
          <div className="flow-field-row">
            {field('customer_name', 'Full Name')}
            {field('customer_phone', 'Phone Number', 'tel')}
          </div>
        </div>
      )
    }

    return (
      <div className="flow-fields">
        <div className="flow-date-row">
          {field('booking_date', 'Trip Date', 'date', undefined, getToday())}
          {field('pickup_time', 'Pickup Time', 'time')}
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <>
        <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
        <main className="scheduled-shell flow-shell">
          <section className="scheduled-card scheduled-success">
            <p className="eyebrow">Request received</p>
            <h1>Booking Request Received</h1>
            <p>Your Pakyawan / Umbak request has been submitted.</p>
            <p>Our team will review your trip details, vehicle availability, and pricing. Final pricing will be confirmed before your booking is accepted.</p>
            <button type="button" className="primary-action" onClick={onBack}>
              Back to Ride Booking
            </button>
          </section>
        </main>
      </>
    )
  }

  const stepTitles: Record<number, { title: string; hint: string }> = {
    1: { title: 'Trip schedule', hint: 'When should we pick you up?' },
    2: { title: 'Route & group', hint: "Where are you going, and who's coming?" },
    3: { title: 'Trip details', hint: 'Almost there. Tell us a little more about the trip.' },
  }

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <main className="scheduled-shell flow-shell">
        <section className="section-header scheduled-header">
          <p className="eyebrow">Pakyawan / Umbak</p>
          <h1>
            Going somewhere?
            <span className="hero-accent">We'll get you there.</span>
          </h1>
          <p className="subtitle">Reserve a vehicle for long-distance or out-of-town trips, family travel, and group transportation.</p>
        </section>

        <form className="scheduled-form flow-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
          <div className="flow-progress" role="presentation" aria-label={`Pakyawan progress: step ${step} of 3`}>
            {[1, 2, 3].map((number) =>
              step < number
                ? [
                    number > 1 ? <span key={`line-${number}`} className="flow-progress-line" aria-hidden="true" /> : null,
                    <span key={`step-${number}`} className="flow-progress-step">
                      0{number}
                    </span>,
                  ]
                : [
                    number > 1 ? (
                      <span key={`line-${number}`} className={`flow-progress-line${step > number ? ' is-fill' : ''}`} aria-hidden="true" />
                    ) : null,
                    <span
                      key={`step-${number}`}
                      className={`flow-progress-step${step === number ? ' is-current' : ''}${step > number ? ' is-done' : ''}`}
                      aria-current={step === number ? 'step' : undefined}
                    >
                      {step > number ? '\u2713' : `0${number}`}
                    </span>,
                  ],
            )}
          </div>

          <div className="flow-step is-current" key={step}>
            <header className="flow-step-heading">
              <span className="flow-step-number" aria-hidden="true">
                0{step}
              </span>
              <div className="flow-step-title">
                <h2>{stepTitles[step].title}</h2>
                <p>{stepTitles[step].hint}</p>
              </div>
            </header>

            {renderStep()}

            {step === 3 && submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}

            <div className="flow-actions">
              {step < 3 ? (
                <button type="submit" className="primary-action request-ride-action">
                  Continue &rarr;
                </button>
              ) : (
                <button type="submit" className="primary-action request-ride-action" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting request...' : 'Request Pakyawan \u2192'}
                </button>
              )}
              {step === 1 ? (
                <button type="button" className="flow-back" onClick={onBack}>
                  &larr; Back to Home
                </button>
              ) : (
                <button type="button" className="flow-back" onClick={() => goToStep(step - 1)}>
                  &larr; Back
                </button>
              )}
            </div>
          </div>

          {step === 3 ? (
            <div className="scheduled-pricing-note flow-final-note">
              <strong>Availability confirmed with you first.</strong>
              <span>We'll contact you to confirm availability, trip details, and pricing.</span>
            </div>
          ) : null}
        </form>
      </main>
    </>
  )
}