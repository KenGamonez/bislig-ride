type ViewSwitcherProps = {
  currentView: 'Rider' | 'driver' | 'admin'
  onSwitch: (view: 'Rider' | 'driver' | 'admin') => void
  className?: string
}

export function ViewSwitcher({ currentView, onSwitch, className = '' }: ViewSwitcherProps) {
  return (
    <div className={`view-switcher ${className}`.trim()} aria-label="Ride view switcher">
      <div className="switcher-buttons">
        <button
          type="button"
          className={currentView === 'Rider' ? 'switch-button active' : 'switch-button'}
          onClick={() => onSwitch('Rider')}
        >
          Rider
        </button>
        <button
          type="button"
          className={currentView === 'driver' ? 'switch-button active' : 'switch-button'}
          onClick={() => onSwitch('driver')}
        >
          Driver
        </button>
        <button
          type="button"
          className={currentView === 'admin' ? 'switch-button active' : 'switch-button'}
          onClick={() => onSwitch('admin')}
        >
          Admin
        </button>
      </div>
    </div>
  )
}
