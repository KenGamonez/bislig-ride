import { useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { createDriverApplication } from '../lib/driverApplications'
import {
  buildApplicationFilePaths,
  removeApplicationFile,
  uploadApplicationFile,
  validateApplicationImage,
} from '../lib/driverApplicationFiles'
import type { DriverApplicationInsert } from '../types/driverApplication'

type ApplicationForm = {
  full_name: string
  mobile_number: string
  barangay: string
  email: string
  facebook_profile: string
  vehicle_number: string
  plate_number: string
  driving_experience: string
  operating_area: string
  preferred_schedule: string
  reason: string
}

type ApplicationFileField = 'driver_photo' | 'drivers_license'
type ApplicationFileState = Record<ApplicationFileField, File | null>
type ApplicationFileErrors = Partial<Record<ApplicationFileField, string>>

type FormErrors = Partial<Record<keyof ApplicationForm, string>>

const initialForm: ApplicationForm = {
  full_name: '', mobile_number: '', barangay: '', email: '', facebook_profile: '',
  vehicle_number: '', plate_number: '', driving_experience: '', operating_area: '',
  preferred_schedule: '', reason: '',
}

const initialFiles: ApplicationFileState = { driver_photo: null, drivers_license: null }

const requiredFields: Array<keyof ApplicationForm> = [
  'full_name', 'mobile_number', 'barangay', 'email', 'facebook_profile',
  'vehicle_number', 'driving_experience', 'operating_area', 'preferred_schedule',
]

const fileLabels: Record<ApplicationFileField, string> = {
  driver_photo: "Driver's Photo",
  drivers_license: "Driver's License",
}

type BecomeDriverExperienceProps = {
  view: AppViewMode
  onViewChange: (view: AppViewMode) => void
  onHome: () => void
}

export function BecomeDriverExperience({ view, onViewChange, onHome }: BecomeDriverExperienceProps) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [files, setFiles] = useState<ApplicationFileState>(initialFiles)
  const [fileErrors, setFileErrors] = useState<ApplicationFileErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const updateField = (field: keyof ApplicationForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const updateFile = (field: ApplicationFileField, file: File | null) => {
    setFiles((current) => ({ ...current, [field]: file }))

    if (!file) {
      setFileErrors((current) => ({ ...current, [field]: 'This file is required.' }))
      return
    }

    const validation = validateApplicationImage(file)
    if (!validation.valid) {
      setFileErrors((current) => ({ ...current, [field]: validation.message }))
      return
    }

    setFileErrors((current) => ({ ...current, [field]: undefined }))
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

    const nextFileErrors: ApplicationFileErrors = {}
    ;(Object.keys(files) as ApplicationFileField[]).forEach((field) => {
      const file = files[field]
      if (!file) {
        nextFileErrors[field] = 'This file is required.'
        return
      }
      const validation = validateApplicationImage(file)
      if (!validation.valid) nextFileErrors[field] = validation.message
    })
    setFileErrors(nextFileErrors)

    return Object.keys(nextErrors).length === 0 && Object.keys(nextFileErrors).length === 0
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate() || isSubmitting) return

    const applicationId = crypto.randomUUID()
    const photo = files.driver_photo
    const license = files.drivers_license
    if (!photo || !license) return

    const { photoPath, licensePath } = buildApplicationFilePaths(applicationId, photo, license)

    setIsSubmitting(true)
    setSubmitError('')
    let photoUploaded = false
    let licenseUploaded = false
    try {
      await uploadApplicationFile(photoPath, photo)
      photoUploaded = true
      await uploadApplicationFile(licensePath, license)
      licenseUploaded = true

      const application: DriverApplicationInsert = {
        full_name: form.full_name.trim(), mobile_number: form.mobile_number.trim(), barangay: form.barangay.trim(),
        email: form.email.trim(), facebook_profile: form.facebook_profile.trim(),
        vehicle_number: form.vehicle_number.trim(), plate_number: form.plate_number.trim() || null,
        driving_experience: Number(form.driving_experience), operating_area: form.operating_area.trim(),
        preferred_schedule: form.preferred_schedule, reason: form.reason.trim() || null,
        driver_photo_path: photoPath, drivers_license_path: licensePath,
      }
      await createDriverApplication(application)
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit driver application:', error)

      if (photoUploaded) await removeApplicationFile(photoPath)
      if (licenseUploaded) await removeApplicationFile(licensePath)

      setSubmitError('We could not submit your application right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const field = (name: keyof ApplicationForm, label: string, type = 'text', optional = false) => (
    <label className="field-block" key={name}><span className="field-label">{label}{optional ? ' (Optional)' : ''}</span>
      <input className={`input-field${errors[name] ? ' has-error' : ''}`} type={type} value={form[name]} onChange={(event) => updateField(name, event.target.value)} />
      {errors[name] ? <span className="form-error-message">{errors[name]}</span> : null}
    </label>
  )

  const fileField = (name: ApplicationFileField, optional = false, helpText?: string) => (
    <label className={`field-block file-upload-field${fileErrors[name] ? ' has-error' : ''}`} key={name}><span className="field-label">{fileLabels[name]}{optional ? ' (Optional)' : ''}</span>
      <span className="file-upload-control">
        <input
          className="file-upload-input"
          type="file"
          accept="image/*"
          aria-invalid={fileErrors[name] ? 'true' : 'false'}
          onChange={(event) => updateFile(name, event.target.files?.[0] ?? null)}
        />
        <span className="file-upload-label">
          <span className="file-upload-button">{files[name] ? 'Replace file' : 'Choose image'}</span>
          <span className="file-upload-name">{files[name] ? files[name].name : 'No file selected'}</span>
        </span>
      </span>
      {helpText ? <span className="field-note file-upload-help">{helpText}</span> : null}
      {fileErrors[name] ? <span className="form-error-message">{fileErrors[name]}</span> : null}
    </label>
  )

  const header = <AppHeader view={view} onViewChange={onViewChange} primaryLabel="My Rides" onPrimaryAction={() => onViewChange('Rider')} />

  if (submitted) {
    return <>{header}<main className="application-shell"><section className="application-card success-state">
      <p className="section-label">Application received</p><h1>Thank you for your interest in Bislig Ride!</h1>
      <p>We've received your application. Our team will review your information and contact you regarding the next steps.</p>
      <button type="button" className="primary-action" onClick={onHome}>Return to Bislig Ride</button>
    </section></main></>
  }

  return <>{header}<main className="application-shell"><section className="application-card">
    <button type="button" className="back-link" onClick={onHome}>← Back to Bislig Ride</button>
    <div className="section-header"><p className="eyebrow">Driver interest application</p><h1>Become a Bislig Ride Driver</h1>
      <p className="subtitle">Have a tricycle and want to be part of Bislig Ride? Submit your information below and we'll contact you about becoming a driver.</p>
      <p className="application-note">Submitting this form is an expression of interest. It does not automatically create an account or guarantee acceptance.</p>
    </div>
    <form className="application-form" onSubmit={handleSubmit} noValidate>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">01</span><h2>Personal Information</h2></div><div className="form-grid">{field('full_name', 'Full Name')}{field('mobile_number', 'Mobile Number', 'tel')}{field('barangay', 'Barangay')}{field('email', 'Email Address', 'email')}{field('facebook_profile', 'Facebook Account / Profile')}{fileField('driver_photo', false, 'Accepted image formats: JPG, PNG, WEBP, GIF, HEIC. Maximum 5 MB.')}</div><p className="application-note upload-privacy-note">Your uploaded documents are only used for driver application verification and review.</p></section>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">02</span><h2>Vehicle Information</h2></div><div className="form-grid">{field('vehicle_number', 'Vehicle / Body Number')}{field('plate_number', 'Plate Number', 'text', true)}{field('driving_experience', 'Years of Driving Experience', 'number')}{fileField('drivers_license', false, 'Accepted image formats: JPG, PNG, WEBP, GIF, HEIC. Maximum 5 MB.')}</div></section>
      <section className="application-section"><div className="application-section-heading"><span className="application-section-number">03</span><h2>Additional Information</h2></div><div className="form-grid"><label className="field-block"><span className="field-label">Preferred Operating Area</span><input className={`input-field${errors.operating_area ? ' has-error' : ''}`} value={form.operating_area} onChange={(event) => updateField('operating_area', event.target.value)} />{errors.operating_area ? <span className="form-error-message">{errors.operating_area}</span> : null}</label>
        <label className="field-block"><span className="field-label">Preferred Schedule</span><select className={`input-field${errors.preferred_schedule ? ' has-error' : ''}`} value={form.preferred_schedule} onChange={(event) => updateField('preferred_schedule', event.target.value)}><option value="">Select a schedule</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Flexible</option></select>{errors.preferred_schedule ? <span className="form-error-message">{errors.preferred_schedule}</span> : null}</label>
        <label className="field-block field-wide"><span className="field-label">Why are you interested in joining Bislig Ride? (Optional)</span><textarea className="input-field textarea-field" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} /></label></div></section>
      {submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}<button type="submit" className="primary-action" disabled={isSubmitting}>{isSubmitting ? 'Submitting application...' : 'Submit application'}</button>
    </form>
  </section></main></>
}
