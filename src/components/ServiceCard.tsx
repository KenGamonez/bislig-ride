import type { ReactNode } from 'react'

type ServiceCardProps = {
  title: string
  description: string
  icon: ReactNode
  href?: string
  onSelect?: () => void
  variant?: 'secondary' | 'primary'
  cta?: string
}

export function ServiceCard({
  title,
  description,
  icon,
  href,
  onSelect,
  variant = 'secondary',
  cta,
}: ServiceCardProps) {
  const className =
    variant === 'primary'
      ? 'service-card service-card--primary'
      : 'service-card'

  const content = (
    <>
      <span className="service-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="service-card-copy">
        <strong>{title}</strong>
        <small>{description}</small>
        {cta ? (
          <span className="service-card-cta">
            <span className="service-card-cta-label">{cta}</span>
            <span className="service-card-cta-arrow" aria-hidden="true">→</span>
          </span>
        ) : null}
      </span>
      {cta ? null : <span className="service-card-arrow" aria-hidden="true">→</span>}
    </>
  )

  if (href) {
    return (
      <a className={className} href={href}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" className={className} onClick={onSelect}>
      {content}
    </button>
  )
}