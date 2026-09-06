import { useEffect, useRef, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'

export type AppViewMode = 'Rider' | 'driver' | 'admin'

const discoveryCategories = [
  'Restaurants',
  'Hotels & Resorts',
  'Tourist Destinations',
  'Upcoming Events',
  'Local Businesses',
]

type AppHeaderProps = {
  view: AppViewMode
  onViewChange?: (view: AppViewMode) => void
  primaryLabel: string
  onPrimaryAction: () => void
}

export function AppHeader({ view, onViewChange, primaryLabel, onPrimaryAction }: AppHeaderProps) {
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isExploreOpen, setIsExploreOpen] = useState(false)
  const exploreMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!exploreMenuRef.current?.contains(event.target as Node)) {
        setIsExploreOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExploreOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

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
            <a className="nav-link" href="/pakyawan">Book Pakyawan</a>

            <button
              type="button"
              className="nav-button"
              onClick={onPrimaryAction}
            >
              {primaryLabel}
            </button>

            <div
              className="explore-menu"
              ref={exploreMenuRef}
              onMouseEnter={() => setIsExploreOpen(true)}
              onMouseLeave={() => setIsExploreOpen(false)}
            >
              <button
                type="button"
                className="nav-button explore-trigger"
                aria-expanded={isExploreOpen}
                aria-haspopup="true"
                onClick={() => setIsExploreOpen((current) => !current)}
              >
                Explore Bislig <span className="explore-chevron" aria-hidden="true"></span>
              </button>

              <div
                className={isExploreOpen ? 'explore-dropdown open' : 'explore-dropdown'}
                role="menu"
                aria-label="Explore Bislig categories"
              >
                <div className="discovery-list">
                  {discoveryCategories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="discovery-item"
                      role="menuitem"
                      onClick={() => setIsExploreOpen(false)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <a className="nav-cta" href="/become-a-driver">Become a Driver</a>
            <a className="nav-link" href="/contact">Contact</a>

            <div className="desktop-role-divider" aria-hidden="true"></div>

            <div className="desktop-role-switcher" aria-label="Role switcher">
              {(['Rider', 'driver', 'admin'] as AppViewMode[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  className={view === role ? 'role-btn active' : 'role-btn'}
                  onClick={() => onViewChange?.(role)}
                >
                  {role === 'Rider' ? 'Rider' : role === 'driver' ? 'Driver' : 'Admin'}
                </button>
              ))}
            </div>
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
            <span aria-hidden="true">?</span>
          </button>
        </div>

        <div className="mobile-nav-scroll">
          <div className="mobile-nav-group">
            <p className="mobile-nav-section-label">Account / Role</p>
            <div className="mobile-role-list">
              {(['Rider', 'driver', 'admin'] as AppViewMode[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  className={view === role ? 'mobile-role-row active' : 'mobile-role-row'}
                  onClick={() => {
                    onViewChange?.(role)
                    setIsMobileNavOpen(false)
                  }}
                >
                  <span>{role === 'Rider' ? 'Rider' : role === 'driver' ? 'Driver' : 'Admin'}</span>
                  <span className="mobile-role-check" aria-hidden="true"></span>
                </button>
              ))}
            </div>
          </div>

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
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2 1-2-1Z" />
                  <path d="M8 8h8" />
                  <path d="M8 12h8" />
                  <path d="M8 16h5" />
                </svg>
              </span>
            </button>

            <div className={isExploreOpen ? 'mobile-explore-group is-open' : 'mobile-explore-group'}>
              <button
                type="button"
                className="mobile-nav-item mobile-explore-trigger"
                aria-expanded={isExploreOpen}
                aria-controls="mobile-explore-list"
                onClick={() => setIsExploreOpen((current) => !current)}
              >
                <span className="mobile-nav-label">Explore Bislig</span>
                <span className="mobile-nav-arrow mobile-explore-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                </span>
              </button>

              <div
                id="mobile-explore-list"
                className="mobile-explore-list"
                aria-hidden={!isExploreOpen}
              >
                {discoveryCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className="mobile-explore-item"
                    onClick={() => {
                      setIsExploreOpen(false)
                      setIsMobileNavOpen(false)
                    }}
                  >
                    <span>{category}</span>
                    <span aria-hidden="true">?</span>
                  </button>
                ))}
              </div>
            </div>

            <a
              className="mobile-nav-item"
              href="/contact"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">Contact</span>
              <span className="mobile-nav-arrow" aria-hidden="true">?</span>
            </a>

            <a
              className="mobile-nav-item mobile-nav-driver"
              href="/become-a-driver"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span className="mobile-nav-label">Become a Driver</span>
              <span className="mobile-nav-arrow" aria-hidden="true">?</span>
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