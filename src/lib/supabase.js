import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase = null

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey)
  } catch (error) {
    console.error('Failed to initialize Supabase:', error)
    supabase = null
  }
}

export function isSupabaseConfigured() {
  return supabase !== null
}

export async function checkSupabaseHealth() {
  if (!supabase) {
    return { healthy: false, error: 'Supabase not configured' }
  }

  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    return { healthy: true }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}

export async function checkDatabaseHealth() {
  if (!supabase) {
    return { healthy: false, error: 'Supabase not configured' }
  }

  try {
    const { data, error } = await supabase.from('users').select('id').limit(1)
    if (error) throw error
    return { healthy: true }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}

export async function checkStorageHealth() {
  if (!supabase) {
    return { healthy: false, error: 'Supabase not configured' }
  }

  try {
    const { data, error } = await supabase.storage.listBuckets()
    if (error) throw error
    return { healthy: true, buckets: data?.length || 0 }
  } catch (error) {
    return { healthy: false, error: error.message }
  }
}

export default supabase