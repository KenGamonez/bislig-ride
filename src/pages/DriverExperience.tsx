import { useEffect, useMemo, useRef, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { CancelRideModal } from '../components/CancelRideModal'
import { MapView } from '../components/MapView'
import { RideChat } from '../components/RideChat'
import { PakyawanChat, PakyawanChatAlertPopup } from '../components/PakyawanChat'
import { supabase } from '../lib/supabase'
import { demoDriver } from '../lib/demoDriver'
import { changeDriverPassword } from '../lib/driverAuth'
import { PASSWORD_HELP_TEXT, validatePasswordStrength } from '../lib/driverAccounts'
import { formatCentavos, MULTIPLE_DESTINATIONS_FARE_NOTE } from '../lib/fare'
import { formatVehicleCapacity, formatVehicleType } from '../lib/vehicle'
import { fetchLatestRideCancellation, subscribeToRideCancellations } from '../lib/rideCancellations'
import { fetchDriverReputation, fetchReputationFor, formatCancellationRate, type ReputationSummary } from '../lib/reputation'
import { acceptPakyawanBooking, acceptPakyawanOffer, advancePakyawanStatus, declinePakyawanOffer, fetchAvailablePakyawanBookings, fetchDriverPakyawanBookings, fetchDriverPakyawanOffers, setPakyawanDriverPrice, type PakyawanTripLifecycleStatus } from '../lib/scheduledBookings'
import { acceptDeliveryBooking, acceptDeliveryOffer, advanceDeliveryStatus, completeDeliveryWithProof, fetchAvailableDeliveries, fetchDeliveryProofPaths, fetchDriverDeliveries, fetchDriverDeliveryOffers, setDeliveryDriverPrice, type DeliveryLifecycleStatus } from '../lib/deliveries'
import { fetchDriverRideHistory } from '../lib/rides'
import { buildDeliveryProofPath, getDeliveryProofSignedUrl, removeDeliveryProof, uploadDeliveryProof, validateDeliveryProofImage } from '../lib/deliveryProof'
import {
  notificationPermission,
  playRequestChime,
  playChatNotification,
  requestNotificationPermission,
  showBrowserNotification,
} from '../lib/notifications'
import { startRideLocationWatch, subscribeToRideLocation } from '../lib/rideLocation'
import {
  acceptRideOffer,
  declineRideOffer,
  fetchPendingOffer,
  setDriverPresence,
  subscribeToAssignedRides,
  subscribeToDriverOffers,
} from '../lib/dispatch'
import {
  driverLocationStatus,
  persistOfflineBestEffort,
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
import type { PakyawanBooking, PakyawanOfferWithBooking } from '../types/scheduledBooking'
import type { DeliveryBooking, DeliveryOfferWithBooking } from '../types/delivery'

const TEST_DRIVER_ID = '6b239660-14ae-4fea-82c0-905420260077'

const resolvePresenceErrorMessage = (error: unknown, offline: boolean): string => {
  if (
    !offline &&
    error &&
    typeof error === 'object' &&
    typeof (error as { code?: unknown }).code === 'number'
  ) {
    switch ((error as { code: number }).code) {
      case 1:
        return 'Location permission was denied. Please allow location access in your browser settings and try again.'
      case 2:
        return 'Your location could not be determined. Turn on precise location or GPS and try again.'
      case 3:
        return 'Location lookup timed out. Move to an open area and try again.'
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  // A Supabase RPC failure frequently arrives as a PostgrestError whose
  // `message` is empty while the real cause sits in `details` (or `code`)
  // — e.g. set_driver_presence raising 42501 (driver not ACTIVE / grant or
  // signature issue). `instanceof Error && message` alone would swallow
  // these into the misleading GPS text below, so surface them first.
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    const details = (error as { details?: unknown }).details
    const hint = (error as { hint?: unknown }).hint
    const candidate = message || details || hint
    if (typeof candidate === 'string' && candidate) {
      return candidate
    }
  }

  return offline
    ? 'Unable to go offline right now. Please try again.'
    : 'Unable to go online right now. Check your connection and GPS, then try again.'
}

type DriverPhase = 'offline' | 'online' | 'incoming_request' | 'heading_to_pickup' | 'arrived' | 'in_progress' | 'completed'

type DriverView = 'home' | 'queue' | 'profile' | 'pakyawan' | 'delivery'

type DriverSummaryProfile = {
  name: string
  profilePhoto: string | null
  rating: number
  vehicleType: string
  vehicleModel: string
  plateNumber: string
  vehicleCapacity: number | null
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

type DriverHistoryRide = {
  id: string
  pickup: string
  destination: string
  date: string
  status: string
  fare: string
}

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
  const [driverView, setDriverView] = useState<DriverView>('home')
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
  const [driverLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [pendingOffer, setPendingOffer] = useState<PendingOffer | null>(null)
  const [driverIsAvailable, setDriverIsAvailable] = useState(true)
  const [driverAutoAccept, setDriverAutoAccept] = useState(false)
  const [presenceError, setPresenceError] = useState('')
  const [requestError, setRequestError] = useState('')
  const [lastLocationFixIso] = useState<string | null>(null)
  const [, setLocationTick] = useState(0)
  const [offerSecondsLeft, setOfferSecondsLeft] = useState(0)

  const locationStatus = !driverOnline ? 'lost' : driverLocationStatus(lastLocationFixIso)

  const offerExpired = phase === 'incoming_request' && Boolean(pendingOffer) && offerSecondsLeft === 0
  const stopTrackingRef = useRef<(() => void) | null>(null)
  const handledOfferIdsRef = useRef<Set<string>>(new Set())
  const dismissedOfferIdsRef = useRef<Set<string>>(new Set())
  const deliveryChimedIdsRef = useRef<Set<string>>(new Set())
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
  const [canAcceptDeliveries, setCanAcceptDeliveries] = useState(false)
  const [deliveryOffers, setDeliveryOffers] = useState<DeliveryOfferWithBooking[]>([])
  const [deliveryRequests, setDeliveryRequests] = useState<DeliveryBooking[]>([])
  const [deliveryNow, setDeliveryNow] = useState(() => Date.now())
  const [deliveryError, setDeliveryError] = useState('')
  const [acceptedDeliveries, setAcceptedDeliveries] = useState<DeliveryBooking[]>([])
  const [completedDeliveryNotice, setCompletedDeliveryNotice] = useState<DeliveryBooking | null>(null)
  const [deliverySubmittingId, setDeliverySubmittingId] = useState<string | null>(null)
  const [deliveryLifecycleSubmittingId, setDeliveryLifecycleSubmittingId] = useState<string | null>(null)
  const [deliveryLifecycleError, setDeliveryLifecycleError] = useState<{ deliveryId: string; message: string } | null>(null)
  const [deliveryPriceInputs, setDeliveryPriceInputs] = useState<Record<string, string>>({})
  const [deliveryPriceSubmittingId, setDeliveryPriceSubmittingId] = useState<string | null>(null)
  const [deliveryPriceError, setDeliveryPriceError] = useState<{ deliveryId: string; message: string } | null>(null)
  const [deliveryProof, setDeliveryProof] = useState<{ bookingId: string; file: File | null; previewUrl: string | null } | null>(null)
  const [isUploadingProof, setIsUploadingProof] = useState(false)
  const [deliveryConfirmedPopup, setDeliveryConfirmedPopup] = useState<DeliveryBooking | null>(null)
  const [deliveryProofView, setDeliveryProofView] = useState<{ bookingId: string; url: string } | null>(null)
  const [deliveryProofViewLoadingId, setDeliveryProofViewLoadingId] = useState<string | null>(null)
  const [deliveryProofViewError, setDeliveryProofViewError] = useState<{ bookingId: string; message: string } | null>(null)
  const [pakyawanRequests, setPakyawanRequests] = useState<PakyawanBooking[]>([])
  const [acceptedPakyawan, setAcceptedPakyawan] = useState<PakyawanBooking[]>([])
  const [pakyawanSubmittingId, setPakyawanSubmittingId] = useState<string | null>(null)
  const [pakyawanRequestsError, setPakyawanRequestsError] = useState('')
  const [pakyawanOffersError, setPakyawanOffersError] = useState('')
  const [pakyawanRequestsRetry, setPakyawanRequestsRetry] = useState(0)
  const [pakyawanOffers, setPakyawanOffers] = useState<PakyawanOfferWithBooking[]>([])
  const [pakyawanConfirmedPopup, setPakyawanConfirmedPopup] = useState<PakyawanBooking | null>(null)
  const [pakyawanChatBookingId, setPakyawanChatBookingId] = useState<string | null>(null)
  const [pakyawanChatAlert, setPakyawanChatAlert] = useState<{ bookingId: string; route: string; preview: string } | null>(null)
  const pakyawanChatSeenIdsRef = useRef<Set<string>>(new Set())
  const [pakyawanNow, setPakyawanNow] = useState(() => Date.now())
  const [pakyawanPriceInputs, setPakyawanPriceInputs] = useState<Record<string, string>>({})
  const [pakyawanPriceSubmittingId, setPakyawanPriceSubmittingId] = useState<string | null>(null)
  const [pakyawanPriceError, setPakyawanPriceError] = useState<{ bookingId: string; message: string } | null>(null)
  const [pakyawanLifecycleSubmittingId, setPakyawanLifecycleSubmittingId] = useState<string | null>(null)
  const [pakyawanLifecycleError, setPakyawanLifecycleError] = useState<{ bookingId: string; message: string } | null>(null)
  const [notificationPermissionState, setNotificationPermissionState] = useState<NotificationPermission>(() => notificationPermission())
  const [showStatusHint, setShowStatusHint] = useState(false)
  const [driverStatusBlocked, setDriverStatusBlocked] = useState(false)
  const statusHintTimerRef = useRef<number | null>(null)
  const [passengerLocation, setPassengerLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [rideLocationNote, setRideLocationNote] = useState('')
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
        .select('id, status, auth_user_id, full_name, email, username, vehicle_type, vehicle_model, vehicle_capacity, plate_number, profile_photo_url, rating_average, total_ratings, can_accept_pakyawan, can_accept_deliveries')
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
        setCanAcceptDeliveries(Boolean((driver as { can_accept_deliveries?: boolean }).can_accept_deliveries))
        setDriverProfile({
          name: driver.full_name,
          profilePhoto: driver.profile_photo_url,
          rating: Number(driver.rating_average ?? 5),
          vehicleType: driver.vehicle_type ?? demoDriver.vehicleType,
          vehicleModel: driver.vehicle_model ?? demoDriver.vehicleModel,
          plateNumber: driver.plate_number ?? demoDriver.plateNumber,
          vehicleCapacity: driver.vehicle_capacity ?? null,
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

        if (pendingOfferResult && !dismissedOfferIdsRef.current.has(pendingOfferResult.offer.id)) {
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

    const unsubscribeAssignedRides = subscribeToAssignedRides(driverId, () => {
      void refreshRides()
    })

    return () => {
      mounted = false
      window.clearInterval(timer)
      unsubscribeAssignedRides()
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

    if (!activeRide?.id || !driverAuthId || !activePhases.includes(phase)) {
      return
    }

    return subscribeToRideLocation(activeRide.id, (message) => {
      if (message.user === driverAuthId) {
        return
      }

      setPassengerLocation({ latitude: message.latitude, longitude: message.longitude })
    })
  }, [activeRide?.id, driverAuthId, phase])

  useEffect(() => {
    const activePhases: DriverPhase[] = ['heading_to_pickup', 'arrived', 'in_progress']

    if (!activeRide?.id || !driverAuthId || !activePhases.includes(phase)) {
      stopTrackingRef.current?.()
      stopTrackingRef.current = null
      return
    }

    stopTrackingRef.current = startRideLocationWatch(activeRide.id, {
      user: driverAuthId,
      onLocation: () => {
        setRideLocationNote('')
      },
      onError: (error) => {
        if (error.code === error.PERMISSION_DENIED || error.code === error.POSITION_UNAVAILABLE) {
          setRideLocationNote("Live location is unavailable. The passenger won't see your live position.")
        }
      },
      onUnsupported: () => {
        setRideLocationNote('Live location is not supported on this device.')
      },
    })

    return () => {
      stopTrackingRef.current?.()
      stopTrackingRef.current = null
    }
  }, [activeRide?.id, driverAuthId, phase])

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
      if (
        handledOfferIdsRef.current.has(pending.offer.id) ||
        dismissedOfferIdsRef.current.has(pending.offer.id)
      ) {
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

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [phase, pendingOffer])

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
      if (mounted) {
        setPakyawanRequestsError('')
      }
      try {
        const items = await fetchAvailablePakyawanBookings()
        if (mounted) {
          setPakyawanRequests(items)
          setPakyawanRequestsError('')
        }
      } catch (error) {
        console.error('Unable to load pakyawan requests:', error)
        if (mounted) {
          setPakyawanRequestsError('Unable to load Pakyawan requests right now.')
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

          // A real request just arrived, so a stale request-loading error must not linger.
          setPakyawanRequestsError('')

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
  }, [driverAuthId, canAcceptPakyawan, driverOnline, pakyawanRequestsRetry])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptPakyawan) {
      return
    }

    let mounted = true

    const loadOffers = async () => {
      if (mounted) {
        setPakyawanOffersError('')
      }
      try {
        const items = await fetchDriverPakyawanOffers(driverId)
        if (mounted) {
          setPakyawanOffers(items)
          setPakyawanOffersError('')
        }
      } catch (error) {
        console.error('Unable to load pakyawan offers:', error)
        if (mounted) {
          setPakyawanOffersError('Unable to load Pakyawan offers right now.')
        }
      }
    }

    const refreshOffers = () => {
      void loadOffers()
    }

    void loadOffers()

    const channel = supabase
      .channel(`driver-pakyawan-offers-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pakyawan_offers',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<PakyawanOfferWithBooking>

          if (!incoming.id) {
            refreshOffers()
            return
          }

          refreshOffers()

          const subtitle = 'A customer is requesting a Pakyawan trip.'

          setNotifications((current) =>
            current.some((item) => item.id === `pakyawan-offer-${incoming.id}`)
              ? current
              : [
                  {
                    id: `pakyawan-offer-${incoming.id}`,
                    kind: 'pakyawan',
                    rideId: null,
                    title: 'New Pakyawan offer',
                    subtitle,
                    seen: false,
                    createdAt: Date.now(),
                  },
                  ...current,
                ],
          )

          if (driverOnline) {
            playRequestChime()
            showBrowserNotification('New Pakyawan offer', subtitle)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pakyawan_offers',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          refreshOffers()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [driverId, driverAuthId, canAcceptPakyawan, driverOnline])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptPakyawan) {
      return
    }

    // Passenger confirmation lands directly on `scheduled` (there is no
    // persisted `confirmed` status). Watch this driver's own bookings so the
    // driver learns about confirmation without refreshing.
    const channel = supabase
      .channel(`driver-pakyawan-held-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pakyawan_bookings',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<PakyawanBooking>

          if (!incoming.id || incoming.driver_id !== driverId) {
            return
          }

          const confirmedBookingId = incoming.id

          setAcceptedPakyawan((current) => {
            const byId = new Map(current.map((booking) => [booking.id, booking]))

            byId.set(confirmedBookingId, { ...(byId.get(confirmedBookingId) ?? {}), ...incoming } as PakyawanBooking)

            return Array.from(byId.values()).slice(0, 10)
          })

          if (incoming.status !== 'scheduled') {
            return
          }

          const subtitle = `${incoming.pickup_location ?? 'Pickup'} → ${incoming.destination ?? 'Destination'}`

          setNotifications((current) =>
            current.some((item) => item.id === `pakyawan-confirmed-${incoming.id}`)
              ? current
              : [
                  {
                    id: `pakyawan-confirmed-${incoming.id}`,
                    kind: 'pakyawan',
                    rideId: null,
                    title: 'Pakyawan confirmed',
                    subtitle,
                    seen: false,
                    createdAt: Date.now(),
                  },
                  ...current,
                ],
          )

          setPakyawanConfirmedPopup((current) =>
            current && current.id === incoming.id ? current : (incoming as PakyawanBooking),
          )

          if (driverOnline) {
            playRequestChime()
            showBrowserNotification('Pakyawan confirmed', subtitle)
          }
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [driverId, driverAuthId, canAcceptPakyawan, driverOnline])

  useEffect(() => {
    if (pakyawanOffers.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      setPakyawanNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [pakyawanOffers.length])

  useEffect(() => {
    if (!driverAuthId || !canAcceptDeliveries) {
      return
    }

    let mounted = true

    const loadDeliveryRequests = async () => {
      if (mounted) {
        setDeliveryError('')
      }
      try {
        const items = await fetchAvailableDeliveries()
        if (mounted) {
          setDeliveryRequests(items)
          setDeliveryError('')
        }
      } catch (error) {
        console.error('Unable to load delivery requests:', error)
        if (mounted) {
          setDeliveryError('Unable to load delivery requests right now.')
        }
      }
    }

    void loadDeliveryRequests()

    const channel = supabase
      .channel('driver-deliveries-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'deliveries',
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<DeliveryBooking>

          if (!incoming.id) {
            return
          }

          setDeliveryRequests((current) =>
            current.some((booking) => booking.id === incoming.id)
              ? current
              : [incoming as DeliveryBooking, ...current],
          )

          const subtitle = `${incoming.pickup_address ?? 'Pickup'} → ${incoming.delivery_address ?? 'Destination'}`

          setNotifications((current) =>
            current.some((item) => item.id === `delivery-${incoming.id}`)
              ? current
              : [
                  {
                    id: `delivery-${incoming.id}`,
                    kind: 'pakyawan',
                    rideId: null,
                    title: 'New delivery request',
                    subtitle,
                    seen: false,
                    createdAt: Date.now(),
                  },
                  ...current,
                ],
          )

          if (driverOnline && !deliveryChimedIdsRef.current.has(incoming.id)) {
            deliveryChimedIdsRef.current.add(incoming.id)
            playRequestChime()
            showBrowserNotification('New delivery request', subtitle)
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [driverAuthId, canAcceptDeliveries, driverOnline])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptDeliveries) {
      return
    }

    let mounted = true

    const loadDeliveryOffers = async () => {
      if (mounted) {
        setDeliveryError('')
      }
      try {
        const items = await fetchDriverDeliveryOffers(driverId)
        if (mounted) {
          setDeliveryOffers(items)
          setDeliveryError('')
        }
      } catch (error) {
        console.error('Unable to load delivery offers:', error)
        if (mounted) {
          setDeliveryError('Unable to load delivery offers right now.')
        }
      }
    }

    const refreshDeliveryOffers = () => {
      void loadDeliveryOffers()
    }

    void loadDeliveryOffers()

    const channel = supabase
      .channel(`driver-delivery-offers-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'delivery_offers',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<DeliveryOfferWithBooking>

          if (!incoming.id) {
            refreshDeliveryOffers()
            return
          }

          refreshDeliveryOffers()

          const subtitle = 'A customer is requesting a package delivery.'

          setNotifications((current) =>
            current.some((item) => item.id === `delivery-offer-${incoming.id}`)
              ? current
              : [
                  {
                    id: `delivery-offer-${incoming.id}`,
                    kind: 'pakyawan',
                    rideId: null,
                    title: 'New delivery offer',
                    subtitle,
                    seen: false,
                    createdAt: Date.now(),
                  },
                  ...current,
                ],
          )

          if (driverOnline) {
            playRequestChime()
            showBrowserNotification('New delivery offer', subtitle)
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'delivery_offers',
          filter: `driver_id=eq.${driverId}`,
        },
        () => {
          refreshDeliveryOffers()
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [driverId, driverAuthId, canAcceptDeliveries, driverOnline])

  useEffect(() => {
    if (deliveryOffers.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      setDeliveryNow(Date.now())
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [deliveryOffers.length])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptDeliveries) {
      return
    }

    let mounted = true

    const loadHeldDeliveries = async () => {
      try {
        const items = await fetchDriverDeliveries(driverId)
        if (mounted) {
          setAcceptedDeliveries((current) => {
            const byId = new Map(current.map((booking) => [booking.id, booking]))

            for (const item of items) {
              byId.set(item.id, item)
            }

            return Array.from(byId.values()).slice(0, 10)
          })
        }
      } catch (error) {
        console.error('Unable to load held deliveries:', error)
      }
    }

    void loadHeldDeliveries()

    const channel = supabase
      .channel(`driver-deliveries-held-${driverId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'deliveries',
          filter: `driver_id=eq.${driverId}`,
        },
        (payload) => {
          const incoming = (payload.new ?? {}) as Partial<DeliveryBooking>

          loadHeldDeliveries()

          // The only external writer to this driver's held deliveries is the
          // passenger confirming the quoted fee.
          if (!incoming.id || incoming.driver_id !== driverId || incoming.status !== 'confirmed') {
            return
          }

          const subtitle = `${incoming.pickup_address ?? 'Pickup'} → ${incoming.delivery_address ?? 'Destination'}`

          setNotifications((current) =>
            current.some((item) => item.id === `delivery-confirmed-${incoming.id}`)
              ? current
              : [
                  {
                    id: `delivery-confirmed-${incoming.id}`,
                    kind: 'pakyawan',
                    rideId: null,
                    title: 'Delivery confirmed',
                    subtitle,
                    seen: false,
                    createdAt: Date.now(),
                  },
                  ...current,
                ],
          )

          setDeliveryConfirmedPopup((current) =>
            current && current.id === incoming.id ? current : (incoming as DeliveryBooking),
          )

          if (driverOnline) {
            playRequestChime()
            showBrowserNotification('Delivery confirmed', subtitle)
          }
        },
      )
      .subscribe()

    return () => {
      mounted = false
      void supabase.removeChannel(channel)
    }
  }, [driverId, driverAuthId, canAcceptDeliveries, driverOnline])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptPakyawan) {
      return
    }

    let mounted = true

    const loadHeldBookings = async () => {
      try {
        const items = await fetchDriverPakyawanBookings(driverId)
        if (mounted) {
          setAcceptedPakyawan((current) => {
            const byId = new Map(current.map((booking) => [booking.id, booking]))

            for (const item of items) {
              byId.set(item.id, item)
            }

            return Array.from(byId.values()).slice(0, 10)
          })
        }
      } catch (error) {
        console.error('Unable to load held pakyawan bookings:', error)
      }
    }

    void loadHeldBookings()

    return () => {
      mounted = false
    }
  }, [driverId, driverAuthId, canAcceptPakyawan])

  useEffect(() => {
    if (!driverId || !driverAuthId || !canAcceptPakyawan) {
      return
    }

    // One booking-scoped chat watcher per held booking. Realtime delivery
    // already requires the own-assigned SELECT policy, so other drivers'
    // messages can never arrive here.
    const heldIds = Array.from(
      new Set(
        acceptedPakyawan
          .filter((booking) => booking.driver_id === driverId)
          .map((booking) => booking.id),
      ),
    )

    if (heldIds.length === 0) {
      return
    }

    const channels = heldIds.map((heldId) =>
      supabase
        .channel(`driver-pakyawan-chatwatch-${heldId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'pakyawan_messages',
            filter: `booking_id=eq.${heldId}`,
          },
          (payload) => {
            const incoming = payload.new as {
              id?: string
              booking_id?: string
              sender_role?: string
              message?: string
            }

            if (!incoming.id || incoming.sender_role === 'driver') {
              return
            }

            if (pakyawanChatSeenIdsRef.current.has(incoming.id)) {
              return
            }

            pakyawanChatSeenIdsRef.current.add(incoming.id)

            // The open chat shows the message itself — no duplicate popup/sound.
            if (pakyawanChatBookingId === heldId) {
              return
            }

            const booking = acceptedPakyawan.find((item) => item.id === heldId)
            const route = booking
              ? `${booking.pickup_location} → ${booking.destination}`
              : 'Pakyawan booking'
            const preview = String(incoming.message ?? '').slice(0, 160)

            setNotifications((current) =>
              current.some((item) => item.id === `pakyawan-chatmsg-${incoming.id}`)
                ? current
                : [
                    {
                      id: `pakyawan-chatmsg-${incoming.id}`,
                      kind: 'pakyawan',
                      rideId: null,
                      title: 'New Pakyawan message',
                      subtitle: preview,
                      seen: false,
                      createdAt: Date.now(),
                    },
                    ...current,
                  ],
            )

            setPakyawanChatAlert({ bookingId: heldId, route, preview })

            if (driverOnline) {
              playRequestChime()
            }
          },
        )
        .subscribe(),
    )

    return () => {
      channels.forEach((channel) => {
        void supabase.removeChannel(channel)
      })
    }
  }, [driverId, driverAuthId, canAcceptPakyawan, driverOnline, acceptedPakyawan, pakyawanChatBookingId])

  const resolvePakyawanLifecycleError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/no longer assigned/i.test(message)) {
      return 'This trip is no longer assigned to you.'
    }

    if (/cannot move to that status|invalid trip status/i.test(message)) {
      return 'This trip cannot move to that status right now.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleAdvancePakyawanTrip = async (bookingId: string, nextStatus: PakyawanTripLifecycleStatus) => {
    if (pakyawanLifecycleSubmittingId) {
      return
    }

    setPakyawanLifecycleSubmittingId(bookingId)
    setPakyawanLifecycleError(null)

    try {
      const updated = await advancePakyawanStatus(bookingId, nextStatus)

      try {
        const items = await fetchDriverPakyawanBookings(driverId)
        setAcceptedPakyawan(items.slice(0, 10))
      } catch {
        setAcceptedPakyawan((current) =>
          current.map((booking) => (booking.id === bookingId ? updated : booking)),
        )
      }
    } catch (error) {
      console.error('Unable to advance pakyawan trip:', error)
      setPakyawanLifecycleError({ bookingId, message: resolvePakyawanLifecycleError(error) })

      try {
        const items = await fetchDriverPakyawanBookings(driverId)
        setAcceptedPakyawan(items.slice(0, 10))
      } catch (refreshError) {
        console.error('Unable to refresh held pakyawan bookings:', refreshError)
      }
    } finally {
      setPakyawanLifecycleSubmittingId(null)
    }
  }

const handleToggleOnline = async () => {
    if (transitioning) {
      return
    }

    setTransitioning(true)
    setPresenceError('')

    try {
      if (!driverOnline) {
        // Go online via the presence RPC without requiring a GPS fix. The
        // ACTIVE-driver + authenticated-session checks happen inside
        // set_driver_presence; no latitude/longitude are needed.
        const presence = await setDriverPresence(true, driverIsAvailable, driverAutoAccept)
        setDriverIsAvailable(presence.is_available)
        setDriverAutoAccept(presence.auto_accept)

        // No location tracking is started here: going online must not spin up
        // navigator.geolocation (watchPosition), request permission, or
        // require a first fix. The map remains fully functional — it simply
        // renders without a driver-marker position until one is shared.

        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null
        setRequest(null)
        setPendingOffer(null)
        setActiveRide(null)
        setDriverOnline(true)
        setPhase('online')
        setDriverView('queue')
      } else {
        await setDriverPresence(false, false, driverAutoAccept)
        stopTrackingRef.current?.()
        stopTrackingRef.current = null
        completedRideIdRef.current = null
        lastActiveRideIdRef.current = null
        dismissedOfferIdsRef.current.clear()
        setRequest(null)
        setPendingOffer(null)
        setActiveRide(null)
        setDriverOnline(false)
        setPhase('offline')
      }
    } catch (error) {
      console.error('Unable to toggle driver presence:', error)
      setPresenceError(resolvePresenceErrorMessage(error, driverOnline))
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

  const handleDismissExpiredOffer = () => {
    if (pendingOffer) {
      dismissedOfferIdsRef.current.add(pendingOffer.offer.id)
    }

    setPendingOffer(null)
    setRequest(null)
    setRequestError('')

    if (driverOnline) {
      setPhase('online')
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
      setDriverView('queue')
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
        dismissedOfferIdsRef.current.delete(pending.offer.id)
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
    setPakyawanRequestsError('')

    try {
      const updated = await acceptPakyawanBooking(bookingId, driverId)
      setPakyawanRequests((current) => current.filter((booking) => booking.id !== bookingId))
      setAcceptedPakyawan((current) =>
        current.some((booking) => booking.id === updated.id)
          ? current.map((booking) => (booking.id === updated.id ? updated : booking))
          : [updated, ...current].slice(0, 10),
      )
      setNotifications((current) => current.filter((item) => item.id !== `pakyawan-${bookingId}`))
      // Successful accept only: open the Pakyawan view so the assigned
      // booking and its price input are immediately visible.
      setDriverView('pakyawan')
    } catch (error) {
      console.error('Unable to accept pakyawan request:', error)
      setPakyawanRequestsError('This request could not be accepted. It may have been taken by another driver.')
    } finally {
      setPakyawanSubmittingId(null)
    }
  }

  const handleDeclinePakyawan = (bookingId: string) => {
    setPakyawanRequests((current) => current.filter((booking) => booking.id !== bookingId))
    setNotifications((current) => current.filter((item) => item.id !== `pakyawan-${bookingId}`))
  }

  const resolvePakyawanOfferError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/no longer available/i.test(message)) {
      return 'This request is no longer available. It may have been taken by another driver.'
    }

    if (/no longer eligible/i.test(message)) {
      return 'You are no longer eligible for this request.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleAcceptPakyawanOffer = async (offerId: string) => {
    if (pakyawanSubmittingId) {
      return
    }

    setPakyawanSubmittingId(offerId)
    setPakyawanOffersError('')

    try {
      const assigned = await acceptPakyawanOffer(offerId)
      setPakyawanOffers((current) => current.filter((offer) => offer.id !== offerId))
      setPakyawanRequests((current) => current.filter((booking) => booking.id !== assigned.id))
      setAcceptedPakyawan((current) =>
        current.some((booking) => booking.id === assigned.id)
          ? current.map((booking) => (booking.id === assigned.id ? assigned : booking))
          : [assigned, ...current].slice(0, 10),
      )
      setNotifications((current) => current.filter((item) => item.id !== `pakyawan-offer-${offerId}` && item.id !== `pakyawan-${assigned.id}`))
    } catch (error) {
      console.error('Unable to accept pakyawan offer:', error)
      setPakyawanOffersError(resolvePakyawanOfferError(error))

      try {
        const items = await fetchDriverPakyawanOffers(driverId)
        setPakyawanOffers(items)
      } catch (refreshError) {
        console.error('Unable to refresh pakyawan offers:', refreshError)
      }
    } finally {
      setPakyawanSubmittingId(null)
    }
  }

  const handleDeclinePakyawanOffer = async (offerId: string) => {
    if (pakyawanSubmittingId) {
      return
    }

    setPakyawanSubmittingId(offerId)
    setPakyawanOffersError('')

    try {
      await declinePakyawanOffer(offerId)
      setPakyawanOffers((current) => current.filter((offer) => offer.id !== offerId))
      setNotifications((current) => current.filter((item) => item.id !== `pakyawan-offer-${offerId}`))
    } catch (error) {
      console.error('Unable to decline pakyawan offer:', error)
      setPakyawanOffersError(resolvePakyawanOfferError(error))

      try {
        const items = await fetchDriverPakyawanOffers(driverId)
        setPakyawanOffers(items)
      } catch (refreshError) {
        console.error('Unable to refresh pakyawan offers:', refreshError)
      }
    } finally {
      setPakyawanSubmittingId(null)
    }
  }

  const resolvePakyawanPriceError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/not authorized/i.test(message)) {
      return 'You are not authorized to price this booking.'
    }

    if (/no longer assigned/i.test(message)) {
      return 'This booking is no longer assigned to you.'
    }

    if (/already been sent/i.test(message)) {
      return 'The trip price has already been sent.'
    }

    if (/no longer waiting/i.test(message)) {
      return 'This booking is no longer waiting for a trip price.'
    }

    if (/valid trip price/i.test(message)) {
      return 'Please enter a valid trip price.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleSendPakyawanPrice = async (bookingId: string) => {
    if (pakyawanPriceSubmittingId) {
      return
    }

    const raw = (pakyawanPriceInputs[bookingId] ?? '').replace(/[₱,\s]/g, '')
    const pesos = Number(raw)

    if (!raw || !Number.isFinite(pesos) || pesos < 0) {
      setPakyawanPriceError({ bookingId, message: 'Please enter a valid trip price.' })
      return
    }

    setPakyawanPriceSubmittingId(bookingId)
    setPakyawanPriceError(null)

    try {
      const updated = await setPakyawanDriverPrice(bookingId, Math.round(pesos * 100))
      setAcceptedPakyawan((current) =>
        current.map((booking) => (booking.id === bookingId ? updated : booking)),
      )
      setPakyawanPriceInputs((current) => {
        const next = { ...current }
        delete next[bookingId]
        return next
      })
    } catch (error) {
      console.error('Unable to send pakyawan trip price:', error)
      setPakyawanPriceError({ bookingId, message: resolvePakyawanPriceError(error) })
    } finally {
      setPakyawanPriceSubmittingId(null)
    }
  }

  const formatPakyawanOfferCountdown = (expiresAt: string): string => {
    const remainingMs = new Date(expiresAt).getTime() - pakyawanNow

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      return 'Expiring...'
    }

    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  // Presentation-only formatting for the mobile Pakyawan request card.
  const formatPakyawanCardDate = (value: string | null | undefined): { main: string; sub: string } => {
    if (!value) {
      return { main: '—', sub: '' }
    }

    const parsed = new Date(`${value}T00:00:00`)

    if (Number.isNaN(parsed.getTime())) {
      return { main: value, sub: '' }
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    return {
      main: `${months[parsed.getMonth()]} ${parsed.getDate()}`,
      sub: `${days[parsed.getDay()]} · ${parsed.getFullYear()}`,
    }
  }

  const formatPakyawanCardTime = (value: string | null | undefined): string => {
    if (!value) {
      return '—'
    }

    const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(value.trim())

    if (!match) {
      return value
    }

    const hours24 = Number(match[1])
    const minutes = match[2]

    if (!Number.isFinite(hours24)) {
      return value
    }

    const period = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12

    return `${hours12}:${minutes} ${period}`
  }

  const pakyawanCardStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Waiting for accept'
      case 'assigned':
        return 'Assigned to you'
      case 'quoted':
        return 'Waiting for confirmation'
      case 'scheduled':
        return 'Scheduled'
      case 'driver_on_way':
        return 'Driver on the way'
      case 'driver_arrived':
        return 'Driver arrived'
      case 'in_progress':
        return 'Trip in progress'
      case 'completed':
        return 'Completed'
      case 'cancelled':
        return 'Cancelled'
      default:
        return status.toUpperCase().replace(/_/g, ' ')
    }
  }

  // Single shared request-card renderer for the inline Pakyawan list and the
  // foreground popup. Same data, same handlers — presentation only.
  const renderPakyawanRequestCard = (booking: PakyawanBooking, options: { eyebrow: string | null; acceptLabel: string }) => {
    const date = formatPakyawanCardDate(booking.booking_date)
    const time = formatPakyawanCardTime(booking.pickup_time)
    const priceCents = typeof booking.price_cents === 'number' && Number.isFinite(booking.price_cents) ? booking.price_cents : null

    return (
      <li key={booking.id} className="pak-req">
        <div className="pak-req-top">
          {options.eyebrow ? <span className="pak-req-eyebrow">{options.eyebrow}</span> : <span />}
          <span className="pak-req-status">{pakyawanCardStatusLabel(booking.status)}</span>
        </div>
        <div className="pak-req-route">
          <div className="pak-req-stop">
            <span className="pak-req-dot is-pickup" aria-hidden="true" />
            <div className="pak-req-stop-copy">
              <span className="pak-req-label">Pickup</span>
              <strong className="pak-req-place">{booking.pickup_location}</strong>
            </div>
          </div>
          <div className="pak-req-leg" aria-hidden="true">
            <span className="pak-req-leg-rail" />
          </div>
          <div className="pak-req-stop">
            <span className="pak-req-dot is-destination" aria-hidden="true" />
            <div className="pak-req-stop-copy">
              <span className="pak-req-label">Destination</span>
              <strong className="pak-req-place">{booking.destination}</strong>
            </div>
          </div>
        </div>
        <div className="pak-req-grid">
          <div className="pak-req-cell">
            <span className="pak-req-label">Date</span>
            <strong>{date.main}</strong>
            {date.sub ? <small>{date.sub}</small> : null}
          </div>
          <div className="pak-req-cell">
            <span className="pak-req-label">Time</span>
            <strong>{time}</strong>
            {booking.estimated_hours ? (
              <small>
                ~{booking.estimated_hours} hr{booking.estimated_hours === 1 ? '' : 's'} trip
              </small>
            ) : (
              <small>Scheduled pickup</small>
            )}
          </div>
          <div className="pak-req-cell">
            <span className="pak-req-label">Passengers</span>
            <strong>{booking.passengers}</strong>
            <small>{booking.trip_type}</small>
          </div>
        </div>
        <div className="pak-req-split">
          <div className="pak-req-party">
            <span className="pak-req-label">Customer</span>
            <strong>{booking.customer_name}</strong>
            <small>{booking.customer_phone}</small>
          </div>
          <div className="pak-req-party pak-req-price">
            <span className="pak-req-label">Trip price</span>
            <strong>{priceCents !== null ? `₱${formatCentavos(priceCents)}` : '—'}</strong>
            <small>{pakyawanCardStatusLabel(booking.status)}</small>
          </div>
        </div>
        <div className="pak-req-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleAcceptPakyawan(booking.id)}
            disabled={pakyawanSubmittingId === booking.id}
          >
            {pakyawanSubmittingId === booking.id ? 'Accepting...' : options.acceptLabel}
          </button>
          <button
            type="button"
            className="secondary-action"
            onClick={() => handleDeclinePakyawan(booking.id)}
            disabled={pakyawanSubmittingId !== null}
          >
            Not now
          </button>
        </div>
      </li>
    )
  }

  const activePakyawanOffers = pakyawanOffers.filter(
    (offer) => new Date(offer.expires_at).getTime() > pakyawanNow,
  )

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

  const formatDeliveryOfferCountdown = (expiresAt: string): string => {
    const remainingMs = new Date(expiresAt).getTime() - deliveryNow

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      return 'Expiring...'
    }

    const totalSeconds = Math.ceil(remainingMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    return `${minutes}:${String(seconds).padStart(2, '0')}`
  }

  const activeDeliveryOffers = deliveryOffers.filter(
    (offer) => new Date(offer.expires_at).getTime() > deliveryNow,
  )

  const resolveDeliveryAcceptError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/no longer available/i.test(message)) {
      return 'This request is no longer available. It may have been taken by another driver.'
    }

    if (/no longer eligible/i.test(message)) {
      return 'You are no longer eligible for this request.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleAcceptDeliveryOffer = async (offerId: string) => {
    if (deliverySubmittingId) {
      return
    }

    setDeliverySubmittingId(offerId)
    setDeliveryError('')

    try {
      const assigned = await acceptDeliveryOffer(offerId)
      setDeliveryOffers((current) => current.filter((offer) => offer.id !== offerId))
      setAcceptedDeliveries((current) =>
        current.some((booking) => booking.id === assigned.id)
          ? current.map((booking) => (booking.id === assigned.id ? assigned : booking))
          : [assigned, ...current].slice(0, 10),
      )
    } catch (error) {
      console.error('Unable to accept delivery offer:', error)
      setDeliveryError(resolveDeliveryAcceptError(error))

      try {
        const items = await fetchDriverDeliveryOffers(driverId)
        setDeliveryOffers(items)
      } catch (refreshError) {
        console.error('Unable to refresh delivery offers:', refreshError)
      }
    } finally {
      setDeliverySubmittingId(null)
    }
  }

  const handleAcceptDeliveryRequest = async (bookingId: string) => {
    if (deliverySubmittingId) {
      return
    }

    setDeliverySubmittingId(bookingId)
    setDeliveryError('')

    try {
      const assigned = await acceptDeliveryBooking(bookingId, driverId)
      setDeliveryRequests((current) => current.filter((booking) => booking.id !== bookingId))
      setAcceptedDeliveries((current) =>
        current.some((booking) => booking.id === assigned.id)
          ? current.map((booking) => (booking.id === assigned.id ? assigned : booking))
          : [assigned, ...current].slice(0, 10),
      )
      setNotifications((current) => current.filter((item) => item.id !== `delivery-${bookingId}`))
    } catch (error) {
      console.error('Unable to accept delivery request:', error)
      setDeliveryError('This request could not be accepted. It may have been taken by another driver.')
      setDeliveryRequests((current) => current.filter((booking) => booking.id !== bookingId))

      try {
        const items = await fetchAvailableDeliveries()
        setDeliveryRequests(items)
      } catch (refreshError) {
        console.error('Unable to refresh delivery requests:', refreshError)
      }
    } finally {
      setDeliverySubmittingId(null)
    }
  }

  const handleDeclineDeliveryRequest = (bookingId: string) => {
    setDeliveryRequests((current) => current.filter((booking) => booking.id !== bookingId))
    setNotifications((current) => current.filter((item) => item.id !== `delivery-${bookingId}`))
  }

  const resolveDeliveryPriceError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/no longer assigned/i.test(message)) {
      return 'This delivery is no longer assigned to you.'
    }

    if (/already been sent/i.test(message)) {
      return 'The delivery fee has already been sent.'
    }

    if (/no longer waiting/i.test(message)) {
      return 'This delivery is no longer waiting for a delivery fee.'
    }

    if (/valid delivery fee/i.test(message)) {
      return 'Please enter a valid delivery fee.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleSendDeliveryPrice = async (bookingId: string) => {
    if (deliveryPriceSubmittingId) {
      return
    }

    const raw = (deliveryPriceInputs[bookingId] ?? '').replace(/[₱,\s]/g, '')
    const pesos = Number(raw)

    if (!raw || !Number.isFinite(pesos) || pesos <= 0) {
      setDeliveryPriceError({ deliveryId: bookingId, message: 'Please enter a valid delivery fee.' })
      return
    }

    setDeliveryPriceSubmittingId(bookingId)
    setDeliveryPriceError(null)

    try {
      const updated = await setDeliveryDriverPrice(bookingId, Math.round(pesos * 100))
      setAcceptedDeliveries((current) =>
        current.map((booking) => (booking.id === bookingId ? updated : booking)),
      )
      setDeliveryPriceInputs((current) => {
        const next = { ...current }
        delete next[bookingId]
        return next
      })
    } catch (error) {
      console.error('Unable to send delivery fee:', error)
      setDeliveryPriceError({ deliveryId: bookingId, message: resolveDeliveryPriceError(error) })
    } finally {
      setDeliveryPriceSubmittingId(null)
    }
  }

  const resolveDeliveryLifecycleError = (error: unknown): string => {
    const message = error instanceof Error ? error.message : ''

    if (/no longer assigned/i.test(message)) {
      return 'This delivery is no longer assigned to you.'
    }

    if (/cannot move to that status|invalid delivery status/i.test(message)) {
      return 'This delivery cannot move to that status right now.'
    }

    return 'Something went wrong. Please try again.'
  }

  const handleAdvanceDeliveryTrip = async (deliveryId: string, nextStatus: DeliveryLifecycleStatus) => {
    if (deliveryLifecycleSubmittingId) {
      return
    }

    setDeliveryLifecycleSubmittingId(deliveryId)
    setDeliveryLifecycleError(null)

    try {
      const updated = await advanceDeliveryStatus(deliveryId, nextStatus)

      try {
        const items = await fetchDriverDeliveries(driverId)
        setAcceptedDeliveries(items.slice(0, 10))
      } catch {
        setAcceptedDeliveries((current) =>
          current.map((booking) => (booking.id === deliveryId ? updated : booking)),
        )
      }
    } catch (error) {
      console.error('Unable to advance delivery trip:', error)
      setDeliveryLifecycleError({ deliveryId, message: resolveDeliveryLifecycleError(error) })

      try {
        const items = await fetchDriverDeliveries(driverId)
        setAcceptedDeliveries(items.slice(0, 10))
      } catch (refreshError) {
        console.error('Unable to refresh held deliveries:', refreshError)
      }
    } finally {
      setDeliveryLifecycleSubmittingId(null)
    }
  }

  const handleSelectDeliveryProof = (bookingId: string, file: File | undefined) => {
    if (!file) return

    const validation = validateDeliveryProofImage(file)
    if (!validation.valid) {
      setDeliveryLifecycleError({ deliveryId: bookingId, message: validation.message ?? 'Please take or choose a valid photo.' })
      return
    }

    setDeliveryProof((current) => {
      if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
      return { bookingId, file, previewUrl: URL.createObjectURL(file) }
    })
    setDeliveryLifecycleError(null)
  }

  const handleCompleteDeliveryWithProof = async (bookingId: string) => {
    if (isUploadingProof || !deliveryProof || deliveryProof.bookingId !== bookingId || !deliveryProof.file) {
      return
    }

    setIsUploadingProof(true)
    setDeliveryLifecycleError(null)

    const path = buildDeliveryProofPath(bookingId, deliveryProof.file)

    try {
      await uploadDeliveryProof(path, deliveryProof.file)

      try {
        const updated = await completeDeliveryWithProof(bookingId, path)

        try {
          const items = await fetchDriverDeliveries(driverId)
          setAcceptedDeliveries(items.slice(0, 10))
        } catch {
          setAcceptedDeliveries((current) => current.filter((booking) => booking.id !== bookingId).slice(0, 10))
        }

        setCompletedDeliveryNotice(updated)

        if (deliveryProof.previewUrl) URL.revokeObjectURL(deliveryProof.previewUrl)
        setDeliveryProof(null)
      } catch (rpcError) {
        await removeDeliveryProof(path)
        throw rpcError
      }
    } catch (error) {
      console.error('Unable to complete delivery with proof:', error)
      const message = error instanceof Error ? error.message : ''
      setDeliveryLifecycleError({
        deliveryId: bookingId,
        message: /proof photo|proof upload|no longer assigned|cannot be completed/i.test(message)
          ? message
          : 'Something went wrong. Please try again.',
      })

      try {
        const items = await fetchDriverDeliveries(driverId)
        setAcceptedDeliveries(items.slice(0, 10))
      } catch (refreshError) {
        console.error('Unable to refresh held deliveries:', refreshError)
      }
    } finally {
      setIsUploadingProof(false)
    }
  }

  const renderDeliveryPopup = () => {
    if (!canAcceptDeliveries) {
      return null
    }

    const popupBooking = deliveryRequests.length > 0 ? deliveryRequests[0] : null

    if (!popupBooking) {
      return null
    }

    const waitingCount = deliveryRequests.length - 1

    return (
      <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Incoming delivery request">
        <div className="ride-request-sheet">
          <section className="driver-card pakyawan-card">
            <div className="state-heading">
              <div>
                <p className="section-label">NEW DELIVERY REQUEST</p>
                <h3>Pa-Deliver / package delivery</h3>
                <p>A customer is requesting a package delivery. Accept to take it.</p>
              </div>
            </div>
            <ul className="pakyawan-list">
              <li className="pakyawan-item">
                <div className="pakyawan-route">
                  <span>{popupBooking.pickup_address}</span>
                  <strong>→</strong>
                  <span>{popupBooking.delivery_address}</span>
                </div>
                <div className="pakyawan-meta">
                  <span>
                    {popupBooking.preferred_date} · {popupBooking.preferred_time}
                  </span>
                  <span>
                    {popupBooking.package_type} · {popupBooking.package_size}
                  </span>
                  {popupBooking.package_details ? (
                    <span>{popupBooking.package_details}</span>
                  ) : null}
                </div>
                <div className="pakyawan-customer">
                  <span>{popupBooking.sender_name}</span>
                  <span>{popupBooking.sender_phone}</span>
                </div>
                {waitingCount > 0 ? (
                  <div className="pakyawan-meta">
                    <span>
                      {waitingCount} more request{waitingCount === 1 ? '' : 's'} waiting
                    </span>
                  </div>
                ) : null}
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="primary-action compact-button"
                    onClick={() => void handleAcceptDeliveryRequest(popupBooking.id)}
                    disabled={deliverySubmittingId === popupBooking.id}
                  >
                    {deliverySubmittingId === popupBooking.id ? 'Accepting...' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact-button"
                    onClick={() => handleDeclineDeliveryRequest(popupBooking.id)}
                    disabled={deliverySubmittingId !== null}
                  >
                    Not now
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    )
  }

  const renderPakyawanPopup = () => {
    if (!canAcceptPakyawan) {
      return null
    }

    // Foreground request card: independent of the Pakyawan tab and of the
    // dormant offers error state, so an incoming booking is always actionable.
    const popupBooking = pakyawanRequests.length > 0 ? pakyawanRequests[0] : null

    if (!popupBooking) {
      return null
    }

    const waitingCount = pakyawanRequests.length - 1

    return (
      <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Incoming Pakyawan request">
        <div className="ride-request-sheet">
          <section className="driver-card pakyawan-card">
            <div className="state-heading">
              <div>
                <p className="section-label">NEW PAKYAWAN REQUEST</p>
                <h3>Pakyawan / scheduled trip</h3>
                <p>A customer is requesting a Pakyawan trip. Accept to take it.</p>
              </div>
            </div>
            <ul className="pak-req-list">
              {renderPakyawanRequestCard(popupBooking, { eyebrow: null, acceptLabel: 'Accept Request' })}
            </ul>
            {waitingCount > 0 ? (
              <p className="pak-req-waiting">
                {waitingCount} more request{waitingCount === 1 ? '' : 's'} waiting
              </p>
            ) : null}
          </section>
        </div>
      </div>
    )
  }

  const handleClosePakyawanConfirmedPopup = () => {
    const bookingId = pakyawanConfirmedPopup?.id

    setPakyawanConfirmedPopup(null)

    if (bookingId) {
      setNotifications((items) => items.filter((item) => item.id !== `pakyawan-confirmed-${bookingId}`))
    }
  }

  const renderPakyawanConfirmedPopup = () => {
    if (!pakyawanConfirmedPopup) {
      return null
    }

    const confirmedBooking = pakyawanConfirmedPopup
    const priceCents =
      typeof confirmedBooking.price_cents === 'number' && Number.isFinite(confirmedBooking.price_cents)
        ? confirmedBooking.price_cents
        : null

    return (
      <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Pakyawan booking confirmed">
        <div className="ride-request-sheet">
          <section className="driver-card pakyawan-card">
            <div className="state-heading">
              <div>
                <p className="section-label">PAKYAWAN CONFIRMED</p>
                <h3>Passenger confirmed this trip</h3>
                <p>Continue with the scheduled trip below. No refresh needed.</p>
              </div>
            </div>
            <ul className="pak-req-list">
              <li className="pak-req">
                <div className="pak-req-route">
                  <div className="pak-req-stop">
                    <span className="pak-req-dot is-pickup" aria-hidden="true" />
                    <div className="pak-req-stop-copy">
                      <span className="pak-req-label">Pickup</span>
                      <strong className="pak-req-place">{confirmedBooking.pickup_location}</strong>
                    </div>
                  </div>
                  <div className="pak-req-leg" aria-hidden="true">
                    <span className="pak-req-leg-rail" />
                  </div>
                  <div className="pak-req-stop">
                    <span className="pak-req-dot is-destination" aria-hidden="true" />
                    <div className="pak-req-stop-copy">
                      <span className="pak-req-label">Destination</span>
                      <strong className="pak-req-place">{confirmedBooking.destination}</strong>
                    </div>
                  </div>
                </div>
                <div className="pak-req-grid">
                  <div className="pak-req-cell">
                    <span className="pak-req-label">Date</span>
                    <strong>{formatPakyawanCardDate(confirmedBooking.booking_date).main}</strong>
                  </div>
                  <div className="pak-req-cell">
                    <span className="pak-req-label">Time</span>
                    <strong>{formatPakyawanCardTime(confirmedBooking.pickup_time)}</strong>
                  </div>
                  <div className="pak-req-cell">
                    <span className="pak-req-label">Trip price</span>
                    <strong>{priceCents !== null ? `₱${formatCentavos(priceCents)}` : '—'}</strong>
                  </div>
                </div>
                <div className="pak-req-split">
                  <div className="pak-req-party">
                    <span className="pak-req-label">Customer</span>
                    <strong>{confirmedBooking.customer_name}</strong>
                    <small>{confirmedBooking.customer_phone}</small>
                  </div>
                </div>
                <div className="pak-req-actions">
                  <button type="button" className="primary-action" onClick={handleClosePakyawanConfirmedPopup}>
                    Close
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    )
  }

  const handleCloseDeliveryConfirmedPopup = () => {
    const bookingId = deliveryConfirmedPopup?.id

    setDeliveryConfirmedPopup(null)

    if (bookingId) {
      setNotifications((items) => items.filter((item) => item.id !== `delivery-confirmed-${bookingId}`))
    }
  }

  const handleViewDeliveryProof = async (bookingId: string) => {
    if (deliveryProofViewLoadingId) {
      return
    }

    setDeliveryProofViewLoadingId(bookingId)
    setDeliveryProofViewError(null)

    try {
      const paths = await fetchDeliveryProofPaths([bookingId])
      const path = paths[bookingId]

      if (!path) {
        throw new Error('No proof photo is available for this delivery yet.')
      }

      const url = await getDeliveryProofSignedUrl(path, 120)
      setDeliveryProofView({ bookingId, url })
    } catch (error) {
      console.error('Unable to load delivery proof:', error)
      setDeliveryProofViewError({
        bookingId,
        message: error instanceof Error && error.message ? error.message : 'Could not load the proof photo.',
      })
    } finally {
      setDeliveryProofViewLoadingId(null)
    }
  }

  const renderDeliveryConfirmedPopup = () => {
    if (!deliveryConfirmedPopup) {
      return null
    }

    const confirmedBooking = deliveryConfirmedPopup

    return (
      <PakyawanChatAlertPopup
        eyebrow="DELIVERY CONFIRMED"
        title="Customer confirmed this delivery"
        subtitle={`${confirmedBooking.pickup_address} → ${confirmedBooking.delivery_address}`}
        preview={`${confirmedBooking.preferred_date} · ${confirmedBooking.preferred_time}`}
        openLabel="View Delivery"
        closeLabel="Close"
        onOpen={() => {
          setDriverView('delivery')
          handleCloseDeliveryConfirmedPopup()
        }}
        onClose={handleCloseDeliveryConfirmedPopup}
      />
    )
  }

  const renderDeliveryTripOverlay = () => {
    if (!canAcceptDeliveries) {
      return null
    }

    const confirmedBooking = acceptedDeliveries.find(
      (booking) => booking.status === 'confirmed' && booking.driver_id === driverId,
    ) ?? null

    if (confirmedBooking) {
      return (
        <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Delivery confirmed">
          <div className="ride-request-sheet">
            <section className="driver-card pakyawan-card">
              <div className="state-heading">
                <div>
                  <p className="section-label">DELIVERY CONFIRMED</p>
                  <h3>The passenger confirmed the delivery fee.</h3>
                  <p>Next: go to the pickup location.</p>
                </div>
              </div>
              <ul className="pakyawan-list">
                <li className="pakyawan-item">
                  <div className="pakyawan-route">
                    <span>{confirmedBooking.pickup_address}</span>
                    <strong>→</strong>
                    <span>{confirmedBooking.delivery_address}</span>
                  </div>
                  <div className="pakyawan-meta">
                    <span>
                      {confirmedBooking.preferred_date} · {confirmedBooking.preferred_time}
                    </span>
                    {typeof confirmedBooking.price_cents === 'number' &&
                    Number.isFinite(confirmedBooking.price_cents) ? (
                      <span>Fee: ₱{formatCentavos(confirmedBooking.price_cents)}</span>
                    ) : null}
                  </div>
                  {deliveryLifecycleError && deliveryLifecycleError.deliveryId === confirmedBooking.id ? (
                    <span className="field-error">{deliveryLifecycleError.message}</span>
                  ) : null}
                  <div className="pakyawan-actions">
                    <button
                      type="button"
                      className="primary-action compact-button"
                      disabled={deliveryLifecycleSubmittingId === confirmedBooking.id}
                      onClick={() => void handleAdvanceDeliveryTrip(confirmedBooking.id, 'driver_on_way')}
                    >
                      {deliveryLifecycleSubmittingId === confirmedBooking.id ? 'Updating...' : 'Go On My Way'}
                    </button>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      )
    }

    if (completedDeliveryNotice) {
      return (
        <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Delivery completed">
          <div className="ride-request-sheet">
            <section className="driver-card pakyawan-card">
              <div className="state-heading">
                <div>
                  <p className="section-label">DELIVERY COMPLETED ✓</p>
                  <h3>Your Pa-Deliver was successfully completed.</h3>
                </div>
              </div>
              <ul className="pakyawan-list">
                <li className="pakyawan-item">
                  <div className="pakyawan-route">
                    <span>{completedDeliveryNotice.pickup_address}</span>
                    <strong>→</strong>
                    <span>{completedDeliveryNotice.delivery_address}</span>
                  </div>
                  <div className="pakyawan-meta">
                    <span>Reference: {completedDeliveryNotice.id.slice(0, 8)}…</span>
                    {typeof completedDeliveryNotice.price_cents === 'number' &&
                    Number.isFinite(completedDeliveryNotice.price_cents) ? (
                      <span>Fee: ₱{formatCentavos(completedDeliveryNotice.price_cents)}</span>
                    ) : null}
                  </div>
                  <div className="pakyawan-actions">
                    <button
                      type="button"
                      className="primary-action compact-button"
                      onClick={() => setCompletedDeliveryNotice(null)}
                    >
                      Back to dashboard
                    </button>
                  </div>
                </li>
              </ul>
            </section>
          </div>
        </div>
      )
    }

    return null
  }

  const deliveryTripNextCopy: Record<string, string> = {
    driver_on_way: 'Next: Mark the delivery arrived when you reach the pickup location.',
    driver_arrived: 'Next: Pick up the package from the passenger.',
    picked_up: 'Next: Start the delivery.',
    in_transit: 'Next: Complete the delivery when you reach the destination.',
  }

  const renderDeliverySection = () => {
    if (!canAcceptDeliveries) {
      return (
        <section className="driver-card pakyawan-card pakyawan-disabled">
          <div className="state-heading">
            <div>
              <p className="section-label">DELIVERY REQUESTS</p>
              <h3>Pa-Deliver / package deliveries</h3>
              <p>Delivery is not enabled for this account — contact admin.</p>
            </div>
          </div>
        </section>
      )
    }

    return (
      <section className="driver-card pakyawan-card">
        <div className="state-heading">
          <div>
            <p className="section-label">DELIVERY REQUESTS</p>
            <h3>Pa-Deliver / package deliveries</h3>
            <p>
              {deliveryRequests.length > 0 || activeDeliveryOffers.length > 0
                ? 'Customers are requesting package deliveries in your area. Accept a request to take it.'
                : 'No new delivery requests right now.'}
            </p>
          </div>
          <span className="state-badge pakyawan-badge">{deliveryRequests.length + activeDeliveryOffers.length}</span>
        </div>

        {deliveryError ? (
          <p className="form-error-message">{deliveryError}</p>
        ) : !driverOnline ? (
          <p className="muted-copy">Go online to receive delivery requests.</p>
        ) : null}

        {deliveryError || !driverOnline || deliveryRequests.length === 0 ? null : (
          <ul className="pakyawan-list">
            {deliveryRequests.map((booking) => (
              <li key={booking.id} className="pakyawan-item">
                <div className="pakyawan-route">
                  <span>{booking.pickup_address}</span>
                  <strong>→</strong>
                  <span>{booking.delivery_address}</span>
                </div>
                <div className="pakyawan-meta">
                  <span>
                    {booking.preferred_date} · {booking.preferred_time}
                  </span>
                  <span>
                    {booking.package_type} · {booking.package_size}
                  </span>
                  {booking.package_details ? (
                    <span>{booking.package_details}</span>
                  ) : null}
                </div>
                <div className="pakyawan-customer">
                  <span>{booking.sender_name}</span>
                  <span>{booking.sender_phone}</span>
                </div>
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="primary-action compact-button"
                    onClick={() => void handleAcceptDeliveryRequest(booking.id)}
                    disabled={deliverySubmittingId === booking.id}
                  >
                    {deliverySubmittingId === booking.id ? 'Accepting...' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact-button"
                    onClick={() => handleDeclineDeliveryRequest(booking.id)}
                    disabled={deliverySubmittingId !== null}
                  >
                    Not now
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {deliveryError || !driverOnline || activeDeliveryOffers.length === 0 ? null : (
          <ul className="pakyawan-list">
            {activeDeliveryOffers.map((offer) => (
              <li key={offer.id} className="pakyawan-item pakyawan-offer">
                <div className="pakyawan-route">
                  <span>{offer.booking.pickup_address}</span>
                  <strong>→</strong>
                  <span>{offer.booking.delivery_address}</span>
                </div>
                <div className="pakyawan-meta">
                  <span>
                    {offer.booking.preferred_date} · {offer.booking.preferred_time}
                  </span>
                  <span>
                    {offer.booking.package_type} · {offer.booking.package_size}
                  </span>
                  <span>This request expires in: {formatDeliveryOfferCountdown(offer.expires_at)}</span>
                </div>
                <div className="pakyawan-customer">
                  <span>{offer.booking.sender_name}</span>
                  <span>{offer.booking.sender_phone}</span>
                </div>
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="primary-action compact-button"
                    onClick={() => void handleAcceptDeliveryOffer(offer.id)}
                    disabled={deliverySubmittingId === offer.id}
                  >
                    {deliverySubmittingId === offer.id ? 'Accepting...' : 'Accept Request'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {acceptedDeliveries.length > 0 ? (
          <div className="pakyawan-accepted">
            <p className="section-label">ACCEPTED BY YOU</p>
            <ul className="pakyawan-accepted-list">
              {acceptedDeliveries.map((booking) => (
                <li key={booking.id}>
                  <strong>
                    {booking.pickup_address} → {booking.delivery_address}
                  </strong>
                  <span>
                    {booking.preferred_date} · {booking.preferred_time}
                  </span>
                  {booking.status === 'assigned' ? (
                    <>
                      <span>You&apos;re assigned to this delivery.</span>
                      <span>Status: ASSIGNED</span>
                    </>
                  ) : booking.status === 'quoted' ? (
                    <>
                      <span>Delivery fee sent. Waiting for customer confirmation.</span>
                      <span>Status: QUOTED</span>
                    </>
                  ) : booking.status === 'confirmed' ? (
                    <>
                      <span>Delivery confirmed. You can start the trip.</span>
                      <span>Status: CONFIRMED</span>
                    </>
                  ) : (
                    <span>Status: {booking.status.toUpperCase().replace(/_/g, ' ')}</span>
                  )}
                  {deliveryTripNextCopy[booking.status] ? (
                    <span>{deliveryTripNextCopy[booking.status]}</span>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'assigned' ? (
                    <div className="pakyawan-price-box">
                      <span className="field-label">Next step: send your delivery fee.</span>
                      <div className="pakyawan-price-row">
                        <span aria-hidden="true">₱</span>
                        <input
                          className="input-field slim-input"
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label="Delivery fee in pesos"
                          value={deliveryPriceInputs[booking.id] ?? ''}
                          disabled={deliveryPriceSubmittingId === booking.id}
                          onChange={(event) => {
                            setDeliveryPriceInputs((current) => ({ ...current, [booking.id]: event.target.value }))
                            setDeliveryPriceError((current) =>
                              current && current.deliveryId === booking.id ? null : current,
                            )
                          }}
                        />
                        <button
                          type="button"
                          className="secondary-action compact-button"
                          disabled={deliveryPriceSubmittingId === booking.id}
                          onClick={() => void handleSendDeliveryPrice(booking.id)}
                        >
                          {deliveryPriceSubmittingId === booking.id ? 'Sending...' : 'Send Fee'}
                        </button>
                      </div>
                      {deliveryPriceError && deliveryPriceError.deliveryId === booking.id ? (
                        <span className="field-error">{deliveryPriceError.message}</span>
                      ) : null}
                    </div>
                  ) : booking.status === 'quoted' &&
                    typeof booking.price_cents === 'number' &&
                    Number.isFinite(booking.price_cents) ? (
                    <div className="pakyawan-price-box">
                      <span className="field-label">Your delivery fee: ₱{formatCentavos(booking.price_cents)}</span>
                      <span>Waiting for customer confirmation.</span>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'confirmed' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={deliveryLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvanceDeliveryTrip(booking.id, 'driver_on_way')}
                      >
                        {deliveryLifecycleSubmittingId === booking.id ? 'Updating...' : 'On My Way'}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'driver_on_way' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={deliveryLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvanceDeliveryTrip(booking.id, 'driver_arrived')}
                      >
                        {deliveryLifecycleSubmittingId === booking.id ? 'Updating...' : "I've Arrived"}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'driver_arrived' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={deliveryLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvanceDeliveryTrip(booking.id, 'picked_up')}
                      >
                        {deliveryLifecycleSubmittingId === booking.id ? 'Updating...' : 'Package Picked Up'}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'picked_up' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={deliveryLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvanceDeliveryTrip(booking.id, 'in_transit')}
                      >
                        {deliveryLifecycleSubmittingId === booking.id ? 'Updating...' : 'Start Delivery'}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'in_transit' ? (
                    <div className="pakyawan-price-box">
                      <span className="field-label">Take a photo to confirm delivery.</span>
                      {deliveryProof?.bookingId === booking.id && deliveryProof.previewUrl ? (
                        <>
                          <img
                            src={deliveryProof.previewUrl}
                            alt="Delivery proof preview"
                            className="proof-preview"
                          />
                          <div className="pakyawan-actions">
                            <button
                              type="button"
                              className="primary-action compact-button"
                              disabled={isUploadingProof}
                              onClick={() => void handleCompleteDeliveryWithProof(booking.id)}
                            >
                              {isUploadingProof ? 'Uploading...' : 'Upload & Complete'}
                            </button>
                            <button
                              type="button"
                              className="secondary-action compact-button"
                              disabled={isUploadingProof}
                              onClick={() => {
                                if (deliveryProof?.previewUrl) URL.revokeObjectURL(deliveryProof.previewUrl)
                                setDeliveryProof({ bookingId: booking.id, file: null, previewUrl: null })
                              }}
                            >
                              Retake
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="pakyawan-actions">
                          <label className="primary-action compact-button" aria-disabled={isUploadingProof}>
                            {isUploadingProof ? 'Uploading...' : 'Complete Delivery'}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              hidden
                              disabled={isUploadingProof}
                              onChange={(event) => {
                                handleSelectDeliveryProof(booking.id, event.target.files?.[0])
                                event.target.value = ''
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'delivered' ? (
                    <div className="pad-proof-box">
                      <span className="field-label">Proof of delivery: Available</span>
                      <div className="pakyawan-actions">
                        <button
                          type="button"
                          className="secondary-action compact-button"
                          disabled={deliveryProofViewLoadingId === booking.id}
                          onClick={() => void handleViewDeliveryProof(booking.id)}
                        >
                          {deliveryProofViewLoadingId === booking.id ? 'Loading...' : 'View Proof'}
                        </button>
                      </div>
                      {deliveryProofViewError && deliveryProofViewError.bookingId === booking.id ? (
                        <span className="field-error">{deliveryProofViewError.message}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {deliveryLifecycleError && deliveryLifecycleError.deliveryId === booking.id ? (
                    <span className="field-error">{deliveryLifecycleError.message}</span>
                  ) : null}
                  {deliveryProofView && deliveryProofView.bookingId === booking.id ? (
                    <div className="proof-viewer-overlay" role="dialog" aria-modal="true" aria-label="Proof of delivery">
                      <div className="proof-viewer-sheet">
                        <p className="proof-viewer-title">Proof of delivery</p>
                        <img src={deliveryProofView.url} alt="Proof of delivery" />
                        <div className="pak-req-actions">
                          <button type="button" className="secondary-action" onClick={() => setDeliveryProofView(null)}>
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    )
  }

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

        {pakyawanRequestsError ? (
          <>
            <p className="form-error-message">{pakyawanRequestsError}</p>
            <div className="pakyawan-actions">
              <button
                type="button"
                className="secondary-action compact-button"
                onClick={() => setPakyawanRequestsRetry((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          </>
        ) : !driverOnline ? (
          <p className="muted-copy">Go online to receive Pakyawan requests.</p>
        ) : null}

        {pakyawanOffersError ? (
          <p className="pak-req-note">{pakyawanOffersError}</p>
        ) : null}

        {pakyawanOffersError || !driverOnline || activePakyawanOffers.length === 0 ? null : (
          <ul className="pakyawan-list">
            {activePakyawanOffers.map((offer) => (
              <li key={offer.id} className="pakyawan-item pakyawan-offer">
                <div className="pakyawan-route">
                  <span>{offer.booking.pickup_location}</span>
                  <strong>→</strong>
                  <span>{offer.booking.destination}</span>
                </div>
                <div className="pakyawan-meta">
                  <span>
                    {offer.booking.booking_date} · {offer.booking.pickup_time}
                  </span>
                  <span>
                    {offer.booking.passengers} passenger{offer.booking.passengers === 1 ? '' : 's'} · {offer.booking.trip_type}
                  </span>
                  <span>This request expires in: {formatPakyawanOfferCountdown(offer.expires_at)}</span>
                </div>
                <div className="pakyawan-customer">
                  <span>{offer.booking.customer_name}</span>
                  <span>{offer.booking.customer_phone}</span>
                </div>
                <div className="pakyawan-actions">
                  <button
                    type="button"
                    className="primary-action compact-button"
                    onClick={() => void handleAcceptPakyawanOffer(offer.id)}
                    disabled={pakyawanSubmittingId === offer.id}
                  >
                    {pakyawanSubmittingId === offer.id ? 'Accepting...' : 'Accept Request'}
                  </button>
                  <button
                    type="button"
                    className="secondary-action compact-button"
                    onClick={() => void handleDeclinePakyawanOffer(offer.id)}
                    disabled={pakyawanSubmittingId !== null}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {pakyawanRequestsError || !driverOnline || pakyawanRequests.length === 0 ? null : (
          <ul className="pak-req-list">
            {pakyawanRequests.map((booking) => renderPakyawanRequestCard(booking, { eyebrow: 'New request', acceptLabel: 'Accept Request' }))}
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
                  {booking.status === 'assigned' ? (
                    <>
                      <span>You&apos;re assigned to this trip. Next: wait for the passenger&apos;s booking confirmation.</span>
                      <span>Status: ASSIGNED</span>
                    </>
                  ) : (
                    <span>Status: {booking.status.toUpperCase().replace(/_/g, ' ')}</span>
                  )}
                  {booking.status === 'assigned' && booking.driver_id === driverId ? (
                    <div className="pakyawan-price-box">
                      <span className="field-label">Next step: send your final trip price.</span>
                      <div className="pakyawan-price-row">
                        <span aria-hidden="true">₱</span>
                        <input
                          className="input-field slim-input"
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          aria-label="Trip price in pesos"
                          value={pakyawanPriceInputs[booking.id] ?? ''}
                          disabled={pakyawanPriceSubmittingId === booking.id}
                          onChange={(event) => {
                            setPakyawanPriceInputs((current) => ({ ...current, [booking.id]: event.target.value }))
                            setPakyawanPriceError((current) =>
                              current && current.bookingId === booking.id ? null : current,
                            )
                          }}
                        />
                        <button
                          type="button"
                          className="secondary-action compact-button"
                          disabled={pakyawanPriceSubmittingId === booking.id}
                          onClick={() => void handleSendPakyawanPrice(booking.id)}
                        >
                          {pakyawanPriceSubmittingId === booking.id ? 'Sending...' : 'Send Price'}
                        </button>
                      </div>
                      {pakyawanPriceError && pakyawanPriceError.bookingId === booking.id ? (
                        <span className="field-error">{pakyawanPriceError.message}</span>
                      ) : null}
                    </div>
                  ) : booking.status === 'quoted' &&
                    typeof booking.price_cents === 'number' &&
                    Number.isFinite(booking.price_cents) ? (
                    <div className="pakyawan-price-box">
                      <span className="field-label">Your trip price: ₱{formatCentavos(booking.price_cents)}</span>
                      <span>Waiting for passenger confirmation.</span>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'scheduled' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={pakyawanLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvancePakyawanTrip(booking.id, 'driver_on_way')}
                      >
                        {pakyawanLifecycleSubmittingId === booking.id ? 'Updating...' : 'On My Way'}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'driver_on_way' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={pakyawanLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvancePakyawanTrip(booking.id, 'driver_arrived')}
                      >
                        {pakyawanLifecycleSubmittingId === booking.id ? 'Updating...' : "I've Arrived"}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'driver_arrived' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={pakyawanLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvancePakyawanTrip(booking.id, 'in_progress')}
                      >
                        {pakyawanLifecycleSubmittingId === booking.id ? 'Updating...' : 'Start Trip'}
                      </button>
                    </div>
                  ) : null}
                  {booking.driver_id === driverId && booking.status === 'in_progress' ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="primary-action compact-button"
                        disabled={pakyawanLifecycleSubmittingId === booking.id}
                        onClick={() => void handleAdvancePakyawanTrip(booking.id, 'completed')}
                      >
                        {pakyawanLifecycleSubmittingId === booking.id ? 'Updating...' : 'Complete Trip'}
                      </button>
                    </div>
                  ) : null}
                  {booking.status === 'completed' ? <span>Trip completed.</span> : null}
                  {pakyawanLifecycleError && pakyawanLifecycleError.bookingId === booking.id ? (
                    <span className="field-error">{pakyawanLifecycleError.message}</span>
                  ) : null}
                  {booking.driver_id === driverId ? (
                    <div className="pakyawan-actions">
                      <button
                        type="button"
                        className="secondary-action compact-button"
                        onClick={() =>
                          setPakyawanChatBookingId((current) => (current === booking.id ? null : booking.id))
                        }
                      >
                        {pakyawanChatBookingId === booking.id ? 'Close Chat' : 'Chat with Passenger'}
                      </button>
                    </div>
                  ) : null}
                  {pakyawanChatBookingId === booking.id && booking.driver_id === driverId ? (
                    <PakyawanChat
                      bookingId={booking.id}
                      senderRole="driver"
                      otherPartyName={booking.customer_name}
                      enableRealtime
                      onClose={() => setPakyawanChatBookingId(null)}
                    />
                  ) : null}
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
              {driverProfile?.vehicleCapacity ? ` · ${formatVehicleCapacity(driverProfile.vehicleCapacity)}` : ''}
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
          <strong>{reputation ? reputation.completedRides : driverHistoryRides.length}</strong>
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
        <div><span>Passengers</span><strong>{request?.passenger_count} · {request?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Vehicle</span><strong>{formatVehicleType(request?.vehicle_type)}</strong></div>
      </div>

      {renderRideStops(request)}

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
        <button type="button" className="secondary-action" onClick={handleDecline} disabled={transitioning || offerExpired}>
          Decline
        </button>
        <button type="button" className="primary-action accept-cta" onClick={handleAcceptRide} disabled={transitioning || offerExpired} autoFocus={!offerExpired}>
          {offerExpired ? 'Offer Expired' : 'Accept Ride'}
        </button>
        {offerExpired ? (
          <button type="button" className="secondary-action" onClick={handleDismissExpiredOffer}>
            Dismiss
          </button>
        ) : null}
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
        <div><span>Vehicle</span><strong>{formatVehicleType(activeRide?.vehicle_type)}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="passenger-reputation" aria-label="Passenger rating">
        <span>Passenger rating</span>
        {renderPassengerReputationRow()}
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>
      {rideLocationNote ? <p className="driver-location-note">{rideLocationNote}</p> : null}

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
        <div><span>Vehicle</span><strong>{formatVehicleType(activeRide?.vehicle_type)}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>
      {rideLocationNote ? <p className="driver-location-note">{rideLocationNote}</p> : null}

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
        <div><span>Vehicle</span><strong>{formatVehicleType(activeRide?.vehicle_type)}</strong></div>
        <div><span>Passengers</span><strong>{activeRide?.passenger_count}</strong></div>
        <div><span>Passenger type</span><strong>{activeRide?.passenger_type ?? 'Regular'}</strong></div>
        <div><span>Fare</span><strong>{fareDisplayFor(activeRide)}</strong></div>
      </div>

      <div className="driver-map-panel"><MapView className="ride-map" height={260} driverLatitude={driverLocation?.latitude} driverLongitude={driverLocation?.longitude} pickupLatitude={passengerLocation?.latitude ?? activeRide?.pickup_lat} pickupLongitude={passengerLocation?.longitude ?? activeRide?.pickup_lng} /></div>
      {rideLocationNote ? <p className="driver-location-note">{rideLocationNote}</p> : null}

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
        <div><span>Vehicle</span><strong>{formatVehicleType(activeRide?.vehicle_type)}</strong></div>
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

  const [driverHistoryRides, setDriverHistoryRides] = useState<Ride[]>([])
  const [isLoadingDriverHistory, setIsLoadingDriverHistory] = useState(false)

  useEffect(() => {
    if (!driverId) {
      return
    }

    let cancelled = false
    setIsLoadingDriverHistory(true)

    void fetchDriverRideHistory(driverId)
      .then((items) => {
        if (!cancelled) {
          setDriverHistoryRides(items)
        }
      })
      .catch((error) => {
        console.error('Unable to load driver ride history:', error)
        if (!cancelled) {
          setDriverHistoryRides([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingDriverHistory(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [driverId])

  const mapDriverHistoryRide = (ride: Ride): DriverHistoryRide => {
    const date = new Date(ride.created_at)
    const localeDate = date.toLocaleDateString()
    const localeTime = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    const fare =
      typeof ride.fare_cents === 'number' && Number.isFinite(ride.fare_cents)
        ? `₱${formatCentavos(ride.fare_cents)}`
        : ride.fare_cents === null
          ? '—'
          : fareDisplayFor(ride)
    return {
      id: ride.id,
      pickup: ride.pickup_address,
      destination: ride.destination_address,
      date: `${localeDate} · ${localeTime}`,
      status: ride.status,
      fare,
    }
  }

  const renderRecentRides = () => {
    const historyRides = driverHistoryRides.map(mapDriverHistoryRide)

    return (
      <section className="driver-card history-card">
        <div className="section-heading">
          <div>
            <p className="section-label">RIDE HISTORY</p>
            <h3>Recent trips</h3>
          </div>
          <span className="history-count">{isLoadingDriverHistory ? '...' : `${historyRides.length} total`}</span>
        </div>

        {isLoadingDriverHistory ? (
          <p className="muted-copy">Loading ride history...</p>
        ) : historyRides.length === 0 ? (
          <p className="muted-copy">No completed trips yet.</p>
        ) : (
          <ul className="history-list">
            {historyRides.map((ride) => (
              <li key={ride.id} className="history-item">
                <div className="history-main">
                  <div className="history-passenger">
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
                  <span>{ride.status === 'cancelled' ? 'Cancelled trip' : 'Completed trip'}</span>
                  <strong>{ride.fare}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

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

      <div className="driver-back-row">
        <button type="button" className="driver-back-arrow" onClick={onBack} aria-label="Back to Bislig Ride" title="Back to Bislig Ride">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
        </button>
      </div>

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

      <nav className="driver-mini-nav" aria-label="Driver workspaces">
        {([
          { id: 'home', label: 'Home' },
          { id: 'queue', label: 'Ride Queue' },
          { id: 'profile', label: 'Profile' },
          { id: 'pakyawan', label: 'Pakyawan', count: pakyawanRequests.length + activePakyawanOffers.length },
          { id: 'delivery', label: 'Delivery', count: deliveryRequests.length + activeDeliveryOffers.length },
        ] as const).map((item) => (
          <button
            key={item.id}
            type="button"
            className={driverView === item.id ? 'secondary-action compact-button mini-nav-item is-active' : 'secondary-action compact-button mini-nav-item'}
            onClick={() => setDriverView(item.id)}
            aria-current={driverView === item.id ? 'page' : undefined}
          >
            {item.label}
            {'count' in item && item.count > 0 ? <span className="mini-nav-badge">{item.count}</span> : null}
          </button>
        ))}
      </nav>

      {driverView === 'home' ? (
        <>
          {phase === 'offline' ? (
            <section className="driver-card work-state work-offline">
              <div className="state-heading">
                <div>
                  <p className="section-label">AVAILABILITY</p>
                  <h3>You&apos;re currently offline</h3>
                  <p>Go online to start receiving requests, or review your recent activity below.</p>
                </div>
                <span className="state-badge offline-badge">OFFLINE</span>
              </div>
              <div className="work-cta">
                <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning}>
                  {transitioning ? 'Going Online...' : 'Go Online'}
                </button>
              </div>
            </section>
          ) : null}

          {(activeRide || pendingOffer) && phase !== 'offline' ? (
            <section className="driver-card work-state">
              <div className="state-heading">
                <div>
                  <p className="section-label">ACTIVE RIDE</p>
                  <h3>You have an active ride</h3>
                  <p>Your trip is waiting in the Ride Queue workspace.</p>
                </div>
              </div>
              <div className="work-cta">
                <button type="button" className="secondary-action compact-button" onClick={() => setDriverView('queue')}>
                  Open Ride Queue
                </button>
              </div>
            </section>
          ) : null}

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

          {renderRecentRides()}
        </>
      ) : null}

      {driverView === 'profile' ? (
        <>
          {renderSummary()}

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
        </>
      ) : null}

      {driverView === 'queue' ? (
        <div className="driver-operations">
          {phase === 'offline' ? renderOfflineState() : null}
          {phase === 'online' ? renderOnlineState() : null}
          {phase === 'heading_to_pickup' ? renderHeadingToPickup() : null}
          {phase === 'arrived' ? renderArrivedState() : null}
          {phase === 'in_progress' ? renderInProgressState() : null}
          {phase === 'completed' ? renderCompletedState() : null}
        </div>
      ) : null}

      {driverView === 'pakyawan' ? renderPakyawanSection() : null}

      {driverView === 'delivery' ? renderDeliverySection() : null}

      {phase === 'incoming_request' && pendingOffer ? (
        <div className="ride-request-overlay" role="dialog" aria-modal="true" aria-label="Incoming ride request">
          <div className="ride-request-sheet">
            {renderIncomingRequest()}
          </div>
        </div>
      ) : null}

      {renderDeliveryPopup()}

      {renderPakyawanPopup()}

      {renderPakyawanConfirmedPopup()}

      {renderDeliveryConfirmedPopup()}

      {pakyawanChatAlert ? (
        <PakyawanChatAlertPopup
          eyebrow="NEW MESSAGE"
          title="Pakyawan chat"
          subtitle={pakyawanChatAlert.route}
          preview={pakyawanChatAlert.preview}
          openLabel="Open Chat"
          closeLabel="Close"
          onOpen={() => {
            setPakyawanChatBookingId(pakyawanChatAlert.bookingId)
            setDriverView('pakyawan')
            setPakyawanChatAlert(null)
          }}
          onClose={() => setPakyawanChatAlert(null)}
        />
      ) : null}

      {renderDeliveryTripOverlay()}

      <div className="driver-mobile-actions">
        <button type="button" className="primary-action" onClick={handleToggleOnline} disabled={transitioning} aria-label={driverOnline ? 'Go offline' : 'Go online'}>
          {driverOnline ? 'Go Offline' : 'Go Online'}
        </button>
        <button type="button" className="secondary-action" onClick={handleOpenNotifications} aria-label={`Open notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}>
          Notifications{unreadNotificationCount > 0 ? ` (${unreadNotificationCount})` : ''}
        </button>
      </div>

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









