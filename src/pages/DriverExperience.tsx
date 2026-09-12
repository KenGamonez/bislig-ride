import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { CancelRideModal } from '../components/CancelRideModal'
import { MapView } from '../components/MapView'
import { RideChat } from '../components/RideChat'
import { supabase } from '../lib/supabase'
import { demoDriver } from '../lib/demoDriver'
import { changeDriverPassword } from '../lib/driverAuth'
import { PASSWORD_HELP_TEXT, validatePasswordStrength } from '../lib/driverAccounts'
import { formatCentavos, MULTIPLE_DESTINATIONS_FARE_NOTE } from '../lib/fare'
import { fetchLatestRideCancellation, subscribeToRideCancellations } from '../lib/rideCancellations'
import { fetchDriverReputation, fetchReputationFor, formatCancellationRate, type ReputationSummary } from '../lib/reputation'
import { acceptPakyawanBooking, fetchAvailablePakyawanBookings } from '../lib/scheduledBookings'
import {
  notificationPermission,
  playRequestChime,
  playChatNotification,
  requestNotificationPermission,
  showBrowserNotification,
} from '../lib/notifications'
import { subscribeToPassengerLocation } from '../lib/passengerLocations'
import { updateDriverLocation } from '../lib/driverLocations'
import {
  acceptRideOffer,
  declineRideOffer,
  fetchPendingOffer,
  setDriverPresence,
  subscribeToDriverOffers,
} from '../lib/dispatch'
import {
  driverLocationStatus,
  hasGeolocation,
  persistOfflineBestEffort,
  requestFirstFix,
  startDriverLocationTracking,
} from '../lib/driverPresence'
import {
  cancelRide,
  fetchAssignedRidesForDriver,
  fetchRideById,
  hasRatedRide,
  submitPassengerRating,
  updateRideStatus,
} from '../lib/rides'
import type { Ride, RideCancellation } from '../types/ride'
import type { PendingOffer } from '../types/dispatch'
import type { PakyawanBooking } from '../types/scheduledBooking'

const TEST_DRIVER_ID = '6b239660-14ae-4fea-82c0-905420260077'

type DriverPhase = 'offline' | 'online' | 'incoming_request' | 'heading_to_pickup' | 'arrived' | 'in_progress' | 'completed'

type DriverSummaryProfile = {
  name: string
  profilePhoto: string | null
  rating: number
  vehicleType: string
  vehicleModel: string
  plateNumber: string
  email: string | null
  username: string | null
}

type DriverNotificationItem = {
  id: string
  kind: 'ride' | 'pakyawan'
  title: string
  subtitle: string
  rideId: string | null
  seen: boolean
  createdAt: number
}

const recentRides = [
  {
    id: 101,
    passenger: 'Ana Ramos',
    pickup: 'Barangay Tabon',
    destination: 'Bislig City Public Market',
    date: 'Today Ã¢â‚¬Â¢ 8:20 AM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±115',
  },
  {
    id: 102,
    passenger: 'Chris Lim',
    pickup: 'Mangagoy',
    destination: 'Alabel Road',
    date: 'Today Ã¢â‚¬Â¢ 7:05 AM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±140',
  },
  {
    id: 103,
    passenger: 'Nina Flores',
    pickup: 'Barangay San Roque',
    destination: 'Bislig City Plaza',
    date: 'Yesterday Ã¢â‚¬Â¢ 9:10 PM',
    status: 'completed',
    fare: 'Ã¢â€šÂ±130',
  },
]

const renderStarRating = (average: number) => (
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

const fareDisplayFor = (ride: Ride | null): string => {
  if (!ride) {
    return '—'
  }

  if (ride.destination_mode === 'multiple') {
    return MULTIPLE_DESTINATIONS_FARE_NOTE
  }

  if (typeof ride.fare_cents === 'number' && Number.isFinite(ride.fare_cents)) {
    return `₱${formatCentavos(ride.fare_cents)}`
  }

  return 'Fare handled traditionally with the driver.'
}

const renderRideStops = (ride: Ride | null) => {
  if (
    !ride ||
    ride.destination_mode !== 'multiple' ||
    !Array.isArray(ride.destination_stops) ||
    ride.destination_stops.length === 0
  ) {
    return null
  }

  return (
    <div className="ride-stops">
      <p className="section-label">DROP-OFFS</p>
      <ol className="ride-stops-list">
        {ride.destination_stops.map((stop, index) => (
          <li key={index}>{stop}</li>
        ))}
      </ol>
    </div>
  )
}

export function DriverExperience({
  onBack,
  view,
  onViewChange,
}: {
  onBack?: () => void
  view: 'Rider' | 'driver' | 'admin'
  onViewChange: (view: 'Rider' | 'driver' | 'admin') => void
}) {
  const [driverOnline, setDriverOnline] = useState(false)
  const [phase, setPhase] = useState<DriverPhase>('offline')
  const [request, setRequest] = useState<Ride | null>(null)
  const [activeRide, setActiveRide] = useState<Ride | null>(null)
  const [transitioning, setTransitioning] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [driverId, setDriverId] = useState(TEST_DRIVER_ID)
  const [driverAuthId, setDriverAuthId] = useState<string | null>(null)
  const [driverProfile, setDriverProfile] = useState<DriverSummaryProfile | null>(null)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswordFields, setShowPasswordFields] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pendingOffer, setPendingOffer] = useState<PendingOffer | null>(null)
  const [driverIsAvailable, setDriverIsAvailable] = useState(true)
  const [driverAutoAccept, setDriverAutoAccept] = useState(false)
  const [presenceError, setPresenceError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [lastLocationFixIso, setLastLocationFixIso] = useState<string | null>(null)
  const [, setLocationTick] = useState(0)
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(0)

  const locationStatus = !driverOnline ? 'lost' : driverLocationStatus(lastLocationFixIso)

  const offerExpired = phase === 'incoming_request' && Boolean(pendingOffer) && offerSecondsLeft === 0
  const stopTrackingRef = useRef<(() => void) | null>(null)
  const handledOfferIdsRef = useRef<Set<string>>(new Set())
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [cancellationNotice, setCancellationNotice] = useState<RideCancellation | null>(null)
  const [passengerRating, setPassengerRating] = useState(0)
  const [passengerRatingComment, setPassengerRatingComment] = useState('')
  const [passengerRatingSubmitted, setPassengerRatingSubmitted] = useState(false)
  const [isSubmittingPassengerRating, setIsSubmittingPassengerRating] = useState(false)
  const [reputation, setReputation] = useState<ReputationSummary | null>(null)
  const [passengerReputation, setPassengerReputation] = useState<ReputationSummary | null>(null)
  const [passengerRatingError, setPassengerRatingError] = useState('')
  const lastActiveRideIdRef = useRef<string | null>(null)
  const completedRideIdRef = useRef<string | null>(null)
  const phaseRef = useRef<DriverPhase>('offline')
  const activeRideRef = useRef<Ride | null>(null)
  const [notifications, setNotifications] = useState<DriverNotificationItem[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [canAcceptPakyawan, setCanAcceptPakyawan] = useState(false)
  const [pakyawanRequests, setPakyawanRequests] = useState<PakyawanBooking[]>([])
  const [acceptedPakyawan, setAcceptedPakyawan] = useState<PakyawanBooking[]>([])
  const [pakyawanSubmittingId, setPakyawanSubmittingId] = useState<string | null>(null)
  const [pakyawanError, setPakyawanError] = useState('')
  const [notificationPermissionState, setNotificationPermissionState] = useState<NotificationPermission>(() => notificationPermission())
  const [showStatusHint, setShowStatusHint] = useState(false)
  const [driverStatusBlocked, setDriverStatusBlocked] = useState(false)
  const statusHintTimerRef = useRef<number | null>(null)
  const [passengerLocation, setPassengerLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [chatToast, setChatToast] = useState<{ id: string; from: string; preview: string } | null>(null)
  const showChatRef = useRef(false)
  const handledChatMessageIdsRef = useRef<Set<string>>(new Set())
  const chatToastTimerRef = useRef<number | null>(null)

  const revealStatusHint = () => {
    if (statusHintTimerRef.current !== null) {
      window.clearTimeout(statusHintTimerRef.current)
    }
    setShowStatusHint(true)
    statusHintTimerRef.current = window.setTimeout(() => {
      setShowStatusHint(false)
      statusHintTimerRef.current = null
    }, 4000)
  }

  const hideStatusHint = () => {
    if (statusHintTimerRef.current !== null) {
      window.clearTimeout(statusHintTimerRef.current)
      statusHintTimerRef.current = null
    }
    setShowStatusHint(false)
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

  useEffect(() => {
    return () => {
      if (statusHintTimerRef.current !== null) {
        window.clearTimeout(statusHintTimerRef.current)
      }
    }
  }, [])
  useEffect(() => {
    let mounted = true

    const loadDriverIdentity = async () => {
      const { data, error } = await supabase.auth.getSession()

      if (error || !data.session?.user) {
        console.error('Unable to load driver session:', error)
        return
      }

      const authUserId = data.session.user.id

const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .select('id, status, auth_user_id, full_name, email, username, vehicle_type, vehicle_model, plate_number, profile_photo_url, rating_average, total_ratings, can_accept_pakyawan')
        .eq('auth_user_id', authUserId)
        .maybeSingle()

      if (driverError || !driver) {
        console.error('Unable to find driver profile for authenticated user:', driverError)
        return
      }

      if (driver.status === 'inactive') {
        if (mounted) {
          setDriverProfile(null)
          setDriverStatusBlocked(true)
        }
        return
      }

      if (mounted) {
        setDriverStatusBlocked(false)
        setDriverId(driver.id)
        setDriverAuthId(authUserId)
        setCanAcceptPakyawan(Boolean(driver.can_accept_pakyawan))
        setDriverProfile({
          name: driver.full_name,
          profilePhoto: driver.profile_photo_url,
          rating: Number(driver.rating_average ?? 5),
          vehicleType: driver.vehicle_type ?? demoDriver.vehicleType,
          vehicleModel: driver.vehicle_model ?? demoDriver.vehicleModel,
          plateNumber: driver.plate_number ?? demoDriver.plateNumber,
          email: driver.email,
          username: driver.username,
        })
      }
    }

    void loadDriverIdentity()

const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setDriverStatusBlocked(false)
        setDriverAuthId(null)
        setDriverId(TEST_DRIVER_ID)
        setDriverProfile(null)
        return
      }

      void loadDriverIdentity()
    })

return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const loadReputation = async () => {
      const summary = await fetchDriverReputation(driverId)

      if (mounted) {
        setReputation(summary)
      }
    }

    void loadReputation()

return () => {
      mounted = false
    }
  }, [driverId])

  useEffect(() => {
    const targetCustomerId = request?.customer_auth_id ?? activeRide?.customer_auth_id ?? null

    if (!targetCustomerId) {
      return
    }

    let mounted = true

    const loadPassengerReputation = async () => {
      const summary = await fetchReputationFor(targetCustomerId, false)

      if (mounted) {
        setPassengerReputation(summary)
      }
    }

    void loadPassengerReputation()

    return () => {
      mounted = false
    }
  }, [request?.customer_auth_id, activeRide?.customer_auth_id])

useEffect(() => {
    if (!driverOnline) {
      return
    }

    const timer = window.setInterval(() => {
      setLocationTick((tick) => tick + 1)
    }, 10000)

    return () => {
      window.clearInterval(timer)
    }
  }, [driverOnline])

  useEffect(() => {
    const onPageHide = () => {
      if (driverOnline) {
        persistOfflineBestEffort()
      }
    }

    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [driverOnline])

  useEffect(() => {
    let mounted = true

    const refreshRides = async () => {
      try {
        if (!driverOnline) {
          setActiveRide(null)
          setPendingOffer(null)
          setRequest(null)
          setPhase('offline')
          return
        }

        const [assignedRides, pendingOfferResult] = await Promise.all([
          fetchAssignedRidesForDriver(driverId),
          fetchPendingOffer(driverId),
        ])

        const activeAssignedRide = assignedRides[0] ?? null
        const previousActiveRideId = lastActiveRideIdRef.current

        if (activeAssignedRide) {
          lastActiveRideIdRef.current = activeAssignedRide.id
          setActiveRide(activeAssignedRide)
          setPendingOffer(null)
          setRequest(null)

          if (activeAssignedRide.status === 'accepted') {
            setPhase('heading_to_pickup')
          } else if (activeAssignedRide.status === 'arrived') {
            setPhase('arrived')
          } else if (activeAssignedRide.status === 'in_progress') {
            setPhase('in_progress')
          }
          return
        }

        setActiveRide(null)

        if (previousActiveRideId) {
          try {
            const previous = await fetchRideById(previousActiveRideId)

            if (mounted && previous) {
              if (previous.status === 'cancelled') {
                const latestCancellation = await fetchLatestRideCancellation(previous.id)

                if (mounted && latestCancellation) {
                  setCancellationNotice(latestCancellation)
                }
              } else if (previous.status === 'completed' && completedRideIdRef.current === previous.id) {
                lastActiveRideIdRef.current = previous.id
                setActiveRide(previous)
                setPhase('completed')
                return
              }
            }
          } catch (error) {
            console.error('Unable to check previously active ride:', error)
          }
        }

        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null

        if (pendingOfferResult) {
          handledOfferIdsRef.current.add(pendingOfferResult.offer.id)
          setPendingOffer((current) =>
            current?.offer.id === pendingOfferResult.offer.id ? current : pendingOfferResult,
          )
          setRequest(pendingOfferResult.ride)
          setPhase('incoming_request')
        } else {
          setPendingOffer(null)
          setRequest(null)
          setPhase('online')
        }
      } catch (error) {
        console.error('Unable to load driver ride state:', error)
      }
    }

    void refreshRides()
    const timer = window.setInterval(() => {
      void refreshRides()
    }, 5000)

    return () => {
      mounted = false
      window.clearInterval(timer)
    }
  }, [driverOnline, driverId])

useEffect(() => {
    if (!activeRide?.id || !driverAuthId) {
      return
    }

    const channel = supabase
      .channel(`driver-ride-chat-${activeRide.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ride_messages',
          filter: `ride_id=eq.${activeRide.id}`,
        },
        (payload) => {
          const incoming = payload.new as {
            id?: string
            ride_id?: string
            sender_role?: string
            message?: string
          }

          if (
            incoming.ride_id !== activeRide.id ||
            incoming.sender_role !== 'Rider' ||
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
            from: activeRide.customer_name,
            preview: incoming.message ?? 'New message',
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
  }, [activeRide?.id, driverAuthId, activeRide?.customer_name])

  useEffect(() => {
    showChatRef.current = showChat
  }, [showChat])

  useEffect(() => {
    const activePhases: DriverPhase[] = ['heading_to_pickup', 'arrived', 'in_progress']

    if (!activeRide?.id || !activePhases.includes(phase)) {
      return
    }

    return subscribeToPassengerLocation(activeRide.id, (location) => {
      setPassengerLocation({ latitude: location.latitude, longitude: location.longitude })
    })
  }, [activeRide?.id, phase])

  useEffect(() => {
    if (!activeRide?.id) {
      return
    }

    const unsubscribe = subscribeToRideCancellations(activeRide.id, (incoming) => {
      if (incoming.cancelled_by_role !== 'customer') {
        return
      }

      completedRideIdRef.current = null
      lastActiveRideIdRef.current = null
      setCancellationNotice(incoming)
      setActiveRide(null)
      setRequest(null)
      setPhase(driverOnline ? 'online' : 'offline')
    })

return unsubscribe
  }, [activeRide?.id, driverOnline])

  useEffect(() => {
    phaseRef.current = phase
    activeRideRef.current = activeRide
  }, [phase, activeRide])

  useEffect(() => {
    if (!driverAuthId || !driverOnline) {
      return
    }

    const unsubscribe = subscribeToDriverOffers(driverId, (pending) => {
      if (handledOfferIdsRef.current.has(pending.offer.id)) {
        return
      }

      handledOfferIdsRef.current.add(pending.offer.id)
      setRequestError('')
      setPendingOffer((current) => (current?.offer.id === pending.offer.id ? current : pending))
      setRequest(pending.ride)

      const pickupAddress = pending.ride.pickup_address ?? 'Pickup'
      const destinationAddress = pending.ride.destination_address ?? 'Destination'

      setNotifications((current) => [
        {
          id: `offer-${pending.offer.id}`,
          kind: 'ride',
          rideId: pending.ride.id,
          title: 'New ride offer',
          subtitle: `${pickupAddress} → ${destinationAddress}`,
          seen: false,
          createdAt: Date.now(),
        },
        ...current,
      ])

      if (driverOnline) {
        playRequestChime()
        showBrowserNotification('New ride offer', `${pickupAddress} → ${destinationAddress}`)
      }

      if (!activeRideRef.current && phaseRef.current !== 'incoming_request') {
        setPhase('incoming_request')
      }
    })

    return () => {
      unsubscribe()
    }
  }, [driverAuthId, driverId, driverOnline])

  useEffect(() => {
    if (phase !== 'incoming_request' || !pendingOffer) {
      return
    }

    const timer = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(pendingOffer.offer.expires_at).getTime() - Date.now()) / 1000),
      )

      setOfferSecondsLeft(remaining)
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [phase, pendingOffer])

  useEffect(() => {
    return () => {
      stopTrackingRef.current?.()
    }
  }, [])

  useEffect(() => {
    if (!driverAuthId || !canAcceptPakyawan) {
      return
    }

    let mounted = true

    const loadRequests = async () => {
      try {
        const items = await fetchAvailablePakyawanBookings()
        if (mounted) {
          setPakyawanRequests(items)
        }
      } catch (error) {
        console.error('Unable to load pakyawan requests:', error)
        if (mounted) {
          setPakyawanError('Unable to load Pakyawan requests right now.')
        }
      }
    }

    void loadRequests()

    const channel = supabase
      .channel('driver-pakyawan-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pakyawan_bookings',
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<PakyawanBooking>

          if (!incoming.id) {
            return
          }

          setPakyawanRequests((current) =>
            current.some((booking) => booking.id === incoming.id)
              ? current
              : [incoming as PakyawanBooking, ...current],
          )

          const subtitle = `${incoming.pickup_location ?? 'Pickup'} → ${incoming.destination ?? 'Destination'}`

          setNotifications((current) => [
            {
              id: `pakyawan-${incoming.id}`,
              kind: 'pakyawan',
              rideId: null,
              title: 'New Pakyawan request',
              subtitle,
              seen: false,
              createdAt: Date.now(),
            },
            ...current,
          ])

          if (driverOnline) {
            playRequestChime()
            showBrowserNotification('New Pakyawan request', subtitle)
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [driverAuthId, canAcceptPakyawan, driverOnline])

const handleToggleOnline = async () => {
    if (transitioning) {
      return
    }

    setTransitioning(true)
    setPresenceError('')

    try {
      if (!driverOnline) {
        if (!hasGeolocation()) {
          setPresenceError(
            'Location services are required to go online. Enable precise location for this browser and try again.',
          )
          return
        }

        const fix = await requestFirstFix()
        setDriverLocation({ latitude: fix.latitude, longitude: fix.longitude })
        setLastLocationFixIso(new Date().toISOString())

        // Publish the first fix BEFORE enabling presence: set_driver_presence
        // requires an existing driver_locations row with a fresh position, so a
        // brand-new driver (or one with a stale row) must have a live fix on
        // record before the dispatch engine can consider them eligible.
        await updateDriverLocation(driverId, fix.latitude, fix.longitude)

        const presence = await setDriverPresence(true, driverIsAvailable, driverAutoAccept)
        setDriverIsAvailable(presence.is_available)
        setDriverAutoAccept(presence.auto_accept)

        stopTrackingRef.current = startDriverLocationTracking(driverId, {
          onPosition: (position) => {
            setDriverLocation(position)
            setLastLocationFixIso(new Date().toISOString())
          },
        })

        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null
        setRequest(null)
        setPendingOffer(null)
        setActiveRide(null)
        setDriverOnline(true)
        setPhase('online')
      } else {
        await setDriverPresence(false, false, driverAutoAccept)
        stopTrackingRef.current?.()
        stopTrackingRef.current = null
        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null
        setRequest(null)
        setPendingOffer(null)
        setActiveRide(null)
        setDriverOnline(false)
        setPhase('offline')
      }
    } catch (error) {
      console.error('Unable to toggle driver presence:', error)
      setPresenceError(
        driverOnline
          ? 'Unable to go offline right now. Please try again.'
          : 'Unable to go online right now. Check your connection and GPS, then try again.',
      )
    } finally {
      setTransitioning(false)
    }
  }

  const handleToggleAvailability = async (nextAvailable: boolean) => {
    if (!driverOnline || transitioning) {
      return
    }

    setTransitioning(true)
    setPresenceError('')

    try {
      const presence = await setDriverPresence(true, nextAvailable, driverAutoAccept)
      setDriverIsAvailable(presence.is_available)
    } catch (error) {
      console.error('Unable to update availability:', error)
      setPresenceError('Unable to update your availability right now. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  const handleToggleAutoAccept = async (nextAutoAccept: boolean) => {
    if (!driverOnline || transitioning) {
      return
    }

    setTransitioning(true)
    setPresenceError('')

    try {
      const presence = await setDriverPresence(true, driverIsAvailable, nextAutoAccept)
      setDriverAutoAccept(presence.auto_accept)
    } catch (error) {
      console.error('Unable to update auto-accept:', error)
      setPresenceError('Unable to update auto-accept right now. Please try again.')
    } finally {
      setTransitioning(false)
    }
  }

  const handleDecline = async () => {
    if (!request || !pendingOffer || transitioning) {
      return
    }

    setTransitioning(true)
    setRequestError('')

    try {
      await declineRideOffer(request.id, driverId)
      setPendingOffer(null)
      setRequest(null)
      setPhase('online')
    } catch (error) {
      console.error('Unable to decline ride offer:', error)
      setRequestError(
        error instanceof Error ? error.message : 'Unable to decline this ride right now.',
      )
    } finally {
      setTransitioning(false)
    }
  }

  const handleAcceptRide = async () => {
    if (!request || !pendingOffer || transitioning) {
      return
    }

    setTransitioning(true)
    setRequestError('')

    try {
      const acceptedRide = await acceptRideOffer(request.id, driverId)
      handledOfferIdsRef.current.add(pendingOffer.offer.id)
      setPendingOffer(null)
      setActiveRide(acceptedRide)
      setRequest(null)
      setPhase('heading_to_pickup')
    } catch (error) {
      console.error('Unable to accept ride offer:', error)
      const message = error instanceof Error ? error.message : 'Unable to accept this ride.'
      const terminals = ['no longer available', 'no longer eligible']
      const isTerminal = terminals.some((part) => message.toLowerCase().includes(part))

      if (isTerminal) {
        setPendingOffer(null)
        setRequest(null)
        setPhase('online')
      } else {
        setRequestError(message)
      }
    } finally {
      setTransitioning(false)
    }
  }

  const handleArrived = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'arrived')
      setActiveRide(updatedRide)
      setPhase('arrived')
    } catch (error) {
      console.error('Unable to update ride to arrived:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleStartRide = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'in_progress')
      setActiveRide(updatedRide)
      setPhase('in_progress')
    } catch (error) {
      console.error('Unable to update ride to in_progress:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleCompleteRide = async () => {
    if (!activeRide || transitioning) {
      return
    }

    setTransitioning(true)

    try {
      const updatedRide = await updateRideStatus(activeRide.id, 'completed')
      completedRideIdRef.current = activeRide.id
      setActiveRide(updatedRide)
      setPhase('completed')
    } catch (error) {
      console.error('Unable to update ride to completed:', error)
    } finally {
      setTransitioning(false)
    }
  }

  const handleBackToDashboard = () => {
    completedRideIdRef.current = null
    lastActiveRideIdRef.current = null
    setRequest(null)
    setActiveRide(null)
    setCancellationNotice(null)
    setPassengerRating(0)
    setPassengerRatingComment('')
    setPassengerRatingSubmitted(false)
    setPassengerRatingError('')
    setPhase(driverOnline ? 'online' : 'offline')
  }

  const handleLogout = async () => {
    if (isLoggingOut) {
      return
    }

    setIsLoggingOut(true)
    setPasswordError('')
    setPasswordSuccess('')
    setShowChangePassword(false)

    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Unable to sign out driver:', error)
    }

    setIsLoggingOut(false)
  }

  const handleChangePasswordSubmit = async () => {
    setPasswordSuccess('')
    setPasswordError('')

    if (!currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }

    const strength = validatePasswordStrength(newPassword)

    if (!strength.ok) {
      setPasswordError(strength.problems[0])
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }

    setChangingPassword(true)

    try {
      await changeDriverPassword(currentPassword, newPassword, driverProfile?.email)
      setPasswordSuccess('Your password has been updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPasswordFields(false)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to update your password. Please try again.'
      setPasswordError(message)
    } finally {
      setChangingPassword(false)
    }
  }

  const handleCloseChangePassword = () => {
    setShowChangePassword(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError('')
    setPasswordSuccess('')
    setShowPasswordFields(false)
  }

  useEffect(() => {
    if (!activeRide?.id || activeRide.status !== 'completed') {
      return
    }

    let mounted = true

    const checkExistingRating = async () => {
      const alreadyRated = await hasRatedRide(activeRide.id, driverId)

      if (mounted) {
        setPassengerRatingSubmitted(alreadyRated)
      }
    }

    void checkExistingRating()

    return () => {
      mounted = false
    }
  }, [activeRide?.id, activeRide?.status, driverId])

  const handleConfirmCancellation = async (reason: string) => {
    if (!activeRide || cancelSubmitting) {
      return
    }

    setCancelError('')
    setCancelSubmitting(true)

    try {
      await cancelRide(activeRide.id, driverId, 'driver', reason)
      completedRideIdRef.current = null
      lastActiveRideIdRef.current = null
      setCancellationNotice(null)
      setShowCancelModal(false)
      setActiveRide(null)
      setRequest(null)
      setPhase(driverOnline ? 'online' : 'offline')
    } catch (error) {
      console.error('Unable to cancel ride:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to cancel this ride right now. Please try again.'

      setCancelError(message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  const handleSubmitPassengerRating = async () => {
    if (!activeRide || passengerRating < 1 || passengerRating > 5 || isSubmittingPassengerRating) {
      return
    }

    setIsSubmittingPassengerRating(true)
    setPassengerRatingError('')

    try {
      const alreadyRated = await hasRatedRide(activeRide.id, driverId)

      if (alreadyRated) {
        setPassengerRatingSubmitted(true)
        return
      }

      await submitPassengerRating(
        activeRide.id,
        driverId,
        passengerRating,
        passengerRatingComment,
      )

      setPassengerRatingSubmitted(true)
    } catch (error) {
      console.error('Unable to rate passenger:', error)

      const message =
        error instanceof Error
          ? error.message
          : 'Unable to submit your rating. Please try again.'

      setPassengerRatingError(message)
    } finally {
      setIsSubmittingPassengerRating(false)
    }
  }

const displayedDriver = driverProfile ?? demoDriver

  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.seen).length,
    [notifications],
  )

  const handleOpenNotifications = () => {
    setShowNotifications((current) => {
      const next = !current

      if (next) {
        setNotifications((items) => items.map((item) => ({ ...item, seen: true })))
      }

      return next
    })
  }

  const handleEnableNotifications = async () => {
    const result = await requestNotificationPermission()
    setNotificationPermissionState(result)
  }

  const handleDismissNotification = (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
  }

  const handleOpenRideRequest = async (id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id))
    setShowNotifications(false)

    try {
      const pending = await fetchPendingOffer(driverId)

      if (pending && !activeRideRef.current) {
        handledOfferIdsRef.current.add(pending.offer.id)
        setRequestError('')
        setPendingOffer(pending)
        setRequest(pending.ride)
        setPhase('incoming_request')
      }
    } catch (error) {
      console.error('Unable to open ride offer:', error)
    }
  }

  const handleAcceptPakyawan = async (bookingId: string) => {
    if (pakyawanSubmittingId) {
      return
    }

    setPakyawanSubmittingId(bookingId)
    setPakyawanError('')

    try {
      const updated = await acceptPakyawanBooking(bookingId, driverId)
      setPakyawanRequests((current) => current.filter((booking) => booking.id !== bookingId))
      setAcceptedPakyawan((current) => [updated, ...current].slice(0, 10))
      setNotifications((current) => current.filter((item) => item.id !== `pakyawan-${bookingId}`))
    } catch (error) {
      console.error('Unable to accept pakyawan request:', error)
      setPakyawanError('This request could not be accepted. It may have been taken by another driver.')
    } finally {
      setPakyawanSubmittingId(null)
    }
  }

  const handleDeclinePakyawan = (bookingId: string) => {
    setPakyawanRequests((current) => current.filter((booking) => booking.id !== bookingId))
    setNotifications((current) => current.filter((item) => item.id !== `pakyawan-${bookingId}`))
  }

  const renderNotificationBell = () => (
    <div className="notification-wrap">
      <button
        type="button"
        className="notification-bell"
        aria-label={
          unreadNotificationCount > 0
            ? `Notifications (${unreadNotificationCount} unread)`
            : 'Notifications'
        }
        aria-expanded={showNotifications}
        onClick={handleOpenNotifications}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadNotificationCount > 0 ? (
          <span className="notification-badge">{unreadNotificationCount}</span>
        ) : null}
      </button>

      {showNotifications ? (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-head">
            <strong>Notifications</strong>
            <span className="notification-count">{notifications.length} total</span>
          </div>

          {notifications.length === 0 ? (
            <p className="notification-empty">No new requests. You are all caught up.</p>
          ) : (
            <ul className="notification-list">
              {notifications.map((item) => (
                <li key={item.id} className={item.seen ? 'notification-item seen' : 'notification-item'}>
                  <div className="notification-copy">
                    <strong>{item.title}</strong>
                    <span>{item.subtitle}</span>
                  </div>
                  <div className="notification-actions">
                    {item.kind === 'ride' ? (
                      <button
                        type="button"
                        className="compact-button notification-action"
                        onClick={() => void handleOpenRideRequest(item.rideId ?? item.id)}
                      >
                        View request
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ghost-button notification-action"
                      onClick={() => handleDismissNotification(item.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {'Notification' in window && notificationPermissionState !== 'granted' ? (
            <button
              type="button"
              className="secondary-action notification-enable"
              onClick={() => void handleEnableNotifications()}
            >
              Enable desktop notifications
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  const renderPakyawanSection = () => {
    if (!canAcceptPakyawan) {
      return (
        <section className="driver-card pakyawan-card pakyawan-disabled">
          <div className="state-heading">
            <div>
              <p className="section-label">PAKYAWAN REQUESTS</p>
              <h3>Pakyawan / scheduled trips</h3>
              <p>
                Pakyawan request handling is not enabled for this account yet. Contact the Bislig Ride
                team to get it switched on.
              </p>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="driver-card pakyawan-card">
        <div className="state-heading">
          <div>
            <p className="section-label">PAKYAWAN REQUESTS</p>
            <h3>Pakyawan / scheduled trips</h3>
            <p>
              {pakyawanRequests.length > 0
                ? 'Customers are requesting private or scheduled handling. Accept a request to take it.'
                : 'No new Pakyawan requests right now.'}
            </p>
          </div>
          <span className="state-badge pakyawan-badge">{pakyawanRequests.length}</span>
        </div>

        {pakyawanError ? <p className="form-error-message">{pakyawanError}</p> : null}

        {pakyawanRequests.length === 0 ? null : (
          <ul className="pakyawan-list">
            {pakyawanRequests.map((booking) => (
              <li key={booking.id} className="pakyawan-item">
                <div className="pakyawan-route">
                  <span>{booking.pickup_location}</span>
                  <strong>→</strong>
                  <span>{booking.destination}</span>
                </div>
                <div className="pakyawan-meta">
                  <span>
                    {booking.booking_date} · {booking.pickup_time}
                  </span>
                  <span>
                    {booking.passengers} passenger{booking.passengers === 1 ? '' : 's'} · {booking.trip_type}
                  </span>
                  {booking.estimated_hours ? (
                    <span>
                      ~{booking.estimated_hours} hr{booking.estimated_hours === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>
                <div className="pakyawan-customer">
                  <span>{booking.customer_name}</span>
                  <span>{booking.customer_phone}</span>
                </div>
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="primary-action compact-button"
                    onClick={() => void handleAcceptPakyawan(booking.id)}
                    disabled={pakyawanSubmittingId === booking.id}
                  >
                    {pakyawanSubmittingId === booking.id ? 'Accepting...' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact-button"
                    onClick={() => handleDeclinePakyawan(booking.id)}
                    disabled={pakyawanSubmittingId !== null}
                  >
                    Not now
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {acceptedPakyawan.length > 0 ? (
          <div className="pakyawan-accepted">
            <p className="section-label">ACCEPTED BY YOU</p>
            <ul className="pakyawan-accepted-list">
              {acceptedPakyawan.map((booking) => (
                <li key={booking.id}>
                  <strong>
                    {booking.pickup_location} → {booking.destination}
                  </strong>
                  <span>
                    {booking.booking_date} · {booking.pickup_time}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    )
  }

const renderSummary = () => (
    <section className="driver-hero" aria-label="Driver profile and statistics">
      <div className="driver-hero-top">
        <div className="driver-hero-profile">
          <div className="driver-avatar">
            {displayedDriver.profilePhoto ? (
              <img src={displayedDriver.profilePhoto} alt="" className="driver-photo" />
            ) : (
              <span className="driver-photo driver-photo-fallback" aria-hidden="true">
                {displayedDriver.name.charAt(0)}
              </span>
            )}
            <span
              className={driverOnline ? 'driver-avatar-dot is-online' : 'driver-avatar-dot is-offline'}
              aria-hidden="true"
            />
          </div>

          <div className="driver-hero-copy">
            <p className="section-label">DRIVER PROFILE</p>
            <h3>{displayedDriver.name}</h3>
            <p className="driver-hero-rating">
              {renderStarRating(displayedDriver.rating)}
              <span> {displayedDriver.rating}</span>
            </p>
            <p className="driver-hero-vehicle">
              {displayedDriver.vehicleType} · {displayedDriver.vehicleModel} · {displayedDriver.plateNumber}
            </p>
            {driverProfile?.username ? (
              <p className="driver-hero-signed">Signed in as <strong>{driverProfile.username}</strong></p>
            ) : driverProfile?.email ? (
              <p className="driver-hero-signed">Signed in as <strong>{driverProfile.email}</strong></p>
            ) : null}
          </div>
        </div>

        <div className="driver-hero-availability">
          <span
            className={driverOnline ? 'driver-hero-avail-dot is-online' : 'driver-hero-avail-dot is-offline'}
            aria-hidden="true"
          />
          <div>
            <small>Availability</small>
            <strong>{driverOnline ? 'Accepting ride requests' : 'Currently offline'}</strong>
          </div>
        </div>
      </div>

      <div className="driver-stat-grid">
        <div className="driver-stat-tile">
          <span className="driver-stat-label">Completed rides</span>
          <strong>{reputation ? reputation.completedRides : recentRides.length}</strong>
          <small>All-time trips</small>
        </div>
        <div className="driver-stat-tile">
          <span className="driver-stat-label">Rating</span>
          <strong>{reputation ? reputation.averageStars.toFixed(1) : String(demoDriver.rating)}</strong>
          <small>{reputation ? `${reputation.totalRatings} rating${reputation.totalRatings === 1 ? '' : 's'}` : 'Passenger feedback'}</small>
        </div>
        <div className="driver-stat-tile">
          <span className="driver-stat-label">Cancellations</span>
          <strong>{reputation ? `${reputation.cancelledRides} (${reputation.cancellationRate}%)` : '0'}</strong>
          <small>Of all completed rides</small>
        </div>
      </div>
    </section>
  )

const renderOfflineState = () => (
    <section className="driver-card work-state work-offline">
      <div className="state-heading">
        <div>
          <p className="section-label">AVAILABILITY</p>
          <h3>You're currently offline</h3>
          <p>You are not receiving new ride requests. Go online to start getting matched with nearby passengers.</p>
        </div>
        <span className="state-badge offline-badge">OFFLINE</span>
      </div>

      {presenceError ? (
        <p className="form-error-message" role="alert">
          {presenceError}
        </p>
      ) : null}

      <div className="work-cta">
        <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning}>
          {transitioning ? 'Going Online...' : 'Go Online'}
        </button>
        <p className="work-cta-hint">Nearby passengers will be able to request you as soon as you go online.</p>
      </div>
    </section>
  )

const renderOnlineState = () => (
    <section className="driver-card work-state work-waiting">
      <div className="state-heading">
        <div>
          <p className="section-label">RIDE QUEUE</p>
          <h3>{driverIsAvailable ? 'Waiting for your next ride' : 'Availability paused'}</h3>
          <p>
            {driverIsAvailable
              ? 'Your vehicle is available and ready to serve passengers.'
              : 'You will keep receiving ride offers only when you mark yourself available.'}
          </p>
        </div>
        <span className={`state-badge ${driverIsAvailable ? 'online-badge' : 'paused-badge'}`}>
          {driverIsAvailable ? 'ONLINE' : 'PAUSED'}
        </span>
      </div>

{driverIsAvailable ? (
        <div className="waiting-box">
          <span className="search-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <div>
            <strong>Looking for nearby requests...</strong>
            <span>Keep the dashboard open while you're available.</span>
          </div>
        </div>
      ) : null}

      {presenceError ? (
        <p className="form-error-message" role="alert">
          {presenceError}
        </p>
      ) : null}

      <div className="presence-controls">
        <div className="presence-control">
          <span className="presence-label">
            Availability
            <small className={`presence-location-status is-${locationStatus}`}>
              Location {locationStatus}
            </small>
          </span>
          <button
            type="button"
            className={driverIsAvailable ? 'secondary-action is-active' : 'secondary-action'}
            onClick={() => void handleToggleAvailability(!driverIsAvailable)}
            disabled={transitioning}
          >
            {driverIsAvailable ? 'Available' : 'Unavailable'}
          </button>
        </div>

        <div className="presence-control">
          <span className="presence-label">Auto accept offers</span>
          <button
            type="button"
            className={driverAutoAccept ? 'secondary-action is-active' : 'secondary-action'}
            onClick={() => void handleToggleAutoAccept(!driverAutoAccept)}
            disabled={transitioning}
          >
            {driverAutoAccept ? 'Auto accept ON' : 'Auto accept OFF'}
          </button>
        </div>
      </div>

      <div className="availability-details">
        <div>
          <span>Vehicle</span>
          <strong>{demoDriver.vehicleModel}</strong>
        </div>
        <div>
          <span>Plate</span>
          <strong>{demoDriver.plateNumber}</strong>
        </div>
      </div>
    </section>
  )

  const renderPassengerReputationRow = () => {
    if (!passengerReputation) {
      return <strong>Loading reputation...</strong>
    }

    if (passengerReputation.totalRatings === 0) {
      return <strong>New passenger · no ratings yet</strong>
    }

    return (
      <strong>
        <span className="rating-stars-inline">
          {renderStarRating(passengerReputation.averageStars)}
        </span>
        {' '}
        {passengerReputation.averageStars.toFixed(1)}/5 (
        {passengerReputation.totalRatings} rating{passengerReputation.totalRatings === 1 ? '' : 's'})
        {' '}· {formatCancellationRate(passengerReputation.cancellationRate)} cancellation rate
      </strong>
    )
  }

  const renderIncomingRequest = () => (
<section className="driver-card work-state work-request ride-focal">
      <div className="state-heading">
        <div>
          <p className="section-label">NEW RIDE REQUEST</p>
          <h3>{request?.customer_name}</h3>
          <p>Review the trip details before accepting.</p>
        </div>
        <span className="state-badge request-badge">NEW</span>
      </div>

<div className="fare-highlight fare-highlight-focal">
        <span>{request?.destination_mode === 'multiple' ? 'FARE' : 'ESTIMATED FARE'}</span>
        <strong>{fareDisplayFor(request)}</strong>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div>
            <small>PICKUP</small>
            <strong>{request?.pickup_address}</strong>
          </div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div>
            <small>DESTINATION</small>
            <strong>{request?.destination_address}</strong>
          </div>
        </div>
      </div>

<div className="ride-info-grid">
        <div><span>Passenger</span><strong>{request?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{request?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{request?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Phone</span><strong>{request?.customer_phone}</strong></div>
        <div><span>Requested</span><strong>{request ? new Date(request.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</strong></div>
      </div>

      {renderRideStops(request)}

      <div className="passenger-reputation" aria-label="Passenger rating">
        <span>Passenger rating</span>
        {renderPassengerReputationRow()}
      </div>

      {requestError ? (
        <p className="form-error-message" role="alert">
          {requestError}
        </p>
      ) : null}

      {pendingOffer ? (
        <p className="offer-countdown" role="status" aria-live="polite">
          {offerExpired
            ? 'This offer has expired.'
            : `Offer expires in ${offerSecondsLeft}s`}
        </p>
      ) : null}

<div className="action-row request-actions">
        <button type="button" className="primary-action accept-cta" onClick={handleAcceptRide} disabled={transitioning || offerExpired}>
          {offerExpired ? 'Offer Expired' : 'Accept Ride'}
        </button>
        <button type="button" className="secondary-action" onClick={handleDecline} disabled={transitioning || offerExpired}>
          Decline
        </button>
      </div>
    </section>
  )

  const renderHeadingToPickup = () => (
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
<h3>Heading to passenger</h3>
          <p>{activeRide?.customer_name} · {activeRide?.passenger_count} passenger(s)</p>
        </div>
        <span className="state-badge progress-badge">EN ROUTE</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      {renderRideStops(activeRide)}

      <div className="ride-info-grid">
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="passenger-reputation" aria-label="Passenger rating">
        <span>Passenger rating</span>
        {renderPassengerReputationRow()}
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          Chat
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>

      <button type="button" className="primary-action" onClick={handleArrived} disabled={transitioning}>
        Arrived at Pickup
      </button>
    </section>
  )

  const renderArrivedState = () => (
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
          <h3>Passenger pickup</h3>
          <p>You've arrived at the pickup location.</p>
        </div>
        <span className="state-badge arrived-badge">ARRIVED</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

<div className="ride-info-grid">
        <div><span>Passenger</span><strong>{activeRide?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          Chat
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>

      <button type="button" className="primary-action" onClick={handleStartRide} disabled={transitioning}>
        Start Ride
      </button>
    </section>
  )

  const renderInProgressState = () => (
    <section className="driver-card work-state active-ride-state">
      <div className="state-heading">
        <div>
          <p className="section-label">CURRENT RIDE</p>
          <h3>Ride in progress</h3>
          <p>{activeRide?.customer_name} is on board.</p>
        </div>
        <span className="state-badge live-badge">IN PROGRESS</span>
      </div>

      <div className="ride-progress">
        <span className="progress-complete">ACCEPTED</span>
        <span className="progress-arrow">→</span>
        <span className="progress-complete">ARRIVED</span>
        <span className="progress-arrow">→</span>
        <span className="progress-active">IN PROGRESS</span>
        <span className="progress-arrow">→</span>
        <span>DESTINATION</span>
      </div>

<div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

      {renderRideStops(activeRide)}

      <div className="ride-info-grid">
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>

      <div className="driver-contact-actions">
        <button type="button" className="secondary-action cancel-action" onClick={() => setShowCancelModal(true)}>Cancel Ride</button>
        <button type="button" className="secondary-action chat-button" onClick={handleOpenChat}>
          Chat
          {chatUnread > 0 ? <span className="chat-unread-badge">{chatUnread}</span> : null}
        </button>
      </div>

      <button type="button" className="primary-action" onClick={handleCompleteRide} disabled={transitioning}>
        Complete Ride
      </button>
    </section>
  )

  const renderCompletedState = () => (
    <section className="driver-card work-state completed-state">
      <div className="state-heading">
        <div>
          <p className="section-label">RIDE COMPLETE</p>
          <h3>Trip completed</h3>
          <p>Great job. Your ride has been completed.</p>
        </div>
        <span className="state-badge completed-badge">COMPLETED</span>
      </div>

      <div className="ride-route">
        <div className="route-point">
          <span className="route-dot pickup-dot" aria-hidden="true" />
          <div><small>PICKUP</small><strong>{activeRide?.pickup_address}</strong></div>
        </div>
        <div className="route-line" aria-hidden="true" />
        <div className="route-point">
          <span className="route-dot destination-dot" aria-hidden="true" />
          <div><small>DESTINATION</small><strong>{activeRide?.destination_address}</strong></div>
        </div>
      </div>

<div className="ride-info-grid">
        <div><span>Passenger</span><strong>{activeRide?.customer_name}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
        <div><span>Payment</span><strong>Cash or GCash</strong></div>
      </div>

      {!passengerRatingSubmitted ? (
        <div className="driver-passenger-rating">
          <p className="section-label">RATE YOUR PASSENGER</p>
          <h3>How was your passenger?</h3>

          <div
            className="rating-stars"
            role="radiogroup"
            aria-label="Rate your passenger from 1 to 5 stars"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className={star <= passengerRating ? 'rating-star selected' : 'rating-star'}
                onClick={() => setPassengerRating(star)}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                aria-checked={star === passengerRating}
                role="radio"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="26"
                  height="26"
                  fill={star <= passengerRating ? 'currentColor' : 'none'}
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

          <label className="field-label" htmlFor="passenger-rating-comment">
            Comment <span>(optional)</span>
          </label>

          <textarea
            id="passenger-rating-comment"
            className="text-input"
            value={passengerRatingComment}
            onChange={(event) => setPassengerRatingComment(event.target.value)}
            placeholder="Tell us about your passenger..."
            rows={4}
            maxLength={500}
          />

          {passengerRatingError ? (
            <p className="form-error-message" role="alert">
              {passengerRatingError}
            </p>
          ) : null}

          <button
            type="button"
            className="primary-action"
            onClick={() => void handleSubmitPassengerRating()}
            disabled={passengerRating === 0 || isSubmittingPassengerRating}
          >
            {isSubmittingPassengerRating ? 'Submitting...' : 'Submit Passenger Rating'}
          </button>
        </div>
      ) : (
        <p className="driver-passenger-rated-note">
          You rated this passenger. Thanks for the feedback!
        </p>
      )}

      <button type="button" className="primary-action" onClick={handleBackToDashboard}>
        Back to Dashboard
      </button>
    </section>
  )

  const renderRecentRides = () => (
    <section className="driver-card history-card">
      <div className="section-heading">
        <div>
          <p className="section-label">RIDE HISTORY</p>
          <h3>Recent trips</h3>
        </div>
        <span className="history-count">{recentRides.length} today</span>
      </div>

      <ul className="history-list">
        {recentRides.map((ride) => (
          <li key={ride.id} className="history-item">
            <div className="history-main">
              <div className="history-passenger">
                <strong>{ride.passenger}</strong>
                <span>{ride.date}</span>
              </div>
              <span className="completed-badge">{ride.status}</span>
            </div>
            <div className="history-route">
              <span>{ride.pickup}</span>
              <strong>→</strong>
              <span>{ride.destination}</span>
            </div>
            <div className="history-footer">
              <span>Completed trip</span>
              <strong>{ride.fare}</strong>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )

  if (driverStatusBlocked) {
    return (
      <>
        <AppHeader
          view={view}
          onViewChange={onViewChange}
          primaryLabel="My Rides"
          onPrimaryAction={() => onViewChange('Rider')}
        />
        <div className="auth-shell">
          <div className="auth-card">
            <div className="auth-header">
              <p className="eyebrow auth-eyebrow">Driver Access</p>
              <h2>Account inactive</h2>
            </div>
            <p className="muted-copy">
              Your driver account is inactive. Please contact Bislig Ride to reactivate it.
            </p>
            <button type="button" className="primary-action request-ride-action" onClick={onBack}>
              Back to Ride Booking
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <AppHeader
        view={view}
        onViewChange={onViewChange}
        primaryLabel="My Rides"
        onPrimaryAction={() => onViewChange('Rider')}
      />

    <div className="driver-shell driver-dashboard">
{showChat && activeRide?.id && (
        <RideChat
          rideId={activeRide.id}
          otherPartyName={activeRide.customer_name}
          currentRole="driver"
          currentDriverId={driverId}
          driverAuthId={driverAuthId}
          onClose={() => setShowChat(false)}
        />
      )}

      {chatToast ? (
        <div className="chat-notification-toast" role="status" aria-live="polite">
          <div className="chat-notification-copy">
            <strong>{chatToast.from}</strong>
            <span>{chatToast.preview}</span>
          </div>
          <button type="button" className="chat-notification-view" onClick={handleOpenChat}>
            View
          </button>
        </div>
      ) : null}

      <button type="button" className="secondary-action compact-button driver-back-button" onClick={onBack}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
        Back to Ride Booking
      </button>

      <header className="driver-dash-header">
        <div className="driver-dash-copy">
          <p className="driver-kicker">Bislig Ride</p>
          <h2>Driver Dashboard</h2>
          <p className="driver-dash-subtitle">
            {driverOnline ? 'You\u2019re online and ready to accept ride requests.' : 'Go online to start receiving ride requests.'}
          </p>
        </div>
        <div className="driver-header-controls">
          <button
            type="button"
            className={driverOnline ? 'driver-status-chip is-online' : 'driver-status-chip is-offline'}
            onClick={handleToggleOnline}
            disabled={transitioning}
            aria-label={driverOnline ? 'Go offline' : 'Go online'}
            aria-describedby="driver-status-hint"
            onPointerEnter={driverOnline ? revealStatusHint : undefined}
            onFocus={driverOnline ? revealStatusHint : undefined}
            onPointerLeave={hideStatusHint}
            onBlur={hideStatusHint}
          >
            <span className="status-indicator" aria-hidden="true" />
            <span className="status-chip-label">{driverOnline ? 'Online' : 'Offline'}</span>
            <span
              id="driver-status-hint"
              className={showStatusHint ? 'driver-status-hint is-visible' : 'driver-status-hint'}
              role="status"
              aria-live="polite"
            >
              {driverOnline ? 'Ready to receive ride requests' : 'You are not receiving new requests'}
            </span>
          </button>
          {renderNotificationBell()}
        </div>
      </header>

      {renderSummary()}

      {showChangePassword ? (
        <section className="driver-card account-panel">
          <div className="state-heading">
            <div>
              <p className="section-label">ACCOUNT SECURITY</p>
              <h3>Change password</h3>
              <p>Update the password you use to sign in.</p>
            </div>
            <button type="button" className="secondary-action compact-button" onClick={handleCloseChangePassword} disabled={changingPassword}>
              Close
            </button>
          </div>

          {passwordSuccess ? <p className="driver-password-success" role="status">{passwordSuccess}</p> : null}

          <form className="panel-form" onSubmit={(event) => { event.preventDefault(); void handleChangePasswordSubmit() }}>
            <div className="form-grid">
              <label className="field-block">
                <span className="field-label">Current password</span>
                <input className="input-field" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="••••••••" autoComplete="current-password" disabled={changingPassword} />
              </label>
              <label className="field-block">
                <span className="field-label">New password</span>
                <input className="input-field" type={showPasswordFields ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="••••••••" autoComplete="new-password" disabled={changingPassword} />
              </label>
              <label className="field-block">
                <span className="field-label">Confirm new password</span>
                <input className="input-field" type={showPasswordFields ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="••••••••" autoComplete="new-password" disabled={changingPassword} />
              </label>
            </div>

            <p className="password-meta">{PASSWORD_HELP_TEXT}</p>

            <div className="form-actions">
              <button type="button" className="link-button" onClick={() => setShowPasswordFields((current) => !current)} disabled={changingPassword}>
                {showPasswordFields ? 'Hide passwords' : 'Show passwords'}
              </button>
            </div>

            {passwordError ? <p className="form-error-message" role="alert">{passwordError}</p> : null}

            <div className="form-actions">
              <button type="submit" className="primary-action" disabled={changingPassword}>
                {changingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="driver-operations">
        {phase === 'offline' ? renderOfflineState() : null}
        {phase === 'online' ? renderOnlineState() : null}
        {phase === 'incoming_request' ? renderIncomingRequest() : null}
        {phase === 'heading_to_pickup' ? renderHeadingToPickup() : null}
        {phase === 'arrived' ? renderArrivedState() : null}
        {phase === 'in_progress' ? renderInProgressState() : null}
        {phase === 'completed' ? renderCompletedState() : null}
      </div>

      {cancellationNotice ? (
        <section className="ride-cancelled-notice" role="alert">
          <div>
            <strong>Ride cancelled by the passenger</strong>
            <span>
              {activeRide
                ? `${activeRide.customer_name} cancelled this ride. `
                : 'Your passenger cancelled this ride. '}
              Reason: {cancellationNotice.reason}
            </span>
          </div>
          <button type="button" onClick={() => setCancellationNotice(null)}>
            Dismiss
          </button>
        </section>
      ) : null}

      {!driverOnline || phase === 'offline' ? renderRecentRides() : null}

      <div className="account-actions-row">
        <button
          type="button"
          className="secondary-action compact-button"
          onClick={() => {
            setShowChangePassword((current) => !current)
            setPasswordError('')
            setPasswordSuccess('')
          }}
          disabled={isLoggingOut}
        >
          Change Password
        </button>
        <button
          type="button"
          className="secondary-action compact-button"
          onClick={() => void handleLogout()}
          disabled={isLoggingOut}
        >
          {isLoggingOut ? 'Signing out...' : 'Logout'}
        </button>
      </div>

      {renderPakyawanSection()}

      {phase === 'online' || phase === 'offline' ? (
        <div className="driver-mobile-actions">
          <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning} aria-label={driverOnline ? 'Go offline' : 'Go online'}>
            {driverOnline ? 'Go Offline' : 'Go Online'}
          </button>
          <button type="button" className="secondary-action" onClick={handleOpenNotifications} aria-label={`Open notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}>
            Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ''}
          </button>
        </div>
      ) : null}

      {showCancelModal && activeRide && (
        <CancelRideModal
          open={showCancelModal}
          role="driver"
          submitting={cancelSubmitting}
          error={cancelError}
          onClose={() => {
            setShowCancelModal(false)
            setCancelError('')
          }}
          onConfirm={(reason) => void handleConfirmCancellation(reason)}
        />
      )}
    </div>
    </>
  )
}









