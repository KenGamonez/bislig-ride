import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (rel: string): string => readFileSync(join(root, rel), 'utf8')
const stripSqlComments = (sql: string): string =>
  sql
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--')
      return idx >= 0 ? line.slice(0, idx) : line
    })
    .join('\n')

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

const migration = read('supabase/delivery_driver_price.sql')
const migrationCode = stripSqlComments(migration)
const driverPage = read('src/pages/DriverExperience.tsx')
const deliveriesLib = read('src/lib/deliveries.ts')
const paDeliverPage = read('src/pages/PaDeliverExperience.tsx')
const i18n = read('src/lib/i18n.tsx')
const deliveriesBase = read('supabase/deliveries.sql')

console.log('--- 1. Status values ---')
for (const status of ['quoted', 'confirmed']) {
  check(`migration CHECK includes '${status}'`, migration.includes(`'${status}'`))
}
for (const status of [
  'pending',
  'dispatching',
  'assigned',
  'driver_on_way',
  'driver_arrived',
  'picked_up',
  'in_transit',
  'delivered',
  'cancelled',
  'no_driver',
  'failed',
]) {
  check(`base deliveries.sql still allows '${status}'`, deliveriesBase.includes(`'${status}'`))
  check(`migration CHECK preserves '${status}'`, migration.includes(`'${status}'`))
}

console.log('--- 2. Driver price RPC ---')
check('set_delivery_driver_price defined', migration.includes('create or replace function public.set_delivery_driver_price(p_delivery_id uuid, p_price_cents integer)'))
check('price RPC is security definer', migration.includes('set_delivery_driver_price') && migration.includes('security definer'))
check('price RPC pins search_path', migration.includes("set search_path = public, auth"))
check('price RPC derives driver from auth.uid()', migration.includes('d.auth_user_id = auth.uid()'))
check('price RPC requires assigned status', migration.includes("v_delivery.status <> 'assigned'"))
check('price RPC rejects non-positive fee', migration.includes('p_price_cents <= 0'))
check('price RPC rejects already-priced delivery', migration.includes('v_delivery.price_cents is not null'))
check('price RPC writes quoted status', migration.includes("status = 'quoted'"))
check('price RPC revoked from public', migration.includes('revoke all on function public.set_delivery_driver_price(uuid, integer) from public'))
check('price RPC granted to authenticated', migration.includes('grant execute on function public.set_delivery_driver_price(uuid, integer) to authenticated, service_role'))

console.log('--- 3. Customer confirm RPC ---')
check('confirm_delivery_quote defined', migration.includes('create or replace function public.confirm_delivery_quote(p_delivery_id uuid, p_access_token uuid)'))
check('confirm RPC requires quoted status', migration.includes("and status = 'quoted'"))
check('confirm RPC requires positive price', migration.includes('and price_cents > 0'))
check('confirm RPC moves to confirmed', migration.includes("set status = 'confirmed'"))
check('confirm RPC wrong token fails', migration.includes('Delivery not found. Check your delivery reference and try again.'))
check('confirm RPC token-gated for anon', migration.includes('grant execute on function public.confirm_delivery_quote(uuid, uuid) to anon, authenticated'))

console.log('--- 4. Lifecycle hardening ---')
check('advance redefined in migration', migration.includes('create or replace function public.advance_delivery_status(p_delivery_id uuid, p_next_status text)'))
check('confirmed -> driver_on_way allowed', migration.includes("v_delivery.status = 'confirmed' and p_next_status <> 'driver_on_way'"))
check('assigned -> driver_on_way removed', !migration.includes("v_delivery.status = 'assigned' and p_next_status <> 'driver_on_way'"))
check('assigned/quoted blocked by guard list', migration.includes("v_delivery.status not in ('confirmed', 'driver_on_way', 'driver_arrived', 'picked_up')"))
check('delivered still not an advance target', !migrationCode.includes("'delivered'") || migration.includes("p_next_status not in ('driver_on_way', 'driver_arrived', 'picked_up', 'in_transit')"))
check('proof completion untouched', read('supabase/delivery_proof.sql').includes('create or replace function public.complete_delivery_with_proof'))

console.log('--- 5. Frontend wiring ---')
check('lib has setDeliveryDriverPrice', deliveriesLib.includes('set_delivery_driver_price'))
check('lib has confirmDeliveryQuote', deliveriesLib.includes('confirm_delivery_quote'))
check('held list includes quoted/confirmed', deliveriesLib.includes("'assigned', 'quoted', 'confirmed', 'driver_on_way'"))
check('driver fee submit handler exists', driverPage.includes('handleSendDeliveryPrice'))
check('driver fee box on assigned only', driverPage.includes("booking.status === 'assigned' ? (") && driverPage.includes('send your delivery fee'))
check('driver On My Way gated on confirmed', driverPage.includes("booking.status === 'confirmed' ? (") && driverPage.includes("handleAdvanceDeliveryTrip(booking.id, 'driver_on_way')"))
check('customer quoted fee + confirm UI', paDeliverPage.includes('confirmDeliveryQuote') && paDeliverPage.includes("t('pad.deliveryFee')") && paDeliverPage.includes("t('pad.confirmDelivery')"))
check('customer confirmed UI', paDeliverPage.includes("t('pad.trackConfirmed')") && paDeliverPage.includes("t('pad.confirmedBody')"))
check('customer localStorage restore', paDeliverPage.includes('bislig-ride-padeliver-') && paDeliverPage.includes('restoreTrackedDelivery'))
check('i18n EN + BI quote keys', i18n.includes("'pad.quoteReady'") && i18n.includes("'pad.trackConfirmed'") && i18n.includes("'pad.confirmDelivery'") && i18n.includes('Andam na ang Delivery Fee'))

console.log('--- 6b. Constraint replacement mechanism ---')
check('no pg_get_constraintdef expression matching', !migration.includes('pg_get_constraintdef'))
check('drops deliveries_status_check by exact name', migration.includes('drop constraint if exists deliveries_status_check'))
check('re-adds deliveries_status_check widened', migration.includes('add constraint deliveries_status_check check (status in ('))

console.log('--- 6. Cross-system isolation ---')
check('migration touches no pakyawan tables', !migrationCode.includes('pakyawan_'))
check('migration touches no rides tables', !migrationCode.includes('public.rides') && !migrationCode.includes('ride_offers'))
check('migration adds no triggers', !migrationCode.toLowerCase().includes('create trigger'))
check('migration adds no cron', !migrationCode.toLowerCase().includes('pg_cron'))
check('pull RLS file untouched by quote flow', !migrationCode.includes('create policy'))

console.log('')
if (failures > 0) {
  console.log(`${failures} assertion(s) FAILED`)
  process.exitCode = 1
} else {
  console.log('All delivery quote assertions passed')
}
