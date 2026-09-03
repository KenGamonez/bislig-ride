import { useState } from 'react'
import './App.css'
import { ViewSwitcher } from './components/ViewSwitcher'
import { CustomerExperience } from './pages/CustomerExperience'
import { DriverExperience } from './pages/DriverExperience'
import { AdminExperience } from './pages/AdminExperience'
import { BecomeDriverExperience } from './pages/BecomeDriverExperience'
import { PakyawanExperience } from './pages/PakyawanExperience'

type ViewMode = 'customer' | 'driver' | 'admin'

function App() {
  const [view, setView] = useState<ViewMode>('customer')
  const isBecomeDriverPage = window.location.pathname === '/become-a-driver'
  const isPakyawanPage = window.location.pathname === '/pakyawan'

  if (isBecomeDriverPage) {
    return <BecomeDriverExperience onHome={() => { window.history.pushState({}, '', '/'); window.location.reload() }} />
  }

  if (isPakyawanPage) {
    return <PakyawanExperience onBack={() => { window.history.pushState({}, '', '/'); window.location.reload() }} />
  }

  return (
    <div className="app-stage">
      <ViewSwitcher currentView={view} onSwitch={setView} className="header-role-switcher" />
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
