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
    kicker: 'Everyday trips',
    title: 'City hops, anytime',
    description: 'Quick on-demand motorbike rides across Bislig City and nearby barangays.',
    cta: 'Ride Now',
  },
  {
    key: 'trips',
    kicker: 'Whole-day trips',
    title: 'Family trips & events',
    description: 'A private Pakyawan vehicle for out-of-town trips, airport transfers, and gatherings.',
    cta: 'Book Pakyawan',
    href: '/pakyawan',
  },
  {
    key: 'groceries',
    kicker: 'Shop for you',
    title: 'Groceries to your door',
    description: 'Let a trusted runner handle your palengke and grocery runs around town.',
    cta: 'Try Pasabuy',
    href: '/pasabuy',
  },
  {
    key: 'deliver',
    kicker: 'Same-day sending',
    title: 'Packages across Bislig',
    description: 'Send documents, parcels, and small items to any barangay in the city.',
    cta: 'Pa-deliver',
    href: '/pa-deliver',
  },
  {
    key: 'cars',
    kicker: 'Ride in comfort',
    title: 'Cars for the day',
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
      <div className="discover-heading">
        <p className="eyebrow">Also available</p>
        <h2 id="discover-heading">Discover <span className="hero-accent">Bislig Ride</span></h2>
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