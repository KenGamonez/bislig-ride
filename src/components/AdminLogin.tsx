export function AdminLogin() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <p className="section-label">Admin Access</p>
          <h2>Secure login</h2>
        </div>

        <label className="field-block">
          <span className="field-label">Email</span>
          <input className="input-field" type="email" placeholder="admin@bisligride.com" />
        </label>

        <label className="field-block">
          <span className="field-label">Password</span>
          <input className="input-field" type="password" placeholder="••••••••" />
        </label>

        <button type="button" className="primary-action">
          Login
        </button>
      </div>
    </div>
  )
}
