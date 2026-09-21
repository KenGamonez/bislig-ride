import { useEffect, useState } from 'react'
import { getDeliveryRatings, submitDeliveryRating } from '../lib/deliveries'
import { useLanguage } from '../lib/i18n'
import type { DeliveryChatRole } from '../types/delivery'

type DeliveryRatingProps = {
  deliveryId: string
  accessToken?: string | null
  raterRole: DeliveryChatRole
  ratedName: string
}

export function DeliveryRating({ deliveryId, accessToken = null, raterRole, ratedName }: DeliveryRatingProps) {
  const { t } = useLanguage()
  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')
  const [submittedStars, setSubmittedStars] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const items = await getDeliveryRatings(deliveryId, accessToken)
        const own = items.find((item) => item.rater_role === raterRole)

        if (mounted && own) {
          setSubmittedStars(own.stars)
        }
      } catch (loadError) {
        console.error('Unable to load delivery ratings:', loadError)
      }

      if (mounted) {
        setLoading(false)
      }
    }

    void load()

    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId])

  const handleSubmit = async () => {
    if (stars < 1 || stars > 5 || submitting || submittedStars !== null) {
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const saved = await submitDeliveryRating({
        deliveryId,
        accessToken,
        raterRole,
        stars,
        comment: comment.trim(),
      })
      setSubmittedStars(saved.stars)
      setComment('')
    } catch (submitError) {
      console.error('Unable to submit delivery rating:', submitError)
      setError(submitError instanceof Error && submitError.message ? submitError.message : t('rating.failed'))
    }

    setSubmitting(false)
  }

  if (loading) {
    return <p className="muted-copy">{t('chat.loading')}</p>
  }

  if (submittedStars !== null) {
    return (
      <div className="pad-rating-box">
        <span className="field-label">
          {t('rating.thankYou')} ({submittedStars}/5)
        </span>
        <span className="rating-stars-inline" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((value) => (
            <svg
              key={value}
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill={value <= submittedStars ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            >
              <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          ))}
        </span>
      </div>
    )
  }

  return (
    <div className="pad-rating-box">
      <span className="field-label">{t('pad.rateTitle', { name: ratedName })}</span>
      <div
        className="rating-stars"
        role="radiogroup"
        aria-label={t('rating.aria')}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={star <= stars ? 'rating-star selected' : 'rating-star'}
            onClick={() => setStars(star)}
            aria-label={`${star} ${star > 1 ? t('rating.starWords') : t('rating.starWord')}`}
            aria-checked={star === stars}
            role="radio"
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill={star <= stars ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
            </svg>
          </button>
        ))}
      </div>
      <label className="field-block">
        <span className="field-label">
          {t('rating.comment')} <span>{t('rating.optional')}</span>
        </span>
        <input
          className="input-field"
          type="text"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t('rating.placeholder')}
          maxLength={1000}
          disabled={submitting}
        />
      </label>
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
      <div className="pakyawan-actions">
        <button
          type="button"
          className="secondary-action compact-button"
          onClick={() => void handleSubmit()}
          disabled={stars === 0 || submitting}
        >
          {submitting ? t('rating.submitting') : t('rating.submit')}
        </button>
      </div>
    </div>
  )
}
