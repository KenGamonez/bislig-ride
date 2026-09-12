import { useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'

const routeToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable — the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

type PaDeliverForm = {
  package_type: string
  package_details: string
  package_size: string
  pickup_address: string
  delivery_address: string
  preferred_date: string
  preferred_time: string
  sender_name: string
  sender_phone: string
}

type FormErrors = Partial<Record<keyof PaDeliverForm, string>>

const initialForm: PaDeliverForm = {
  package_type: '',
  package_details: '',
  package_size: '',
  pickup_address: '',
  delivery_address: '',
  preferred_date: '',
  preferred_time: '',
  sender_name: '',
  sender_phone: '',
}

const getToday = () => {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60000
  return new Date(today.getTime() - offset).toISOString().split('T')[0]
}

const packageTypes = ['Documents', 'Parcels', 'Food', 'Clothing', 'Gadgets', 'Other']

export function PaDeliverExperience({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)

  const updateField = (name: keyof PaDeliverForm, value: string) => {
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (!form.package_type.trim()) nextErrors.package_type = 'This field is required.'
      if (!form.package_size.trim()) nextErrors.package_size = 'This field is required.'
    }

    if (target === 2) {
      if (!form.pickup_address.trim()) nextErrors.pickup_address = 'This field is required.'
      if (!form.delivery_address.trim()) nextErrors.delivery_address = 'This field is required.'
      if (!form.preferred_date.trim()) nextErrors.preferred_date = 'This field is required.'
      if (!form.preferred_time.trim()) nextErrors.preferred_time = 'This field is required.'
    }

    if (target === 3) {
      const phone = form.sender_phone.trim()
      if (!form.sender_name.trim()) nextErrors.sender_name = 'This field is required.'
      if (!phone) {
        nextErrors.sender_phone = 'This field is required.'
      } else if (!/^[0-9+\-\s()]+$/.test(phone)) {
        nextErrors.sender_phone = 'Enter a valid phone number.'
      }
    }

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validate = () => {
    const nextErrors: FormErrors = {}
    const requiredFields: Array<keyof PaDeliverForm> = [
      'package_type',
      'package_size',
      'pickup_address',
      'delivery_address',
      'preferred_date',
      'preferred_time',
      'sender_name',
      'sender_phone',
    ]

    requiredFields.forEach((name) => {
      if (!form[name].trim()) nextErrors[name] = 'This field is required.'
    })

    const phone = form.sender_phone.trim()
    if (phone && !/^[0-9+\-\s()]+$/.test(phone)) {
      nextErrors.sender_phone = 'Enter a valid phone number.'
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step < 3) {
      handleContinue()
      return
    }
    if (!validate()) return
    setSubmitted(true)
  }

  const field = (
    name: keyof PaDeliverForm,
    label: string,
    type: 'text' | 'tel' | 'date' | 'time' = 'text',
    placeholder?: string,
    min?: string,
  ) => (
    <label className="field-block" key={name}>
      <span className="field-label">{label}</span>
      <input
        id={`pa-deliver-${name}`}
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

  const routeField = (
    name: 'pickup_address' | 'delivery_address',
    label: string,
    markerClass: string,
  ) => (
    <div className="pad-route-stop">
      <span className={`pad-route-dot ${markerClass}`} aria-hidden="true" />
      <label className="field-block">
        <span className="field-label">{label}</span>
        <input
          id={`pa-deliver-${name}`}
          className={`input-field${errors[name] ? ' has-error' : ''}`}
          type="text"
          placeholder="Example: Barangay, street, landmark"
          value={form[name]}
          onChange={(event) => updateField(name, event.target.value)}
        />
        {errors[name] ? <span className="field-error">{errors[name]}</span> : null}
      </label>
    </div>
  )

  const renderStep = () => {
    if (step === 2) {
      return (
        <div className="flow-fields">
          <div className="pad-route">
            {routeField('pickup_address', 'Pickup Address', 'is-pickup')}

            <div className="pad-route-leg" aria-hidden="true">
              <span className="pad-route-leg-rail" />
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="m5 12 7 7 7-7" />
              </svg>
            </div>

            {routeField('delivery_address', 'Delivery Address', 'is-delivery')}
          </div>

          <div className="flow-date-group">
            <span className="field-label">When do you need it?</span>
            <div className="flow-date-row">
              {field('preferred_date', 'Preferred Date', 'date', undefined, getToday())}
              {field('preferred_time', 'Preferred Time', 'time')}
            </div>
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div className="flow-fields">
          <div className="flow-field-row">
            {field('sender_name', 'Sender Full Name')}
            {field('sender_phone', 'Contact Number', 'tel')}
          </div>
        </div>
      )
    }

    return (
      <div className="flow-fields">
        <label className="field-block">
          <span className="field-label">Package Type</span>
          <select
            className={`input-field${errors.package_type ? ' has-error' : ''}`}
            value={form.package_type}
            onChange={(event) => updateField('package_type', event.target.value)}
          >
            <option value="">Select an option</option>
            {packageTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          {errors.package_type ? <span className="field-error">{errors.package_type}</span> : null}
        </label>

        <label className="field-block">
          <span className="field-label">Package Details (Optional)</span>
          <textarea
            className="input-field textarea-field flow-notes"
            placeholder="Example: sealed envelope, box, fragile items"
            value={form.package_details}
            onChange={(event) => updateField('package_details', event.target.value)}
          />
        </label>

        {field('package_size', 'Size or Approximate Weight', 'text', 'Example: Shoe box size')}
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
            <h1>Delivery Request Received</h1>
            <p>Our team will confirm pickup details and the delivery fee with you before the package is booked.</p>
            <button type="button" className="primary-action" onClick={onBack}>
              Back to Home
            </button>
          </section>
        </main>
      </>
    )
  }

  const stepTitles: Record<number, { title: string; hint: string }> = {
    1: { title: 'What are you sending?', hint: "Tell us about the package and roughly how big it is." },
    2: { title: 'Where should it go?', hint: 'Pickup and delivery addresses, plus your preferred schedule.' },
    3: { title: 'Who should we contact?', hint: "We'll use these details to confirm pickup and delivery with you." },
  }

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <main className="scheduled-shell flow-shell">
        <section className="section-header scheduled-header pad-hero">
          <p className="eyebrow">Pa-deliver</p>
          <h1>
            Send it.
            <span className="hero-accent">We'll take it there.</span>
          </h1>
          <p className="subtitle">
            Need to send a package across Bislig? Tell us what you're sending, where it's going, and when you need it delivered.
          </p>
          <p className="pad-descriptor">Package &middot; Pickup &middot; Delivery</p>
        </section>

        <form className="scheduled-form flow-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
          <div className="flow-progress" role="presentation" aria-label={`Pa-deliver progress: step ${step} of 3`}>
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

            <div className="flow-actions">
              {step < 3 ? (
                <button type="submit" className="primary-action request-ride-action">
                  Continue &rarr;
                </button>
              ) : (
                <button type="submit" className="primary-action request-ride-action">
                  Request Delivery &rarr;
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
              <strong>Delivery fee is confirmed after review.</strong>
              <span>Distance, package size, and urgency will be considered before the fee is confirmed.</span>
            </div>
          ) : null}
        </form>
      </main>
    </>
  )
}