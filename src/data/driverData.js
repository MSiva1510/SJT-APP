// ─── Driver Data — Supabase drivers + bookings tables ────────
// Provides driver profile, vehicle, history helpers for driver pages.

import supabase      from '../lib/supabase'
import { TRIP_TYPE_CONFIG } from './tripTypes'
import { withCache } from '../utils/dataCache'
import { driverRepository } from '../repositories/driverRepository'

export const TODAY_DAY = new Date().toLocaleDateString('en-IN', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
})

// Trip type display map (used by driver-facing pages)
export const TRIP_TYPES = Object.fromEntries(
  Object.entries(TRIP_TYPE_CONFIG).map(([k, v]) => [k, v.label])
)

export const DRIVER_STATUSES = [
  {
    key: 'available',
    label: 'Available',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    ring: 'ring-emerald-400/40',
  },
  {
    key: 'driving',
    label: 'Driving',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    ring: 'ring-amber-400/40',
  },
  {
    key: 'break',
    label: 'On Break',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    dot: 'bg-violet-500',
    ring: 'ring-violet-400/40',
  },
  {
    key: 'offline',
    label: 'Offline',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
    ring: 'ring-slate-400/40',
  },
]

export const TRIP_STATUS_CFG = {
  pending: {
    label: 'Pending',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  assigned: {
    label: 'Assigned',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
  },
  driving: {
    label: 'Driving',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500 animate-pulse',
  },
  started: {
    label: 'In Progress',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500 animate-pulse',
  },
  completed: {
    label: 'Completed',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
}

// Fetch driver profile from Supabase drivers table by name
export async function getDriverProfile(driverName) {
  if (!supabase || !driverName) return null
  const { data, error } = await supabase
    .from('drivers')
    .select('id, driver_id, name, phone, vehicle, status, joined_date')
    .ilike('name', driverName)
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.error('[driverData] getDriverProfile failed:', error)
    throw error
  }
  return data || null
}

// Fetch vehicle record from Supabase vehicles table by registration
export async function getDriverVehicle(vehicleReg) {
  if (!supabase || !vehicleReg) return null
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, registration, vehicle_type, model, year, color, fuel_type, status, current_km')
    .eq('registration', vehicleReg)
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') {
    console.error('[driverData] getDriverVehicle failed:', error)
    throw error
  }
  return data || null
}

async function _loadDrivers() {
  try {
    return await driverRepository.getAll()
  } catch (error) {
    console.error('[driverData] loadDrivers failed:', error)
    throw error
  }
}

export const loadDrivers = withCache('drivers', _loadDrivers)
export const getDrivers = loadDrivers

// Compute today stats from bookings array (already loaded in component)
export function getTodayStats(driverName, bookings = []) {
  if (!driverName) return { tripsToday: 0, earningsToday: 0, kmToday: 0 }
  const today = new Date().toISOString().slice(0, 10)
  const mine  = (Array.isArray(bookings) ? bookings : []).filter(b =>
    (b.driver_name === driverName || b.driver === driverName) &&
    (b.start_date  === today       || b.startDate === today)
  )
  return {
    tripsToday:    mine.length,
    earningsToday: mine.reduce((s, b) => s + (Number(b.total_fare || b.fare) || 0), 0),
    kmToday:       mine.reduce((s, b) => s + (Number(b.total_km   || b.km)   || 0), 0),
  }
}

// Filter bookings for a specific driver (from already-loaded bookings array)
export function getDriverHistory(driverName, bookings = []) {
  if (!driverName || !Array.isArray(bookings)) return []
  return bookings.filter(b =>
    b.driver_name === driverName || b.driver === driverName
  )
}
