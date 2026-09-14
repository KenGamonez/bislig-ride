import { useRef, useState } from 'react'
import { useLanguage } from '../lib/i18n'

type DiscoveryItem = {
  key: string
  kicker: string
  title: string
  description: string
  cta: string
  href?: string
  onSelect?: () => void
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ServiceCarousel({ onSelectRideNow }: { onSelectRideNow: () => void }) {
  const { t } = useLanguage()
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const discoveryItems: DiscoveryItem[] = [
    {
      key: 'city',
      kicker: t('carousel.city.kicker'),
      title: t('carousel.city.title'),
      description: t('carousel.city.desc'),
      cta: t('carousel.city.cta'),
    },
    {
      key: 'trips',
      kicker: t('carousel.trips.kicker'),
      title: t('carousel.trips.title'),
      description: t('carousel.trips.desc'),
      cta: t('carousel.trips.cta'),
      href: '/pakyawan',
    },
    {
      key: 'deliver',
      kicker: t('carousel.deliver.kicker'),
      title: t('carousel.deliver.title'),
      description: t('carousel.deliver.desc'),
      cta: t('carousel.deliver.cta'),
      href: '/pa-deliver',
    },
    {
      key: 'cars',
      kicker: t('carousel.cars.kicker'),
      title: t('carousel.cars.title'),
      description: t('carousel.cars.desc'),
      cta: t('carousel.cars.cta'),
      href: '/car-rentals',
    },
  ]

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
        <p className="eyebrow">{t('carousel.kicker')}</p>
        <h2 id="discover-heading">{t('carousel.title1')} <span className="hero-accent">{t('carousel.title2')}</span></h2>
      </div>

      <div
        className="discover-carousel"
        ref={trackRef}
        onScroll={handleScroll}
        aria-label={t('carousel.aria')}
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

      <div className="carousel-dots" role="tablist" aria-label={t('carousel.aria')}>
        {items.map((item, index) => (
          <button
            type="button"
            key={item.key}
            role="tab"
            className={index === activeIndex ? 'carousel-dot is-active' : 'carousel-dot'}
            aria-label={t('carousel.dot', { index: index + 1, total: items.length, title: item.title })}
            aria-selected={index === activeIndex}
            onClick={() => handleDotSelect(index)}
          />
        ))}
      </div>
    </section>
  )
}