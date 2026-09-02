const drivers = [
  {
    id: 1,
    name: 'Mark Santos',
    phone: '0917 111 2233',
    vehicle: 'Motorbike',
    model: 'Honda Click',
    plate: 'ABC 1234',
    status: 'Online',
  },
  {
    id: 2,
    name: 'Rico Lim',
    phone: '0922 441 5566',
    vehicle: 'Sedan',
    model: 'Toyota Vios',
    plate: 'XYZ 5567',
    status: 'Offline',
  },
  {
    id: 3,
    name: 'Alden Cruz',
    phone: '0933 223 7788',
    vehicle: 'SUV',
    model: 'Mitsubishi Xpander',
    plate: 'LMN 2241',
    status: 'Online',
  },
  {
    id: 4,
    name: 'Jayson Dela Vega',
    phone: '0945 110 2234',
    vehicle: 'Motorbike',
    model: 'Yamaha Mio',
    plate: 'DEF 8891',
    status: 'Online',
  },
  {
    id: 5,
    name: 'Ramon Ocampo',
    phone: '0988 301 2021',
    vehicle: 'Sedan',
    model: 'Honda City',
    plate: 'PQR 1788',
    status: 'Offline',
  },
]

const overview = [
  { label: 'Drivers', value: '126' },
  { label: 'Customers', value: '3,420' },
  { label: 'Rides', value: '845' },
  { label: 'Payments', value: '₱68.7K' },
]

export function AdminExperience() {
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="section-label">Admin</p>
          <h2>Operations Center</h2>
        </div>
      </header>

      <section className="admin-layout">
        <div className="admin-panel overview-panel">
          <div className="panel-header-row">
            <h3>Overview</h3>
          </div>
          <div className="stat-grid">
            {overview.map((item) => (
              <div key={item.label} className="stat-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-panel">
          <div className="panel-header-row">
            <h3>Drivers</h3>
            <button type="button" className="secondary-action compact-button">
              Add Driver
            </button>
          </div>

          <ul className="admin-list">
            {drivers.map((driver) => (
              <li key={driver.id} className="admin-list-item">
                <div className="admin-driver-head">
                  <div className="avatar small">{driver.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{driver.name}</strong>
                    <span>{driver.phone}</span>
                  </div>
                </div>

                <div className="driver-meta-inline">
                  <span>{driver.vehicle}</span>
                  <span>{driver.model}</span>
                  <span>{driver.plate}</span>
                </div>

                <div className="list-actions">
                  <span className={driver.status === 'Online' ? 'status-pill online' : 'status-pill offline'}>
                    {driver.status}
                  </span>
                  <button type="button" className="ghost-button">
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
