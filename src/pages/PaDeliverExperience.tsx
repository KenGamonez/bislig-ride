import { useCallback, useEffect, useRef, useState } from 'react'
import { AppHeader, type AppViewMode } from '../components/AppHeader'
import { PakyawanChatAlertPopup } from '../components/PakyawanChat'
import { DeliveryChatSection } from '../components/DeliveryChatSection'
import { DeliveryRating } from '../components/DeliveryRating'
import { confirmDeliveryQuote, createDeliveryBooking, getDeliveryBooking } from '../lib/deliveries'
import { fetchDeliveryProofUrl } from '../lib/deliveryProof'
import { playChatNotification, showBrowserNotification, unlockNotificationAudio } from '../lib/notifications'
import { formatCentavos } from '../lib/fare'
import type { DeliveryBooking } from '../types/delivery'
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
  const { t } = useLanguage()
  const [form, setForm] = useState(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [step, setStep] = useState(1)
  const [submitted, setSubmitted] = useState(false)
  const [createdDeliveryId, setCreatedDeliveryId] = useState<string | null>(null)
  const [createdAccessToken, setCreatedAccessToken] = useState<string | null>(null)
  const [trackedDelivery, setTrackedDelivery] = useState<DeliveryBooking | null>(null)
  const [trackingError, setTrackingError] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState('')
  const [deliveryAlert, setDeliveryAlert] = useState<{ status: string } | null>(null)
  const [deliveryUnread, setDeliveryUnread] = useState(false)
  const [deliveryBellOpen, setDeliveryBellOpen] = useState(false)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofViewerOpen, setProofViewerOpen] = useState(false)
  const [proofLoading, setProofLoading] = useState(false)
  const [proofError, setProofError] = useState('')
  const [deliveryChatOpen, setDeliveryChatOpen] = useState(false)
  const [deliveryChatAlert, setDeliveryChatAlert] = useState<{ preview: string } | null>(null)

  const handleDeliveryChatMessage = useCallback(
    (preview: string) => {
      setDeliveryChatAlert({ preview })
      playChatNotification()
      showBrowserNotification(t('pad.newUpdate'), preview.slice(0, 120))
    },
    [t],
  )
  const prevDeliverySigRef = useRef<string | null>(null)
  const cardRef = useRef<HTMLFormElement>(null)

  const deliveryViewedKey = (deliveryId: string) => `bislig-ride-padeliver-updateviewed-${deliveryId}`

  const syncDeliveryUnread = (deliveryId: string) => {
    let notified: string | null = null
    let viewed: string | null = null

    try {
      notified = window.localStorage.getItem(`bislig-ride-padeliver-notifiedseen-${deliveryId}`)
      viewed = window.localStorage.getItem(deliveryViewedKey(deliveryId))
    } catch {
      notified = null
      viewed = null
    }

    setDeliveryUnread(notified !== null && notified !== viewed)
  }

  const handleViewDeliveryUpdate = (deliveryId: string) => {
    try {
      window.localStorage.setItem(
        deliveryViewedKey(deliveryId),
        window.localStorage.getItem(`bislig-ride-padeliver-notifiedseen-${deliveryId}`) ?? 'seen',
      )
    } catch {
      // Private browsing — unread clears in memory only.
    }

    setDeliveryUnread(false)
    setDeliveryBellOpen(false)
    document.getElementById('pad-delivery-box')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const handleViewProof = async () => {
    if (!createdDeliveryId || !createdAccessToken || proofLoading) {
      return
    }

    setProofLoading(true)
    setProofError('')

    try {
      const url = await fetchDeliveryProofUrl(createdDeliveryId, createdAccessToken)
      setProofUrl(url)
      setProofViewerOpen(true)
    } catch (error) {
      console.error('Unable to load delivery proof:', error)
      setProofError(t('pad.proofLoadFailed'))
    } finally {
      setProofLoading(false)
    }
  }

  const updateField = (name: keyof PaDeliverForm, value: string) => {
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const validateStep = (target: number) => {
    const nextErrors: FormErrors = {}

    if (target === 1) {
      if (!form.package_type.trim()) nextErrors.package_type = t('err.required')
      if (!form.package_size.trim()) nextErrors.package_size = t('err.required')
    }

    if (target === 2) {
      if (!form.pickup_address.trim()) nextErrors.pickup_address = t('err.required')
      if (!form.delivery_address.trim()) nextErrors.delivery_address = t('err.required')
      if (!form.preferred_date.trim()) nextErrors.preferred_date = t('err.required')
      if (!form.preferred_time.trim()) nextErrors.preferred_time = t('err.required')
    }

    if (target === 3) {
      const phone = form.sender_phone.trim()
      if (!form.sender_name.trim()) nextErrors.sender_name = t('err.required')
      if (!phone) {
        nextErrors.sender_phone = t('err.required')
      } else if (!/^[0-9+\-\s()]+$/.test(phone)) {
        nextErrors.sender_phone = t('err.invalidPhone')
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
      if (!form[name].trim()) nextErrors[name] = t('err.required')
    })

    const phone = form.sender_phone.trim()
    if (phone && !/^[0-9+\-\s()]+$/.test(phone)) {
      nextErrors.sender_phone = t('err.invalidPhone')
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
      const created = await createDeliveryBooking({
        customer_id: null,
        sender_name: form.sender_name.trim(),
        sender_phone: form.sender_phone.trim(),
        package_type: form.package_type,
        package_details: form.package_details.trim() || null,
        package_size: form.package_size.trim(),
        pickup_address: form.pickup_address.trim(),
        delivery_address: form.delivery_address.trim(),
        preferred_date: form.preferred_date,
        preferred_time: form.preferred_time,
      })
      try {
        window.localStorage.setItem(`bislig-ride-padeliver-${created.id}`, created.access_token)
      } catch {
        // Private browsing or disabled storage — the reference below still works for this session.
      }
      setCreatedDeliveryId(created.id)
      setCreatedAccessToken(created.access_token)
      setDeliveryAlert(null)
      setDeliveryUnread(false)
      setDeliveryBellOpen(false)
      setDeliveryChatOpen(false)
      setDeliveryChatAlert(null)
      prevDeliverySigRef.current = null
      setSubmitted(true)
    } catch (error) {
      console.error('Unable to submit delivery request:', error)
      setSubmitError(t('pad.submitFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDelivery = async () => {
    if (isConfirming || !createdDeliveryId || !createdAccessToken || !trackedDelivery || trackedDelivery.status !== 'quoted') {
      return
    }

    unlockNotificationAudio()

    setIsConfirming(true)
    setConfirmError('')

    try {
      const confirmed = await confirmDeliveryQuote(createdDeliveryId, createdAccessToken)
      setTrackedDelivery(confirmed)
    } catch (error) {
      console.error('Unable to confirm delivery:', error)
      setConfirmError(error instanceof Error && error.message ? error.message : t('pad.confirmFailed'))
    } finally {
      setIsConfirming(false)
    }
  }

  const refreshDeliveryStatus = async (quiet = false) => {
    if (!createdDeliveryId || !createdAccessToken || isRefreshing) {
      return
    }

    // Background ticks stay silent so the page does not flicker every poll.
    if (!quiet) {
      setIsRefreshing(true)
      setTrackingError('')
    }

    try {
      const latest = await getDeliveryBooking(createdDeliveryId, createdAccessToken)
      setTrackedDelivery((current) => {
        if (
          current &&
          current.status === latest.status &&
          current.price_cents === latest.price_cents &&
          current.driver_id === latest.driver_id &&
          current.updated_at === latest.updated_at &&
          current.proof_available === latest.proof_available
        ) {
          return current
        }

        return latest
      })
    } catch (error) {
      console.error('Unable to refresh delivery status:', error)

      if (!quiet) {
        setTrackingError(t('pad.trackFailed'))
      }
    } finally {
      if (!quiet) {
        setIsRefreshing(false)
      }
    }
  }

  const deliveryStatusLabel = (status: string): string => {
    switch (status) {
      case 'quoted':
        return t('pad.quoteReady')
      case 'confirmed':
        return t('pad.trackConfirmed')
      case 'assigned':
        return t('pad.trackAssigned')
      case 'driver_on_way':
        return t('pad.trackOnWay')
      case 'driver_arrived':
        return t('pad.trackArrived')
      case 'picked_up':
        return t('pad.trackPickedUp')
      case 'in_transit':
        return t('pad.trackInTransit')
      case 'delivered':
        return t('pad.trackDelivered')
      case 'cancelled':
        return t('pad.trackCancelled')
      case 'failed':
        return t('pad.trackFailedStatus')
      case 'no_driver':
        return t('pad.trackNoDriver')
      case 'pending':
      case 'dispatching':
        return t('pad.trackFinding')
      default:
        return status.toUpperCase().replace(/_/g, ' ')
    }
  }

  useEffect(() => {
    if (!submitted || !createdDeliveryId || !createdAccessToken) {
      return
    }

    const status = trackedDelivery?.status
    if (status === 'delivered' || status === 'cancelled' || status === 'failed') {
      return
    }

    void refreshDeliveryStatus()
    const timer = window.setInterval(() => {
      void refreshDeliveryStatus(true)
    }, 10000)

    return () => {
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, createdDeliveryId, createdAccessToken, trackedDelivery?.status])

  useEffect(() => {
    if (!submitted || !createdDeliveryId || !trackedDelivery) {
      return
    }

    const notifiable = [
      'assigned',
      'quoted',
      'confirmed',
      'driver_on_way',
      'driver_arrived',
      'picked_up',
      'in_transit',
      'delivered',
    ]

    const sig = `${trackedDelivery.id}:${trackedDelivery.status}`
    const prevSig = prevDeliverySigRef.current
    prevDeliverySigRef.current = sig

    if (!notifiable.includes(trackedDelivery.status)) {
      return
    }

    const markerKey = `bislig-ride-padeliver-notifiedseen-${trackedDelivery.id}`
    let seen: string | null = null

    try {
      seen = window.localStorage.getItem(markerKey)
    } catch {
      seen = null
    }

    if (seen === trackedDelivery.status) {
      return
    }

    if (prevSig === null) {
      // First observation (e.g. reload mid-trip): establish the baseline
      // silently instead of announcing an old state.
      try {
        window.localStorage.setItem(markerKey, trackedDelivery.status)
      } catch {
        // Private browsing — the in-memory signature still prevents repeats.
      }

      syncDeliveryUnread(trackedDelivery.id)

      return
    }

    const prevStatus = prevSig.split(':')[1]

    if (prevStatus === trackedDelivery.status) {
      return
    }

    try {
      window.localStorage.setItem(markerKey, trackedDelivery.status)
    } catch {
      // Private browsing — the in-memory signature still prevents repeats.
    }

    setDeliveryAlert({ status: trackedDelivery.status })
    setDeliveryUnread(true)
    playChatNotification()
    showBrowserNotification(t('pad.newUpdate'), deliveryStatusLabel(trackedDelivery.status))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, createdDeliveryId, trackedDelivery])

  useEffect(() => {
    if (submitted) {
      return
    }

    let cancelled = false

    const restoreTrackedDelivery = async () => {
      const prefix = 'bislig-ride-padeliver-'
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
          const booking = await getDeliveryBooking(candidate.id, candidate.token)
          if (cancelled) {
            return
          }

          if (
            booking.status === 'pending' ||
            booking.status === 'dispatching' ||
            booking.status === 'quoted' ||
            booking.status === 'confirmed' ||
            booking.status === 'assigned' ||
            booking.status === 'driver_on_way' ||
            booking.status === 'driver_arrived' ||
            booking.status === 'picked_up' ||
            booking.status === 'in_transit'
          ) {
            setCreatedDeliveryId(candidate.id)
            setCreatedAccessToken(candidate.token)
            setTrackedDelivery(booking)
            setDeliveryAlert(null)
            setDeliveryBellOpen(false)
            setDeliveryChatOpen(false)
            setDeliveryChatAlert(null)
            prevDeliverySigRef.current = null
            syncDeliveryUnread(candidate.id)
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

    void restoreTrackedDelivery()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
          placeholder={t('pad.addressPlaceholder')}
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
            {routeField('pickup_address', t('pad.pickupAddress'), 'is-pickup')}

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

            {routeField('delivery_address', t('pad.deliveryAddress'), 'is-delivery')}
          </div>

          <div className="flow-date-group">
            <span className="field-label">{t('pad.whenNeed')}</span>
            <div className="flow-date-row">
              {field('preferred_date', t('pad.preferredDate'), 'date', undefined, getToday())}
              {field('preferred_time', t('pad.preferredTime'), 'time')}
            </div>
          </div>
        </div>
      )
    }

    if (step === 3) {
      return (
        <div className="flow-fields">
          <div className="flow-field-row">
            {field('sender_name', t('pad.senderName'))}
            {field('sender_phone', t('pad.contactNumber'), 'tel')}
          </div>
        </div>
      )
    }

    return (
      <div className="flow-fields">
        <label className="field-block">
          <span className="field-label">{t('pad.packageType')}</span>
          <select
            className={`input-field${errors.package_type ? ' has-error' : ''}`}
            value={form.package_type}
            onChange={(event) => updateField('package_type', event.target.value)}
          >
            <option value="">{t('form.selectOption')}</option>
            {packageTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          {errors.package_type ? <span className="field-error">{errors.package_type}</span> : null}
        </label>

        <label className="field-block">
          <span className="field-label">{t('pad.packageDetails')}</span>
          <textarea
            className="input-field textarea-field flow-notes"
            placeholder={t('pad.packageDetailsPlaceholder')}
            value={form.package_details}
            onChange={(event) => updateField('package_details', event.target.value)}
          />
        </label>

        {field('package_size', t('pad.packageSize'), 'text', t('pad.sizePlaceholder'))}
      </div>
    )
  }

  if (submitted) {
    const status = trackedDelivery?.status
    const quotedCents = trackedDelivery && typeof trackedDelivery.price_cents === 'number' && Number.isFinite(trackedDelivery.price_cents)
      ? trackedDelivery.price_cents
      : null
    const nextCopy =
      status === 'pending' ? t('pad.nextPending')
      : status === 'dispatching' ? t('pad.nextDispatching')
      : status === 'assigned' ? t('pad.nextAssigned')
      : status === 'quoted' ? t('pad.nextQuoted')
      : status === 'confirmed' ? t('pad.nextConfirmed')
      : status === 'driver_on_way' ? t('pad.nextOnWay')
      : status === 'driver_arrived' ? t('pad.nextArrived')
      : status === 'picked_up' ? t('pad.nextPickedUp')
      : status === 'in_transit' ? t('pad.nextInTransit')
      : status === 'delivered' ? t('pad.nextDelivered')
      : status === 'no_driver' ? t('pad.nextNoDriver')
      : null

    return (
      <>
        <AppHeader view="Rider" onViewChange={routeToView} primaryLabel={t('nav.myRides')} onPrimaryAction={onBack} />
        <main className="scheduled-shell flow-shell">
          <section className="scheduled-card scheduled-success" id="pad-delivery-box">
            <p className="eyebrow">{status === 'quoted' ? t('pad.quoteReady') : status === 'confirmed' ? t('pad.trackConfirmed') : status === 'assigned' ? t('pad.trackAssigned') : status === 'driver_on_way' ? t('pad.trackOnWay') : status === 'driver_arrived' ? t('pad.trackArrived') : status === 'picked_up' ? t('pad.trackPickedUp') : status === 'in_transit' ? t('pad.trackInTransit') : status === 'delivered' ? t('pad.trackDelivered') : status === 'cancelled' ? t('pad.trackCancelled') : status === 'failed' ? t('pad.trackFailedStatus') : status === 'no_driver' ? t('pad.trackNoDriver') : status === 'pending' || status === 'dispatching' ? t('pad.trackFinding') : t('pad.receivedEyebrow')}</p>
            <h1>{status === 'quoted' ? t('pad.quoteReady') : status === 'confirmed' ? t('pad.trackConfirmed') : status === 'assigned' ? t('pad.trackAssigned') : status === 'driver_on_way' ? t('pad.trackOnWay') : status === 'driver_arrived' ? t('pad.trackArrived') : status === 'picked_up' ? t('pad.trackPickedUp') : status === 'in_transit' ? t('pad.trackInTransit') : status === 'delivered' ? t('pad.trackDelivered') : status === 'cancelled' ? t('pad.trackCancelled') : status === 'failed' ? t('pad.trackFailedStatus') : status === 'no_driver' ? t('pad.trackNoDriver') : status === 'pending' || status === 'dispatching' ? t('pad.trackFinding') : t('pad.receivedTitle')}</h1>
            {status === 'quoted' ? (
              <>
                <p className="booking-status">{t('pad.statusLabel')}: {t('pad.quoteReady')}</p>
                {quotedCents !== null ? (
                  <p className="booking-fee">{t('pad.deliveryFee')}: ₱{formatCentavos(quotedCents)}</p>
                ) : null}
                <button type="button" className="primary-action" disabled={isConfirming} onClick={() => void handleConfirmDelivery()}>
                  {isConfirming ? t('pad.confirming') : t('pad.confirmDelivery')}
                </button>
                {confirmError ? <p className="form-error-message submit-error">{confirmError}</p> : null}
              </>
            ) : status === 'confirmed' ? (
              <>
                <p className="booking-status">{t('pad.statusLabel')}: {t('pad.trackConfirmed')}</p>
                {quotedCents !== null ? (
                  <p className="booking-fee">{t('pad.deliveryFee')}: ₱{formatCentavos(quotedCents)}</p>
                ) : null}
                <p>{t('pad.confirmedBody')}</p>
              </>
            ) : status === 'assigned' || status === 'driver_on_way' || status === 'driver_arrived' || status === 'picked_up' || status === 'in_transit' || status === 'delivered' ? (
              <p className="booking-status">{t('pad.statusLabel')}: {status === 'assigned' ? t('pad.trackAssigned') : status === 'driver_on_way' ? t('pad.trackOnWay') : status === 'driver_arrived' ? t('pad.trackArrived') : status === 'picked_up' ? t('pad.trackPickedUp') : status === 'in_transit' ? t('pad.trackInTransit') : t('pad.trackDelivered')}</p>
            ) : status === 'no_driver' ? (
              <p className="booking-status">{t('pad.statusLabel')}: {t('pad.trackNoDriver')}</p>
            ) : status === 'cancelled' ? (
              <p className="booking-status">{t('pad.statusLabel')}: {t('pad.trackCancelled')}</p>
            ) : status === 'failed' ? (
              <p className="booking-status">{t('pad.statusLabel')}: {t('pad.trackFailedStatus')}</p>
            ) : (
              <p>{t('pad.receivedBody')}</p>
            )}
            {nextCopy ? <p>{nextCopy}</p> : null}
            {status === 'delivered' && quotedCents !== null ? (
              <p className="booking-fee">{t('pad.trackDelivered')}: ₱{formatCentavos(quotedCents)}</p>
            ) : null}
            {createdDeliveryId ? (
              <p className="booking-ref">{t('pad.bookingRef')}: {createdDeliveryId.slice(0, 8)}…</p>
            ) : null}
            {status === 'delivered' && trackedDelivery?.proof_available ? (
              <div className="pad-proof-box">
                <span className="field-label">{t('pad.proofAvailable')}</span>
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="secondary-action compact-button"
                    disabled={proofLoading}
                    onClick={() => void handleViewProof()}
                  >
                    {proofLoading ? t('pad.checkingStatus') : t('pad.viewProof')}
                  </button>
                </div>
                {proofError ? <span className="field-error">{proofError}</span> : null}
              </div>
            ) : null}
            {status !== 'delivered' && trackedDelivery && trackedDelivery.driver_id && createdAccessToken ? (
              <>
                <p className="pad-section-label">{t('pad.chatWithDriver')}</p>
                <DeliveryChatSection
                  deliveryId={trackedDelivery.id}
                  accessToken={createdAccessToken}
                  role="passenger"
                  otherPartyName={t('chat.roleDriver')}
                  toggleLabel={t('pad.chatWithDriver')}
                  forceOpen={deliveryChatOpen}
                  onOpenChange={setDeliveryChatOpen}
                  onIncomingMessage={handleDeliveryChatMessage}
                />
              </>
            ) : null}
            {status === 'delivered' && trackedDelivery && trackedDelivery.driver_id && createdAccessToken ? (
              <>
                <p className="pad-section-label">{t('pad.rateDriver')}</p>
                <DeliveryRating
                  deliveryId={trackedDelivery.id}
                  accessToken={createdAccessToken}
                  raterRole="passenger"
                  ratedName={t('chat.roleDriver')}
                />
              </>
            ) : null}
            {trackingError ? <p className="form-error-message submit-error">{trackingError}</p> : null}
            <div className="pak-bell-row">
              {deliveryUnread || deliveryBellOpen ? (
                <div className="notification-wrap">
                  <button
                    type="button"
                    className="notification-bell"
                    aria-label={deliveryUnread ? `${t('pad.newUpdate')} (1 unread)` : t('pad.newUpdate')}
                    aria-expanded={deliveryBellOpen}
                    onClick={() => setDeliveryBellOpen((current) => !current)}
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    {deliveryUnread ? <span className="notification-badge">1</span> : null}
                  </button>
                  {deliveryBellOpen && createdDeliveryId ? (
                    <div className="notification-panel" role="dialog" aria-label={t('pad.newUpdate')}>
                      <div className="notification-panel-head">
                        <strong>{t('pad.newUpdate')}</strong>
                      </div>
                      <ul className="notification-list">
                        <li className="notification-item">
                          <div className="notification-copy">
                            <strong>{trackedDelivery ? deliveryStatusLabel(trackedDelivery.status) : t('pad.newUpdate')}</strong>
                            <span>
                              {trackedDelivery ? `${trackedDelivery.pickup_address} → ${trackedDelivery.delivery_address}` : ''}
                            </span>
                          </div>
                          <div className="notification-actions">
                            <button
                              type="button"
                              className="compact-button notification-action"
                              onClick={() => handleViewDeliveryUpdate(createdDeliveryId)}
                            >
                              {t('pad.viewBooking')}
                            </button>
                          </div>
                        </li>
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <button type="button" className="secondary-action" disabled={isRefreshing} onClick={() => void refreshDeliveryStatus()}>
                {isRefreshing ? t('pad.checkingStatus') : t('pad.refreshStatus')}
              </button>
            </div>
            <button type="button" className="primary-action" onClick={onBack}>
              {t('form.backHome')}
            </button>
          </section>
          {deliveryAlert && trackedDelivery ? (
            <PakyawanChatAlertPopup
              eyebrow={t('pad.newUpdate')}
              title={deliveryStatusLabel(deliveryAlert.status)}
              subtitle={`${trackedDelivery.pickup_address} → ${trackedDelivery.delivery_address}`}
              preview={deliveryStatusLabel(trackedDelivery.status)}
              openLabel={t('pad.viewBooking')}
              closeLabel={t('chat.closeAria')}
              onOpen={() => {
                setDeliveryAlert(null)
                if (createdDeliveryId) {
                  handleViewDeliveryUpdate(createdDeliveryId)
                }
              }}
              onClose={() => setDeliveryAlert(null)}
            />
          ) : null}
          {deliveryChatAlert && trackedDelivery ? (
            <PakyawanChatAlertPopup
              eyebrow={t('pad.newUpdate')}
              title={t('pad.chatWithDriver')}
              subtitle={`${trackedDelivery.pickup_address} → ${trackedDelivery.delivery_address}`}
              preview={deliveryChatAlert.preview}
              openLabel={t('pad.openChat')}
              closeLabel={t('chat.closeAria')}
              onOpen={() => {
                setDeliveryChatAlert(null)
                setDeliveryChatOpen(true)
              }}
              onClose={() => setDeliveryChatAlert(null)}
            />
          ) : null}
          {proofViewerOpen ? (
            <div className="proof-viewer-overlay" role="dialog" aria-modal="true" aria-label={t('pad.proofAvailable')}>
              <div className="proof-viewer-sheet">
                <p className="proof-viewer-title">{t('pad.proofAvailable')}</p>
                {proofUrl ? (
                  <img src={proofUrl} alt={t('pad.proofAvailable')} />
                ) : (
                  <p className="proof-viewer-error">{t('pad.proofLoadFailed')}</p>
                )}
                <div className="pak-req-actions">
                  <button type="button" className="secondary-action" onClick={() => setProofViewerOpen(false)}>
                    {t('chat.closeAria')}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </>
    )
  }

  const stepTitles: Record<number, { title: string; hint: string }> = {
    1: { title: t('pad.step1.title'), hint: t('pad.step1.hint') },
    2: { title: t('pad.step2.title'), hint: t('pad.step2.hint') },
    3: { title: t('pad.step3.title'), hint: t('pad.step3.hint') },
  }

  return (
    <>
      <AppHeader view="Rider" onViewChange={routeToView} primaryLabel={t('nav.myRides')} onPrimaryAction={onBack} />
      <main className="scheduled-shell flow-shell">
        <section className="section-header scheduled-header pad-hero">
          <p className="eyebrow">{t('pad.eyebrow')}</p>
          <h1>
            {t('pad.title1')}
            <span className="hero-accent">{t('pad.title2')}</span>
          </h1>
          <p className="subtitle">{t('pad.subtitle')}</p>
          <p className="pad-descriptor">{t('pad.descriptor')}</p>
        </section>

        <form className="scheduled-form flow-card" ref={cardRef} onSubmit={handleSubmit} noValidate>
          <div className="flow-progress" role="presentation" aria-label={t('pad.progressAria', { step, total: 3 })}>
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
                  {t('form.continue')} &rarr;
                </button>
              ) : (
                <button type="submit" className="primary-action request-ride-action" disabled={isSubmitting}>
                  {isSubmitting ? t('pad.submitting') : <>{t('pad.submit')} &rarr;</>}
                </button>
              )}
              {step === 3 && submitError ? (
                <p className="form-error-message submit-error">{submitError}</p>
              ) : null}
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
              <strong>{t('pad.finalNoteStrong')}</strong>
              <span>{t('pad.finalNoteText')}</span>
            </div>
          ) : null}
        </form>
      </main>
    </>
  )
}