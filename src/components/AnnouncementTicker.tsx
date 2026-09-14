import { useLanguage } from '../lib/i18n'

type AnnouncementTickerProps = {
  variant?: 'flow' | 'fixed'
  className?: string
}

const blank = [undefined, undefined, undefined, undefined]

export function AnnouncementTicker({ variant = 'flow', className }: AnnouncementTickerProps) {
  const { t } = useLanguage()

  const segment = (
    <>
      <span>{t('ticker.onboarding')}</span>
      <span className="ticker-dot" aria-hidden="true" />
      <span>{t('ticker.moreRides')}</span>
      <span className="ticker-dot" aria-hidden="true" />
    </>
  )

  return (
    <div
      className={
        variant === 'fixed'
          ? `announcement-ticker is-fixed${className ? ` ${className}` : ''}`
          : `announcement-ticker${className ? ` ${className}` : ''}`
      }
      role="marquee"
      aria-label={t('ticker.aria')}
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
