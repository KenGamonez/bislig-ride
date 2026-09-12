import { useRef, useState } from 'react'
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
  vehicle_type: string
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
  vehicle_type: '', vehicle_number: '', plate_number: '', driving_experience: '', operating_area: '',
  preferred_schedule: '', reason: '',
}

const initialFiles: ApplicationFileState = { driver_photo: null, drivers_license: null }

const requiredFields: Array<keyof ApplicationForm> = [
  'full_name', 'mobile_number', 'barangay', 'email', 'facebook_profile',
  'vehicle_type', 'vehicle_number', 'driving_experience', 'operating_area', 'preferred_schedule',
]

const fileLabels: Record<ApplicationFileField, string> = {
  driver_photo: "Driver's Photo",
  drivers_license: "Driver's License",
}

const applicationSteps = [
  { number: '01', label: 'About You' },
  { number: '02', label: 'Your Ride' },
  { number: '03', label: 'Verification' },
]

const stepPlans: Array<{
  fields: Array<keyof ApplicationForm>
  files: ApplicationFileField[]
  eyebrow: string
  title: string
  description: string
}> = [
  {
    fields: ['full_name', 'mobile_number', 'barangay', 'email', 'facebook_profile'],
    files: ['driver_photo'],
    eyebrow: 'Step 01',
    title: 'About You',
    description: "Tell us who you are so we know who's driving.",
  },
  {
    fields: ['vehicle_type', 'vehicle_number', 'plate_number', 'driving_experience'],
    files: ['drivers_license'],
    eyebrow: 'Step 02',
    title: 'Your Ride',
    description: "Share the details of the vehicle you'll drive on Bislig Ride.",
  },
  {
    fields: ['operating_area', 'preferred_schedule', 'reason'],
    files: [],
    eyebrow: 'Step 03',
    title: 'Verification',
    description: 'A few final details so the team can review your application.',
  },
]

const stepRequiredFields: Array<Array<keyof ApplicationForm>> = [
  ['full_name', 'mobile_number', 'barangay', 'email', 'facebook_profile'],
  ['vehicle_type', 'vehicle_number', 'driving_experience'],
  ['operating_area', 'preferred_schedule'],
]

const stepRequiredFiles: ApplicationFileField[][] = [['driver_photo'], ['drivers_license'], []]

type BecomeDriverExperienceProps = {
  view: AppViewMode
  onViewChange: (view: AppViewMode) => void
  onHome: () => void
}

export function BecomeDriverExperience({ view, onViewChange, onHome }: BecomeDriverExperienceProps) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [files, setFiles] = useState<ApplicationFileState>(initialFiles)
  const [fileErrors, setFileErrors] = useState<ApplicationFileErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  const scrollFormIntoView = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

  const validateStep = (targetStep: number) => {
    const nextErrors: FormErrors = {}
    stepRequiredFields[targetStep].forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = 'This field is required.'
    })
    if (targetStep === 0 && form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (
      targetStep === 1 &&
      form.driving_experience &&
      (!/^\d+$/.test(form.driving_experience) || Number(form.driving_experience) < 0)
    ) {
      nextErrors.driving_experience = 'Enter a valid number of years.'
    }
    setErrors(nextErrors)

    const nextFileErrors: ApplicationFileErrors = {}
    stepRequiredFiles[targetStep].forEach((field) => {
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

  const handleStepNext = () => {
    if (!validateStep(step)) {
      return
    }
    setStep((current) => Math.min(current + 1, applicationSteps.length - 1))
    scrollFormIntoView()
  }

  const handleStepBack = () => {
    if (step === 0) {
      onHome()
      return
    }
    setStep((current) => current - 1)
    scrollFormIntoView()
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
        vehicle_type: form.vehicle_type, vehicle_number: form.vehicle_number.trim(), plate_number: form.plate_number.trim() || null,
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
    <label className={`field-block file-upload-field${files[name] ? ' has-file' : ''}${fileErrors[name] ? ' has-error' : ''}`} key={name}><span className="field-label">{fileLabels[name]}{optional ? ' (Optional)' : ''}</span>
      <span className="file-upload-control">
        <input
          className="file-upload-input"
          type="file"
          accept="image/*"
          aria-invalid={fileErrors[name] ? 'true' : 'false'}
          onChange={(event) => updateFile(name, event.target.files?.[0] ?? null)}
        />
        <span className="file-upload-label">
          <span className="file-upload-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4" />
              <path d="m6 10 6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
          </span>
          <span className="file-upload-title">{files[name] ? 'File ready' : `Upload ${fileLabels[name]}`}</span>
          <span className="file-upload-copy">{files[name] ? files[name].name : (helpText ?? 'PNG, JPG, WEBP, GIF or HEIC up to 5 MB.')}</span>
          <span className="file-upload-button">{files[name] ? 'Replace file' : 'Choose image'}</span>
        </span>
      </span>
      {fileErrors[name] ? <span className="form-error-message">{fileErrors[name]}</span> : null}
    </label>
  )

  const renderProgress = () => (
    <ol className="application-progress" aria-label="Application steps">
      {applicationSteps.map((item, index) => (
        <li key={item.number} className={`application-progress-step${index === step ? ' is-active' : ''}${index < step ? ' is-complete' : ''}`}>
          <span className="application-progress-marker">
            {index < step ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 4 4L19 7" />
              </svg>
            ) : (
              <span className="application-progress-number">{item.number}</span>
            )}
          </span>
          <span className="application-progress-label">{item.label}</span>
        </li>
      ))}
    </ol>
  )

  const renderAboutYouFields = () => (
    <>
      <div className="form-row">
        {field('full_name', 'Full Name')}
        {field('mobile_number', 'Mobile Number', 'tel')}
      </div>
      <div className="form-row">
        {field('barangay', 'Barangay')}
        {field('email', 'Email Address', 'email')}
      </div>
      {field('facebook_profile', 'Facebook Account / Profile')}
      {fileField('driver_photo', false, 'PNG, JPG, WEBP, GIF or HEIC. Max 5 MB.')}
    </>
  )

  const renderYourRideFields = () => (
    <>
      <div className="form-row">
        <label className="field-block"><span className="field-label">Vehicle Type</span>
          <select className={`input-field${errors.vehicle_type ? ' has-error' : ''}`} value={form.vehicle_type} onChange={(event) => updateField('vehicle_type', event.target.value)}>
            <option value="">Select a vehicle type</option>
            <option value="Motorcycle">Motorcycle</option>
            <option value="Tricycle">Tricycle</option>
            <option value="Umbak">Umbak</option>
          </select>
          {errors.vehicle_type ? <span className="form-error-message">{errors.vehicle_type}</span> : null}
        </label>
        {field('vehicle_number', 'Vehicle / Body Number')}
      </div>
      <div className="form-row">
        {field('plate_number', 'Plate Number', 'text', true)}
        {field('driving_experience', 'Years of Driving Experience', 'number')}
      </div>
      {fileField('drivers_license', false, 'PNG, JPG, WEBP, GIF or HEIC. Max 5 MB.')}
    </>
  )

  const renderVerificationFields = () => (
    <>
      <div className="form-row">
        <label className="field-block"><span className="field-label">Preferred Operating Area</span><input className={`input-field${errors.operating_area ? ' has-error' : ''}`} value={form.operating_area} onChange={(event) => updateField('operating_area', event.target.value)} />{errors.operating_area ? <span className="form-error-message">{errors.operating_area}</span> : null}</label>
        <label className="field-block"><span className="field-label">Preferred Schedule</span><select className={`input-field${errors.preferred_schedule ? ' has-error' : ''}`} value={form.preferred_schedule} onChange={(event) => updateField('preferred_schedule', event.target.value)}><option value="">Select a schedule</option><option>Morning</option><option>Afternoon</option><option>Evening</option><option>Flexible</option></select>{errors.preferred_schedule ? <span className="form-error-message">{errors.preferred_schedule}</span> : null}</label>
      </div>
      <label className="field-block field-wide"><span className="field-label">Why are you interested in joining Bislig Ride? (Optional)</span><textarea className="input-field textarea-field" value={form.reason} onChange={(event) => updateField('reason', event.target.value)} /></label>
    </>
  )

  const renderStep = (index: number) => (
    <section className="application-step" aria-labelledby={`application-step-${index}`}>
      <div className="application-step-heading">
        <p className="eyebrow">{stepPlans[index].eyebrow}</p>
        <h2 id={`application-step-${index}`}>{stepPlans[index].title}</h2>
        <p>{stepPlans[index].description}</p>
      </div>
      <div className="form-grid application-form-grid">
        {index === 0 ? renderAboutYouFields() : null}
        {index === 1 ? renderYourRideFields() : null}
        {index === 2 ? renderVerificationFields() : null}
      </div>
      {index === 0 ? <p className="application-note upload-privacy-note">Your uploaded documents are only used for driver application verification and review.</p> : null}
    </section>
  )

  const header = <AppHeader view={view} onViewChange={onViewChange} primaryLabel="My Rides" onPrimaryAction={() => onViewChange('Rider')} />

  if (submitted) {
    return <>{header}<main className="application-shell"><section className="application-card application-success">
      <p className="eyebrow">Application received</p><h1>Thank you for your interest in Bislig Ride!</h1>
      <p>We've received your application. Our team will review your information and contact you regarding the next steps.</p>
      <button type="button" className="primary-action" onClick={onHome}>Return to Bislig Ride</button>
    </section></main></>
  }

  return <>{header}<main className="application-shell">
    <section className="section-header application-header">
      <p className="eyebrow">Driver partnership</p>
      <h1>Become a <span className="hero-accent">Bislig Ride Driver</span></h1>
      <p className="subtitle">Join the drivers helping people move around Bislig City. Complete your application and we'll review your details.</p>
      <p className="application-intro">Submitting this form is an expression of interest. It does not automatically create an account or guarantee acceptance.</p>
      <p className="application-steps-pill">Application — 3 steps</p>
    </section>
    <form className="application-form" onSubmit={handleSubmit} noValidate ref={formRef}>
      {renderProgress()}
      {renderStep(step)}
      {submitError ? <p className="form-error-message submit-error">{submitError}</p> : null}
      <div className="application-step-nav">
        <button type="button" className="secondary-action application-back" onClick={handleStepBack}>{step === 0 ? '← Back to Bislig Ride' : '← Back'}</button>
        {step === applicationSteps.length - 1 ? (
          <button type="submit" className="primary-action request-ride-action application-submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting application...' : 'Submit Application'}</button>
        ) : (
          <button type="button" className="primary-action application-continue" onClick={handleStepNext}>Continue</button>
        )}
      </div>
      {step === applicationSteps.length - 1 ? <p className="application-reassurance">Your application will be reviewed by the Bislig Ride team.</p> : null}
    </form>
  </main></>
}