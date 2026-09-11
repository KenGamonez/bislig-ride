import { ServiceCard } from './ServiceCard'
import { ServiceCarousel } from './ServiceCarousel'

const rideIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3 4 7l4 4" />
    <path d="M4 7h16" />
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
    <path d="M4 16h-1v-5l1.8-4.6A2 2 0 0 1 6.6 5h10.8a2 2 0 0 1 1.8 1.4L21 11v5h-1" />
    <path d="M5 16v-4h14v4" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
  </svg>
)

const deliverIcon = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="M3.3 7 12 12l8.7-5" />
    <path d="M12 22V12" />
  </svg>
)

type ServiceDashboardProps = {
  onSelectRideNow: () => void
}

export function ServiceDashboard({ onSelectRideNow }: ServiceDashboardProps) {
  return (
    <section className="service-dashboard" aria-label="Bislig Ride services">
      <header className="service-greeting">
        <p className="eyebrow">Bislig Ride</p>
        <h1>What do you need <span className="hero-accent">today?</span></h1>
        <p className="subtitle">Choose a service and get started.</p>
      </header>

      <div className="service-grid">
        <ServiceCard
          variant="primary"
          badge="Popular"
          title="Ride Now"
          description="On-demand motorbike rides around Bislig City"
          icon={rideIcon}
          onSelect={onSelectRideNow}
        />
        <ServiceCard
          href="/pasabuy"
          title="Pasabuy"
          description="We shop and hand over your items"
          icon={pasabuyIcon}
        />
        <ServiceCard
          href="/pakyawan"
          title="Pakyawan"
          description="Scheduled private & whole-day trips"
          icon={pakyawanIcon}
        />
        <ServiceCard
          href="/car-rentals"
          title="Car Rentals"
          description="Self-drive cars & vans by the day"
          icon={carRentalIcon}
        />
        <ServiceCard
          href="/pa-deliver"
          title="Pa-deliver"
          description="Send packages across Bislig"
          icon={deliverIcon}
        />
      </div>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />
    </section>
  )
}