import { useState } from 'react'
import { useAppInstall } from '../lib/appInstall'
import { useLanguage } from '../lib/i18n'

export type MobileBottomNavTab = 'home' | 'rides' | 'install'

type MobileBottomNavProps = {
  activeTab: MobileBottomNavTab
  onTabChange: (tab: MobileBottomNavTab) => void
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  const { t } = useLanguage()
  const { canInstall, isInstalled, isIOS, promptInstall } = useAppInstall()
  const [showInstallSheet, setShowInstallSheet] = useState(false)

  const handleInstallTap = () => {
    if (canInstall && !isInstalled) {
      void promptInstall().then((outcome) => {
        if (outcome === 'unavailable') {
          setShowInstallSheet(true)
        }
      })
      return
    }

    setShowInstallSheet(true)
  }

  return (
    <>
    <nav className="mobile-bottom-nav" aria-label={t('header.ariaPrimary')}>
      <button
        type="button"
        className={activeTab === 'home' ? 'bottom-nav-item is-active' : 'bottom-nav-item'}
        aria-current={activeTab === 'home' ? 'page' : undefined}
        onClick={() => onTabChange('home')}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9.5 21v-6h5v6" />
          </svg>
        </span>
        <span className="bottom-nav-label">{t('nav.home')}</span>
        <span className="bottom-nav-indicator" aria-hidden="true"></span>
      </button>

      <button
        type="button"
        className={activeTab === 'rides' ? 'bottom-nav-item is-active' : 'bottom-nav-item'}
        aria-current={activeTab === 'rides' ? 'page' : undefined}
        onClick={() => onTabChange('rides')}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
            <path d="M9 7h6" />
            <path d="M9 11h6" />
          </svg>
        </span>
        <span className="bottom-nav-label">{t('nav.myRides')}</span>
        <span className="bottom-nav-indicator" aria-hidden="true"></span>
      </button>

      <button
        type="button"
        className="bottom-nav-item"
        onClick={handleInstallTap}
        aria-label={t('nav.install')}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v11" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </span>
        <span className="bottom-nav-label">{t('nav.install')}</span>
        <span className="bottom-nav-indicator" aria-hidden="true"></span>
      </button>
    </nav>
      {showInstallSheet ? (
        <div
          className="ride-chat-overlay"
          role="presentation"
          onClick={() => setShowInstallSheet(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-install-title"
            className="remove-driver-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="app-install-title">{t('install.title')}</h3>
            {isInstalled ? (
              <p className="confirm-copy">{t('install.installedNote')}</p>
            ) : isIOS ? (
              <div className="confirm-copy">
                <p>{t('install.iosStep1')}</p>
                <p>{t('install.iosStep2')}</p>
                <p>{t('install.iosStep3')}</p>
              </div>
            ) : (
              <p className="confirm-copy">{t('install.unsupportedNote')}</p>
            )}
            <div className="form-actions">
              <button type="button" className="secondary-action" onClick={() => setShowInstallSheet(false)}>
                {t('install.close')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}