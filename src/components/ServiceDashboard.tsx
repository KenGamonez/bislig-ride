import { ServiceCarousel } from './ServiceCarousel'

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
  return (
    <section className="service-dashboard" aria-label="Bislig Ride services">
      <header className="home-hero">
        <p className="home-hero-eyebrow">Bislig Ride</p>
        <h1 className="home-hero-title">
          What do you need <span className="home-hero-accent">today?</span>
        </h1>
        <p className="home-hero-subtitle">Choose how you want to move around Bislig City.</p>
      </header>

      <button type="button" className="ride-now-card" onClick={onSelectRideNow}>
        <span className="ride-now-badge">Popular</span>
        <span className="ride-now-title">Ride Now</span>
        <span className="ride-now-copy">Get moving around Bislig City.</span>
        <span className="ride-now-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" />
            <path d="m13 6 6 6-6 6" />
          </svg>
        </span>
      </button>

      <section className="other-ways" aria-label="Other ways to move">
        <p className="other-ways-label">Other ways to move</p>
        <div className="other-ways-rows">
          <a href="/pakyawan" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {pakyawanIcon}
            </span>
            <span className="other-ways-copy">
              <strong>Pakyawan</strong>
              <small>Reserve a vehicle for longer trips.</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>

          <a href="/pa-deliver" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {deliverIcon}
            </span>
            <span className="other-ways-copy">
              <strong>Pa-deliver</strong>
              <small>Send packages across Bislig.</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>

          <a href="/car-rentals" className="other-ways-row">
            <span className="other-ways-icon" aria-hidden="true">
              {carRentalIcon}
            </span>
            <span className="other-ways-copy">
              <strong>Car Rentals</strong>
              <small>Rent a vehicle by the day.</small>
            </span>
            <span className="other-ways-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}