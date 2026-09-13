// Bislig Ride — Driver go-online flow simulation harness.
// Extracts the REAL production functions from the source files and drives them
// with a mocked navigator.geolocation + mocked Supabase client, so the GPS gate
// (a driver must have a GPS fix BEFORE presence can be set online) is verified
// without a device or a live database.
//
// Run: npm run test:gps  (Node 24 runs TS directly; no test framework needed)

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const driverExp = readFileSync(join(root, 'src', 'pages', 'DriverExperience.tsx'), 'utf8')
const driverPresence = readFileSync(join(root, 'src', 'lib', 'driverPresence.ts'), 'utf8')
const presenceSql = readFileSync(join(root, 'supabase', 'dispatch_set_driver_presence.sql'), 'utf8')

let failures = 0

const assert = (label: string, actual: unknown, expected: unknown) => {
  const ok = actual === expected
  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL   ${label}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`)
  }
}

const assertMatch = (label: string, haystack: string, needle: string) => {
  const ok = haystack.includes(needle)
  if (ok) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    const preview = haystack.length > 160 ? `${haystack.slice(0, 160)}...` : haystack
    console.log(`FAIL   ${label}: expected to contain ${JSON.stringify(needle)} got ${JSON.stringify(preview)}`)
  }
}

const assertNotMatch = (label: string, haystack: string, needle: string) => {
  const contains = haystack.includes(needle)
  if (!contains) {
    console.log(`PASS   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL   ${label}: expected NOT to contain ${JSON.stringify(needle)}`)
  }
}

// ---------------------------------------------------------------------------
// Extract a top-level (const x = async () => {...}) body by brace matching.
// ---------------------------------------------------------------------------
function extractBody(text: string, marker: string): string {
  const startIdx = text.indexOf(marker)
  if (startIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  let openBrace = -1
  let parenDepth = 0
  let scanString: string | null = null
  let escaped = false

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i]
    if (scanString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === scanString) {
        scanString = null
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      scanString = ch
      continue
    }
    if (ch === '(') {
      parenDepth += 1
      continue
    }
    if (ch === ')') {
      parenDepth -= 1
      continue
    }
    if (ch === '{' && parenDepth === 0) {
      openBrace = i
      break
    }
  }

  if (openBrace === -1) {
    throw new Error(`no function body brace found for marker: ${marker}`)
  }
  let depth = 0
  let inString: string | null = null
  escaped = false

  for (let i = openBrace; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === '\\') {
        escaped = true
        continue
      }
      if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      inString = ch
      continue
    }
    if (ch === '{') {
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(openBrace, i + 1)
      }
    }
  }
  throw new Error(`unbalanced braces for marker: ${marker}`)
}

function stripAsAssertions(code: string): string {
  return code
    .replace(/\s+as\s+[^)\]]+?(?=\))/g, '')
    .replace(
      /\s*:\s*[A-Za-z][\w$]*(?:\s*[|&]\s*[A-Za-z][\w$]*)*\s*(?==|=>|\))/g,
      ' ',
    )
}

// ---------------------------------------------------------------------------
// Sandbox factory: mocks the browser + supabase + react-state pieces.
// ---------------------------------------------------------------------------
type GeoMode = 'success' | 'denied' | 'unavailable' | 'timeout' | 'none'

function makeSandbox(opts: {
  geoMode: GeoMode
  fix: { latitude: number; longitude: number }
  presenceResult?: 'ok' | 'rpcerror' | 'nofix'
  initialOnline?: boolean
}) {
  const callLog: string[] = []
  const calls: Record<string, number> = {}
  const state: Record<string, unknown> = {}
  const activeWatches = new Set<number>()
  let watchSeq = 0

  const quietConsole = { ...console, error: (..._a: unknown[]) => {} }

  const sandbox: Record<string, unknown> = {
    console: quietConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    Promise,
    JSON,
    Number,
    Object,
    Error,
    HEARTBEAT_INTERVAL_MS: 20_000,
    FRESH_WINDOW_MS: 45_000,
    STALE_WINDOW_MS: 120_000,
  }

  // --- react-style state: driverOnline etc. live in the sandbox; setters
  // --- update both the value (same-render semantics) and the state record.
  const defineState = (name: string, initial: unknown) => {
    sandbox[name] = initial
    state[name] = initial
    const setterName = `set${name[0].toUpperCase()}${name.slice(1)}`
    const setter = (value: unknown) => {
      calls[setterName] = (calls[setterName] ?? 0) + 1
      state[name] = value
      sandbox[name] = value
    }
    sandbox[setterName] = setter
  }

  ;[
    ['transitioning', false],
    ['driverOnline', opts.initialOnline ?? false],
    ['driverId', '6b239660-14ae-4fea-82c0-905420260077'],
    ['driverIsAvailable', true],
    ['driverAutoAccept', false],
    ['driverLocation', null],
    ['lastLocationFixIso', null],
    ['presenceError', ''],
    ['request', null],
    ['pendingOffer', null],
    ['activeRide', null],
    ['phase', opts.initialOnline ? 'online' : 'offline'],
    ['completedRideIdRef', { current: null }],
    ['lastActiveRideIdRef', { current: null }],
  ].forEach(([name, initial]) => defineState(String(name), initial))

  const stopTrackingRef = { current: null as (() => void) | null }
  sandbox['stopTrackingRef'] = stopTrackingRef

  // --- navigator.geolocation mock ---
  const geolocationMock = {
    getCurrentPosition: (
      success: (pos: unknown) => void,
      error?: (err: unknown) => void,
    ) => {
      calls['getCurrentPosition'] = (calls['getCurrentPosition'] ?? 0) + 1
      callLog.push('getCurrentPosition')
      if (opts.geoMode === 'success') {
        success({
          coords: {
            latitude: opts.fix.latitude,
            longitude: opts.fix.longitude,
            accuracy: 20,
          },
        })
      } else if (opts.geoMode === 'none') {
        // no response: never resolves/rejects
      } else {
        const code =
          opts.geoMode === 'denied' ? 1 : opts.geoMode === 'unavailable' ? 2 : 3
        ;(error as (e: unknown) => void)({
          code,
          message: `Geolocation error ${code}`,
        })
      }
    },
    watchPosition: (
      success: (pos: unknown) => void,
      _error?: unknown,
    ) => {
      calls['watchPosition'] = (calls['watchPosition'] ?? 0) + 1
      callLog.push('watchPosition')
      const id = ++watchSeq
      activeWatches.add(id)
      success({
        coords: {
          latitude: opts.fix.latitude,
          longitude: opts.fix.longitude,
          accuracy: 20,
        },
      })
      return id
    },
    clearWatch: (id: number) => {
      calls['clearWatch'] = (calls['clearWatch'] ?? 0) + 1
      activeWatches.delete(id)
    },
  }

  sandbox['navigator'] = { geolocation: geolocationMock }
  sandbox['window'] = { setInterval, clearInterval }

  if (opts.initialOnline) {
    const id = ++watchSeq
    activeWatches.add(id)
    stopTrackingRef.current = () => geolocationMock.clearWatch(id)
  }

  // --- Supabase mocks ---
  sandbox['updateDriverLocation'] = async (driverId: string, latitude: number, longitude: number) => {
    calls['updateDriverLocation'] = (calls['updateDriverLocation'] ?? 0) + 1
    callLog.push('updateDriverLocation')
    state['driverLocation'] = { latitude, longitude }
    return { driver_id: driverId, latitude, longitude, updated_at: new Date().toISOString() }
  }

  // Mirrors dispatch_set_driver_presence.sql semantics: going online requires
  // a position. The client passes the first GPS fix inline, so presence and the
  // position write happen in the SAME RPC (atomic go-online).
  sandbox['setDriverPresence'] = async (
    online: boolean,
    available: boolean,
    autoAccept: boolean,
    latitude?: number | null,
    longitude?: number | null,
  ) => {
    calls['setDriverPresence'] = (calls['setDriverPresence'] ?? 0) + 1
    callLog.push('setDriverPresence')

    if (online) {
      if (opts.presenceResult === 'rpcerror') {
        const err = new Error(
          'Only an ACTIVE driver with a shared location can set presence.',
        ) as Error & { code: string }
        err.code = '42501'
        throw err
      }
      if (
        !(typeof latitude === 'number' && typeof longitude === 'number') ||
        opts.presenceResult === 'nofix'
      ) {
        const err = new Error(
          'A driver position is required before going online.',
        ) as Error & { code: string }
        err.code = '42501'
        throw err
      }
      state['driverLocation'] = { latitude, longitude }
    }

    return {
      driver_id: 'd',
      is_online: online,
      is_available: available,
      auto_accept: autoAccept,
    }
  }

  // --- compile REAL extracted functions into the SAME sandbox ---
  const hasGeoBody = stripAsAssertions(extractBody(driverPresence, 'export function hasGeolocation'))
  const reqFixBody = stripAsAssertions(extractBody(driverPresence, 'export function requestFirstFix'))
  const startTrackingBody = stripAsAssertions(
    extractBody(driverPresence, 'export function startDriverLocationTracking'),
  )
  const statusBody = stripAsAssertions(
    extractBody(driverPresence, 'export function driverLocationStatus'),
  )
  const resolveErrBody = stripAsAssertions(
    extractBody(
      driverExp,
      'const resolvePresenceErrorMessage = (error: unknown, offline: boolean): string => {',
    ),
  )

  vm.runInNewContext(`globalThis.__hasGeolocation = function()${hasGeoBody}`, sandbox)
  vm.runInNewContext(`globalThis.__requestFirstFix = function(timeoutMs = 15000)${reqFixBody}`, sandbox)
  vm.runInNewContext(`globalThis.__startTracking = function(driverId, callbacks)${startTrackingBody}`, sandbox)
  vm.runInNewContext(`globalThis.__driverLocationStatus = function()${statusBody}`, sandbox)
  vm.runInNewContext(
    `globalThis.__resolvePresenceErrorMessage = function(error, offline)${resolveErrBody}`,
    sandbox,
  )

  const hasGeolocation = (): boolean =>
    (sandbox.__hasGeolocation as () => boolean)()
  const requestFirstFix = (t?: number) =>
    (sandbox.__requestFirstFix as (t?: number) => Promise<unknown>)(t)
  const startTracking = (driverId: string, cb: unknown) =>
    (sandbox.__startTracking as (d: string, c: unknown) => () => void)(driverId, cb)

  sandbox['hasGeolocation'] = hasGeolocation
  sandbox['requestFirstFix'] = requestFirstFix
  sandbox['startDriverLocationTracking'] = startTracking
  sandbox['resolvePresenceErrorMessage'] = (error: unknown, offline: boolean): string =>
    (sandbox.__resolvePresenceErrorMessage as (e: unknown, off: boolean) => string)(error, offline)

  return { sandbox, calls, state, activeWatches, stopTrackingRef, callLog, setValue: state }
}

function buildToggle(sandbox: Record<string, unknown>) {
  const body = stripAsAssertions(
    extractBody(driverExp, 'const handleToggleOnline = async () => {'),
  )
  vm.runInNewContext(`globalThis.__toggle = async function()${body}`, sandbox)
  return sandbox.__toggle as () => Promise<void>
}

async function runToggle(opts: Parameters<typeof makeSandbox>[0]) {
  const { sandbox, calls, state, activeWatches, stopTrackingRef, callLog } = makeSandbox(opts)
  const toggle = buildToggle(sandbox)
  await toggle()
  return { sandbox, calls, state, activeWatches, stopTrackingRef, callLog }
}

type ToggleResult = Awaited<ReturnType<typeof runToggle>>

const defaultFix = { latitude: 8.2152, longitude: 126.3166 }

// ---------------------------------------------------------------------------
// Scenario A — GPS succeeds: atomic go-online in one RPC.
// ---------------------------------------------------------------------------
console.log('\n--- Scenario A: GPS success, atomic go-online ---')
{
  const { state, calls, stopTrackingRef, callLog } = await runToggle({
    geoMode: 'success',
    fix: defaultFix,
  })

  assert('driver goes online (setDriverOnline(true))', state['driverOnline'], true)
  assert('phase becomes online', state['phase'], 'online')
  assert('presence RPC called exactly once', calls['setDriverPresence'] ?? 0, 1)
  assert(
    'the first GPS fix is passed INTO the presence RPC (position + presence in one call)',
    callLog.filter((step) => step === 'setDriverPresence').length,
    1,
  )
  assert(
    'atomic ordering: getCurrentPosition -> setDriverPresence -> watchPosition -> updateDriverLocation',
    JSON.stringify(callLog),
    JSON.stringify(['getCurrentPosition', 'setDriverPresence', 'watchPosition', 'updateDriverLocation']),
  )
  assert('presenceError cleared', state['presenceError'] ?? '', '')
  assert(
    'latitude recorded from the first fix',
    (state['driverLocation'] as { latitude: number } | null)?.latitude ?? 0,
    8.2152,
  )
  assert(
    'tracking started once (watchPosition called once)',
    calls['watchPosition'] ?? 0,
    1,
  )
  assert(
    'tracking stop function stored in stopTrackingRef.current',
    typeof stopTrackingRef.current,
    'function',
  )
}

// ---------------------------------------------------------------------------
// Scenario B — GPS permission denied (code 1).
// ---------------------------------------------------------------------------
console.log('\n--- Scenario B: GPS permission denied ---')
{
  const { state, calls, stopTrackingRef } = await runToggle({
    geoMode: 'denied',
    fix: defaultFix,
  })

  assert('driver stays offline', state['driverOnline'], false)
  assertMatch('GPS denied error surfaced', String(state['presenceError'] ?? ''), 'Location permission was denied')
  assert('no location published', calls['updateDriverLocation'] ?? 0, 0)
  assert('presence RPC not called', calls['setDriverPresence'] ?? 0, 0)
  assert('no tracking started', calls['watchPosition'] ?? 0, 0)
  assert('stop function not set', stopTrackingRef.current, null)
}

// ---------------------------------------------------------------------------
// Scenario C — GPS unavailable (code 2).
// ---------------------------------------------------------------------------
console.log('\n--- Scenario C: GPS unavailable ---')
{
  const { state, calls, stopTrackingRef } = await runToggle({
    geoMode: 'unavailable',
    fix: defaultFix,
  })

  assert('driver stays offline', state['driverOnline'], false)
  assertMatch('GPS unavailable error surfaced', String(state['presenceError'] ?? ''), 'could not be determined')
  assert('presence RPC not called', calls['setDriverPresence'] ?? 0, 0)
  assert('no track started', calls['watchPosition'] ?? 0, 0)
  assert('stop function not set', stopTrackingRef.current, null)
}

// ---------------------------------------------------------------------------
// Scenario D — GPS timeout (code 3).
// ---------------------------------------------------------------------------
console.log('\n--- Scenario D: GPS timeout ---')
{
  const { state, calls, stopTrackingRef } = await runToggle({
    geoMode: 'timeout',
    fix: defaultFix,
  })

  assert('driver stays offline', state['driverOnline'], false)
  assertMatch('GPS timeout error surfaced', String(state['presenceError'] ?? ''), 'timed out')
  assert('presence RPC not called', calls['setDriverPresence'] ?? 0, 0)
  assert('no track started', calls['watchPosition'] ?? 0, 0)
  assert('stop function not set', stopTrackingRef.current, null)
}

// ---------------------------------------------------------------------------
// Scenario E — GPS succeeds but the presence RPC rejects (driver not active).
// ---------------------------------------------------------------------------
console.log('\n--- Scenario E: GPS success, presence RPC rejects (inactive driver) ---')
{
  const { state, calls, stopTrackingRef } = await runToggle({
    geoMode: 'success',
    fix: defaultFix,
    presenceResult: 'rpcerror',
  })

  assert('driver stays offline', state['driverOnline'], false)
  assertMatch(
    'presence RPC error surfaced',
    String(state['presenceError'] ?? ''),
    'Only an ACTIVE driver with a shared location can set presence.',
  )
  assert('no tracking started', calls['watchPosition'] ?? 0, 0)
  assert('stop function not set', stopTrackingRef.current, null)
}

// ---------------------------------------------------------------------------
// Scenario E2 — the RPC refuses to go online without a recorded position.
// ---------------------------------------------------------------------------
console.log('\n--- Scenario E2: presence RPC requires a position ---')
{
  const { state, stopTrackingRef } = await runToggle({
    geoMode: 'success',
    fix: defaultFix,
    presenceResult: 'nofix',
  })

  assert('driver stays offline', state['driverOnline'], false)
  assertMatch(
    'position-required error surfaced',
    String(state['presenceError'] ?? ''),
    'A driver position is required before going online.',
  )
  assert('stop function not set', stopTrackingRef.current, null)
}

// ---------------------------------------------------------------------------
// Scenario F — tracking starts exactly once.
// ---------------------------------------------------------------------------
console.log('\n--- Scenario F: tracking starts exactly once on success ---')
{
  const { calls, stopTrackingRef, activeWatches } = await runToggle({
    geoMode: 'success',
    fix: defaultFix,
  })

  assert('watchPosition invoked exactly once', calls['watchPosition'] ?? 0, 1)
  assert('exactly one active watcher', activeWatches.size, 1)
  assert('stop function stored after success', typeof stopTrackingRef.current, 'function')
}

// ---------------------------------------------------------------------------
// Scenario G — going offline cleans up; no duplicate watcher.
// ---------------------------------------------------------------------------
console.log('\n--- Scenario G: offline cleanup, no duplicate watchers ---')
{
  const online1 = await runToggle({ geoMode: 'success', fix: defaultFix })
  assert('online #1: driver online', online1.state['driverOnline'], true)
  assert('online #1: one active watcher', online1.activeWatches.size, 1)

  const offline = await runToggle({
    geoMode: 'success',
    fix: defaultFix,
    initialOnline: true,
  })
  await offlineStateCheck(offline)

  const online2 = await runToggle({ geoMode: 'success', fix: defaultFix })
  assert('online #2: driver online again', online2.state['driverOnline'], true)
  assert('online #2: one active watcher (no duplicates)', online2.activeWatches.size, 1)
}

async function offlineStateCheck(o: ToggleResult) {
  assert('offline: driver offline', o.state['driverOnline'], false)
  assert('offline: stopTrackingRef.current cleared to null', o.stopTrackingRef.current, null)
  assert('offline: clearWatch invoked', o.calls['clearWatch'] ?? 0, 1)
}

// ---------------------------------------------------------------------------
// Source shape guards (regression: the gate + single-RPC path stay intact)
// ---------------------------------------------------------------------------
console.log('\n--- Source shape guards ---')
assertMatch('GPS gate: requestFirstFix on go-online', driverExp, 'const fix = await requestFirstFix()')
assertMatch(
  'atomic go-online passes the fix into the presence RPC',
  driverExp,
  'await setDriverPresence(true, driverIsAvailable, driverAutoAccept, fix.latitude, fix.longitude)',
)
assertNotMatch(
  'no separate updateDriverLocation on the go-online critical path',
  driverExp,
  'updateDriverLocation(driverId, fix.latitude, fix.longitude)',
)
assertMatch('location tracking starts after presence', driverExp, 'startDriverLocationTracking(driverId, {')
assertMatch('tracking is stopped on go-offline', driverExp, 'stopTrackingRef.current?.()')
assertMatch('go-offline still calls the presence RPC', driverExp, 'await setDriverPresence(false, false, driverAutoAccept)')

// SQL guards: the RPC must accept the inline position and require it online.
assertMatch(
  'SQL accepts optional p_latitude',
  presenceSql,
  'p_latitude double precision default null',
)
assertMatch(
  'SQL accepts optional p_longitude',
  presenceSql,
  'p_longitude double precision default null',
)
assertMatch(
  'SQL writes the position into driver_locations when going online with a fix',
  presenceSql,
  'insert into public.driver_locations (driver_id, latitude, longitude)',
)
assertMatch(
  'SQL rejects go-online without a recorded position',
  presenceSql,
  'A driver position is required before going online.',
)
assertMatch(
  'SQL still requires an ACTIVE driver',
  presenceSql,
  'Only an ACTIVE driver with a shared location can set presence.',
)

console.log('\n')
if (failures === 0) {
  console.log('All GPS flow simulation assertions passed')
  process.exit(0)
} else {
  console.error(`${failures} GPS flow simulation assertion(s) failed`)
  process.exit(1)
}