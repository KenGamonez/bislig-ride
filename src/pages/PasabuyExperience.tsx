import { useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'

const routeToView = (nextView: AppViewMode) => {
  try {
    window.sessionStorage.setItem('bislig-ride-requested-view', nextView)
  } catch {
    // sessionStorage unavailable â€” the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

type PasabuyForm = {
  item_category: string
  item_details: string
  pickup_area: string
  delivery_address: string
  preferred_date: string
  preferred_time: string
  customer_name: string
  customer_phone: string
}

type FormErrors = Partial<Record<keyof PasabuyForm, string>>

const initialForm: PasabuyForm = {
  item_category: '',
  item_details: '',
  pickup_area: '',
  delivery_address: '',
  preferred_date: '',
  preferred_time: '',
  customer_name: '',
  customer_phone: '',
}

const getToday = () => {
  const today = new Date()
  const offset = today.getTimezoneOffset() * 60000
  return new Date(today.getTime() - offset).toISOString().split('T')[0]
}

const categories: { value: string; label: string; icon: React.ReactNode }[] = [
  {
    value: 'Groceries',
    label: 'Groceries',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    value: 'Food',
    label: 'Food',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
        <path d="M7 2v20" />
        <path d="M21 15V2a5 5 0 0 0-5 5v6h5Z" />
        <path d="M21 15v7" />
      </svg>
    ),
  },
  {
    value: 'Pharmacy',
    label: 'Pharmacy',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h5v5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2Z" />
      </svg>
    ),
  },
  {
    value: 'Other',
    label: 'Other',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
]

export function PasabuyExperience({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const cardRef = useRef<HTMLFormElement>(null)

  const updateField = (name: keyof PasabuyForm, value: string) => {
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (!form.item_category.trim()) {
        nextErrors.item_category = 'Please choose a category.'
      }
    }

    if (target === 2) {
      if (!form.pickup_area.trim()) nextErrors.pickup_area = 'This field is required.'
      if (!form.delivery_address.trim()) nextErrors.delivery_address = 'This field is required.'
      if (!form.preferred_date.trim()) nextErrors.preferred_date = 'This field is required.'
      if (!form.preferred_time.trim()) nextErrors.preferred_time = 'This field is required.'
    }

    if (target === 3) {
      const phone = form.customer_phone.trim()
      if (!form.customer_name.trim()) nextErrors.customer_name = 'This field is required.'
      if (!phone) {
        nextErrors.customer_phone = 'This field is required.'
      } else if (!/^[0-9+\-\s()]+$/.test(phone)) {
        nextErrors.customer_phone = 'Enter a valid phone number.'
      }
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
    if (!validateStep(3)) return
    setSubmitted(true)
  }

  const field = (
    name: keyof PasabuyForm,
    label: string,
    type: 'text' | 'tel' | 'date' | 'time' = 'text',
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
          {field('pickup_area', 'Shop at', 'text', 'Example: Bislig Public Market')}
          {field('delivery_address', 'Delivery Address')}
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
          {field('customer_name', 'Full Name')}
          {field('customer_phone', 'Phone Number', 'tel')}
        </div>
      )
    }

    return (
      <div className="flow-fields">
        <div role="group" aria-label="Choose a category">
          <div className="pasabuy-category-grid">
            {categories.map((category) => {
              const selected = form.item_category === category.value
              return (
                <button
                  type="button"
                  key={category.value}
                  className={`pasabuy-category${selected ? ' is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => updateField('item_category', category.value)}
                >
                  <span className="pasabuy-category-icon" aria-hidden="true">
                    {category.icon}
                  </span>
                  <span className="pasabuy-category-label">{category.label}</span>
                  <span className="pasabuy-category-check" aria-hidden="true"></span>
                </button>
              )
            })}
          </div>
          {errors.item_category ? (
            <span className="field-error pasabuy-category-error">{errors.item_category}</span>
          ) : null}
        </div>
        <label className="field-block">
          <span className="field-label">Item details (Optional)</span>
          <textarea
            className={`input-field textarea-field flow-notes${errors.item_details ? ' has-error' : ''}`}
            placeholder="Example: 2 kilos of rice, bath soap, specific brand..."
            value={form.item_details}
            onChange={(event) => updateField('item_details', event.target.value)}
          />
          {errors.item_details ? <span className="field-error">{errors.item_details}</span> : null}
        </label>
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
            <h1>Pasabuy Request Received</h1>
            <p>Our team will confirm item availability and pricing with you before your request is finalized.</p>
            <button type="button" className="primary-action" onClick={onBack}>
              Back to Home
            </button>
          </section>
        </main>
      </>
    )
  }

  const stepTitles: Record<number, { title: string; hint: string }> = {
    1: { title: 'What do you need?', hint: "Tell us what you'd like us to shop for." },
    2: { title: 'Where & when?', hint: 'Tell us where to shop and where to deliver.' },
    3: { title: 'Almost there', hint: "We'll use this to confirm your Pasabuy request." },
  }

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel="My Rides" onPrimaryAction={onBack} />
      <main className="scheduled-shell flow-shell">
        <section className="section-header scheduled-header pasabuy-hero">
          <p className="eyebrow">Pasabuy</p>
          <h1>
            Need something?
            <span className="hero-accent">We'll get it for you.</span>
          </h1>
          <p className="subtitle">Tell us what you need and where to get it. We'll contact you to confirm the details.</p>
          <p className="pasabuy-descriptor">Shop &middot; Buy &middot; Deliver</p>
        </section>

        <form className="scheduled-form flow-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
          <div className="flow-progress" role="presentation" aria-label={`Pasabuy progress: step ${step} of 3`}>
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
                  Request Pasabuy &rarr;
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
              <strong>We confirm before we shop.</strong>
              <span>We'll contact you to confirm the request, estimated item cost, and delivery details.</span>
            </div>
          ) : null}
        </form>
      </main>
    </>
  )
}