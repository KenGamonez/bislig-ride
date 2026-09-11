import { useEffect, useState } from 'react'
import './App.css'
import { DriverLogin } from './components/DriverLogin'
import { CustomerExperience } from './pages/CustomerExperience'
import { DriverExperience } from './pages/DriverExperience'
import { AdminExperience } from './pages/AdminExperience'
import { BecomeDriverExperience } from './pages/BecomeDriverExperience'
import { PakyawanExperience } from './pages/PakyawanExperience'
import { ContactExperience } from './pages/ContactExperience'
import { DriverPasswordReset } from './pages/DriverPasswordReset'
import { supabase } from './lib/supabase'

type ViewMode = 'Rider' | 'driver' | 'admin'

const requestedViewKey = 'bislig-ride-requested-view'

function readRequestedView(): ViewMode {
  try {
    const stored = window.sessionStorage.getItem(requestedViewKey)
    if (stored === 'Rider' || stored === 'driver' || stored === 'admin') {
      window.sessionStorage.removeItem(requestedViewKey)
      return stored
    }
  } catch {
    // sessionStorage unavailable — use the default view
  }
  return 'Rider'
}

function App() {
  const [view, setView] = useState<ViewMode>(readRequestedView)
  const [driverAuthenticated, setDriverAuthenticated] = useState(false)
  const [driverBlocked, setDriverBlocked] = useState(false)

  const isBecomeDriverPage = window.location.pathname === '/become-a-driver'
  const isPakyawanPage = window.location.pathname === '/pakyawan'
  const isContactPage = window.location.pathname === '/contact'
  const isDriverResetPage = window.location.pathname === '/driver/reset-password'
  const isAdminPage = window.location.pathname === '/admin'

  useEffect(() => {
    const checkDriverSession = async () => {
      const { data } = await supabase.auth.getSession()

      if (!data.session?.user) {
        setDriverAuthenticated(false)
        setDriverBlocked(false)
        return
      }

      const { data: driver } = await supabase
        .from('drivers')
        .select('id, status')
        .eq('auth_user_id', data.session.user.id)
        .maybeSingle()

      if (driver && driver.status === 'inactive') {
        setDriverAuthenticated(false)
        setDriverBlocked(true)
        return
      }

      setDriverAuthenticated(Boolean(driver))
      setDriverBlocked(false)
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
        view={view}
        onViewChange={(nextView) => {
          try {
            window.sessionStorage.setItem(requestedViewKey, nextView)
          } catch {
            // sessionStorage unavailable — land on the default view
          }
          window.history.pushState({}, '', '/')
          window.location.reload()
        }}
        onHome={() => {
          window.history.pushState({}, '', '/')
          window.location.reload()
        }}
      />
    )
  }

  if (isContactPage) {
    return <ContactExperience />
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

  if (isDriverResetPage) {
    return <DriverPasswordReset />
  }

  if (isAdminPage) {
    const goHome = () => {
      window.history.pushState({}, '', '/')
      window.location.reload()
    }

    return (
      <AdminExperience
        view="admin"
        onViewChange={goHome}
        onBack={goHome}
      />
    )
  }

  return (
    <div className="app-stage">
      {view === 'Rider' ? (
        <CustomerExperience currentView={view} onSwitchView={setView} />
      ) : view === 'driver' ? (
        driverBlocked ? (
          <div className="auth-shell">
            <div className="auth-card">
              <div className="auth-header">
                <p className="section-label">Driver Access</p>
                <h2>Account inactive</h2>
              </div>
              <p className="muted-copy">
                Your driver account is inactive. Please contact Bislig Ride to reactivate it.
              </p>
              <button type="button" className="primary-action" onClick={() => setView('Rider')}>
                Back to Ride Booking
              </button>
            </div>
          </div>
        ) : driverAuthenticated ? (
          <DriverExperience view={view} onViewChange={setView} onBack={() => setView('Rider')} />
        ) : (
          <DriverLogin
            view={view}
            onViewChange={setView}
            onLogin={() => {
              setDriverAuthenticated(true)
              setDriverBlocked(false)
            }}
            onBack={() => setView('Rider')}
          />
        )
      ) : (
        <AdminExperience view={view} onViewChange={setView} onBack={() => setView('Rider')} />
      )}
    </div>
  )
}

export default App
