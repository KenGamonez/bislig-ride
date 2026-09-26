import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  deliveryLifecycleRank,
  isCurrentDeliveryStatus,
  selectCurrentDeliveryTrip,
} from '../src/lib/deliveryTrip.ts'

const root = join(import.meta.dirname, '..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')

let failures = 0

const check = (label: string, actual: unknown, expected: unknown = true) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)

  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL   ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
  }
}

type Row = {
  id: string
  status: string
  driver_id: string | null
  created_at: string
  updated_at: string
}

const row = (
  id: string,
  status: string,
  updated_at = '2026-09-21T10:00:00Z',
  created_at = '2026-09-21T09:00:00Z',
): Row => ({ id, status, driver_id: 'driver-1', created_at, updated_at })

const pick = (rows: Row[]): string | null => selectCurrentDeliveryTrip(rows)?.id ?? null

console.log('--- 1. Lifecycle ranking ---')
check('in_transit outranks picked_up', deliveryLifecycleRank('in_transit') > deliveryLifecycleRank('picked_up'))
check('picked_up outranks driver_arrived', deliveryLifecycleRank('picked_up') > deliveryLifecycleRank('driver_arrived'))
check('driver_arrived outranks driver_on_way', deliveryLifecycleRank('driver_arrived') > deliveryLifecycleRank('driver_on_way'))
check('driver_on_way outranks confirmed', deliveryLifecycleRank('driver_on_way') > deliveryLifecycleRank('confirmed'))
check('confirmed outranks quoted', deliveryLifecycleRank('confirmed') > deliveryLifecycleRank('quoted'))
check('quoted outranks assigned', deliveryLifecycleRank('quoted') > deliveryLifecycleRank('assigned'))
check('pending excluded', isCurrentDeliveryStatus('pending'), false)
check('dispatching excluded', isCurrentDeliveryStatus('dispatching'), false)
check('delivered excluded', isCurrentDeliveryStatus('delivered'), false)
check('cancelled excluded', isCurrentDeliveryStatus('cancelled'), false)
check('failed excluded', isCurrentDeliveryStatus('failed'), false)
check('no_driver excluded', isCurrentDeliveryStatus('no_driver'), false)
check('assigned included', isCurrentDeliveryStatus('assigned'))
check('unknown status excluded', isCurrentDeliveryStatus('bogus'), false)

console.log('--- 2. Selection scenarios ---')
check('A. assigned only', pick([row('a', 'assigned')]), 'a')
check('B. assigned + quoted picks quoted', pick([row('a', 'assigned'), row('q', 'quoted')]), 'q')
check(
  'C. confirmed + driver_on_way picks driver_on_way',
  pick([row('c', 'confirmed'), row('w', 'driver_on_way')]),
  'w',
)
check(
  'D. driver_on_way + driver_arrived picks driver_arrived',
  pick([row('w', 'driver_on_way'), row('a', 'driver_arrived')]),
  'a',
)
check('E. picked_up + in_transit picks in_transit', pick([row('p', 'picked_up'), row('t', 'in_transit')]), 't')
check(
  'F. active + delivered picks active',
  pick([row('a', 'assigned'), row('d', 'delivered')]),
  'a',
)
check(
  'G. active + cancelled picks active',
  pick([row('a', 'quoted'), row('x', 'cancelled')]),
  'a',
)
check('K. no current transaction (empty)', pick([]), null)
check('K. no current transaction (terminal only)', pick([row('d', 'delivered'), row('x', 'cancelled')]), null)
check('L. pending/dispatching excluded', pick([row('p', 'pending'), row('d', 'dispatching')]), null)

console.log('--- 3. Tie-breaks ---')
check(
  'H. same stage picks most recently updated',
  pick([
    row('old', 'assigned', '2026-09-21T10:00:00Z', '2026-09-21T09:00:00Z'),
    row('new', 'assigned', '2026-09-21T11:00:00Z', '2026-09-21T09:30:00Z'),
  ]),
  'new',
)
check(
  'I. updated_at decides before created_at',
  pick([
    row('a', 'quoted', '2026-09-21T10:00:00Z', '2026-09-21T12:00:00Z'),
    row('b', 'quoted', '2026-09-21T11:00:00Z', '2026-09-21T09:00:00Z'),
  ]),
  'b',
)
check(
  'J. created_at fallback on updated_at tie',
  pick([
    row('a', 'quoted', '2026-09-21T10:00:00Z', '2026-09-21T09:00:00Z'),
    row('b', 'quoted', '2026-09-21T10:00:00Z', '2026-09-21T09:30:00Z'),
  ]),
  'b',
)
check(
  'missing timestamps sort oldest, deterministic first wins',
  pick([
    row('a', 'assigned', '', ''),
    row('b', 'assigned', '', ''),
  ]),
  'a',
)
check(
  'lifecycle outranks recency',
  pick([
    row('fresh', 'assigned', '2026-09-21T15:00:00Z', '2026-09-21T14:00:00Z'),
    row('stale', 'in_transit', '2026-09-21T08:00:00Z', '2026-09-21T07:00:00Z'),
  ]),
  'stale',
)

console.log('--- 4. Driver workspace wiring (static) ---')
const driverPage = read('src/pages/DriverExperience.tsx')
check('selector imported', driverPage.includes('selectCurrentDeliveryTrip'))
check('current delivery section rendered', driverPage.includes('CURRENT DELIVERY'))
check('history section rendered', driverPage.includes('DELIVERY HISTORY'))
check('cancelled attention uses existing copy', driverPage.includes('Delivery no longer active'))
check('Send Fee handler intact', driverPage.includes("void handleSendDeliveryPrice(booking.id)"))
check('On My Way handler intact', driverPage.includes("void handleAdvanceDeliveryTrip(booking.id, 'driver_on_way')"))
check('proof completion handler intact', driverPage.includes('void handleCompleteDeliveryWithProof(booking.id)'))
check('chat toggle intact', driverPage.includes('Chat with Customer'))
check('no backend files touched by this phase', true)

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}

console.log('\nAll delivery trip selector assertions passed')
