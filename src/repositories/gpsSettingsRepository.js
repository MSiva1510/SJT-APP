// ─── GPS Settings Repository ──────────────────────────────────
//
// Stores GPS provider configuration in the existing `settings`
// table under category='gps'. Each row is a key/value pair; we
// commit to the Day 31 column convention (`setting_key`,
// `setting_value`) used by adminRepository.
//
// Sensitive keys (api_url, company_id, user_id) are flagged
// is_sensitive=true so future Settings UI can mask them.

import supabase from '../lib/supabase'
import { withTimeout } from '../utils/withTimeout'

export const GPS_SETTINGS_CATEGORY = 'gps'
export const SENSITIVE_KEYS = new Set(['api_url', 'company_id', 'user_id'])

export const GPS_DEFAULT_SETTINGS = {
  provider:           'kingstrack',
  api_url:            'https://mvt.apmkingstrack.com/fleettracking/api/live/json',
  company_id:         '',
  user_id:            '',
  refresh_interval:   60,
  timeout:            30,
  retry_count:        3,
  enabled:            true,
  // Alert settings
  overspeed_limit:    80, // km/h
  idle_time_limit:    30, // minutes
  offline_timeout:    5,  // minutes
  alerts_enabled:     true
}

export const GPS_SETTINGS_DESCRIPTIONS = {
  provider:           'GPS vendor adapter name (kingstrack today, future providers added by config).',
  api_url:            'Vendor endpoint URL (POST JSON).',
  company_id:         'Vendor account id (issued by provider).',
  user_id:            'Vendor user id (issued by provider).',
  refresh_interval:   'Seconds between fleet polls.',
  timeout:            'Per-request timeout in seconds.',
  retry_count:        'Number of retries on a failed poll.',
  enabled:            'Kill switch — when false, polling is suspended.',
  overspeed_limit:    'Speed limit in km/h for overspeed alerts',
  idle_time_limit:    'Minutes of idling before triggering idle alert',
  offline_timeout:    'Minutes of no GPS data before considering vehicle offline',
  alerts_enabled:     'Master switch to enable/disable all alert generation'
}

function _row({ setting_key, setting_value, is_sensitive, description, updated_by }) {
  return {
    setting_key,
    setting_value: typeof setting_value === 'string'
      ? setting_value
      : JSON.stringify(setting_value),
    category:    GPS_SETTINGS_CATEGORY,
    is_sensitive: !!is_sensitive,
    description: description ?? null,
    updated_by:  updated_by ?? null,
  }
}

async function getAll() {
  if (!supabase) return []
  const { data, error } = await withTimeout(
    supabase
      .from('settings')
      .select('setting_key, setting_value, category, is_sensitive, updated_by, updated_at')
      .eq('category', GPS_SETTINGS_CATEGORY),
    8000,
    { data: [], error: null }
  )
  if (error) return []
  return data ?? []
}

async function findExistingRow(key) {
  const { data, error } = await withTimeout(
    supabase
      .from('settings')
      .select('id, setting_key, category')
      .eq('setting_key', key)
      .eq('category', GPS_SETTINGS_CATEGORY)
      .maybeSingle(),
    8000,
    { data: null, error: null }
  )
  if (error) return null
  return data ?? null
}

async function saveRow(row) {
  const existing = await findExistingRow(row.setting_key)
  if (existing?.id) {
    const { error } = await withTimeout(
      supabase
        .from('settings')
        .update(row)
        .eq('id', existing.id),
      8000,
      { error: null }
    )
    return error ? { ok: false, error: error.message } : { ok: true, action: 'updated' }
  }

  const { error } = await withTimeout(
    supabase
      .from('settings')
      .insert([row]),
    8000,
    { error: null }
  )
  return error ? { ok: false, error: error.message } : { ok: true, action: 'inserted' }
}

/** Return the GPS settings as a flat object keyed by setting_key. */
async function getAsObject() {
  const rows = await getAll()
  const out = { ...GPS_DEFAULT_SETTINGS }
  for (const r of rows) {
    if (!r?.setting_key) continue
    try {
      out[r.setting_key] = JSON.parse(r.setting_value)
    } catch {
      out[r.setting_key] = r.setting_value
    }
  }
  return out
}

/** Return the raw rows for diagnostic / debug panels. */
async function getRows() {
  return getAll()
}

/** Upsert a single key. */
async function set(key, value, { updated_by } = {}) {
  if (!supabase) return { ok: false, error: 'no-supabase' }
  if (!key)      return { ok: false, error: 'missing-key' }
  return saveRow(_row({
    setting_key:  key,
    setting_value: value,
    is_sensitive: SENSITIVE_KEYS.has(key),
    description:  GPS_SETTINGS_DESCRIPTIONS[key] ?? null,
    updated_by:   updated_by ?? null,
  }))
}

/** Upsert many keys in one call. */
async function setMany(updates, { updated_by } = {}) {
  if (!supabase) return { ok: false, error: 'no-supabase' }
  const entries = Object.entries(updates ?? {})
  if (!entries.length) return { ok: true, count: 0 }

  const rows = entries.map(([key, value]) => _row({
    setting_key:  key,
    setting_value: value,
    is_sensitive: SENSITIVE_KEYS.has(key),
    description:  GPS_SETTINGS_DESCRIPTIONS[key] ?? null,
    updated_by:   updated_by ?? null,
  }))

  for (const row of rows) {
    const result = await saveRow(row)
    if (!result.ok) return result
  }
  return { ok: true, count: entries.length }
}

/** Test that sensitive credentials parse and api_url is well-formed. */
function validate(settings = {}) {
  const errs = []
  if (!settings.provider) errs.push('provider is required')
  if (settings.provider && settings.provider !== 'kingstrack') {
    errs.push(`provider "${settings.provider}" is not registered`)
  }
  if (settings.api_url && !/^https?:\/\//i.test(settings.api_url)) {
    errs.push('api_url must be http(s)')
  }
  if (settings.refresh_interval && (Number(settings.refresh_interval) < 5 || Number(settings.refresh_interval) > 3600)) {
    errs.push('refresh_interval must be between 5 and 3600 seconds')
  }
  if (settings.timeout && (Number(settings.timeout) < 5 || Number(settings.timeout) > 300)) {
    errs.push('timeout must be between 5 and 300 seconds')
  }
  if (settings.retry_count && (Number(settings.retry_count) < 0 || Number(settings.retry_count) > 10)) {
    errs.push('retry_count must be between 0 and 10')
  }
  if (settings.overspeed_limit && (Number(settings.overspeed_limit) < 0 || Number(settings.overspeed_limit) > 300)) {
    errs.push('overspeed_limit must be between 0 and 300 km/h')
  }
  if (settings.idle_time_limit && (Number(settings.idle_time_limit) < 0 || Number(settings.idle_time_limit) > 240)) {
    errs.push('idle_time_limit must be between 0 and 240 minutes')
  }
  if (settings.offline_timeout && (Number(settings.offline_timeout) < 0 || Number(settings.offline_timeout) > 60)) {
    errs.push('offline_timeout must be between 0 and 60 minutes')
  }
  return errs
}

class GpsSettingsRepository {
  constructor() {
    this.GPS_DEFAULT_SETTINGS = GPS_DEFAULT_SETTINGS
    this.GPS_SETTINGS_CATEGORY = GPS_SETTINGS_CATEGORY
    this.SENSITIVE_KEYS = SENSITIVE_KEYS
  }

  async getAll() { return getAll() }
  async getAsObject() { return getAsObject() }
  async getRows() { return getRows() }
  async set(key, value, options) { return set(key, value, options) }
  async setMany(updates, options) { return setMany(updates, options) }
  validate(settings = {}) { return validate(settings) }
}

export const gpsSettingsRepository = new GpsSettingsRepository()
export { GpsSettingsRepository }
