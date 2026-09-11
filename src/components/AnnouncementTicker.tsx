type AnnouncementTickerProps = {
  variant?: 'flow' | 'fixed'
  className?: string
}

const segment = (
  <>
    <span>Bislig Ride is currently onboarding our founding drivers</span>
    <span className="ticker-dot" aria-hidden="true" />
    <span>More rides coming soon</span>
    <span className="ticker-dot" aria-hidden="true" />
  </>
)

const blank = [undefined, undefined, undefined, undefined]

export function AnnouncementTicker({ variant = 'flow', className }: AnnouncementTickerProps) {
  return (
    <div
      className={
        variant === 'fixed'
          ? `announcement-ticker is-fixed${className ? ` ${className}` : ''}`
          : `announcement-ticker${className ? ` ${className}` : ''}`
      }
      role="marquee"
      aria-label="Bislig Ride announcement: currently onboarding founding drivers"
    >
      <div className="ticker-track">
        {blank.map((_, index) => (
          <span className="ticker-content" key={index} aria-hidden={index > 0}>
            {segment}
          </span>
        ))}
      </div>
    </div>
  )
}
