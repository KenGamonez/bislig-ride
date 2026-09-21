import { useEffect, useState } from 'react'
import { PakyawanChat } from './PakyawanChat'
import { getPakyawanBooking } from '../lib/scheduledBookings'
import { getDeliveryBooking } from '../lib/deliveries'
import { formatCentavos } from '../lib/fare'
import { useLanguage } from '../lib/i18n'
import { unlockNotificationAudio } from '../lib/notifications'
import { markPakyawanChatSeen } from '../lib/usePakyawanMessageAlert'
import type { PakyawanBooking } from '../types/scheduledBooking'
import type { DeliveryBooking } from '../types/delivery'

const PAKYAWAN_PREFIX = 'bislig-ride-pakyawan-'
const DELIVERY_PREFIX = 'bislig-ride-padeliver-'

const PAKYAWAN_ACTIVE = [
  'pending',
  'assigned',
  'quoted',
  'confirmed',
  'scheduled',
  'driver_on_way',
  'driver_arrived',
  'in_progress',
]

const DELIVERY_ACTIVE = [
  'pending',
  'dispatching',
  'assigned',
  'quoted',
  'confirmed',
  'driver_on_way',
  'driver_arrived',
  'picked_up',
  'in_transit',
]

type UpcomingPakyawan = { booking: PakyawanBooking; token: string }
type UpcomingDelivery = { booking: DeliveryBooking; token: string }

function scanTokens(prefix: string): Array<{ id: string; token: string }> {
  const found: Array<{ id: string; token: string }> = []

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      const token = key ? window.localStorage.getItem(key) : null

      if (key && key.startsWith(prefix) && token) {
        found.push({ id: key.slice(prefix.length), token })
      }
    }
  } catch {
    return []
  }

  return found
}

export function PassengerUpcoming() {
  const { t } = useLanguage()
  const [pakyawan, setPakyawan] = useState<UpcomingPakyawan[]>([])
  const [deliveries, setDeliveries] = useState<UpcomingDelivery[]>([])
  const [loaded, setLoaded] = useState(false)
  const [chatBookingId, setChatBookingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      const pakyawanItems: UpcomingPakyawan[] = []
      const deliveryItems: UpcomingDelivery[] = []

      for (const candidate of scanTokens(PAKYAWAN_PREFIX)) {
        try {
          const booking = await getPakyawanBooking(candidate.id, candidate.token)

          if (!cancelled && PAKYAWAN_ACTIVE.includes(booking.status)) {
            const row = booking as PakyawanBooking & { access_token?: string }
            delete row.access_token
            pakyawanItems.push({ booking: row, token: candidate.token })
          }
        } catch {
          // Invalid or finished booking — skipped without touching storage.
        }
      }

      for (const candidate of scanTokens(DELIVERY_PREFIX)) {
        try {
          const booking = await getDeliveryBooking(candidate.id, candidate.token)

          if (!cancelled && DELIVERY_ACTIVE.includes(booking.status)) {
            deliveryItems.push({ booking, token: candidate.token })
          }
        } catch {
          // Invalid or finished booking — skipped without touching storage.
        }
      }

      if (!cancelled) {
        setPakyawan(pakyawanItems)
        setDeliveries(deliveryItems)
        setLoaded(true)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded || (pakyawan.length === 0 && deliveries.length === 0)) {
    return null
  }

  const toggleChat = (id: string, token: string) => {
    unlockNotificationAudio()
    setChatBookingId((current) => {
      if (current === id) {
        return null
      }

      void markPakyawanChatSeen(id, token)
      return id
    })
  }

  return (
    <section aria-label={t('home.upcomingEyebrow')}>
      <p className="eyebrow">{t('home.upcomingEyebrow')}</p>
      <ul className="upcoming-list">
        {pakyawan.map(({ booking, token }) => (
          <li key={booking.id} className="upcoming-card">
            <div className="upcoming-card-top">
              <span className="pak-req-eyebrow">{t('pak.upcomingLabel')}</span>
              <span className="pak-req-status">
                {booking.driver_id ? t('pak.driverAssigned') : t('pak.waitingDriver')}
              </span>
            </div>
            <div className="upcoming-card-route">
              {booking.pickup_location} → {booking.destination}
            </div>
            <div className="upcoming-card-meta">
              {booking.booking_date} · {booking.pickup_time}
              {typeof booking.price_cents === 'number' && Number.isFinite(booking.price_cents) ? (
                <>
                  {' · '}
                  <strong>₱{formatCentavos(booking.price_cents)}</strong>
                </>
              ) : null}
            </div>
            <div className="upcoming-card-actions">
              {booking.driver_id ? (
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => toggleChat(booking.id, token)}
                >
                  {chatBookingId === booking.id ? t('chat.closeAria') : t('pak.chatWithDriver')}
                </button>
              ) : null}
              <a className="secondary-action" href="/pakyawan">
                {t('pak.viewBooking')}
              </a>
            </div>
            {chatBookingId === booking.id && booking.driver_id ? (
              <PakyawanChat
                bookingId={booking.id}
                senderRole="passenger"
                accessToken={token}
                otherPartyName={t('chat.roleDriver')}
                onClose={() => setChatBookingId(null)}
              />
            ) : null}
          </li>
        ))}
        {deliveries.map(({ booking }) => (
          <li key={booking.id} className="upcoming-card">
            <div className="upcoming-card-top">
              <span className="pak-req-eyebrow">{t('pad.upcomingLabel')}</span>
              <span className="pak-req-status">{booking.status.toUpperCase().replace(/_/g, ' ')}</span>
            </div>
            <div className="upcoming-card-route">
              {booking.pickup_address} → {booking.delivery_address}
            </div>
            <div className="upcoming-card-meta">{booking.preferred_date}</div>
            <div className="upcoming-card-actions">
              <a className="secondary-action" href="/pa-deliver">
                {t('pad.viewBooking')}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
