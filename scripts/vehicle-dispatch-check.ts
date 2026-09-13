// Bislig Ride — Vehicle type + passenger capacity dispatch harness.
// Verifies the 10 required checks for the Vehicle Type / Passenger Capacity
// feature:
//   1. A Motorcycle ride forces exactly 1 passenger in the ride UI.
//   2. A Motorcycle ride can never carry more than 1 passenger (UI + lib).
//   3. Umbak seats 1/2/3/4/5+; 4. Tricycle seats 1/2/3/4/5+.
//   5. Dispatch matches the requested vehicle type (driver's vehicle_type).
//   6. Dispatch requires driver capacity >= requested passenger count.
//   7.  5+ is stored as 5 and dispatches only to drivers configured for 5+.
//   8. Fare logic is untouched by this feature.
//   9. The GPS go-online gate is untouched by this feature.
//  10. Existing ride history stays readable/dispatchable (additive migration).
//
// Run: npm run test:vehicle  (Node runs TS directly; no test framework needed)

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatVehicleCapacity,
  isPassengerCountValid,
  passengerCountOptionsFor,
} from '../src/lib/vehicle.ts'

const ALL_PASSENGER_OPTIONS = [
  '1 passenger',
  '2 passengers',
  '3 passengers',
  '4 passengers',
  '5+ passengers',
]

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const read = (file: string): string => readFileSync(join(root, file), 'utf8')

const migration = read('supabase/driver_vehicle_capacity.sql')
const dispatchSql = read('supabase/dispatch_ride_rpc.sql')
const presenceSql = read('supabase/dispatch_set_driver_presence.sql')
const customerUi = read('src/pages/CustomerExperience.tsx')
const driverUi = read('src/pages/DriverExperience.tsx')
const adminUi = read('src/pages/AdminExperience.tsx')
const ridesLib = read('src/lib/rides.ts')
const rideTypes = read('src/types/ride.ts')
const fareLib = read('src/lib/fare.ts')

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

const assertTrue = (label: string, ok: boolean, detail = '') => {
  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL   ${label}${detail ? `: ${detail}` : ''}`)
  }
}

const assertMatch = (label: string, haystack: string, needle: string) => {
  const ok = haystack.includes(needle)
  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    const preview = haystack.includes(needle) ? '' : `missing ${JSON.stringify(needle)}`
    console.log(`FAIL   ${label}: ${preview || 'not found'}`)
  }
}

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1

console.log('--- 1. Motorcycle forces exactly 1 passenger ---')
assert(
  'motorcycle passenger options reduce to 1 passenger',
  passengerCountOptionsFor('motorcycle'),
  ['1 passenger'],
)
assertMatch(
  'customer UI note says exactly 1 passenger',
  customerUi,
  'Motorcycle rides carry exactly 1 passenger.',
)
assertTrue(
  'customer UI auto-forces count back to 1 when Vehicle = Motorcycle',
  /vehicle === 'motorcycle' \? '1 passenger'/.test(customerUi) || /Motorcycle.*passengerCount/.test(customerUi),
)

console.log('--- 2. Motorcycle can never exceed 1 passenger ---')
for (const count of [2, 3, 4, 5, 6, 9]) {
  assert(`motorcycle rejects ${count} passengers`, isPassengerCountValid('motorcycle', count), false)
}
assert('motorcycle accepts exactly 1', isPassengerCountValid('motorcycle', 1), true)
assertTrue(
  'customer submit-time guard exists for motorcycle > 1',
  customerUi.includes('parsedCount > 1'),
  'expected a submit guard in CustomerExperience.tsx',
)

console.log('--- 3. Umbak seats 1/2/3/4/5+ ---')
assert('umbak offers all five options', passengerCountOptionsFor('umbak'), ALL_PASSENGER_OPTIONS)
for (const count of [1, 2, 3, 4, 5]) {
  assert(`umbak accepts ${count}`, isPassengerCountValid('umbak', count), true)
}
assert('umbak rejects 6', isPassengerCountValid('umbak', 6), false)

console.log('--- 4. Tricycle seats 1/2/3/4/5+ ---')
assert('tricycle offers all five options', passengerCountOptionsFor('tricycle'), ALL_PASSENGER_OPTIONS)
for (const count of [1, 2, 3, 4, 5]) {
  assert(`tricycle accepts ${count}`, isPassengerCountValid('tricycle', count), true)
}
assert('tricycle rejects 6', isPassengerCountValid('tricycle', 6), false)

console.log('--- 5. Dispatch matches the requested vehicle type ---')
const vehicleMatchExpression = `lower(coalesce(d.vehicle_type, '')) = v_ride.vehicle_type`
assertTrue(
  'vehicle type match is applied in the candidate query (and pool)',
  countOccurrences(dispatchSql, vehicleMatchExpression) >= 2,
  `expected >= 2 occurrences of ${vehicleMatchExpression}`,
)
assertMatch('rides.vehicle_type is constrained', migration, `check (vehicle_type in ('motorcycle', 'umbak', 'tricycle'))`)

console.log('--- 6. Dispatch requires capacity >= requested count ---')
assertTrue(
  'capacity gate uses vehicle_capacity >= passenger_count in candidate query (and pool)',
  countOccurrences(dispatchSql, `d.vehicle_capacity is not null and d.vehicle_capacity >= v_ride.passenger_count`) >= 2,
)
assertMatch('drivers.vehicle_capacity column added', migration, `add column if not exists vehicle_capacity integer`)

console.log('--- 7. 5+ stored as 5 dispatches only to 5+ drivers ---')
assertMatch('capacity CHECK is bounded to 1..5', migration, `(vehicle_capacity between 1 and 5)`)
assert('formatVehicleCapacity(5) renders 5+', formatVehicleCapacity(5), '5+ passengers')
assert('formatVehicleCapacity(4) renders 4 passengers', formatVehicleCapacity(4), '4 passengers')
assert(
  'dispatch compares stored capacity >= stored count (5 = 5+)',
  dispatchSql.includes(`d.vehicle_capacity >= v_ride.passenger_count`),
  true,
)

console.log('--- 8. Fare logic is untouched ---')
assertTrue('fare lib has no vehicle/capacity coupling', !/vehicle|capacity/i.test(fareLib))
assertTrue('migration does not alter fare tables or columns', !/fare/i.test(migration))
assertTrue('dispatch SQL does not recompute fares', !/fare/i.test(dispatchSql))
assertTrue('migration is additive only (no drops)', !/\bdrop\s+table|drop\s+column\b/i.test(migration))

console.log('--- 9. GPS go-online gate is untouched ---')
assertMatch('presence RPC still the 5-arg set_driver_presence', presenceSql, `public.set_driver_presence`)
assertTrue(
  'dispatch still requires a GPS fix fresher than 60s',
  dispatchSql.includes(`dl.updated_at >= now() - interval '60 seconds'`),
)
assertTrue('migration does not touch driver_locations', !migration.includes('driver_locations'))

console.log('--- 10. Existing ride history stays readable & dispatchable ---')
assertMatch('rides.vehicle_type added with IF NOT EXISTS', migration, `add column if not exists vehicle_type text`)
assertTrue('migration never rewrites existing rides', !/update public\.rides|delete from public\.rides/i.test(migration))
assertTrue('legacy rides bypass the vehicle filter', dispatchSql.includes('v_ride.vehicle_type is null'))
assertMatch(
  'rides lib writes vehicle_type on create',
  ridesLib,
  'vehicle_type',
)
assertTrue('Ride type exposes nullable vehicle_type', /vehicle_type:\s*(RequestedVehicleType|'motorcycle' \| 'umbak' \| 'tricycle')\s*\|\s*null/.test(rideTypes + ''))

console.log('--- extra: admin & driver UI wiring ---')
assertTrue('admin creates drivers with capacity', adminUi.includes('vehicle_capacity: driverDraft.vehicleCapacity'))
assertTrue('admin can edit existing driver vehicle + capacity', adminUi.includes('DriverVehicleEditor'))
assertTrue('driver UI selects vehicle_capacity', driverUi.includes('vehicle_capacity'))
assertTrue('driver request card shows requested vehicle', driverUi.includes('formatVehicleType(request?.vehicle_type)'))
assertTrue('driver hero shows own capacity', driverUi.includes('formatVehicleCapacity'))

if (failures === 0) {
  console.log('\nAll vehicle dispatch checks passed.')
} else {
  console.log(`\n${failures} vehicle dispatch check(s) FAILED.`)
  process.exitCode = 1
}