export type DemoPassengerType = 'Regular' | 'Student' | 'Senior Citizen' | 'PWD'

export type DemoDriver = {
  id: string
  name: string
  rating: number
  vehicleType: string
  vehicleModel: string
  vehicleColor?: string
  plateNumber: string
  profilePhoto: string
  phone?: string
}

export const demoDriver: DemoDriver = {
  id: 'demo-driver-001',
  name: 'Juan Dela Cruz',
  rating: 4.9,
  vehicleType: 'Tricycle',
  vehicleModel: 'Honda TMX / Tricycle',
  vehicleColor: 'Red',
  plateNumber: 'ABC 123',
  phone: '09123456789',
  profilePhoto:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80',
}

export const passengerTypes: DemoPassengerType[] = ['Regular', 'Student', 'Senior Citizen', 'PWD']
