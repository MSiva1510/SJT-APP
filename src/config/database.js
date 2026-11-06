import { isSupabaseConfigured } from '../lib/supabase'

const DATABASE_CONFIG = {
  provider: 'supabase',
  debug: import.meta.env.VITE_DATABASE_DEBUG === 'true',
}

export const DATABASE_PROVIDERS = {
  SUPABASE: 'supabase',
  LOCAL: 'localStorage',
}

export function getDatabaseProvider() {
  return isSupabaseConfigured() ? DATABASE_PROVIDERS.SUPABASE : DATABASE_PROVIDERS.LOCAL
}

export function setDatabaseProvider(provider) {
  if (provider !== DATABASE_PROVIDERS.SUPABASE) {
    throw new Error('Only Supabase provider is supported')
  }
}

export function isLocalStorage() {
  return !isSupabaseConfigured()
}

export function isSupabaseProvider() {
  return isSupabaseConfigured()
}

export function getDatabaseConfig() {
  return {
    provider: DATABASE_PROVIDERS.SUPABASE,
    isLocalStorage: false,
    isSupabase: true,
    isSupabaseConfigured: isSupabaseConfigured(),
    debug: DATABASE_CONFIG.debug,
  }
}

export function initializeDatabase() {
  const config = getDatabaseConfig()
  if (DATABASE_CONFIG.debug) {
    console.log('Database initialized', config)
  }
  return config
}

export default DATABASE_CONFIG
