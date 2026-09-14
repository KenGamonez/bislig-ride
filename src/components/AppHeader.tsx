import { useEffect, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'
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
}

export function AppHeader({ view, onViewChange, primaryLabel, primaryBrief, onPrimaryAction, desktopNavItems }: AppHeaderProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    if (!isMobileNavOpen) return

    const handleMobileNavEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false)
      }
    }

    const handleMobileNavOutsidePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null

      if (
        !target?.closest('.app-header') &&
        !target?.closest('.mobile-nav-panel')
      ) {
        setIsMobileNavOpen(false)
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleMobileNavEscape)
    document.addEventListener('pointerdown', handleMobileNavOutsidePointer)

    const desktopQuery = window.matchMedia('(min-width: 768px)')
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileNavOpen(false)
      }
    }
    desktopQuery.addEventListener('change', handleViewportChange)

    return () => {
      document.body.style.overflow = previousOverflow
      desktopQuery.removeEventListener('change', handleViewportChange)
      document.removeEventListener('keydown', handleMobileNavEscape)
      document.removeEventListener('pointerdown', handleMobileNavOutsidePointer)
    }
  }, [isMobileNavOpen])

  const openDriverLogin = () => {
    onViewChange?.('driver')
    setIsMobileNavOpen(false)
  }

  return (
    <>
      <header className={isMobileNavOpen ? 'app-header mobile-nav-active' : 'app-header'}>
        <div className="header-inner">
          <div className="brand-block">
            <a href="/" className="brand-link">
              <img src={bisligLogo} alt="Bislig Ride logo" className="brand-logo" />
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

          <LanguageToggle />

          <button
            type="button"
            className={isMobileNavOpen ? 'mobile-menu-toggle is-open' : 'mobile-menu-toggle'}
            aria-label={isMobileNavOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-main-navigation"
            onClick={() => setIsMobileNavOpen((current) => !current)}
          >
            <span className="mobile-menu-icon" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>
      </header>

      <div
        id="mobile-main-navigation"
        className={isMobileNavOpen ? 'mobile-nav-panel is-open' : 'mobile-nav-panel'}
        aria-hidden={!isMobileNavOpen}
      >
        <div className="mobile-nav-top">
          <a href="/" className="mobile-nav-brand" onClick={() => setIsMobileNavOpen(false)}>
            <img src={bisligLogo} alt="Bislig Ride logo" className="brand-logo" />
          </a>
          <button
            type="button"
            className="mobile-nav-close"
            aria-label={t('nav.closeMenu')}
            onClick={() => setIsMobileNavOpen(false)}
          >
            <span aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </span>
          </button>
        </div>

        <div className="mobile-nav-scroll">
          <div className="mobile-nav-divider" aria-hidden="true"></div>

          <nav className="mobile-nav-links" aria-label={t('nav.ariaMobile')}>
            <a
              className="mobile-nav-item"
              href="/"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">{t('nav.home')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </span>
            </a>

            <button
              type="button"
              className="mobile-nav-item mobile-nav-driver"
              onClick={openDriverLogin}
            >
              <span className="mobile-nav-label">{t('nav.driverLogin')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            </button>

            <a
              className="mobile-nav-item mobile-nav-driver"
              href="/become-a-driver"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">{t('nav.becomeDriver')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m19.07 4.93-4.24 4.24" />
                  <path d="m8.93 4.93 4.24 4.24" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </span>
            </a>

            <a
              className="mobile-nav-item"
              href="/pakyawan"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">{t('nav.bookPakyawan')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <path d="M13 5v2" />
                  <path d="M13 17v2" />
                  <path d="M13 11v2" />
                </svg>
              </span>
            </a>

            <div
              className="mobile-nav-item mobile-nav-disabled"
              aria-disabled="true"
            >
              <span className="mobile-nav-label">{t('nav.pasabuy')}</span>
              <span className="mobile-nav-badge">{t('nav.comingSoon')}</span>
            </div>

            <a
              className="mobile-nav-item"
              href="/pa-deliver"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">{t('nav.paDeliver')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20" />
                  <path d="M5 9 12 2l7 7" />
                  <path d="M15 15l-3 3-3-3" />
                </svg>
              </span>
            </a>

            <a
              className="mobile-nav-item"
              href="/car-rentals"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">{t('nav.carRentals')}</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 17h-1a1 1 0 0 1-1-1v-5l2-4.5A2 2 0 0 1 5.8 5.5H18.2a2 2 0 0 1 1.8 1.5L22 11v5a1 1 0 0 1-1 1h-1a2.5 2.5 0 0 1-5 0H9a2.5 2.5 0 0 1-5 0Z" />
                  <path d="M6 12h12" />
                  <circle cx="7" cy="17" r="1.5" />
                  <circle cx="17" cy="17" r="1.5" />
                </svg>
              </span>
            </a>

            <button
              type="button"
              className="mobile-nav-item mobile-nav-primary"
              onClick={() => {
                onPrimaryAction()
                setIsMobileNavOpen(false)
              }}
            >
              <span className="mobile-nav-label">
                {primaryLabel}
                {primaryBrief ? <small className="mobile-nav-brief">{primaryBrief}</small> : null}
              </span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2-1Z" />
                  <path d="M8 8h8" />
                  <path d="M8 12h8" />
                  <path d="M8 16h5" />
                </svg>
              </span>
            </button>
          </nav>

          <div className="mobile-nav-footer">
            <span>{t('header.footerCity')}</span>
            <span>{t('header.footerTagline')}</span>
          </div>
        </div>
      </div>
    </>
  )
}