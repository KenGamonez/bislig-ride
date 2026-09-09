import { useEffect, useMemo, useState } from 'react'
import sanjayPhoto from '../assets/Sanjay Monteroso.jpg'
import { AppHeader } from '../components/AppHeader'
import { AdminLogin } from '../components/AdminLogin'
import { MapView } from '../components/MapView'
import { type AdminDriver, type AdminRide, type DriverAvailability, type DriverStatus } from '../lib/adminDemoData'
import { fetchAdminLiveCustomers, fetchAdminLiveRides } from '../lib/adminLiveData'
import { fetchDriverApplications, updateDriverApplicationStatus } from '../lib/driverApplications'
import { createSignedApplicationFileUrl } from '../lib/driverApplicationFiles'
import { getContactMessages, updateContactMessageStatus } from '../lib/contactMessages'
import { createDriver, fetchDrivers, updateDriver, type DriverRecord } from '../lib/drivers'
import { fetchAdminRideCancellations, type AdminCancellation } from '../lib/rideCancellations'
import { driverApplicationStatuses, driverApplicationStatusLabels, type DriverApplication, type DriverApplicationStatus } from '../types/driverApplication'
import { contactMessageStatusLabels, type ContactMessage, type ContactMessageStatus } from '../types/contactMessage'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'


type AdminPayment = {
  rideId: string
  dateTime: string
  Rider: string
  amount: string
  paymentMethod: string
  status: string
}
type AdminTab = 'overview' | 'drivers' | 'customers' | 'active-rides' | 'ride-history' | 'payments' | 'driver-applications' | 'contact-messages'

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
  { key: 'contact-messages', label: 'Contact Messages' },
]

const rideStatusLabels: Record<AdminRide['status'], string> = {
  requested: 'Requested',
  accepted: 'Driver Accepted',
  arrived: 'Driver Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export function AdminExperience({
  onBack,
  view,
  onViewChange,
}: {
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}) {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [drivers, setDrivers] = useState<AdminDriver[]>([])
  const [liveRides, setLiveRides] = useState<any[]>([])
  const [liveCustomers, setLiveCustomers] = useState<any[]>([])
      const [isLoadingDrivers, setIsLoadingDrivers] = useState(false)
  const [driverError, setDriverError] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
  const [driverFilter, setDriverFilter] = useState<'all' | DriverStatus>('all')
  const [customerSearch, setCustomerSearch] = useState('')
  const [rideSearch, setRideSearch] = useState('')
  const [paymentSearch, setPaymentSearch] = useState('')
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedRideId, setSelectedRideId] = useState('')
  const [showAddDriver, setShowAddDriver] = useState(false)
  const [driverDraft, setDriverDraft] = useState<DriverDraft>(emptyDriverDraft)
  const [applications, setApplications] = useState<DriverApplication[]>([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [applicationError, setApplicationError] = useState('')
  const [isLoadingApplications, setIsLoadingApplications] = useState(false)
  const [applicationPhotoUrl, setApplicationPhotoUrl] = useState<string | null>(null)
  const [applicationLicenseUrl, setApplicationLicenseUrl] = useState<string | null>(null)
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([])
  const [selectedContactMessageId, setSelectedContactMessageId] = useState('')
  const [contactMessageError, setContactMessageError] = useState('')
  const [isLoadingContactMessages, setIsLoadingContactMessages] = useState(false)
  const [cancellations, setCancellations] = useState<AdminCancellation[]>([])
  const [isLoadingCancellations, setIsLoadingCancellations] = useState(false)
  const [cancellationError, setCancellationError] = useState('')
  const [cancellationFilter, setCancellationFilter] = useState<'all' | 'rider' | 'driver'>('all')
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const mapDriverRecord = (driver: DriverRecord): AdminDriver => ({
    id: driver.id,
    name: driver.full_name,
    phone: driver.phone,
    email: driver.email ?? '',
    profilePhoto: driver.profile_photo_url ?? '',
    vehicleType: driver.vehicle_type,
    vehicleModel: driver.vehicle_model,
    plateNumber: driver.plate_number,
    status: driver.status === 'active' ? 'Active' : 'Inactive',
    availability:
      driver.availability === 'online'
        ? 'Online'
        : driver.availability === 'busy'
          ? 'Busy'
          : 'Offline',
    rating: Number(driver.rating_average ?? 5),
    recentRides: [],
  })

  useEffect(() => {
    if (!isLoggedIn) return


    Promise.all([
      fetchAdminLiveRides(),
      fetchAdminLiveCustomers(),
    ])
      .then(([rides, customers]) => {
        setLiveRides(rides)
        setLiveCustomers(customers)

        setSelectedRideId(current =>
          current ||
          rides.find((ride: any) =>
            ['accepted', 'arrived', 'in_progress'].includes(ride.status)
          )?.id ||
          ''
        )
      })
      .catch((error) => {
        console.error('Unable to load live admin data:', error)
      })
      .finally(() => {
      })
  }, [isLoggedIn])
useEffect(() => {
    if (!isLoggedIn) return

    setIsLoadingDrivers(true)
    setDriverError('')

    fetchDrivers()
      .then((items) => {
        const mappedDrivers = items.map(mapDriverRecord)
        setDrivers(mappedDrivers)
        setSelectedDriverId((current) => current || mappedDrivers[0]?.id || '')
      })
      .catch((error) => {
        console.error('Unable to load drivers:', error)
        setDriverError('Unable to load drivers. Please try again.')
      })
      .finally(() => setIsLoadingDrivers(false))
  }, [isLoggedIn])
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

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'contact-messages') return
    setIsLoadingContactMessages(true)
    setContactMessageError('')
    getContactMessages()
      .then((items) => {
        setContactMessages(items)
        setSelectedContactMessageId((current) => current || items[0]?.id || '')
      })
      .catch(() => setContactMessageError('Unable to load contact messages. Check admin access and try again.'))
      .finally(() => setIsLoadingContactMessages(false))
  }, [activeTab, isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'ride-history') return
    setIsLoadingCancellations(true)
    setCancellationError('')
    fetchAdminRideCancellations()
      .then(setCancellations)
      .catch(() => setCancellationError('Unable to load cancellation history. Check admin access and try again.'))
      .finally(() => setIsLoadingCancellations(false))
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
    return liveCustomers.filter((Rider) => {
      return (
        Rider.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        Rider.phone.toLowerCase().includes(customerSearch.toLowerCase())
      )
    })
  }, [customerSearch])

  const filteredRides = useMemo(() => {
    return liveRides.filter((ride) => {
      return (
        ride.id.toLowerCase().includes(rideSearch.toLowerCase()) ||
        ride.Rider.toLowerCase().includes(rideSearch.toLowerCase()) ||
        ride.driver.toLowerCase().includes(rideSearch.toLowerCase())
      )
    })
  }, [rideSearch])

  const filteredPayments = useMemo<AdminPayment[]>(() => {
    return []
  }, [paymentSearch])

  const filteredCancellations = useMemo(() => {
    if (cancellationFilter === 'all') return cancellations
    return cancellations.filter((cancellation) =>
      cancellationFilter === 'rider'
        ? cancellation.cancelled_by_role === 'customer'
        : cancellation.cancelled_by_role === 'driver'
    )
  }, [cancellations, cancellationFilter])

  const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0]
  const selectedRide = liveRides.find((ride) => ride.id === selectedRideId) ?? liveRides.find((ride) => ['accepted', 'arrived', 'in_progress'].includes(ride.status)) ?? liveRides[0]
  const selectedApplication = applications.find((application) => application.id === selectedApplicationId)
  const selectedContactMessage = contactMessages.find((message) => message.id === selectedContactMessageId)

  useEffect(() => {
    let cancelled = false
    setApplicationPhotoUrl(null)
    setApplicationLicenseUrl(null)

    if (!selectedApplication?.driver_photo_path && !selectedApplication?.drivers_license_path) {
      return
    }

    const loadUrls = async () => {
      const [photoUrl, licenseUrl] = await Promise.all([
        createSignedApplicationFileUrl(selectedApplication?.driver_photo_path ?? ''),
        createSignedApplicationFileUrl(selectedApplication?.drivers_license_path ?? ''),
      ])
      if (cancelled) return
      setApplicationPhotoUrl(photoUrl)
      setApplicationLicenseUrl(licenseUrl)
    }

    void loadUrls()

    return () => {
      cancelled = true
    }
  }, [selectedApplication?.id, selectedApplication?.driver_photo_path, selectedApplication?.drivers_license_path])

  const handleApplicationStatusChange = async (id: string, status: DriverApplicationStatus) => {
    try {
      const updated = await updateDriverApplicationStatus(id, status)
      setApplications((current) => current.map((application) => application.id === id ? updated : application))
    } catch {
      setApplicationError('Unable to update this application. Please try again.')
    }
  }

  const handleContactMessageStatusChange = async (id: string, status: ContactMessageStatus) => {
    try {
      setContactMessageError('')
      const updated = await updateContactMessageStatus(id, status)
      setContactMessages((current) => current.map((message) => message.id === id ? updated : message))
    } catch {
      setContactMessageError('Unable to update this message. Please try again.')
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
    { label: 'Active Rides', value: String(liveRides.filter((ride: any) => ['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status)).length) },
    { label: 'Completed Rides', value: String(liveRides.filter((ride: any) => ride.status === 'completed').length) },
    { label: 'Cancelled Rides', value: String(liveRides.filter((ride: any) => ride.status === 'cancelled').length) },
    { label: 'Total Customers', value: String(liveCustomers.length) },
    { label: "Today's Revenue", value: 'Not connected' },
  ]

  const handleDriverSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!driverDraft.name || !driverDraft.phone || !driverDraft.vehicleModel || !driverDraft.plateNumber) {
      return
    }

    try {
      setDriverError('')

      const created = await createDriver({
        full_name: driverDraft.name.trim(),
        phone: driverDraft.phone.trim(),
        email: driverDraft.email.trim() || null,
        vehicle_type: driverDraft.vehicleType,
        vehicle_model: driverDraft.vehicleModel.trim(),
        plate_number: driverDraft.plateNumber.trim(),
        profile_photo_url:
          driverDraft.name.trim().toLowerCase() === 'san jay monteroso'
            ? sanjayPhoto
            : null,
        status: driverDraft.status === 'Active' ? 'active' : 'inactive',
        availability:
          driverDraft.availability === 'Online'
            ? 'online'
            : driverDraft.availability === 'Busy'
              ? 'busy'
              : 'offline',
      })

      const mappedDriver = mapDriverRecord(created)

      setDrivers((current) => [mappedDriver, ...current])
      setSelectedDriverId(mappedDriver.id)
      setShowAddDriver(false)
      setDriverDraft(emptyDriverDraft)
      setDriverFilter('all')
    } catch (error) {
      console.error('Unable to create driver:', error)
      setDriverError('Unable to add driver. Please check the information and try again.')
    }
  }

  const handleAvailabilityChange = async (driverId: string, availability: DriverAvailability) => {
    const dbAvailability =
      availability === 'Online'
        ? 'online'
        : availability === 'Busy'
          ? 'busy'
          : 'offline'

    try {
      setDriverError('')
      const updated = await updateDriver(driverId, { availability: dbAvailability })
      const mappedDriver = mapDriverRecord(updated)

      setDrivers((current) =>
        current.map((driver) => driver.id === driverId ? mappedDriver : driver),
      )
    } catch (error) {
      console.error('Unable to update driver availability:', error)
      setDriverError('Unable to update driver availability. Please try again.')
    }
  }

  const handleStatusChange = async (driverId: string, status: DriverStatus) => {
    const dbStatus = status === 'Active' ? 'active' : 'inactive'

    try {
      setDriverError('')
      const updated = await updateDriver(driverId, { status: dbStatus })
      const mappedDriver = mapDriverRecord(updated)

      setDrivers((current) =>
        current.map((driver) => driver.id === driverId ? mappedDriver : driver),
      )
    } catch (error) {
      console.error('Unable to update driver status:', error)
      setDriverError('Unable to update driver status. Please try again.')
    }
  }
  if (!isAuthReady) {
    return <div className="auth-shell"><div className="auth-card"><p className="muted-copy">Checking admin session...</p></div></div>
  }

  if (!isLoggedIn) {
    return <AdminLogin onBack={onBack} view={view} onViewChange={onViewChange} />
  }

  return (
    <>
      <AppHeader
        view={view}
        onViewChange={onViewChange}
        primaryLabel="My Rides"
        onPrimaryAction={() => onViewChange('Rider')}
      />

    <div className="admin-shell">
      <button type="button" className="secondary-action compact-button admin-back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        Back to Rider
      </button>

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

            {isLoadingDrivers ? <p className="muted-copy">Loading drivers...</p> : null}
            {driverError ? <p className="error-copy">{driverError}</p> : null}

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
                    <p><span className="rating-stars-inline"><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg> <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg> <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg> <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg> <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg> </span> {selectedDriver.rating}</p>
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
                        <span className="status-pill online">{rideStatusLabels[ride.status as keyof typeof rideStatusLabels]}</span>
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
                    <th>Rider</th>
                    <th>Phone</th>
                    <th>Rides</th>
                    <th>Last ride</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((Rider) => (
                    <tr key={Rider.id}>
                      <td>{Rider.name}</td>
                      <td>{Rider.phone}</td>
                      <td>{Rider.rides}</td>
                      <td>{Rider.lastRide}</td>
                      <td>
                        <span className="status-pill online">
                          {Rider.status}
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
                        <span>{ride.Rider}</span>
                      </div>
                      <span className="status-pill online">{rideStatusLabels[ride.status as keyof typeof rideStatusLabels]}</span>
                    </div>
                    <p>{ride.pickup} â†’ {ride.destination}</p>
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
                  <div><span>Rider</span><strong>{selectedRide.Rider}</strong></div>
                  <div><span>Phone</span><strong>{selectedRide.customerPhone}</strong></div>
                  <div><span>Driver</span><strong>{selectedRide.driver}</strong></div>
                  <div><span>Passenger</span><strong>{selectedRide.passengerType}</strong></div>
                  <div><span>Pickup</span><strong>{selectedRide.pickup}</strong></div>
                  <div><span>Destination</span><strong>{selectedRide.destination}</strong></div>
                  <div><span>Status</span><strong>{rideStatusLabels[selectedRide.status as keyof typeof rideStatusLabels]}</strong></div>
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
        <div className="admin-layout">
          <section className="admin-panel">
            <div className="panel-header-row">
              <h3>Completed Rides</h3>
            </div>

            <div className="table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ride ID</th>
                    <th>Rider</th>
                    <th>Driver</th>
                    <th>Pickup</th>
                    <th>Destination</th>
                    <th>Date/Time</th>
                    <th>Fare</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {liveRides.filter((ride) => ride.status === 'completed').map((ride) => (
                    <tr key={ride.id}>
                      <td>{ride.id}</td>
                      <td>{ride.Rider}</td>
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

          <section className="admin-panel">
            <div className="panel-header-row">
              <h3>Cancellation History</h3>
            </div>

            <div className="toolbar-stack single-toolbar">
              <select
                className="input-field slim-input"
                value={cancellationFilter}
                onChange={(event) => setCancellationFilter(event.target.value as 'all' | 'rider' | 'driver')}
              >
                <option value="all">All cancellations</option>
                <option value="rider">Rider cancellations</option>
                <option value="driver">Driver cancellations</option>
              </select>
            </div>

            {cancellationError ? <p className="error-copy">{cancellationError}</p> : null}
            {isLoadingCancellations ? (
              <p className="muted-copy">Loading cancellation history...</p>
            ) : filteredCancellations.length === 0 ? (
              <div className="empty-state-box">
                <p>{cancellations.length === 0 ? 'No cancellations recorded yet.' : 'No cancellations match your filter.'}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Date/Time</th>
                      <th>Ride ID</th>
                      <th>Rider</th>
                      <th>Driver</th>
                      <th>Route</th>
                      <th>Cancelled by</th>
                      <th>Role</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCancellations.map((cancellation) => (
                      <tr key={cancellation.id}>
                        <td>{new Date(cancellation.created_at).toLocaleString()}</td>
                        <td><code className="ride-id-cell" title={cancellation.ride_id}>{cancellation.ride_id.slice(0, 8)}…</code></td>
                        <td>{cancellation.riderName}</td>
                        <td>{cancellation.driverName}</td>
                        <td>{cancellation.pickupAddress} → {cancellation.destinationAddress}</td>
                        <td>{cancellation.cancelledByName}</td>
                        <td>
                          <span className={cancellation.cancelled_by_role === 'driver' ? 'status-pill busy' : 'status-pill online'}>
                            {cancellation.cancelled_by_role === 'driver' ? 'Driver' : 'Rider'}
                          </span>
                        </td>
                        <td className="cancel-reason-cell">{cancellation.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
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
                    <th>Rider</th>
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
                      <td>{payment.Rider}</td>
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
                  <td><span className={`status-pill ${application.status}`}>{driverApplicationStatusLabels[application.status]}</span></td><td>{new Date(application.created_at).toLocaleDateString()}</td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedApplication ? <><div className="panel-header-row"><h3>Application Details</h3></div><div className="detail-grid">
            <div><span>Full name</span><strong>{selectedApplication.full_name}</strong></div><div><span>Mobile</span><strong>{selectedApplication.mobile_number}</strong></div><div><span>Email</span><strong>{selectedApplication.email || 'Not provided'}</strong></div><div><span>Facebook</span><strong>{selectedApplication.facebook_profile || 'Not provided'}</strong></div><div><span>Barangay</span><strong>{selectedApplication.barangay}</strong></div><div><span>Vehicle / body number</span><strong>{selectedApplication.vehicle_number}</strong></div><div><span>Plate number</span><strong>{selectedApplication.plate_number || 'Not provided'}</strong></div><div><span>Driving experience</span><strong>{selectedApplication.driving_experience} years</strong></div><div><span>Operating area</span><strong>{selectedApplication.operating_area}</strong></div><div><span>Schedule</span><strong>{selectedApplication.preferred_schedule}</strong></div><div><span>Reason</span><strong>{selectedApplication.reason || 'Not provided'}</strong></div><div><span>Submitted</span><strong>{new Date(selectedApplication.created_at).toLocaleString()}</strong></div>
          </div><div className="application-documents"><h4 className="detail-documents-heading">Uploaded Documents</h4>
            <div className="application-document"><span>Driver's Photo</span>{applicationPhotoUrl ? <a className="application-image-link" href={applicationPhotoUrl} target="_blank" rel="noopener noreferrer"><img className="application-image" src={applicationPhotoUrl} alt="Driver's photo" /></a> : <p className="muted-copy">No photo uploaded.</p>}</div>
            <div className="application-document"><span>Driver's License</span>{applicationLicenseUrl ? <a className="application-image-link" href={applicationLicenseUrl} target="_blank" rel="noopener noreferrer"><img className="application-image" src={applicationLicenseUrl} alt="Driver's license" /></a> : <p className="muted-copy">No license uploaded.</p>}</div>
          </div><label className="field-block application-status-control"><span className="field-label">Application status</span><select className="input-field" value={selectedApplication.status} onChange={(event) => void handleApplicationStatusChange(selectedApplication.id, event.target.value as DriverApplicationStatus)}>{driverApplicationStatuses.map((status) => <option key={status} value={status}>{driverApplicationStatusLabels[status]}</option>)}</select></label></> : <div className="empty-state-box"><p>Select an application to view details.</p></div>}</aside>
        </section>
      ) : null}

      {activeTab === 'contact-messages' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row"><h3>Contact Messages</h3></div>
            {contactMessageError ? <p className="form-error-message submit-error">{contactMessageError}</p> : null}
            {isLoadingContactMessages ? <p className="muted-copy">Loading contact messages...</p> : contactMessages.length === 0 ? <div className="empty-state-box"><p>No contact messages found.</p></div> : (
              <div className="table-wrap"><table className="admin-table"><thead><tr><th>Inquiry</th><th>Name</th><th>Phone</th><th>Organization</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
                {contactMessages.map((message) => <tr key={message.id} onClick={() => setSelectedContactMessageId(message.id)} className={selectedContactMessageId === message.id ? 'selected-row' : ''}>
                  <td>{message.inquiry_type}</td><td>{message.full_name}</td><td>{message.phone}</td><td>{message.organization || 'Not provided'}</td>
                  <td><span className={`status-pill ${message.status}`}>{contactMessageStatusLabels[message.status]}</span></td><td>{new Date(message.created_at).toLocaleDateString()}</td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedContactMessage ? <><div className="panel-header-row"><h3>Message Details</h3></div><div className="detail-grid">
            <div><span>Inquiry Type</span><strong>{selectedContactMessage.inquiry_type}</strong></div><div><span>Full Name</span><strong>{selectedContactMessage.full_name}</strong></div><div><span>Phone</span><strong>{selectedContactMessage.phone}</strong></div><div><span>Email</span><strong>{selectedContactMessage.email || 'Not provided'}</strong></div><div><span>Organization</span><strong>{selectedContactMessage.organization || 'Not provided'}</strong></div><div><span>Message</span><strong>{selectedContactMessage.message}</strong></div><div><span>Submitted</span><strong>{new Date(selectedContactMessage.created_at).toLocaleString()}</strong></div><div><span>Status</span><strong>{contactMessageStatusLabels[selectedContactMessage.status]}</strong></div>
          </div><div className="contact-message-actions">
            <button type="button" className="secondary-action compact-button" disabled={selectedContactMessage.status === 'read'} onClick={() => void handleContactMessageStatusChange(selectedContactMessage.id, 'read')}>Mark as Read</button>
            <button type="button" className="secondary-action compact-button" disabled={selectedContactMessage.status === 'replied'} onClick={() => void handleContactMessageStatusChange(selectedContactMessage.id, 'replied')}>Mark as Replied</button>
            <button type="button" className="secondary-action compact-button" disabled={selectedContactMessage.status === 'archived'} onClick={() => void handleContactMessageStatusChange(selectedContactMessage.id, 'archived')}>Archive</button>
          </div></> : <div className="empty-state-box"><p>Select a message to view details.</p></div>}</aside>
        </section>
      ) : null}
    </div>
    </>
  )
}










