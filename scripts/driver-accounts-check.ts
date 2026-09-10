import {
  generateTemporaryPassword,
  isValidEmailLike,
  normalizeUsername,
  PASSWORD_MIN_LENGTH,
  suggestUsername,
  validatePasswordStrength,
} from '../src/lib/driverAccounts.ts'

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

console.log('--- Username normalization ---')
assert('lowercases full name', normalizeUsername('Juan Ramon Dela Cruz'), 'juan.ramon.dela.cruz')
assert('separators become dots', normalizeUsername('Maria  D.  Santos!!'), 'maria.d.santos')
assert('no leading/trailing dots', normalizeUsername('.John.Smith.'), 'john.smith')
assert('collapses runs to one dot', normalizeUsername('a   b---c'), 'a.b.c')
assert('clamps to 32 chars', normalizeUsername('A Very Long Name That Keeps Going And Going Forever'), 'a.very.long.name.that.keeps.goin')
assert('empty result for symbols only', normalizeUsername('!!! ###'), '')

console.log('--- Username suggestions ---')
assert('suggests from full name', suggestUsername('Juan Ramon Dela Cruz'), 'juan.ramon.dela.cruz')
assert('falls back for empty names', suggestUsername(''), 'driver')
assert('falls back for symbol-only names', suggestUsername('!!!'), 'driver')
assert('suggested value is normalized', suggestUsername('  JOSE  RIZAL  '), 'jose.rizal')

console.log('--- Email detection ---')
assert('email detected', isValidEmailLike('driver@bisligride.com'), true)
assert('not email', isValidEmailLike('juan.dela.cruz'), false)
assert('not email (bare @)', isValidEmailLike('abc@def'), true)

console.log('--- Password rules ---')
assert('too short rejected', validatePasswordStrength('ab1').ok, false)
assert('no letter rejected', validatePasswordStrength('12345678').ok, false)
assert('no number rejected', validatePasswordStrength('abcdefgh').ok, false)
assert('valid accepted', validatePasswordStrength('BisligRide123').ok, true)
assert('minimum length constant', PASSWORD_MIN_LENGTH, 8)

console.log('--- Temporary password generator ---')
const generated = Array.from({ length: 50 }, () => generateTemporaryPassword())
assert('all generated passwords same length', generated.every((value) => value.length === 14), true)
assert('contains a letter', generated.every((value) => /[A-Za-z]/.test(value)), true)
assert('contains a number', generated.every((value) => /[0-9]/.test(value)), true)
assert('contains a symbol', generated.every((value) => /[!@#%&()_+]/.test(value)), true)
assert('passes strength validation', generated.every((value) => validatePasswordStrength(value).ok), true)
assert('no duplicates across 50 draws', new Set(generated).size, 50)

console.log('')
if (failures > 0) {
  console.log(`${failures} assertion(s) FAILED`)
  process.exitCode = 1
} else {
  console.log('All driver account assertions passed')
}