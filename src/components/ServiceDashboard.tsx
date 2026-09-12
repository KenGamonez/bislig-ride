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
  const handleExploreServices = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    const section = document.getElementById('services')
    if (!section) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <section className="service-dashboard" aria-label="Bislig Ride home">
      <section className="home-hero" aria-labelledby="home-hero-heading">
        <p className="eyebrow">Bislig Ride</p>
        <h1 id="home-hero-heading">
          Get around Bislig.
          <span className="hero-accent">Your way.</span>
        </h1>
        <p className="subtitle">Rides, deliveries, Pasabuy, Pakyawan, and car rentals — all in one place.</p>

        <div className="home-hero-actions">
          <button type="button" className="primary-action home-primary-cta" onClick={onSelectRideNow}>
            Request a Ride &rarr;
          </button>
          <a className="home-secondary-link" href="#services" onClick={handleExploreServices}>
            Explore Services &rarr;
          </a>
        </div>
      </section>

      <section className="home-services" id="services" aria-labelledby="services-heading">
        <header className="home-section-heading">
          <p className="eyebrow">Available services</p>
          <h2 id="services-heading">
            Everything you need to get around
            <span className="hero-accent"> and get things done.</span>
          </h2>
        </header>

        <div className="service-grid home-service-grid">
          <ServiceCard
            variant="primary"
            title="Ride Now"
            description="On-demand rides around Bislig City"
            icon={rideIcon}
            cta="Ride Now"
            onSelect={onSelectRideNow}
          />
          <ServiceCard
            href="/pasabuy"
            title="Pasabuy"
            description="We shop and bring it to you"
            icon={pasabuyIcon}
            cta="Pasabuy"
          />
          <ServiceCard
            href="/pakyawan"
            title="Pakyawan"
            description="Private &amp; scheduled transportation"
            icon={pakyawanIcon}
            cta="Pakyawan"
          />
          <ServiceCard
            href="/car-rentals"
            title="Car Rentals"
            description="Self-drive cars &amp; vans by the day"
            icon={carRentalIcon}
            cta="Car Rentals"
          />
          <ServiceCard
            href="/pa-deliver"
            title="Pa-deliver"
            description="Send packages across Bislig"
            icon={deliverIcon}
            cta="Pa-deliver"
          />
        </div>
      </section>

      <ServiceCarousel onSelectRideNow={onSelectRideNow} />

      <section className="home-local" aria-labelledby="home-local-heading">
        <p className="eyebrow">Built for Bislig</p>
        <h2 id="home-local-heading">
          One local platform connecting passengers, drivers, and local service partners.
        </h2>
        <ul className="home-local-badges">
          <li>Beta</li>
          <li>Local</li>
          <li>Growing</li>
        </ul>
      </section>

      <section className="home-final-cta" aria-labelledby="home-cta-heading">
        <h2 id="home-cta-heading">Where do you need to go?</h2>
        <p>Start with a ride or explore everything Bislig Ride can do.</p>

        <div className="home-final-actions">
          <button type="button" className="primary-action home-primary-cta" onClick={onSelectRideNow}>
            Request a Ride &rarr;
          </button>
          <a
            className="home-secondary-link"
            href="#services"
            onClick={(event) => {
              event.preventDefault()
              const section = document.getElementById('services')
              if (!section) return
              const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
              section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
            }}
          >
            Explore Services &rarr;
          </a>
        </div>
      </section>
    </section>
  )
}