const rideHistory = [
  { id: 'R-1042', route: 'City Hall → Rizal Street', date: 'Today, 9:14 AM' },
  { id: 'R-1018', route: 'Mangagoy → Bislig Terminal', date: 'Yesterday, 6:42 PM' },
  { id: 'R-998', route: 'San Francisco → Barangay 1', date: 'Mon, 8:20 AM' },
]

export function CustomerProfile() {
  return (
    <div className="profile-panel">
      <div className="profile-header">
        <div className="avatar">JC</div>
        <div>
          <p className="section-label">Customer Profile</p>
          <h3>Juan Dela Cruz</h3>
        </div>
      </div>

      <dl className="profile-meta">
        <div>
          <dt>Name</dt>
          <dd>Juan Dela Cruz</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>0912 345 6789</dd>
        </div>
      </dl>

      <div className="profile-section">
        <h4>Ride History</h4>
        <ul className="history-list compact">
          {rideHistory.map((ride) => (
            <li key={ride.id}>
              <div>
                <strong>{ride.id}</strong>
                <span>{ride.route}</span>
              </div>
              <small>{ride.date}</small>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
