import { useEffect, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'

export type AppViewMode = 'Rider' | 'driver' | 'admin'

type AppHeaderProps = {
  view: AppViewMode
  onViewChange?: (view: AppViewMode) => void
  primaryLabel: string
  onPrimaryAction: () => void
}

export function AppHeader({ view, onViewChange, primaryLabel, onPrimaryAction }: AppHeaderProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

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

          <nav className="top-nav desktop-nav" aria-label="Main navigation">
            <a className={view === 'Rider' ? 'nav-link is-active' : 'nav-link'} href="/">Home</a>

            <a className="nav-link nav-link-pakyawan" href="/pakyawan">Book Pakyawan</a>

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
              Driver Login
            </button>

            <a className="nav-link" href="/contact">Contact</a>

            <a className="nav-cta" href="/become-a-driver">Become a Driver</a>
          </nav>

          <button
            type="button"
            className={isMobileNavOpen ? 'mobile-menu-toggle is-open' : 'mobile-menu-toggle'}
            aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
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
            aria-label="Close navigation menu"
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

          <nav className="mobile-nav-links" aria-label="Mobile navigation">
            <a
              className="mobile-nav-item"
              href="/pakyawan"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">Book Pakyawan</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <path d="M13 5v2" />
                  <path d="M13 17v2" />
                  <path d="M13 11v2" />
                </svg>
              </span>
            </a>

            <button
              type="button"
              className="mobile-nav-item"
              onClick={() => {
                onPrimaryAction()
                setIsMobileNavOpen(false)
              }}
            >
              <span className="mobile-nav-label">
                {primaryLabel}
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

            <button
              type="button"
              className="mobile-nav-item"
              onClick={openDriverLogin}
            >
              <span className="mobile-nav-label">Driver Login</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            </button>

            <a
              className="mobile-nav-item"
              href="/contact"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">Contact</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
                </svg>
              </span>
            </a>

            <a
              className="mobile-nav-item mobile-nav-driver"
              href="/become-a-driver"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">Become a Driver</span>
              <span className="mobile-nav-arrow" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m19.07 4.93-4.24 4.24" />
                  <path d="m8.93 4.93 4.24 4.24" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </span>
            </a>
          </nav>

          <div className="mobile-nav-footer">
            <span>Bislig City</span>
            <span>Ride local. Move freely.</span>
          </div>
        </div>
      </div>
    </>
  )
}