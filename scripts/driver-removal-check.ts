import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const sql = readFileSync(join(projectRoot, 'supabase', 'admin_remove_driver.sql'), 'utf8')
const driversLib = readFileSync(join(projectRoot, 'src', 'lib', 'drivers.ts'), 'utf8')

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

const contains = (haystack: string, needle: string): boolean => haystack.includes(needle)

console.log('--- RPC definition ---')
assert('defines admin_remove_driver(uuid)', contains(sql, 'create or replace function public.admin_remove_driver(p_driver_id uuid)'), true)
assert('is security definer', /security\s+definer/.test(sql), true)
assert('scoped search_path', contains(sql, 'set search_path = public, auth, storage'), true)
assert('granted only to authenticated', contains(sql, 'grant execute on function public.admin_remove_driver(uuid) to authenticated'), true)
assert('revoked from public', contains(sql, 'revoke all on function public.admin_remove_driver(uuid) from public'), true)

console.log('--- Authorization ---')
assert('verifies JWT app_metadata.role === admin', contains(sql, "-> 'app_metadata' ->> 'role'") && contains(sql, "'admin'"), true)

console.log('--- What the RPC removes ---')
assert('removes live location probe', /\bdelete from public\.driver_locations\b/.test(sql), true)
assert('removes driver operational profile', /\bdelete from public\.drivers\b/.test(sql), true)
assert('removes linked auth user', /\bdelete from auth\.users\b/.test(sql), true)
assert('removes exclusive photo object if present', /\bdelete from storage\.objects\b/.test(sql), true)

console.log('--- Historical data is preserved (no destructive deletes) ---')
assert('never deletes rides history', /\bdelete from public\.rides\b/.test(sql), false)
assert('never deletes ride ratings', /\bdelete from public\.ride_ratings\b/.test(sql), false)
assert('never deletes ride cancellations', /\bdelete from public\.ride_cancellations\b/.test(sql), false)
assert('never deletes ride messages', /\bdelete from public\.ride_messages\b/.test(sql), false)
assert('never deletes pakyawan bookings', /\bdelete from public\.pakyawan_bookings\b/.test(sql), false)
assert('never cascades a delete statement', /delete\s+from\s+[^;]*\bcascade\b/i.test(sql), false)

console.log('--- Client wiring ---')
assert('frontend calls the admin_remove_driver RPC', contains(driversLib, "rpc('admin_remove_driver'"), true)
assert('frontend passes p_driver_id', contains(driversLib, 'p_driver_id'), true)

if (failures === 0) {
  console.log('\nAll driver removal assertions passed')
} else {
  console.error(`\n${failures} driver removal assertion(s) failed`)
  process.exit(1)
}