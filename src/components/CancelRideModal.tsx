import { useState } from 'react'
import type { CancelledByRole } from '../types/ride'
import { useLanguage } from '../lib/i18n'

const RIDER_QUICK_REASONS = [
  { value: 'I found another ride', key: 'cancel.foundAnotherRide' },
  { value: 'My plans changed', key: 'cancel.plansChanged' },
  { value: 'Driver is taking too long', key: 'cancel.driverTooLong' },
  { value: 'Wrong pickup or destination', key: 'cancel.wrongRoute' },
  { value: 'Other', key: 'cancel.other' },
] as const

const DRIVER_QUICK_REASONS = [
  { value: 'Vehicle problem', key: 'cancel.vehicleProblem' },
  { value: 'Emergency', key: 'cancel.emergency' },
  { value: 'Unable to reach pickup location', key: 'cancel.cannotReach' },
  { value: 'Passenger not responding', key: 'cancel.passengerNoResponse' },
  { value: 'Passenger requested something I cannot accommodate', key: 'cancel.passengerRequest' },
  { value: 'Other', key: 'cancel.other' },
] as const

type CancelRideModalProps = {
  open: boolean
  role: CancelledByRole
  submitting?: boolean
  error?: string
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function CancelRideModal({
  open,
  role,
  submitting = false,
  error,
  onClose,
  onConfirm,
}: CancelRideModalProps) {
  const { t } = useLanguage()
  const [selectedReason, setSelectedReason] = useState('')
  const [customReason, setCustomReason] = useState('')

  if (!open) {
    return null
  }

  const quickReasons = role === 'driver' ? DRIVER_QUICK_REASONS : RIDER_QUICK_REASONS
  const showCustom = selectedReason === 'Other'
  const confirmationReady = showCustom
    ? customReason.trim().length > 0
    : selectedReason.length > 0

  const handleConfirm = () => {
    if (!confirmationReady || submitting) {
      return
    }

    onConfirm(showCustom ? customReason.trim() : selectedReason)
  }

  return (
    <div
      className="ride-chat-overlay cancel-ride-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('cancel.title')}
    >
      <div className="ride-chat-panel cancel-ride-panel">
        <div className="ride-chat-header">
          <div>
            <strong>{t('cancel.title')}</strong>
            <span>{role === 'driver' ? t('cancel.letPassengerKnow') : t('cancel.letDriverKnow')}</span>
          </div>

          <button
            type="button"
            className="ride-chat-close"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('cancel.closeAria')}
          >
            X
          </button>
        </div>

        <div className="cancel-ride-body">
          <p className="cancel-ride-note">
            {t('cancel.note', { role: role === 'driver' ? t('chat.rolePassenger') : t('chat.roleDriver') })}
          </p>

          <div className="cancel-ride-reasons" role="radiogroup" aria-label={t('cancel.reasonsLabel')}>
            {quickReasons.map((reason) => (
              <button
                key={reason.value}
                type="button"
                className={selectedReason === reason.value ? 'cancel-ride-reason selected' : 'cancel-ride-reason'}
                onClick={() => setSelectedReason(reason.value)}
                role="radio"
                aria-checked={selectedReason === reason.value}
              >
                {t(reason.key)}
              </button>
            ))}
          </div>

          {showCustom ? (
            <label className="field-label cancel-ride-custom">
              {t('cancel.tellMore')} <span>{t('cancel.required')}</span>
              <textarea
                className="text-input cancel-ride-textarea"
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder={t('cancel.placeholder')}
                rows={3}
                maxLength={300}
              />
            </label>
          ) : null}

          {error ? (
            <p className="form-error-message cancel-ride-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="cancel-ride-actions">
          <button
            type="button"
            className="secondary-action"
            onClick={onClose}
            disabled={submitting}
          >
            {t('cancel.keepRide')}
          </button>
          <button
            type="button"
            className="primary-action cancel-ride-confirm"
            onClick={handleConfirm}
            disabled={!confirmationReady || submitting}
          >
            {submitting ? t('cancel.cancelling') : t('cancel.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}