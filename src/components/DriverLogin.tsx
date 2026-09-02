export function DriverLogin() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <p className="section-label">Driver Access</p>
          <h2>Welcome back</h2>
        </div>

        <label className="field-block">
          <span className="field-label">Email / Phone</span>
          <input className="input-field" type="text" placeholder="driver@bisligride.com" />
        </label>

        <label className="field-block">
          <span className="field-label">Password</span>
          <input className="input-field" type="password" placeholder="••••••••" />
        </label>

        <button type="button" className="primary-action">
          Login
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
