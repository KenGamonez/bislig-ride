import bisligLogo from '../assets/Bislig Hub logo.png'
import { HeaderWeather } from './HeaderWeather'
import { LanguageToggle } from './LanguageToggle'
import { useLanguage } from '../lib/i18n'

export type AppViewMode = 'Rider' | 'driver' | 'admin'

export type AppHeaderDesktopNavItem = {
  label: string
  href: string
  className?: string
}

type AppHeaderProps = {
  view: AppViewMode
  onViewChange?: (view: AppViewMode) => void
  primaryLabel: string
  primaryBrief?: string
  onPrimaryAction: () => void
  desktopNavItems?: AppHeaderDesktopNavItem[]
  simplified?: boolean
}

export function AppHeader({ view, onViewChange, primaryLabel, onPrimaryAction, desktopNavItems, simplified = false }: AppHeaderProps) {
  const { t } = useLanguage()

  const openDriverLogin = () => {
    onViewChange?.('driver')
  }

  if (simplified) {
    return (
      <header className="app-header app-header--simplified">
        <div className="header-inner">
          <div className="brand-block">
            <a href="/" className="brand-link">
              <img src={bisligLogo} alt="Bislig Hub logo" className="brand-logo" />
            </a>
          </div>

          <div className="header-right-controls">
            <HeaderWeather />
            <span className="header-utility-divider" aria-hidden="true"></span>
            <LanguageToggle />
          </div>
        </div>
        <div className="header-divider" aria-hidden="true"></div>
      </header>
    )
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-block">
            <a href="/" className="brand-link">
              <img src={bisligLogo} alt="Bislig Hub logo" className="brand-logo" />
            </a>
          </div>

          <span className="beta-indicator" title={t('nav.betaTitle')}>
            <span className="beta-indicator-label">{t('nav.beta')}</span>
          </span>

          <nav className="top-nav desktop-nav" aria-label={t('nav.ariaMain')}>
            {desktopNavItems ? (
              desktopNavItems.map((item) => (
                <a
                  key={`${item.href}:${item.label}`}
                  className={item.className ?? 'nav-link'}
                  href={item.href}
                >
                  {item.label}
                </a>
              ))
            ) : (
              <>
                <a className={view === 'Rider' ? 'nav-link is-active' : 'nav-link'} href="/">{t('nav.home')}</a>

                <a className="nav-link nav-link-pakyawan" href="/pakyawan">{t('nav.bookPakyawan')}</a>

                <button
                  type="button"
                  className="nav-button"
                  onClick={onPrimaryAction}
                >
                  {primaryLabel}
                </button>

                <button
                  type="button"
                  className="nav-button"
                  onClick={openDriverLogin}
                >
                  {t('nav.driverLogin')}
                </button>

                <a className="nav-link" href="/contact">{t('nav.contact')}</a>

                <a className="nav-cta" href="/become-a-driver">{t('nav.becomeDriver')}</a>
              </>
            )}
          </nav>

          <div className="header-right-controls">
            <HeaderWeather />
            <span className="header-utility-divider" aria-hidden="true"></span>
            <LanguageToggle />
          </div>
        </div>
      </header>
    </>
  )
}