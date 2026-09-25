import { useCallback, useEffect, useMemo, useState } from 'react'
import sanjayPhoto from '../assets/Sanjay Monteroso.jpg'
import { AppHeader } from '../components/AppHeader'
import { AdminLogin } from '../components/AdminLogin'
import { MapView } from '../components/MapView'
import { type AdminDriver, type AdminRide, type DriverAvailability, type DriverStatus } from '../lib/adminDemoData'
import { fetchAdminLiveCustomers, fetchAdminLiveRideOffers, fetchAdminLiveRides, fetchAdminRideOfferHistory, subscribeToAdminRideNow, type AdminLiveRideOffer, type AdminRideOffer } from '../lib/adminLiveData'
import { fetchAdminDriverPresence, subscribeToAdminPresence, type AdminDriverPresence } from '../lib/adminPresence'
import { fetchAdminDriverHolds, forceDriverOffline, releaseDriverHold, subscribeToAdminHolds, type AdminDriverHold, type ForceOfflineResult } from '../lib/adminHolds'
import { driverLocationStatus } from '../lib/driverPresence'
import { adminCancelRide, adminRetryRide } from '../lib/dispatch'
import type { AdminCancelRideResult, DispatchResult } from '../types/dispatch'
import { fetchDriverApplications, linkDriverApplicationDriver, updateDriverApplicationStatus } from '../lib/driverApplications'
import { createSignedApplicationFileUrl } from '../lib/driverApplicationFiles'
import {
  removeUploadedDriverPhoto,
  uploadDriverPhoto,
  validateDriverPhoto,
} from '../lib/driverProfilePhotos'
import { getContactMessages, updateContactMessageStatus } from '../lib/contactMessages'
import { createDriver, fetchDrivers, removeDriver, updateDriver, type DriverRecord } from '../lib/drivers'
import { confirmDriverAuthEmail, createDriverAuthUser, isDriverUsernameTaken } from '../lib/driverAuth'
import {
  generateTemporaryPassword,
  isValidEmailLike,
  normalizeUsername,
  PASSWORD_HELP_TEXT,
  suggestUsername,
  validatePasswordStrength,
} from '../lib/driverAccounts'
import { fetchAdminRideCancellations, type AdminCancellation } from '../lib/rideCancellations'
import { adminCancelPakyawanBooking, fetchPakyawanBookings, formatPakyawanTiming, quotePakyawanBooking, type AdminCancelPakyawanResult } from '../lib/scheduledBookings'
import type { PakyawanBooking } from '../types/scheduledBooking'
import { adminCancelDelivery, fetchDeliveriesForAdmin, fetchDeliveryProofIds, fetchDeliveryProofPaths, formatDeliveryTiming, type AdminCancelDeliveryResult } from '../lib/deliveries'
import { getDeliveryProofSignedUrl } from '../lib/deliveryProof'
import type { DeliveryBooking } from '../types/delivery'
import { formatCentavos } from '../lib/fare'
import { formatCapacityOption, formatVehicleCapacity, passengerCapacityOptionsFor, VEHICLE_LABELS, VEHICLE_TYPES, type VehicleType } from '../lib/vehicle'
import { driverApplicationStatuses, driverApplicationStatusLabels, type DriverApplication, type DriverApplicationStatus } from '../types/driverApplication'
import { contactMessageStatusLabels, type ContactMessage, type ContactMessageStatus } from '../types/contactMessage'
import { supabase } from '../lib/supabase'
import type { Session } from '@supabase/supabase-js'

const DELIVERY_ACTIVE_STATUSES = ['pending', 'dispatching', 'assigned', 'quoted', 'confirmed', 'driver_on_way', 'driver_arrived', 'picked_up', 'in_transit']
const DELIVERY_EXCEPTION_STATUSES = ['no_driver', 'failed', 'cancelled']


type AdminPayment = {
  rideId: string
  dateTime: string
  Rider: string
  amount: string
  paymentMethod: string
  status: string
}
type AdminTab = 'overview' | 'drivers' | 'customers' | 'active-rides' | 'ride-history' | 'payments' | 'driver-applications' | 'contact-messages' | 'pakyawan' | 'deliveries'

type DriverDraft = {
  name: string
  phone: string
  email: string
  vehicleType: string
  vehicleModel: string
  plateNumber: string
  vehicleCapacity: number
  status: DriverStatus
  availability: DriverAvailability
  createAccount: boolean
  username: string
  passwordMethod: 'generated' | 'custom'
  initialPassword: string
  photo: File | null
  photoPreviewUrl: string
}

type ManageDraft = {
  email: string
  username: string
  passwordMethod: 'generated' | 'custom'
  initialPassword: string
}

type ManagedCredentials = {
  name: string
  email: string
  username: string
  initialPassword: string
  needsEmailConfirmation: boolean
}

const emptyDriverDraft: DriverDraft = {
  name: '',
  phone: '',
  email: '',
  vehicleType: 'motorcycle',
  vehicleModel: '',
  plateNumber: '',
  vehicleCapacity: 1,
  status: 'Active',
  availability: 'Offline',
  createAccount: true,
  username: '',
  passwordMethod: 'generated',
  initialPassword: '',
  photo: null,
  photoPreviewUrl: '',
}

const DriverVehicleEditor: React.FC<{
  driver: AdminDriver
  onSaved: (updated: DriverRecord) => void
  onError: (message: string) => void
}> = ({ driver, onSaved, onError }) => {
  const [draft, setDraft] = useState<{ vehicleType: string; vehicleCapacity: number | null }>({
    vehicleType: driver.vehicleType,
    vehicleCapacity: driver.vehicleCapacity,
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    onError('')

    try {
      const updated = await updateDriver(driver.id, {
        vehicle_type: draft.vehicleType,
        vehicle_capacity: draft.vehicleCapacity,
      })
      onSaved(updated)
    } catch (error) {
      console.error('Unable to update driver vehicle info:', error)
      onError('Unable to update vehicle info. Please try again.')
      setIsSaving(false)
    }
  }

  return (
    <div className="manage-account-box">
      <div className="panel-header-row">
        <h4>Vehicle & capacity</h4>
      </div>

      <div className="panel-form">
        <label className="field-block">
          <span className="field-label">Vehicle Type</span>
          <select
            className="input-field"
            value={draft.vehicleType}
            onChange={(event) => {
              const vehicle = event.target.value as VehicleType
              setDraft((current) => ({
                ...current,
                vehicleType: vehicle,
                vehicleCapacity: vehicle === 'motorcycle' ? 1 : current.vehicleCapacity,
              }))
            }}
          >
            {VEHICLE_TYPES.map((vehicle) => (
              <option key={vehicle} value={vehicle}>
                {VEHICLE_LABELS[vehicle]}
              </option>
            ))}
          </select>
        </label>

        {draft.vehicleType === 'motorcycle' ? (
          <p className="muted-copy form-note">
            Motorcycle rides carry exactly 1 passenger.
          </p>
        ) : (
          <label className="field-block">
            <span className="field-label">Passenger Capacity</span>
            <select
              className="input-field"
              value={draft.vehicleCapacity ?? ''}
              onChange={(event) => {
                const capacity = event.target.value === '' ? null : Number.parseInt(event.target.value, 10)
                setDraft((current) => ({ ...current, vehicleCapacity: capacity }))
              }}
            >
              <option value="">Not set</option>
              {passengerCapacityOptionsFor(draft.vehicleType as VehicleType).map((capacity) => (
                <option key={capacity} value={capacity}>
                  {formatCapacityOption(draft.vehicleType as VehicleType, capacity)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="primary-action compact-button"
            onClick={() => void handleSave()}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Vehicle'}
          </button>
          <button
            type="button"
            className="secondary-action compact-button"
            onClick={() => {
              setDraft({ vehicleType: driver.vehicleType, vehicleCapacity: driver.vehicleCapacity })
            }}
            disabled={isSaving}
          >
            Reset
          </button>
        </div>
      </div>

      <p className="muted-copy">
        {formatVehicleCapacity(driver.vehicleCapacity)}
        {!driver.vehicleCapacity ? ' — dispatch will skip this driver until capacity is set.' : ''}
      </p>
    </div>
  )
}

const emptyManageDraft: ManageDraft = {
  email: '',
  username: '',
  passwordMethod: 'generated',
  initialPassword: '',
}

const driverRemovalErrorMessage = (error: unknown): string => {
  const raw = error instanceof Error ? error.message : ''

  if (raw) {
    const trimmed = raw.replace(/\n.*$/s, '').trim()

    if (trimmed && !/^\{/.test(trimmed)) {
      return trimmed
    }
  }

  return 'Unable to remove the driver. Please try again.'
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
  { key: 'pakyawan', label: 'Pakyawan' },
  { key: 'deliveries', label: 'Deliveries' },
]

const rideStatusLabels: Record<AdminRide['status'], string> = {
  requested: 'Requested',
  accepted: 'Driver Accepted',
  arrived: 'Driver Arrived',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const rideOfferStatusLabels: Record<string, string> = {
  offered: 'Offered',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  withdrawn: 'Withdrawn',
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
  const [drivers, setDrivers] = useState<(AdminDriver & { canAcceptDeliveries: boolean })[]>([])
  const [liveRides, setLiveRides] = useState<any[]>([])
  const [liveCustomers, setLiveCustomers] = useState<any[]>([])
  const [rideOfferHistory, setRideOfferHistory] = useState<AdminRideOffer[]>([])
  const [presenceMap, setPresenceMap] = useState<Record<string, AdminDriverPresence>>({})
  const [driverHolds, setDriverHolds] = useState<Record<string, AdminDriverHold>>({})
      const [isLoadingDrivers, setIsLoadingDrivers] = useState(false)
  const [driverError, setDriverError] = useState('')
  const [driverSearch, setDriverSearch] = useState('')
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
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [createdAccount, setCreatedAccount] = useState<{
    name: string
    email: string
    username: string
    initialPassword: string
    needsEmailConfirmation: boolean
  } | null>(null)
  const [driverToRemove, setDriverToRemove] = useState<AdminDriver | null>(null)
  const [isRemovingDriver, setIsRemovingDriver] = useState(false)
  const [driverSuccess, setDriverSuccess] = useState('')
  const [showManageAccount, setShowManageAccount] = useState(false)
  const [manageContextId, setManageContextId] = useState<string | null>(null)
  const [manageDraft, setManageDraft] = useState<ManageDraft>(emptyManageDraft)
  const [managingAccount, setManagingAccount] = useState(false)
  const [manageError, setManageError] = useState('')
  const [manageMessage, setManageMessage] = useState('')
  const [managedCredentials, setManagedCredentials] = useState<ManagedCredentials | null>(null)
  const [applicationPhotoUrl, setApplicationPhotoUrl] = useState<string | null>(null)
  const [applicationLicenseUrl, setApplicationLicenseUrl] = useState<string | null>(null)
  const [contactMessages, setContactMessages] = useState<ContactMessage[]>([])
  const [selectedContactMessageId, setSelectedContactMessageId] = useState('')
  const [contactMessageError, setContactMessageError] = useState('')
  const [isLoadingContactMessages, setIsLoadingContactMessages] = useState(false)
  const [cancellations, setCancellations] = useState<AdminCancellation[]>([])
  const [isLoadingCancellations, setIsLoadingCancellations] = useState(false)
  const [cancellationError, setCancellationError] = useState('')
  const [pakyawanBookings, setPakyawanBookings] = useState<PakyawanBooking[]>([])
  const [selectedPakyawanBookingId, setSelectedPakyawanBookingId] = useState('')
  const [pakyawanError, setPakyawanError] = useState('')
  const [isLoadingPakyawan, setIsLoadingPakyawan] = useState(false)
  const [deliveries, setDeliveries] = useState<DeliveryBooking[]>([])
  const [selectedDeliveryId, setSelectedDeliveryId] = useState('')
  const [deliveryError, setDeliveryError] = useState('')
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false)
  const [deliveryFilter, setDeliveryFilter] = useState<'all' | 'active' | 'completed' | 'exceptions'>('all')
  const [deliveryProofIds, setDeliveryProofIds] = useState<Set<string>>(new Set())
  const [deliveryProofPaths, setDeliveryProofPaths] = useState<Record<string, string>>({})
  const [deliveryProofImages, setDeliveryProofImages] = useState<Record<string, { url?: string; failed?: boolean }>>({})
  const [quotePesos, setQuotePesos] = useState('')
  const [quoteError, setQuoteError] = useState('')
  const [isQuoting, setIsQuoting] = useState(false)
  const [liveRideOffers, setLiveRideOffers] = useState<Record<string, AdminLiveRideOffer>>({})
  const [confirmingRetry, setConfirmingRetry] = useState(false)
  const [isRetryingRide, setIsRetryingRide] = useState(false)
  const [retryRideError, setRetryRideError] = useState('')
  const [retryRideResult, setRetryRideResult] = useState<DispatchResult | null>(null)
  const [cancelRideTarget, setCancelRideTarget] = useState<{ id: string; Rider: string; pickup: string; destination: string; status: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancellingRide, setIsCancellingRide] = useState(false)
  const [cancelRideError, setCancelRideError] = useState('')
  const [cancelRideResult, setCancelRideResult] = useState<AdminCancelRideResult | null>(null)
  const [cancelPakyawanTarget, setCancelPakyawanTarget] = useState<{ id: string; customer: string; route: string; status: string } | null>(null)
  const [pakyawanCancelReason, setPakyawanCancelReason] = useState('')
  const [isCancellingPakyawan, setIsCancellingPakyawan] = useState(false)
  const [pakyawanCancelError, setPakyawanCancelError] = useState('')
  const [pakyawanCancelResult, setPakyawanCancelResult] = useState<AdminCancelPakyawanResult | null>(null)
  const [cancelDeliveryTarget, setCancelDeliveryTarget] = useState<{ id: string; sender: string; route: string; status: string } | null>(null)
  const [deliveryCancelReason, setDeliveryCancelReason] = useState('')
  const [isCancellingDelivery, setIsCancellingDelivery] = useState(false)
  const [deliveryCancelError, setDeliveryCancelError] = useState('')
  const [deliveryCancelResult, setDeliveryCancelResult] = useState<AdminCancelDeliveryResult | null>(null)
  const [retryWaitText, setRetryWaitText] = useState('')

  const resetRetryUi = () => {
    setConfirmingRetry(false)
    setRetryRideError('')
    setRetryRideResult(null)
    setRetryWaitText('')
  }

  const openRetryConfirm = (ride: { status: unknown; requestedAtIso: string; requestedAt: string }) => {
    const waitMinutes = Math.max(0, Math.floor((Date.now() - new Date(ride.requestedAtIso).getTime()) / 60000))
    setRetryWaitText(`Status ${rideStatusLabels[ride.status as keyof typeof rideStatusLabels]} · waiting ${waitMinutes} min since ${ride.requestedAt}. Dispatch will be retried.`)
    setRetryRideError('')
    setRetryRideResult(null)
    setConfirmingRetry(true)
  }
  const [cancellationFilter, setCancellationFilter] = useState<'all' | 'rider' | 'driver'>('all')
  const [isAuthReady, setIsAuthReady] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const mapDriverRecord = (driver: DriverRecord): AdminDriver & { canAcceptDeliveries: boolean } => ({
    id: driver.id,
    name: driver.full_name,
    phone: driver.phone,
    email: driver.email ?? '',
    profilePhoto: driver.profile_photo_url ?? '',
    vehicleType: driver.vehicle_type,
    vehicleModel: driver.vehicle_model,
    plateNumber: driver.plate_number,
    vehicleCapacity: driver.vehicle_capacity ?? null,
    status: driver.status === 'active' ? 'Active' : 'Inactive',
    availability:
      driver.availability === 'online'
        ? 'Online'
        : driver.availability === 'busy'
          ? 'Busy'
          : 'Offline',
    rating: Number(driver.rating_average ?? 5),
    username: driver.username ?? '',
    authUserId: driver.auth_user_id ?? null,
    canAcceptPakyawan: Boolean(driver.can_accept_pakyawan),
    canAcceptDeliveries: Boolean((driver as unknown as { can_accept_deliveries?: boolean }).can_accept_deliveries),
    recentRides: [],
  })

  const refreshAdminRideNow = useCallback(async () => {
    const rides = await fetchAdminLiveRides()
    setLiveRides(rides)
    setLiveRideOffers(await fetchAdminLiveRideOffers(rides.map((ride: any) => ride.id)))
    return rides
  }, [])

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

        return fetchAdminLiveRideOffers(rides.map((ride: any) => ride.id))
      })
      .then((offers) => {
        setLiveRideOffers(offers)
      })
      .catch((error) => {
        console.error('Unable to load live admin data:', error)
      })
      .finally(() => {
      })
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    return subscribeToAdminRideNow(() => {
      refreshAdminRideNow().catch((error) => {
        console.error('Unable to refresh live admin rides:', error)
      })

      if (selectedRideId) {
        fetchAdminRideOfferHistory(selectedRideId)
          .then((history) => {
            setRideOfferHistory(history)
          })
          .catch((error) => {
            console.error('Unable to refresh ride offer history:', error)
          })
      }
    })
  }, [isLoggedIn, refreshAdminRideNow, selectedRideId])

  useEffect(() => {
    if (!isLoggedIn || !selectedRideId) return

    fetchAdminRideOfferHistory(selectedRideId)
      .then((history) => {
        setRideOfferHistory(history)
      })
      .catch((error) => {
        console.error('Unable to load ride offer history:', error)
      })
  }, [isLoggedIn, selectedRideId])
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
    if (!isLoggedIn) return

    fetchAdminDriverPresence()
      .then((rows) => {
        setPresenceMap(rows)
      })
      .catch((error) => {
        console.error('Unable to load driver presence:', error)
      })
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    return subscribeToAdminPresence(() => {
      fetchAdminDriverPresence()
        .then((loaded) => {
          setPresenceMap(loaded)
        })
        .catch((error) => {
          console.error('Unable to refresh driver presence:', error)
        })
    })
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    fetchAdminDriverHolds()
      .then((loaded) => {
        setDriverHolds(loaded)
      })
      .catch((error) => {
        console.error('Unable to load driver holds:', error)
      })
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    return subscribeToAdminHolds(() => {
      fetchAdminDriverHolds()
        .then((holds) => {
          setDriverHolds(holds)
        })
        .catch((error) => {
          console.error('Unable to refresh driver holds:', error)
        })
    })
  }, [isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn) return

    fetchDriverApplications()
      .then((items) => {
        setApplications(items)
      })
      .catch((error) => {
        console.error('Unable to preload driver applications:', error)
      })

    getContactMessages()
      .then((items) => {
        setContactMessages(items)
      })
      .catch((error) => {
        console.error('Unable to preload contact messages:', error)
      })

    fetchPakyawanBookings()
      .then((items) => {
        setPakyawanBookings(items)
      })
      .catch((error) => {
        console.error('Unable to preload Pakyawan bookings:', error)
      })

    fetchDeliveriesForAdmin()
      .then((items) => {
        setDeliveries(items)
      })
      .catch((error) => {
        console.error('Unable to preload deliveries:', error)
      })
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

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'pakyawan') return
    setIsLoadingPakyawan(true)
    setPakyawanError('')
    fetchPakyawanBookings()
      .then((items) => {
        setPakyawanBookings(items)
        setSelectedPakyawanBookingId((current) => current || items[0]?.id || '')
      })
      .catch(() => setPakyawanError('Unable to load Pakyawan bookings. Check admin access and try again.'))
      .finally(() => setIsLoadingPakyawan(false))
  }, [activeTab, isLoggedIn])

  useEffect(() => {
    if (!isLoggedIn || activeTab !== 'deliveries') return
    setIsLoadingDeliveries(true)
    setDeliveryError('')
    fetchDeliveriesForAdmin()
      .then((items) => {
        setDeliveries(items)
        setSelectedDeliveryId((current) => current || items[0]?.id || '')
        const ids = items.map((item) => item.id)
        return Promise.all([fetchDeliveryProofIds(ids), fetchDeliveryProofPaths(ids)] as const)
      })
      .then(([proofIds, proofPaths]) => {
        setDeliveryProofIds(proofIds)
        setDeliveryProofPaths(proofPaths)
      })
      .catch(() => setDeliveryError('Unable to load deliveries. Check admin access and try again.'))
      .finally(() => setIsLoadingDeliveries(false))
  }, [activeTab, isLoggedIn])

  const retryResultText = (result: DispatchResult): string => {
    if (result.driver_assigned) {
      return 'Driver accepted automatically.'
    }

    if (result.offer_id) {
      return 'Driver offer sent.'
    }

    if (result.ride_status === 'no_driver') {
      return 'No eligible driver currently available.'
    }

    return `Dispatch state: ${result.ride_status ?? 'unknown'}.`
  }

  const handleRetryDispatch = async () => {
    if (isRetryingRide || !selectedRide) {
      return
    }

    if (selectedRide.status !== 'requested' && selectedRide.status !== 'no_driver') {
      return
    }

    if (selectedRide.driverId || liveRideOffers[selectedRide.id]) {
      return
    }

    setIsRetryingRide(true)
    setRetryRideError('')
    setRetryRideResult(null)

    try {
      const result = await adminRetryRide(selectedRide.id)
      setRetryRideResult(result)
      setConfirmingRetry(false)

      // Manual fallback refresh; the realtime subscription also
      // invalidates this dataset when the dispatch writes land.
      await refreshAdminRideNow()
      setRideOfferHistory(await fetchAdminRideOfferHistory(selectedRide.id))
    } catch (error) {
      console.error('Unable to retry dispatch:', error)
      setRetryRideError(error instanceof Error && error.message ? error.message : 'Unable to retry dispatch. Please try again.')
    } finally {
      setIsRetryingRide(false)
    }
  }

  const openCancelRideModal = (ride: { id: string; Rider: string; pickup: string; destination: string; status: unknown }) => {
    setCancelRideTarget({ id: ride.id, Rider: ride.Rider, pickup: ride.pickup, destination: ride.destination, status: String(ride.status) })
    setCancelReason('')
    setCancelRideError('')
    setCancelRideResult(null)
  }

  const handleCancelRide = async () => {
    if (!cancelRideTarget || isCancellingRide) {
      return
    }

    const reason = cancelReason.trim()

    if (!reason) {
      setCancelRideError('Enter a reason for cancelling this ride.')
      return
    }

    setIsCancellingRide(true)
    setCancelRideError('')

    try {
      const result = await adminCancelRide(cancelRideTarget.id, reason)
      setCancelRideResult(result)
      setCancelRideTarget(null)
      setCancelReason('')

      // Manual fallback refresh; the realtime subscription also
      // invalidates this dataset when the cancellation writes land.
      await refreshAdminRideNow()
      setRideOfferHistory(await fetchAdminRideOfferHistory(cancelRideTarget.id))
    } catch (error) {
      console.error('Unable to cancel ride:', error)
      setCancelRideResult(null)
      setCancelRideError(error instanceof Error && error.message ? error.message : 'Unable to cancel this ride. Please try again.')
    } finally {
      setIsCancellingRide(false)
    }
  }

  const openCancelPakyawanModal = (booking: { id: string; customer_name: string; pickup_location: string; destination: string; status: unknown }) => {
    setCancelPakyawanTarget({ id: booking.id, customer: booking.customer_name, route: `${booking.pickup_location} → ${booking.destination}`, status: String(booking.status) })
    setPakyawanCancelReason('')
    setPakyawanCancelError('')
    setPakyawanCancelResult(null)
  }

  const handleCancelPakyawan = async () => {
    if (!cancelPakyawanTarget || isCancellingPakyawan) {
      return
    }

    const reason = pakyawanCancelReason.trim()

    if (!reason) {
      setPakyawanCancelError('Enter a reason for cancelling this booking.')
      return
    }

    setIsCancellingPakyawan(true)
    setPakyawanCancelError('')

    try {
      const result = await adminCancelPakyawanBooking(cancelPakyawanTarget.id, reason)
      setPakyawanCancelResult(result)
      setCancelPakyawanTarget(null)
      setPakyawanCancelReason('')

      const items = await fetchPakyawanBookings()
      setPakyawanBookings(items)
    } catch (error) {
      console.error('Unable to cancel Pakyawan booking:', error)
      setPakyawanCancelResult(null)
      setPakyawanCancelError(error instanceof Error && error.message ? error.message : 'Unable to cancel this booking. Please try again.')
    } finally {
      setIsCancellingPakyawan(false)
    }
  }

  const openCancelDeliveryModal = (delivery: { id: string; sender_name: string; pickup_address: string; delivery_address: string; status: unknown }) => {
    setCancelDeliveryTarget({ id: delivery.id, sender: delivery.sender_name, route: `${delivery.pickup_address} → ${delivery.delivery_address}`, status: String(delivery.status) })
    setDeliveryCancelReason('')
    setDeliveryCancelError('')
    setDeliveryCancelResult(null)
  }

  const handleCancelDelivery = async () => {
    if (!cancelDeliveryTarget || isCancellingDelivery) {
      return
    }

    const reason = deliveryCancelReason.trim()

    if (!reason) {
      setDeliveryCancelError('Enter a reason for cancelling this delivery.')
      return
    }

    setIsCancellingDelivery(true)
    setDeliveryCancelError('')

    try {
      const result = await adminCancelDelivery(cancelDeliveryTarget.id, reason)
      setDeliveryCancelResult(result)
      setCancelDeliveryTarget(null)
      setDeliveryCancelReason('')

      const items = await fetchDeliveriesForAdmin()
      setDeliveries(items)
    } catch (error) {
      console.error('Unable to cancel delivery:', error)
      setDeliveryCancelResult(null)
      setDeliveryCancelError(error instanceof Error && error.message ? error.message : 'Unable to cancel this delivery. Please try again.')
    } finally {
      setIsCancellingDelivery(false)
    }
  }

  const handleQuotePakyawan = async () => {
    if (isQuoting || !selectedPakyawanBooking || selectedPakyawanBooking.status !== 'pending') {
      return
    }

    const cleaned = quotePesos.replace(/[₱,\s]/g, '')
    const pesos = Number(cleaned)

    if (!cleaned || !Number.isFinite(pesos) || pesos <= 0) {
      setQuoteError('Enter a valid price in pesos.')
      return
    }

    setIsQuoting(true)
    setQuoteError('')

    try {
      await quotePakyawanBooking(selectedPakyawanBooking.id, Math.round(pesos * 100))
      const items = await fetchPakyawanBookings()
      setPakyawanBookings(items)
      setQuotePesos('')
    } catch (error) {
      console.error('Unable to quote Pakyawan booking:', error)
      setQuoteError(error instanceof Error && error.message ? error.message : 'Unable to submit the quote. Please try again.')
    } finally {
      setIsQuoting(false)
    }
  }

  const filteredDrivers = useMemo(() => {
    return drivers.filter((driver) => {
      const matchesSearch =
        driver.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
        driver.phone.toLowerCase().includes(driverSearch.toLowerCase()) ||
        driver.vehicleModel.toLowerCase().includes(driverSearch.toLowerCase())

      return matchesSearch
    })
  }, [drivers, driverSearch])

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
  const selectedRideOffer = selectedRide && (selectedRide.status === 'requested' || selectedRide.status === 'no_driver') && !selectedRide.driverId
    ? liveRideOffers[selectedRide.id] ?? null
    : null
  const selectedRideOfferDriver = selectedRideOffer?.driverId
    ? drivers.find((driver) => driver.id === selectedRideOffer.driverId)?.name ?? 'Driver'
    : null
  const selectedApplication = applications.find((application) => application.id === selectedApplicationId)
  const selectedContactMessage = contactMessages.find((message) => message.id === selectedContactMessageId)
  const selectedPakyawanBooking = pakyawanBookings.find((booking) => booking.id === selectedPakyawanBookingId)
  const pakyawanDriverName = (driverId: string | null) =>
    driverId ? (drivers.find((driver) => driver.id === driverId)?.name ?? driverId.slice(0, 8)) : 'Not assigned'
  const deliveryDriverName = (driverId: string | null) =>
    driverId ? (drivers.find((driver) => driver.id === driverId)?.name ?? driverId.slice(0, 8)) : 'Not assigned'
  const selectedDelivery = deliveries.find((delivery) => delivery.id === selectedDeliveryId)
  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((delivery) => {
      if (deliveryFilter === 'active') {
        return DELIVERY_ACTIVE_STATUSES.includes(delivery.status)
      }
      if (deliveryFilter === 'completed') {
        return delivery.status === 'delivered'
      }
      if (deliveryFilter === 'exceptions') {
        return DELIVERY_EXCEPTION_STATUSES.includes(delivery.status)
      }
      return true
    })
  }, [deliveries, deliveryFilter])
  const deliveryCounters = useMemo(() => {
    const active = deliveries.filter((delivery) => DELIVERY_ACTIVE_STATUSES.includes(delivery.status)).length
    const delivered = deliveries.filter((delivery) => delivery.status === 'delivered').length
    const exceptions = deliveries.filter((delivery) => DELIVERY_EXCEPTION_STATUSES.includes(delivery.status)).length
    return [
      { label: 'Total Deliveries', value: String(deliveries.length), accent: true },
      { label: 'Active', value: String(active) },
      { label: 'Delivered', value: String(delivered) },
      { label: 'Exceptions', value: String(exceptions) },
    ]
  }, [deliveries])
  const deliveriesPerDriver = useMemo(() => {
    const byId = new Map<string, { total: number; active: number }>()
    for (const delivery of deliveries) {
      if (!delivery.driver_id) continue
      const driver = drivers.find((item) => item.id === delivery.driver_id)
      if (!driver) continue
      const entry = byId.get(driver.id) ?? { total: 0, active: 0 }
      entry.total += 1
      if (DELIVERY_ACTIVE_STATUSES.includes(delivery.status)) entry.active += 1
      byId.set(driver.id, entry)
    }
    return [...byId.entries()].map(([id, counts]) => ({
      id,
      name: drivers.find((item) => item.id === id)?.name ?? id.slice(0, 8),
      ...counts,
    }))
  }, [deliveries, drivers])

  useEffect(() => {
    if (!selectedDelivery) {
      return
    }

    const path = deliveryProofPaths[selectedDelivery.id]

    if (!path || deliveryProofImages[selectedDelivery.id]) {
      return
    }

    let cancelled = false

    getDeliveryProofSignedUrl(path)
      .then((url) => {
        if (!cancelled) {
          setDeliveryProofImages((current) => ({ ...current, [selectedDelivery.id]: { url } }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeliveryProofImages((current) => ({ ...current, [selectedDelivery.id]: { failed: true } }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedDelivery, deliveryProofPaths, deliveryProofImages])

  useEffect(() => {
    if (manageContextId !== selectedDriverId) {
      setShowManageAccount(false)
      setManageError('')
      setManageMessage('')
      setManagedCredentials(null)
    }
  }, [selectedDriverId, manageContextId])

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

  const [isProvisioning, setIsProvisioning] = useState(false)
  const [provisionError, setProvisionError] = useState('')
  const [provisionedCredentials, setProvisionedCredentials] = useState<{ username: string; password: string; driverName: string } | null>(null)

  const handleProvisionDriver = async () => {
    if (!selectedApplication || isProvisioning) {
      return
    }

    if (selectedApplication.status !== 'approved' || selectedApplication.driver_id) {
      return
    }

    const fullName = selectedApplication.full_name.trim()
    const phone = selectedApplication.mobile_number.trim()
    const email = selectedApplication.email.trim()
    const vehicleType = selectedApplication.vehicle_type.trim()
    const vehicleModel = selectedApplication.vehicle_number.trim() || selectedApplication.vehicle_type.trim() || selectedApplication.plate_number?.trim() || ''
    const plateNumber = selectedApplication.plate_number?.trim() || ''

    if (!fullName || !phone) {
      setProvisionError('This application is missing contact details.')
      return
    }

    if (!email || !isValidEmailLike(email)) {
      setProvisionError('This application has no valid email address. Add the driver manually instead.')
      return
    }

    if (!vehicleType || !vehicleModel || !plateNumber) {
      setProvisionError('This application is missing vehicle details. Add the driver manually instead.')
      return
    }

    const baseUsername = normalizeUsername(fullName)

    if (!baseUsername) {
      setProvisionError('Could not derive a username from the applicant name.')
      return
    }

    setIsProvisioning(true)
    setProvisionError('')
    setProvisionedCredentials(null)

    try {
      // Recovery path: a previous attempt may have created the driver row
      // without linking it. Link the existing account instead of duplicating.
      const existingDriver = drivers.find((driver) => driver.email.toLowerCase() === email.toLowerCase())

      if (existingDriver) {
        const linked = await linkDriverApplicationDriver(selectedApplication.id, existingDriver.id)
        setApplications((current) => current.map((application) => application.id === linked.id ? { ...linked, driver_id: linked.driver_id } : application))
        setProvisionedCredentials(null)
        return
      }

      let username = baseUsername
      let suffix = 1

      while (await isDriverUsernameTaken(username) && suffix <= 10) {
        suffix += 1
        username = `${baseUsername}${suffix}`
      }

      if (await isDriverUsernameTaken(username)) {
        throw new Error('Could not derive a unique username. Add the driver manually instead.')
      }

      const initialPassword = generateTemporaryPassword()

      // Driver row first: a row without auth is a normal recoverable state
      // in this system (Manage login flow), while an auth account without a
      // driver row would be orphaned.
      const created = await createDriver({
        full_name: fullName,
        phone,
        email,
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        plate_number: plateNumber,
        vehicle_capacity: null,
        status: 'active',
        availability: 'offline',
        username,
      })

      const account = await createDriverAuthUser(email, initialPassword)
      await updateDriver(created.id, { auth_user_id: account.authUserId })

      const emailConfirmed = await confirmDriverAuthEmail(account.authUserId).catch(() => false)
      const linked = await linkDriverApplicationDriver(selectedApplication.id, created.id)

      setApplications((current) => current.map((application) => application.id === linked.id ? { ...linked, driver_id: linked.driver_id } : application))

      const items = await fetchDrivers()
      const mappedDrivers = items.map(mapDriverRecord)
      setDrivers(mappedDrivers)
      setSelectedDriverId(created.id)

      setProvisionedCredentials({
        username,
        password: initialPassword,
        driverName: created.full_name,
      })

      if (account.needsEmailConfirmation && !emailConfirmed) {
        console.warn('Driver auth email confirmation is still pending.')
      }
    } catch (error) {
      console.error('Unable to provision driver:', error)
      setProvisionError(error instanceof Error && error.message ? error.message : 'Unable to provision this driver. Please try again.')
    } finally {
      setIsProvisioning(false)
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

  const [forceHoldTarget, setForceHoldTarget] = useState<AdminDriver | null>(null)
  const [holdReason, setHoldReason] = useState('')
  const [isForcingHold, setIsForcingHold] = useState(false)
  const [releaseHoldTarget, setReleaseHoldTarget] = useState<AdminDriverHold | null>(null)
  const [isReleasingHold, setIsReleasingHold] = useState(false)
  const [holdError, setHoldError] = useState('')
  const [holdMessage, setHoldMessage] = useState('')

  const presenceStatus = (driverId: string): 'Online' | 'Stale' | 'Offline' | 'Busy' => {
    const presence = presenceMap[driverId]

    if (!presence || !presence.isOnline) {
      return 'Offline'
    }

    if (presence.currentRideId) {
      return 'Busy'
    }

    return driverLocationStatus(presence.updatedAt) === 'active' ? 'Online' : 'Stale'
  }

  const busyDrivers = drivers.filter((driver) => presenceStatus(driver.id) === 'Busy')
  const activePakyawan = pakyawanBookings.filter((booking) => !['completed', 'cancelled'].includes(booking.status))
  const activeDeliveries = deliveries.filter((delivery) => DELIVERY_ACTIVE_STATUSES.includes(delivery.status))
  const pendingApplications = applications.filter((application) => application.status === 'pending')
  const newMessages = contactMessages.filter((message) => message.status === 'new')
  const noDriverRides = liveRides.filter((ride: any) => ride.status === 'no_driver')
  const heldDrivers = drivers.filter((driver) => driverHolds[driver.id])
  const exceptionDeliveries = deliveries.filter((delivery) => DELIVERY_EXCEPTION_STATUSES.includes(delivery.status))
  const unassignedPakyawan = pakyawanBookings.filter((booking) =>
    (booking.status === 'quoted' || booking.status === 'scheduled') && !booking.driver_id,
  )
  const recentRides = [...liveRides]
    .sort((a: any, b: any) => String(b.requestedAtIso ?? '').localeCompare(String(a.requestedAtIso ?? '')))
    .slice(0, 5)

  const attentionItems: Array<{ key: string; text: string; onSelect: () => void }> = [
    ...noDriverRides.map((ride: any) => ({
      key: `no-driver-${ride.id}`,
      text: `Ride ${String(ride.id).slice(0, 8)}… has no driver`,
      onSelect: () => { setActiveTab('active-rides'); setSelectedRideId(ride.id) },
    })),
    ...pendingApplications.map((application) => ({
      key: `application-${application.id}`,
      text: `Application from ${application.full_name} awaits review`,
      onSelect: () => { setActiveTab('driver-applications'); setSelectedApplicationId(application.id) },
    })),
    ...newMessages.map((message) => ({
      key: `message-${message.id}`,
      text: `New ${message.inquiry_type} message from ${message.full_name}`,
      onSelect: () => { setActiveTab('contact-messages'); setSelectedContactMessageId(message.id) },
    })),
    ...heldDrivers.map((driver) => ({
      key: `hold-${driver.id}`,
      text: `${driver.name} is under Admin hold`,
      onSelect: () => { setActiveTab('drivers'); setSelectedDriverId(driver.id) },
    })),
    ...exceptionDeliveries.map((delivery) => ({
      key: `delivery-exception-${delivery.id}`,
      text: `Delivery ${String(delivery.id).slice(0, 8)}… is ${delivery.status}`,
      onSelect: () => { setActiveTab('deliveries'); setSelectedDeliveryId(delivery.id) },
    })),
    ...unassignedPakyawan.map((booking) => ({
      key: `pakyawan-unassigned-${booking.id}`,
      text: `Pakyawan booking ${String(booking.id).slice(0, 8)}… is ${booking.status} with no driver`,
      onSelect: () => { setActiveTab('pakyawan'); setSelectedPakyawanBookingId(booking.id) },
    })),
  ]

  const overviewStats = [
    { label: 'Total Drivers', value: String(drivers.length), accent: true },
    { label: 'Online Drivers', value: String(drivers.filter((driver) => presenceStatus(driver.id) === 'Online').length) },
    { label: 'Busy Drivers', value: String(busyDrivers.length) },
    { label: 'Active Rides', value: String(liveRides.filter((ride: any) => ['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status)).length) },
    { label: 'Active Pakyawan', value: String(activePakyawan.length) },
    { label: 'Active Deliveries', value: String(activeDeliveries.length) },
    { label: 'Pending Applications', value: String(pendingApplications.length) },
    { label: 'New Messages', value: String(newMessages.length) },
  ]

  const handleDriverNameChange = (name: string) => {
    setDriverDraft((current) => {
      const next = { ...current, name }

      if (next.createAccount && !next.username.trim()) {
        next.username = suggestUsername(name)
      }

      return next
    })
  }

  const handleDriverPhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null

    setDriverDraft((current) => {
      if (current.photoPreviewUrl) {
        URL.revokeObjectURL(current.photoPreviewUrl)
      }

      if (!file) {
        return { ...current, photo: null, photoPreviewUrl: '' }
      }

      const validation = validateDriverPhoto(file)

      if (!validation.valid) {
        setDriverError(validation.message ?? 'Choose a valid driver photo.')
        return { ...current, photo: null, photoPreviewUrl: '' }
      }

      return { ...current, photo: file, photoPreviewUrl: URL.createObjectURL(file) }
    })
  }

  const handleCreateAccountToggle = (createAccount: boolean) => {
    setDriverDraft((current) => {
      const next = { ...current, createAccount }

      if (next.createAccount && !next.username.trim()) {
        next.username = suggestUsername(next.name)
      }

      return next
    })
  }

  const handleDriverSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!driverDraft.name || !driverDraft.phone || !driverDraft.vehicleModel || !driverDraft.plateNumber) {
      return
    }

    if (driverDraft.createAccount && !driverDraft.email.trim()) {
      setDriverError('Email is required when creating a login account.')
      return
    }

    setDriverError('')
    setCreatingAccount(true)
    setCreatedAccount(null)

    let account: Awaited<ReturnType<typeof createDriverAuthUser>> | null = null
    let uploadedPhotoPath: string | null = null
    let uploadedPhotoUrl: string | null = null

    try {
      if (driverDraft.photo) {
        const uploaded = await uploadDriverPhoto(driverDraft.photo)
        uploadedPhotoPath = uploaded.path
        uploadedPhotoUrl = uploaded.publicUrl
      }

      if (driverDraft.createAccount) {
        const storedUsername = normalizeUsername(driverDraft.username)

        if (!storedUsername) {
          setDriverError('Enter a valid username for the driver login.')
          setCreatingAccount(false)
          return
        }

        if (await isDriverUsernameTaken(storedUsername)) {
          setDriverError('That username is already taken. Choose another one.')
          setCreatingAccount(false)
          return
        }

        let initialPassword: string

        if (driverDraft.passwordMethod === 'custom') {
          const strength = validatePasswordStrength(driverDraft.initialPassword)

          if (!strength.ok) {
            setDriverError(strength.problems[0])
            setCreatingAccount(false)
            return
          }

          initialPassword = driverDraft.initialPassword
        } else {
          initialPassword = generateTemporaryPassword()
        }

        account = await createDriverAuthUser(driverDraft.email.trim(), initialPassword)

        const created = await createDriver({
          full_name: driverDraft.name.trim(),
          phone: driverDraft.phone.trim(),
          email: account.email,
          vehicle_type: driverDraft.vehicleType,
          vehicle_model: driverDraft.vehicleModel.trim(),
          plate_number: driverDraft.plateNumber.trim(),
          vehicle_capacity: driverDraft.vehicleCapacity,
          profile_photo_url:
            uploadedPhotoUrl ??
            (driverDraft.name.trim().toLowerCase() === 'san jay monteroso'
              ? sanjayPhoto
              : null),
          status: driverDraft.status === 'Active' ? 'active' : 'inactive',
          availability:
            driverDraft.availability === 'Online'
              ? 'online'
              : driverDraft.availability === 'Busy'
                ? 'busy'
                : 'offline',
          username: storedUsername,
          auth_user_id: account.authUserId,
        })

        const emailConfirmed = await confirmDriverAuthEmail(account.authUserId).catch(() => false)

        setCreatedAccount({
          name: created.full_name,
          email: account.email,
          username: created.username ?? storedUsername,
          initialPassword,
          needsEmailConfirmation: account.needsEmailConfirmation && !emailConfirmed,
        })

        const mappedDriver = mapDriverRecord(created)
        setDrivers((current) => [mappedDriver, ...current])
        setSelectedDriverId(mappedDriver.id)
        setShowAddDriver(false)
        setDriverDraft(emptyDriverDraft)
        return
      }

      const created = await createDriver({
        full_name: driverDraft.name.trim(),
        phone: driverDraft.phone.trim(),
        email: driverDraft.email.trim() || null,
        vehicle_type: driverDraft.vehicleType,
        vehicle_model: driverDraft.vehicleModel.trim(),
        plate_number: driverDraft.plateNumber.trim(),
        vehicle_capacity: driverDraft.vehicleCapacity,
        profile_photo_url:
          uploadedPhotoUrl ??
          (driverDraft.name.trim().toLowerCase() === 'san jay monteroso'
            ? sanjayPhoto
            : null),
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
    } catch (error) {
      if (uploadedPhotoPath) {
        await removeUploadedDriverPhoto(uploadedPhotoPath).catch(() => undefined)
      }

      console.error('Unable to create driver:', error)

      const isDuplicate = Boolean((error as { __duplicateSignup?: boolean })?.__duplicateSignup)

      setDriverError(
        isDuplicate && error instanceof Error
          ? error.message
          : 'Unable to add driver. Please check the information and try again.',
      )
    } finally {
      setCreatingAccount(false)
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

  const handleRemoveDriver = async () => {
    if (!driverToRemove) return

    try {
      setDriverError('')
      setDriverSuccess('')
      setIsRemovingDriver(true)
      const removed = await removeDriver(driverToRemove.id)

      if (!removed) {
        throw new Error('Unable to remove the driver account. Please try again.')
      }

      setDrivers((current) => current.filter((driver) => driver.id !== driverToRemove.id))
      setSelectedDriverId((current) => (current === driverToRemove.id ? '' : current))
      setShowManageAccount(false)
      setDriverToRemove(null)
      setDriverSuccess('Driver removed successfully.')
    } catch (error) {
      console.error('Unable to remove driver:', error)
      setDriverSuccess('')
      setDriverError(driverRemovalErrorMessage(error))
    } finally {
      setIsRemovingDriver(false)
    }
  }

  const forceResultText = (result: ForceOfflineResult, name: string): string => {
    const parts = [`${name} is now held offline.`]

    if (result.already_offline) {
      parts.push('Already offline.')
    }

    if (result.offers_withdrawn > 0) {
      parts.push(`${result.offers_withdrawn} live offer${result.offers_withdrawn === 1 ? '' : 's'} withdrawn.`)
    }

    if (result.active_ride_id) {
      parts.push('Active ride preserved.')
    }

    return parts.join(' ')
  }

  const openForceHoldModal = (driver: AdminDriver) => {
    setForceHoldTarget(driver)
    setHoldReason('')
    setHoldError('')
    setHoldMessage('')
  }

  const handleForceHold = async () => {
    if (!forceHoldTarget || isForcingHold) {
      return
    }

    const reason = holdReason.trim()

    if (!reason) {
      setHoldError('Enter a reason for holding this driver offline.')
      return
    }

    setIsForcingHold(true)
    setHoldError('')

    try {
      const result = await forceDriverOffline(forceHoldTarget.id, reason)
      const holds = await fetchAdminDriverHolds()
      setDriverHolds(holds)
      setHoldMessage(forceResultText(result, forceHoldTarget.name))
      setForceHoldTarget(null)
      setHoldReason('')
    } catch (error) {
      console.error('Unable to hold driver offline:', error)
      setHoldMessage('')
      setHoldError(error instanceof Error && error.message ? error.message : 'Unable to hold this driver offline. Please try again.')
    } finally {
      setIsForcingHold(false)
    }
  }

  const handleReleaseHold = async () => {
    if (!releaseHoldTarget || isReleasingHold) {
      return
    }

    setIsReleasingHold(true)
    setHoldError('')

    try {
      await releaseDriverHold(releaseHoldTarget.id)
      const holds = await fetchAdminDriverHolds()
      setDriverHolds(holds)
      setReleaseHoldTarget(null)
      setHoldMessage('Admin hold released. The driver must go online normally.')
    } catch (error) {
      console.error('Unable to release driver hold:', error)
      setHoldMessage('')
      setHoldError(error instanceof Error && error.message ? error.message : 'Unable to release this hold. Please try again.')
    } finally {
      setIsReleasingHold(false)
    }
  }

  const handlePakyawanToggle = async (driver: AdminDriver) => {
    const nextValue = !driver.canAcceptPakyawan

    try {
      setDriverError('')
      const updated = await updateDriver(driver.id, { can_accept_pakyawan: nextValue })
      const mappedDriver = mapDriverRecord(updated)

      setDrivers((current) =>
        current.map((item) => item.id === driver.id ? mappedDriver : item),
      )
    } catch (error) {
      console.error('Unable to update Pakyawan eligibility:', error)
      setDriverError('Unable to update Pakyawan eligibility. Please try again.')
    }
  }

  const handleDeliveryToggle = async (driver: AdminDriver & { canAcceptDeliveries: boolean }) => {
    const nextValue = !driver.canAcceptDeliveries

    try {
      setDriverError('')
      const updated = await updateDriver(driver.id, { can_accept_deliveries: nextValue })
      const mappedDriver = mapDriverRecord(updated)

      setDrivers((current) =>
        current.map((item) => item.id === driver.id ? mappedDriver : item),
      )
    } catch (error) {
      console.error('Unable to update Pa-Deliver eligibility:', error)
      setDriverError('Unable to update Pa-Deliver eligibility. Please try again.')
    }
  }

  const openManageAccount = (driver?: AdminDriver) => {
    const target = driver ?? selectedDriver

    if (!target) {
      return
    }

    setManageContextId(target.id)
    setManageError('')
    setManageMessage('')
    setManagedCredentials(null)
    setManageDraft({
      email: target.email,
      username: target.username || suggestUsername(target.name),
      passwordMethod: 'generated',
      initialPassword: '',
    })
    setShowManageAccount(true)
  }

  const closeManageAccount = () => {
    setShowManageAccount(false)
    setManageError('')
  }

  const handleManageAccountSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!selectedDriver) {
      return
    }

    setManageError('')
    setManageMessage('')
    setManagingAccount(true)

    try {
      const normalizedUsername = normalizeUsername(manageDraft.username)

      if (!normalizedUsername) {
        setManagingAccount(false)
        setManageError('Enter a valid username for the driver login.')
        return
      }

      if (await isDriverUsernameTaken(normalizedUsername, selectedDriver.id)) {
        setManagingAccount(false)
        setManageError('That username is already taken. Choose another one.')
        return
      }

      if (selectedDriver.authUserId) {
        const updated = await updateDriver(selectedDriver.id, { username: normalizedUsername })
        const mappedDriver = mapDriverRecord(updated)

        setDrivers((current) =>
          current.map((driver) => driver.id === mappedDriver.id ? mappedDriver : driver),
        )
        setShowManageAccount(false)
        setManagedCredentials(null)
        setManageMessage('Login username updated.')
        return
      }

      const email = manageDraft.email.trim()

      if (!isValidEmailLike(email)) {
        setManagingAccount(false)
        setManageError('Enter a valid email address for the driver login account.')
        return
      }

      let initialPassword: string

      if (manageDraft.passwordMethod === 'custom') {
        const strength = validatePasswordStrength(manageDraft.initialPassword)

        if (!strength.ok) {
          setManagingAccount(false)
          setManageError(strength.problems[0])
          return
        }

        initialPassword = manageDraft.initialPassword
      } else {
        initialPassword = generateTemporaryPassword()
      }

      const account = await createDriverAuthUser(email, initialPassword)

      const updated = await updateDriver(selectedDriver.id, {
        email: account.email,
        username: normalizedUsername,
        auth_user_id: account.authUserId,
      })
      const mappedDriver = mapDriverRecord(updated)

      const emailConfirmed = await confirmDriverAuthEmail(account.authUserId).catch(() => false)

      setDrivers((current) =>
        current.map((driver) => driver.id === mappedDriver.id ? mappedDriver : driver),
      )

      setManagedCredentials({
        name: mappedDriver.name,
        email: account.email,
        username: normalizedUsername,
        initialPassword,
        needsEmailConfirmation: account.needsEmailConfirmation && !emailConfirmed,
      })
      setShowManageAccount(false)
      setManageMessage('')
    } catch (error) {
      console.error('Unable to manage driver login account:', error)

      const isDuplicate = Boolean((error as { __duplicateSignup?: boolean })?.__duplicateSignup)

      setManageError(
        isDuplicate && error instanceof Error
          ? error.message
          : 'Unable to update the driver login account. Please try again.',
      )
    } finally {
      setManagingAccount(false)
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
        Back to Ride Booking
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
              <h3>Needs attention</h3>
            </div>
            {attentionItems.length === 0 ? (
              <p className="field-note">All clear — nothing needs attention right now.</p>
            ) : (
              <ul className="mini-list">
                {attentionItems.map((item) => (
                  <li key={item.key}>
                    <div>
                      <strong>{item.text}</strong>
                    </div>
                    <button type="button" className="ghost-button" onClick={item.onSelect}>
                      View
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                    <span>{presenceStatus(driver.id)}</span>
                  </div>
                  <span className={`status-pill ${presenceStatus(driver.id).toLowerCase()}`}>
                    {presenceStatus(driver.id)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="admin-panel">
            <div className="panel-header-row">
              <h3>Recent rides</h3>
            </div>
            {recentRides.length === 0 ? (
              <p className="field-note">No recent rides.</p>
            ) : (
              <ul className="mini-list">
                {recentRides.map((ride: any) => (
                  <li key={ride.id}>
                    <div>
                      <strong>{ride.Rider}</strong>
                      <span>{ride.requestedAt}</span>
                    </div>
                    <span className="status-pill online">{rideStatusLabels[ride.status as keyof typeof rideStatusLabels] ?? ride.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === 'drivers' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row">
              <h3>Drivers</h3>
              <button type="button" className="secondary-action compact-button" onClick={() => { setShowAddDriver((current) => !current); setCreatedAccount(null); setDriverError('') }}>
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
            </div>

            {isLoadingDrivers ? <p className="muted-copy">Loading drivers...</p> : null}
            {driverError ? <p className="error-copy">{driverError}</p> : null}
            {driverSuccess ? <p className="driver-password-success" role="status">{driverSuccess}</p> : null}

            {showAddDriver ? (
              <form className="driver-form panel-form" onSubmit={handleDriverSubmit}>
                <div className="form-grid">
                  <label className="field-block">
                    <span className="field-label">Driver Name</span>
                    <input
                      className="input-field"
                      value={driverDraft.name}
                      onChange={(event) => handleDriverNameChange(event.target.value)}
                    />
                  </label>

                  <label className="field-block driver-photo-field">
                    <span className="field-label">Driver Photo</span>
                    <input
                      className="file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleDriverPhotoChange}
                    />
                    <span className="muted-copy form-note">Optional. JPEG, PNG, WebP, or GIF up to 5 MB.</span>
                    {driverDraft.photoPreviewUrl ? (
                      <img
                        src={driverDraft.photoPreviewUrl}
                        alt="Driver photo preview"
                        className="driver-photo-preview"
                      />
                    ) : null}
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
                      placeholder={driverDraft.createAccount ? 'required for the login account' : 'optional'}
                    />
                  </label>

                  <label className="field-block form-check">
                    <input
                      type="checkbox"
                      checked={driverDraft.createAccount}
                      onChange={(event) => handleCreateAccountToggle(event.target.checked)}
                    />
                    <span className="field-label">Create driver login account</span>
                  </label>

                  {driverDraft.createAccount ? (
                    <>
                      <label className="field-block">
                        <span className="field-label">Login username</span>
                        <input
                          className="input-field"
                          value={driverDraft.username}
                          onChange={(event) => setDriverDraft((current) => ({ ...current, username: event.target.value }))}
                          placeholder="auto-suggested from the name"
                        />
                      </label>

                      <div className="password-method" role="radiogroup" aria-label="Initial password method">
                        <label className="form-check">
                          <input
                            type="radio"
                            name="driver-password-method"
                            checked={driverDraft.passwordMethod === 'generated'}
                            onChange={() => setDriverDraft((current) => ({ ...current, passwordMethod: 'generated' }))}
                          />
                          <span className="field-label">Generate a secure temporary password</span>
                        </label>
                        <label className="form-check">
                          <input
                            type="radio"
                            name="driver-password-method"
                            checked={driverDraft.passwordMethod === 'custom'}
                            onChange={() => setDriverDraft((current) => ({ ...current, passwordMethod: 'custom' }))}
                          />
                          <span className="field-label">Set an initial password myself</span>
                        </label>
                      </div>

                      {driverDraft.passwordMethod === 'custom' ? (
                        <label className="field-block">
                          <span className="field-label">Initial password</span>
                          <input
                            className="input-field"
                            type="password"
                            value={driverDraft.initialPassword}
                            onChange={(event) => setDriverDraft((current) => ({ ...current, initialPassword: event.target.value }))}
                            placeholder="At least 8 characters, with a letter and a number"
                            autoComplete="new-password"
                          />
                          {driverDraft.initialPassword ? (
                            <p className="password-meta">{PASSWORD_HELP_TEXT}</p>
                          ) : null}
                        </label>
                      ) : (
                        <p className="muted-copy form-note">
                          A secure temporary password is generated automatically and shown once after saving.
                        </p>
                      )}
                    </>
                  ) : null}

                  <label className="field-block">
                    <span className="field-label">Vehicle Type</span>
                    <select
                      className="input-field"
                      value={driverDraft.vehicleType}
                      onChange={(event) => {
                        const vehicle = event.target.value as VehicleType
                        setDriverDraft((current) => ({
                          ...current,
                          vehicleType: vehicle,
                          vehicleCapacity: vehicle === 'motorcycle' ? 1 : current.vehicleCapacity,
                        }))
                      }}
                    >
                      {VEHICLE_TYPES.map((vehicle) => (
                        <option key={vehicle} value={vehicle}>
                          {VEHICLE_LABELS[vehicle]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-block">
                    <span className="field-label">Passenger Capacity</span>
                    {driverDraft.vehicleType === 'motorcycle' ? (
                      <p className="muted-copy form-note">
                        Motorcycle rides carry exactly 1 passenger.
                      </p>
                    ) : (
                      <select
                        className="input-field"
                        value={driverDraft.vehicleCapacity}
                        onChange={(event) =>
                          setDriverDraft((current) => ({
                            ...current,
                            vehicleCapacity: Number.parseInt(event.target.value, 10),
                          }))
                        }
                      >
                        {passengerCapacityOptionsFor(driverDraft.vehicleType as VehicleType).map((capacity) => (
                          <option key={capacity} value={capacity}>
                            {formatCapacityOption(driverDraft.vehicleType as VehicleType, capacity)}
                          </option>
                        ))}
                      </select>
                    )}
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
                  <button type="submit" className="primary-action" disabled={creatingAccount}>
                    {creatingAccount ? 'Creating account...' : 'Save Driver'}
                  </button>
                  <button type="button" className="secondary-action" onClick={() => { setShowAddDriver(false); setCreatedAccount(null); setDriverError('') }} disabled={creatingAccount}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : null}

            {createdAccount ? (
              <div className="panel-form credentials-box">
                <div className="panel-header-row"><h3>Driver account created</h3></div>
                <p className="muted-copy">
                  Share these credentials with {createdAccount.name} securely in person or by phone. The
                  initial password is shown only once and is never stored by the app.
                </p>
                <div className="detail-grid">
                  <div><span>Email</span><strong>{createdAccount.email}</strong></div>
                  <div><span>Username</span><strong>{createdAccount.username}</strong></div>
                  <div><span>Initial password</span><strong>{createdAccount.initialPassword}</strong></div>
                  <div><span>Login status</span><strong>{createdAccount.needsEmailConfirmation ? 'Awaiting email confirmation' : 'Ready to log in'}</strong></div>
                </div>
                {createdAccount.needsEmailConfirmation ? (
                  <p className="muted-copy">
                    "Confirm email" is enabled in the Authentication settings, so the driver must click the
                    verification link in the email before their first login.
                  </p>
                ) : (
                  <p className="muted-copy">
                    The driver can log in immediately with their username and temporary password.
                  </p>
                )}
                <div className="form-actions">
                  <button type="button" className="secondary-action compact-button" onClick={() => setCreatedAccount(null)}>
                    Dismiss
                  </button>
                </div>
              </div>
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
                      <th>Account</th>
                      <th>Profile / Presence</th>
                      <th>Login</th>
                      <th>Pakyawan</th>
                      <th>Pa-Deliver</th>
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
                        <td>{driver.vehicleType}<br />{driver.vehicleModel}<br /><span className="muted-copy">{driver.vehicleCapacity ? formatVehicleCapacity(driver.vehicleCapacity) : 'Capacity not set'}</span></td>
                        <td>{driver.plateNumber}</td>
                        <td>
                          <span className={driver.status === 'Active' ? 'status-pill online' : 'status-pill offline'}>
                            {driver.status}
                          </span>
                        </td>
                        <td>
                          <span className="muted-copy">Profile</span>
                          <select
                            className="inline-select"
                            value={driver.availability}
                            onChange={(event) => handleAvailabilityChange(driver.id, event.target.value as DriverAvailability)}
                            aria-label={`Profile availability for ${driver.name}`}
                          >
                            <option value="Offline">Offline</option>
                            <option value="Online">Online</option>
                            <option value="Busy">Busy</option>
                          </select>
                          <span className="muted-copy">Live presence</span>
                          <span className={`status-pill ${presenceStatus(driver.id).toLowerCase()}`} title="Authoritative presence">
                            {presenceStatus(driver.id)}
                          </span>
                        </td>
                        <td>
                          <span className={`status-pill ${driver.authUserId ? 'online' : 'offline'}`}>
                            {driver.authUserId ? 'Active' : 'No login'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={driver.canAcceptPakyawan ? 'pakyawan-toggle enabled' : 'pakyawan-toggle'}
                            onClick={() => void handlePakyawanToggle(driver)}
                          >
                            {driver.canAcceptPakyawan ? 'Enabled' : 'Enable'}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            className={(driver as unknown as { canAcceptDeliveries: boolean }).canAcceptDeliveries ? 'pakyawan-toggle enabled' : 'pakyawan-toggle'}
                            onClick={() => void handleDeliveryToggle(driver as unknown as AdminDriver & { canAcceptDeliveries: boolean })}
                          >
                            {(driver as unknown as { canAcceptDeliveries: boolean }).canAcceptDeliveries ? 'Enabled' : 'Enable'}
                          </button>
                        </td>
                        <td className="action-buttons-cell">
                          <button type="button" className="ghost-button" onClick={() => { setSelectedDriverId(driver.id); setHoldMessage(''); setHoldError(''); openManageAccount(driver) }}>
                            Manage
                          </button>
                          <button type="button" className="ghost-button" onClick={() => { setSelectedDriverId(driver.id); setHoldMessage(''); setHoldError('') }}>
                            View
                          </button>
                          {driver.status !== 'Active' && (
                            <button type="button" className="ghost-button" onClick={() => handleStatusChange(driver.id, 'Active')}>
                              Activate
                            </button>
                          )}
                          <button type="button" className="ghost-button danger-button" onClick={() => setDriverToRemove(driver)}>
                            Remove
                          </button>
                          {driverHolds[driver.id] ? (
                            <span className="status-pill busy" title="Held offline by Admin">
                              Admin hold
                            </span>
                          ) : (
                            <button type="button" className="ghost-button danger-button" onClick={() => openForceHoldModal(driver)}>
                              Force offline
                            </button>
                          )}
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
                  <div><span>Username</span><strong>{selectedDriver.username || 'No login'}</strong></div>
                  <div><span>Vehicle</span><strong>{selectedDriver.vehicleType}</strong></div>
                  <div><span>Model</span><strong>{selectedDriver.vehicleModel}</strong></div>
                  <div><span>Capacity</span><strong>{formatVehicleCapacity(selectedDriver.vehicleCapacity)}</strong></div>
                  <div><span>Plate</span><strong>{selectedDriver.plateNumber}</strong></div>
                  <div><span>Status</span><strong>{selectedDriver.status}</strong></div>
                  <div><span>Presence</span><strong>{presenceStatus(selectedDriver.id)}{presenceMap[selectedDriver.id] ? ` · updated ${new Date(presenceMap[selectedDriver.id].updatedAt).toLocaleString()}` : ' · no presence row'}</strong></div>
                  <div><span>Profile availability</span><strong>{selectedDriver.availability}</strong></div>
                  <div><span>Admin hold</span><strong>{driverHolds[selectedDriver.id] ? `Held since ${new Date(driverHolds[selectedDriver.id].createdAt).toLocaleString()}` : 'Not held'}</strong></div>
                  {driverHolds[selectedDriver.id] ? (
                    <div><span>Hold reason</span><strong>{driverHolds[selectedDriver.id].reason}</strong></div>
                  ) : null}
                  {driverHolds[selectedDriver.id] ? (
                    <button type="button" className="secondary-action compact-button" onClick={() => { setReleaseHoldTarget(driverHolds[selectedDriver.id]); setHoldError(''); setHoldMessage('') }}>
                      Release hold
                    </button>
                  ) : (
                    <button type="button" className="secondary-action compact-button" onClick={() => openForceHoldModal(selectedDriver)}>
                      Force offline
                    </button>
                  )}
                  {holdMessage ? <p className="field-note">{holdMessage}</p> : null}
                  {holdError ? <span className="field-error">{holdError}</span> : null}
                  <div><span>Pakyawan</span><strong>
                    {selectedDriver.canAcceptPakyawan ? 'Eligible' : 'Not enabled'}
                    <button
                      type="button"
                      className={selectedDriver.canAcceptPakyawan ? 'pakyawan-toggle enabled' : 'pakyawan-toggle'}
                      onClick={() => void handlePakyawanToggle(selectedDriver)}
                    >
                      {selectedDriver.canAcceptPakyawan ? 'Disable' : 'Enable'}
                    </button>
                  </strong></div>
                  <div><span>Pa-Deliver</span><strong>
                    {(selectedDriver as unknown as { canAcceptDeliveries: boolean }).canAcceptDeliveries ? 'Pa-Deliver Enabled' : 'Pa-Deliver Not Enabled'}
                    <button
                      type="button"
                      className={(selectedDriver as unknown as { canAcceptDeliveries: boolean }).canAcceptDeliveries ? 'pakyawan-toggle enabled' : 'pakyawan-toggle'}
                      onClick={() => void handleDeliveryToggle(selectedDriver as unknown as AdminDriver & { canAcceptDeliveries: boolean })}
                    >
                      {(selectedDriver as unknown as { canAcceptDeliveries: boolean }).canAcceptDeliveries ? 'Disable' : 'Enable Pa-Deliver'}
                    </button>
                  </strong></div>
                  <div><span>Recent rides</span><strong>{selectedDriver.recentRides.length}</strong></div>
                </div>

                <DriverVehicleEditor
                  key={selectedDriver.id}
                  driver={selectedDriver}
                  onSaved={(updated) => {
                    const mappedDriver = mapDriverRecord(updated)
                    setDrivers((current) =>
                      current.map((driver) => driver.id === selectedDriver.id ? mappedDriver : driver),
                    )
                  }}
                  onError={(message) => setDriverError(message)}
                />

                <div className="manage-account-box">
                  <div className="panel-header-row">
                    <h4>Login account</h4>
                    {selectedDriver.authUserId ? (
                      <span className="status-pill online">Active</span>
                    ) : (
                      <span className="status-pill offline">No login</span>
                    )}
                  </div>

                  {selectedDriver.authUserId ? (
                    <div className="detail-grid">
                      <div><span>Login status</span><strong>Login account active</strong></div>
                      <div><span>Username</span><strong>{selectedDriver.username || '—'}</strong></div>
                      <div><span>Login email</span><strong>{selectedDriver.email || '—'}</strong></div>
                    </div>
                  ) : (
                    <p className="muted-copy">
                      This driver cannot sign in yet. Create a login account so they can use the driver app.
                    </p>
                  )}

                  {manageMessage ? <p className="driver-password-success" role="status">{manageMessage}</p> : null}
                  {manageError ? <p className="form-error-message" role="alert">{manageError}</p> : null}

                  {managedCredentials ? (
                    <div className="credentials-box">
                      <div className="panel-header-row"><h4>Login account created</h4></div>
                      <p className="muted-copy">
                        Share these credentials with {managedCredentials.name} securely in person or by
                        phone. The initial password is shown only once.
                      </p>
                      <div className="detail-grid">
                        <div><span>Email</span><strong>{managedCredentials.email}</strong></div>
                        <div><span>Username</span><strong>{managedCredentials.username}</strong></div>
                        <div><span>Initial password</span><strong>{managedCredentials.initialPassword}</strong></div>
                        <div><span>Login status</span><strong>{managedCredentials.needsEmailConfirmation ? 'Awaiting email confirmation' : 'Ready to log in'}</strong></div>
                      </div>
                      {managedCredentials.needsEmailConfirmation ? (
                        <p className="muted-copy">
                          The driver must click the verification link in the email before their first login.
                        </p>
                      ) : (
                        <p className="muted-copy">
                          The driver can log in immediately with their username and initial password.
                        </p>
                      )}
                      <div className="form-actions">
                        <button type="button" className="secondary-action compact-button" onClick={() => setManagedCredentials(null)}>
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {!showManageAccount ? (
                    <div className="form-actions">
                      <button type="button" className="secondary-action compact-button" onClick={() => openManageAccount(selectedDriver)}>
                        {selectedDriver.authUserId ? 'Manage login' : 'Create login account'}
                      </button>
                    </div>
                  ) : null}

                  {showManageAccount ? (
                    <form className="panel-form" onSubmit={handleManageAccountSubmit}>
                      {!selectedDriver.authUserId ? (
                        <label className="field-block">
                          <span className="field-label">Email</span>
                          <input
                            className="input-field"
                            type="email"
                            value={manageDraft.email}
                            onChange={(event) => setManageDraft((current) => ({ ...current, email: event.target.value }))}
                            placeholder="used for the driver's login"
                          />
                        </label>
                      ) : (
                        <p className="muted-copy">
                          The login email is tied to this driver's authentication account and can't be
                          changed here. Update it in the Authentication users table if needed.
                        </p>
                      )}

                      <label className="field-block">
                        <span className="field-label">Username</span>
                        <input
                          className="input-field"
                          value={manageDraft.username}
                          onChange={(event) => setManageDraft((current) => ({ ...current, username: event.target.value }))}
                          placeholder="auto-suggested from the name"
                        />
                      </label>

                      {!selectedDriver.authUserId ? (
                        <>
                          <div className="password-method" role="radiogroup" aria-label="Initial password method">
                            <label className="form-check">
                              <input
                                type="radio"
                                name="manage-password-method"
                                checked={manageDraft.passwordMethod === 'generated'}
                                onChange={() => setManageDraft((current) => ({ ...current, passwordMethod: 'generated' }))}
                              />
                              <span className="field-label">Generate a secure temporary password</span>
                            </label>
                            <label className="form-check">
                              <input
                                type="radio"
                                name="manage-password-method"
                                checked={manageDraft.passwordMethod === 'custom'}
                                onChange={() => setManageDraft((current) => ({ ...current, passwordMethod: 'custom' }))}
                              />
                              <span className="field-label">Set an initial password myself</span>
                            </label>
                          </div>

                          {manageDraft.passwordMethod === 'custom' ? (
                            <label className="field-block">
                              <span className="field-label">Initial password</span>
                              <input
                                className="input-field"
                                type="password"
                                value={manageDraft.initialPassword}
                                onChange={(event) => setManageDraft((current) => ({ ...current, initialPassword: event.target.value }))}
                                placeholder="At least 8 characters, with a letter and a number"
                                autoComplete="new-password"
                              />
                              {manageDraft.initialPassword ? (
                                <p className="password-meta">{PASSWORD_HELP_TEXT}</p>
                              ) : null}
                            </label>
                          ) : (
                            <p className="muted-copy form-note">
                              A secure temporary password is generated automatically and shown once after
                              creation.
                            </p>
                          )}
                        </>
                      ) : null}

                      <div className="form-actions">
                        <button type="submit" className="primary-action" disabled={managingAccount}>
                          {managingAccount
                            ? 'Saving...'
                            : selectedDriver.authUserId
                              ? 'Save username'
                              : 'Create login account'}
                        </button>
                        <button type="button" className="secondary-action" onClick={closeManageAccount} disabled={managingAccount}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
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
                    <th>Passenger</th>
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
                    <button type="button" className="ghost-button" onClick={() => { setSelectedRideId(ride.id); resetRetryUi() }}>
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
                  <div><span>Passenger</span><strong>{selectedRide.Rider}</strong></div>
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
                {(selectedRide.status === 'requested' || selectedRide.status === 'no_driver') && !selectedRide.driverId ? (
                  selectedRideOffer ? (
                    <p className="field-note">
                      Live offer · Round {selectedRideOffer.dispatchRound}{selectedRideOfferDriver ? ` · ${selectedRideOfferDriver}` : ''} · expires {new Date(selectedRideOffer.expiresAt).toLocaleTimeString()}.
                    </p>
                  ) : (
                    <p className="field-note">No live offer.</p>
                  )
                ) : null}
                {(rideOfferHistory.length > 0 || selectedRide.status === 'requested' || selectedRide.status === 'no_driver') ? (
                  <div>
                    <span className="field-label">Dispatch activity</span>
                    {selectedRide.status === 'no_driver' ? (
                      <p className="field-note">Dispatch ended without an assignment.</p>
                    ) : null}
                    {rideOfferHistory.length > 0 ? (
                      <ul className="mini-list">
                        {rideOfferHistory.map((offer) => {
                          const offerDriver = offer.driverId ? drivers.find((driver) => driver.id === offer.driverId)?.name ?? 'Driver' : 'Driver'
                          const isLive = liveRideOffers[selectedRide.id]?.id === offer.id
                          return (
                            <li key={offer.id}>
                              <div>
                                <strong>{offerDriver}{isLive ? ' · Live offer' : ''}</strong>
                                <small>{rideOfferStatusLabels[offer.status] ?? offer.status} · Round {offer.dispatchRound} · Offered {new Date(offer.offeredAt).toLocaleString()} · Expires {new Date(offer.expiresAt).toLocaleString()}{offer.decidedAt ? ` · Decided ${new Date(offer.decidedAt).toLocaleString()}` : ''}</small>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    ) : (
                      <p className="field-note">No recorded offers.</p>
                    )}
                  </div>
                ) : null}
                {(selectedRide.status === 'requested' || selectedRide.status === 'no_driver') && !selectedRide.driverId && !liveRideOffers[selectedRide.id] ? (
                  <div className="quote-box">
                    <span className="field-label">Dispatch</span>
                    {!confirmingRetry ? (
                      <button type="button" className="secondary-action compact-button" onClick={() => openRetryConfirm(selectedRide)}>
                        Retry dispatch
                      </button>
                    ) : (
                      <>
                        <p className="field-note">
                          {retryWaitText}
                        </p>
                        <div className="quote-row">
                          <button type="button" className="secondary-action compact-button" disabled={isRetryingRide} onClick={() => void handleRetryDispatch()}>
                            {isRetryingRide ? 'Retrying…' : 'Confirm retry'}
                          </button>
                          <button type="button" className="ghost-button" disabled={isRetryingRide} onClick={() => setConfirmingRetry(false)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                    {retryRideError ? <span className="field-error">{retryRideError}</span> : null}
                    {retryRideResult && !confirmingRetry ? <p className="field-note">{retryResultText(retryRideResult)}</p> : null}
                  </div>
                ) : null}
                {['requested', 'accepted', 'arrived', 'in_progress'].includes(selectedRide.status) ? (
                  <div className="quote-box">
                    <span className="field-label">Cancellation</span>
                    <button type="button" className="secondary-action compact-button" onClick={() => openCancelRideModal(selectedRide)}>
                      Cancel ride
                    </button>
                  </div>
                ) : null}
                {cancelRideResult ? <p className="field-note">Ride cancelled{cancelRideResult.already_cancelled ? ' (already cancelled).' : '.'}</p> : null}
                {cancelRideError ? <span className="field-error">{cancelRideError}</span> : null}
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
                    <th>Passenger</th>
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
                <option value="rider">Passenger cancellations</option>
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
                      <th>Passenger</th>
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
                            {cancellation.cancelled_by_role === 'driver' ? 'Driver' : 'Passenger'}
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
                    <th>Passenger</th>
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
                {applications.map((application) => <tr key={application.id} onClick={() => { setSelectedApplicationId(application.id); setProvisionedCredentials(null); setProvisionError('') }} className={selectedApplicationId === application.id ? 'selected-row' : ''}>
                  <td>{application.full_name}</td><td>{application.mobile_number}</td><td>{application.barangay}</td><td>{application.vehicle_number}</td><td>{application.operating_area}</td>
                  <td><span className={`status-pill ${application.status}`}>{driverApplicationStatusLabels[application.status]}</span></td><td>{new Date(application.created_at).toLocaleDateString()}</td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedApplication ? <><div className="panel-header-row"><h3>Application Details</h3></div><div className="detail-grid">
            <div><span>Full name</span><strong>{selectedApplication.full_name}</strong></div><div><span>Mobile</span><strong>{selectedApplication.mobile_number}</strong></div><div><span>Email</span><strong>{selectedApplication.email || 'Not provided'}</strong></div><div><span>Facebook</span><strong>{selectedApplication.facebook_profile || 'Not provided'}</strong></div><div><span>Barangay</span><strong>{selectedApplication.barangay}</strong></div><div><span>Vehicle / body number</span><strong>{selectedApplication.vehicle_number}</strong></div><div><span>Vehicle type</span><strong>{selectedApplication.vehicle_type || 'Not provided'}</strong></div><div><span>Plate number</span><strong>{selectedApplication.plate_number || 'Not provided'}</strong></div><div><span>Driving experience</span><strong>{selectedApplication.driving_experience} years</strong></div><div><span>Operating area</span><strong>{selectedApplication.operating_area}</strong></div><div><span>Schedule</span><strong>{selectedApplication.preferred_schedule}</strong></div><div><span>Reason</span><strong>{selectedApplication.reason || 'Not provided'}</strong></div><div><span>Submitted</span><strong>{new Date(selectedApplication.created_at).toLocaleString()}</strong></div>
          </div><div className="application-documents"><h4 className="detail-documents-heading">Uploaded Documents</h4>
            <div className="application-document"><span>Driver's Photo</span>{applicationPhotoUrl ? <a className="application-image-link" href={applicationPhotoUrl} target="_blank" rel="noopener noreferrer"><img className="application-image" src={applicationPhotoUrl} alt="Driver's photo" /></a> : <p className="muted-copy">No photo uploaded.</p>}</div>
            <div className="application-document"><span>Driver's License</span>{applicationLicenseUrl ? <a className="application-image-link" href={applicationLicenseUrl} target="_blank" rel="noopener noreferrer"><img className="application-image" src={applicationLicenseUrl} alt="Driver's license" /></a> : <p className="muted-copy">No license uploaded.</p>}</div>
          </div><label className="field-block application-status-control"><span className="field-label">Application status</span><select className="input-field" value={selectedApplication.status} onChange={(event) => void handleApplicationStatusChange(selectedApplication.id, event.target.value as DriverApplicationStatus)}>{driverApplicationStatuses.map((status) => <option key={status} value={status}>{driverApplicationStatusLabels[status]}</option>)}</select></label>
          {selectedApplication.status === 'approved' && !selectedApplication.driver_id ? (
            <div className="quote-box">
              <span className="field-label">Driver provisioning</span>
              <button type="button" className="secondary-action compact-button" disabled={isProvisioning} onClick={() => void handleProvisionDriver()}>
                {isProvisioning ? 'Provisioning…' : 'Provision driver'}
              </button>
            </div>
          ) : null}
          {selectedApplication.driver_id ? (
            <div className="quote-box">
              <span className="field-label">Linked driver</span>
              <p className="field-note">{drivers.find((driver) => driver.id === selectedApplication.driver_id)?.name ?? 'Linked driver'}</p>
              <button type="button" className="secondary-action compact-button" onClick={() => { setActiveTab('drivers'); setSelectedDriverId(selectedApplication.driver_id as string) }}>
                View driver
              </button>
            </div>
          ) : null}
          {provisionError ? <span className="field-error">{provisionError}</span> : null}
          {provisionedCredentials ? (
            <div className="credentials-box">
              <p className="field-note">Driver account created for {provisionedCredentials.driverName}. The initial password is shown only once.</p>
              <div className="detail-grid">
                <div><span>Username</span><strong>{provisionedCredentials.username}</strong></div>
                <div><span>Initial password</span><strong>{provisionedCredentials.password}</strong></div>
              </div>
              <button type="button" className="ghost-button" onClick={() => setProvisionedCredentials(null)}>
                Dismiss
              </button>
            </div>
          ) : null}</> : <div className="empty-state-box"><p>Select an application to view details.</p></div>}</aside>
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

      {activeTab === 'pakyawan' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row"><h3>Pakyawan Bookings</h3></div>
            {pakyawanError ? <p className="form-error-message submit-error">{pakyawanError}</p> : null}
            {isLoadingPakyawan ? <p className="muted-copy">Loading Pakyawan bookings...</p> : pakyawanBookings.length === 0 ? <div className="empty-state-box"><p>No Pakyawan bookings found.</p></div> : (
              <div className="table-wrap"><table className="admin-table"><thead><tr><th>Booking</th><th>Date</th><th>Pickup Time</th><th>Customer</th><th>Phone</th><th>Price</th><th>Status</th></tr></thead><tbody>
                {pakyawanBookings.map((booking) => <tr key={booking.id} onClick={() => { setSelectedPakyawanBookingId(booking.id); setQuotePesos(''); setQuoteError('') }} className={selectedPakyawanBookingId === booking.id ? 'selected-row' : ''}>
                  <td><code className="ride-id-cell" title={booking.id}>{booking.id.slice(0, 8)}…</code></td><td>{booking.booking_date}</td><td>{booking.pickup_time}</td><td>{booking.customer_name}</td><td>{booking.customer_phone}</td>
                  <td>{typeof booking.price_cents === 'number' && Number.isFinite(booking.price_cents) ? `₱${formatCentavos(booking.price_cents)}` : 'Not quoted'}</td>
                  <td><span className={`status-pill ${booking.status}`}>{booking.status}</span></td>
                </tr>)}
              </tbody></table></div>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedPakyawanBooking ? <><div className="panel-header-row"><h3>Booking Details</h3></div><div className="detail-grid">
            <div><span>Booking</span><strong>{selectedPakyawanBooking.id.slice(0, 8)}…</strong></div><div><span>Status</span><strong>{selectedPakyawanBooking.status}</strong></div><div><span>Timing</span><strong>{formatPakyawanTiming(selectedPakyawanBooking.booking_date, selectedPakyawanBooking.pickup_time)}</strong></div><div><span>Customer</span><strong>{selectedPakyawanBooking.customer_name}</strong></div><div><span>Phone</span><strong>{selectedPakyawanBooking.customer_phone}</strong></div><div><span>Pickup Location</span><strong>{selectedPakyawanBooking.pickup_location}</strong></div><div><span>Destination</span><strong>{selectedPakyawanBooking.destination}</strong></div><div><span>Passengers</span><strong>{selectedPakyawanBooking.passengers}</strong></div><div><span>Trip Type</span><strong>{selectedPakyawanBooking.trip_type}</strong></div><div><span>Estimated Hours</span><strong>{selectedPakyawanBooking.estimated_hours ?? 'Not provided'}</strong></div><div><span>Vehicle Preference</span><strong>{selectedPakyawanBooking.vehicle_preference || 'Not provided'}</strong></div><div><span>Price</span><strong>{typeof selectedPakyawanBooking.price_cents === 'number' && Number.isFinite(selectedPakyawanBooking.price_cents) ? `₱${formatCentavos(selectedPakyawanBooking.price_cents)}` : 'Not quoted'}</strong></div><div><span>Driver</span><strong>{pakyawanDriverName(selectedPakyawanBooking.driver_id)}</strong></div>            <div><span>Special Requests</span><strong>{selectedPakyawanBooking.special_requests || 'None'}</strong></div><div><span>Created</span><strong>{new Date(selectedPakyawanBooking.created_at).toLocaleString()}</strong></div>
          </div>{selectedPakyawanBooking.status === 'pending' ? <div className="quote-box">
            <span className="field-label">Quote Price</span>
            <div className="quote-row">
              <span aria-hidden="true">₱</span>
              <input
                className="input-field slim-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                aria-label="Quote price in pesos"
                value={quotePesos}
                disabled={isQuoting}
                onChange={(event) => { setQuotePesos(event.target.value); setQuoteError('') }}
              />
              <button type="button" className="secondary-action compact-button" disabled={isQuoting} onClick={() => void handleQuotePakyawan()}>
                {isQuoting ? 'Quoting...' : 'Quote Booking'}
              </button>
            </div>
              {quoteError ? <span className="field-error">{quoteError}</span> : null}
            </div> : null}
                {['pending', 'quoted', 'scheduled', 'driver_on_way', 'driver_arrived', 'in_progress'].includes(selectedPakyawanBooking.status) ? (
                  <div className="quote-box">
                    <span className="field-label">Cancellation</span>
                    <button type="button" className="secondary-action compact-button" onClick={() => openCancelPakyawanModal(selectedPakyawanBooking)}>
                      Cancel booking
                    </button>
                  </div>
                ) : null}
                {pakyawanCancelResult ? <p className="field-note">Booking cancelled{pakyawanCancelResult.already_cancelled ? ' (already cancelled).' : '.'}</p> : null}
                {pakyawanCancelError ? <span className="field-error">{pakyawanCancelError}</span> : null}</> : <div className="empty-state-box"><p>Select a booking to view details.</p></div>}</aside>
        </section>
      ) : null}
      {activeTab === 'deliveries' ? (
        <section className="admin-layout admin-grid-two">
          <div className="admin-panel">
            <div className="panel-header-row"><h3>Deliveries</h3></div>
            <div className="stats-grid admin-overview-grid">
              {deliveryCounters.map((item) => (
                <div key={item.label} className={item.accent ? 'stat-box accent-stat' : 'stat-box'}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            <div className="toolbar-stack" role="group" aria-label="Delivery filters">
              {(['all', 'active', 'completed', 'exceptions'] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className={deliveryFilter === filter ? 'secondary-action compact-button active-filter' : 'secondary-action compact-button'}
                  onClick={() => setDeliveryFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter === 'active' ? 'Active' : filter === 'completed' ? 'Completed' : 'Exceptions'}
                </button>
              ))}
            </div>
            {deliveryError ? <p className="form-error-message submit-error">{deliveryError}</p> : null}
            {isLoadingDeliveries ? <p className="muted-copy">Loading deliveries...</p> : filteredDeliveries.length === 0 ? <div className="empty-state-box"><p>No deliveries found.</p></div> : (
              <div className="table-wrap"><table className="admin-table"><thead><tr><th>Reference</th><th>Date</th><th>Package</th><th>Pickup</th><th>Destination</th><th>Status</th><th>Fee</th><th>Driver</th><th>Proof</th></tr></thead><tbody>
                {filteredDeliveries.map((delivery) => <tr key={delivery.id} onClick={() => setSelectedDeliveryId(delivery.id)} className={selectedDeliveryId === delivery.id ? 'selected-row' : ''}>
                  <td><code className="ride-id-cell" title={delivery.id}>{delivery.id.slice(0, 8)}…</code></td><td>{formatDeliveryTiming(delivery.preferred_date, delivery.preferred_time)}</td><td>{delivery.package_type}</td><td>{delivery.pickup_address}</td><td>{delivery.delivery_address}</td>
                  <td><span className={`status-pill ${delivery.status}`}>{delivery.status}</span></td><td>{typeof delivery.price_cents === 'number' && Number.isFinite(delivery.price_cents) && delivery.price_cents > 0 ? `₱${formatCentavos(delivery.price_cents)}` : '—'}</td><td>{deliveryDriverName(delivery.driver_id)}</td><td>{deliveryProofIds.has(delivery.id) ? 'Available' : '—'}</td>
                </tr>)}
              </tbody></table></div>
            )}
            <div className="panel-header-row"><h3>Deliveries per driver</h3></div>
            {deliveriesPerDriver.length === 0 ? (
              <div className="empty-state-box"><p>No drivers assigned yet.</p></div>
            ) : (
              <ul className="mini-list">
                {deliveriesPerDriver.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.name}</strong>
                    <span>{entry.total} total · {entry.active} active</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="admin-panel detail-panel">{selectedDelivery ? <><div className="panel-header-row"><h3>Delivery Details</h3></div><div className="detail-grid">
            <div><span>Reference</span><strong>{selectedDelivery.id.slice(0, 8)}…</strong></div><div><span>Status</span><strong>{selectedDelivery.status}</strong></div><div><span>Timing</span><strong>{formatDeliveryTiming(selectedDelivery.preferred_date, selectedDelivery.preferred_time)}</strong></div><div><span>Sender</span><strong>{selectedDelivery.sender_name}</strong></div><div><span>Phone</span><strong>{selectedDelivery.sender_phone}</strong></div><div><span>Package Type</span><strong>{selectedDelivery.package_type}</strong></div><div><span>Package Details</span><strong>{selectedDelivery.package_details || 'None'}</strong></div><div><span>Package Size</span><strong>{selectedDelivery.package_size}</strong></div><div><span>Pickup</span><strong>{selectedDelivery.pickup_address}</strong></div><div><span>Destination</span><strong>{selectedDelivery.delivery_address}</strong></div><div><span>Driver</span><strong>{deliveryDriverName(selectedDelivery.driver_id)}</strong></div><div><span>Delivery Fee</span><strong>{typeof selectedDelivery.price_cents === 'number' && Number.isFinite(selectedDelivery.price_cents) && selectedDelivery.price_cents > 0 ? `₱${formatCentavos(selectedDelivery.price_cents)}` : '—'}</strong></div><div><span>Proof</span><strong>{deliveryProofIds.has(selectedDelivery.id) ? 'Available'            : 'Not available'}</strong></div><div><span>Created</span><strong>{new
           Date(selectedDelivery.created_at).toLocaleString()}</strong></div><div><span>Updated</span><strong>{new
           Date(selectedDelivery.updated_at).toLocaleString()}</strong></div>
          </div><div className="panel-header-row"><h3>Delivery timeline</h3></div><div className="detail-grid">
            <div><span>Requested</span><strong>{new Date(selectedDelivery.created_at).toLocaleString()}</strong></div><div><span>Current status</span><strong>{selectedDelivery.status}</strong></div><div><span>Last update</span><strong>{new Date(selectedDelivery.updated_at).toLocaleString()}</strong></div>
            {selectedDelivery.driver_id ? <div><span>Driver assigned</span><strong>{deliveryDriverName(selectedDelivery.driver_id)}</strong></div> : null}
            {typeof selectedDelivery.price_cents === 'number' && Number.isFinite(selectedDelivery.price_cents) && selectedDelivery.price_cents > 0 ? <div><span>Fee set</span><strong>₱{formatCentavos(selectedDelivery.price_cents)}</strong></div> : null}
            {deliveryProofIds.has(selectedDelivery.id) ? <div><span>Proof uploaded</span><strong>Available</strong></div> : null}
          </div>
          {deliveryProofIds.has(selectedDelivery.id) ? (
            (() => {
              const proofImage = deliveryProofImages[selectedDelivery.id]
              if (proofImage?.url) {
                return <img src={proofImage.url} alt="Delivery proof photo" className="proof-preview" />
              }
              if (proofImage?.failed || !deliveryProofPaths[selectedDelivery.id]) {
                return <p className="muted-copy">Proof image unavailable</p>
              }
              return <p className="muted-copy">Loading proof photo...</p>
            })()
          ) : null}
                {!['delivered', 'cancelled'].includes(selectedDelivery.status) ? (
                  <div className="quote-box">
                    <span className="field-label">Cancellation</span>
                    <button type="button" className="secondary-action compact-button" onClick={() => openCancelDeliveryModal(selectedDelivery)}>
                      Cancel delivery
                    </button>
                  </div>
                ) : null}
                {deliveryCancelResult ? <p className="field-note">Delivery cancelled{deliveryCancelResult.already_cancelled ? ' (already cancelled).' : '.'}</p> : null}
                {deliveryCancelError ? <span className="field-error">{deliveryCancelError}</span> : null}
          </> : <div className="empty-state-box"><p>Select a delivery to view details.</p></div>}</aside>
        </section>
      ) : null}
    </div>

    {driverToRemove ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isRemovingDriver ? undefined : () => setDriverToRemove(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-driver-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="remove-driver-title">Remove Driver?</h3>
          <p className="confirm-copy">
            Are you sure you want to permanently remove this driver from Bislig Hub? This will remove their driver account and access to the system.
          </p>
          <p className="confirm-driver">
            <strong>{driverToRemove.name}</strong>
            <span>{driverToRemove.phone}</span>
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isRemovingDriver}
              onClick={() => setDriverToRemove(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action danger-button"
              disabled={isRemovingDriver}
              onClick={() => void handleRemoveDriver()}
            >
              {isRemovingDriver ? 'Removing...' : 'Remove Driver'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {forceHoldTarget ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isForcingHold ? undefined : () => setForceHoldTarget(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-offline-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="force-offline-title">Force driver offline</h3>
          <p className="confirm-copy">
            This will set live presence to offline/unavailable and withdraw live offers. An active ride, if any, will be preserved. The driver will remain blocked from going online until an admin releases the hold.
          </p>
          <p className="confirm-driver">
            <strong>{forceHoldTarget.name}</strong>
            <span>{forceHoldTarget.phone}</span>
          </p>
          <label className="field-label" htmlFor="force-hold-reason">Reason</label>
          <input
            id="force-hold-reason"
            className="input-field slim-input"
            type="text"
            placeholder="Why is this driver being held offline?"
            value={holdReason}
            disabled={isForcingHold}
            onChange={(event) => { setHoldReason(event.target.value); setHoldError('') }}
          />
          {holdError ? <span className="field-error">{holdError}</span> : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isForcingHold}
              onClick={() => setForceHoldTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action danger-button"
              disabled={isForcingHold || !holdReason.trim()}
              onClick={() => void handleForceHold()}
            >
              {isForcingHold ? 'Holding...' : 'Force offline'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {releaseHoldTarget ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isReleasingHold ? undefined : () => setReleaseHoldTarget(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="release-hold-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="release-hold-title">Release admin hold</h3>
          <p className="confirm-copy">
            Releasing this hold removes the Admin block. It does not automatically set the driver online — the driver must go online normally afterward.
          </p>
          {holdError ? <span className="field-error">{holdError}</span> : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isReleasingHold}
              onClick={() => setReleaseHoldTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={isReleasingHold}
              onClick={() => void handleReleaseHold()}
            >
              {isReleasingHold ? 'Releasing...' : 'Release hold'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {cancelRideTarget ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isCancellingRide ? undefined : () => setCancelRideTarget(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-ride-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="cancel-ride-title">Cancel ride</h3>
          <p className="confirm-copy">
            This is an Admin operational cancellation. Live offers will be withdrawn and the driver released. Status: {rideStatusLabels[cancelRideTarget.status as keyof typeof rideStatusLabels] ?? cancelRideTarget.status}.
          </p>
          <p className="confirm-driver">
            <strong>{cancelRideTarget.Rider}</strong>
            <span>{cancelRideTarget.pickup} → {cancelRideTarget.destination}</span>
          </p>
          <label className="field-label" htmlFor="cancel-ride-reason">Reason</label>
          <input
            id="cancel-ride-reason"
            className="input-field slim-input"
            type="text"
            placeholder="Why is this ride being cancelled?"
            value={cancelReason}
            disabled={isCancellingRide}
            onChange={(event) => { setCancelReason(event.target.value); setCancelRideError('') }}
          />
          {cancelRideError ? <span className="field-error">{cancelRideError}</span> : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isCancellingRide}
              onClick={() => setCancelRideTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action danger-button"
              disabled={isCancellingRide || !cancelReason.trim()}
              onClick={() => void handleCancelRide()}
            >
              {isCancellingRide ? 'Cancelling...' : 'Cancel ride'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {cancelPakyawanTarget ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isCancellingPakyawan ? undefined : () => setCancelPakyawanTarget(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-pakyawan-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="cancel-pakyawan-title">Cancel booking</h3>
          <p className="confirm-copy">
            This is an Admin operational cancellation. Live offers will be withdrawn. Status: {cancelPakyawanTarget.status}.
          </p>
          <p className="confirm-driver">
            <strong>{cancelPakyawanTarget.customer}</strong>
            <span>{cancelPakyawanTarget.route}</span>
          </p>
          <label className="field-label" htmlFor="cancel-pakyawan-reason">Reason</label>
          <input
            id="cancel-pakyawan-reason"
            className="input-field slim-input"
            type="text"
            placeholder="Why is this booking being cancelled?"
            value={pakyawanCancelReason}
            disabled={isCancellingPakyawan}
            onChange={(event) => { setPakyawanCancelReason(event.target.value); setPakyawanCancelError('') }}
          />
          {pakyawanCancelError ? <span className="field-error">{pakyawanCancelError}</span> : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isCancellingPakyawan}
              onClick={() => setCancelPakyawanTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action danger-button"
              disabled={isCancellingPakyawan || !pakyawanCancelReason.trim()}
              onClick={() => void handleCancelPakyawan()}
            >
              {isCancellingPakyawan ? 'Cancelling...' : 'Cancel booking'}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {cancelDeliveryTarget ? (
      <div
        className="ride-chat-overlay"
        role="presentation"
        onClick={isCancellingDelivery ? undefined : () => setCancelDeliveryTarget(null)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-delivery-title"
          className="remove-driver-dialog"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 id="cancel-delivery-title">Cancel delivery</h3>
          <p className="confirm-copy">
            This is an Admin operational cancellation. Live offers will be withdrawn. Status: {cancelDeliveryTarget.status}.
          </p>
          <p className="confirm-driver">
            <strong>{cancelDeliveryTarget.sender}</strong>
            <span>{cancelDeliveryTarget.route}</span>
          </p>
          <label className="field-label" htmlFor="cancel-delivery-reason">Reason</label>
          <input
            id="cancel-delivery-reason"
            className="input-field slim-input"
            type="text"
            placeholder="Why is this delivery being cancelled?"
            value={deliveryCancelReason}
            disabled={isCancellingDelivery}
            onChange={(event) => { setDeliveryCancelReason(event.target.value); setDeliveryCancelError('') }}
          />
          {deliveryCancelError ? <span className="field-error">{deliveryCancelError}</span> : null}
          <div className="form-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={isCancellingDelivery}
              onClick={() => setCancelDeliveryTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary-action danger-button"
              disabled={isCancellingDelivery || !deliveryCancelReason.trim()}
              onClick={() => void handleCancelDelivery()}
            >
              {isCancellingDelivery ? 'Cancelling...' : 'Cancel delivery'}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  )
}










