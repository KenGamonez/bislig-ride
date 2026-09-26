import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

const migration = read('supabase/delivery_customer_cancel.sql')
const deliveriesLib = read('src/lib/deliveries.ts')
const paDeliverPage = read('src/pages/PaDeliverExperience.tsx')

console.log('--- 1. Passenger cancel RPC ---')
check(
  'cancel_delivery_booking defined with token args',
  migration.includes('create or replace function public.cancel_delivery_booking(p_delivery_id uuid, p_access_token uuid)'),
)
check('RPC is security definer', migration.includes('cancel_delivery_booking') && migration.includes('security definer'))
check('RPC pins search_path', migration.includes('set search_path = public, auth'))
check('pending allowed', migration.includes("v_row.status <> 'pending' and v_row.status <> 'dispatching'"))
check('assigned driver blocks cancel', migration.includes('v_row.driver_id is not null'))
check('writes cancelled status', migration.includes("set status = 'cancelled'"))
check('writes delivery_cancellations ledger', migration.includes('insert into public.delivery_cancellations'))
check('ledger role is customer', migration.includes("'customer'"))
check('EXECUTE granted to anon', migration.includes('grant execute on function public.cancel_delivery_booking(uuid, uuid) to anon, authenticated, service_role'))
check('no RLS policy changes', !migration.includes('create policy'))
check('no table grants', !migration.includes('grant select on') && !migration.includes('grant update on') && !migration.includes('grant insert on'))

console.log('--- 2. Frontend helper ---')
check('cancelDeliveryBooking helper exists', deliveriesLib.includes('cancel_delivery_booking'))

console.log('--- 3. Passenger UI gating ---')
check(
  'cancel control only in pending/dispatching',
  paDeliverPage.includes("status === 'pending' || status === 'dispatching'"),
)
check('cancel asks for confirmation first', paDeliverPage.includes('confirmingCancel'))
check('cancel keeps booking on failure', paDeliverPage.includes('pad.cancelFailed'))

console.log('--- 4. No workflow regressions ---')
check('dispatch untouched by cancel migration', !migration.includes('dispatch_delivery_booking'))
check('accept RPC untouched', !migration.includes('accept_delivery_offer'))

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`)
  process.exit(1)
}

console.log('\nAll delivery cancel assertions passed')
