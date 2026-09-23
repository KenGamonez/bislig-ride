import { useState } from 'react'
import { AppHeader } from './AppHeader'
import { supabase } from '../lib/supabase'
import { sendDriverPasswordReset, signInDriverWithIdentifier } from '../lib/driverAuth'
import { useLanguage } from '../lib/i18n'

type DriverLoginProps = {
  onLogin: (driverId: string) => void
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}

type DriverLoginMode = 'login' | 'forgot' | 'sent'

export function DriverLogin({ onLogin, onBack, view, onViewChange }: DriverLoginProps) {
  const { t } = useLanguage()
  const [mode, setMode] = useState<DriverLoginMode>('login')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!identifier.trim() || !password) {
      setError(t('auth.errMissingCredentials'))
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data } = await signInDriverWithIdentifier(identifier, password)

      if (!data.user) {
        setError(t('auth.errInvalidCredentials'))
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
        setError(t('auth.errNotLinked'))
        setLoading(false)
        return
      }

      if (driver.status === 'inactive') {
        await supabase.auth.signOut()
        setError(t('auth.errDeactivated'))
        setLoading(false)
        return
      }

      onLogin(driver.id)
      setLoading(false)
    } catch (signInError) {
      console.error('Unable to sign in driver:', signInError)
      setError(t('auth.errInvalidCredentials'))
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!identifier.trim()) {
      setError(t('auth.errForgotMissing'))
      return
    }

    setLoading(true)
    setError('')

    try {
      await sendDriverPasswordReset(identifier)
      setMode('sent')
    } catch (resetError) {
      console.error('Unable to send password reset:', resetError)
      setError(t('auth.errResetFailed'))
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
        primaryLabel={t('nav.myRides')}
        onPrimaryAction={() => onViewChange('Rider')}
      />
      <div className="auth-shell driver-auth-shell">
        <div className="auth-card driver-auth-card">
          <button type="button" className="secondary-action compact-button auth-back" onClick={onBack}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            {t('auth.backToRider')}
          </button>

          <div className="auth-header">
            <p className="eyebrow auth-eyebrow">{t('auth.driverAccess')}</p>
            <h2>{mode === 'login' ? t('auth.welcomeBack') : mode === 'forgot' ? t('auth.resetPassword') : t('auth.checkInbox')}</h2>
            {mode === 'login' ? <p className="auth-subtitle">Sign in to manage your rides.</p> : null}
          </div>

          {error ? <p className="auth-error" role="alert">{error}</p> : null}

          {mode === 'login' ? (
            <form onSubmit={handleLogin}>
              <label className="field-block">
                <span className="field-label">{t('auth.usernameEmail')}</span>
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
                <span className="field-label">{t('auth.password')}</span>
                <div className="password-field-wrap">
                  <input
                    className="input-field"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-visibility-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={loading}
                    aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.94 13.94 0 0 0 2 12s3 7 10 7a9.59 9.59 0 0 0 5.39-1.61" />
                        <line x1="2" y1="2" x2="22" y2="22" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                className="primary-action request-ride-action"
                disabled={loading}
              >
                {loading ? t('auth.signingIn') : t('auth.login')}
              </button>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={() => { setMode('forgot'); setError('') }} disabled={loading}>
                  {t('auth.forgotPassword')}
                </button>
                <button type="button" className="link-button">
                  {t('auth.contactAdmin')}
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <form onSubmit={handleForgotSubmit}>
              <p className="muted-copy">
                {t('auth.resetHint')}
              </p>

              <label className="field-block">
                <span className="field-label">{t('auth.usernameEmail')}</span>
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

              <button type="submit" className="primary-action request-ride-action" disabled={loading}>
                {loading ? t('auth.sendingLink') : t('auth.sendResetLink')}
              </button>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={handleBackToLogin} disabled={loading}>
                  {t('auth.backToLogin')}
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'sent' ? (
            <div>
              <p className="muted-copy">
                {t('auth.sentNote')}
              </p>

              <div className="auth-links">
                <button type="button" className="link-button" onClick={handleBackToLogin}>
                  {t('auth.backToLogin')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  )
}
