import { useEffect, useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { PakyawanChat, PakyawanChatAlertPopup } from '../components/PakyawanChat'
import { confirmPakyawanBooking, createPakyawanBooking, getPakyawanBooking } from '../lib/scheduledBookings'
import { playChatNotification, showBrowserNotification, unlockNotificationAudio } from '../lib/notifications'
import { usePakyawanMessageAlert } from '../lib/usePakyawanMessageAlert'
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
  const [pakyawanTiming, setPakyawanTiming] = useState<'now' | 'scheduled'>('now')
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
  const [pakyawanChatOpen, setPakyawanChatOpen] = useState(false)
  const [quoteAlert, setQuoteAlert] = useState<{ amount: number } | null>(null)
  const [quoteUnread, setQuoteUnread] = useState(false)
  const [quoteBellOpen, setQuoteBellOpen] = useState(false)
  const prevQuoteSigRef = useRef<string | null>(null)

  const quoteViewedKey = (bookingId: string) => `bislig-ride-pakyawan-quoteviewed-${bookingId}`

  const syncQuoteUnread = (bookingId: string) => {
    let notified: string | null = null
    let viewed: string | null = null

    try {
      notified = window.localStorage.getItem(`bislig-ride-pakyawan-quoteseen-${bookingId}`)
      viewed = window.localStorage.getItem(quoteViewedKey(bookingId))
    } catch {
      notified = null
      viewed = null
    }

    setQuoteUnread(notified !== null && notified !== viewed)
  }

  const handleViewQuote = (bookingId: string) => {
    try {
      window.localStorage.setItem(quoteViewedKey(bookingId), window.localStorage.getItem(`bislig-ride-pakyawan-quoteseen-${bookingId}`) ?? 'seen')
    } catch {
      // Private browsing — unread clears in memory only.
    }

    setQuoteUnread(false)
    setQuoteBellOpen(false)
    document.getElementById('pak-quote-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const chatAvailable = Boolean(submitted && createdBooking && trackedBooking && trackedBooking.driver_id)
  const {
    alert: pakyawanMessageAlert,
    markChatSeen,
    dismissAlert: dismissPakyawanMessageAlert,
  } = usePakyawanMessageAlert({
    bookingId: createdBooking?.id ?? null,
    accessToken: createdBooking?.accessToken ?? null,
    chatOpen: pakyawanChatOpen,
    enabled: chatAvailable,
    notificationTitle: t('pak.newMessage'),
  })

  const updateField = (field: keyof PakyawanBookingForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const validate = () => {
    const nextErrors: FormErrors = {}
    const requiredFields: Array<keyof PakyawanBookingForm> = [
      'pickup_location', 'destination', 'passengers', 'trip_type', 'customer_name', 'customer_phone',
    ]
    requiredFields.forEach((field) => {
      if (!form[field].trim()) nextErrors[field] = t('err.required')
    })
    if (pakyawanTiming === 'scheduled') {
      if (!form.booking_date.trim()) nextErrors.booking_date = t('err.required')
      if (!form.pickup_time.trim()) nextErrors.pickup_time = t('err.required')
      if (form.booking_date.trim() && form.pickup_time.trim()) {
        const scheduled = new Date(`${form.booking_date}T${form.pickup_time}`)
        if (Number.isFinite(scheduled.getTime()) && scheduled <= new Date()) nextErrors.pickup_time = t('pak.pastDateTime')
      } else if (form.booking_date && form.booking_date < getToday()) nextErrors.booking_date = t('pak.futureDate')
    }
    if (form.passengers && (!/^\d+$/.test(form.passengers) || Number(form.passengers) < 1)) nextErrors.passengers = t('pak.onePassenger')
    if (form.estimated_hours && (!/^\d+$/.test(form.estimated_hours) || Number(form.estimated_hours) < 1)) nextErrors.estimated_hours = t('pak.durationHours')
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (pakyawanTiming === 'scheduled') {
        if (!form.booking_date.trim()) {
          nextErrors.booking_date = t('err.required')
        } else if (form.booking_date < getToday()) {
          nextErrors.booking_date = t('pak.futureDate')
        }
        if (!form.pickup_time.trim()) nextErrors.pickup_time = t('err.required')
        if (form.booking_date.trim() && form.pickup_time.trim()) {
          const scheduled = new Date(`${form.booking_date}T${form.pickup_time}`)
          if (Number.isFinite(scheduled.getTime()) && scheduled <= new Date()) nextErrors.pickup_time = t('pak.pastDateTime')
        }
      }
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
        booking_date: pakyawanTiming === 'scheduled' ? form.booking_date : null,
        pickup_time: pakyawanTiming === 'scheduled' ? form.pickup_time : null,
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
      setPakyawanChatOpen(false)
      setQuoteAlert(null)
      setQuoteUnread(false)
      setQuoteBellOpen(false)
      prevQuoteSigRef.current = null
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit pakyawan booking:', error)
      setSubmitError(t('pak.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (submitted) {
      return
    }

    let cancelled = false

    const restoreTrackedBooking = async () => {
      const prefix = 'bislig-ride-pakyawan-'
      const candidates: Array<{ id: string; token: string }> = []

      try {
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i)
          const token = key ? window.localStorage.getItem(key) : null
          if (key && key.startsWith(prefix) && token) {
            candidates.push({ id: key.slice(prefix.length), token })
          }
        }
      } catch {
        return
      }

      for (const candidate of candidates) {
        try {
          const booking = await getPakyawanBooking(candidate.id, candidate.token)
          if (cancelled) {
            return
          }

          if (
            booking.status === 'pending' ||
            booking.status === 'assigned' ||
            booking.status === 'quoted' ||
            booking.status === 'confirmed' ||
            booking.status === 'scheduled' ||
            booking.status === 'driver_on_way' ||
            booking.status === 'driver_arrived' ||
            booking.status === 'in_progress'
          ) {
            setCreatedBooking({ id: candidate.id, accessToken: candidate.token })
            setTrackedBooking(booking)
            setQuoteAlert(null)
            setQuoteBellOpen(false)
            prevQuoteSigRef.current = null
            syncQuoteUnread(candidate.id)
            setSubmitted(true)
            return
          }

          try {
            window.localStorage.removeItem(`${prefix}${candidate.id}`)
          } catch {
            // Private browsing or disabled storage — nothing to clean up.
          }
        } catch {
          try {
            window.localStorage.removeItem(`${prefix}${candidate.id}`)
          } catch {
            // Private browsing or disabled storage — nothing to clean up.
          }
        }
      }
    }

    void restoreTrackedBooking()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshBookingStatus = async (quiet = false) => {
    if (!createdBooking || isRefreshing) {
      return
    }

    // Background ticks stay silent so the page does not flicker every poll.
    if (!quiet) {
      setIsRefreshing(true)
      setTrackingError('')
    }

    try {
      const latest = await getPakyawanBooking(createdBooking.id, createdBooking.accessToken)
      setTrackedBooking((current) => {
        if (
          current &&
          current.status === latest.status &&
          current.price_cents === latest.price_cents &&
          current.driver_id === latest.driver_id &&
          current.updated_at === latest.updated_at
        ) {
          return current
        }

        return latest
      })
    } catch (error) {
      console.error('Unable to refresh Pakyawan booking status:', error)

      if (!quiet) {
        setTrackingError(t('pak.trackFailed'))
      }
    } finally {
      if (!quiet) {
        setIsRefreshing(false)
      }
    }
  }

  useEffect(() => {
    if (!submitted || !createdBooking) {
      return
    }

    const status = trackedBooking?.status
    if (
      status !== undefined &&
      status !== 'pending' &&
      status !== 'assigned' &&
      status !== 'quoted' &&
      status !== 'confirmed' &&
      status !== 'scheduled' &&
      status !== 'driver_on_way' &&
      status !== 'driver_arrived' &&
      status !== 'in_progress'
    ) {
      return
    }

    void refreshBookingStatus()
    const timer = window.setInterval(() => {
      void refreshBookingStatus(true)
    }, 10000)

    return () => {
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, createdBooking, trackedBooking?.status])

  useEffect(() => {
    if (!submitted || !createdBooking || !trackedBooking) {
      return
    }

    const price = trackedBooking.price_cents
    const sig = `${trackedBooking.id}:${trackedBooking.status}:${typeof price === 'number' ? price : ''}`
    const prevSig = prevQuoteSigRef.current
    prevQuoteSigRef.current = sig

    if (trackedBooking.status !== 'quoted' || typeof price !== 'number' || !Number.isFinite(price)) {
      return
    }

    const markerKey = `bislig-ride-pakyawan-quoteseen-${trackedBooking.id}`
    let seen: string | null = null

    try {
      seen = window.localStorage.getItem(markerKey)
    } catch {
      seen = null
    }

    if (seen === String(price)) {
      return
    }

    if (prevSig === null) {
      // First observation (e.g. reload after quote): establish the baseline
      // silently instead of announcing an old quote. The bell still reflects
      // any unviewed quote until the passenger opens it.
      try {
        window.localStorage.setItem(markerKey, String(price))
      } catch {
        // Private browsing — the in-memory signature still prevents repeats.
      }

      syncQuoteUnread(trackedBooking.id)

      return
    }

    const prevStatus = prevSig.split(':')[1]

    if (prevStatus === 'quoted') {
      return
    }

    try {
      window.localStorage.setItem(markerKey, String(price))
    } catch {
      // Private browsing — the in-memory signature still prevents repeats.
    }

    setQuoteAlert({ amount: price })
    setQuoteUnread(true)
    playChatNotification()
    showBrowserNotification(t('pak.quoteReady'), `₱${formatCentavos(price)}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, createdBooking, trackedBooking])

  const handleConfirmBooking = async () => {
    if (isConfirming || !createdBooking || !trackedBooking || trackedBooking.status !== 'quoted') {
      return
    }

    unlockNotificationAudio()
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
        <div className="flow-date-group">
          <span className="field-label">{t('pak.step1.hint')}</span>
          <div className="flow-date-row" role="group" aria-label={t('pak.step1.hint')}>
            <button
              type="button"
              className={pakyawanTiming === 'now' ? 'secondary-action compact-button active-filter' : 'secondary-action compact-button'}
              onClick={() => setPakyawanTiming('now')}
            >
              {t('pak.timingNow')}
            </button>
            <button
              type="button"
              className={pakyawanTiming === 'scheduled' ? 'secondary-action compact-button active-filter' : 'secondary-action compact-button'}
              onClick={() => setPakyawanTiming('scheduled')}
            >
              {t('pak.timingScheduled')}
            </button>
          </div>
          {pakyawanTiming === 'now' ? <p className="field-note">{t('pak.asapNote')}</p> : null}
        </div>
        {pakyawanTiming === 'scheduled' ? (
          <div className="flow-date-row">
            {field('booking_date', t('pak.tripDate'), 'date', undefined, getToday())}
            {field('pickup_time', t('pak.pickupTime'), 'time')}
          </div>
        ) : null}
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
            <p className="eyebrow">{status === 'quoted' ? t('pak.quoteReady') : status === 'assigned' ? t('pak.driverFound') : status === 'driver_on_way' ? t('pak.driverOnWay') : status === 'driver_arrived' ? t('pak.driverArrived') : status === 'in_progress' ? t('pak.tripInProgress') : status === 'completed' ? t('pak.tripCompleted') : status === 'confirmed' || status === 'scheduled' ? t('pak.bookingConfirmed') : t('pak.receivedEyebrow')}</p>
            <h1>{status === 'quoted' ? t('pak.quoteReady') : status === 'assigned' ? t('pak.assignedTitle') : status === 'driver_on_way' ? t('pak.driverOnWay') : status === 'driver_arrived' ? t('pak.driverArrived') : status === 'in_progress' ? t('pak.tripInProgress') : status === 'completed' ? t('pak.tripCompleted') : status === 'confirmed' || status === 'scheduled' ? t('pak.bookingConfirmed') : t('pak.receivedTitle')}</h1>
            {status === 'confirmed' || status === 'scheduled' ? (
              <>
                <p>{t('pak.confirmedBody')}</p>
                <p className="booking-status">{t('pak.statusLabel')}: {t('pak.statusScheduled')}</p>
              </>
            ) : status === 'driver_on_way' || status === 'driver_arrived' || status === 'in_progress' || status === 'completed' ? (
              <p className="booking-status">{t('pak.statusLabel')}: {status === 'driver_on_way' ? t('pak.driverOnWay') : status === 'driver_arrived' ? t('pak.driverArrived') : status === 'in_progress' ? t('pak.tripInProgress') : t('pak.tripCompleted')}</p>
            ) : status === 'assigned' ? (
              <p>{t('pak.assignedBody')}</p>
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
              <div className="fare-box" id="pak-quote-box">
                <span className="field-label">{t('pak.quotedPrice')}</span>
                <strong>₱{formatCentavos(quotedCents)}</strong>
              </div>
            ) : (
              <div className="fare-box">
                <span className="field-label">{t('pak.quotedPrice')}</span>
                <strong>{status === 'assigned' ? t('pak.waitingDriverPrice') : t('pak.waitingQuote')}</strong>
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
            {createdBooking && trackedBooking && trackedBooking.driver_id ? (
              <>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => {
                    unlockNotificationAudio()
                    setPakyawanChatOpen((current) => {
                      if (!current) {
                        void markChatSeen()
                      }

                      return !current
                    })
                  }}
                >
                  {pakyawanChatOpen ? t('chat.closeAria') : t('chat.titleWith', { name: t('chat.roleDriver') })}
                </button>
                {pakyawanChatOpen ? (
                  <PakyawanChat
                    bookingId={trackedBooking.id}
                    senderRole="passenger"
                    accessToken={createdBooking.accessToken}
                    otherPartyName={t('chat.roleDriver')}
                    onClose={() => setPakyawanChatOpen(false)}
                  />
                ) : null}
              </>
            ) : null}
            <div className="pak-bell-row">
              {quoteUnread || quoteBellOpen ? (
                <div className="notification-wrap">
                  <button
                    type="button"
                    className="notification-bell"
                    aria-label={quoteUnread ? `${t('pak.newQuote')} (1 unread)` : t('pak.newQuote')}
                    aria-expanded={quoteBellOpen}
                    onClick={() => setQuoteBellOpen((current) => !current)}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {quoteUnread ? <span className="notification-badge">1</span> : null}
                  </button>
                  {quoteBellOpen ? (
                    <div className="notification-panel" role="dialog" aria-label={t('pak.newQuote')}>
                      <div className="notification-panel-head">
                        <strong>{t('pak.newQuote')}</strong>
                      </div>
                      <ul className="notification-list">
                        <li className="notification-item">
                          <div className="notification-copy">
                            <strong>{t('pak.quoteReady')}</strong>
                            <span>
                              {typeof trackedBooking?.price_cents === 'number'
                                ? `₱${formatCentavos(trackedBooking.price_cents)}`
                                : t('pak.waitingDriverPrice')}
                            </span>
                          </div>
                          <div className="notification-actions">
                            {trackedBooking ? (
                              <button
                                type="button"
                                className="compact-button notification-action"
                                onClick={() => handleViewQuote(trackedBooking.id)}
                              >
                                {t('pak.viewBooking')}
                              </button>
                            ) : null}
                          </div>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="secondary-action" disabled={isRefreshing} onClick={() => void refreshBookingStatus()}>
                {isRefreshing ? t('pak.checkingStatus') : t('pak.refreshStatus')}
              </button>
            </div>
            <button type="button" className="primary-action" onClick={onBack}>
              {t('pak.backToRide')}
            </button>
          </section>
          {quoteAlert ? (
            <PakyawanChatAlertPopup
              eyebrow={t('pak.quoteReady')}
              title={`₱${formatCentavos(quoteAlert.amount)}`}
              subtitle={t('pak.quoteReceived')}
              preview={`${trackedBooking?.pickup_location ?? ''} → ${trackedBooking?.destination ?? ''}`}
              openLabel={t('pak.viewBooking')}
              closeLabel={t('chat.closeAria')}
              onOpen={() => {
                setQuoteAlert(null)
                document.getElementById('pak-quote-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              onClose={() => setQuoteAlert(null)}
            />
          ) : null}
          {pakyawanMessageAlert && createdBooking && trackedBooking ? (
            <PakyawanChatAlertPopup
              eyebrow={t('pak.newMessage')}
              title={t('pak.chatWithDriver')}
              subtitle={`${trackedBooking.pickup_location} → ${trackedBooking.destination}`}
              preview={pakyawanMessageAlert.preview}
              openLabel={t('pak.openChat')}
              closeLabel={t('chat.closeAria')}
              onOpen={() => {
                unlockNotificationAudio()
                setPakyawanChatOpen(true)
                void markChatSeen()
                dismissPakyawanMessageAlert()
              }}
              onClose={dismissPakyawanMessageAlert}
            />
          ) : null}
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
