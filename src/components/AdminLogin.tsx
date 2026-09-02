import { useState } from 'react'

type AdminLoginProps = {
  onLogin?: () => void
}

export function AdminLogin({ onLogin }: AdminLoginProps) {
  const [email, setEmail] = useState('admin@bisligride.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError('Enter a demo admin email and password to continue.')
      return
    }

    if (!email.includes('@')) {
      setError('Use a valid demo email format.')
      return
    }

    setError('')
    onLogin?.()
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <p className="section-label">Admin Access</p>
          <h2>Operations login</h2>
        </div>

        <label className="field-block">
          <span className="field-label">Email</span>
          <input
            className="input-field"
            type="email"
            placeholder="admin@bisligride.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label className="field-block">
          <span className="field-label">Password</span>
          <input
            className="input-field"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <p className="form-error-message">{error}</p> : null}

        <button type="button" className="primary-action" onClick={handleLogin}>
          Login to Dashboard
        </button>
      </div>
    </div>
  )
}
