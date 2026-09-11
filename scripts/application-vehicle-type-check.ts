import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const sql = readFileSync(join(projectRoot, 'supabase', 'driver_applications.sql'), 'utf8')
const migrationSql = readFileSync(join(projectRoot, 'supabase', 'driver_applications_vehicle_type.sql'), 'utf8')
const types = readFileSync(join(projectRoot, 'src', 'types', 'driverApplication.ts'), 'utf8')
const lib = readFileSync(join(projectRoot, 'src', 'lib', 'driverApplications.ts'), 'utf8')
const form = readFileSync(join(projectRoot, 'src', 'pages', 'BecomeDriverExperience.tsx'), 'utf8')
const admin = readFileSync(join(projectRoot, 'src', 'pages', 'AdminExperience.tsx'), 'utf8')
const header = readFileSync(join(projectRoot, 'src', 'components', 'AppHeader.tsx'), 'utf8')

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

console.log('--- Database migration ---')
assert('driver_applications_vehicle_type.sql exists', contains(migrationSql, "table public.driver_applications"), true)
assert('add column if not exists vehicle_type text (idempotent)', /\badd\s+column\s+if\s+not\s+exists\s+vehicle_type\s+text\b/.test(migrationSql), true)
assert('create-table script includes vehicle_type', /\bvehicle_type\s+text\b/.test(sql), true)

console.log('--- Types ---')
assert('DriverApplication type includes vehicle_type', /\bvehicle_type:\s*string/.test(types), true)

console.log('--- Library mapping ---')
assert('mapApplication maps vehicle_type', /vehicle_type:\s*row\.vehicle_type\s*\?\?/.test(lib), true)

console.log('--- Applicant form ---')
assert('form payload includes vehicle_type', /vehicle_type:\s*form\.vehicle_type/.test(form), true)
assert('Tricycle option present', contains(form, 'Tricycle'), true)
assert('Motorcycle option present', contains(form, 'Motorcycle'), true)
assert('Umbak option present', contains(form, 'Umbak'), true)
assert('Vehicle Type is required', /\brequiredFields\b[\s\S]*\bvehicle_type\b/.test(form), true)

console.log('--- Admin application detail ---')
assert('Admin detail renders vehicle_type', /\bvehicle_type\b/.test(admin) && contains(admin, "'Not provided'"), true)

console.log('--- Mobile nav ---')
assert('mobile nav has no Admin item', /\bhref="\/admin"\b/.test(header) && /mobile-nav-item[\s\S]*href="\/admin"/.test(header), false)

if (failures === 0) {
  console.log('\nAll vehicle-type assertions passed')
} else {
  console.error(`\n${failures} vehicle-type assertion(s) failed`)
  process.exit(1)
}