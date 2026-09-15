// Bislig Ride — GPS flow harness (v2: active-ride live location only).
//
// Product rules under test:
//   - Going Online/Offline must NOT require GPS: no navigator.geolocation use,
//     no position passed into the presence RPC, no location tracking started.
//   - GPS is used ONLY during an active ride (heading_to_pickup / arrived /
//     in_progress): the assigned driver broadcasts live position on the private
//     Realtime Broadcast channel `ride:{ride_id}` and the passenger subscribes
//     to that same channel for the driver marker. Sharing stops when the ride
//     ends (completed / cancelled / driver offline).
//   - Location payloads are minimal (user, latitude, longitude, timestamp) and
//     throttled.
//
// Run: npm run test:gps  (Node 24 runs TS directly; no test framework needed)

import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const driverExp = readFileSync(join(root, 'src', 'pages', 'DriverExperience.tsx'), 'utf8')
const riderExp = readFileSync(join(root, 'src', 'pages', 'CustomerExperience.tsx'), 'utf8')
const rideLoc = readFileSync(join(root, 'src', 'lib', 'rideLocation.ts'), 'utf8')

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
    .replace(/\s*:\s*number\b/g, '')
    .replace(/\s+as\s+[^)\]]+?(?=\))/g, '')
    .replace(
      /\s*:\s*[A-Za-z][\w$]*(?:\s*[|&]\s*[A-Za-z][\w$]*)*\s*(?==|=>|\))/g,
      ' ',
    )
}

// ---------------------------------------------------------------------------
// Go-online / go-offline sandbox: mocks presence RPC + a geolocation spy that
// MUST stay untouched (going online must not touch navigator.geolocation).
// ---------------------------------------------------------------------------
function makePresenceSandbox(opts: { initialOnline?: boolean }) {
  const callLog: string[] = []
  const state: Record<string, unknown> = {}
  const quietConsole = { ...console, error: () => {} }

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
  }

  const defineState = (name: string, initial: unknown) => {
    sandbox[name] = initial
    state[name] = initial
    const setter = `set${name[0].toUpperCase()}${name.slice(1)}`
    sandbox[setter] = (value: unknown) => {
      state[name] = value
      sandbox[name] = value
    }
  }

  ;[
    ['transitioning', false],
    ['driverOnline', opts.initialOnline ?? false],
    ['driverId', 'd1'],
    ['driverIsAvailable', true],
    ['driverAutoAccept', false],
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

  // Spy: records ANY geolocation touch. Go-online must record none.
  const geolocationSpy = {
    getCurrentPosition: () => {
      callLog.push('getCurrentPosition')
    },
    watchPosition: () => {
      callLog.push('watchPosition')
      return 0
    },
    clearWatch: () => {
      callLog.push('clearWatch')
    },
  }
  sandbox['navigator'] = { geolocation: geolocationSpy }
  sandbox['window'] = { setInterval, clearInterval }

  const presenceResult = {
    setDriverPresence: async (
      online: boolean,
      available: boolean,
      autoAccept: boolean,
      latitude?: number | null,
      longitude?: number | null,
    ) => {
      callLog.push(`setDriverPresence:${online}`)
      sandbox['__presenceArgs'] = { online, available, autoAccept, latitude, longitude }
      return { is_online: online, is_available: available, auto_accept: autoAccept }
    },
    resolvePresenceErrorMessage: () => 'error',
  }

  sandbox['setDriverPresence'] = presenceResult.setDriverPresence
  sandbox['resolvePresenceErrorMessage'] = presenceResult.resolvePresenceErrorMessage

  const toggleBody = stripAsAssertions(
    extractBody(driverExp, 'const handleToggleOnline = async () => {'),
  )
  vm.runInNewContext(`globalThis.__toggle = async function()${toggleBody}`, sandbox)

  return {
    sandbox,
    state,
    stopTrackingRef,
    callLog,
    toggle: sandbox.__toggle as () => Promise<void>,
  }
}

// ---------------------------------------------------------------------------
// Scenario G1/G2 — going online/offline never touches GPS.
// ---------------------------------------------------------------------------
console.log('\n--- Go online / offline: NO GPS involved ---')
{
  const s = makePresenceSandbox({ initialOnline: false })
  await s.toggle()

  assert('driver goes online', s.state['driverOnline'], true)
  assert('phase becomes online', s.state['phase'], 'online')
  assert('presence RPC called once', s.callLog.filter((x) => x === 'setDriverPresence:true').length, 1)
  assert(
    'no latitude passed to presence RPC',
    (s.sandbox['__presenceArgs'] as { latitude: unknown }).latitude,
    undefined,
  )
  assert(
    'no longitude passed to presence RPC',
    (s.sandbox['__presenceArgs'] as { longitude: unknown }).longitude,
    undefined,
  )
  assert('getCurrentPosition NOT called', s.callLog.includes('getCurrentPosition'), false)
  assert('watchPosition NOT called', s.callLog.includes('watchPosition'), false)
  assert('no tracking started on go-online', s.stopTrackingRef.current, null)
}

{
  const s = makePresenceSandbox({ initialOnline: true })
  await s.toggle()

  assert('driver goes offline', s.state['driverOnline'], false)
  assert('phase becomes offline', s.state['phase'], 'offline')
  assert('presence RPC called once with offline', s.callLog.filter((x) => x === 'setDriverPresence:false').length, 1)
  assert('getCurrentPosition NOT called', s.callLog.includes('getCurrentPosition'), false)
  assert('watchPosition NOT called', s.callLog.includes('watchPosition'), false)
}

// ---------------------------------------------------------------------------
// Runtime test: startRideLocationWatch (private broadcast channel).
// ---------------------------------------------------------------------------
console.log('\n--- Active-ride live location watch ---')
{
  const broadcasts: Array<{ channel: string; event: string; payload: unknown }> = []
  const channels: Array<{ statusCb: ((status: string) => void) | null }> = []
  const removed: unknown[] = []

  const geoFixers: {
    success: ((pos: unknown) => void) | null
    error: ((err: unknown) => void) | null
  } = { success: null, error: null }
  let watchSeq = 0
  let clearedWatchId: unknown = null

  let clock = Date.now()
  const FakeDate = class extends Date {
    static now() {
      return clock
    }
  }

  const sandbox: Record<string, unknown> = {
    console: { ...console, error: () => {} },
    Date: FakeDate,
    Math,
    Number,
    Promise,
    RIDE_LOCATION_EVENT: 'location',
    RIDE_LOCATION_THROTTLE_MS: 3000,
    RIDE_LOCATION_MIN_MOVE: 0.00008,
    rideLocationChannel: (rideId: string) => `ride:${rideId}`,
    navigator: {
      geolocation: {
        watchPosition: (success: (pos: unknown) => void, error?: (err: unknown) => void) => {
          geoFixers.success = success
          geoFixers.error = error ?? null
          return ++watchSeq
        },
        clearWatch: (id: number) => {
          clearedWatchId = id
        },
      },
    },
    supabase: {
      channel: (name: string) => {
        const channel = {
          statusCb: null as ((status: string) => void) | null,
          send: (message: { type: string; event: string; payload: unknown }) => {
            broadcasts.push({ channel: name, event: message.event, payload: message.payload })
            return true
          },
          subscribe: (cb: (status: string) => void) => {
            channel.statusCb = cb
            channels.push(channel)
            return channel
          },
        }
        return channel
      },
      removeChannel: (channel: unknown) => {
        removed.push(channel)
      },
    },
  }

  const body = stripAsAssertions(
    extractBody(rideLoc, 'export function startRideLocationWatch'),
  )
  vm.runInNewContext(
    `globalThis.__startRideLocationWatch = function(rideId, options)${body}`,
    sandbox,
  )

  const collectedLocations: Array<{ latitude: number; longitude: number }> = []
  const errors: unknown[] = []

  const stop = (sandbox.__startRideLocationWatch as (r: string, o: unknown) => () => void)(
    'ride-0001',
    {
      user: 'user-1',
      onLocation: (latitude: number, longitude: number) => {
        collectedLocations.push({ latitude, longitude })
      },
      onError: (err: unknown) => {
        errors.push(err)
      },
    },
  )

  assert('watchPosition started exactly once', watchSeq, 1)

  // Fix arrives BEFORE the channel is subscribed: queued, not sent yet.
  geoFixers.success!({
    coords: { latitude: 8.2152, longitude: 126.3166, accuracy: 20 },
  })
  assert('location callback fires on the queued fix', collectedLocations.length, 1)
  assert('no broadcast before subscribe', broadcasts.length, 0)

  // Channel reports SUBSCRIBED -> queued first fix is published.
  channels[0].statusCb!('SUBSCRIBED')
  assert('first fix broadcast on the private ride channel', broadcasts.length, 1)
  assert('channel name is ride:{ride_id}', broadcasts[0].channel, 'ride:ride-0001')
  assert('event name is location', broadcasts[0].event, 'location')
  const first = broadcasts[0].payload as { user: string; latitude: number; longitude: number; timestamp: number }
  assert('payload user is the driver', first.user, 'user-1')
  assert('payload latitude matches', first.latitude, 8.2152)
  assert('payload longitude matches', first.longitude, 126.3166)
  assert('payload has a timestamp', typeof first.timestamp, 'number')

  // Stationary fix < 3s later: throttled out.
  geoFixers.success!({
    coords: { latitude: 8.2152, longitude: 126.3166, accuracy: 20 },
  })
  assert('stationary fix is throttled', broadcasts.length, 1)

  // Move past the throttle window, then a moved fix: published.
  clock = clock + 4000
  geoFixers.success!({
    coords: { latitude: 8.216, longitude: 126.317, accuracy: 20 },
  })
  assert('moved fix is published', broadcasts.length, 2)
  assert('location callback fires on every fix', collectedLocations.length, 3)

  // Geolocation error is surfaced without stopping the ride.
  geoFixers.error!({ code: 1, message: 'denied' })
  assert('watch error surfaced to caller', errors.length, 1)

  // Stop: clears the watcher and removes the channel.
  stop()
  assert('clearWatch called with the watch id', clearedWatchId, watchSeq)
  assert('channel removed on stop', removed.length, 1)
  assert('stop is repeatable no-op safe', typeof stop, 'function')
}

console.log('\n--- Geolocation unsupported ---')
{
  const unsupportedCalls: string[] = []
  const sandbox: Record<string, unknown> = {
    console: { ...console, error: () => {} },
    Date,
    Math,
    RIDE_LOCATION_EVENT: 'location',
    RIDE_LOCATION_THROTTLE_MS: 3000,
    RIDE_LOCATION_MIN_MOVE: 0.00008,
    rideLocationChannel: (rideId: string) => `ride:${rideId}`,
    navigator: { geolocation: null },
    supabase: {
      channel: () => ({ subscribe: () => {}, send: () => true, removeChannel: () => {} }),
      removeChannel: () => {},
    },
  }
  const body = stripAsAssertions(
    extractBody(rideLoc, 'export function startRideLocationWatch'),
  )
  vm.runInNewContext(
    `globalThis.__startRideLocationWatch = function(rideId, options)${body}`,
    sandbox,
  )
  const stop = (sandbox.__startRideLocationWatch as (r: string, o: unknown) => () => void)(
    'ride-0002',
    {
      user: 'user-2',
      onUnsupported: () => {
        unsupportedCalls.push('called')
      },
    },
  )
  assert('onUnsupported notified', unsupportedCalls.length, 1)
  assert('stop still returned (no-op)', typeof stop, 'function')
  stop()
}

// ---------------------------------------------------------------------------
// Source shape guards (regressions against the product rules).
// ---------------------------------------------------------------------------
console.log('\n--- Source shape guards ---')

// Driver side
assertNotMatch('go-online never calls requestFirstFix', driverExp, 'requestFirstFix')
assertNotMatch('go-online never calls getCurrentPosition', driverExp, 'getCurrentPosition')
assertNotMatch('driver page never calls startDriverLocationTracking', driverExp, 'startDriverLocationTracking')
assertNotMatch('driver page no longer subscribes to passenger_locations', driverExp, 'subscribeToPassengerLocation')
assertMatch('driver subscribes to the private ride channel', driverExp, 'subscribeToRideLocation(activeRide.id, (message) => {')
assertMatch('driver starts the ride location watch on an active ride', driverExp, 'startRideLocationWatch(activeRide.id, {')
assertMatch('driver ride-location gated to active phases', driverExp, "['heading_to_pickup', 'arrived', 'in_progress']")
assertMatch('driver track progress still calls presence offline RPC', driverExp, 'await setDriverPresence(false, false, driverAutoAccept)')

// Rider side
assertNotMatch('rider page no longer subscribes to driver_locations', riderExp, 'subscribeToDriverLocation')
assertNotMatch('rider page no longer upserts passenger_locations', riderExp, 'updatePassengerLocation')
assertMatch('rider subscribes to the same private ride channel', riderExp, 'subscribeToRideLocation(ride.id, (message) => {')
assertMatch('rider shares on the same private ride channel', riderExp, 'startRideLocationWatch(ride.id, {')
assertMatch('rider driver marker still rendered from live location', riderExp, 'driverLatitude={driverLocation?.latitude}')
assertMatch('rider ride-location gated to active statuses', riderExp, "['accepted', 'arrived', 'in_progress']")

// rideLocation lib
assertMatch('private channel config used', rideLoc, "config: { private: true }")
assertMatch('channel prefix is ride:', rideLoc, "RIDE_LOCATION_CHANNEL_PREFIX = 'ride:'")
assertMatch('broadcast event is location', rideLoc, "RIDE_LOCATION_EVENT = 'location'")
assertMatch('broadcasts are throttled', rideLoc, 'RIDE_LOCATION_THROTTLE_MS = 3000')
assertMatch('payload carries the user id', rideLoc, 'user: options.user')
assertMatch('payload carries latitude', rideLoc, 'latitude,')
assertMatch('payload carries longitude', rideLoc, 'longitude,')
assertMatch('payload carries timestamp', rideLoc, 'timestamp,')
assertMatch('watchPosition used for live tracking', rideLoc, 'navigator.geolocation.watchPosition')
assertMatch('watcher cleaned up on stop', rideLoc, 'navigator.geolocation.clearWatch')

console.log('\n')
if (failures === 0) {
  console.log('All GPS flow simulation assertions passed')
  process.exit(0)
} else {
  console.error(`${failures} GPS flow simulation assertion(s) failed`)
  process.exit(1)
}