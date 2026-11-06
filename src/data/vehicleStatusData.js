// ─── Vehicle Status Data — Supabase vehicle_status table ──────
// Columns: id, vehicle_id (UUID FK→vehicles), status,
//          assigned_driver_id, current_trip_id, last_km_reading,
//          fuel_level, updated_at

import supabase from '../lib/supabase'

const STATUS_CFG = {
  available:   { label: 'Available',   badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  in_use:      { label: 'In Use',      badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             dot: 'bg-blue-500 animate-pulse' },
  maintenance: { label: 'Maintenance', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 dot: 'bg-red-500' },
  offline:     { label: 'Offline',     badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',            dot: 'bg-slate-400' },
}

// In-memory cache for current session
const _cache = {}

export function getVehicleStatusCfg(status) {
  return STATUS_CFG[status] || STATUS_CFG.available
}

// Get status entry for a vehicle registration
// Returns cached value — pre-load with loadAllVehicleStatuses()
export function getVehicleStatusEntry(vehicleReg) {
  return _cache[vehicleReg] || {
    status: 'available', driver: null, area: null, tripId: null, fuelLevel: null, updatedAt: null,
  }
}

// Load all vehicle statuses from Supabase into cache
export async function loadAllVehicleStatuses() {
  if (!supabase) return
  const { data } = await supabase
    .from('vehicle_status')
    .select('vehicle_id, status, assigned_driver_id, current_trip_id, last_km_reading, fuel_level, updated_at, vehicles(registration)')
  if (!data) return
  for (const row of data) {
    const reg = row.vehicles?.registration
    if (reg) _cache[reg] = {
      status:    row.status,
      driver:    row.assigned_driver_id || null,
      tripId:    row.current_trip_id    || null,
      area:      null,
      fuelLevel: row.fuel_level,
      updatedAt: row.updated_at,
    }
  }
}

// Mark a vehicle as in-use
export async function markVehicleInUse(vehicleUUID, { driverUUID, tripUUID } = {}) {
  if (!supabase || !vehicleUUID) return
  await supabase.from('vehicle_status').upsert({
    vehicle_id:          vehicleUUID,
    status:              'in_use',
    assigned_driver_id:  driverUUID || null,
    current_trip_id:     tripUUID   || null,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'vehicle_id' })
}

// Mark a vehicle as available
export async function markVehicleAvailable(vehicleUUID) {
  if (!supabase || !vehicleUUID) return
  await supabase.from('vehicle_status').upsert({
    vehicle_id:          vehicleUUID,
    status:              'available',
    assigned_driver_id:  null,
    current_trip_id:     null,
    updated_at:          new Date().toISOString(),
  }, { onConflict: 'vehicle_id' })
}
