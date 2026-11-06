// ─── Audit Log Data ───────────────────────────────────────────
// Day 31: enhanced with severity, module, old/new values, user tracking

import supabase from '../lib/supabase'

export const AUDIT_LOG_KEY    = 'sjt_audit_log'
export const AUDIT_MAX_ENTRIES = 500

export const SEVERITY = { INFO:'info', WARNING:'warning', ERROR:'error', CRITICAL:'critical' }

export const AUDIT_ACTIONS = {
  // Trips / Bookings
  TRIP_CREATED:       { label:'Trip Created',       icon:'📋', module:'bookings',  severity:'info'    },
  TRIP_UPDATED:       { label:'Trip Updated',       icon:'✏️',  module:'bookings',  severity:'info'    },
  TRIP_ASSIGNED:      { label:'Trip Assigned',      icon:'🧑‍✈️', module:'trips',     severity:'info'    },
  TRIP_STARTED:       { label:'Trip Started',       icon:'🚗', module:'trips',     severity:'info'    },
  TRIP_COMPLETED:     { label:'Trip Completed',     icon:'✅', module:'trips',     severity:'info'    },
  TRIP_CANCELLED:     { label:'Trip Cancelled',     icon:'❌', module:'trips',     severity:'warning' },
  BOOKING_PENDING:    { label:'Booking Pending',    icon:'⏳', module:'bookings',  severity:'info'    },
  BOOKING_APPROVED:   { label:'Booking Approved',   icon:'✅', module:'bookings',  severity:'info'    },
  BOOKING_CANCELLED:  { label:'Booking Cancelled',  icon:'❌', module:'bookings',  severity:'warning' },
  BOOKING_CLOSED:     { label:'Booking Closed',     icon:'🔒', module:'bookings',  severity:'info'    },
  // Expenses
  EXPENSE_ADDED:      { label:'Expense Added',      icon:'💸', module:'expenses',  severity:'info'    },
  EXPENSE_APPROVED:   { label:'Expense Approved',   icon:'✅', module:'expenses',  severity:'info'    },
  EXPENSE_REJECTED:   { label:'Expense Rejected',   icon:'❌', module:'expenses',  severity:'warning' },
  // Vehicles / Drivers
  VEHICLE_ASSIGNED:   { label:'Vehicle Assigned',   icon:'🚙', module:'vehicles',  severity:'info'    },
  DRIVER_ADDED:       { label:'Driver Added',       icon:'🧑‍✈️', module:'drivers',   severity:'info'    },
  DRIVER_UPDATED:     { label:'Driver Updated',     icon:'✏️',  module:'drivers',   severity:'info'    },
  // Customers
  CUSTOMER_ADDED:     { label:'Customer Added',     icon:'👤', module:'customers', severity:'info'    },
  CUSTOMER_UPDATED:   { label:'Customer Updated',   icon:'✏️',  module:'customers', severity:'info'    },
  // Finance
  PAYROLL_SETTLED:    { label:'Payroll Settled',    icon:'💳', module:'payroll',   severity:'info'    },
  INVOICE_CREATED:    { label:'Invoice Created',    icon:'🧾', module:'finance',   severity:'info'    },
  // Security
  USER_LOGIN:         { label:'User Login',         icon:'🔐', module:'security',  severity:'info'    },
  USER_LOGOUT:        { label:'User Logout',        icon:'🚪', module:'security',  severity:'info'    },
  USER_CREATED:       { label:'User Created',       icon:'👤', module:'security',  severity:'info'    },
  USER_UPDATED:       { label:'User Updated',       icon:'✏️',  module:'security',  severity:'info'    },
  USER_DEACTIVATED:   { label:'User Deactivated',   icon:'🚫', module:'security',  severity:'warning' },
  USER_ACTIVATED:     { label:'User Activated',     icon:'✅', module:'security',  severity:'info'    },
  PASSWORD_CHANGED:   { label:'Password Changed',   icon:'🔑', module:'security',  severity:'warning' },
  PERMISSION_CHANGED: { label:'Permission Changed', icon:'🛡️', module:'security',  severity:'warning' },
  // System
  SETTINGS_UPDATED:   { label:'Settings Updated',   icon:'⚙️', module:'settings',  severity:'info'    },
  BACKUP_STARTED:     { label:'Backup Started',     icon:'💾', module:'backup',    severity:'info'    },
  BACKUP_COMPLETED:   { label:'Backup Completed',   icon:'✅', module:'backup',    severity:'info'    },
  ERROR_RESOLVED:     { label:'Error Resolved',     icon:'🔧', module:'system',    severity:'info'    },
  NOTE_ADDED:         { label:'Note Added',         icon:'📝', module:'general',   severity:'info'    },
}

export function loadAuditEvents(limit = 50) {
  try {
    const raw = localStorage.getItem(AUDIT_LOG_KEY)
    const all = raw ? JSON.parse(raw) : []
    return Array.isArray(all) ? (limit ? all.slice(0, limit) : all) : []
  } catch { return [] }
}

export function loadRecentActivity(count = 10) {
  return loadAuditEvents(count)
}

export function addAuditEvent(action, details = {}) {
  const def = AUDIT_ACTIONS[action] || { label:action, icon:'📌', module:'general', severity:'info' }
  const events = loadAuditEvents(AUDIT_MAX_ENTRIES)
  const entry = {
    id:          `AUD-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`,
    action,
    label:       def.label,
    icon:        def.icon,
    module:      details.module      || def.module   || 'general',
    severity:    details.severity    || def.severity  || 'info',
    description: details.description || '',
    oldValues:   details.oldValues   || null,
    newValues:   details.newValues   || null,
    userId:      details.userId      || null,
    userName:    details.userName    || details.driver || null,
    timestamp:   new Date().toISOString(),
    ...details,
  }

  try {
    localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify([entry, ...events].slice(0, AUDIT_MAX_ENTRIES)))
  } catch {}

  // Persist to Supabase
  if (supabase) {
    supabase.from('audit_logs').insert([{
      action,
      table_name:  details.table    || entry.module  || null,
      record_id:   details.recordId || details.tripId || null,
      old_values:  details.oldValues || null,
      new_values:  details.newValues || details       || null,
      changed_by:  details.changedBy || details.driver || null,
      severity:    entry.severity,
      module:      entry.module,
      user_name:   entry.userName,
      changed_at:  entry.timestamp,
    }]).then(({ error }) => {
      if (error && import.meta.env.DEV) console.warn('[auditLog] insert failed:', error.message)
    })
  }

  return entry
}

export function fmtAuditTime(iso) {
  if (!iso) return '—'
  try {
    const d    = new Date(iso)
    const mins = Math.floor((Date.now() - d.getTime()) / 60000)
    const hrs  = Math.floor(mins / 60)
    const days = Math.floor(hrs / 24)
    if (mins < 1)  return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs  < 24) return `${hrs}h ago`
    if (days < 7)  return `${days}d ago`
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short' })
  } catch { return '—' }
}

export function clearAuditLog() {
  try { localStorage.removeItem(AUDIT_LOG_KEY) } catch {}
}
