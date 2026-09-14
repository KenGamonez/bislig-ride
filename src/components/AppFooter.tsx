import { AnnouncementTicker } from './AnnouncementTicker'
import { useLanguage } from '../lib/i18n'

type AppFooterProps = {
  showTicker?: boolean
  className?: string
}

export function AppFooter({ showTicker = true, className }: AppFooterProps) {
  const { t } = useLanguage()

  return (
    <footer className={className ? `app-footer ${className}` : 'app-footer'}>
      {showTicker ? <AnnouncementTicker /> : null}
      <div className="app-footer-bar">
        <span className="app-footer-mark" aria-hidden="true">©</span>
        <span className="app-footer-copy">{t('footer.rights')}</span>
      </div>
    </footer>
  )
}
