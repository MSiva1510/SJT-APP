// ─── Trip Type Management — Data, Config & Booking Store ─────
// Storage: Supabase `bookings` table via tripRepository

import { tripRepository } from '../repositories/tripRepository'
import { withCache, cacheClear } from '../utils/dataCache'

// ── Trip type definitions ─────────────────────────────────────
export const TRIP_TYPE_CONFIG = {
  one_way: {
    id:'one_way', label:'One Way', icon:'→', color:'blue',
    gradient:'from-blue-600 to-blue-500', bg:'bg-blue-50 dark:bg-blue-900/20',
    border:'border-blue-200 dark:border-blue-800/50',
    badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    description:'Single direction trip from pickup to drop', fields:['pickup','drop'],
  },
  round_trip: {
    id:'round_trip', label:'Round Trip', icon:'⇄', color:'emerald',
    gradient:'from-emerald-600 to-teal-500', bg:'bg-emerald-50 dark:bg-emerald-900/20',
    border:'border-emerald-200 dark:border-emerald-800/50',
    badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    description:'Return trip back to pickup location', fields:['pickup','destination','returnDate','returnTime'],
  },
  local_visit: {
    id:'local_visit', label:'Local Visit', icon:'📍', color:'violet',
    gradient:'from-violet-600 to-purple-500', bg:'bg-violet-50 dark:bg-violet-900/20',
    border:'border-violet-200 dark:border-violet-800/50',
    badge:'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    description:'Multiple stops within same city or region', fields:['baseLocation','stops','waitingTime'],
  },
  multi_day: {
    id:'multi_day', label:'Multi Day Trip', icon:'🗓', color:'amber',
    gradient:'from-amber-500 to-orange-500', bg:'bg-amber-50 dark:bg-amber-900/20',
    border:'border-amber-200 dark:border-amber-800/50',
    badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    description:'Extended trip spanning multiple days', fields:['pickup','destination','numberOfDays'],
  },
  rental_with_driver: {
    id:'rental_with_driver', label:'Rental With Driver', icon:'🚗', color:'teal',
    gradient:'from-teal-600 to-cyan-500', bg:'bg-teal-50 dark:bg-teal-900/20',
    border:'border-teal-200 dark:border-teal-800/50',
    badge:'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    description:'Hourly or daily vehicle rental with driver', fields:['pickupTime','returnTime','vehicle','driver'],
  },
  self_drive: {
    id:'self_drive', label:'Self Drive Rental', icon:'🔑', color:'rose',
    gradient:'from-rose-600 to-red-500', bg:'bg-rose-50 dark:bg-rose-900/20',
    border:'border-rose-200 dark:border-rose-800/50',
    badge:'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    description:'Customer drives the vehicle themselves', fields:['pickupTime','returnTime','securityDeposit','startKm','endKm'],
  },
}

export const TRIP_TYPE_LIST = Object.values(TRIP_TYPE_CONFIG)

// ── Booking status definitions — Full Day 29 lifecycle ────────
export const BOOKING_STATUSES = [
  {
    key:'draft',
    label:'Draft',
    icon:'📝',
    badge:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    dot:'bg-slate-400',
  },
  {
    key:'pending',
    label:'Pending',
    icon:'⏳',
    badge:'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    dot:'bg-yellow-500 animate-pulse',
  },
  {
    key:'approved',
    label:'Approved',
    icon:'✅',
    badge:'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    dot:'bg-violet-500',
  },
  {
    key:'confirmed',
    label:'Confirmed',
    icon:'✅',
    badge:'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    dot:'bg-violet-500',
  },
  {
    key:'assigned',
    label:'Assigned',
    icon:'👤',
    badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    dot:'bg-blue-500',
  },
  {
    key:'started',
    label:'In Progress',
    icon:'🚗',
    badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    dot:'bg-amber-500 animate-pulse',
  },
  {
    key:'completed',
    label:'Completed',
    icon:'🏁',
    badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    dot:'bg-emerald-500',
  },
  {
    key:'closed',
    label:'Closed',
    icon:'🔒',
    badge:'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    dot:'bg-teal-500',
  },
  {
    key:'cancelled',
    label:'Cancelled',
    icon:'❌',
    badge:'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    dot:'bg-red-500',
  },
]

// Backward-compat alias
export const TRIP_STATUSES = BOOKING_STATUSES

export const getStatusCfg = key =>
  BOOKING_STATUSES.find(s => s.key === key) || BOOKING_STATUSES[0]

// ── Workflow transitions ────────────────────────────────────────
// What actions are available from each status
export const WORKFLOW_TRANSITIONS = {
  draft: [
    { to:'pending',   label:'Submit for Approval', color:'blue'   },
    { to:'cancelled', label:'Cancel Booking',       color:'red'    },
  ],
  pending: [
    { to:'approved',  label:'Approve',              color:'violet' },
    { to:'draft',     label:'Return to Draft',      color:'slate'  },
    { to:'cancelled', label:'Cancel',               color:'red'    },
  ],
  approved: [
    { to:'assigned',  label:'Assign Driver',        color:'blue'   },
    { to:'cancelled', label:'Cancel',               color:'red'    },
  ],
  confirmed: [
    { to:'assigned',  label:'Assign Driver',        color:'blue'   },
    { to:'cancelled', label:'Cancel',               color:'red'    },
  ],
  assigned: [
    { to:'started',   label:'Start Trip',           color:'amber'  },
    { to:'cancelled', label:'Cancel',               color:'red'    },
  ],
  started: [
    { to:'completed', label:'Complete Trip',        color:'emerald'},
  ],
  completed: [
    { to:'closed',    label:'Close Booking',        color:'teal'   },
  ],
  closed:    [],
  cancelled: [],
}

export function getWorkflowTransitions(status) {
  return WORKFLOW_TRANSITIONS[status] || []
}

// ── Driver availability config ────────────────────────────────
export const DRIVER_AVAIL_CFG = {
  available: { label:'Available', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot:'bg-emerald-500' },
  driving:   { label:'Driving',   badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',        dot:'bg-amber-500 animate-pulse' },
  offline:   { label:'Offline',   badge:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',           dot:'bg-slate-400' },
  leave:     { label:'On Leave',  badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                dot:'bg-red-500' },
}

// ── Vehicle availability config ───────────────────────────────
export const VEHICLE_AVAIL_CFG = {
  available:   { label:'Available', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot:'bg-emerald-500' },
  assigned:    { label:'Assigned',  badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             dot:'bg-blue-500' },
  maintenance: { label:'Service',   badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 dot:'bg-red-500' },
}

// ── Booking number generator ──────────────────────────────────
export function generateBookingNumber() {
  const d  = new Date()
  const y  = d.getFullYear().toString().slice(-2)
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const ts = Date.now().toString().slice(-4)
  return `BK-${y}${m}-${ts}`
}

// ── Supabase booking store ────────────────────────────────────
async function _loadBookings() {
  try {
    const rows = await tripRepository.getAll()
    return (Array.isArray(rows) ? rows : []).map(normalizeBooking)
  } catch (err) {
    console.error('[tripTypes] loadBookings failed:', err)
    throw err
  }
}
export const loadBookings = withCache('bookings', _loadBookings)

export const getBookings = loadBookings

export function normalizeBooking(row = {}) {
  const typeData = row.type_data && typeof row.type_data === 'object' ? row.type_data : {}
  return {
    ...typeData,
    ...row,
    id: row.id || row.booking_id,
    bookingNo: row.bookingNo ?? row.booking_number ?? row.booking_id ?? row.id ?? '',
    customer: row.customer ?? row.customer_name ?? '',
    contact: row.contact ?? row.customer_contact ?? '',
    driver: row.driver ?? row.driver_name ?? typeData.driver_name ?? row.driver_id ?? '',
    vehicle: row.vehicle ?? row.vehicle_registration ?? typeData.vehicle_registration ?? row.vehicle_id ?? '',
    pickup: row.pickup ?? row.pickup_location ?? '',
    drop: row.drop ?? row.drop_location ?? '',
    startDate: row.startDate ?? row.start_date ?? '',
    startTime: row.startTime ?? row.start_time ?? '',
    returnDate: row.returnDate ?? row.end_date ?? '',
    returnTime: row.returnTime ?? row.end_time ?? '',
    km: Number(row.km ?? row.total_km ?? 0),
    fare: Number(row.fare ?? row.total_fare ?? row.base_fare ?? 0),
    createdAt: row.createdAt ?? row.created_at ?? '',
    updatedAt: row.updatedAt ?? row.updated_at ?? row.created_at ?? '',
    approvedBy: row.approvedBy ?? row.approved_by ?? '',
    approvedAt: row.approvedAt ?? row.approved_at ?? '',
    remarks: row.remarks ?? '',
    lastModifiedBy: row.lastModifiedBy ?? row.last_modified_by ?? '',
    approval_history: Array.isArray(row.approval_history) ? row.approval_history : [],
  }
}

export async function saveBooking(booking) {
  const { id, ...rest } = booking
  const existing = id ? await tripRepository.getById(id) : null
  const result = existing
    ? await tripRepository.update(id, rest)
    : await tripRepository.create({ id, ...rest })
  cacheClear('bookings')
  return result
}

export async function deleteBooking(id) {
  const result = await tripRepository.delete(id)
  cacheClear('bookings')
  return result
}

export async function getBookingsByStatus(status) {
  try {
    return await tripRepository.getByStatus(status)
  } catch (err) {
    console.error('[tripTypes] getBookingsByStatus failed:', err)
    return []
  }
}

// ── Availability helpers ──────────────────────────────────────
export function getDriverAvailability(driverName, date, bookings, mockDriverStatus) {
  if (mockDriverStatus === 'on-leave') return 'leave'
  const conflict = (bookings ?? []).find(b =>
    b.driver === driverName &&
    b.startDate === date &&
    ['assigned','started'].includes(b.status)
  )
  if (conflict) return 'driving'
  return 'available'
}

export function getVehicleAvailability(vehicleReg, date, bookings, mockVehicleStatus) {
  if (mockVehicleStatus === 'maintenance') return 'maintenance'
  const conflict = (bookings ?? []).find(b =>
    b.vehicle === vehicleReg &&
    b.startDate === date &&
    ['assigned','started'].includes(b.status)
  )
  if (conflict) return 'assigned'
  return 'available'
}