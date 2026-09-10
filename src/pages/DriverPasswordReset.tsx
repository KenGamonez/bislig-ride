import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PASSWORD_HELP_TEXT, validatePasswordStrength } from '../lib/driverAccounts'

const requestedViewKey = 'bislig-ride-requested-view'

function goToDriverLogin() {
  try {
    window.sessionStorage.setItem(requestedViewKey, 'driver')
  } catch {
    // sessionStorage unavailable — the default view will be shown
  }
  window.history.pushState({}, '', '/')
  window.location.reload()
}

function parseRecoveryPayload() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')

  if (code) {
    return { kind: 'code' as const, code }
  }

  const hash = new URLSearchParams(window.location.hash.slice(1))
  const accessToken = hash.get('access_token')
  const refreshToken = hash.get('refresh_token')
  const type = hash.get('type')

  if (accessToken && refreshToken) {
    return { kind: 'token' as const, accessToken, refreshToken, type }
  }

  return null
}

type ResetStatus = 'checking' | 'expired' | 'ready' | 'resetting' | 'success'

export function DriverPasswordReset() {
  const [status, setStatus] = useState<ResetStatus>('checking')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const establishRecoverySession = async () => {
      const payload = parseRecoveryPayload()

      if (!payload) {
        if (mounted) setStatus('expired')
        return
      }

      try {
        if (payload.kind === 'code') {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(payload.code)

          if (exchangeError) {
            throw exchangeError
          }
        } else {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: payload.accessToken,
            refresh_token: payload.refreshToken,
          })

          if (sessionError) {
            throw sessionError
          }
        }

        if (mounted) setStatus('ready')
      } catch (sessionError) {
        console.error('Unable to validate the password reset link:', sessionError)
        if (mounted) setStatus('expired')
      }
    }

    void establishRecoverySession()

    return () => {
      mounted = false
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    const strength = validatePasswordStrength(newPassword)

    if (!strength.ok) {
      setError(strength.problems[0])
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setStatus('resetting')

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

      if (updateError) {
        throw updateError
      }

      await supabase.auth.signOut()
      setNewPassword('')
      setConfirmPassword('')
      setStatus('success')
    } catch (updateError) {
      console.error('Unable to update password:', updateError)
      setError("We couldn't update your password. The reset link may have expired — request a new one.")
      setStatus('ready')
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <button type="button" className="secondary-action compact-button auth-back" onClick={goToDriverLogin}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to driver login
        </button>

        <div className="auth-header">
          <p className="section-label">Driver Access</p>
          <h2>Reset your password</h2>
        </div>

        {status === 'checking' ? (
          <p className="muted-copy">Validating your reset link...</p>
        ) : null}

        {status === 'expired' ? (
          <div>
            <p className="muted-copy">
              This password reset link is invalid or has expired. Request a new link from the
              driver login page.
            </p>
            <button type="button" className="primary-action" onClick={goToDriverLogin}>
              Go to driver login
            </button>
          </div>
        ) : null}

        {status === 'ready' || status === 'resetting' ? (
          <form onSubmit={handleSubmit}>
            <p className="muted-copy">Choose a new password for your driver account.</p>

            <label className="field-block">
              <span className="field-label">New password</span>
              <input
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={status === 'resetting'}
              />
            </label>

            {newPassword ? (
              <p className="password-meta">{PASSWORD_HELP_TEXT}</p>
            ) : null}

            <label className="field-block">
              <span className="field-label">Confirm new password</span>
              <input
                className="input-field"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={status === 'resetting'}
              />
            </label>

            {showPassword ? (
              <button type="button" className="link-button" onClick={() => setShowPassword(false)}>
                Hide password
              </button>
            ) : (
              <button type="button" className="link-button" onClick={() => setShowPassword(true)}>
                Show password
              </button>
            )}

            {error ? <p className="auth-error" role="alert">{error}</p> : null}

            <button type="submit" className="primary-action" disabled={status === 'resetting'}>
              {status === 'resetting' ? 'Updating password...' : 'Update password'}
            </button>
          </form>
        ) : null}

        {status === 'success' ? (
          <div>
            <p className="muted-copy">
              Your password has been updated. Sign in with your new password.
            </p>
            <button type="button" className="primary-action" onClick={goToDriverLogin}>
              Go to driver login
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}