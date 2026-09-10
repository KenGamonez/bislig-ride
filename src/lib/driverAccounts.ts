export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_RULES = {
  minLength: PASSWORD_MIN_LENGTH,
  requiresLetter: true,
  requiresNumber: true,
} as const

export const PASSWORD_HELP_TEXT = `At least ${PASSWORD_MIN_LENGTH} characters with a letter and a number.`

export function isValidEmailLike(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.includes('@') && trimmed.length > 3
}

export function normalizeUsername(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')

  if (!normalized) {
    return ''
  }

  return normalized.slice(0, 32).replace(/\.+$/g, '')
}

export function suggestUsername(fullName: string): string {
  const suggested = normalizeUsername(fullName)

  if (suggested) {
    return suggested
  }

  return 'driver'
}

export function validatePasswordStrength(value: string): { ok: boolean; problems: string[] } {
  const problems: string[] = []

  if (value.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`)
  }

  if (!/[A-Za-z]/.test(value)) {
    problems.push('Password must include at least one letter.')
  }

  if (!/[0-9]/.test(value)) {
    problems.push('Password must include at least one number.')
  }

  return {
    ok: problems.length === 0,
    problems,
  }
}

const GENERATED_PASSWORD_LENGTH = 14

function randomFromPool(pool: string, count: number): string {
  const values = new Uint32Array(count)
  crypto.getRandomValues(values)
  const output: string[] = []

  for (const value of values) {
    output.push(pool[value % pool.length])
  }

  return output.join('')
}

export function generateTemporaryPassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#%&()_+'

  const letterSection = randomFromPool(lower + upper, 6)
  const digitSection = randomFromPool(digits, 4)
  const symbolSection = randomFromPool(symbols, 2)

  const withMixedSymbols = letterSection + digitSection + symbolSection
  const remaining = GENERATED_PASSWORD_LENGTH - withMixedSymbols.length
  const filler = randomFromPool(lower + digits, Math.max(remaining, 0))

  return withMixedSymbols + filler
}