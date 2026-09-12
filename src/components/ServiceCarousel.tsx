import { useRef, useState } from 'react'

type DiscoveryItem = {
  key: string
  kicker: string
  title: string
  description: string
  cta: string
  href?: string
  onSelect?: () => void
}

const discoveryItems: DiscoveryItem[] = [
  {
    key: 'city',
    kicker: 'City hops, anytime',
    title: 'Ride Now',
    description: 'Quick on-demand motorbike rides across Bislig City and nearby barangays.',
    cta: 'Ride Now',
  },
  {
    key: 'trips',
    kicker: 'Family trips & events',
    title: 'Pakyawan',
    description: 'Private transportation for out-of-town trips, airport transfers, and gatherings.',
    cta: 'Book Pakyawan',
    href: '/pakyawan',
  },
  {
    key: 'groceries',
    kicker: 'Groceries to your door',
    title: 'Pasabuy',
    description: 'Let a trusted rider handle your Palengke and grocery runs.',
    cta: 'Try Pasabuy',
    href: '/pasabuy',
  },
  {
    key: 'deliver',
    kicker: 'Packages across Bislig',
    title: 'Pa-deliver',
    description: 'Send documents, parcels, and small packages around the city.',
    cta: 'Pa-deliver',
    href: '/pa-deliver',
  },
  {
    key: 'cars',
    kicker: 'Cars for the day',
    title: 'Car Rentals',
    description: 'Rent a sedan, SUV, or van for your errands — self-drive or with a driver.',
    cta: 'Car Rentals',
    href: '/car-rentals',
  },
]

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ServiceCarousel({ onSelectRideNow }: { onSelectRideNow: () => void }) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const items = discoveryItems.map((item) =>
    item.key === 'city' ? { ...item, onSelect: onSelectRideNow } : item,
  )

  const handleScroll = () => {
    const track = trackRef.current
    if (!track) return

    const card = track.querySelector<HTMLElement>('.discover-card')
    if (!card) return

    const gap = 14
    const step = card.offsetWidth + gap
    const index = Math.round(track.scrollLeft / step)
    setActiveIndex(Math.max(0, Math.min(index, items.length - 1)))
  }

  const handleDotSelect = (index: number) => {
    const track = trackRef.current
    if (!track) return

    const card = track.querySelectorAll<HTMLElement>('.discover-card')[index]
    if (!card) return

    track.scrollTo({
      left: card.offsetLeft,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  return (
    <section className="discover-section" aria-labelledby="discover-heading">
      <div className="home-section-heading">
        <p className="eyebrow">More than a ride</p>
        <h2 id="discover-heading">
          One local platform for getting around,
          <span className="hero-accent"> sending things &amp; getting things done.</span>
        </h2>
      </div>

      <div
        className="discover-carousel"
        ref={trackRef}
        onScroll={handleScroll}
        aria-label="Discover more ways to use Bislig Ride"
      >
        {items.map((item) => {
          const cardContent = (
            <>
              <span className="discover-kicker">{item.kicker}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <span className="discover-cta">
                {item.cta}
                <span className="discover-cta-arrow" aria-hidden="true">→</span>
              </span>
            </>
          )

          if (item.href) {
            return (
              <a className="discover-card" href={item.href} key={item.key}>
                {cardContent}
              </a>
            )
          }

          return (
            <button type="button" className="discover-card" onClick={item.onSelect} key={item.key}>
              {cardContent}
            </button>
          )
        })}
      </div>

      <div className="carousel-dots" role="tablist" aria-label="Discovery card pagination">
        {items.map((item, index) => (
          <button
            type="button"
            key={item.key}
            role="tab"
            className={index === activeIndex ? 'carousel-dot is-active' : 'carousel-dot'}
            aria-label={`Go to card ${index + 1} of ${items.length}: ${item.title}`}
            aria-selected={index === activeIndex}
            onClick={() => handleDotSelect(index)}
          />
        ))}
      </div>
    </section>
  )
}