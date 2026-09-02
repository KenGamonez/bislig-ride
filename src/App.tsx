import { useState } from 'react'
import './App.css'
import { ViewSwitcher } from './components/ViewSwitcher'
import { CustomerExperience } from './pages/CustomerExperience'
import { DriverExperience } from './pages/DriverExperience'
import { AdminExperience } from './pages/AdminExperience'

type ViewMode = 'customer' | 'driver' | 'admin'

function App() {
  const [view, setView] = useState<ViewMode>('customer')

  return (
    <div className="app-stage">
      {view !== 'customer' ? (
        <ViewSwitcher currentView={view} onSwitch={setView} className="dev-switcher" />
      ) : null}
      {view === 'customer' ? (
        <CustomerExperience />
      ) : view === 'driver' ? (
        <DriverExperience />
      ) : (
        <AdminExperience />
      )}
    </div>
  )
}

export default App
