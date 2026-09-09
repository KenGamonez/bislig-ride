export type PassengerType = 'Regular' | 'Student' | 'Senior Citizen' | 'PWD'

export type DestinationMode = 'same' | 'multiple'

export type FareSource = 'matrix' | 'distance'

export const DEFAULT_FARE_LEVEL = 1

export const BASE_FARE_DISTANCE_KM = 4

export const SUCCEEDING_KILOMETER_CENTS = 500

export const MULTIPLE_DESTINATIONS_FARE_NOTE =
  'Multiple destinations — fare handled traditionally with the driver.'

export type FuelLevel = {
  level: number
  pricePerLiterMinCents: number | null
  pricePerLiterMaxCents: number | null
  generalCents: number
  discountedCents: number
}

export const fuelLevels: FuelLevel[] = [
  { level: 1, pricePerLiterMinCents: null, pricePerLiterMaxCents: 7099, generalCents: 1500, discountedCents: 1200 },
  { level: 2, pricePerLiterMinCents: 7100, pricePerLiterMaxCents: 8099, generalCents: 1600, discountedCents: 1280 },
  { level: 3, pricePerLiterMinCents: 8100, pricePerLiterMaxCents: 9099, generalCents: 1700, discountedCents: 1360 },
  { level: 4, pricePerLiterMinCents: 9100, pricePerLiterMaxCents: 10099, generalCents: 1800, discountedCents: 1440 },
  { level: 5, pricePerLiterMinCents: 10100, pricePerLiterMaxCents: 11099, generalCents: 1900, discountedCents: 1520 },
  { level: 6, pricePerLiterMinCents: 11100, pricePerLiterMaxCents: 12099, generalCents: 2000, discountedCents: 1600 },
  { level: 7, pricePerLiterMinCents: 12100, pricePerLiterMaxCents: 13099, generalCents: 2100, discountedCents: 1680 },
  { level: 8, pricePerLiterMinCents: 13100, pricePerLiterMaxCents: 14000, generalCents: 2200, discountedCents: 1760 },
  { level: 9, pricePerLiterMinCents: 14101, pricePerLiterMaxCents: 15000, generalCents: 2300, discountedCents: 1840 },
]

export const selectFuelLevel = (pricePerLiterPesos: number): number => {
  const priceCents = Math.round(pricePerLiterPesos * 100)

  for (const level of fuelLevels) {
    const min = level.pricePerLiterMinCents ?? Number.NEGATIVE_INFINITY
    const max = level.pricePerLiterMaxCents ?? Number.POSITIVE_INFINITY

    if (priceCents >= min && priceCents <= max) {
      return level.level
    }
  }

  return DEFAULT_FARE_LEVEL
}

export type DestinationMatrixRow = {
  name: string
  distanceKm: number | null
  levelCents: number[]
}

const range = (firstPesos: number): number[] =>
  Array.from({ length: fuelLevels.length }, (_, index) => (firstPesos + index) * 100)

export const mangagoyDestinationMatrix: DestinationMatrixRow[] = [
  { name: 'Tabon Proper', distanceKm: 4, levelCents: range(15) },
  { name: 'KM 3 Tabon', distanceKm: null, levelCents: range(30) },
  { name: 'KM 5 Tabon', distanceKm: null, levelCents: range(40) },
  { name: 'KM 8 NGCP', distanceKm: null, levelCents: range(50) },
  { name: 'Comawas', distanceKm: 5, levelCents: range(20) },
  { name: 'City Hall', distanceKm: 6, levelCents: range(25) },
  { name: 'Poblacion', distanceKm: 7, levelCents: range(30) },
  { name: 'San Fernando', distanceKm: 8, levelCents: range(35) },
  { name: 'Kahayag', distanceKm: 10, levelCents: range(45) },
  { name: 'Coleto', distanceKm: 13, levelCents: range(60) },
  { name: 'San Roque', distanceKm: 12, levelCents: range(55) },
  { name: 'Maharlika', distanceKm: 13, levelCents: range(60) },
  { name: 'Sanyata', distanceKm: 16, levelCents: range(75) },
  { name: 'Mantaban', distanceKm: 16, levelCents: range(75) },
  { name: 'Puerto', distanceKm: 16, levelCents: range(75) },
  { name: 'San Rafael', distanceKm: 19, levelCents: range(90) },
  { name: 'Mabog', distanceKm: 27, levelCents: range(130) },
  { name: 'Sta. Cruz', distanceKm: 18, levelCents: range(85) },
  { name: 'Bucto', distanceKm: 25, levelCents: range(120) },
  { name: 'Sibaroy', distanceKm: 23, levelCents: range(110) },
  { name: 'Tumanan', distanceKm: 27, levelCents: range(130) },
  { name: 'Caguyao', distanceKm: 29, levelCents: range(140) },
  { name: 'San Vicente', distanceKm: 18, levelCents: range(85) },
  { name: 'San Antonio', distanceKm: 12, levelCents: range(55) },
  { name: 'San Isidro', distanceKm: 6, levelCents: range(25) },
  { name: 'Mone', distanceKm: 10, levelCents: range(45) },
  { name: 'Burboanan', distanceKm: 13, levelCents: range(60) },
  { name: 'Tinuy-an', distanceKm: 17, levelCents: range(80) },
  { name: 'Danipas', distanceKm: 8, levelCents: range(35) },
  { name: 'Labisma', distanceKm: 12, levelCents: range(55) },
  { name: 'Lawigan', distanceKm: 18, levelCents: range(85) },
  { name: 'San Jose', distanceKm: 16, levelCents: range(75) },
]

export const formatCentavos = (cents: number): string => (cents / 100).toFixed(2)

export const isDiscountEligiblePassenger = (passengerType: PassengerType): boolean =>
  passengerType !== 'Regular'

export const applyPassengerDiscount = (generalCents: number): number =>
  Math.round((generalCents * 4) / 5)

const normalizePhrase = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

export const findDestinationMatrixRow = (destination: string): DestinationMatrixRow | null => {
  const destinationPhrase = normalizePhrase(destination)
  let match: DestinationMatrixRow | null = null
  let matchLength = 0

  for (const row of mangagoyDestinationMatrix) {
    const rowPhrase = normalizePhrase(row.name)

    if (rowPhrase.length > matchLength && destinationPhrase.includes(rowPhrase)) {
      match = row
      matchLength = rowPhrase.length
    }
  }

  return match
}

export type FareQuoteResult = {
  fareCents: number
  discountApplied: boolean
  source: FareSource
  matchedDestination: string | null
}

export type FareQuoteInput = {
  destination: string
  destinationMode: DestinationMode
  passengerType: PassengerType
  fuelLevel?: number
  distanceKm?: number | null
}

export function computeFare(input: FareQuoteInput): FareQuoteResult | null {
  if (input.destinationMode !== 'same') {
    return null
  }

  const fuelLevel = Math.min(Math.max(input.fuelLevel ?? DEFAULT_FARE_LEVEL, 1), fuelLevels.length)
  const discountApplied = isDiscountEligiblePassenger(input.passengerType)

  const matrixRow = findDestinationMatrixRow(input.destination)

  if (matrixRow) {
    const generalCents = matrixRow.levelCents[fuelLevel - 1]

    if (typeof generalCents !== 'number') {
      return null
    }

    return {
      fareCents: discountApplied ? applyPassengerDiscount(generalCents) : generalCents,
      discountApplied,
      source: 'matrix',
      matchedDestination: matrixRow.name,
    }
  }

  if (input.distanceKm != null && input.distanceKm > 0) {
    const generalCents =
      fuelLevels[fuelLevel - 1].generalCents +
      Math.max(0, Math.ceil(input.distanceKm - BASE_FARE_DISTANCE_KM)) * SUCCEEDING_KILOMETER_CENTS

    return {
      fareCents: discountApplied ? applyPassengerDiscount(generalCents) : generalCents,
      discountApplied,
      source: 'distance',
      matchedDestination: null,
    }
  }

  return null
}