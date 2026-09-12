import type { ReactNode } from 'react'

type ServiceCardProps = {
  title: string
  description: string
  icon: ReactNode
  href?: string
  onSelect?: () => void
  variant?: 'secondary' | 'primary'
  badge?: string
}

export function ServiceCard({
  title,
  description,
  icon,
  href,
  onSelect,
  variant = 'secondary',
  badge,
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
      </span>
      <span className="service-card-arrow" aria-hidden="true">→</span>
      {badge ? <span className="service-card-badge">{badge}</span> : null}
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