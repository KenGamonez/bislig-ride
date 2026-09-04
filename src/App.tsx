import { useEffect, useState } from 'react'
import './App.css'
import { ViewSwitcher } from './components/ViewSwitcher'
import { DriverLogin } from './components/DriverLogin'
import { CustomerExperience } from './pages/CustomerExperience'
import { DriverExperience } from './pages/DriverExperience'
import { AdminExperience } from './pages/AdminExperience'
import { BecomeDriverExperience } from './pages/BecomeDriverExperience'
import { PakyawanExperience } from './pages/PakyawanExperience'
import { supabase } from './lib/supabase'

type ViewMode = 'customer' | 'driver' | 'admin'

function App() {
  const [view, setView] = useState<ViewMode>('customer')
  const [driverAuthenticated, setDriverAuthenticated] = useState(false)

  const isBecomeDriverPage = window.location.pathname === '/become-a-driver'
  const isPakyawanPage = window.location.pathname === '/pakyawan'

  useEffect(() => {
    const checkDriverSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session?.user) {
        setDriverAuthenticated(false)
        return
      }

      const { data: driver } = await supabase
        .from('drivers')
        .select('id')
        .eq('auth_user_id', data.session.user.id)
        .maybeSingle()

      setDriverAuthenticated(Boolean(driver))
    }

    void checkDriverSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkDriverSession()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (isBecomeDriverPage) {
    return (
      <BecomeDriverExperience
        onHome={() => {
          window.history.pushState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  if (isPakyawanPage) {
    return (
      <PakyawanExperience
        onBack={() => {
          window.history.pushState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  return (
    <div className="app-stage">
      <ViewSwitcher
        currentView={view}
        onSwitch={setView}
        className="header-role-switcher"
      />

      {view === 'customer' ? (
        <CustomerExperience />
      ) : view === 'driver' ? (
        driverAuthenticated ? (
          <DriverExperience />
        ) : (
          <DriverLogin
            onLogin={() => {
              setDriverAuthenticated(true)
            }}
          />
        )
      ) : (
        <AdminExperience />
      )}
    </div>
  )
}

export default App
