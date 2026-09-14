import { ServiceCarousel } from './ServiceCarousel'
import { useLanguage } from '../lib/i18n'

const pakyawanIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4" />
    <path d="M8 2v4" />
    <path d="M3 10h18" />
    <path d="M8 14h.01" />
    <path d="M12 14h.01" />
    <path d="M16 14h.01" />
    <path d="M8 18h.01" />
    <path d="M12 18h.01" />
    <path d="M16 18h.01" />
  </svg>
)

const carRentalIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 17h-1a1 1 0 0 1-1-1v-5l2-4.5A2 2 0 0 1 5.8 5.5H18.2a2 2 0 0 1 1.8 1.5L22 11v5a1 1 0 0 1-1 1h-1a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0Z" />
    <path d="M6 12h12" />
    <circle cx="7" cy="17" r="1.5" />
    <circle cx="17" cy="17" r="1.5" />
    <path d="M19 11l-2-4m4 4H3" />
  </svg>
)

const deliverIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20" />
    <path d="M5 9 12 2l7 7" />
    <path d="M15 15l-3 3-3-3" />
  </svg>
)

type ServiceDashboardProps = {
  onSelectRideNow: () => void
}

export function ServiceDashboard({ onSelectRideNow }: ServiceDashboardProps) {
  const { t } = useLanguage()

  return (
    <section className="service-dashboard" aria-label={t('dash.eyebrow')}>
      <header className="home-hero">
        <p className="home-hero-eyebrow">{t('dash.eyebrow')}</p>
        <h1 className="home-hero-title">
          {t('dash.title1')} <span className="home-hero-accent">{t('dash.title2')}</span>
        </h1>
        <p className="home-hero-subtitle">{t('dash.subtitle')}</p>
      </header>

      <button type="button" className="ride-now-card" onClick={onSelectRideNow}>
        <span className="ride-now-badge">{t('dash.popular')}</span>
        <span className="ride-now-title">{t('dash.rideNow')}</span>
        <span className="ride-now-copy">{t('dash.rideNowCopy')}</span>
        <span className="ride-now-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      <section className="other-ways" aria-label={t('dash.otherWays')}>
        <p className="other-ways-label">{t('dash.otherWays')}</p>
        <div className="other-ways-rows">
          <a href="/pakyawan" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {pakyawanIcon}
            </span>
            <span className="other-ways-copy">
              <strong>{t('dash.pakyawan')}</strong>
              <small>{t('dash.pakyawanDesc')}</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>

          <a href="/pa-deliver" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {deliverIcon}
            </span>
            <span className="other-ways-copy">
              <strong>{t('dash.paDeliver')}</strong>
              <small>{t('dash.paDeliverDesc')}</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>

          <a href="/car-rentals" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {carRentalIcon}
            </span>
            <span className="other-ways-copy">
              <strong>{t('dash.carRentals')}</strong>
              <small>{t('dash.carRentalsDesc')}</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}