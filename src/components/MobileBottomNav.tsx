export type MobileBottomNavTab = 'home' | 'rides' | 'profile'

type MobileBottomNavProps = {
  activeTab: MobileBottomNavTab
  onTabChange: (tab: MobileBottomNavTab) => void
}

export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
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
        <span className="bottom-nav-label">Home</span>
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
        <span className="bottom-nav-label">My Rides</span>
        <span className="bottom-nav-indicator" aria-hidden="true"></span>
      </button>

      <button
        type="button"
        className={activeTab === 'profile' ? 'bottom-nav-item is-active' : 'bottom-nav-item'}
        aria-current={activeTab === 'profile' ? 'page' : undefined}
        onClick={() => onTabChange('profile')}
      >
        <span className="bottom-nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
          </svg>
        </span>
        <span className="bottom-nav-label">Profile</span>
        <span className="bottom-nav-indicator" aria-hidden="true"></span>
      </button>
    </nav>
  )
}