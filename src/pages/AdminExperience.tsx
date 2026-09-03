import { useEffect, useMemo, useState } from 'react'
import { AdminLogin } from '../components/AdminLogin'
import { MapView } from '../components/MapView'
import { demoDriver } from '../lib/demoDriver'
import {
  activeRides,
  adminCustomers,
  adminDrivers,
  completedRides,
  paymentRecords,
  type AdminDriver,
  type AdminRide,
  type DriverAvailability,
  type DriverStatus,
} from '../lib/adminDemoData'
import { fetchDriverApplications, updateDriverApplicationStatus } from '../lib/driverApplications'
import { driverApplicationStatuses, type DriverApplication, type DriverApplicationStatus } from '../types/driverApplication'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

type AdminTab = 'overview' | 'drivers' | 'customers' | 'active-rides' | 'ride-history' | 'payments' | 'driver-applications'

type DriverDraft = {
  name: string
  phone: string
  email: string
  vehicleType: string
  vehicleModel: string
  plateNumber: string
  status: DriverStatus
  availability: DriverAvailability
}

const emptyDriverDraft: DriverDraft = {
  name: '',
  phone: '',
  email: '',
  vehicleType: 'Motorbike',
  vehicleModel: '',
  plateNumber: '',
  status: 'Active',
  availability: 'Offline',
}

const adminTabs: { key: AdminTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'customers', label: 'Customers' },
  { key: 'active-rides', label: 'Active Rides' },
  { key: 'ride-history', label: 'Ride History' },
  { key: 'payments', label: 'Payments' },
  { key: 'driver-applications', label: 'Driver Applications' },
]

const rideStatusLabels: Record<AdminRide['status'], string> = {
  requested: 'Requested',
  accepted: 'Driver Accepted',
  arrived: 'Driver Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
}

export function AdminExperience() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [drivers, setDrivers] = useState<AdminDriver[]>(adminDrivers)
  const [driverSearch, setDriverSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState<'all' | DriverStatus>('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [rideSearch, setRideSearch] = useState('')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState(demoDriver.name)
  const [selectedRideId, setSelectedRideId] = useState(activeRides[0].id)
  const [showAddDriver, setShowAddDriver] = useState(false)
  const [driverDraft, setDriverDraft] = useState<DriverDraft>(emptyDriverDraft)
  const [applications, setApplications] = useState<DriverApplication[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [applicationError, setApplicationError] = useState('')
  const [isLoadingApplications, setIsLoadingApplications] = useState(false)
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    let isMounted = true

    const applySession = (session: Session | null) => {
      if (!isMounted) return
      const appMetadata = session?.user?.app_metadata as { role?: unknown } | undefined
      setIsLoggedIn(appMetadata?.role === 'admin')
      setIsAuthReady(true)
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('Unable to restore admin session:', error)
        applySession(null)
        return
      }
      applySession(data.session)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'driver-applications') return
    setIsLoadingApplications(true)
    setApplicationError('')
    fetchDriverApplications()
      .then((items) => {
        setApplications(items)
        setSelectedApplicationId((current) => current || items[0]?.id || '')
      })
      .catch(() => setApplicationError('Unable to load driver applications. Check admin access and try again.'))
      .finally(() => setIsLoadingApplications(false))
  }, [activeTab, isLoggedIn])

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const matchesFilter = driverFilter === 'all' || driver.status === driverFilter
      const matchesSearch =
        driver.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
        driver.phone.toLowerCase().includes(driverSearch.toLowerCase()) ||
        driver.vehicleModel.toLowerCase().includes(driverSearch.toLowerCase())

      return matchesFilter && matchesSearch
    })
  }, [drivers, driverFilter, driverSearch])

  const filteredCustomers = useMemo(() => {
    return adminCustomers.filter((customer) => {
      return (
        customer.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        customer.phone.toLowerCase().includes(customerSearch.toLowerCase())
      )
    })
  }, [customerSearch])

  const filteredRides = useMemo(() => {
    return activeRides.filter((ride) => {
      return (
        ride.id.toLowerCase().includes(rideSearch.toLowerCase()) ||
        ride.customer.toLowerCase().includes(rideSearch.toLowerCase()) ||
        ride.driver.toLowerCase().includes(rideSearch.toLowerCase())
      )
    })
  }, [rideSearch])

  const filteredPayments = useMemo(() => {
    return paymentRecords.filter((payment) => {
      return (
        payment.rideId.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        payment.customer.toLowerCase().includes(paymentSearch.toLowerCase()) ||
        payment.paymentMethod.toLowerCase().includes(paymentSearch.toLowerCase())
      )
    })
  }, [paymentSearch])

  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0]
  const selectedRide = activeRides.find((ride) => ride.id === selectedRideId) ?? activeRides[0]
  const selectedApplication = applications.find((application) => application.id === selectedApplicationId)

  const handleApplicationStatusChange = async (id: string, status: DriverApplicationStatus) => {
    try {
      const updated = await updateDriverApplicationStatus(id, status)
      setApplications((current) => current.map((application) => application.id === id ? updated : application))
    } catch {
      setApplicationError('Unable to update this application. Please try again.')
    }
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    setIsLoggedIn(false)
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Unable to sign out admin:', error)
    }
    setIsLoggingOut(false)
  }

  const overviewStats = [
    { label: 'Total Drivers', value: String(drivers.length), accent: true },
    { label: 'Online Drivers', value: String(drivers.filter((driver) => driver.availability === 'Online').length) },
    { label: 'Active Rides', value: String(activeRides.length) },
    { label: 'Completed Rides', value: String(completedRides.length) },
    { label: 'Total Customers', value: String(adminCustomers.length) },
    { label: "Today's Revenue", value: '₱2,540 DEMO' },
  ]

  const handleDriverSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!driverDraft.name || !driverDraft.phone || !driverDraft.vehicleModel || !driverDraft.plateNumber) {
      return
    }

    const nextDriver: AdminDriver = {
      id: `driver-${Date.now()}`,
      name: driverDraft.name,
      phone: driverDraft.phone,
      email: driverDraft.email || `${driverDraft.name.toLowerCase().replace(/\s+/g, '.')}@bisligride.com`,
      profilePhoto:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
      vehicleType: driverDraft.vehicleType,
      vehicleModel: driverDraft.vehicleModel,
      plateNumber: driverDraft.plateNumber,
      status: driverDraft.status,
      availability: driverDraft.availability,
      rating: 4.7,
      recentRides: [{ rideId: 'BR-2050', destination: 'New Route', status: 'requested', fare: '₱150 DEMO' }],
    }

    setDrivers((current) => [nextDriver, ...current])
    setSelectedDriverId(nextDriver.id)
    setShowAddDriver(false)
    setDriverDraft(emptyDriverDraft)
    setDriverFilter('all')
  }

  const handleAvailabilityChange = (driverId: string, availability: DriverAvailability) => {
    setDrivers((current) =>
      current.map((driver) =>
        driver.id === driverId ? { ...driver, availability } : driver,
      ),
    )
  }

  const handleStatusChange = (driverId: string, status: DriverStatus) => {
    setDrivers((current) =>
      current.map((driver) =>
        driver.id === driverId ? { ...driver, status } : driver,
      ),
    )
  }

  if (!isAuthReady) {
    return <div className="auth-shell"><div className="auth-card"><p className="muted-copy">Checking admin session...</p></div></div>
  }

  if (!isLoggedIn) {
    return <AdminLogin onLogin={() => setIsLoggedIn(true)} />
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="section-label">Admin</p>
          <h2>Operations Center</h2>
        </div>
        <button type="button" className="secondary-action compact-button" onClick={() => void handleLogout()} disabled={isLoggingOut}>
          {isLoggingOut ? 'Signing out...' : 'Logout'}
        </button>
      </header>

      <nav className="admin-tabs" aria-label="Admin navigation">
        {adminTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'admin-tab active' : 'admin-tab'}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' ? (
        <section className="admin-layout">
          <div className="admin-panel overview-panel">
            <div className="panel-header-row">
              <h3>Overview</h3>
            </div>
            <div className="stats-grid admin-overview-grid">
              {overviewStats.map((item) => (
                <div key={item.label} className={item.accent ? 'stat-box accent-stat' : 'stat-box'}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-panel">
            <div className="panel-header-row">
              <h3>Driver Network</h3>
            </div>
            <ul className="mini-list">
              {drivers.slice(0, 4).map((driver) => (
                <li key={driver.id}>
                  <div>
                    <strong>{driver.name}</strong>
                    <span>{driver.availability}</span>
                  </div>
                  <span className={`status-pill ${driver.availability.toLowerCase()}`}>
                    {driver.availability}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {activeTab === 'drivers' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row">
              <h3>Drivers</h3>
              <button type="button" className="secondary-action compact-button" onClick={() => setShowAddDriver((current) => !current)}>
                {showAddDriver ? 'Close' : 'Add Driver'}
              </button>
            </div>

            <div className="toolbar-stack">
              <input
                className="input-field slim-input"
                value={driverSearch}
                onChange={(event) => setDriverSearch(event.target.value)}
                placeholder="Search drivers"
              />

              <select
                className="input-field slim-input"
                value={driverFilter}
                onChange={(event) => setDriverFilter(event.target.value as 'all' | DriverStatus)}
              >
                <option value="all">All status</option>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            {showAddDriver ? (
              <form className="driver-form panel-form" onSubmit={handleDriverSubmit}>
                <div className="form-grid">
                  <label className="field-block">
                    <span className="field-label">Driver Name</span>
                    <input
                      className="input-field"
                      value={driverDraft.name}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Phone</span>
                    <input
                      className="input-field"
                      value={driverDraft.phone}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Email</span>
                    <input
                      className="input-field"
                      value={driverDraft.email}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, email: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Vehicle Type</span>
                    <input
                      className="input-field"
                      value={driverDraft.vehicleType}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, vehicleType: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Vehicle Model</span>
                    <input
                      className="input-field"
                      value={driverDraft.vehicleModel}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, vehicleModel: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Plate Number</span>
                    <input
                      className="input-field"
                      value={driverDraft.plateNumber}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, plateNumber: event.target.value }))}
                    />
                  </label>

                  <label className="field-block">
                    <span className="field-label">Account Status</span>
                    <select
                      className="input-field"
                      value={driverDraft.status}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, status: event.target.value as DriverStatus }))}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </label>

                  <label className="field-block">
                    <span className="field-label">Availability</span>
                    <select
                      className="input-field"
                      value={driverDraft.availability}
                      onChange={(event) => setDriverDraft((current) => ({ ...current, availability: event.target.value as DriverAvailability }))}
                    >
                      <option value="Offline">Offline</option>
                      <option value="Online">Online</option>
                      <option value="Busy">Busy</option>
                    </select>
                  </label>
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-action">Save Driver</button>
                  <button type="button" className="secondary-action" onClick={() => setShowAddDriver(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {filteredDrivers.length === 0 ? (
              <div className="empty-state-box">
                <p>No drivers match your search.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Phone</th>
                      <th>Vehicle</th>
                      <th>Plate</th>
                      <th>Status</th>
                      <th>Availability</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrivers.map((driver) => (
                      <tr key={driver.id}>
                        <td>
                          <div className="driver-cell">
                            <img src={driver.profilePhoto} alt={driver.name} className="table-avatar" />
                            <div>
                              <strong>{driver.name}</strong>
                              <span>{driver.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>{driver.phone}</td>
                        <td>{driver.vehicleType}<br />{driver.vehicleModel}</td>
                        <td>{driver.plateNumber}</td>
                        <td>
                          <span className={driver.status === 'Active' ? 'status-pill online' : 'status-pill offline'}>
                            {driver.status}
                          </span>
                        </td>
                        <td>
                          <select
                            className="inline-select"
                            value={driver.availability}
                            onChange={(event) => handleAvailabilityChange(driver.id, event.target.value as DriverAvailability)}
                          >
                            <option value="Offline">Offline</option>
                            <option value="Online">Online</option>
                            <option value="Busy">Busy</option>
                          </select>
                        </td>
                        <td className="action-buttons-cell">
                          <button type="button" className="ghost-button" onClick={() => handleStatusChange(driver.id, driver.status === 'Active' ? 'Inactive' : 'Active')}>
                            {driver.status === 'Active' ? 'Deactivate' : 'Activate'}
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setSelectedDriverId(driver.id)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="admin-panel detail-panel">
            {selectedDriver ? (
              <>
                <div className="panel-header-row">
                  <h3>Driver Details</h3>
                </div>
                <div className="detail-profile">
                  <img src={selectedDriver.profilePhoto} alt={selectedDriver.name} className="detail-avatar" />
                  <div>
                    <h4>{selectedDriver.name}</h4>
                    <p>★★★★★ {selectedDriver.rating}</p>
                  </div>
                </div>
                <div className="detail-grid">
                  <div><span>Phone</span><strong>{selectedDriver.phone}</strong></div>
                  <div><span>Email</span><strong>{selectedDriver.email}</strong></div>
                  <div><span>Vehicle</span><strong>{selectedDriver.vehicleType}</strong></div>
                  <div><span>Model</span><strong>{selectedDriver.vehicleModel}</strong></div>
                  <div><span>Plate</span><strong>{selectedDriver.plateNumber}</strong></div>
                  <div><span>Status</span><strong>{selectedDriver.status}</strong></div>
                  <div><span>Availability</span><strong>{selectedDriver.availability}</strong></div>
                  <div><span>Recent rides</span><strong>{selectedDriver.recentRides.length}</strong></div>
                </div>

                <div className="mini-list-wrap">
                  <h4>Recent rides</h4>
                  <ul className="mini-list compact-list">
                    {selectedDriver.recentRides.map((ride) => (
                      <li key={`${selectedDriver.id}-${ride.rideId}`}>
                        <div>
                          <strong>{ride.rideId}</strong>
                          <span>{ride.destination}</span>
                        </div>
                        <span className="status-pill online">{rideStatusLabels[ride.status]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="empty-state-box">
                <p>No driver selected.</p>
              </div>
            )}
          </aside>
        </section>
      ) : null}

      {activeTab === 'customers' ? (
        <section className="admin-panel">
          <div className="panel-header-row">
            <h3>Customers</h3>
          </div>

          <div className="toolbar-stack single-toolbar">
            <input
              className="input-field slim-input"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search customers"
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="empty-state-box">
              <p>No customers found.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Phone</th>
                    <th>Rides</th>
                    <th>Last ride</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td>{customer.name}</td>
                      <td>{customer.phone}</td>
                      <td>{customer.rides}</td>
                      <td>{customer.lastRide}</td>
                      <td>
                        <span className="status-pill online">
                          {customer.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'active-rides' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row">
              <h3>Active Rides</h3>
            </div>

            <div className="toolbar-stack single-toolbar">
              <input
                className="input-field slim-input"
                value={rideSearch}
                onChange={(event) => setRideSearch(event.target.value)}
                placeholder="Search rides"
              />
            </div>

            {filteredRides.length === 0 ? (
              <div className="empty-state-box">
                <p>No active rides match your search.</p>
              </div>
            ) : (
              <ul className="ride-list">
                {filteredRides.map((ride) => (
                  <li key={ride.id} className={selectedRideId === ride.id ? 'selected' : ''}>
                    <div className="ride-summary-row">
                      <div>
                        <strong>{ride.id}</strong>
                        <span>{ride.customer}</span>
                      </div>
                      <span className="status-pill online">{rideStatusLabels[ride.status]}</span>
                    </div>
                    <p>{ride.pickup} → {ride.destination}</p>
                    <div className="ride-meta-row">
                      <span>{ride.driver}</span>
                      <span>{ride.requestedAt}</span>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => setSelectedRideId(ride.id)}>
                      View ride
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="admin-panel detail-panel">
            {selectedRide ? (
              <>
                <div className="panel-header-row">
                  <h3>Ride Details</h3>
                </div>

                <div className="detail-map-wrap">
                  <MapView />
                </div>

                <div className="detail-grid">
                  <div><span>Customer</span><strong>{selectedRide.customer}</strong></div>
                  <div><span>Phone</span><strong>{selectedRide.customerPhone}</strong></div>
                  <div><span>Driver</span><strong>{selectedRide.driver}</strong></div>
                  <div><span>Passenger</span><strong>{selectedRide.passengerType}</strong></div>
                  <div><span>Pickup</span><strong>{selectedRide.pickup}</strong></div>
                  <div><span>Destination</span><strong>{selectedRide.destination}</strong></div>
                  <div><span>Status</span><strong>{rideStatusLabels[selectedRide.status]}</strong></div>
                  <div><span>Payment</span><strong>{selectedRide.paymentMethod}</strong></div>
                  <div><span>Requested</span><strong>{selectedRide.requestedAt}</strong></div>
                  <div><span>Fare</span><strong>{selectedRide.fare}</strong></div>
                </div>
              </>
            ) : (
              <div className="empty-state-box">
                <p>No ride selected.</p>
              </div>
            )}
          </aside>
        </section>
      ) : null}

      {activeTab === 'ride-history' ? (
        <section className="admin-panel">
          <div className="panel-header-row">
            <h3>Completed Rides</h3>
          </div>

          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Ride ID</th>
                  <th>Customer</th>
                  <th>Driver</th>
                  <th>Pickup</th>
                  <th>Destination</th>
                  <th>Date/Time</th>
                  <th>Fare</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {completedRides.map((ride) => (
                  <tr key={ride.id}>
                    <td>{ride.id}</td>
                    <td>{ride.customer}</td>
                    <td>{ride.driver}</td>
                    <td>{ride.pickup}</td>
                    <td>{ride.destination}</td>
                    <td>{ride.happenedAt}</td>
                    <td>{ride.fare}</td>
                    <td><span className="completed-pill">Completed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeTab === 'payments' ? (
        <section className="admin-panel">
          <div className="panel-header-row">
            <h3>Payments</h3>
          </div>

          <div className="toolbar-stack single-toolbar">
            <input
              className="input-field slim-input"
              value={paymentSearch}
              onChange={(event) => setPaymentSearch(event.target.value)}
              placeholder="Search payments"
            />
          </div>

          {filteredPayments.length === 0 ? (
            <div className="empty-state-box">
              <p>No payment records match your search.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ride ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Method</th>
                    <th>Status</th>
                    <th>Date/Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((payment) => (
                    <tr key={`${payment.rideId}-${payment.dateTime}`}>
                      <td>{payment.rideId}</td>
                      <td>{payment.customer}</td>
                      <td>{payment.amount}</td>
                      <td>{payment.paymentMethod}</td>
                      <td>
                        <span className={payment.status === 'Paid' ? 'status-pill online' : 'status-pill offline'}>
                          {payment.status}
                        </span>
                      </td>
                      <td>{payment.dateTime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'driver-applications' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row"><h3>Driver Applications</h3></div>
            {applicationError ? <p className="form-error-message submit-error">{applicationError}</p> : null}
            {isLoadingApplications ? <p className="muted-copy">Loading applications...</p> : applications.length === 0 ? <div className="empty-state-box"><p>No driver applications found.</p></div> : (
              <div className="table-wrap"><table className="admin-table"><thead><tr><th>Applicant</th><th>Mobile</th><th>Barangay</th><th>Vehicle</th><th>Operating area</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
                {applications.map((application) => <tr key={application.id} onClick={() => setSelectedApplicationId(application.id)} className={selectedApplicationId === application.id ? 'selected-row' : ''}>
                  <td>{application.full_name}</td><td>{application.mobile_number}</td><td>{application.barangay}</td><td>{application.vehicle_number}</td><td>{application.operating_area}</td>
                  <td><span className="status-pill online">{application.status}</span></td><td>{new Date(application.created_at).toLocaleDateString()}</td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedApplication ? <><div className="panel-header-row"><h3>Application Details</h3></div><div className="detail-grid">
            <div><span>Full name</span><strong>{selectedApplication.full_name}</strong></div><div><span>Mobile</span><strong>{selectedApplication.mobile_number}</strong></div><div><span>Email</span><strong>{selectedApplication.email || 'Not provided'}</strong></div><div><span>Barangay</span><strong>{selectedApplication.barangay}</strong></div><div><span>Vehicle / body number</span><strong>{selectedApplication.vehicle_number}</strong></div><div><span>Plate number</span><strong>{selectedApplication.plate_number || 'Not provided'}</strong></div><div><span>Driving experience</span><strong>{selectedApplication.driving_experience} years</strong></div><div><span>Operating area</span><strong>{selectedApplication.operating_area}</strong></div><div><span>Schedule</span><strong>{selectedApplication.preferred_schedule}</strong></div><div><span>Contact preference</span><strong>{selectedApplication.contact_preference}</strong></div><div><span>Reason</span><strong>{selectedApplication.reason || 'Not provided'}</strong></div>
          </div><label className="field-block application-status-control"><span className="field-label">Application status</span><select className="input-field" value={selectedApplication.status} onChange={(event) => void handleApplicationStatusChange(selectedApplication.id, event.target.value as DriverApplicationStatus)}>{driverApplicationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></> : <div className="empty-state-box"><p>Select an application to view details.</p></div>}</aside>
        </section>
      ) : null}
    </div>
  )
}
