import { createClient } from '@supabase/supabase-js'
import { appSupabasePublishableKey, appSupabaseUrl, supabase } from './supabase'

const DRIVER_LOOKUP_MISS_EMAIL = '__no_driver_match@bisligride.local'

const DRIVER_SIGNUP_STORAGE_KEY = 'bislig-ride-admin-signup'

export function isDriverLookupMiss(email: string | null): boolean {
  return !email || email === DRIVER_LOOKUP_MISS_EMAIL
}

export function isDuplicateSignupError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: string; message?: string; status?: number }
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : ''

  return (
    candidate.code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already been registered')
  )
}

export async function resolveDriverCredentials(identifier: string): Promise<string> {
  const { data, error } = await supabase.rpc('resolve_driver_credentials', {
    p_identifier: identifier.trim(),
  })

  if (error) {
    throw error
  }

  if (typeof data !== 'string' || !data) {
    return DRIVER_LOOKUP_MISS_EMAIL
  }

  return data
}

export async function signInDriverWithIdentifier(
  identifier: string,
  password: string,
): Promise<Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>> {
  const email = await resolveDriverCredentials(identifier)

  if (isDriverLookupMiss(email)) {
    const miss = new Error('Invalid login credentials')
    Object.assign(miss, { __lookupMiss: true })
    throw miss
  }

  return supabase.auth.signInWithPassword({ email, password })
}

export async function sendDriverPasswordReset(identifier: string): Promise<void> {
  const email = await resolveDriverCredentials(identifier)

  if (isDriverLookupMiss(email)) {
    return
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/driver/reset-password`,
  })

  if (error) {
    throw error
  }
}

export async function isDriverUsernameTaken(
  username: string,
  excludeDriverId?: string,
): Promise<boolean> {
  const lookup = username.trim().toLowerCase()

  if (!lookup) {
    return true
  }

  let query = supabase
    .from('drivers')
    .select('id')
    .ilike('username', lookup)

  if (excludeDriverId) {
    query = query.neq('id', excludeDriverId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

export type DriverAuthAccount = {
  authUserId: string
  email: string
  needsEmailConfirmation: boolean
}

export async function createDriverAuthUser(
  email: string,
  password: string,
): Promise<DriverAuthAccount> {
  const isolatedClient = createClient(appSupabaseUrl, appSupabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: DRIVER_SIGNUP_STORAGE_KEY,
    },
  })

  try {
    const { data, error } = await isolatedClient.auth.signUp({ email, password })

    if (error) {
      if (isDuplicateSignupError(error)) {
        const duplicate = new Error(
          'An authentication account already exists for this email address. Choose a different email so the driver gets their own login.',
        )
        Object.assign(duplicate, { __duplicateSignup: true })
        throw duplicate
      }

      throw error
    }

    if (!data.user) {
      throw new Error('Unable to create the driver account. Please try again.')
    }

    const registeredIdentities = data.user.identities ?? []

    if (registeredIdentities.length === 0) {
      const duplicate = new Error(
        'An authentication account already exists for this email address. Choose a different email so the driver gets their own login.',
      )
      Object.assign(duplicate, { __duplicateSignup: true })
      throw duplicate
    }

    return {
      authUserId: data.user.id,
      email: data.user.email ?? email,
      needsEmailConfirmation: !data.session,
    }
  } finally {
    try {
      await isolatedClient.auth.signOut()
    } catch {
      // The isolated client has no persisted session; nothing further to clean up.
    }
  }
}

export async function changeDriverPassword(
  currentPassword: string,
  newPassword: string,
  currentEmail?: string | null,
): Promise<void> {
  let email = currentEmail?.trim() || null

  if (!email) {
    const { data: sessionData } = await supabase.auth.getSession()
    email = sessionData.session?.user?.email ?? null
  }

  if (!email) {
    throw new Error('Unable to determine the account email. Sign out and sign in again.')
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  })

  if (verifyError) {
    throw new Error('Your current password is incorrect.')
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })

  if (updateError) {
    throw updateError
  }
}