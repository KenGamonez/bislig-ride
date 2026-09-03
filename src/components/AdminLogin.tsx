import { useState } from 'react'
import { supabase } from '../lib/supabase'

type AdminLoginProps = {
  onLogin?: () => void
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
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
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <p className="section-label">Admin Access</p>
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

          <button type="submit" className="primary-action" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}
