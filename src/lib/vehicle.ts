export type VehicleType = 'motorcycle' | 'umbak' | 'tricycle'

export const VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'umbak', 'tricycle']

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  motorcycle: 'Motorcycle',
  umbak: 'Umbak',
  tricycle: 'Tricycle',
}

export type PassengerCountOption =
  | '1 passenger'
  | '2 passengers'
  | '3 passengers'
  | '4 passengers'
  | '5+ passengers'

const ALL_PASSENGER_OPTIONS: PassengerCountOption[] = [
  '1 passenger',
  '2 passengers',
  '3 passengers',
  '4 passengers',
  '5+ passengers',
]

export const passengerCountOptionsFor = (vehicle: VehicleType): PassengerCountOption[] =>
  vehicle === 'motorcycle' ? [ALL_PASSENGER_OPTIONS[0]] : ALL_PASSENGER_OPTIONS

export const isPassengerCountValid = (vehicle: VehicleType, passengerCount: number): boolean => {
  if (!Number.isFinite(passengerCount) || passengerCount < 1) {
    return false
  }

  if (vehicle === 'motorcycle') {
    return passengerCount <= 1
  }

  return passengerCount <= 5
}

export const formatVehicleType = (vehicle: VehicleType | null | undefined): string =>
  vehicle ? VEHICLE_LABELS[vehicle] : 'Any vehicle'

export const formatVehicleCapacity = (capacity: number | null | undefined): string => {
  if (capacity == null || capacity < 1) {
    return 'Not set'
  }

  return capacity >= 5 ? '5+ passengers' : `${capacity} passengers`
}