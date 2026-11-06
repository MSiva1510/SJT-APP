// ─── Trip Timeline Data — Supabase trip_timelines table ────────
// Columns: id, booking_id (UUID FK→bookings), event_type,
//          event_time, description, created_at

import supabase from '../lib/supabase'

const EVENT_CONFIG = {
  BOOKING_CREATED:   { label: 'Booking Created',   icon: '📋', color: 'bg-blue-500'    },
  DRIVER_ASSIGNED:   { label: 'Driver Assigned',   icon: '👤', color: 'bg-violet-500'  },
  TRIP_STARTED:      { label: 'Trip Started',      icon: '🚗', color: 'bg-amber-500'   },
  TRIP_COMPLETED:    { label: 'Trip Completed',    icon: '✅', color: 'bg-emerald-500' },
  TRIP_CANCELLED:    { label: 'Trip Cancelled',    icon: '❌', color: 'bg-red-500'     },
  EXPENSE_ADDED:     { label: 'Expense Added',     icon: '💸', color: 'bg-orange-500'  },
  DOCUMENT_UPLOADED: { label: 'Document Uploaded', icon: '📎', color: 'bg-teal-500'    },
  NOTE_ADDED:        { label: 'Note Added',        icon: '📝', color: 'bg-slate-500'   },
}

export function getEventCfg(type) {
  return EVENT_CONFIG[type] || { label: type, icon: 'ℹ', color: 'bg-slate-400' }
}

export function fmtTimelineTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export async function loadTimeline(bookingId) {
  if (!supabase || !bookingId) return []
  const { data, error } = await supabase
    .from('trip_timelines')
    .select('id, event_type, event_time, description, created_at')
    .eq('booking_id', bookingId)
    .order('event_time', { ascending: true })
  if (error) return []
  return (data || []).map(e => ({
    id:          e.id,
    type:        e.event_type,
    ts:          e.event_time || e.created_at,
    description: e.description,
    ...getEventCfg(e.event_type),
  }))
}

export async function addTimelineEvent(bookingId, type, description = '') {
  if (!supabase || !bookingId) return
  try {
    await supabase.from('trip_timelines').insert([{
      booking_id:  bookingId,
      event_type:  type,
      event_time:  new Date().toISOString(),
      description: description || null,
    }])
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[timeline] insert failed:', err.message)
  }
}
