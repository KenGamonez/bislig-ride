import type { ReactNode } from 'react'

type ServiceCardProps = {
  title: string
  description: string
  icon: ReactNode
  href?: string
  onSelect?: () => void
  variant?: 'secondary' | 'primary' | 'row'
  badge?: string
  compact?: boolean
  disabled?: boolean
}

export function ServiceCard({
  title,
  description,
  icon,
  href,
  onSelect,
  variant = 'secondary',
  badge,
  compact = false,
  disabled = false,
}: ServiceCardProps) {
  const variantClass =
    variant === 'primary' ? 'service-card--primary'
    : variant === 'row' ? 'service-card--row'
    : compact ? 'service-card--row'
    : ''

  const className = ['service-card', variantClass, disabled ? 'service-card--disabled' : '']
    .filter(Boolean)
    .join(' ')

  const copy = (
    <span className="service-card-copy" aria-hidden={disabled}>
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
  )

  const arrow = disabled
    ? <span className="service-card-arrow" aria-hidden="true">•</span>
    : <span className="service-card-arrow" aria-hidden="true">→</span>

  const content = (
    <>
      <span className="service-card-icon" aria-hidden="true">
        {icon}
      </span>
      {copy}
      {arrow}
      {badge ? <span className="service-card-badge">{badge}</span> : null}
    </>
  )

  if (disabled) {
    return <div className={className} aria-disabled="true">{content}</div>
  }

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