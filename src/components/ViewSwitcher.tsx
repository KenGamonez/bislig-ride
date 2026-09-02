type ViewSwitcherProps = {
  currentView: 'customer' | 'driver'
  onSwitch: (view: 'customer' | 'driver') => void
}

export function ViewSwitcher({ currentView, onSwitch }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" aria-label="Development preview switcher">
      <span className="switcher-label">Development Preview</span>
      <div className="switcher-buttons">
        <button
          type="button"
          className={currentView === 'customer' ? 'switch-button active' : 'switch-button'}
          onClick={() => onSwitch('customer')}
        >
          Customer
        </button>
        <button
          type="button"
          className={currentView === 'driver' ? 'switch-button active' : 'switch-button'}
          onClick={() => onSwitch('driver')}
        >
          Driver
        </button>
      </div>
    </div>
  )
}
