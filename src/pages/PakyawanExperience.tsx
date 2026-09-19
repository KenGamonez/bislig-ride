import { useEffect, useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { confirmPakyawanBooking, createPakyawanBooking, getPakyawanBooking } from '../lib/scheduledBookings'
import { pakyawanTripTypes, type PakyawanBooking, type PakyawanTripType } from '../types/scheduledBooking'
import { formatCentavos } from '../lib/fare'
import { useLanguage } from '../lib/i18n'

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
  const { t } = useLanguage()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [step, setStep] = useState(1)
  const cardRef = useRef<HTMLFormElement>(null)
  const [createdBooking, setCreatedBooking] = useState<{ id: string; accessToken: string } | null>(null)
  const [trackedBooking, setTrackedBooking] = useState<PakyawanBooking | null>(null)
  const [trackingError, setTrackingError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')

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
      if (!form[field].trim()) nextErrors[field] = t('err.required')
    })
    if (form.booking_date && form.booking_date < getToday()) nextErrors.booking_date = t('pak.futureDate')
    if (form.passengers && (!/^\d+$/.test(form.passengers) || Number(form.passengers) < 1)) nextErrors.passengers = t('pak.onePassenger')
    if (form.estimated_hours && (!/^\d+$/.test(form.estimated_hours) || Number(form.estimated_hours) < 1)) nextErrors.estimated_hours = t('pak.durationHours')
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (!form.booking_date.trim()) {
        nextErrors.booking_date = t('err.required')
      } else if (form.booking_date < getToday()) {
        nextErrors.booking_date = t('pak.futureDate')
      }
      if (!form.pickup_time.trim()) nextErrors.pickup_time = t('err.required')
    }

    if (target === 2) {
      if (!form.pickup_location.trim()) nextErrors.pickup_location = t('err.required')
      if (!form.destination.trim()) nextErrors.destination = t('err.required')
      if (!form.trip_type.trim()) nextErrors.trip_type = t('err.required')
      const passengers = form.passengers.trim()
      if (!passengers) {
        nextErrors.passengers = t('err.required')
      } else if (!/^\d+$/.test(passengers) || Number(passengers) < 1) {
        nextErrors.passengers = t('pak.onePassenger')
      }
    }

    if (target === 3) {
      if (form.estimated_hours && (!/^\d+$/.test(form.estimated_hours) || Number(form.estimated_hours) < 1)) {
        nextErrors.estimated_hours = t('pak.durationHours')
      }
      if (!form.customer_name.trim()) nextErrors.customer_name = t('err.required')
      if (!form.customer_phone.trim()) nextErrors.customer_phone = t('err.required')
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
      const created = await createPakyawanBooking({
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
      try {
        window.localStorage.setItem(`bislig-ride-pakyawan-${created.id}`, created.access_token)
      } catch {
        // Private browsing or disabled storage — tracking still works for this session.
      }
      const initialTracked = { ...created } as PakyawanBooking & { access_token?: string }
      delete initialTracked.access_token
      setCreatedBooking({ id: created.id, accessToken: created.access_token })
      setTrackedBooking(initialTracked)
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit pakyawan booking:', error)
      setSubmitError(t('pak.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const refreshBookingStatus = async () => {
    if (!createdBooking || isRefreshing) {
      return
    }

    setIsRefreshing(true)
    setTrackingError('')

    try {
      const latest = await getPakyawanBooking(createdBooking.id, createdBooking.accessToken)
      setTrackedBooking(latest)
    } catch (error) {
      console.error('Unable to refresh Pakyawan booking status:', error)
      setTrackingError(t('pak.trackFailed'))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (!submitted || !createdBooking) {
      return
    }

    const status = trackedBooking?.status
    if (status !== undefined && status !== 'pending' && status !== 'quoted') {
      return
    }

    void refreshBookingStatus()
    const timer = window.setInterval(() => {
      void refreshBookingStatus()
    }, 10000)

    return () => {
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, createdBooking, trackedBooking?.status])

  const handleConfirmBooking = async () => {
    if (isConfirming || !createdBooking || !trackedBooking || trackedBooking.status !== 'quoted') {
      return
    }

    setIsConfirming(true)
    setConfirmError('')

    try {
      const confirmed = await confirmPakyawanBooking(createdBooking.id, createdBooking.accessToken)
      setTrackedBooking(confirmed)
    } catch (error) {
      console.error('Unable to confirm Pakyawan booking:', error)
      setConfirmError(error instanceof Error && error.message ? error.message : t('pak.confirmFailed'))
    } finally {
      setIsConfirming(false)
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
            {field('pickup_location', t('pak.pickupLocation'))}
            {field('destination', t('pak.destination'))}
          </div>
          <div className="flow-field-row">
            <label className="field-block">
              <span className="field-label">{t('pak.numPassengers')}</span>
              <div className={`flow-stepper${errors.passengers ? ' has-error' : ''}`}>
                <button type="button" aria-label={t('pak.decreasePassengers')} onClick={() => adjustPassengers(-1)}>
                  &minus;
                </button>
                <input
                  aria-label={t('pak.passengerCountAria')}
                  inputMode="numeric"
                  type="text"
                  value={form.passengers}
                  onChange={(event) => updateField('passengers', event.target.value.replace(/[^0-9]/g, ''))}
                />
                <button type="button" aria-label={t('pak.increasePassengers')} onClick={() => adjustPassengers(1)}>
                  +
                </button>
              </div>
              {errors.passengers ? <span className="field-error">{errors.passengers}</span> : null}
            </label>
            <label className="field-block">
              <span className="field-label">{t('pak.tripType')}</span>
              <select
                className={`input-field${errors.trip_type ? ' has-error' : ''}`}
                value={form.trip_type}
                onChange={(event) => updateField('trip_type', event.target.value)}
              >
                <option value="">{t('pak.selectTripType')}</option>
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
          {field('estimated_hours', t('pak.estimatedHours'), 'number')}
          <label className="field-block">
            <span className="field-label">{t('pak.specialRequests')}</span>
            <textarea
              className="input-field textarea-field flow-notes"
              placeholder={t('pak.specialRequestsPlaceholder')}
              value={form.special_requests}
              onChange={(event) => updateField('special_requests', event.target.value)}
            />
          </label>
          <div className="flow-subgroup">
            <span>{t('pak.contactDetails')}</span>
          </div>
          <div className="flow-field-row">
            {field('customer_name', t('pak.fullName'))}
            {field('customer_phone', t('pak.phoneNumber'), 'tel')}
          </div>
        </div>
      )
    }

    return (
      <div className="flow-fields">
        <div className="flow-date-row">
          {field('booking_date', t('pak.tripDate'), 'date', undefined, getToday())}
          {field('pickup_time', t('pak.pickupTime'), 'time')}
        </div>
      </div>
    )
  }

  if (submitted) {
    const status = trackedBooking?.status
    const quotedCents = trackedBooking && typeof trackedBooking.price_cents === 'number' && Number.isFinite(trackedBooking.price_cents)
      ? trackedBooking.price_cents
      : null

    return (
      <>
        <AppHeader view="Rider" onViewChange={routeToView} primaryLabel={t('nav.myRides')} onPrimaryAction={onBack} />
        <main className="scheduled-shell flow-shell">
          <section className="scheduled-card scheduled-success">
            <p className="eyebrow">{status === 'quoted' ? t('pak.quoteReady') : status === 'confirmed' ? t('pak.bookingConfirmed') : t('pak.receivedEyebrow')}</p>
            <h1>{status === 'quoted' ? t('pak.quoteReady') : status === 'confirmed' ? t('pak.bookingConfirmed') : t('pak.receivedTitle')}</h1>
            {status === 'confirmed' ? (
              <p>{t('pak.confirmedBody')}</p>
            ) : (
              <>
                <p>{t('pak.receivedBody1')}</p>
                <p>{t('pak.receivedBody2')}</p>
              </>
            )}
            {createdBooking ? (
              <p className="booking-ref">{t('pak.bookingRef')}: {createdBooking.id.slice(0, 8)}…</p>
            ) : null}
            <div className="flow-fields">
              <div className="flow-field-row">
                <div className="field-block"><span className="field-label">{t('pak.tripDate')}</span><strong>{form.booking_date || '—'}</strong></div>
                <div className="field-block"><span className="field-label">{t('pak.pickupTime')}</span><strong>{form.pickup_time || '—'}</strong></div>
              </div>
              <div className="flow-field-row">
                <div className="field-block"><span className="field-label">{t('pak.pickupLocation')}</span><strong>{form.pickup_location || '—'}</strong></div>
                <div className="field-block"><span className="field-label">{t('pak.destination')}</span><strong>{form.destination || '—'}</strong></div>
              </div>
            </div>
            {quotedCents !== null ? (
              <div className="fare-box">
                <span className="field-label">{t('pak.quotedPrice')}</span>
                <strong>₱{formatCentavos(quotedCents)}</strong>
              </div>
            ) : (
              <div className="fare-box">
                <span className="field-label">{t('pak.quotedPrice')}</span>
                <strong>{t('pak.waitingQuote')}</strong>
              </div>
            )}
            {trackingError ? <p className="form-error-message submit-error">{trackingError}</p> : null}
            {status === 'quoted' ? (
              <>
                {confirmError ? <p className="form-error-message submit-error">{confirmError}</p> : null}
                <button type="button" className="primary-action request-ride-action" disabled={isConfirming} onClick={() => void handleConfirmBooking()}>
                  {isConfirming ? t('pak.confirming') : t('pak.confirmBooking')}
                </button>
              </>
            ) : null}
            <button type="button" className="secondary-action" disabled={isRefreshing} onClick={() => void refreshBookingStatus()}>
              {isRefreshing ? t('pak.checkingStatus') : t('pak.refreshStatus')}
            </button>
            <button type="button" className="primary-action" onClick={onBack}>
              {t('pak.backToRide')}
            </button>
          </section>
        </main>
      </>
    )
  }

  const stepTitles: Record<number, { title: string; hint: string }> = {
    1: { title: t('pak.step1.title'), hint: t('pak.step1.hint') },
    2: { title: t('pak.step2.title'), hint: t('pak.step2.hint') },
    3: { title: t('pak.step3.title'), hint: t('pak.step3.hint') },
  }

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel={t('nav.myRides')} onPrimaryAction={onBack} />
      <main className="scheduled-shell flow-shell">
        <section className="section-header scheduled-header">
          <p className="eyebrow">{t('pak.eyebrow')}</p>
          <h1>
            {t('pak.title1')}
            <span className="hero-accent">{t('pak.title2')}</span>
          </h1>
          <p className="subtitle">{t('pak.subtitle')}</p>
        </section>

        <form className="scheduled-form flow-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
          <div className="flow-progress" role="presentation" aria-label={t('pak.progressAria', { step, total: 3 })}>
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
                  {t('form.continue')} &rarr;
                </button>
              ) : (
                <button type="submit" className="primary-action request-ride-action" disabled={isSubmitting}>
                  {isSubmitting ? t('pak.submitting') : `${t('pak.submit')} \u2192`}
                </button>
              )}
              {step === 1 ? (
                <button type="button" className="flow-back" onClick={onBack}>
                  &larr; {t('form.backHome')}
                </button>
              ) : (
                <button type="button" className="flow-back" onClick={() => goToStep(step - 1)}>
                  &larr; {t('form.back')}
                </button>
              )}
            </div>
          </div>

          {step === 3 ? (
            <div className="scheduled-pricing-note flow-final-note">
              <strong>{t('pak.finalNoteStrong')}</strong>
              <span>{t('pak.finalNoteText')}</span>
            </div>
          ) : null}
        </form>
      </main>
    </>
  )
}
