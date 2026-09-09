import {
  computeFare,
  findDestinationMatrixRow,
  fuelLevels,
  selectFuelLevel,
  type FareQuoteResult,
} from '../src/lib/fare.ts'

let failures = 0

const assert = (label: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)

  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL   ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
  }
}

const quote = (
  destination: string,
  passengerType: 'Regular' | 'Student' | 'Senior Citizen' | 'PWD',
  destinationMode: 'same' | 'multiple' = 'same',
  fuelLevel = 1,
): FareQuoteResult | null =>
  computeFare({
    destination,
    destinationMode,
    passengerType,
    fuelLevel,
    distanceKm: null,
  })

const exactFareCents = (result: FareQuoteResult | null): number | null => result?.fareCents ?? null

console.log('--- Section A: first 4 km fare matrix ---')
const sectionAGeneral = [1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300]
const sectionADiscounted = [1200, 1280, 1360, 1440, 1520, 1600, 1680, 1760, 1840]

fuelLevels.forEach((level, index) => {
  assert(
    `L${level.level} general = ₱${(sectionAGeneral[index] / 100).toFixed(2)}`,
    level.generalCents,
    sectionAGeneral[index],
  )
  assert(
    `L${level.level} discounted = ₱${(sectionADiscounted[index] / 100).toFixed(2)}`,
    level.discountedCents,
    sectionADiscounted[index],
  )
})

console.log('--- Rule scenarios ---')
assert('T1 1 rider -> Tabon Proper L1 = ₱15.00', exactFareCents(quote('Tabon Proper', 'Regular')), 1500)
assert('T1 discounted rider -> Tabon Proper L1 = ₱12.00', exactFareCents(quote('Tabon Proper', 'Student')), 1200)
assert('T3 5 riders -> same destination = ONE fare', exactFareCents(quote('Tabon Proper', 'Regular')), 1500)
assert('T4 multiple destinations -> fare_cents = null', quote('Tabon Proper', 'Regular', 'multiple'), null)
assert('T6 Caguyao L9 = ₱148.00', exactFareCents(quote('Caguyao', 'Regular', 'same', 9)), 14800)
assert('T7 KM 3 Tabon = ₱30.00 (from matrix, not derived from name)', exactFareCents(quote('KM 3 Tabon', 'Regular')), 3000)
assert('T8 San Roque L1 = ₱55.00', exactFareCents(quote('San Roque', 'Regular')), 5500)
assert('L2 Tabon Proper = ₱16.00', exactFareCents(quote('Tabon Proper', 'Regular', 'same', 2)), 1600)
assert('L2 Tabon Proper discounted = ₱12.80', exactFareCents(quote('Tabon Proper', 'PWD', 'same', 2)), 1280)
assert('KM 8 NGCP = ₱50.00', exactFareCents(quote('KM 8 NGCP', 'Regular')), 5000)
assert('KM 5 Tabon = ₱40.00', exactFareCents(quote('KM 5 Tabon', 'Regular')), 4000)
assert('City Hall substring "Bislig City Hall" = ₱25.00', exactFareCents(quote('Bislig City Hall', 'Regular')), 2500)
assert('San Roque/Scaling phrase = ₱55.00', exactFareCents(quote('San Roque/Scaling', 'Regular')), 5500)
assert('Comawas = ₱20.00', exactFareCents(quote('Comawas', 'Regular')), 2000)
assert('Poblacion = ₱30.00', exactFareCents(quote('Poblacion, Bislig City', 'Regular')), 3000)
assert('San Jose = ₱75.00', exactFareCents(quote('San Jose', 'Regular')), 7500)
assert('unmatched destination -> no auto fare', quote('Somewhere Unknown', 'Regular'), null)

console.log('--- Excluded / unverified destinations ---')
const excluded = ['Pamanlinan', 'Sikahoy', 'Pamaypayan', 'Sote']
excluded.forEach((name) => {
  assert(`${name} absent from matrix`, findDestinationMatrixRow(name), null)
  assert(`${name} produces no guessed fare`, quote(name, 'Regular'), null)
})

console.log('--- Matrix integrity ---')
const verifiedRows = [
  'Tabon Proper', 'KM 3 Tabon', 'KM 5 Tabon', 'KM 8 NGCP', 'Comawas', 'City Hall', 'Poblacion',
  'San Fernando', 'Kahayag', 'Coleto', 'San Roque', 'Maharlika', 'Sanyata', 'Mantaban', 'Puerto',
  'San Rafael', 'Mabog', 'Sta. Cruz', 'Bucto', 'Sibaroy', 'Tumanan', 'Caguyao', 'San Vicente',
  'San Antonio', 'San Isidro', 'Mone', 'Burboanan', 'Tinuy-an', 'Danipas', 'Labisma', 'Lawigan', 'San Jose',
]
assert('all 32 verified matrix rows present', verifiedRows.every((name) => findDestinationMatrixRow(name) !== null), true)

console.log('--- Fuel level selection ---')
assert('70.99/L -> L1', selectFuelLevel(70.99), 1)
assert('72.50/L -> L2', selectFuelLevel(72.5), 2)
assert('130.00/L -> L7', selectFuelLevel(130), 7)
assert('131.00/L -> L8', selectFuelLevel(131), 8)
assert('140.00/L -> L8', selectFuelLevel(140), 8)
assert('141.50/L -> L9', selectFuelLevel(141.5), 9)

console.log('')
if (failures > 0) {
  console.log(`${failures} assertion(s) FAILED`)
  process.exitCode = 1
} else {
  console.log('All fare assertions passed')
}