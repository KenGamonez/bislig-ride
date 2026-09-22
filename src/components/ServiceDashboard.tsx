import { useState } from 'react'
import { ServiceCarousel } from './ServiceCarousel'
import { useLanguage } from '../lib/i18n'

type ServiceDashboardProps = {
  onSelectRideNow: () => void
}

export function ServiceDashboard({ onSelectRideNow }: ServiceDashboardProps) {
  const { t } = useLanguage()
  const [openSection, setOpenSection] = useState('ride')

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
        <div className={openSection === 'ride' ? 'service-accordion-item ride-item is-open' : 'service-accordion-item ride-item'}>
          <button
            type="button"
            className="service-accordion-header"
            aria-expanded={openSection === 'ride'}
            onClick={() => setOpenSection('ride')}
          >
            <span className="service-accordion-number">01</span>
            <span className="service-accordion-label">
              <strong>{t('dash.rideNow')}<span className="service-accordion-popular">{t('dash.popular')}</span></strong>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true"></span>
          </button>
          <div className={openSection === 'ride' ? 'service-accordion-panel is-open' : 'service-accordion-panel'}>
            <p className="service-accordion-desc">{t('dash.rideNowCopy')}</p>
            <button type="button" className="service-accordion-action service-accordion-action-primary" onClick={onSelectRideNow}>
              {t('dash.rideNow')}
              <span className="service-accordion-action-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <div className={openSection === 'pakyawan' ? 'service-accordion-item service-pakyawan is-open' : 'service-accordion-item service-pakyawan'}>
          <button
            type="button"
            className="service-accordion-header"
            aria-expanded={openSection === 'pakyawan'}
            onClick={() => setOpenSection('pakyawan')}
          >
            <span className="service-accordion-number">02</span>
            <span className="service-accordion-label">
              <strong>{t('dash.pakyawan')}</strong>
              <small>{t('dash.pakyawanDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true"></span>
          </button>
          <div className={openSection === 'pakyawan' ? 'service-accordion-panel is-open' : 'service-accordion-panel'}>
            <a className="service-accordion-action" href="/pakyawan">
              {t('dash.pakyawan')}
              <span className="service-accordion-action-arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className={openSection === 'pa-deliver' ? 'service-accordion-item pa-deliver-item is-open' : 'service-accordion-item pa-deliver-item'}>
          <button
            type="button"
            className="service-accordion-header"
            aria-expanded={openSection === 'pa-deliver'}
            onClick={() => setOpenSection('pa-deliver')}
          >
            <span className="service-accordion-number">03</span>
            <span className="service-accordion-label">
              <strong>{t('dash.paDeliver')}</strong>
              <small>{t('dash.paDeliverDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true"></span>
          </button>
          <div className={openSection === 'pa-deliver' ? 'service-accordion-panel is-open' : 'service-accordion-panel'}>
            <a className="service-accordion-action" href="/pa-deliver">
              {t('dash.paDeliver')}
              <span className="service-accordion-action-arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <div className={openSection === 'car-rental' ? 'service-accordion-item car-rental-item is-open' : 'service-accordion-item car-rental-item'}>
          <button
            type="button"
            className="service-accordion-header"
            aria-expanded={openSection === 'car-rental'}
            onClick={() => setOpenSection('car-rental')}
          >
            <span className="service-accordion-number">04</span>
            <span className="service-accordion-label">
              <strong>{t('dash.carRentals')}</strong>
              <small>{t('dash.carRentalsDesc')}</small>
            </span>
            <span className="service-accordion-chevron" aria-hidden="true"></span>
          </button>
          <div className={openSection === 'car-rental' ? 'service-accordion-panel is-open' : 'service-accordion-panel'}>
            <a className="service-accordion-action" href="/car-rentals">
              {t('dash.carRentals')}
              <span className="service-accordion-action-arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </div>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}