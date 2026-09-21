import { ServiceCarousel } from './ServiceCarousel'
import { useLanguage } from '../lib/i18n'

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

      <div className="service-accordion">
        <div className="service-accordion-item ride-item is-open">
          <div className="service-accordion-header">
            <span className="service-accordion-number">01</span>
            <span className="service-accordion-label">{t('dash.rideNow')}</span>
            <span className="service-accordion-chevron" aria-hidden="true">→</span>
          </div>
          <div className="service-accordion-panel is-open">
            <p className="service-accordion-desc">{t('dash.rideNowCopy')}</p>
          </div>
        </div>

        <div className="service-accordion-item pakyawan-item is-open">
          <div className="service-accordion-header">
            <span className="service-accordion-number">02</span>
            <span className="service-accordion-label">
              <strong>{t('dash.pakyawan')}</strong>
              <small>{t('dash.pakyawanDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true">→</span>
          </div>
          <div className="service-accordion-panel is-open">
            {/* Pakyawan content */}
          </div>
        </div>

        <div className="service-accordion-item pa-deliver-item is-open">
          <div className="service-accordion-header">
            <span className="service-accordion-number">03</span>
            <span className="service-accordion-label">
              <strong>{t('dash.paDeliver')}</strong>
              <small>{t('dash.paDeliverDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true">→</span>
          </div>
          <div className="service-accordion-panel is-open">
            {/* Pa-Deliver content */}
          </div>
        </div>

        <div className="service-accordion-item car-rental-item is-open">
          <div className="service-accordion-header">
            <span className="service-accordion-number">04</span>
            <span className="service-accordion-label">
              <strong>{t('dash.carRentals')}</strong>
              <small>{t('dash.carRentalsDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true">→</span>
          </div>
          <div className="service-accordion-panel is-open">
            {/* Car Rental content */}
          </div>
        </div>
      </div>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}