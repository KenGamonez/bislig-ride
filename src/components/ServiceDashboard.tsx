import { ServiceCard } from './ServiceCard'
import { ServiceCarousel } from './ServiceCarousel'

const rideIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3l4 4-4 4" />
    <path d="M12 7H4" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H4" />
  </svg>
)

const pasabuyIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
)

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
      <header className="service-greeting">
        <div className="service-greeting-copy">
          <p className="eyebrow">Bislig Ride</p>
          <h1>What do you need <span className="hero-accent">today?</span></h1>
          <p className="subtitle">Choose how you want to move around Bislig City.</p>
        </div>
      </header>

      <div className="service-layout">
        <div className="service-layout-ride">
          <ServiceCard
            variant="primary"
            badge="Popular"
            title="Ride Now"
            description="On-demand rides around Bislig City & Bislig"
            icon={rideIcon}
            onSelect={onSelectRideNow}
          />
        </div>

        <div className="service-rail" aria-label="Other ways to move">
          <p className="service-rail-label">Other ways to move</p>
          <div className="service-rail-rows">
            <ServiceCard
              title="Pasabuy"
              description="Get items shopped & handed over in Bislig"
              icon={pasabuyIcon}
              compact
              disabled
              badge="Coming soon"
            />
            <ServiceCard
              href="/pakyawan"
              title="Pakyawan"
              description="Reserve a vehicle for long-distance or out-of-town trips, family travel, and group transportation."
              icon={pakyawanIcon}
              compact
            />
            <ServiceCard
              href="/car-rentals"
              title="Car Rentals"
              description="Self-drive cars & vans by the day"
              icon={carRentalIcon}
              compact
            />
            <ServiceCard
              href="/pa-deliver"
              title="Pa-deliver"
              description="Send packages across Bislig"
              icon={deliverIcon}
              compact
            />
          </div>
        </div>
      </div>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}
