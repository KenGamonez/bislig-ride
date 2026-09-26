import { useLanguage } from '../lib/i18n'
import { LiquidField } from './LiquidField'

type ServiceDashboardProps = {
  onSelectRideNow: () => void
  onSelectDriverLogin?: () => void
}

interface ServiceItem {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  href?: string
  onClick?: () => void
  isPrimary?: boolean
  badge?: string
}

const transportServices: ServiceItem[] = [
  {
    id: 'ride-now',
    label: 'Ride Now',
    description: 'Get a ride around Bislig — quick pickup, fair fare.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
      </svg>
    ),
    onClick: () => {},
    isPrimary: true,
    badge: 'POPULAR'
  },
  {
    id: 'pakyawan',
    label: 'Pakyawan',
    description: 'Book a vehicle for longer trips or private use.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="M13 5v2" />
        <path d="M13 17v2" />
        <path d="M13 11v2" />
      </svg>
    ),
    href: '/pakyawan'
  },
  {
    id: 'pa-deliver',
    label: 'Pa-deliver',
    description: 'Send packages across Bislig.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 2v20" />
        <path d="M5 9 12 2l7 7" />
        <path d="M15 15l-3 3-3-3" />
      </svg>
    ),
    href: '/pa-deliver'
  },
  {
    id: 'car-rentals',
    label: 'Car Rentals',
    description: 'Rent a vehicle by the day.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 17h-1a1 1 0 0 1-1-1v-5l2-4.5A2 2 0 0 1 5.8 5.5H18.2a2 2 0 0 1 1.8 1.5L22 11v5a1 1 0 0 1-1 1h-1a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0Z" />
        <path d="M6 12h12" />
        <circle cx="7" cy="17" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
      </svg>
    ),
    href: '/car-rentals'
  }
]

const driverServices: ServiceItem[] = [
  {
    id: 'become-driver',
    label: 'Become a Driver',
    description: 'Apply once, drive for rides, pakyawan & delivery.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    href: '/become-a-driver'
  },
  {
    id: 'driver-login',
    label: 'Driver Login',
    description: 'Already driving? Open your dashboard.',
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    onClick: () => {}
  }
]

export function ServiceDashboard({ onSelectRideNow, onSelectDriverLogin }: ServiceDashboardProps) {
  const { t } = useLanguage()

  const handleServiceActivate = (service: ServiceItem) => {
    if (service.id === 'ride-now') {
      onSelectRideNow()
      return
    }
    if (service.id === 'driver-login') {
      onSelectDriverLogin?.()
      return
    }
    if (service.href) {
      window.location.href = service.href
    }
  }

  return (
    <section className="service-dashboard" aria-label={t('dash.eyebrow')}>
      <LiquidField />
      {/* Hero Section */}
      <header className="home-hero">
        <p className="home-hero-eyebrow">YOUR CITY. CONNECTED.</p>
        <h1 className="home-hero-title">{t('dash.title1')}</h1>
        <p className="home-hero-subtitle">{t('dash.subtitle')}</p>
      </header>

      {/* Transport Services Section */}
      <div className="service-section">
        <div className="service-grid">
          {transportServices.map((service) => (
            <article
              key={service.id}
              className={`service-card${service.isPrimary ? ' service-card--primary' : ''}`}
              onClick={() => {
                if (service.onClick) {
                  service.onClick()
                }
                handleServiceActivate(service)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (service.onClick) service.onClick()
                  handleServiceActivate(service)
                }
              }}
            >
              <div className="service-card-icon" aria-hidden="true">
                {service.icon}
              </div>
              <div className="service-card-copy">
                <span className="service-card-title-row">
                  <strong>{service.label}</strong>
                  {service.isPrimary && service.badge && (
                    <span className="service-card-badge">{service.badge}</span>
                  )}
                </span>
                <small>{service.description}</small>
              </div>
              <span className="service-card-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </article>
          ))}
        </div>
      </div>

      {/* Driver Section */}
      <div className="service-section driver-section">
        <div className="service-section-header">
          <p className="service-section-label">{t('dash.driverLabel')}</p>
          <h2 className="service-section-title">{t('dash.driverTitle')}</h2>
          <p className="service-section-subtitle">{t('dash.driverSubtitle')}</p>
        </div>

        <div className="service-grid driver-grid">
          {driverServices.map((service) => (
            <article
              key={service.id}
              className="service-card"
              onClick={() => {
                if (service.onClick) {
                  service.onClick()
                }
                handleServiceActivate(service)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (service.onClick) service.onClick()
                  handleServiceActivate(service)
                }
              }}
            >
              <div className="service-card-icon" aria-hidden="true">
                {service.icon}
              </div>
              <div className="service-card-copy">
                <strong>{t(`dash.${service.id === 'become-driver' ? 'becomeDriver' : 'driverLogin'}`)}</strong>
                <small>{t(`dash.${service.id === 'become-driver' ? 'becomeDriverDesc' : 'driverLoginDesc'}`)}</small>
              </div>
              <span className="service-card-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m12 5 7 7-7 7" />
                </svg>
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}