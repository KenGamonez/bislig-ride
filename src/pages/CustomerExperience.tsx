import { useEffect, useMemo, useRef, useState } from 'react'
import bisligLogo from '../assets/Bislig Ride Logo.png'
import { AppHeader } from '../components/AppHeader'
import { CancelRideModal } from '../components/CancelRideModal'
import { CustomerProfile } from '../components/CustomerProfile'
import { RideChat } from '../components/RideChat'
import { LocationInput } from '../components/LocationInput'
import { MapView } from '../components/MapView'
import { MobileBottomNav, type MobileBottomNavTab } from '../components/MobileBottomNav'
import { PassengerUpcoming } from '../components/PassengerUpcoming'
import { ServiceDashboard } from '../components/ServiceDashboard'
import { AnnouncementTicker } from '../components/AnnouncementTicker'
import { WeatherWidget } from '../components/WeatherWidget'
import { passengerTypes, type DemoPassengerType } from '../lib/demoDriver'
import {
  formatVehicleType,
  passengerCountOptionsFor,
  type PassengerCountOption,
  VEHICLE_LABELS,
  VEHICLE_TYPES,
  type VehicleType,
} from '../lib/vehicle'
import {
  computeFare,
  DEFAULT_FARE_LEVEL,
  formatCentavos,
} from '../lib/fare'
import { fetchDriverById } from '../lib/drivers'
import type { DriverProfile } from '../types/driver'
import { startRideLocationWatch, subscribeToRideLocation } from '../lib/rideLocation'
import { playChatNotification } from '../lib/notifications'
import { fetchLatestRideCancellation, subscribeToRideCancellations } from '../lib/rideCancellations'
import { fetchReputationFor, formatCancellationRate, type ReputationSummary } from '../lib/reputation'
import { cancelRide, createRide, fetchRideById, hasRatedRide, submitRideRating } from '../lib/rides'
import { dispatchRide } from '../lib/dispatch'
import { getCustomerAuthId, supabase } from '../lib/supabase'
import { useLanguage } from '../lib/i18n'
import type { Ride, RideCancellation } from '../types/ride'

type CustomerFormState = {
  pickup: string
  destination: string
  name: string
  phone: string
  passengerType: DemoPassengerType
  vehicleType: VehicleType
  passengerCount: PassengerCountOption
  destinationMode: 'same'
}

type CustomerValidation = Partial<Record<keyof CustomerFormState, string>>

type RidePhase = 'request' | 'searching' | 'no_driver' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'rating' | 'payment' | 'payment_confirmed'

type PaymentMethod = 'Cash' | 'GCash'

type ViewMode = 'Rider' | 'driver' | 'admin'

const initialFormState: CustomerFormState = {
  pickup: '',
  destination: '',
  name: '',
  phone: '',
  passengerType: 'Regular',
  vehicleType: 'motorcycle',
  passengerCount: '1 passenger',
  destinationMode: 'same',
}

const initialRide: Ride = {
  id: '',
  customer_name: '',
  customer_phone: '',
  pickup_address: '',
  pickup_lat: null,
  pickup_lng: null,
  destination_address: '',
  destination_lat: null,
  destination_lng: null,
customer_auth_id: null,
  driver_id: null,
  passenger_count: 1,
  passenger_type: 'Regular',
  destination_mode: 'same',
  destination_stops: null,
  vehicle_type: null,
  fare_cents: null,
  fare_source: null,
  status: 'requested',
  created_at: new Date().toISOString(),
}

const rideIdStorageKey = 'bislig-ride-last-ride-id'

const RIDE_REDISPATCH_POLL_INTERVAL_MS = 15000
const MAX_REDISPATCH_GRACE_RETRIES = 15
const DISPATCH_RETRY_DELAY_MS = 2000
const passengerShareStorageKey = (rideId: string) => `bislig-ride-customer-share-${rideId}`

const renderStars = (average: number) => (
  <span className="rating-stars-inline" aria-hidden="true">
    {[1, 2, 3, 4, 5].map((value) => (
      <svg
        key={value}
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill={value <= Math.round(average) ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
    ))}
  </span>
)

const mapRideStatusToPhase = (status: Ride['status']): RidePhase => {
  switch (status) {
    case 'requested':
      return 'searching'
    case 'no_driver':
      return 'no_driver'
    case 'accepted':
      return 'accepted'
    case 'arrived':
      return 'arrived'
    case 'in_progress':
      return 'in_progress'
    case 'completed':
      return 'completed'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'request'
  }
}

type CustomerExperienceProps = {
  currentView?: ViewMode
  onSwitchView?: (view: ViewMode) => void
}

export function CustomerExperience({ currentView = 'Rider', onSwitchView }: CustomerExperienceProps) {
  const { t } = useLanguage()

  const formatPassengerCount = (value: string | number | null | undefined) => {
    const parsed = Number.parseInt(String(value ?? '1'), 10)
    const safeValue = Number.isFinite(parsed) ? parsed : 1

    if (safeValue === 5) {
      return t('book.fivePlusPassengers')
    }

    if (safeValue >= 6) {
      return t('book.nPassengers', { count: safeValue })
    }

    return safeValue === 1
      ? t('book.onePassenger')
      : t('book.nPassengers', { count: safeValue })
  }
  const [formData, setFormData] = useState<CustomerFormState>(initialFormState)
  const [validationErrors, setValidationErrors] = useState<CustomerValidation>({})
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [customerAuthId, setCustomerAuthId] = useState<string | null>(null)
  const [assignedDriver, setAssignedDriver] = useState<DriverProfile | null>(null)
  const [driverReputation, setDriverReputation] = useState<ReputationSummary | null>(null)
  const [showChat, setShowChat] = useState(false)
  const [ride, setRide] = useState<Ride>(initialRide)
          const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pickupLocation, setPickupLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pickupLocationError, setPickupLocationError] = useState('')
  const [phase, setPhase] = useState<RidePhase>('request')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Cash')
const [rating, setRating] = useState(0)
  const [ratingComment, setRatingComment] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [ratingError, setRatingError] = useState('')
  const [isSubmittingRating, setIsSubmittingRating] = useState(false)
  const [retryingDispatch, setRetryingDispatch] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancellation, setCancellation] = useState<RideCancellation | null>(null)
  const [openMobileSection, setOpenMobileSection] = useState<string | null>(null)
  const [bottomNavTab, setBottomNavTab] = useState<MobileBottomNavTab>('home')
  const [launcherView, setLauncherView] = useState(true)
  const [passengerLiveLocation, setPassengerLiveLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [passengerLocationError, setPassengerLocationError] = useState('')
  const [passengerLocationShared, setPassengerLocationShared] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const [chatToast, setChatToast] = useState<{ id: string; from: string; preview: string } | null>(null)
  const showChatRef = useRef(false)
  const handledChatMessageIdsRef = useRef<Set<string>>(new Set())
  const chatToastTimerRef = useRef<number | null>(null)
  const restoreTripDispatchInFlightRef = useRef(false)
  const searchingRedispatchInFlightRef = useRef(false)
  const searchingRedispatchAttemptsRef = useRef(0)
  const immediateDispatchRetryTimerRef = useRef<number | null>(null)

  const handleBottomNavChange = (tab: MobileBottomNavTab) => {
    setBottomNavTab(tab)

    if (tab === 'home') {
      setShowProfile(false)
      if (phase !== 'request') {
        handleBackToHome()
        return
      }
      setLauncherView(true)
      window.requestAnimationFrame(() => {
        document.querySelector('.service-dashboard')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
  } else {
    setShowProfile(true)
  }
}

  const handleOpenChat = () => {
    setChatUnread(0)
    setChatToast(null)

    if (chatToastTimerRef.current !== null) {
      window.clearTimeout(chatToastTimerRef.current)
      chatToastTimerRef.current = null
    }

    setShowChat(true)
  }

  const handleSharePassengerLocation = () => {
    if (!ride.id) {
      return
    }

    setPassengerLocationShared(true)
    window.localStorage.setItem(passengerShareStorageKey(ride.id), '1')
  }

  useEffect(() => {
    void getCustomerAuthId()
      .then(setCustomerAuthId)
      .catch((error) => console.error('Unable to establish Rider session:', error))
  }, [])

  useEffect(() => {
    return () => {
      if (immediateDispatchRetryTimerRef.current !== null) {
        window.clearTimeout(immediateDispatchRetryTimerRef.current)
        immediateDispatchRetryTimerRef.current = null
      }
    }
  }, [])

useEffect(() => {
    const persistedRideId = window.localStorage.getItem(rideIdStorageKey)
    if (!persistedRideId) {
      return
    }

const restoreRide = async () => {
      try {
        const latestRide = await fetchRideById(persistedRideId)
        if (!latestRide) {
          return
        }

        setRide(latestRide)
        setPhase(mapRideStatusToPhase(latestRide.status))

        if (latestRide.status === 'requested' && !restoreTripDispatchInFlightRef.current) {
          restoreTripDispatchInFlightRef.current = true

          try {
            const redispatchResult = await dispatchRide(latestRide.id)
            if (redispatchResult.ride_status === 'no_driver') {
              setPhase('no_driver')
            } else {
              setPhase(mapRideStatusToPhase(latestRide.status))
            }
          } catch (error) {
            console.error('Unable to re-dispatch restored ride:', error)
          } finally {
            restoreTripDispatchInFlightRef.current = false
          }
        }

        if (
          latestRide.status === 'accepted' ||
          latestRide.status === 'arrived' ||
          latestRide.status === 'in_progress'
        ) {
          if (window.localStorage.getItem(passengerShareStorageKey(latestRide.id)) === '1') {
            setPassengerLocationShared(true)
          }
        } else {
          window.localStorage.removeItem(passengerShareStorageKey(latestRide.id))
        }

        if (latestRide.status === 'cancelled') {
          const latestCancellation = await fetchLatestRideCancellation(latestRide.id)
          if (latestCancellation) {
            setCancellation(latestCancellation)
          }
        }
      } catch (error) {
        console.error('Unable to restore ride state:', error)
      }
    }

    void restoreRide()
  }, [])

  useEffect(() => {
    if (
      phase !== 'searching' ||
      ride.status !== 'requested' ||
      searchingRedispatchInFlightRef.current
    ) {
      return
    }

    searchingRedispatchAttemptsRef.current = 0
    searchingRedispatchInFlightRef.current = false

    const redispatch = async (): Promise<void> => {
      if (
        phase !== 'searching' ||
        ride.status !== 'requested' ||
        searchingRedispatchInFlightRef.current
      ) {
        return
      }

      searchingRedispatchInFlightRef.current = true

      try {
        const result = await dispatchRide(ride.id)

        if (result.ride_status === 'no_driver') {
          setPhase('no_driver')
        } else {
          setPhase(mapRideStatusToPhase(ride.status))
        }
      } catch (error) {
        console.error('Unable to keep searching for a driver:', error)
      } finally {
        searchingRedispatchInFlightRef.current = false
      }
    }

    const onTick = (): void => {
      if (
        phase !== 'searching' ||
        ride.status !== 'requested' ||
        searchingRedispatchInFlightRef.current
      ) {
        return
      }

      if (searchingRedispatchAttemptsRef.current >= MAX_REDISPATCH_GRACE_RETRIES) {
        return
      }

      searchingRedispatchAttemptsRef.current += 1
      void redispatch()
    }

    const timer = window.setInterval(onTick, RIDE_REDISPATCH_POLL_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
    }
  }, [phase, ride.id, ride.status])

  const formValues = useMemo(
    () => ({
      pickup: formData.pickup.trim(),
      destination: formData.destination.trim(),
      name: formData.name.trim(),
phone: formData.phone.trim(),
      passengerType: formData.passengerType,
      vehicleType: formData.vehicleType,
      passengerCount: formData.passengerCount,
      destinationMode: formData.destinationMode,
    }),
    [formData],
  )

  const fareQuote = useMemo(() => {
    if (!formValues.destination) {
      return null
    }

    return computeFare({
      destination: formValues.destination,
      destinationMode: 'same',
      passengerType: formValues.passengerType,
      fuelLevel: DEFAULT_FARE_LEVEL,
      distanceKm: null,
    })
  }, [formValues.destination, formValues.passengerType])

  const pickupSummary = formData.pickup.trim() || (pickupLocation ? t('book.currentLocationSet') : '')
  const destinationSummary = formData.destination.trim()
  const passengerSummary =
    formatPassengerCount(formData.passengerCount) +
    (formValues.name.trim() ? ` · ${formValues.name.trim()}` : '') +
    (formValues.phone.trim() ? ` · ${formValues.phone.trim()}` : '')
  const preferencesSummary = `${formatVehicleType(formValues.vehicleType)} · ${formValues.passengerType}${
    formValues.passengerType === 'Regular' ? ` ${t('book.ride')}` : ''
  }`

  const rideFareDisplay = (ride: Ride): { label: string; value: string } => {
    if (typeof ride.fare_cents === 'number' && Number.isFinite(ride.fare_cents)) {
      return { label: t('book.fareEstimated'), value: `₱${formatCentavos(ride.fare_cents)}` }
    }

    return { label: t('book.fare'), value: t('book.fareTraditional') }
  }

  const renderFarePreview = () => {
    if (fareQuote) {
      return (
        <div className="fare-box">
          <span className="field-label">{t('book.fareEstimated')}</span>
          <strong>₱{formatCentavos(fareQuote.fareCents)}</strong>
          <small>{t('book.fareMatrix', { level: DEFAULT_FARE_LEVEL })}</small>
        </div>
      )
    }

    return (
      <div className="fare-box">
        <span className="field-label">{t('book.fare')}</span>
        <strong>{t('book.fareTraditional')}</strong>
      </div>
    )
  }

const resetForm = () => {
    setFormData(initialFormState)
    setValidationErrors({})
    setSubmitError('')
    setPickupLocation(null)
    setPickupLocationError('')
    setIsSubmitting(false)
  }

  const toggleMobileSection = (id: string) => {
    setOpenMobileSection((current) => (current === id ? null : id))
  }

const handleInput = (field: keyof CustomerFormState, value: string) => {
    if (field === 'passengerType') {
      setFormData((current) => ({ ...current, passengerType: value as DemoPassengerType }))
      return
    }

    if (field === 'vehicleType') {
      const vehicle = value as VehicleType

      setFormData((current) => ({
        ...current,
        vehicleType: vehicle,
        passengerCount: vehicle === 'motorcycle' ? '1 passenger' : current.passengerCount,
      }))
      setValidationErrors((current) => ({ ...current, vehicleType: undefined, passengerCount: undefined }))
      return
    }

    setFormData((current) => ({ ...current, [field]: value }))
    setValidationErrors((current) => ({ ...current, [field]: undefined }))
  }

const validateForm = () => {
    const nextErrors: CustomerValidation = {}

    if (!formValues.pickup && !pickupLocation) {
      nextErrors.pickup = t('err.pickupRequired')
    }

    if (!formValues.destination) {
      nextErrors.destination = t('err.destinationRequired')
    }

    if (!formValues.name) {
      nextErrors.name = t('err.nameRequired')
    }

    if (formValues.vehicleType === 'motorcycle') {
      const parsedCount = Number.parseInt(String(formValues.passengerCount), 10)

      if (!Number.isFinite(parsedCount) || parsedCount > 1) {
        nextErrors.passengerCount = t('book.motorcycleNote')
      }
    }

    setValidationErrors(nextErrors)

    if (nextErrors.pickup) {
      setOpenMobileSection('pickup')
    } else if (nextErrors.destination) {
      setOpenMobileSection('destination')
    } else if (nextErrors.name) {
      setOpenMobileSection('passenger')
    }

    return Object.keys(nextErrors).length === 0
  }

const handleUseCurrentLocation = () => {
    setOpenMobileSection('pickup')

    if (!navigator.geolocation) {
      setPickupLocationError(t('err.geoUnsupported'))
      return
    }

    setPickupLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords

        console.log('Bislig Ride rider location:', {
          latitude,
          longitude,
          accuracy,
        })

        if (!Number.isFinite(accuracy)) {
          setPickupLocation(null)
          setPickupLocationError(t('err.geoAccuracy'))
          return
        }

        // Excellent / good location: accept immediately.
        if (accuracy <= 100) {
          setPickupLocation({
            latitude,
            longitude,
          })
          setValidationErrors((current) => ({ ...current, pickup: undefined }))
          return
        }

        // Usable but not ideal: accept up to 300m.
        // This avoids unnecessarily rejecting legitimate mobile GPS fixes.
        if (accuracy <= 300) {
          setPickupLocation({
            latitude,
            longitude,
          })
          setValidationErrors((current) => ({ ...current, pickup: undefined }))
          setPickupLocationError(t('err.geoApprox', { meters: Math.round(accuracy) }))
          return
        }

        // Anything above 300m is too coarse for a reliable ride pickup.
        setPickupLocation(null)

        if (accuracy >= 10000) {
          setPickupLocationError(t('err.geoImprecise'))
        } else {
          setPickupLocationError(t('err.geoInaccurate', { meters: Math.round(accuracy) }))
        }
      },
      (error) => {
        console.error('Unable to get Rider pickup location:', error)

        if (error.code === error.PERMISSION_DENIED) {
          setPickupLocationError(t('err.geoDenied'))
        } else if (error.code === error.TIMEOUT) {
          setPickupLocationError(t('err.geoTimeout'))
        } else {
          setPickupLocationError(t('err.geoUnable'))
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      },
    )
  }

  useEffect(() => {
    if (!ride.id || phase === 'rating' || phase === 'payment' || phase === 'payment_confirmed') {
      return
    }

    let isMounted = true

const syncRideStatus = async () => {
      try {
        const latestRide = await fetchRideById(ride.id)
        if (!isMounted || !latestRide) {
          return
        }

        setRide(latestRide)
        setPhase(mapRideStatusToPhase(latestRide.status))

        if (latestRide.status === 'cancelled') {
          const latestCancellation = await fetchLatestRideCancellation(ride.id)
          if (isMounted && latestCancellation) {
            setCancellation(latestCancellation)
          }
        }
      } catch (error) {
        console.error('Unable to refresh ride status:', error)
      }
    }

    void syncRideStatus()
    const timer = window.setInterval(() => {
      void syncRideStatus()
    }, 5000)

    const channel = supabase
      .channel(`passenger-ride-status-${ride.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rides',
          filter: `id=eq.${ride.id}`,
        },
        () => {
          void syncRideStatus()
        },
      )
      .subscribe()

    return () => {
      isMounted = false
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [ride.id, phase])

  useEffect(() => {
    if (!ride.driver_id) {
      setAssignedDriver(null)
      return
    }

    let cancelled = false

    const loadAssignedDriver = async () => {
      const driver = await fetchDriverById(ride.driver_id as string)

      if (!cancelled) {
        setAssignedDriver(driver as DriverProfile | null)
      }
    }

void loadAssignedDriver()

    return () => {
      cancelled = true
    }
  }, [ride.driver_id])

  useEffect(() => {
    if (!ride.driver_id) {
      return
    }

    let cancelled = false

    const loadDriverReputation = async () => {
      const summary = await fetchReputationFor(String(ride.driver_id), true)

      if (!cancelled) {
        setDriverReputation(summary)
      }
    }

    void loadDriverReputation()

    return () => {
      cancelled = true
    }
  }, [ride.driver_id])

  useEffect(() => {
    const activeStatuses: Ride['status'][] = ['accepted', 'arrived', 'in_progress']

    if (!ride.id || !ride.driver_id || !customerAuthId || !activeStatuses.includes(ride.status)) {
      setDriverLocation(null)
      return
    }

    return subscribeToRideLocation(ride.id, (message) => {
      if (message.user === customerAuthId) {
        return
      }

      setDriverLocation({ latitude: message.latitude, longitude: message.longitude })
    })
  }, [ride.id, ride.driver_id, customerAuthId, ride.status])

  useEffect(() => {
    showChatRef.current = showChat
  }, [showChat])

  useEffect(() => {
    const activeStatuses: Ride['status'][] = ['accepted', 'arrived', 'in_progress']

    if (!ride.id || !customerAuthId || !activeStatuses.includes(ride.status) || !passengerLocationShared) {
      return
    }

    return startRideLocationWatch(ride.id, {
      user: customerAuthId,
      onLocation: (latitude, longitude) => {
        setPassengerLiveLocation({ latitude, longitude })
        setPassengerLocationError('')
      },
      onError: (error) => {
        console.error('Unable to get passenger location:', error)
        setPassengerLocationError(t('err.liveLocationOff'))
      },
    })
  }, [ride.id, customerAuthId, ride.status, passengerLocationShared, t])

  useEffect(() => {
    if (!ride.id || !customerAuthId) {
      return
    }

    const channel = supabase
      .channel(`Rider-ride-chat-${ride.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_id=eq.${ride.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id?: string
            ride_id?: string
            sender_role?: string
            message?: string
          }

          if (
            incoming.ride_id !== ride.id ||
            incoming.sender_role !== 'driver' ||
            !incoming.id
          ) {
            return
          }

          if (handledChatMessageIdsRef.current.has(incoming.id)) {
            return
          }

          handledChatMessageIdsRef.current.add(incoming.id)

          playChatNotification()

          if (showChatRef.current) {
            return
          }

          setChatUnread((current) => current + 1)
          setChatToast({
            id: incoming.id,
            from: assignedDriver?.full_name ?? t('book.yourDriver'),
            preview: incoming.message ?? t('chat.toastPreview'),
          })

          if (chatToastTimerRef.current !== null) {
            window.clearTimeout(chatToastTimerRef.current)
          }

          chatToastTimerRef.current = window.setTimeout(() => {
            setChatToast(null)
            chatToastTimerRef.current = null
          }, 6000)
        },
      )
      .subscribe()

    return () => {
      if (chatToastTimerRef.current !== null) {
        window.clearTimeout(chatToastTimerRef.current)
      }

      setChatToast(null)
      setChatUnread(0)

      void supabase.removeChannel(channel)
    }
  }, [ride.id, customerAuthId, assignedDriver?.full_name, t])

  useEffect(() => {
    if (!ride.id || !['requested', 'accepted', 'arrived', 'in_progress'].includes(ride.status)) {
      return
    }

    let mounted = true

    const unsubscribe = subscribeToRideCancellations(ride.id, (incoming) => {
      if (!mounted) {
        return
      }

      if (incoming.cancelled_by_role === 'customer' && incoming.cancelled_by === customerAuthId) {
        return
      }

      setCancellation(incoming)
      setRide((current) => ({ ...current, status: 'cancelled' }))
      setPhase('cancelled')
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [ride.id, ride.status, customerAuthId])
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitError('')
    setIsSubmitting(true)

    setPassengerLocationShared(false)
    setPassengerLiveLocation(null)
    setPassengerLocationError('')
    window.localStorage.removeItem(passengerShareStorageKey(ride.id || ''))

    try {
      const requestedPassengerCount =
        formValues.vehicleType === 'motorcycle' ? '1 passenger' : formValues.passengerCount

      const createdRide = await createRide({
        customer_auth_id: customerAuthId ?? await getCustomerAuthId(),
        customer_name: formValues.name,
        customer_phone: formValues.phone,
        pickup_address: formValues.pickup,
        pickup_lat: pickupLocation?.latitude ?? null,
        pickup_lng: pickupLocation?.longitude ?? null,
destination_address: formValues.destination,
        destination_lat: null,
        destination_lng: null,
        driver_id: null,
        vehicle_type: formValues.vehicleType,
        passenger_count: requestedPassengerCount,
        passenger_type: formValues.passengerType,
        destination_mode: 'same',
        destination_stops: [],
        fare_cents: fareQuote?.fareCents ?? null,
        fare_source: fareQuote?.source ?? null,
        status: 'requested',
      })

      setRide(createdRide)
      window.localStorage.setItem(rideIdStorageKey, String(createdRide.id))
      setPhase('searching')

      try {
        const result = await dispatchRide(createdRide.id)

        if (result.ride_status === 'no_driver') {
          setPhase('no_driver')
        }
      } catch (error) {
        console.error('Unable to dispatch ride:', error)

        if (immediateDispatchRetryTimerRef.current === null) {
          immediateDispatchRetryTimerRef.current = window.setTimeout(() => {
            immediateDispatchRetryTimerRef.current = null

            void (async () => {
              try {
                const latestRide = await fetchRideById(createdRide.id)
                if (!latestRide || latestRide.status !== 'requested') {
                  return
                }
              } catch (verifyError) {
                console.error('Unable to verify ride before retry dispatch:', verifyError)
                return
              }

              try {
                const result = await dispatchRide(createdRide.id)

                if (result.ride_status === 'no_driver') {
                  setPhase('no_driver')
                }
              } catch (retryError) {
                console.error('Unable to retry dispatch ride:', retryError)
              }
            })()
          }, DISPATCH_RETRY_DELAY_MS)
        }
      }
    } catch (error) {
      console.error('Unable to create ride:', error)

      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : t('err.requestRide')

      setSubmitError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetryDispatch = async () => {
    if (!ride.id || retryingDispatch) {
      return
    }

    setRetryingDispatch(true)
    setSubmitError('')

    try {
      const result = await dispatchRide(ride.id)

      if (result.ride_status === 'no_driver') {
        setPhase('no_driver')
      } else {
        setPhase('searching')
      }
    } catch (error) {
      console.error('Unable to dispatch ride again:', error)

      const message =
        error instanceof Error
          ? error.message
          : t('err.dispatchRide')

      setSubmitError(message)
    } finally {
      setRetryingDispatch(false)
    }
  }

const handleSubmitRating = async () => {
    if (!ride.id || rating < 1 || rating > 5 || isSubmittingRating || ratingSubmitted) {
      return
    }

    setRatingError('')
    setIsSubmittingRating(true)

    try {
      const currentAuthId = customerAuthId ?? (await getCustomerAuthId())

      if (ride.customer_auth_id && currentAuthId !== ride.customer_auth_id) {
        setRatingError(t('rating.ownerOnly'))
        return
      }

      const alreadyRated = await hasRatedRide(ride.id, currentAuthId)

      if (alreadyRated) {
        setRatingSubmitted(true)
        return
      }

      const savedRide = await submitRideRating(ride.id, rating, ratingComment)

      if (savedRide) {
        setRide(savedRide)
      }

setRatingSubmitted(true)
    } catch (error) {
      console.warn('Unable to submit rating:', error)

      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error && typeof error.message === 'string'
            ? error.message
            : t('rating.failed')

      setRatingError(message)
    } finally {
      setIsSubmittingRating(false)
    }
  }

  useEffect(() => {
    if (phase !== 'rating' || !ride.id || !customerAuthId) {
      return
    }

    let mounted = true

    const checkExistingRating = async () => {
      if (ride.customer_auth_id && customerAuthId !== ride.customer_auth_id) {
        if (mounted) {
          setRatingSubmitted(false)
          setRatingError(t('rating.ownerOnly'))
        }
        return
      }

      const alreadyRated = await hasRatedRide(ride.id, customerAuthId)

      if (mounted) {
        setRatingSubmitted(alreadyRated)
      }
    }

    void checkExistingRating()

    return () => {
      mounted = false
    }
  }, [phase, ride.id, ride.customer_auth_id, customerAuthId, t])

  const handleConfirmCancellation = async (reason: string) => {
    if (!ride.id || !customerAuthId || cancelSubmitting) {
      return
    }

    setCancelError('')
    setCancelSubmitting(true)

    try {
      const cancelledRide = await cancelRide(ride.id, customerAuthId, 'customer', reason)
      setRide(cancelledRide)
      setPhase('cancelled')

      const latestCancellation = await fetchLatestRideCancellation(ride.id)
      if (latestCancellation) {
        setCancellation(latestCancellation)
      }

      setShowCancelModal(false)
    } catch (error) {
      console.error('Unable to cancel ride:', error)

      const message =
        error instanceof Error
          ? error.message
          : t('cancel.failed')

      setCancelError(message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  const handleBackToHome = () => {
    window.localStorage.removeItem(rideIdStorageKey)
    setPassengerLocationShared(false)
    setPassengerLiveLocation(null)
    setPassengerLocationError('')
    window.localStorage.removeItem(passengerShareStorageKey(ride.id || ''))
    setRide(initialRide)
    setPhase('request')
    setPaymentMethod('Cash')
    setRating(0)
    setRatingComment('')
    setRatingSubmitted(false)
    setRatingError('')
    setCancellation(null)
    setLauncherView(true)
    setOpenMobileSection(null)
    resetForm()
  }

  const handleRideNowCtaClick = () => {
    setLauncherView(false)
    setOpenMobileSection('pickup')

    if (!window.matchMedia('(max-width: 767px)').matches) {
      window.requestAnimationFrame(() => {
        document.getElementById('ride-booking-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }

    const focusPickupInput = () => {
      const form = document.getElementById('ride-booking-form')
      const pickupInput = form?.querySelector<HTMLInputElement>(
        '.mobile-booking-flow .accordion-row.is-open .input-field',
      )

      if (!pickupInput) {
        return
      }

      pickupInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
      pickupInput.focus({ preventScroll: true })
    }

    window.setTimeout(focusPickupInput, 320)
  }

  const isRequesting = phase === 'request'
  const showCustomerForm = isRequesting && !showProfile
  const showDemoRideState = phase !== 'request' && !showProfile
  const showRideLauncher = showCustomerForm && launcherView

  const renderRequestScreen = () => (
    <form className="ride-form" id="ride-booking-form" onSubmit={handleSubmit} noValidate>
      <div className="desktop-booking-flow">
      <section className="booking-section route-section">
        <div className="booking-section-heading route-heading">
          <span className="booking-section-number">01</span>
          <div>
            <strong>{t('book.tripDetails')}</strong>
            <span>{t('book.tripDetailsHint')}</span>
          </div>
        </div>

        <div className="form-stack route-fields">
          <div className="pickup-field-block">
<LocationInput
              label={pickupLocation ? t('book.pickupOptional') : t('book.pickup')}
              value={formData.pickup}
              placeholder={pickupLocation ? t('book.pickupLandmarkPlaceholder') : t('book.pickupPlaceholder')}
              error={validationErrors.pickup}
              onChange={(value) => handleInput('pickup', value)}
            />

            <p className="pickup-help-note">
              {t('book.pickupHelp')} <strong>{t('book.useCurrentLocation')}</strong>.
            </p>

            {pickupLocation ? (
              <div className="field-note pickup-detected-note">
                <span className="pickup-check" aria-hidden="true"></span>
                <span>{t('book.locationDetected')}</span>
              </div>
            ) : null}

            {pickupLocationError ? (
              <p className="form-error-message pickup-location-error">
                {pickupLocationError}
              </p>
            ) : null}
          </div>

<div className="destination-field-block">
            <LocationInput
              label={t('book.destination')}
              value={formData.destination}
              placeholder={t('book.whereTo')}
              error={validationErrors.destination}
              onChange={(value) => handleInput('destination', value)}
            />
          </div>
</div>
      </section>

      <section className="booking-section passenger-section">
        <div className="booking-section-heading passenger-heading">
          <div>
            <strong>{t('book.passengerDetails')}</strong>
            <span>{t('book.passengerDetailsHint')}</span>
          </div>
        </div>

        <div className="Rider-details passenger-details">
          <LocationInput
            label={t('book.name')}
            value={formData.name}
            placeholder={t('book.namePlaceholder')}
            error={validationErrors.name}
            onChange={(value) => handleInput('name', value)}
          />

          <div className="field-block">
            <span className="field-label">{t('book.passengerType')}</span>
            <select
              className="input-field"
              value={formData.passengerType}
              onChange={(event) => handleInput('passengerType', event.target.value)}
            >
              {passengerTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="booking-section preferences-section">
        <div className="booking-section-heading preferences-heading">
          <span className="booking-section-number">03</span>
          <div>
            <strong>{t('book.ridePreferences')}</strong>
            <span>{t('book.ridePreferencesHint')}</span>
          </div>
        </div>

        <div className="ride-options-grid">
          <div className="field-block">
            <span className="field-label">{t('book.vehicle')}</span>
            <select
              className="input-field"
              value={formData.vehicleType}
              onChange={(event) => handleInput('vehicleType', event.target.value)}
            >
              {VEHICLE_TYPES.map((vehicle) => (
                <option key={vehicle} value={vehicle}>
                  {VEHICLE_LABELS[vehicle]}
                </option>
              ))}
            </select>
          </div>

          {formData.vehicleType === 'motorcycle' ? (
            <div className="field-block">
              <span className="field-label">{t('book.passengers')}</span>
              <p className="field-note">{t('book.motorcycleNote')}</p>
            </div>
          ) : (
            <div className="field-block">
              <span className="field-label">{t('book.numPassengers')}</span>
              <select
                className="input-field"
                value={formData.passengerCount}
                onChange={(event) => handleInput('passengerCount', event.target.value)}
              >
                {passengerCountOptionsFor(formData.vehicleType).map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </section>
      </div>

      <div className="mobile-booking-flow">
<button
          type="button"
          className="mobile-location-action"
          onClick={handleUseCurrentLocation}
          disabled={isSubmitting}
        >
          <span className="location-icon" aria-hidden="true"></span>
          {t('book.useCurrentLocation')}
        </button>

        <section className="booking-accordion" aria-label={t('book.tripDetails')}>
          <div className={openMobileSection === 'pickup' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'pickup'}
              onClick={() => toggleMobileSection('pickup')}
            >
              <span className="accordion-number">01</span>
              <span className="accordion-titles">
                <strong>{t('book.pickup')}</strong>
                {pickupSummary ? (
                  <small className="accordion-value">{pickupSummary}</small>
                ) : (
                  <small>{t('book.pickupHint')}</small>
                )}
              </span>
              {pickupSummary ? (
                <span className="accordion-check" aria-hidden="true">✓</span>
              ) : null}
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label={t('book.pickup')}
                  value={formData.pickup}
                  placeholder={t('book.pickupPlaceholder')}
                  error={validationErrors.pickup}
                  onChange={(value) => handleInput('pickup', value)}
                />

                {pickupLocation ? (
                  <div className="field-note pickup-detected-note">
                    <span className="pickup-check" aria-hidden="true"></span>
                    <span>{t('book.locationDetected')}</span>
                  </div>
                ) : null}

                {pickupLocationError ? (
                  <p className="form-error-message pickup-location-error">
                    {pickupLocationError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className={openMobileSection === 'destination' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'destination'}
              onClick={() => toggleMobileSection('destination')}
            >
              <span className="accordion-number">02</span>
              <span className="accordion-titles">
                <strong>{t('book.destination')}</strong>
                {destinationSummary ? (
                  <small className="accordion-value">
                    {destinationSummary}
                  </small>
                ) : (
                  <small>{t('book.destinationHint')}</small>
                )}
              </span>
              {destinationSummary ? (
                <span className="accordion-check" aria-hidden="true">✓</span>
              ) : null}
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label={t('book.destination')}
                  value={formData.destination}
                  placeholder={t('book.destinationPlaceholder')}
                  error={validationErrors.destination}
                  onChange={(value) => handleInput('destination', value)}
                />
              </div>
            </div>
          </div>
          <div className={openMobileSection === 'passenger' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'passenger'}
              onClick={() => toggleMobileSection('passenger')}
            >
<span className="accordion-number">03</span>
<span className="accordion-titles">
                <strong>{t('book.passengerDetails')}</strong>
                {formValues.name.trim() ? (
                  <small className="accordion-value">{passengerSummary}</small>
                ) : (
                  <small>{t('book.passengerNameHint')}</small>
                )}
              </span>
              {formValues.name.trim() ? (
                <span className="accordion-check" aria-hidden="true">✓</span>
              ) : null}
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <LocationInput
                  label={t('book.name')}
                  value={formData.name}
                  placeholder={t('book.namePlaceholder')}
                  error={validationErrors.name}
                  onChange={(value) => handleInput('name', value)}
                />
              </div>
            </div>
          </div>

          <div className={openMobileSection === 'preferences' ? 'accordion-row is-open' : 'accordion-row'}>
            <button
              type="button"
              className="accordion-trigger"
              aria-expanded={openMobileSection === 'preferences'}
              onClick={() => toggleMobileSection('preferences')}
            >
<span className="accordion-number">04</span>
<span className="accordion-titles">
                <strong>{t('book.ridePreferences')}</strong>
                {preferencesSummary ? (
                  <small className="accordion-value">{preferencesSummary}</small>
                ) : (
                  <small>{t('book.passengersTypeFare')}</small>
                )}
              </span>
              {preferencesSummary ? (
                <span className="accordion-check" aria-hidden="true">✓</span>
              ) : null}
              <span className="accordion-chevron" aria-hidden="true"></span>
            </button>

            <div className="accordion-panel">
              <div className="accordion-content passenger-fields">
                <div className="field-block">
                  <span className="field-label">{t('book.vehicle')}</span>
                  <select
                    className="input-field"
                    value={formData.vehicleType}
                    onChange={(event) => handleInput('vehicleType', event.target.value)}
                  >
                    {VEHICLE_TYPES.map((vehicle) => (
                      <option key={vehicle} value={vehicle}>
                        {VEHICLE_LABELS[vehicle]}
                      </option>
                    ))}
                  </select>
                </div>

                {formData.vehicleType === 'motorcycle' ? (
                  <div className="field-block">
                    <span className="field-label">{t('book.passengers')}</span>
                    <p className="field-note">{t('book.motorcycleNote')}</p>
                  </div>
                ) : (
                  <div className="field-block">
                    <span className="field-label">{t('book.numPassengers')}</span>
                    <select
                      className="input-field"
                      value={formData.passengerCount}
                      onChange={(event) => handleInput('passengerCount', event.target.value)}
                    >
                      {passengerCountOptionsFor(formData.vehicleType).map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="field-block">
                  <span className="field-label">{t('book.passengerType')}</span>
                  <select
                    className="input-field"
                    value={formData.passengerType}
                    onChange={(event) => handleInput('passengerType', event.target.value)}
                  >
                    {passengerTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
</select>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {renderFarePreview()}

      {submitError ? (
        <p className="form-error-message submit-error">
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        className="primary-action request-ride-action"
        disabled={isSubmitting}
      >
        {isSubmitting ? t('book.requesting') : t('book.requestRide')}
      </button>
    </form>
  )

  const renderSearchingScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge">{t('status.searchBadge')}</span>
        <div className="search-loader" aria-label={t('status.findingDriverAria')} />
      </div>

      <h2>{t('status.searching')}</h2>
      <p>{t('book.lookingDriver')}</p>

<div className="ride-summary compact">
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>{t('summary.passengers')}</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>{t('summary.vehicle')}</dt>
          <dd>{formatVehicleType(ride.vehicle_type ?? formValues.vehicleType)}</dd>
        </div>
        <div>
          <dt>{t('summary.passengerType')}</dt>
          <dd>{formValues.passengerType}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
      </div>

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>{t('book.cancelRide')}</button>
      </div>
    </div>
  )

  const renderNoDriverScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge">{t('status.noDriverBadge')}</span>
        <div className="search-loader" aria-label={t('status.noDriverAria')} />
      </div>

      <h2>{t('book.noDriverTitle')}</h2>
      <p>{t('book.noDriverText')}</p>

      <div className="ride-summary compact">
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>{t('summary.passengers')}</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>{t('summary.vehicle')}</dt>
          <dd>{formatVehicleType(ride.vehicle_type ?? formValues.vehicleType)}</dd>
        </div>
        <div>
          <dt>{t('summary.passengerType')}</dt>
          <dd>{formValues.passengerType}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
      </div>

      {submitError ? (
        <p className="form-error-message" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="action-row">
        <button
          type="button"
          className="primary-action"
          onClick={() => void handleRetryDispatch()}
          disabled={retryingDispatch}
        >
          {retryingDispatch ? t('book.findingDriverAction') : t('book.tryAgain')}
        </button>
        <button
          type="button"
          className="secondary-action cancel-action"
          onClick={() => setShowCancelModal(true)}
          disabled={retryingDispatch}
        >
          {t('book.cancelRide')}
        </button>
      </div>
    </div>
  )

  const renderDriverFoundScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge accent">{t('status.acceptedBadge')}</span>
      </div>

      <div className="driver-identity-row">
        <img src={assignedDriver?.profile_photo_url || bisligLogo} alt={assignedDriver?.full_name ?? 'John Doe'} className="driver-photo" />
        <div>
<h3>{assignedDriver?.full_name ?? 'John Doe'}</h3>
          <p className="driver-rating">
            <span className="rating-stars-inline">
              {renderStars(driverReputation?.averageStars ?? 5)}
            </span>
            {' '}
            {!driverReputation
              ? t('driver.loadingReputation')
              : driverReputation.totalRatings === 0
                ? t('driver.noRatings')
                : t('driver.ratingSummary', {
                    avg: driverReputation.averageStars.toFixed(1),
                    total: driverReputation.totalRatings,
                    countLabel: driverReputation.totalRatings === 1 ? t('driver.ratingWord') : t('driver.ratingsCount'),
                    cancel: formatCancellationRate(driverReputation.cancellationRate),
                  })}
          </p>
          <p className="driver-vehicle">{assignedDriver?.vehicle_type ?? 'Tricycle'}</p>
        </div>
      </div>

      <div className="driver-badge-row">
        <div>
          <span>{t('driver.vehicleLabel')}</span>
          <strong>{assignedDriver?.vehicle_model ?? 'Demo Tricycle'}</strong>
        </div>
        <div>
          <span>{t('driver.plateLabel')}</span>
          <strong>{assignedDriver?.plate_number ?? 'TEST-0001'}</strong>
        </div>
      </div>

      <p className="lead-paragraph">{t('status.accepted')}</p>
      <p className="lead-paragraph">{t('book.onTheWay')}</p>

<div className="ride-summary compact">
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
      </div>

      <div className="ride-map-panel">
        <MapView
          className="ride-map"
          height={230}
          driverLatitude={driverLocation?.latitude}
          driverLongitude={driverLocation?.longitude}
          pickupLatitude={passengerLiveLocation?.latitude ?? ride.pickup_lat}
          pickupLongitude={passengerLiveLocation?.longitude ?? ride.pickup_lng}
        />
        {passengerLocationError ? (
          <p className="passenger-location-note">{passengerLocationError}</p>
        ) : passengerLocationShared ? (
          <p className="passenger-location-note">{t('book.sharingLive')}</p>
        ) : (
          <div className="share-location-panel">
            <span>{t('book.shareTip')}</span>
            <button type="button" className="share-location-button" onClick={handleSharePassengerLocation}>{t('book.shareMyLocation')}</button>
          </div>
        )}
      </div>

      <div className="action-row compact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>{t('book.cancelRide')}</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          {t('book.chat')}
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>
      <p className="lead-paragraph">{t('book.driverUpdatesStatus')}</p>
    </div>
  )

  const renderArrivedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge warning">{t('status.arrivedBadge')}</span>
      </div>

      <div className="driver-identity-row">
        <img src={assignedDriver?.profile_photo_url || bisligLogo} alt={assignedDriver?.full_name ?? 'John Doe'} className="driver-photo" />
        <div>
          <h3>{assignedDriver?.full_name ?? 'John Doe'}</h3>
          <p className="driver-rating">{assignedDriver?.vehicle_type ?? 'Tricycle'}</p>
          <p className="driver-vehicle">{t('summary.plate')}: {assignedDriver?.plate_number ?? 'TEST-0001'}</p>
        </div>
      </div>

      <p className="lead-paragraph">{t('status.arrived')}</p>

<div className="ride-summary compact">
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
      </div>

      <div className="ride-map-panel">
        <MapView
          className="ride-map"
          height={230}
          driverLatitude={driverLocation?.latitude}
          driverLongitude={driverLocation?.longitude}
          pickupLatitude={passengerLiveLocation?.latitude ?? ride.pickup_lat}
          pickupLongitude={passengerLiveLocation?.longitude ?? ride.pickup_lng}
        />
        {passengerLocationError ? (
          <p className="passenger-location-note">{passengerLocationError}</p>
        ) : passengerLocationShared ? (
          <p className="passenger-location-note">{t('book.sharingLive')}</p>
        ) : (
          <div className="share-location-panel">
            <span>{t('book.shareTip')}</span>
            <button type="button" className="share-location-button" onClick={handleSharePassengerLocation}>{t('book.shareMyLocation')}</button>
          </div>
        )}
      </div>

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>{t('book.cancelRide')}</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          {t('book.chat')}
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>
      <p className="lead-paragraph">{t('book.arrivedLead')}</p>
    </div>
  )

  const renderInProgressScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{t('status.inProgressBadge')}</span>
      </div>

      <div className="progress-steps">
        <span className="progress-step complete">{t('status.driverAcceptedStep')}</span>
        <span className="progress-arrow">?</span>
        <span className="progress-step complete">{t('status.arrivedStep')}</span>
        <span className="progress-arrow">?</span>
        <span className="progress-step active">{t('status.inProgressStep')}</span>
        <span className="progress-arrow">?</span>
        <span className="progress-step">{t('status.destinationStep')}</span>
      </div>

      <div className="ride-summary compact">
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
<div>
          <dt>{t('summary.passengers')}</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
        <div>
          <dt>{t('summary.driver')}</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
<div>
          <dt>{t('summary.vehicle')}</dt>
          <dd>{assignedDriver?.vehicle_model ?? 'Demo Tricycle'}</dd>
        </div>
      </div>

      <div className="ride-map-panel">
        <MapView
          className="ride-map"
          height={230}
          driverLatitude={driverLocation?.latitude}
          driverLongitude={driverLocation?.longitude}
          pickupLatitude={passengerLiveLocation?.latitude ?? ride.pickup_lat}
          pickupLongitude={passengerLiveLocation?.longitude ?? ride.pickup_lng}
        />
        {passengerLocationError ? (
          <p className="passenger-location-note">{passengerLocationError}</p>
        ) : passengerLocationShared ? (
          <p className="passenger-location-note">{t('book.sharingLive')}</p>
        ) : (
          <div className="share-location-panel">
            <span>{t('book.shareTip')}</span>
            <button type="button" className="share-location-button" onClick={handleSharePassengerLocation}>{t('book.shareMyLocation')}</button>
          </div>
        )}
      </div>

      <div className="action-row">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>{t('book.cancelRide')}</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          {t('book.chat')}
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>
      <p className="lead-paragraph">{t('book.inProgressLead')}</p>
    </div>
  )

  const renderCancelledScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge">{t('status.cancelledBadge')}</span>
      </div>

      <h2>{t('status.cancelled')}</h2>
      <p>
        {cancellation?.cancelled_by_role === 'driver'
          ? t('status.byDriver')
          : t('status.byYou')}
      </p>

      <div className="ride-summary compact">
        <div>
          <dt>{t('summary.reason')}</dt>
          <dd>{cancellation?.reason ?? t('status.noReason')}</dd>
        </div>
        <div>
          <dt>{t('summary.pickup')}</dt>
          <dd>{ride.pickup_address}</dd>
        </div>
        <div>
          <dt>{t('summary.destination')}</dt>
          <dd>{ride.destination_address}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToHome}>
        {t('form.backHome')}
      </button>
    </div>
  )

  const renderCompletedScreen = () => (
    <div className="demo-state-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{t('status.completedBadge')}</span>
      </div>

      <h2>{t('status.completed')}</h2>
      <p>{t('book.thanks')}</p>

      <div className="ride-summary compact">
        <div>
          <dt>{t('summary.driver')}</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
        <div>
          <dt>{t('summary.route')}</dt>
          <dd>{ride.pickup_address} ? {ride.destination_address}</dd>
        </div>
        <div>
          <dt>{t('summary.passengers')}</dt>
          <dd>{formatPassengerCount(ride.passenger_count ?? formValues.passengerCount)}</dd>
        </div>
<div>
          <dt>{t('summary.vehicle')}</dt>
          <dd>{formatVehicleType(ride.vehicle_type ?? formValues.vehicleType)}</dd>
        </div>
        <div>
          <dt>{t('summary.passengerType')}</dt>
          <dd>{formValues.passengerType}</dd>
        </div>
        <div>
          <dt>{t('summary.fare')}</dt>
          <dd>{rideFareDisplay(ride).value}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={() => setPhase('payment')}>
        {t('book.continueToPayment')}
      </button>
    </div>
  )

  const renderRatingScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{t('status.completedBadge')}</span>
      </div>

      {!ratingSubmitted ? (
        <>
          <h2>{t('rating.howWasRide')}</h2>
          <p className="lead-paragraph">
            {t('rating.rateExperience', { name: assignedDriver?.full_name ?? t('book.yourDriver') })}
          </p>

          <div
            className="rating-stars"
            role="radiogroup"
            aria-label={t('rating.aria')}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={star <= rating ? 'rating-star selected' : 'rating-star'}
onClick={() => setRating(star)}
                aria-label={`${star} ${star > 1 ? t('rating.starWords') : t('rating.starWord')}`}
                aria-checked={star === rating}
                role="radio"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill={star <= rating ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
              </button>
            ))}
          </div>

          <label className="field-label" htmlFor="rating-comment">
            {t('rating.comment')} <span>{t('rating.optional')}</span>
          </label>

          <textarea
            id="rating-comment"
            className="text-input"
            value={ratingComment}
            onChange={(event) => setRatingComment(event.target.value)}
            placeholder={t('rating.placeholder')}
            rows={4}
            maxLength={500}
          />

{ratingError ? (
            <p className="form-error-message" role="alert">
              {ratingError}
            </p>
          ) : null}

          <button
            type="button"
            className="primary-action"
            onClick={() => void handleSubmitRating()}
            disabled={rating === 0 || isSubmittingRating}
          >
            {isSubmittingRating ? t('rating.submitting') : t('rating.submit')}
          </button>

          <button type="button" className="secondary-action" onClick={handleBackToHome}>
            {t('form.backHome')}
          </button>
        </>
      ) : (
        <>
          <h2>{t('rating.thankYou')}</h2>
          <p className="lead-paragraph">
            {t('rating.feedback')}
          </p>

          <div className="ride-summary compact">
            <div>
<dt>{t('summary.yourRating')}</dt>
              <dd className="rating-summary-stars">
                {[1, 2, 3, 4, 5].map((value) => (
                  <svg
                    key={value}
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill={value <= rating ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                ))}
              </dd>
            </div>
            <div>
              <dt>{t('summary.driver')}</dt>
              <dd>{assignedDriver?.full_name ?? t('book.yourDriver')}</dd>
            </div>
          </div>

          <button
            type="button"
            className="primary-action"
            onClick={handleBackToHome}
          >
            {t('form.backHome')}
          </button>
        </>
      )}
    </div>
  )
  const renderPaymentScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge">{t('status.paymentBadge')}</span>
      </div>

      <h2>{t('payment.payment')}</h2>

      <div className="payment-options" role="radiogroup" aria-label={t('payment.aria')}>
        {['Cash', 'GCash'].map((method) => (
          <button
            key={method}
            type="button"
            className={paymentMethod === method ? 'payment-option selected' : 'payment-option'}
            onClick={() => setPaymentMethod(method as PaymentMethod)}
          >
            <span className="payment-radio" aria-hidden="true" />
            {method === 'Cash' ? t('payment.methodCash') : t('payment.methodGcash')}
          </button>
        ))}
      </div>

      <div className="payment-note">
        <p>
          {paymentMethod === 'Cash'
            ? t('payment.cashNote')
            : t('payment.gcashNote')}
        </p>
      </div>

<div className="fare-box">
        <span className="field-label">{rideFareDisplay(ride).label}</span>
        <strong>{rideFareDisplay(ride).value}</strong>
        {typeof ride.fare_cents === 'number' && Number.isFinite(ride.fare_cents) ? (
          <small>
            {t('book.fareMatrix', { level: DEFAULT_FARE_LEVEL })}
          </small>
        ) : null}
      </div>

      <button type="button" className="primary-action" onClick={() => setPhase('rating')}>
        {t('payment.confirm')}
      </button>
    </div>
  )

  const renderPaymentConfirmedScreen = () => (
    <div className="demo-state-card payment-card">
      <div className="status-stack">
        <span className="demo-status-badge success">{t('status.paymentRecordedBadge')}</span>
      </div>

      <h2>{t('payment.recorded')}</h2>

      <div className="ride-summary compact">
        <div>
          <dt>{t('summary.paymentMethod')}</dt>
          <dd>{paymentMethod === 'Cash' ? t('payment.methodCash') : t('payment.methodGcash')}</dd>
        </div>
        <div>
          <dt>{t('summary.ride')}</dt>
          <dd>{t('summary.completed')}</dd>
        </div>
        <div>
          <dt>{t('summary.driver')}</dt>
          <dd>{assignedDriver?.full_name ?? 'John Doe'}</dd>
        </div>
      </div>

      <button type="button" className="primary-action" onClick={handleBackToHome}>
        {t('form.backHome')}
      </button>
    </div>
  )

  return (
    <div className="app-wrapper">
<AppHeader
        view={currentView}
        onViewChange={onSwitchView}
        primaryLabel={showProfile ? t('nav.bookRide') : t('nav.myRides')}
        primaryBrief={
          ride.pickup_address && ride.destination_address
            ? `${ride.pickup_address} → ${ride.destination_address}`
            : undefined
        }
        onPrimaryAction={() => setShowProfile((current) => !current)}
      />

      <main className={showRideLauncher ? 'customer-layout service-launcher-layout' : openMobileSection === 'pickup' ? 'customer-layout pickup-open' : 'customer-layout'}>
        {showRideLauncher ? (
          <ServiceDashboard onSelectRideNow={handleRideNowCtaClick} />
        ) : (
        <>
        <section className="primary-panel">
          <div className="section-header">
            <p className="eyebrow">{t('book.eyebrow')}</p>
            <h1>{t('book.heroWhere1')} <span className="hero-accent">{t('book.heroWhere2')}</span></h1>
            <p className="subtitle">{t('book.subtitle')}</p>
          </div>

          {!showProfile && showCustomerForm ? <PassengerUpcoming /> : null}

          {!showProfile && showCustomerForm ? (
            <div className="booking-mode-picker" role="group" aria-label={t('book.chooseService')}>
              <button
                type="button"
                className="booking-mode-card is-active"
                onClick={handleRideNowCtaClick}
              >
                <span className="booking-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
                </span>
                <span className="booking-mode-copy">
                  <strong>{t('dash.rideNow')}</strong>
                  <small>{t('book.rideNowSmall')}</small>
                </span>
                <span className="booking-mode-check" aria-hidden="true"></span>
              </button>

              <a className="booking-mode-card" href="/pakyawan">
                <span className="booking-mode-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 18h.01" /><path d="M12 18h.01" /><path d="M16 18h.01" /></svg>
                </span>
                <span className="booking-mode-copy">
                  <strong>{t('nav.bookPakyawan')}</strong>
                  <small>{t('book.pakyawanSmall')}</small>
                </span>
                <span className="booking-mode-arrow" aria-hidden="true">→</span>
              </a>
            </div>
          ) : null}

          {showProfile ? (
            <CustomerProfile />
          ) : showCustomerForm ? (
            renderRequestScreen()
          ) : showDemoRideState ? (
            phase === 'searching' ? (
              renderSearchingScreen()
            ) : phase === 'no_driver' ? (
              renderNoDriverScreen()
            ) : phase === 'accepted' ? (
              renderDriverFoundScreen()
            ) : phase === 'arrived' ? (
              renderArrivedScreen()
            ) : phase === 'in_progress' ? (
              renderInProgressScreen()
) : phase === 'completed' ? (
              renderCompletedScreen()
            ) : phase === 'cancelled' ? (
              renderCancelledScreen()
            ) : phase === 'rating' ? (
              renderRatingScreen()
            ) : phase === 'payment' ? (
              renderPaymentScreen()
            ) : (
              renderPaymentConfirmedScreen()
            )
          ) : null}
</section>        {showChat && ride.id && assignedDriver && (
          <RideChat
            rideId={ride.id}
            otherPartyName={assignedDriver.full_name ?? 'John Doe'}
            currentRole="Rider"
            onClose={() => setShowChat(false)}
          />
        )}
        {showCancelModal && ride.id && (
          <CancelRideModal
            open={showCancelModal}
            role="customer"
            submitting={cancelSubmitting}
            error={cancelError}
            onClose={() => {
              setShowCancelModal(false)
              setCancelError('')
            }}
            onConfirm={(reason) => void handleConfirmCancellation(reason)}
          />
        )}
        <aside className="map-panel" aria-label={t('map.aria')}>
          <div className="map-stage">
            <MapView
              className="map-view"
              driverLatitude={driverLocation?.latitude}
              driverLongitude={driverLocation?.longitude}
              pickupLatitude={pickupLocation?.latitude}
              pickupLongitude={pickupLocation?.longitude}
            />

            <button
              type="button"
              className="map-location-action"
              onClick={handleUseCurrentLocation}
              disabled={isSubmitting}
            >
              <span className="location-icon" aria-hidden="true"></span>
              {t('book.useCurrentLocation')}
            </button>
          </div>

          <div className="map-location-status">
            {pickupLocation ? (
              <p className="field-note map-location-confirmed">
                <span className="pickup-check" aria-hidden="true"></span>
                {t('book.locationDetected')}
              </p>
            ) : null}

            {pickupLocationError ? (
              <p className="form-error-message">
                {pickupLocationError}
              </p>
            ) : null}
          </div>

          <WeatherWidget />
        </aside>
        </>
        )}
      </main>

      {chatToast ? (
        <div className="chat-notification-toast" role="status" aria-live="polite">
          <div className="chat-notification-copy">
            <strong>{chatToast.from}</strong>
            <span>{chatToast.preview}</span>
          </div>
          <button type="button" className="chat-notification-view" onClick={handleOpenChat}>
            {t('book.view')}
          </button>
        </div>
      ) : null}

      <MobileBottomNav activeTab={bottomNavTab} onTabChange={handleBottomNavChange} />
      <AnnouncementTicker variant="fixed" />

    </div>
  )
}



