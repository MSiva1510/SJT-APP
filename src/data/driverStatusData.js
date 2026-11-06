// ─── Driver Status Data — Supabase driver_status table ────────
// Columns: id, driver_id (UUID FK→drivers), status, current_trip_id,
//          latitude, longitude, last_heartbeat, updated_at

import supabase from '../lib/supabase'

export const DRIVER_STATUS_OFFLINE_MS = 10 * 60 * 1000   // 10 min

export const STATUS_CONFIG = {
  available:         { label: 'Available',         badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  driving:           { label: 'Driving',           badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',         dot: 'bg-amber-500 animate-pulse' },
  passenger_onboard: { label: 'Passenger Onboard', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             dot: 'bg-blue-500 animate-pulse' },
  break:             { label: 'On Break',          badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',     dot: 'bg-violet-500' },
  offline:           { label: 'Offline',           badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',            dot: 'bg-slate-400' },
}

export function getStatusCfg(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG.offline
}

// Fetch all driver statuses (keyed by driver_id)
export async function loadDriverStatuses() {
  if (!supabase) return {}
  const { data } = await supabase
    .from('driver_status')
    .select('driver_id, status, last_heartbeat, latitude, longitude, current_trip_id, updated_at')
  if (!data) return {}
  return Object.fromEntries(data.map(d => [d.driver_id, d]))
}

// Save / upsert driver status by driver UUID
export async function saveDriverStatus(driverUUID, status, extra = {}) {
  if (!supabase || !driverUUID) return
  const { latitude, longitude, currentTripId } = extra
  await supabase.from('driver_status').upsert({
    driver_id:       driverUUID,
    status,
    latitude:        latitude        || null,
    longitude:       longitude       || null,
    current_trip_id: currentTripId   || null,
    last_heartbeat:  new Date().toISOString(),
    updated_at:      new Date().toISOString(),
  }, { onConflict: 'driver_id' })
}

// Get driver UUID from name (helper for hooks that use name strings)
export async function getDriverUUIDByName(driverName) {
  if (!supabase || !driverName) return null
  const { data } = await supabase
    .from('drivers')
    .select('id')
    .ilike('name', driverName)
    .limit(1)
    .single()
  return data?.id || null
}
