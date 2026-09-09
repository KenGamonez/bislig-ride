import { useState } from 'react'
import type { CancelledByRole } from '../types/ride'

const RIDER_QUICK_REASONS = [
  'I found another ride',
  'My plans changed',
  'Driver is taking too long',
  'Wrong pickup or destination',
  'Other',
]

const DRIVER_QUICK_REASONS = [
  'Vehicle problem',
  'Emergency',
  'Unable to reach pickup location',
  'Passenger not responding',
  'Passenger requested something I cannot accommodate',
  'Other',
]

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
      aria-label="Cancel ride"
    >
      <div className="ride-chat-panel cancel-ride-panel">
        <div className="ride-chat-header">
          <div>
            <strong>Cancel this ride?</strong>
            <span>Let the {role === 'driver' ? 'passenger' : 'driver'} know why.</span>
          </div>

          <button
            type="button"
            className="ride-chat-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Keep the ride and close"
          >
            X
          </button>
        </div>

        <div className="cancel-ride-body">
          <p className="cancel-ride-note">
            Your ride will be cancelled and the {role === 'driver' ? 'passenger' : 'driver'} will be
            notified right away. Why are you cancelling?
          </p>

          <div className="cancel-ride-reasons" role="radiogroup" aria-label="Cancellation reason">
            {quickReasons.map((reason) => (
              <button
                key={reason}
                type="button"
                className={selectedReason === reason ? 'cancel-ride-reason selected' : 'cancel-ride-reason'}
                onClick={() => setSelectedReason(reason)}
                role="radio"
                aria-checked={selectedReason === reason}
              >
                {reason}
              </button>
            ))}
          </div>

          {showCustom ? (
            <label className="field-label cancel-ride-custom">
              Tell us more <span>(required)</span>
              <textarea
                className="text-input cancel-ride-textarea"
                value={customReason}
                onChange={(event) => setCustomReason(event.target.value)}
                placeholder="Describe the reason for cancelling..."
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
            Keep Ride
          </button>
          <button
            type="button"
            className="primary-action cancel-ride-confirm"
            onClick={handleConfirm}
            disabled={!confirmationReady || submitting}
          >
            {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
          </button>
        </div>
      </div>
    </div>
  )
}