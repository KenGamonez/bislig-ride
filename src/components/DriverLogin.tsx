import { useState } from 'react'
import { supabase } from '../lib/supabase'

type DriverLoginProps = {
  onLogin: (driverId: string) => void
}

export function DriverLogin({ onLogin }: DriverLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }

    setLoading(true)
    setError('')

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (authError || !data.user) {
      setError(authError?.message || 'Unable to sign in.')
      setLoading(false)
      return
    }

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('id, full_name, auth_user_id')
      .eq('auth_user_id', data.user.id)
      .maybeSingle()

    if (driverError || !driver) {
      await supabase.auth.signOut()
      setError('This account is not linked to a Bislig Ride driver.')
      setLoading(false)
      return
    }

    onLogin(driver.id)
    setLoading(false)
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <p className="section-label">Driver Access</p>
          <h2>Welcome back</h2>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        <label className="field-block">
          <span className="field-label">Email</span>
          <input
            className="input-field"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="driver@bisligride.com"
            autoComplete="email"
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
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void handleLogin()
              }
            }}
          />
        </label>

        <button
          type="button"
          className="primary-action"
          onClick={() => void handleLogin()}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Login'}
        </button>

        <div className="auth-links">
          <button type="button" className="link-button">
            Forgot password?
          </button>
          <button type="button" className="link-button">
            Contact Admin
          </button>
        </div>
      </div>
    </div>
  )
}
