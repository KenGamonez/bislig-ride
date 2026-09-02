import { demoDriver } from './demoDriver'

export type AdminRideStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed'
export type DriverAvailability = 'Offline' | 'Online' | 'Busy'
export type DriverStatus = 'Active' | 'Inactive'
export type PaymentStatus = 'Paid' | 'Pending'

export type AdminDriver = {
  id: string
  name: string
  phone: string
  email: string
  profilePhoto: string
  vehicleType: string
  vehicleModel: string
  plateNumber: string
  status: DriverStatus
  availability: DriverAvailability
  rating: number
  recentRides: Array<{ rideId: string; destination: string; status: AdminRideStatus; fare: string }>
}

export type AdminCustomer = {
  id: string
  name: string
  phone: string
  rides: number
  lastRide: string
  status: 'Verified' | 'VIP' | 'New'
}

export type AdminRide = {
  id: string
  customer: string
  customerPhone: string
  driver: string
  pickup: string
  destination: string
  status: AdminRideStatus
  requestedAt: string
  completedAt?: string
  passengerType: string
  paymentMethod: 'Cash' | 'GCash'
  fare: string
}

export type CompletedRide = {
  id: string
  customer: string
  driver: string
  pickup: string
  destination: string
  happenedAt: string
  fare: string
  paymentMethod: 'Cash' | 'GCash'
  status: 'completed'
}

export type PaymentRecord = {
  rideId: string
  customer: string
  amount: string
  paymentMethod: 'Cash' | 'GCash'
  status: PaymentStatus
  dateTime: string
}

export const adminDrivers: AdminDriver[] = [
  {
    id: 'driver-01',
    name: demoDriver.name,
    phone: '0917-123-4567',
    email: 'juan@bisligride.com',
    profilePhoto: demoDriver.profilePhoto,
    vehicleType: demoDriver.vehicleType,
    vehicleModel: demoDriver.vehicleModel,
    plateNumber: demoDriver.plateNumber,
    status: 'Active',
    availability: 'Online',
    rating: demoDriver.rating,
    recentRides: [
      { rideId: 'BR-2048', destination: 'Barangay Mangagoy', status: 'completed', fare: '₱180 DEMO' },
      { rideId: 'BR-2017', destination: 'City Plaza', status: 'in_progress', fare: '₱120 DEMO' },
    ],
  },
  {
    id: 'driver-02',
    name: 'Maria Santos',
    phone: '0928-774-8891',
    email: 'maria@bisligride.com',
    profilePhoto:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80',
    vehicleType: 'Motorbike',
    vehicleModel: 'Yamaha NMAX',
    plateNumber: 'ABC 7789',
    status: 'Active',
    availability: 'Busy',
    rating: 4.8,
    recentRides: [
      { rideId: 'BR-2039', destination: 'Purok 3', status: 'arrived', fare: '₱110 DEMO' },
      { rideId: 'BR-2012', destination: 'Talisay', status: 'completed', fare: '₱170 DEMO' },
    ],
  },
  {
    id: 'driver-03',
    name: 'Rafael Gomez',
    phone: '0906-441-9120',
    email: 'rafael@bisligride.com',
    profilePhoto:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80',
    vehicleType: 'Car',
    vehicleModel: 'Toyota Vios',
    plateNumber: 'XYZ 4450',
    status: 'Active',
    availability: 'Offline',
    rating: 4.7,
    recentRides: [
      { rideId: 'BR-1988', destination: 'Luna Street', status: 'completed', fare: '₱260 DEMO' },
      { rideId: 'BR-1964', destination: 'Bislig Airport', status: 'completed', fare: '₱320 DEMO' },
    ],
  },
  {
    id: 'driver-04',
    name: 'Liza Duran',
    phone: '0931-889-3207',
    email: 'liza@bisligride.com',
    profilePhoto:
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80',
    vehicleType: 'Motorbike',
    vehicleModel: 'Honda Click',
    plateNumber: 'DEF 6671',
    status: 'Inactive',
    availability: 'Offline',
    rating: 4.5,
    recentRides: [
      { rideId: 'BR-1935', destination: 'Barangay Tabon', status: 'completed', fare: '₱105 DEMO' },
      { rideId: 'BR-1902', destination: 'Market Center', status: 'completed', fare: '₱140 DEMO' },
    ],
  },
]

export const adminCustomers: AdminCustomer[] = [
  { id: 'customer-01', name: 'Alyssa Reyes', phone: '0917-555-1212', rides: 26, lastRide: 'Today, 09:45 AM', status: 'VIP' },
  { id: 'customer-02', name: 'Joel Mariano', phone: '0922-981-4024', rides: 14, lastRide: 'Yesterday, 06:10 PM', status: 'Verified' },
  { id: 'customer-03', name: 'Tina Baldo', phone: '0947-440-5516', rides: 9, lastRide: 'Today, 07:20 AM', status: 'New' },
  { id: 'customer-04', name: 'Mark Villanueva', phone: '0995-019-4431', rides: 33, lastRide: 'Mon, 11:30 AM', status: 'VIP' },
  { id: 'customer-05', name: 'Rosa Mae', phone: '0936-221-7604', rides: 8, lastRide: 'Sun, 02:05 PM', status: 'Verified' },
]

export const activeRides: AdminRide[] = [
  {
    id: 'BR-2047',
    customer: 'Alyssa Reyes',
    customerPhone: '0917-555-1212',
    driver: demoDriver.name,
    pickup: 'Barangay Sta. Cruz',
    destination: 'Bislig City Terminal',
    status: 'accepted',
    requestedAt: 'Today, 09:42 AM',
    passengerType: 'Regular',
    paymentMethod: 'GCash',
    fare: '₱180 DEMO',
  },
  {
    id: 'BR-2048',
    customer: 'Tina Baldo',
    customerPhone: '0947-440-5516',
    driver: 'Maria Santos',
    pickup: 'Purok 6',
    destination: 'Barangay Mangagoy',
    status: 'in_progress',
    requestedAt: 'Today, 09:15 AM',
    passengerType: 'Student',
    paymentMethod: 'Cash',
    fare: '₱120 DEMO',
  },
  {
    id: 'BR-2049',
    customer: 'Joel Mariano',
    customerPhone: '0922-981-4024',
    driver: 'Rafael Gomez',
    pickup: 'City Plaza',
    destination: 'Luna Street',
    status: 'arrived',
    requestedAt: 'Today, 08:52 AM',
    passengerType: 'Senior Citizen',
    paymentMethod: 'Cash',
    fare: '₱220 DEMO',
  },
]

export const completedRides: CompletedRide[] = [
  {
    id: 'BR-2041',
    customer: 'Alyssa Reyes',
    driver: demoDriver.name,
    pickup: 'Barangay San Jose',
    destination: 'Bislig Public Market',
    happenedAt: 'Today, 08:10 AM',
    fare: '₱160 DEMO',
    paymentMethod: 'GCash',
    status: 'completed',
  },
  {
    id: 'BR-2039',
    customer: 'Mark Villanueva',
    driver: 'Maria Santos',
    pickup: 'Barangay Mangagoy',
    destination: 'BSP Terminal',
    happenedAt: 'Yesterday, 06:44 PM',
    fare: '₱170 DEMO',
    paymentMethod: 'Cash',
    status: 'completed',
  },
  {
    id: 'BR-2034',
    customer: 'Rosa Mae',
    driver: 'Rafael Gomez',
    pickup: 'City Hall',
    destination: 'Luna Avenue',
    happenedAt: 'Yesterday, 03:18 PM',
    fare: '₱240 DEMO',
    paymentMethod: 'GCash',
    status: 'completed',
  },
  {
    id: 'BR-2028',
    customer: 'Joel Mariano',
    driver: 'Liza Duran',
    pickup: 'Purok 2',
    destination: 'Barangay San Miguel',
    happenedAt: 'Tue, 10:52 AM',
    fare: '₱155 DEMO',
    paymentMethod: 'Cash',
    status: 'completed',
  },
]

export const paymentRecords: PaymentRecord[] = [
  { rideId: 'BR-2041', customer: 'Alyssa Reyes', amount: '₱160 DEMO', paymentMethod: 'GCash', status: 'Paid', dateTime: 'Today, 08:15 AM' },
  { rideId: 'BR-2047', customer: 'Alyssa Reyes', amount: '₱180 DEMO', paymentMethod: 'GCash', status: 'Pending', dateTime: 'Today, 09:44 AM' },
  { rideId: 'BR-2039', customer: 'Mark Villanueva', amount: '₱170 DEMO', paymentMethod: 'Cash', status: 'Paid', dateTime: 'Yesterday, 06:47 PM' },
  { rideId: 'BR-2048', customer: 'Tina Baldo', amount: '₱120 DEMO', paymentMethod: 'Cash', status: 'Pending', dateTime: 'Today, 09:18 AM' },
]
