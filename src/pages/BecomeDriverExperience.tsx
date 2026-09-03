import { useState } from 'react'
import { createDriverApplication } from '../lib/driverApplications'
import type { DriverApplicationInsert } from '../types/driverApplication'

type ApplicationForm = {
  full_name: string
  mobile_number: string
  barangay: string
  email: string
  vehicle_number: string
  plate_number: string
  driving_experience: string
  operating_area: string
  preferred_schedule: string
  reason: string
  contact_preference: string
}

type FormErrors = Partial<Record<keyof ApplicationForm, string>>

const initialForm: ApplicationForm = {
  full_name: '', mobile_number: '', barangay: '', email: '', vehicle_number: '', plate_number: '',
  driving_experience: '', operating_area: '', preferred_schedule: '', reason: '', contact_preference: '',
}

const requiredFields: Array<keyof ApplicationForm> = [
  'full_name', 'mobile_number', 'barangay', 'vehicle_number', 'driving_experience',
  'operating_area', 'preferred_schedule', 'contact_preference',
]

export function BecomeDriverExperience({ onHome }: { onHome: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const updateField = (field: keyof ApplicationForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: FormErrors = {}
    requiredFields.forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = 'This field is required.'
    })
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = 'Enter a valid email address.'
    if (form.driving_experience && (!/^\d+$/.test(form.driving_experience) || Number(form.driving_experience) < 0)) {
      nextErrors.driving_experience = 'Enter a valid number of years.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate() || isSubmitting) return
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const application: DriverApplicationInsert = {
        full_name: form.full_name.trim(), mobile_number: form.mobile_number.trim(), barangay: form.barangay.trim(),
        email: form.email.trim() || null, vehicle_number: form.vehicle_number.trim(), plate_number: form.plate_number.trim() || null,
        driving_experience: Number(form.driving_experience), operating_area: form.operating_area.trim(),
        preferred_schedule: form.preferred_schedule, reason: form.reason.trim() || null, contact_preference: form.contact_preference,
      }
      await createDriverApplication(application)
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit driver application:', error)
      setSubmitError('We could not submit your application right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submitted) {
    return <main className="application-shell"><section className="application-card success-state">
      <p className="section-label">Application received</p><h1>Thank you for your interest in Bislig Ride!</h1>
      <p>We've received your application. Our team will review your information and contact you regarding the next steps.</p>
      <button type="button" className="primary-action" onClick={onHome}>Return to Bislig Ride</button>
    </section></main>
  }

  const field = (name: keyof ApplicationForm, label: string, type = 'text', optional = false) => (
    <label className="field-block" key={name}><span className="field-label">{label}{optional ? ' (Optional)' : ''}</span>
      <input className={`input-field${errors[name] ? ' has-error' : ''}`} type={type} value={form[name]} onChange={(event) => updateField(name, event.target.value)} />
      {errors[name] ? <span className="form-error-message">{errors[name]}</span> : null}
    </label>
  )

  return <main className="application-shell"><section className="application-card">
    <button type="button" className="back-link" onClick={onHome}>← Back to Bislig Ride</button>
    <div className="section-header"><p className="eyebrow">Driver interest application</p><h1>Become a Bislig Ride Driver</h1>
      <p className="subtitle">Have a tricycle and want to be part of Bislig Ride? Submit your information below and we'll contact you about becoming a driver.</p>
      <p className="application-note">Submitting this form is an expression of interest. It does not automatically create an account or guarantee acceptance.</p>
    </div>
    <form className="application-form" onSubmit={handleSubmit} noValidate>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">01</span><h2>Personal Information</h2></div><div className="form-grid">{field('full_name', 'Full Name')}{field('mobile_number', 'Mobile Number', 'tel')}{field('barangay', 'Barangay')}{field('email', 'Email Address', 'email', true)}</div></section>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">02</span><h2>Vehicle Information</h2></div><div className="form-grid">{field('vehicle_number', 'Vehicle / Body Number')}{field('plate_number', 'Plate Number', 'text', true)}{field('driving_experience', 'Years of Driving Experience', 'number')}</div></section>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">03</span><h2>Additional Information</h2></div><div className="form-grid"><label className="field-block"><span className="field-label">Preferred Operating Area</span><input className={`input-field${errors.operating_area ? ' has-error' : ''}`} value={form.operating_area} onChange={(event) => updateField('operating_area', event.target.value)} />{errors.operating_area ? <span className="form-error-message">{errors.operating_area}</span> : null}</label>
        <label className="field-block"><span className="field-label">Preferred Schedule</span><select className={`input-field${errors.preferred_schedule ? ' has-error' : ''}`} value={form.preferred_schedule} onChange={(event) => updateField('preferred_schedule', event.target.value)}><option value="">Select a schedule</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Flexible</option></select>{errors.preferred_schedule ? <span className="form-error-message">{errors.preferred_schedule}</span> : null}</label>
        <label className="field-block field-wide"><span className="field-label">Why are you interested in joining Bislig Ride? (Optional)</span><textarea className="input-field textarea-field" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} /></label></div></section>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">04</span><h2>Contact Preference</h2></div><div className="choice-row">{['Call', 'SMS', 'Facebook Messenger'].map((option) => <label className="choice-option" key={option}><input type="radio" name="contact-preference" value={option} checked={form.contact_preference === option} onChange={(event) => updateField('contact_preference', event.target.value)} />{option}</label>)}</div>{errors.contact_preference ? <span className="form-error-message">{errors.contact_preference}</span> : null}</section>
      {submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}<button type="submit" className="primary-action" disabled={isSubmitting}>{isSubmitting ? 'Submitting application...' : 'Submit application'}</button>
    </form>
  </section></main>
}