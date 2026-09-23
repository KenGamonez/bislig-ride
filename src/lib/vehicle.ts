export type VehicleType = 'motorcycle' | 'umbak' | 'tricycle'

export const VEHICLE_TYPES: VehicleType[] = ['motorcycle', 'umbak', 'tricycle']

export const VEHICLE_LABELS: Record<VehicleType, string> = {
  motorcycle: 'Motorcycle',
  umbak: 'Umbak',
  tricycle: 'Tricycle',
}

export const VEHICLE_MAX_PASSENGERS: Record<VehicleType, number> = {
  motorcycle: 1,
  umbak: 5,
  tricycle: 7,
}

export type PassengerCountOption =
  | '1 passenger'
  | '2 passengers'
  | '3 passengers'
  | '4 passengers'
  | '5+ passengers'
  | '6 passengers'
  | '7 passengers'

const ALL_PASSENGER_OPTIONS: PassengerCountOption[] = [
  '1 passenger',
  '2 passengers',
  '3 passengers',
  '4 passengers',
  '5+ passengers',
  '6 passengers',
  '7 passengers',
]

export const passengerCountOptionsFor = (vehicle: VehicleType): PassengerCountOption[] =>
  ALL_PASSENGER_OPTIONS.slice(0, VEHICLE_MAX_PASSENGERS[vehicle])

export const isPassengerCountValid = (vehicle: VehicleType, passengerCount: number): boolean => {
  if (!Number.isFinite(passengerCount) || passengerCount < 1) {
    return false
  }

  return passengerCount <= VEHICLE_MAX_PASSENGERS[vehicle]
}

export const passengerCapacityOptionsFor = (vehicle: VehicleType): number[] =>
  Array.from({ length: VEHICLE_MAX_PASSENGERS[vehicle] }, (_, index) => index + 1)

export const formatCapacityOption = (vehicle: VehicleType, capacity: number): string => {
  if (capacity === VEHICLE_MAX_PASSENGERS[vehicle] && capacity > 1) {
    return `${capacity} passengers (${capacity}+)`
  }

  return `${capacity} ${capacity === 1 ? 'passenger' : 'passengers'}`
}

export const formatVehicleType = (vehicle: VehicleType | null | undefined): string =>
  vehicle ? VEHICLE_LABELS[vehicle] : 'Any vehicle'

export const formatVehicleCapacity = (capacity: number | null | undefined): string => {
  if (capacity == null || capacity < 1) {
    return 'Not set'
  }

  if (capacity === 6) {
    return '6 passengers'
  }

  if (capacity >= 7) {
    return '7 passengers'
  }

  return capacity >= 5 ? '5+ passengers' : `${capacity} ${capacity === 1 ? 'passenger' : 'passengers'}`
}