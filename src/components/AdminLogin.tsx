import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { supabase } from '../lib/supabase'

type AdminLoginProps = {
  onLogin?: () => void
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}

export function AdminLogin({ onLogin, onBack, view, onViewChange }: AdminLoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim() || !password.trim()) {
      setError('Enter your admin email and password to continue.')
      return
    }

    if (!email.includes('@')) {
      setError('Enter a valid email address.')
      return
    }

    setError('')
    setIsSubmitting(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) {
        throw signInError
      }

      if (data.user?.app_metadata?.role !== 'admin') {
        await supabase.auth.signOut()
        setError('This account does not have admin access.')
        return
      }

      onLogin?.()
    } catch (signInError) {
      console.error('Unable to sign in admin:', signInError)
      setError('Unable to sign in. Check your email and password and try again.')
    } finally {
      setIsSubmitting(false)
    }
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
          <p className="eyebrow auth-eyebrow">Admin Access</p>
          <h2>Operations login</h2>
        </div>

        <form className="auth-card" onSubmit={handleLogin}>
          <label className="field-block">
            <span className="field-label">Email</span>
            <input
              className="input-field"
              type="email"
              placeholder="admin email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              disabled={isSubmitting}
            />
          </label>

          <label className="field-block">
            <span className="field-label">Password</span>
            <input
              className="input-field"
              type="password"
              placeholder="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </label>

          {error ? <p className="form-error-message">{error}</p> : null}

          <button type="submit" className="primary-action request-ride-action" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
    </>
  )
}
