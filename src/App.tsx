import { useState } from 'react'
import './App.css'
import { ViewSwitcher } from './components/ViewSwitcher'
import { CustomerExperience } from './pages/CustomerExperience'
import { DriverExperience } from './pages/DriverExperience'

type ViewMode = 'customer' | 'driver'

function App() {
  const [view, setView] = useState<ViewMode>('customer')

  return (
    <div className="app-stage">
      <ViewSwitcher currentView={view} onSwitch={setView} />
      {view === 'customer' ? <CustomerExperience /> : <DriverExperience />}
    </div>
  )
}

export default App
