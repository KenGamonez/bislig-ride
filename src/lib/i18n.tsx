import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

export type AppLanguage = 'en' | 'bi'

export const LANGUAGE_STORAGE_KEY = 'bislig-ride-language'

const en = {
  /* Header / navigation */
  'nav.home': 'Home',
  'nav.bookPakyawan': 'Book Pakyawan',
  'nav.driverLogin': 'Driver Login',
  'nav.contact': 'Contact',
  'nav.becomeDriver': 'Become a Driver',
  'nav.myRides': 'My Rides',
  'nav.profile': 'Profile',
  'nav.bookRide': 'Book a Ride',
  'nav.exploreBislig': 'Explore Bislig',
  'nav.pasabuy': 'Pasabuy',
  'nav.comingSoon': 'Coming soon',
  'nav.paDeliver': 'Pa-deliver',
  'nav.carRentals': 'Car Rentals',
  'nav.openMenu': 'Open navigation menu',
  'nav.closeMenu': 'Close navigation menu',
  'nav.ariaMain': 'Main navigation',
  'nav.ariaMobile': 'Mobile navigation',
  'nav.beta': 'Beta',
  'nav.betaTitle': 'Bislig Ride is in beta',
  'header.footerCity': 'Bislig City',
  'header.footerTagline': 'Ride local. Move freely.',
  'header.ariaPrimary': 'Primary mobile navigation',

  /* Footer */
  'footer.rights': '2026 Bislig Ride. All Rights Reserved.',

  /* Announcement ticker */
  'ticker.onboarding':
    'Bislig Ride is currently onboarding our founding drivers',
  'ticker.moreRides': 'More rides coming soon',
  'ticker.aria':
    'Bislig Ride announcement: currently onboarding founding drivers',

  /* Weather */
  'weather.label': 'Bislig City Weather',
  'weather.context': "Plan your ride around today's weather.",
  'weather.checking': 'Checking current conditions...',
  'weather.unavailable':
    'Weather is temporarily unavailable. Your ride booking is still ready.',
  'weather.feelsLike': 'Feels like',
  'weather.humidity': 'Humidity',
  'weather.rain': 'Rain',
  'weather.updatedNow': 'Updated just now',
  'weather.updatedAgo': 'Updated {minutes} minute(s) ago',
  'weather.clear': 'Clear sky',
  'weather.sunny': 'Mostly sunny',
  'weather.cloudy': 'Cloudy',
  'weather.foggy': 'Foggy',
  'weather.drizzle': 'Light drizzle',
  'weather.lightRain': 'Light rain',
  'weather.snow': 'Snow',
  'weather.storm': 'Thunderstorm',
  'weather.mixed': 'Mixed conditions',

  /* Homepage service dashboard */
  'dash.eyebrow': 'Bislig Ride',
  'dash.title1': 'What do you need',
  'dash.title2': 'today?',
  'dash.subtitle': 'Choose how you want to move around Bislig City.',
  'dash.popular': 'Popular',
  'dash.rideNow': 'Ride Now',
  'dash.rideNowCopy': 'Get moving around Bislig City.',
  'dash.otherWays': 'Other ways to move',
  'dash.pakyawan': 'Pakyawan',
  'dash.pakyawanDesc': 'Reserve a vehicle for longer trips.',
  'dash.paDeliver': 'Pa-deliver',
  'dash.paDeliverDesc': 'Send packages across Bislig.',
  'dash.carRentals': 'Car Rentals',
  'dash.carRentalsDesc': 'Rent a vehicle by the day.',

  /* Homepage carousel */
  'carousel.aria': 'Discover more ways to use Bislig Ride',
  'carousel.kicker': 'Also available',
  'carousel.title1': 'Discover',
  'carousel.title2': 'Bislig Ride',
  'carousel.dot': 'Go to card {index} of {total}: {title}',
  'carousel.city.kicker': 'Everyday trips',
  'carousel.city.title': 'City hops, anytime',
  'carousel.city.desc':
    'Quick on-demand motorbike rides across Bislig City and nearby barangays.',
  'carousel.city.cta': 'Ride Now',
  'carousel.trips.kicker': 'Whole-day trips',
  'carousel.trips.title': 'Family trips & events',
  'carousel.trips.desc':
    'A private Pakyawan vehicle for out-of-town trips, airport transfers, and gatherings.',
  'carousel.trips.cta': 'Book Pakyawan',
  'carousel.deliver.kicker': 'Same-day sending',
  'carousel.deliver.title': 'Packages across Bislig',
  'carousel.deliver.desc':
    'Send documents, parcels, and small items to any barangay in the city.',
  'carousel.deliver.cta': 'Pa-deliver',
  'carousel.cars.kicker': 'Ride in comfort',
  'carousel.cars.title': 'Cars for the day',
  'carousel.cars.desc':
    'Rent a sedan, SUV, or van for your errands — self-drive or with a driver.',
  'carousel.cars.cta': 'Car Rentals',

  /* Booking */
  'book.eyebrow': 'BISLIG CITY',
  'book.heroWhere1': 'Where are',
  'book.heroWhere2': 'you going?',
  'book.subtitle':
    'Get a reliable ride around Bislig City — simple, convenient, and made for your everyday trips.',
  'book.chooseService': 'Choose a service',
  'book.rideNowSmall': 'On-demand motorbike trips around Bislig City',
  'book.pakyawanSmall': 'Scheduled private & whole-day trips',
  'book.tripDetails': 'Trip details',
  'book.tripDetailsHint': 'Choose your pickup and destination',
  'book.pickup': 'Pickup',
  'book.pickupOptional': 'Pickup landmark (optional)',
  'book.pickupLandmarkPlaceholder': 'Add a nearby landmark (optional)',
  'book.pickupPlaceholder': 'Enter pickup location',
  'book.pickupHelp': 'Enter your pickup location, or tap',
  'book.useCurrentLocation': 'Use my current location',
  'book.locationDetected': 'Your current location has been located.',
  'book.destination': 'Destination',
  'book.whereTo': 'Where to?',
  'book.destinationPlaceholder': 'Enter destination location',
  'book.passengerDetails': 'Passenger details',
  'book.passengerDetailsHint': 'So your driver knows who to meet',
  'book.name': 'Name',
  'book.namePlaceholder': 'Enter your name',
  'book.passengerType': 'Passenger type',
  'book.ridePreferences': 'Ride preferences',
  'book.ridePreferencesHint': 'Set up your trip before requesting',
  'book.vehicle': 'Vehicle',
  'book.passengers': 'Passengers',
  'book.numPassengers': 'Number of passengers',
  'book.motorcycleNote': 'Motorcycle rides carry exactly 1 passenger.',
  'book.passengerNameHint': 'Passenger name',
  'book.passengersTypeFare': 'Passengers, type & fare',
  'book.pickupHint': 'Where should we pick you up?',
  'book.destinationHint': 'Enter your destination',
  'book.currentLocationSet': 'Current location set',
  'book.fareEstimated': 'Estimated fare',
  'book.fare': 'Fare',
  'book.fareTraditional': 'Fare handled traditionally with the driver.',
  'book.fareMatrix':
    'Bislig City official fare matrix · Fuel price Level L{level}',
  'book.requesting': 'Requesting...',
  'book.requestRide': 'Request Ride',
  'book.lookingDriver':
    'Looking for an available Bislig Ride driver nearby...',
  'book.noDriverText':
    'We could not find an available driver for this trip at the moment. Try dispatching your ride again or cancel it.',
  'book.onTheWay': 'Your driver is on the way.',
  'book.sharingLive': 'Sharing your live location with your driver.',
  'book.shareTip': 'Share your live location so your driver can find you more easily.',
  'book.shareMyLocation': 'Share my location',
  'book.chat': 'Chat',
  'book.driverUpdatesStatus':
    'Your driver will update the ride status when they arrive.',
  'book.arrivedLead':
    'Your driver has arrived. The trip will begin when your driver starts the ride.',
  'book.inProgressLead':
    'Your ride is in progress. Your driver will complete the trip when you reach your destination.',
  'book.thanks': 'Thanks for riding with Bislig Ride.',
  'book.continueToPayment': 'Continue to Payment',
  'book.view': 'View',
  'book.tryAgain': 'Try Again',
  'book.findingDriverAction': 'Finding a driver...',
  'book.cancelRide': 'Cancel Ride',
  'book.noDriverTitle': 'No driver available right now',
  'book.ride': 'ride',
  'book.onePassenger': '1 passenger',
  'book.nPassengers': '{count} passengers',
  'book.fivePlusPassengers': '5+ passengers',
  'book.yourDriver': 'Your driver',

  /* Ride summary labels */
  'summary.pickup': 'Pickup',
  'summary.destination': 'Destination',
  'summary.passengers': 'Passengers',
  'summary.vehicle': 'Vehicle',
  'summary.passengerType': 'Passenger Type',
  'summary.fare': 'Fare',
  'summary.driver': 'Driver',
  'summary.reason': 'Reason',
  'summary.route': 'Route',
  'summary.paymentMethod': 'Payment method',
  'summary.ride': 'Ride',
  'summary.completed': 'Completed',
  'summary.yourRating': 'Your rating',
  'summary.color': 'Color',
  'summary.plate': 'Plate',

  /* Ride status */
  'status.searching': 'Finding a driver',
  'status.accepted': 'Driver accepted',
  'status.arrived': 'Your driver has arrived',
  'status.inProgress': 'Ride in progress',
  'status.completed': 'Ride completed',
  'status.cancelled': 'Ride cancelled',
  'status.rateYourRide': 'Rate your ride',
  'status.searchBadge': 'SEARCHING',
  'status.noDriverBadge': 'NO DRIVER',
  'status.acceptedBadge': 'DRIVER ON THE WAY',
  'status.arrivedBadge': 'ARRIVED',
  'status.inProgressBadge': 'RIDE IN PROGRESS',
  'status.completedBadge': 'RIDE COMPLETED',
  'status.cancelledBadge': 'CANCELLED',
  'status.paymentBadge': 'PAYMENT',
  'status.paymentRecordedBadge': 'PAYMENT RECORDED',
  'status.findingDriverAria': 'Finding your driver',
  'status.noDriverAria': 'No driver available',
  'status.byDriver': 'Your driver cancelled this ride.',
  'status.byYou': 'You cancelled this ride.',
  'status.noReason': 'No reason provided.',
  'status.driverAcceptedStep': 'Driver accepted',
  'status.arrivedStep': 'Arrived',
  'status.inProgressStep': 'Ride in progress',
  'status.destinationStep': 'Destination',

  /* Driver info */
  'driver.loadingReputation': 'Loading reputation...',
  'driver.noRatings': 'New driver · no ratings yet',
  'driver.ratingWord': 'rating',
  'driver.ratingsCount': 'ratings',
  'driver.ratingSummary': '{avg}/5 ({total} {countLabel}) · {cancel} cancellation rate',
  'driver.cancellationRate': 'cancellation rate',
  'driver.vehicleLabel': 'Vehicle',
  'driver.plateLabel': 'Plate',

  /* Rating & payment */
  'rating.howWasRide': 'How was your ride?',
  'rating.rateExperience': 'Rate your experience with {name}.',
  'rating.aria': 'Rate your ride from 1 to 5 stars',
  'rating.starWord': 'star',
  'rating.starWords': 'stars',
  'rating.comment': 'Comment',
  'rating.optional': '(optional)',
  'rating.placeholder': 'Tell us about your experience...',
  'rating.submitting': 'Submitting...',
  'rating.submit': 'Submit Rating',
  'rating.thankYou': 'Thank you!',
  'rating.feedback': 'Your feedback helps us improve Bislig Ride.',
  'rating.failed': 'Unable to submit your rating. Please try again.',
  'rating.ownerOnly': 'This ride can only be rated from the browser or device that booked it.',
  'payment.payment': 'Payment',
  'payment.aria': 'Payment method selection',
  'payment.cashNote': 'Pay the driver directly.',
  'payment.gcashNote': 'GCash payment will be confirmed manually.',
  'payment.confirm': 'Confirm Payment',
  'payment.recorded': 'Payment recorded',
  'payment.methodCash': 'Cash',
  'payment.methodGcash': 'GCash',

  /* Cancellation */
  'cancel.title': 'Cancel this ride?',
  'cancel.letDriverKnow': 'Let the driver know why.',
  'cancel.letPassengerKnow': 'Let the passenger know why.',
  'cancel.closeAria': 'Keep the ride and close',
  'cancel.note':
    'Your ride will be cancelled and the {role} will be notified right away. Why are you cancelling?',
  'cancel.reasonsLabel': 'Cancellation reason',
  'cancel.foundAnotherRide': 'I found another ride',
  'cancel.plansChanged': 'My plans changed',
  'cancel.driverTooLong': 'Driver is taking too long',
  'cancel.wrongRoute': 'Wrong pickup or destination',
  'cancel.other': 'Other',
  'cancel.vehicleProblem': 'Vehicle problem',
  'cancel.emergency': 'Emergency',
  'cancel.cannotReach': 'Unable to reach pickup location',
  'cancel.passengerNoResponse': 'Passenger not responding',
  'cancel.passengerRequest': 'Passenger requested something I cannot accommodate',
  'cancel.tellMore': 'Tell us more',
  'cancel.required': '(required)',
  'cancel.placeholder': 'Describe the reason for cancelling...',
  'cancel.keepRide': 'Keep Ride',
  'cancel.cancelling': 'Cancelling...',
  'cancel.confirm': 'Confirm Cancellation',
  'cancel.failed': 'Unable to cancel this ride right now. Please try again.',

  /* Chat */
  'chat.closeAria': 'Close chat',
  'chat.titleWith': 'Chat with {name}',
  'chat.loading': 'Loading messages...',
  'chat.empty': 'No messages yet. Send a message to your {role}.',
  'chat.placeholder': 'Type a message...',
  'chat.aria': 'Chat message',
  'chat.send': 'Send',
  'chat.sendFailed': 'Unable to send message.',
  'chat.roleDriver': 'driver',
  'chat.rolePassenger': 'passenger',
  'chat.toastPreview': 'New message',

  /* Map */
  'map.aria': 'Bislig City map preview',

  /* Validation */
  'err.required': 'This field is required.',
  'err.invalidPhone': 'Enter a valid phone number.',
  'err.invalidNumber': 'Enter a valid number.',
  'err.pickupRequired': 'Pickup location is required.',
  'err.destinationRequired': 'Destination is required.',
  'err.nameRequired': 'Please enter your name.',
  'err.geoUnsupported':
    'Your device does not support location access. You can enter a pickup landmark instead.',
  'err.geoAccuracy':
    'Your device could not determine location accuracy. Please turn on precise location/GPS and try again.',
  'err.geoApprox':
    'Location detected with approximately {meters}m accuracy. Please confirm your pickup point on the map.',
  'err.geoImprecise':
    'Your computer or device cannot provide a precise location. Please use a phone with precise location/GPS enabled, or enter your pickup landmark manually.',
  'err.geoInaccurate':
    'Your device returned an inaccurate location ({meters}m accuracy). Please turn on precise location/GPS and try again.',
  'err.geoDenied':
    'Location permission was denied. Please allow location access and try again.',
  'err.geoTimeout':
    'Location lookup timed out. Please move to an area with a clearer GPS signal and try again.',
  'err.geoUnable':
    'Unable to access your location. Please turn on precise location/GPS and try again.',
  'err.requestRide': 'Unable to request a ride right now. Please try again.',
  'err.dispatchRide': 'Unable to find a driver right now. Please try again.',
  'err.liveLocationOff':
    'Live location is off. Your driver can still rely on your recorded pickup point.',

  /* Customer profile */
  'profile.subtitle': 'Your current and previous Bislig Ride trips.',
  'profile.completedRides': 'Completed rides',
  'profile.allTime': 'All-time trips',
  'profile.rating': 'Rating',
  'profile.ratingCount': 'rating',
  'profile.ratingCounts': 'ratings',
  'profile.cancellations': 'Cancellations',
  'profile.ofCompleted': 'Of all completed rides',
  'profile.loading': 'Loading your rides...',
  'profile.noRides': 'No rides yet.',
  'profile.noRidesText':
    'Your completed and active rides will appear here automatically.',
  'profile.activeRide': 'Active Ride',
  'profile.rideHistory': 'Ride History',
  'profile.driver': 'Driver:',
  'profile.vehicle': 'Vehicle:',
  'profile.color': 'Color:',
  'profile.plate': 'Plate:',
  'profile.driverRating': 'Driver rating: {rating}/5',
  'profile.driverLoading': 'Driver information is loading...',
  'profile.yourRating': 'Your rating: {rating}/5',
  'profile.statusFinding': 'Finding a driver',
  'profile.statusAccepted': 'Driver accepted',
  'profile.statusArrived': 'Driver arrived',
  'profile.statusInProgress': 'Ride in progress',
  'profile.statusCompleted': 'Completed',
  'profile.statusCancelled': 'Cancelled',
  'profile.onePassenger': '1 passenger',
  'profile.passengers': 'passengers',
  'profile.passengers5Plus': '5+ passengers',

  /* Shared form */
  'form.selectOption': 'Select an option',
  'form.continue': 'Continue',
  'form.backHome': 'Back to Home',
  'form.back': 'Back',

  /* Pakyawan */
  'pak.eyebrow': 'Pakyawan / Umbak',
  'pak.title1': 'Going somewhere?',
  'pak.title2': "We'll get you there.",
  'pak.subtitle':
    'Reserve a vehicle for long-distance or out-of-town trips, family travel, and group transportation.',
  'pak.progressAria': 'Pakyawan progress: step {step} of 3',
  'pak.step1.title': 'Trip schedule',
  'pak.step1.hint': 'When should we pick you up?',
  'pak.step2.title': 'Route & group',
  'pak.step2.hint': "Where are you going, and who's coming?",
  'pak.step3.title': 'Trip details',
  'pak.step3.hint': 'Almost there. Tell us a little more about the trip.',
  'pak.tripDate': 'Trip Date',
  'pak.pickupTime': 'Pickup Time',
  'pak.pickupLocation': 'Pickup Location',
  'pak.destination': 'Destination',
  'pak.numPassengers': 'Number of Passengers',
  'pak.tripType': 'Trip Type',
  'pak.selectTripType': 'Select trip type',
  'pak.estimatedHours': 'Estimated Duration (hours, optional)',
  'pak.specialRequests': 'Additional Stops or Special Requests (Optional)',
  'pak.specialRequestsPlaceholder':
    'Example: Stop at another location, extra luggage, special event, etc.',
  'pak.contactDetails': 'Contact details',
  'pak.fullName': 'Full Name',
  'pak.phoneNumber': 'Phone Number',
  'pak.decreasePassengers': 'Decrease number of passengers',
  'pak.increasePassengers': 'Increase number of passengers',
  'pak.passengerCountAria': 'Number of passengers',
  'pak.futureDate': 'Please choose today or a future date.',
  'pak.onePassenger': 'Enter at least one passenger.',
  'pak.durationHours': 'Enter the expected duration in hours.',
  'pak.submitting': 'Submitting request...',
  'pak.submit': 'Request Pakyawan',
  'pak.finalNoteStrong': 'Availability confirmed with you first.',
  'pak.finalNoteText':
    "We'll contact you to confirm availability, trip details, and pricing.",
  'pak.receivedEyebrow': 'Request received',
  'pak.receivedTitle': 'Booking Request Received',
  'pak.receivedBody1': 'Your Pakyawan / Umbak request has been submitted.',
  'pak.receivedBody2':
    'Our team will review your trip details, vehicle availability, and pricing. Final pricing will be confirmed before your booking is accepted.',
  'pak.driverFound': 'Driver found',
  'pak.assignedTitle': 'Driver Has Accepted Your Booking',
  'pak.assignedBody': 'Your driver has accepted your booking. Waiting for the driver to send the trip price.',
  'pak.backToRide': 'Back to Ride Booking',
  'pak.submitFailed':
    'We could not submit your booking request right now. Please try again.',
  'pak.bookingRef': 'Booking reference',
  'pak.refreshStatus': 'Refresh status',
  'pak.checkingStatus': 'Checking for updates...',
  'pak.waitingQuote': 'Your price will appear here once our team reviews your request.',
  'pak.quotedPrice': 'Quoted price',
  'pak.quoteReady': 'Quote Ready',
  'pak.confirmBooking': 'Confirm Booking',
  'pak.confirming': 'Confirming...',
  'pak.bookingConfirmed': 'Booking Confirmed',
  'pak.confirmedBody': 'Your Pakyawan booking is confirmed. Our team will coordinate your driver and contact you with the details.',
  'pak.statusLabel': 'Status',
  'pak.statusScheduled': 'SCHEDULED',
  'pak.driverOnWay': 'Driver is on the way',
  'pak.driverArrived': 'Driver has arrived',
  'pak.tripInProgress': 'Trip in progress',
  'pak.tripCompleted': 'Trip completed',
  'pak.trackFailed': 'We could not load your booking status. Please try again.',
  'pak.confirmFailed': 'We could not confirm your booking. It may have already been updated — please refresh the status and try again.',

  /* Pa-deliver */
  'pad.eyebrow': 'Pa-deliver',
  'pad.title1': 'Send it.',
  'pad.title2': "We'll take it there.",
  'pad.subtitle':
    "Need to send a package across Bislig? Tell us what you're sending, where it's going, and when you need it delivered.",
  'pad.descriptor': 'Package · Pickup · Delivery',
  'pad.progressAria': 'Pa-deliver progress: step {step} of 3',
  'pad.step1.title': 'What are you sending?',
  'pad.step1.hint': 'Tell us about the package and roughly how big it is.',
  'pad.step2.title': 'Where should it go?',
  'pad.step2.hint':
    'Pickup and delivery addresses, plus your preferred schedule.',
  'pad.step3.title': 'Who should we contact?',
  'pad.step3.hint':
    "We'll use these details to confirm pickup and delivery with you.",
  'pad.packageType': 'Package Type',
  'pad.packageDetails': 'Package Details (Optional)',
  'pad.packageDetailsPlaceholder': 'Example: sealed envelope, box, fragile items',
  'pad.packageSize': 'Size or Approximate Weight',
  'pad.sizePlaceholder': 'Example: Shoe box size',
  'pad.pickupAddress': 'Pickup Address',
  'pad.deliveryAddress': 'Delivery Address',
  'pad.addressPlaceholder': 'Example: Barangay, street, landmark',
  'pad.whenNeed': 'When do you need it?',
  'pad.preferredDate': 'Preferred Date',
  'pad.preferredTime': 'Preferred Time',
  'pad.senderName': 'Sender Full Name',
  'pad.contactNumber': 'Contact Number',
  'pad.continue': 'Continue',
  'pad.submit': 'Request Delivery',
  'pad.submitting': 'Submitting request...',
  'pad.bookingRef': 'Booking reference',
  'pad.submitFailed': 'We could not submit your delivery request right now. Please try again.',
  'pad.finalNoteStrong': 'Delivery fee is confirmed after review.',
  'pad.finalNoteText':
    'Distance, package size, and urgency will be considered before the fee is confirmed.',
  'pad.receivedEyebrow': 'Request received',
  'pad.receivedTitle': 'Delivery Request Received',
  'pad.receivedBody':
    'Your delivery request was received. We\u2019re finding an available driver \u2014 no manual team confirmation needed.',
  'pad.statusLabel': 'Status',
  'pad.refreshStatus': 'Refresh status',
  'pad.checkingStatus': 'Checking for updates...',
  'pad.trackFailed': 'We could not load your delivery status. Please try again.',
  'pad.trackFinding': 'Finding a driver',
  'pad.trackNoDriver': 'Unable to find a driver right now.',
  'pad.trackAssigned': 'Driver Assigned',
  'pad.quoteReady': 'Delivery Fee Ready',
  'pad.trackConfirmed': 'Delivery Confirmed',
  'pad.deliveryFee': 'Delivery fee',
  'pad.confirmDelivery': 'Confirm delivery',
  'pad.confirming': 'Confirming...',
  'pad.confirmFailed': 'We could not confirm your delivery. Please try again.',
  'pad.confirmedBody':
    'Your driver is preparing to pick up your package.',
  'pad.trackOnWay': 'Driver is on the way',
  'pad.trackArrived': 'Driver has arrived',
  'pad.trackPickedUp': 'Package Picked Up',
  'pad.trackInTransit': 'Out For Delivery',
  'pad.trackDelivered': 'Delivered',
  'pad.proofAvailable': 'Proof of delivery: Available',
  'pad.trackCancelled': 'Delivery cancelled.',
  'pad.trackFailedStatus': 'Delivery could not be completed.',
  'pad.nextPending': 'Next: We\u2019re finding an available driver.',
  'pad.nextDispatching': 'Next: We\u2019ll notify you when a driver accepts.',
  'pad.nextAssigned': 'Next: Your driver will send the delivery fee.',
  'pad.nextQuoted': 'Next: Review the fee and confirm the delivery.',
  'pad.nextConfirmed': 'Next: Your driver will head to the pickup location.',
  'pad.nextOnWay': 'Next: Be ready to hand over the package when your driver arrives.',
  'pad.nextArrived': 'Next: Hand the package to your driver.',
  'pad.nextPickedUp': 'Next: Your driver will deliver it to the destination.',
  'pad.nextInTransit': 'Next: We\u2019ll let you know when the delivery is completed.',
  'pad.nextDelivered': 'Next: View your delivery details.',
  'pad.nextNoDriver': 'Next: You can try submitting the delivery again.',
  'car.title': 'Car Rentals',
  'car.titleAccent': '/ Pa-arkila',
  'car.eyebrow': 'Self-drive and chauffeur rentals',
  'car.subtitle':
    'Rent a sedan, SUV, van, or motorcycle for your plans.',
  'car.intro':
    'Car Rentals lets you inquire about renting a vehicle for errands, trips, and events — with or without a driver. A representative will confirm vehicle availability and rental rates with you before booking — this is an inquiry, not an automatic reservation.',
  'car.sect1.title': 'The vehicle',
  'car.sect1.hint': 'What would you like to rent?',
  'car.vehicleType': 'Vehicle Type',
  'car.transmission': 'Transmission',
  'car.selfDrive': 'Self-drive',
  'car.withDriver': 'With driver',
  'car.sect2.title': 'Schedule',
  'car.sect2.hint': 'When do you need the vehicle?',
  'car.pickupDate': 'Pickup Date',
  'car.pickupTime': 'Pickup Time',
  'car.returnDate': 'Return Date',
  'car.driverOption': 'Driver Option',
  'car.sect3.title': 'Your contact information',
  'car.sect3.hint': 'So we can confirm availability with you',
  'car.fullName': 'Full Name',
  'car.phoneNumber': 'Phone Number',
  'car.noteStrong': 'Availability and rates are confirmed after review.',
  'car.noteText':
    'Vehicle availability, rental duration, and driver preference determine final pricing.',
  'car.submit': 'Submit Rental Inquiry',
  'car.successEyebrow': 'Inquiry received',
  'car.successTitle': 'Rental Inquiry Received',
  'car.successBody':
    'Our team will confirm vehicle availability, driver options, and rates with you before your rental is booked.',

  /* Auth (driver) */
  'auth.driverAccess': 'Driver Access',
  'auth.backToRider': 'Back to Rider',
  'auth.welcomeBack': 'Welcome back',
  'auth.resetPassword': 'Reset password',
  'auth.checkInbox': 'Check your inbox',
  'auth.usernameEmail': 'Username or email',
  'auth.password': 'Password',
  'auth.showPassword': 'Show password',
  'auth.hidePassword': 'Hide password',
  'auth.login': 'Login',
  'auth.signingIn': 'Signing in...',
  'auth.forgotPassword': 'Forgot password?',
  'auth.contactAdmin': 'Contact Admin',
  'auth.resetHint':
    "Enter your username or registered email and we'll send a password reset link.",
  'auth.sendingLink': 'Sending link...',
  'auth.sendResetLink': 'Send reset link',
  'auth.backToLogin': 'Back to login',
  'auth.sentNote':
    'If a Bislig Ride driver account matches that username or email, a password reset link has been sent. It only works for a short time — check your inbox (and spam folder).',
  'auth.errMissingCredentials':
    'Enter your username or email and password to continue.',
  'auth.errInvalidCredentials': 'Incorrect username or password.',
  'auth.errNotLinked': 'This account is not linked to a Bislig Ride driver.',
  'auth.errDeactivated':
    'This driver account is deactivated. Contact the admin to reactivate it.',
  'auth.errForgotMissing': 'Enter your username or email to find your account.',
  'auth.errResetFailed':
    "We couldn't send a reset link right now. Please try again.",

  /* Driver blocked account (App) */
  'blocked.title': 'Account inactive',
  'blocked.text':
    'Your driver account is inactive. Please contact Bislig Ride to reactivate it.',
  'blocked.back': 'Back to Ride Booking',

  /* Contact */
  'contact.eyebrow': 'GET IN TOUCH',
  'contact.aria': 'Contact Bislig Ride',
  'contact.title': 'Let\'s connect.',
  'contact.intro':
    'Have a question about Bislig Ride, want to partner with us, feature your business, or discuss a digital project? We\'d love to hear from you.',
  'contact.cardLabel': 'BISLIG RIDE',
  'contact.cardTitle': 'Built for Bislig.',
  'contact.infoCopy':
    "We're building a local platform that connects passengers, drivers, businesses, and the community.",
  'contact.location': 'Location',
  'contact.locationValue': 'Bislig City, Surigao del Sur',
  'contact.forBusinesses': 'For businesses',
  'contact.businessValue': 'Partnerships & featured listings',
  'contact.forProjects': 'For projects',
  'contact.projectsValue': 'Websites & digital solutions',
  'contact.exploreKicker': 'EXPLORE BISLIG',
  'contact.exploreTitle': 'Want your business to be discovered?',
  'contact.exploreText':
    "Tell us about your business and how you'd like to be part of the growing Explore Bislig experience.",
  'contact.exploreLink': 'Explore Bislig',
  'contact.msgReceived': 'MESSAGE RECEIVED',
  'contact.thanksTitle': 'Thank you for reaching out.',
  'contact.thanksText':
    "Your message has been received. We'll get back to you as soon as possible.",
  'contact.sendAnother': 'Send Another Message',
  'contact.contactEyebrow': 'CONTACT US',
  'contact.helpTitle': 'How can we help?',
  'contact.helpText': "Send us a message and we'll direct it to the right place.",
  'contact.inquiryField': 'What can we help you with?',
  'contact.inquiryGeneral': 'General Inquiry',
  'contact.inquiryRide': 'Ride / Rider Support',
  'contact.inquiryDriver': 'Driver Inquiry',
  'contact.inquiryPartnership': 'Business Partnership',
  'contact.inquiryFeature': 'Feature My Business',
  'contact.inquiryExplore': 'Explore Bislig',
  'contact.inquiryWeb': 'Website / Digital Project',
  'contact.inquiryFeedback': 'Feedback / Suggestion',
  'contact.inquiryReport': 'Report a Problem',
  'contact.inquiryOther': 'Other',
  'contact.fullName': 'Full Name',
  'contact.namePlaceholder': 'Your name',
  'contact.phone': 'Phone Number',
  'contact.email': 'Email',
  'contact.org': 'Business / Organization',
  'contact.orgPlaceholder': 'Business or organization',
  'contact.message': 'Message',
  'contact.messagePlaceholder': 'Tell us how we can help...',
  'contact.sending': 'Sending...',
  'contact.sendMessage': 'Send Message',
  'contact.formNote':
    'By submitting this form, you agree that Bislig Ride may use the information you provide to respond to your inquiry.',
  'contact.submitFailed': 'We could not send your message right now. Please try again.',
} as const

export type TranslationKey = keyof typeof en

const bi: Record<TranslationKey, string> = {
  /* Header / navigation */
  'nav.home': 'Home',
  'nav.bookPakyawan': 'Mag-book Pakyawan',
  'nav.driverLogin': 'Driver Login',
  'nav.contact': 'Kontak',
  'nav.becomeDriver': 'Maging Driver',
  'nav.myRides': 'Akong mga Sakay',
  'nav.profile': 'Profile',
  'nav.bookRide': 'Mag-book og Sakay',
  'nav.exploreBislig': 'Susihon ang Bislig',
  'nav.pasabuy': 'Pasabuy',
  'nav.comingSoon': 'Dili madugay',
  'nav.paDeliver': 'Pa-deliver',
  'nav.carRentals': 'Pag-arkila og Sakyanan',
  'nav.openMenu': 'Ablihi ang menu sa nabigasyon',
  'nav.closeMenu': 'Isira ang menu sa nabigasyon',
  'nav.ariaMain': 'Pangunang nabigasyon',
  'nav.ariaMobile': 'Nabigasyon sa mobile',
  'nav.beta': 'Beta',
  'nav.betaTitle': 'Ang Bislig Ride kay naa pa sa beta',
  'header.footerCity': 'Bislig City',
  'header.footerTagline': 'Sakay lokal. Lihok nga walay kabalaka.',
  'header.ariaPrimary': 'Pangunang nabigasyon sa mobile',

  /* Footer */
  'footer.rights': '2026 Bislig Ride. Tanang katungod gi-reserba.',

  /* Announcement ticker */
  'ticker.onboarding':
    'Gitudloan karon sa Bislig Ride ang atong founding drivers',
  'ticker.moreRides': 'Dugang nga rides, dili madugay',
  'ticker.aria':
    'Pahibalo sa Bislig Ride: gi-onboard karon ang founding drivers',

  /* Weather */
  'weather.label': 'Panahon sa Bislig City',
  'weather.context': 'Planoa ang imong sakay base sa panahon karon.',
  'weather.checking': 'Gisusi ang kahimtang sa panahon...',
  'weather.unavailable':
    'Wala sa hunos ang panahon karon. Andam pa gihapon ang imong booking sa sakay.',
  'weather.feelsLike': 'Gibati nga',
  'weather.humidity': 'Humidity',
  'weather.rain': 'Ulan',
  'weather.updatedNow': 'Bag-ong updated',
  'weather.updatedAgo': 'Na-update {minutes} ka minuto ang milabay',
  'weather.clear': 'Tin-aw nga langit',
  'weather.sunny': 'Paspas ang adlaw',
  'weather.cloudy': 'Dag-om',
  'weather.foggy': 'Gin-ambon',
  'weather.drizzle': 'Gamayng ulan',
  'weather.lightRain': 'Gaan nga ulan',
  'weather.snow': 'Niyebe',
  'weather.storm': 'Bagyo',
  'weather.mixed': 'Nagkalain-laing panahon',

  /* Homepage service dashboard */
  'dash.eyebrow': 'Bislig Ride',
  'dash.title1': 'Unsa ang imong kinahanglan',
  'dash.title2': 'karon?',
  'dash.subtitle': 'Pilia kung unsaon nimo paglibot sa Bislig City.',
  'dash.popular': 'Sikat',
  'dash.rideNow': 'Ride Now',
  'dash.rideNowCopy': 'Sugdi ang imong paglibot sa Bislig City.',
  'dash.otherWays': 'Uban pang paagi sa paglibot',
  'dash.pakyawan': 'Pakyawan',
  'dash.pakyawanDesc': 'Pag-reserve og sakyanan para sa layo nga byahe.',
  'dash.paDeliver': 'Pa-deliver',
  'dash.paDeliverDesc': 'Pagpadala og mga package sa tibuok Bislig.',
  'dash.carRentals': 'Pag-arkila og Sakyanan',
  'dash.carRentalsDesc': 'Pag-arkila og sakyanan kada adlaw.',

  /* Homepage carousel */
  'carousel.aria': 'Diskobreha ang dugang paagi sa paggamit sa Bislig Ride',
  'carousel.kicker': 'Naay uban pa',
  'carousel.title1': 'Diskobreha ang',
  'carousel.title2': 'Bislig Ride',
  'carousel.dot': 'Adto sa card {index} sa {total}: {title}',
  'carousel.city.kicker': 'Adlaw-adlaw nga byahe',
  'carousel.city.title': 'Mga lakaw sa siyudad, bisan kanus-a',
  'carousel.city.desc':
    'Paspas nga on-demand nga motorbike rides sa Bislig City ug kasikbit nga mga barangay.',
  'carousel.city.cta': 'Ride Now',
  'carousel.trips.kicker': 'Tibook nga adlaw nga byahe',
  'carousel.trips.title': 'Mga byahe sa pamilya ug mga event',
  'carousel.trips.desc':
    'Pribado nga sakyanan nga Pakyawan para sa mga byahe sa gawas sa siyudad, airport transfer, ug mga panagtigom.',
  'carousel.trips.cta': 'Mag-book Pakyawan',
  'carousel.deliver.kicker': 'Same-day nga padala',
  'carousel.deliver.title': 'Mga package sa tibuok Bislig',
  'carousel.deliver.desc':
    'Pagpadala og mga dokumento, parcels, ug gagmay nga butang sa bisan unsa nga barangay sa siyudad.',
  'carousel.deliver.cta': 'Pa-deliver',
  'carousel.cars.kicker': 'Sakay nga komportable',
  'carousel.cars.title': 'Mga sakyanan para sa adlaw',
  'carousel.cars.desc':
    'Pag-arkila og sedan, SUV, o van para sa imong mga lakaw — ikaw ang mopadagan o naay driver.',
  'carousel.cars.cta': 'Pag-arkila og Sakyanan',

  /* Booking */
  'book.eyebrow': 'DAKBAYAN SA BISLIG',
  'book.heroWhere1': 'Asa ka',
  'book.heroWhere2': 'padulong?',
  'book.subtitle':
    'Pagkuha og kasaligang sakay sa tibuok Bislig City — yano, kombenyente, ug para sa imong adlaw-adlaw nga byahe.',
  'book.chooseService': 'Pilia ang serbisyo',
  'book.rideNowSmall': 'On-demand nga motorbike rides sa tibuok Bislig City',
  'book.pakyawanSmall': 'Naka-iskedyul nga pribado ug tibook nga adlaw nga byahe',
  'book.tripDetails': 'Mga detalye sa byahe',
  'book.tripDetailsHint': 'Pilia ang imong pickup ug destination',
  'book.pickup': 'Pickup',
  'book.pickupOptional': 'Pickup landmark (opsyonal)',
  'book.pickupLandmarkPlaceholder': 'Pagdugang og kasikbit nga landmark (opsyonal)',
  'book.pickupPlaceholder': 'Isulod ang pickup location',
  'book.pickupHelp': 'Isulod ang imong pickup location, o i-tap ang',
  'book.useCurrentLocation': 'Gamita ang akong current location',
  'book.locationDetected': 'Nakit-an na ang imong current location.',
  'book.destination': 'Destination',
  'book.whereTo': 'Asa ka padulong?',
  'book.destinationPlaceholder': 'Isulod ang destination',
  'book.passengerDetails': 'Mga detalye sa pasahero',
  'book.passengerDetailsHint': 'Aron masayod ang driver kinsa ang mahimamat',
  'book.name': 'Ngalan',
  'book.namePlaceholder': 'Isulod ang imong pangalan',
  'book.passengerType': 'Klaseng pasahero',
  'book.ridePreferences': 'Mga gusto sa byahe',
  'book.ridePreferencesHint': 'I-andam ang imong byahe sa dili pa mangayo',
  'book.vehicle': 'Sakyanan',
  'book.passengers': 'Mga pasahero',
  'book.numPassengers': 'Pila ka pasahero',
  'book.motorcycleNote': 'Ang Motorcycle rides kay eksaktong 1 ka pasahero.',
  'book.passengerNameHint': 'Pangalan sa pasahero',
  'book.passengersTypeFare': 'Mga pasahero, tipo ug plite',
  'book.pickupHint': 'Asa ka nako kuhaon?',
  'book.destinationHint': 'Isulod ang imong destination',
  'book.currentLocationSet': 'Nakaset nga current location',
  'book.fareEstimated': 'Gibana-bana nga plite',
  'book.fare': 'Plite',
  'book.fareTraditional': 'Ang plite i-entregar sa driver sama sa naandan.',
  'book.fareMatrix':
    'Opisyal nga fare matrix sa Bislig City · Presyo sa gasolina Level L{level}',
  'book.requesting': 'Nag-request...',
  'book.requestRide': 'Mangayo og Ride',
  'book.lookingDriver':
    'Gipangita karon ang available nga Bislig Ride driver sa duol...',
  'book.noDriverText':
    'Wala makit-i nga available nga driver para niining byahe karon. Sulayi pag-uli ang dispatch sa imong ride o i-kansela kini.',
  'book.onTheWay': 'Padulong na ang imong driver.',
  'book.sharingLive': 'Gi-share ang imong live location sa imong driver.',
  'book.shareTip': 'I-share ang imong live location para mas sayon ka makit-an sa imong driver.',
  'book.shareMyLocation': 'I-share ang akong location',
  'book.chat': 'Chat',
  'book.driverUpdatesStatus':
    'I-update sa imong driver ang kahimtang sa byahe kung moabot na siya.',
  'book.arrivedLead':
    'Miabot na ang imong driver. Magsugod ang byahe kung i-start na kini sa driver.',
  'book.inProgressLead':
    'Padayon ang imong byahe. Kompletohon sa driver ang byahe kung makaabot na ka sa imong destination.',
  'book.thanks': 'Salamat sa pagsakay sa Bislig Ride.',
  'book.continueToPayment': 'Padayon sa Pagbayad',
  'book.view': 'Tan-awon',
  'book.tryAgain': 'Sulayi Pag-usab',
  'book.findingDriverAction': 'Gipangita ang driver...',
  'book.cancelRide': 'Kanselahon ang Sakay',
  'book.noDriverTitle': 'Wala nay available nga driver karon',
  'book.ride': 'sakay',
  'book.onePassenger': '1 ka pasahero',
  'book.nPassengers': '{count} ka mga pasahero',
  'book.fivePlusPassengers': '5+ ka mga pasahero',
  'book.yourDriver': 'Imong driver',

  /* Ride summary labels */
  'summary.pickup': 'Pickup',
  'summary.destination': 'Destination',
  'summary.passengers': 'Mga Pasahero',
  'summary.vehicle': 'Sakyanan',
  'summary.passengerType': 'Klaseng Pasahero',
  'summary.fare': 'Plite',
  'summary.driver': 'Driver',
  'summary.reason': 'Rason',
  'summary.route': 'Ruta',
  'summary.paymentMethod': 'Paagi sa Pagbayad',
  'summary.ride': 'Sakay',
  'summary.completed': 'Nahuman',
  'summary.yourRating': 'Imong Rating',
  'summary.color': 'Kolor',
  'summary.plate': 'Plaka',

  /* Ride status */
  'status.searching': 'Gipangita ang driver',
  'status.accepted': 'Gi-accept sa driver',
  'status.arrived': 'Miabot na ang imong driver',
  'status.inProgress': 'Padayon ang byahe',
  'status.completed': 'Nahuman ang byahe',
  'status.cancelled': 'Nakansela ang byahe',
  'status.rateYourRide': 'I-rate ang imong sakay',
  'status.searchBadge': 'GI-PANGITA',
  'status.noDriverBadge': 'WALAY DRIVER',
  'status.acceptedBadge': 'PADULONG ANG DRIVER',
  'status.arrivedBadge': 'MIABOT',
  'status.inProgressBadge': 'NAGPADAYON',
  'status.completedBadge': 'NAHUMAN',
  'status.cancelledBadge': 'NAKANSELA',
  'status.paymentBadge': 'PAGBAYAD',
  'status.paymentRecordedBadge': 'NAREKORD',
  'status.findingDriverAria': 'Gipangita ang imong driver',
  'status.noDriverAria': 'Wala maavailable nga driver',
  'status.byDriver': 'Gi-kansela sa imong driver kini nga sakay.',
  'status.byYou': 'Gi-kansela nimo kini nga sakay.',
  'status.noReason': 'Wala gihatag nga rason.',
  'status.driverAcceptedStep': 'Gi-accept sa driver',
  'status.arrivedStep': 'Miabot',
  'status.inProgressStep': 'Padayon ang byahe',
  'status.destinationStep': 'Destination',

  /* Driver info */
  'driver.loadingReputation': 'Nag-load sa reputation...',
  'driver.noRatings': 'Bag-ong driver · wala pay ratings',
  'driver.ratingWord': 'rating',
  'driver.ratingsCount': 'ka rating',
  'driver.ratingSummary': '{avg}/5 ({total} {countLabel}) · {cancel} nga cancellation rate',
  'driver.cancellationRate': 'cancellation rate',
  'driver.vehicleLabel': 'Sakyanan',
  'driver.plateLabel': 'Plaka',

  /* Rating & payment */
  'rating.howWasRide': 'Kumusta ang imong sakay?',
  'rating.rateExperience': 'I-rate ang imong experience kenni {name}.',
  'rating.aria': 'I-rate ang imong sakay 1 hangtod 5 ka bituon',
  'rating.starWord': 'bituon',
  'rating.starWords': 'ka bituon',
  'rating.comment': 'Komento',
  'rating.optional': '(opsyonal)',
  'rating.placeholder': 'I-istorya ang imong experience...',
  'rating.submitting': 'Nag-submit...',
  'rating.submit': 'Isumit ang Rating',
  'rating.thankYou': 'Salamat kaayo!',
  'rating.feedback': 'Ang imong feedback makatabang namo nga mapaayo ang Bislig Ride.',
  'rating.failed': 'Dili masumit ang imong rating. Palihog sulayi og balik.',
  'rating.ownerOnly': 'Kini nga sakay ma-rate ra gamit ang browser o device nga gigamit sa pag-book.',
  'payment.payment': 'Pagbayad',
  'payment.aria': 'Pagpili og paagi sa pagbayad',
  'payment.cashNote': 'Bayari direkta ang driver.',
  'payment.gcashNote': 'Ang GCash nga bayad i-confirm og mano-mano.',
  'payment.confirm': 'Kumpirmahon ang Bayad',
  'payment.recorded': 'Narekord ang pagbayad',
  'payment.methodCash': 'Cash',
  'payment.methodGcash': 'GCash',

  /* Cancellation */
  'cancel.title': 'Ikansela kini nga sakay?',
  'cancel.letDriverKnow': 'Pahibaloa ang driver kung ngano.',
  'cancel.letPassengerKnow': 'Pahibaloa ang pasahero kung ngano.',
  'cancel.closeAria': 'Tipigi ang sakay ug isira',
  'cancel.note':
    'Ma-kansela ang imong sakay ug mapahibalo dayon ang {role}. Ngano nga ikaw nagkansela?',
  'cancel.reasonsLabel': 'Rason sa pagkansela',
  'cancel.foundAnotherRide': 'Nakitan nako ang laing sakay',
  'cancel.plansChanged': 'Nausab ang akong plano',
  'cancel.driverTooLong': 'Dugay kaayo ang driver',
  'cancel.wrongRoute': 'Sayop ang pickup o destination',
  'cancel.other': 'Uban pa',
  'cancel.vehicleProblem': 'Problema sa sakyanan',
  'cancel.emergency': 'Emerhensya',
  'cancel.cannotReach': 'Dili makaabot sa pickup location',
  'cancel.passengerNoResponse': 'Dili mo-reply ang pasahero',
  'cancel.passengerRequest': 'Nangayo ang pasahero og dili nako ma-accommodate',
  'cancel.tellMore': 'Sultihi kami og dugang',
  'cancel.required': '(gikinahanglan)',
  'cancel.placeholder': 'Ihulagway ang rason sa pagkansela...',
  'cancel.keepRide': 'Ipadayon ang Sakay',
  'cancel.cancelling': 'Nagkansela...',
  'cancel.confirm': 'Kumpirmahon ang Kansela',
  'cancel.failed': 'Dili makansela karon kini nga sakay. Palihog sulayi og balik.',

  /* Chat */
  'chat.closeAria': 'Isira ang chat',
  'chat.titleWith': 'Chat uban ni {name}',
  'chat.loading': 'Nag-load sa mga mensahe...',
  'chat.empty': 'Wala pay mensahe. Padad-i og mensahe ang imong {role}.',
  'chat.placeholder': 'Isulat ang mensahe...',
  'chat.aria': 'Mensahe sa chat',
  'chat.send': 'Ipadala',
  'chat.sendFailed': 'Dili maipadala ang mensahe.',
  'chat.roleDriver': 'driver',
  'chat.rolePassenger': 'pasahero',
  'chat.toastPreview': 'Bag-ong mensahe',

  /* Map */
  'map.aria': 'Preview sa mapa sa Bislig City',

  /* Validation */

  /* Validation */
  'err.required': 'Kini nga field gikinahanglan.',
  'err.invalidPhone': 'Isulod ang balido nga numero sa telepono.',
  'err.invalidNumber': 'Isulod ang balido nga numero.',
  'err.pickupRequired': 'Gikinahanglan ang pickup location.',
  'err.destinationRequired': 'Gikinahanglan ang destination.',
  'err.nameRequired': 'Palihog isulod ang imong pangalan.',
  'err.geoUnsupported':
    'Dili suportahan sa imong device ang pag-access sa location. Pwede ka mag-isulod og pickup landmark imbes.',
  'err.geoAccuracy':
    'Dili matino sa imong device ang katukma sa location. Palihog i-on ang precise location/GPS ug sulayi og balik.',
  'err.geoApprox':
    'Nakit-an ang location nga mga {meters}m ang katukma. Palihog kumpirmaha ang imong pickup point sa mapa.',
  'err.geoImprecise':
    'Dili makahatag og tukmang location ang imong device. Palihog gamiti og phone nga naka-enable ang precise location/GPS, o isulod og mano-mano ang imong pickup landmark.',
  'err.geoInaccurate':
    'Mihatag og dili tukmang location ang imong device ({meters}m katukma). Palihog i-on ang precise location/GPS ug sulayi og balik.',
  'err.geoDenied':
    'Gibalibaran ang permiso sa location. Palihog i-allow ang pag-access sa location ug sulayi og balik.',
  'err.geoTimeout':
    'Na-timeout ang pagpangita sa location. Palihog adto sa lugar nga klaro ang GPS signal ug sulayi og balik.',
  'err.geoUnable':
    'Dili ma-access ang imong location. Palihog i-on ang precise location/GPS ug sulayi og balik.',
  'err.requestRide': 'Dili ma-request ang ride karon. Palihog sulayi og balik.',
  'err.dispatchRide': 'Wala makit-i nga driver karon. Palihog sulayi og balik.',
  'err.liveLocationOff':
    'Off ang live location. Makasalig pa gihapon ang driver sa imong na-record nga pickup point.',

  /* Customer profile */
  'profile.subtitle': 'Imong karon ug nangaging mga sakay sa Bislig Ride.',
  'profile.completedRides': 'Nahuman nga mga sakay',
  'profile.allTime': 'Tanan nga mga byahe',
  'profile.rating': 'Rating',
  'profile.ratingCount': 'ka rating',
  'profile.ratingCounts': 'ka ratings',
  'profile.cancellations': 'Mga kansela',
  'profile.ofCompleted': 'Sa tanang nahuman nga mga sakay',
  'profile.loading': 'Nag-load sa imong mga sakay...',
  'profile.noRides': 'Wala pay mga sakay.',
  'profile.noRidesText': 'Mopakita diri ang imong nahuman ug aktibo nga mga sakay.',
  'profile.activeRide': 'Aktibo nga Sakay',
  'profile.rideHistory': 'Kasaysayan sa mga Sakay',
  'profile.driver': 'Driver:',
  'profile.vehicle': 'Sakyanan:',
  'profile.color': 'Kolor:',
  'profile.plate': 'Plaka:',
  'profile.driverRating': 'Rating sa driver: {rating}/5',
  'profile.driverLoading': 'Nag-load ang impormasyon sa driver...',
  'profile.yourRating': 'Imong rating: {rating}/5',
  'profile.statusFinding': 'Gipangita ang driver',
  'profile.statusAccepted': 'Gi-accept sa driver',
  'profile.statusArrived': 'Miabot ang driver',
  'profile.statusInProgress': 'Padayon ang byahe',
  'profile.statusCompleted': 'Nahuman',
  'profile.statusCancelled': 'Nakansela',
  'profile.onePassenger': '1 ka pasahero',
  'profile.passengers': 'ka pasahero',
  'profile.passengers5Plus': '5+ ka pasahero',

  /* Shared form */
  'form.selectOption': 'Pilia ang usa ka option',
  'form.continue': 'Padayon',
  'form.backHome': 'Balik sa Home',
  'form.back': 'Balik',

  /* Pakyawan */
  'pak.eyebrow': 'Pakyawan / Umbak',
  'pak.title1': 'Moadto ka?',
  'pak.title2': "Dad-on ka namo didto.",
  'pak.subtitle':
    'Pag-reserve og sakyanan para sa layo o gawas-lungsod nga byahe, pagbyahe sa pamilya, ug transportasyon sa grupo.',
  'pak.progressAria': 'Pakyawan progress: step {step} sa 3',
  'pak.step1.title': 'Iskedyul sa byahe',
  'pak.step1.hint': 'Kanus-a ka namo kuhaon?',
  'pak.step2.title': 'Ruta ug grupo',
  'pak.step2.hint': 'Asa ka padulong, ug kinsa ang moapil?',
  'pak.step3.title': 'Mga detalye sa byahe',
  'pak.step3.hint': 'Duol na. Isulti pa og gamay ang mga detalye sa byahe.',
  'pak.tripDate': 'Petsa sa Byahe',
  'pak.pickupTime': 'Oras sa Pickup',
  'pak.pickupLocation': 'Pickup Location',
  'pak.destination': 'Destination',
  'pak.numPassengers': 'Pila ka Pasahero',
  'pak.tripType': 'Tipo sa Byahe',
  'pak.selectTripType': 'Pilia ang tipo sa byahe',
  'pak.estimatedHours': 'Gibana-bana nga Oras (oras, opsyonal)',
  'pak.specialRequests': 'Dugang nga mga Stop o Espesyal nga Hangyo (Opsyonal)',
  'pak.specialRequestsPlaceholder':
    'Pananglitan: Hunong sa laing lugar, dugang nga maleta, espesyal nga event, ug uban pa.',
  'pak.contactDetails': 'Mga detalye sa kontak',
  'pak.fullName': 'Kompletong Ngalan',
  'pak.phoneNumber': 'Numero sa Telepono',
  'pak.decreasePassengers': 'Pakunhian ang numero sa mga pasahero',
  'pak.increasePassengers': 'Padaghanon ang numero sa mga pasahero',
  'pak.passengerCountAria': 'Numero sa mga pasahero',
  'pak.futureDate': 'Palihog pagpili og karon o umaabot nga petsa.',
  'pak.onePassenger': 'Isulod labing menos usa ka pasahero.',
  'pak.durationHours': 'Isulod ang gibanabana nga mga oras sa byahe.',
  'pak.submitting': 'Gi-submit ang request...',
  'pak.submit': 'Mangayo og Pakyawan',
  'pak.finalNoteStrong': 'I-confirm una sa imo ang availability.',
  'pak.finalNoteText':
    'Kontakon ka namo aron kumpirmahon ang availability, mga detalye sa byahe, ug presyo.',
  'pak.receivedEyebrow': 'Nadawat ang request',
  'pak.receivedTitle': 'Nadawat ang Booking Request',
  'pak.receivedBody1': 'Na-submit na ang imong Pakyawan / Umbak request.',
  'pak.receivedBody2':
    'Ribyuon sa among team ang mga detalye sa imong byahe, availability sa sakyanan, ug presyo. Kumpirmahon una ang final pricing sa dili pa ma-accept ang imong booking.',
  'pak.driverFound': 'Nakit-an ang Driver',
  'pak.assignedTitle': 'Gidawat Na sa Driver ang Imong Booking',
  'pak.assignedBody': 'Gidawat na sa imong driver ang imong booking. Naghulat pa nga ipadala sa driver ang presyo sa byahe.',
  'pak.backToRide': 'Balik sa Ride Booking',
  'pak.submitFailed':
    'Dili ma-submit karon ang imong booking request. Palihog sulayi og balik.',
  'pak.bookingRef': 'Reperensya sa booking',
  'pak.refreshStatus': 'I-refresh ang status',
  'pak.checkingStatus': 'Gisusi ang mga update...',
  'pak.waitingQuote': 'Mopakita diri ang imong presyo human ma-ribyu sa among team ang imong request.',
  'pak.quotedPrice': 'Presyo nga gi-quote',
  'pak.quoteReady': 'Andam na ang Presyo',
  'pak.confirmBooking': 'Kumpirmahon ang Booking',
  'pak.confirming': 'Nagkumpirma...',
  'pak.bookingConfirmed': 'Nakumpirma ang Booking',
  'pak.confirmedBody': 'Nakumpirma na ang imong Pakyawan booking. Mokoordinar ang among team sa imong driver ug kontakon ka namo sa mga detalye.',
  'pak.statusLabel': 'Kahimtang',
  'pak.statusScheduled': 'NAKA-SCHEDULE',
  'pak.driverOnWay': 'Padulong na ang driver',
  'pak.driverArrived': 'Miabot na ang driver',
  'pak.tripInProgress': 'Padayon ang byahe',
  'pak.tripCompleted': 'Nahuman ang byahe',
  'pak.trackFailed': 'Dili ma-load karon ang status sa imong booking. Palihog sulayi og balik.',
  'pak.confirmFailed': 'Dili makumpirma karon ang imong booking. Basin na-update na kini — palihog i-refresh ang status ug sulayi og balik.',

  /* Pa-deliver */
  'pad.eyebrow': 'Pa-deliver',
  'pad.title1': 'Ipadala kini.',
  'pad.title2': "Dad-on namo kini didto.",
  'pad.subtitle':
    'Nagkinahanglan og ipadala nga package sa tibuok Bislig? Sultihi kami kung unsa ang imong ipadala, asa kini paingon, ug kanus-a nimo kini kinahanglan i-deliver.',
  'pad.descriptor': 'Package · Pickup · Delivery',
  'pad.progressAria': 'Pa-deliver progress: step {step} sa 3',
  'pad.step1.title': 'Unsa ang imong ipadala?',
  'pad.step1.hint': 'Isulti ang package ug unsa kadako kini.',
  'pad.step2.title': 'Asa kini paingon?',
  'pad.step2.hint': 'Address sa pickup ug delivery, ug ang imong gustong iskedyul.',
  'pad.step3.title': 'Kinsa ang among kontakon?',
  'pad.step3.hint': 'Gamiton namo kini aron makumpirma ang pickup ug delivery.',
  'pad.packageType': 'Tipo sa Package',
  'pad.packageDetails': 'Mga Detalye sa Package (Opsyonal)',
  'pad.packageDetailsPlaceholder':
    'Pananglitan: sealed envelope, box, delikado nga mga butang',
  'pad.packageSize': 'Kadako o Gibana-bana nga Timbang',
  'pad.sizePlaceholder': 'Pananglitan: Gidak-on sa shoe box',
  'pad.pickupAddress': 'Pickup Address',
  'pad.deliveryAddress': 'Delivery Address',
  'pad.addressPlaceholder': 'Pananglitan: Barangay, dalan, landmark',
  'pad.whenNeed': 'Kanus-a nimo kini kinahanglan?',
  'pad.preferredDate': 'Gustong Petsa',
  'pad.preferredTime': 'Gustong Oras',
  'pad.senderName': 'Kompletong Ngalan sa Nagpadala',
  'pad.contactNumber': 'Numero sa Kontak',
  'pad.continue': 'Padayon',
  'pad.submit': 'Mangayo og Delivery',
  'pad.submitting': 'Gi-submit ang request...',
  'pad.bookingRef': 'Reperensya sa booking',
  'pad.submitFailed': 'Dili ma-submit karon ang imong delivery request. Palihog sulayi og balik.',
  'pad.finalNoteStrong': 'Ma-confirm ang delivery fee human sa pag-rivyu.',
  'pad.finalNoteText':
    'Hunahunaon ang gilay-on, kadako sa package, ug ka-dali sa pagdeliver sa dili pa ma-confirm ang fee.',
  'pad.receivedEyebrow': 'Nadawat ang request',
  'pad.receivedTitle': 'Nadawat ang Delivery Request',
  'pad.receivedBody':
    'Nadawat na ang imong delivery request. Nangita kami og available nga driver \u2014 dili na kinahanglan og manual nga kumpirmasyon sa team.',
  'pad.statusLabel': 'Kahimtang',
  'pad.refreshStatus': 'I-refresh ang status',
  'pad.checkingStatus': 'Gisusi ang mga update...',
  'pad.trackFailed': 'Dili ma-load karon ang status sa imong delivery. Palihog sulayi og balik.',
  'pad.trackFinding': 'Nangita og driver',
  'pad.trackNoDriver': 'Dili makakita og driver karon.',
  'pad.trackAssigned': 'Na-assign ang Driver',
  'pad.quoteReady': 'Andam na ang Delivery Fee',
  'pad.trackConfirmed': 'Na-confirm ang Delivery',
  'pad.deliveryFee': 'Bayad sa delivery',
  'pad.confirmDelivery': 'Kumpirmahi ang delivery',
  'pad.confirming': 'Gikumpirma...',
  'pad.confirmFailed': 'Dili makumpirma karon ang imong delivery. Palihog sulayi og balik.',
  'pad.confirmedBody':
    'Nag-andam na ang imong driver sa pagkuha sa imong package.',
  'pad.trackOnWay': 'Padulong na ang driver',
  'pad.trackArrived': 'Miabot na ang driver',
  'pad.trackPickedUp': 'Nakuha na ang Package',
  'pad.trackInTransit': 'Padulong na i-deliver',
  'pad.trackDelivered': 'Na-deliver na',
  'pad.proofAvailable': 'Pamatuod sa pag-deliver: Anaa',
  'pad.trackCancelled': 'Gikansela ang delivery.',
  'pad.trackFailedStatus': 'Dili nahuman ang delivery.',
  'pad.nextPending': 'Sunod: Nangita kami og available nga driver.',
  'pad.nextDispatching': 'Sunod: Pahibaw-on ka namo kung naay modawat nga driver.',
  'pad.nextAssigned': 'Sunod: Ipadala sa imong driver ang delivery fee.',
  'pad.nextQuoted': 'Sunod: Ribyuha ang fee ug kumpirmahi ang delivery.',
  'pad.nextConfirmed': 'Sunod: Moadto na ang imong driver sa pickup location.',
  'pad.nextOnWay': 'Sunod: Pangandam sa pagtugyan sa package kung moabot na ang imong driver.',
  'pad.nextArrived': 'Sunod: Itugyan ang package sa imong driver.',
  'pad.nextPickedUp': 'Sunod: I-deliver na sa imong driver sa destinasyon.',
  'pad.nextInTransit': 'Sunod: Pahibaw-on ka namo kung mahuman na ang delivery.',
  'pad.nextDelivered': 'Sunod: Tan-awa ang detalye sa imong delivery.',
  'pad.nextNoDriver': 'Sunod: Mahimo nimong sulayan pag-submit og balik.',

  /* Car rentals */
  'car.title': 'Pag-arkila og Sakyanan',
  'car.titleAccent': '/ Pa-arkila',
  'car.eyebrow': 'Pag-arkila nga self-drive ug may driver',
  'car.subtitle': 'Pag-arkila og sedan, SUV, van, o motor para sa imong plano.',
  'car.intro':
    'Ang Car Rentals usa ka paagi para mangutana mahitungod sa pag-arkila og sakyanan para sa mga lakaw, byahe, ug mga event — may driver o wala. Kumpirmahon sa among representative ang availability ug presyo sa imo sa dili pa ma-book — kini usa ka pangutana, dili awtomatik nga reservation.',
  'car.sect1.title': 'Ang sakyanan',
  'car.sect1.hint': 'Unsa ang gusto nimong i-arkila?',
  'car.vehicleType': 'Tipo sa Sakyanan',
  'car.transmission': 'Transmission',
  'car.selfDrive': 'Ikaw ang modagan',
  'car.withDriver': 'May driver',
  'car.sect2.title': 'Iskedyul',
  'car.sect2.hint': 'Kanus-a nimo kinahanglan ang sakyanan?',
  'car.pickupDate': 'Petsa sa Pagkuha',
  'car.pickupTime': 'Oras sa Pagkuha',
  'car.returnDate': 'Petsa sa Pagbalik',
  'car.driverOption': 'Opsyon sa Driver',
  'car.sect3.title': 'Imong contact information',
  'car.sect3.hint': 'Aron makumpirma namo ang availability',
  'car.fullName': 'Kompletong Ngalan',
  'car.phoneNumber': 'Numero sa Telepono',
  'car.noteStrong': 'Ma-confirm ang availability ug presyo human sa pag-rivyu.',
  'car.noteText':
    'Ang availability sa sakyanan, pila ka adlaw ang pag-arkila, ug gusto sa driver ang magtino sa final presyo.',
  'car.submit': 'Isumit ang Rental Inquiry',
  'car.successEyebrow': 'Nadawat ang inquiry',
  'car.successTitle': 'Nadawat ang Rental Inquiry',
  'car.successBody':
    'Kumpirmahon sa among team ang availability sa sakyanan, mga opsyon sa driver, ug presyo uban kanimo sa dili pa ma-book ang imong pag-arkila.',

  /* Auth (driver) */
  'auth.driverAccess': 'Driver Access',
  'auth.backToRider': 'Balik sa Rider',
  'auth.welcomeBack': 'Welcome balik',
  'auth.resetPassword': 'I-reset ang password',
  'auth.checkInbox': 'Susiha ang imong inbox',
  'auth.usernameEmail': 'Username o email',
  'auth.password': 'Password',
  'auth.showPassword': 'Ipakita ang password',
  'auth.hidePassword': 'Itago ang password',
  'auth.login': 'Login',
  'auth.signingIn': 'Nag-sign in...',
  'auth.forgotPassword': 'Nakalimot sa password?',
  'auth.contactAdmin': 'Kontaka ang Admin',
  'auth.resetHint':
    "Isulod ang imong username o rehistradong email ug padalhan ka namo og password reset link.",
  'auth.sendingLink': 'Gipadala ang link...',
  'auth.sendResetLink': 'Ipadala ang reset link',
  'auth.backToLogin': 'Balik sa login',
  'auth.sentNote':
    'Kung naay Bislig Ride driver account nga katumbas nianang username o email, naipadala na ang password reset link. Mubo ra kaayo kini nga panahon — susiha ang imong inbox (ug spam folder).',
  'auth.errMissingCredentials':
    'Isulod ang imong username o email ug password aron makapadayon.',
  'auth.errInvalidCredentials': 'Sayop ang username o password.',
  'auth.errNotLinked': 'Kini nga account dili naka-link sa Bislig Ride driver.',
  'auth.errDeactivated':
    'Gi-deactivate kini nga driver account. Kontaka ang admin aron ma-reactivate.',
  'auth.errForgotMissing': 'Isulod ang imong username o email aron makit-an ang imong account.',
  'auth.errResetFailed':
    'Dili maipadala karon ang reset link. Palihog sulayi og balik.',

  /* Driver blocked account (App) */
  'blocked.title': 'Inaktibo ang account',
  'blocked.text':
    'Inaktibo ang imong driver account. Palihog kontaka ang Bislig Ride aron ma-reactivate.',
  'blocked.back': 'Balik sa Ride Booking',

  /* Contact */
  'contact.eyebrow': 'KONTAKA KAMI',
  'contact.aria': 'Kontaka ang Bislig Ride',
  'contact.title': 'Mag-istorya ta.',
  'contact.intro':
    'Naay pangutana mahitungod sa Bislig Ride, gusto makipagsosyo kanamo, i-feature ang imong negosyo, o maghisgot og digital project? Ganahan namong madungog ka.',
  'contact.cardLabel': 'BISLIG RIDE',
  'contact.cardTitle': 'Gitukod para sa Bislig.',
  'contact.infoCopy':
    'Nagpagawas kami og lokal nga plataporma nga nagkonekta sa pasahero, driver, negosyo, ug komunidad.',
  'contact.location': 'Lokasyon',
  'contact.locationValue': 'Bislig City, Surigao del Sur',
  'contact.forBusinesses': 'Para sa mga negosyo',
  'contact.businessValue': 'Pakigsosyo ug featured listings',
  'contact.forProjects': 'Para sa mga proyekto',
  'contact.projectsValue': 'Websites ug digital solutions',
  'contact.exploreKicker': 'SUSIHON ANG BISLIG',
  'contact.exploreTitle': 'Gusto nimo madiskobrehan ang imong negosyo?',
  'contact.exploreText':
    'Sultihi kami mahitungod sa imong negosyo ug kung unsaon nimo pag-apil sa nagtubo nga Explore Bislig experience.',
  'contact.exploreLink': 'Susihon ang Bislig',
  'contact.msgReceived': 'NADAWAT ANG MENSAHE',
  'contact.thanksTitle': 'Salamat sa pag-abot nimo.',
  'contact.thanksText':
    'Nadawat na ang imong mensahe. Motubag kami dayon kutob sa mahimo.',
  'contact.sendAnother': 'Pagpadala og Laing Mensahe',
  'contact.contactEyebrow': 'KONTAKTA KAMI',
  'contact.helpTitle': 'Unsaon namo pagtabang?',
  'contact.helpText': 'Padal-i kami og mensahe ug i-direkta namo kini sa tukma nga lugar.',
  'contact.inquiryField': 'Unsa ang among matabang nimo?',
  'contact.inquiryGeneral': 'General nga Pangutana',
  'contact.inquiryRide': 'Ride / Rider Support',
  'contact.inquiryDriver': 'Driver Inquiry',
  'contact.inquiryPartnership': 'Business Partnership',
  'contact.inquiryFeature': 'I-feature ang Akong Negosyo',
  'contact.inquiryExplore': 'Susihon ang Bislig',
  'contact.inquiryWeb': 'Website / Digital Project',
  'contact.inquiryFeedback': 'Feedback / Sugyot',
  'contact.inquiryReport': 'I-report ang Problema',
  'contact.inquiryOther': 'Uban pa',
  'contact.fullName': 'Kompletong Ngalan',
  'contact.namePlaceholder': 'Imong pangalan',
  'contact.phone': 'Numero sa Telepono',
  'contact.email': 'Email',
  'contact.org': 'Negosyo / Organisasyon',
  'contact.orgPlaceholder': 'Negosyo o organisasyon',
  'contact.message': 'Mensahe',
  'contact.messagePlaceholder': 'Sultihi kami kon unsaon namo pagtabang...',
  'contact.sending': 'Nagpadala...',
  'contact.sendMessage': 'Ipadala ang Mensahe',
  'contact.formNote':
    'Pinaagi sa pag-submit niining form, mouyon ka nga gamiton sa Bislig Ride ang imong impormasyon aron makatubag sa imong pangutana.',
  'contact.submitFailed': 'Dili maipadala karon ang imong mensahe. Palihog sulayi og balik.',
}

type LanguageContextValue = {
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

const LANGUAGE_STORAGE_KEY_ACTIVE = LANGUAGE_STORAGE_KEY

function readStoredLanguage(): AppLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY_ACTIVE)
    if (stored === 'en' || stored === 'bi') {
      return stored
    }
  } catch {
    // localStorage unavailable — fall back to English
  }
  return 'en'
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage)

  useEffect(() => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY_ACTIVE, language)
    } catch {
      // localStorage unavailable — language still applies for this session
    }
  }, [language])

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next)
  }, [])

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const message =
        language === 'bi' ? (bi[key] ?? en[key]) : en[key]

      if (!params) {
        return message
      }

      return Object.entries(params).reduce(
        (result, [paramKey, paramValue]) =>
          result.replace(`{${paramKey}}`, String(paramValue)),
        message,
      )
    },
    [language],
  )

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  )

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error(
      'useLanguage must be used within a LanguageProvider',
    )
  }

  return context
}