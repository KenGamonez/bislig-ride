import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { supabase } from '../lib/supabase'
import { sendDriverPasswordReset, signInDriverWithIdentifier } from '../lib/driverAuth'

type DriverLoginProps = {
  onLogin: (driverId: string) => void
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}

type DriverLoginMode = 'login' | 'forgot' | 'sent'

export function DriverLogin({ onLogin, onBack, view, onViewChange }: DriverLoginProps) {
  const [mode, setMode] = useState<DriverLoginMode>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!identifier.trim() || !password) {
      setError('Enter your username or email and password to continue.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data } = await signInDriverWithIdentifier(identifier, password)

      if (!data.user) {
        setError('Incorrect username or password.')
        setLoading(false)
        return
      }

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, full_name, auth_user_id, status')
        .eq('auth_user_id', data.user.id)
        .maybeSingle()

      if (driverError || !driver) {
        await supabase.auth.signOut()
        setError('This account is not linked to a Bislig Ride driver.')
        setLoading(false)
        return
      }

      if (driver.status === 'inactive') {
        await supabase.auth.signOut()
        setError('This driver account is deactivated. Contact the admin to reactivate it.')
        setLoading(false)
        return
      }

      onLogin(driver.id)
      setLoading(false)
    } catch (signInError) {
      console.error('Unable to sign in driver:', signInError)
      setError('Incorrect username or password.')
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!identifier.trim()) {
      setError('Enter your username or email to find your account.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await sendDriverPasswordReset(identifier)
      setMode('sent')
    } catch (resetError) {
      console.error('Unable to send password reset:', resetError)
      setError("We couldn't send a reset link right now. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleBackToLogin = () => {
    setMode('login')
    setPassword('')
    setError('')
  }

  return (
    <>
      <AppHeader
        view={view}
        onViewChange={onViewChange}
        primaryLabel="My Rides"
        onPrimaryAction={() => onViewChange('Rider')}
      />
      <div className="auth-shell">
        <div className="auth-card">
          <button type="button" className="secondary-action compact-button auth-back" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            Back to Rider
          </button>

          <div className="auth-header">
            <p className="section-label">Driver Access</p>
            <h2>{mode === 'login' ? 'Welcome back' : mode === 'forgot' ? 'Reset password' : 'Check your inbox'}</h2>
          </div>

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <label className="field-block">
                <span className="field-label">Username or email</span>
                <input
                  className="input-field"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="e.g. juan.dela.cruz"
                  autoComplete="username"
                  disabled={loading}
                />
              </label>

              <label className="field-block">
                <span className="field-label">Password</span>
                <input
                  className="input-field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                />
              </label>

              <button
                type="submit"
                className="primary-action"
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Login'}
              </button>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={() => { setMode('forgot'); setError('') }} disabled={loading}>
                  Forgot password?
                </button>
                <button type="button" className="link-button">
                  Contact Admin
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <form onSubmit={handleForgotSubmit}>
              <p className="muted-copy">
                Enter your username or registered email and we'll send a password reset link.
              </p>

              <label className="field-block">
                <span className="field-label">Username or email</span>
                <input
                  className="input-field"
                  type="text"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="e.g. juan.dela.cruz"
                  autoComplete="username"
                  disabled={loading}
                />
              </label>

              <button type="submit" className="primary-action" disabled={loading}>
                {loading ? 'Sending link...' : 'Send reset link'}
              </button>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={handleBackToLogin} disabled={loading}>
                  Back to login
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'sent' ? (
            <div>
              <p className="muted-copy">
                If a Bislig Ride driver account matches that username or email, a password reset
                link has been sent. It only works for a short time — check your inbox (and spam folder).
              </p>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={handleBackToLogin}>
                  Back to login
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}