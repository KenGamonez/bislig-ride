import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function getCustomerAuthId(): Promise<string> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError) {
    throw sessionError
  }

  if (sessionData.session?.user.id) {
    return sessionData.session.user.id
  }

  const { data, error } = await supabase.auth.signInAnonymously()

  if (error || !data.user) {
    throw error ?? new Error('Unable to establish a Rider session.')
  }

  return data.user.id
}
