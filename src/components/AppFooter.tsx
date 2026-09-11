import { AnnouncementTicker } from './AnnouncementTicker'

type AppFooterProps = {
  showTicker?: boolean
  className?: string
}

export function AppFooter({ showTicker = true, className }: AppFooterProps) {
  return (
    <footer className={className ? `app-footer ${className}` : 'app-footer'}>
      {showTicker ? <AnnouncementTicker /> : null}
      <div className="app-footer-bar">
        <span className="app-footer-mark" aria-hidden="true">©</span>
        <span className="app-footer-copy">2026 Bislig Ride. All Rights Reserved.</span>
      </div>
    </footer>
  )
}
