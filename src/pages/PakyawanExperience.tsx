import { useState } from 'react'
import { createScheduledBooking } from '../lib/scheduledBookings'
import { scheduledBookingTripTypes, type ScheduledBookingTripType } from '../types/scheduledBooking'

type ScheduledBookingForm = {
  booking_date: string
  pickup_time: string
  pickup_location: string
  destination: string
  passengers: string
  trip_type: ScheduledBookingTripType | ''
  special_requests: string
  customer_name: string
  customer_phone: string
}

type FormErrors = Partial<Record<keyof ScheduledBookingForm, string>>

const initialForm: ScheduledBookingForm = {
  booking_date: '', pickup_time: '', pickup_location: '', destination: '', passengers: '1', trip_type: '',
  special_requests: '', customer_name: '', customer_phone: '',
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

  const updateField = (field: keyof ScheduledBookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: FormErrors = {}
    const requiredFields: Array<keyof ScheduledBookingForm> = [
      'booking_date', 'pickup_time', 'pickup_location', 'destination', 'passengers', 'trip_type', 'customer_name', 'customer_phone',
    ]
    requiredFields.forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = 'This field is required.'
    })
    if (form.booking_date && form.booking_date < getToday()) nextErrors.booking_date = 'Please choose today or a future date.'
    if (form.passengers && (!/^\d+$/.test(form.passengers) || Number(form.passengers) < 1)) nextErrors.passengers = 'Enter at least one passenger.'
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate() || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    try {
      await createScheduledBooking({
        customer_id: null,
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        booking_date: form.booking_date,
        pickup_time: form.pickup_time,
        pickup_location: form.pickup_location.trim(),
        destination: form.destination.trim(),
        passengers: Number(form.passengers),
        trip_type: form.trip_type as ScheduledBookingTripType,
        special_requests: form.special_requests.trim() || null,
      })
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit scheduled booking:', error)
      setSubmitError('We could not submit your booking request right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) return <main className="scheduled-shell"><section className="scheduled-card scheduled-success">
    <p className="eyebrow">Request received</p><h1>Booking Request Received</h1>
    <p>Your Pakyawan / Umbak request has been submitted.</p>
    <p>Our team will review your trip details, vehicle availability, and pricing. Final pricing will be confirmed before your booking is accepted.</p>
    <button type="button" className="primary-action" onClick={onBack}>Back to Ride Booking</button>
  </section></main>

  const field = (name: keyof ScheduledBookingForm, label: string, type = 'text') => <label className="field-block" key={name}>
    <span className="field-label">{label}</span><input className={`input-field${errors[name] ? ' has-error' : ''}`} type={type} value={form[name]} min={name === 'booking_date' ? getToday() : undefined} onChange={(event) => updateField(name, event.target.value)} />
    {errors[name] ? <span className="field-error">{errors[name]}</span> : null}
  </label>

  return <main className="scheduled-shell"><section className="scheduled-card">
    <button type="button" className="back-link" onClick={onBack}>← Back to Ride Booking</button>
    <div className="section-header"><p className="eyebrow">Private and scheduled transportation</p><h1>Pakyawan / Umbak</h1><p className="subtitle">Schedule a vehicle for your longer or out-of-town trip.</p><p className="scheduled-intro">Ideal for family trips, events, airport transfers, whole-day travel, and longer-distance bookings. This is a request for private transportation, not an automatic confirmation.</p></div>
    <form className="scheduled-form" onSubmit={handleSubmit} noValidate>
      <div className="scheduled-section"><div className="scheduled-section-heading"><span>01</span><h2>Trip schedule</h2></div><div className="form-grid">{field('booking_date', 'Trip Date', 'date')}{field('pickup_time', 'Pickup Time', 'time')}</div></div>
      <div className="scheduled-section"><div className="scheduled-section-heading"><span>02</span><h2>Route and group</h2></div><div className="form-grid">{field('pickup_location', 'Pickup Location')}{field('destination', 'Destination')}{field('passengers', 'Number of Passengers', 'number')}<label className="field-block"><span className="field-label">Trip Type</span><select className={`input-field${errors.trip_type ? ' has-error' : ''}`} value={form.trip_type} onChange={(event) => updateField('trip_type', event.target.value)}><option value="">Select trip type</option>{scheduledBookingTripTypes.map((type) => <option key={type}>{type}</option>)}</select>{errors.trip_type ? <span className="field-error">{errors.trip_type}</span> : null}</label></div></div>
      <div className="scheduled-section"><div className="scheduled-section-heading"><span>03</span><h2>Additional details</h2></div><label className="field-block"><span className="field-label">Additional Stops or Special Requests (Optional)</span><textarea className="input-field textarea-field" placeholder="Example: Stop at another location, extra luggage, special event, etc." value={form.special_requests} onChange={(event) => updateField('special_requests', event.target.value)} /></label></div>
      <div className="scheduled-section"><div className="scheduled-section-heading"><span>04</span><h2>Your contact information</h2></div><div className="form-grid">{field('customer_name', 'Full Name')}{field('customer_phone', 'Phone Number', 'tel')}</div></div>
      <div className="scheduled-pricing-note"><strong>Pricing is confirmed after review.</strong><span>Final pricing will depend on your route, vehicle availability, trip type, duration, and special requirements.</span></div>
      {submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}<button type="submit" className="primary-action" disabled={isSubmitting}>{isSubmitting ? 'Submitting request...' : 'Request Scheduled Booking'}</button>
    </form>
  </section></main>
}