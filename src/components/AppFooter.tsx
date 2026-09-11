import { AnnouncementTicker } from './AnnouncementTicker'

type AppFooterProps = {
  showTicker?: boolean
  className?: string
}

export function AppFooter({ showTicker = true, className }: AppFooterProps) {
  const year = new Date().getFullYear()

  return (
    <footer className={className ? `app-footer ${className}` : 'app-footer'}>
      {showTicker ? <AnnouncementTicker /> : null}
      <div className="app-footer-bar">
        <span className="app-footer-mark" aria-hidden="true">©</span>
        <span className="app-footer-copy">{year} Bislig Ride</span>
      </div>
    </footer>
  )
}
