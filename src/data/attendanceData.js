// ─── Attendance Data & Helpers ────────────────────────────────
// Storage: Supabase `attendance` table via attendanceRepository
//          Vehicle assignments: Supabase `vehicles` table (driver column)

import { attendanceRepository } from '../repositories/attendanceRepository'
import { vehicleRepository }    from '../repositories/vehicleRepository'
import supabase                  from '../lib/supabase'
import { withCache, cacheClear } from '../utils/dataCache'

// ── Keep key constants (used for column reference in helpers) ─
export const ATTENDANCE_KEY         = 'attendance'
export const VEHICLE_ASSIGNMENT_KEY = 'vehicle_assignments'

export const ATTENDANCE_TYPES = [
  { key:'present',  label:'Present',  color:'emerald', dot:'bg-emerald-500', bg:'bg-emerald-100 dark:bg-emerald-900/30', text:'text-emerald-700 dark:text-emerald-300' },
  { key:'absent',   label:'Absent',   color:'red',     dot:'bg-red-500',     bg:'bg-red-100 dark:bg-red-900/30',         text:'text-red-700 dark:text-red-300'         },
  { key:'leave',    label:'Leave',    color:'amber',   dot:'bg-amber-500',   bg:'bg-amber-100 dark:bg-amber-900/30',     text:'text-amber-700 dark:text-amber-300'     },
  { key:'half-day', label:'Half Day', color:'blue',    dot:'bg-blue-500',    bg:'bg-blue-100 dark:bg-blue-900/30',       text:'text-blue-700 dark:text-blue-300'       },
]

export const getAttendanceCfg = key => ATTENDANCE_TYPES.find(t => t.key === key) || ATTENDANCE_TYPES[0]

// ── Supabase attendance store ─────────────────────────────────

async function _loadAttendance() {
  try {
    return await attendanceRepository.getAll()
  } catch (err) {
    console.error('[attendanceData] loadAttendance failed:', err)
    throw err
  }
}
export const loadAttendance = withCache('attendance', _loadAttendance)


export async function saveAttendanceRecord(record) {
  try {
    const { id, ...rest } = record
    const today = new Date().toISOString().slice(0, 10)
    // Check for existing record by driver + date
    const existing = id ? await attendanceRepository.getById(id) : null
    let result
    if (existing || id) {
      result = await attendanceRepository.update(id, rest)
    } else {
      // Try to find by driver name + date to avoid duplicates
      const todayRecs = await attendanceRepository.getByDate(rest.date || today)
      const match = todayRecs.find(r =>
        r.driver === rest.driver || r.driver_name === rest.driver
      )
      result = match
        ? await attendanceRepository.update(match.id, rest)
        : await attendanceRepository.create(rest)
    }
    cacheClear('attendance')
    return result
  } catch (err) {
    console.error('[attendanceData] saveAttendanceRecord failed:', err)
    return null
  }
}

// ── Auto check-in ─────────────────────────────────────────────
export async function autoCheckIn(driverName, vehicleReg) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const existing = (await attendanceRepository.getByDate(today))
      .find(a => a.driver === driverName || a.driver_name === driverName)

    if (existing?.checkIn || existing?.check_in) return existing

    const now = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false })
    const record = {
      driver:        driverName,
      date:          today,
      attendance_date: today,
      status:        'present',
      checkIn:       now,
      check_in:      now,
      checkOut:      null,
      check_out:     null,
      vehicle:       vehicleReg,
      workingHours:  null,
      autoCheckedIn: true,
    }
    return await attendanceRepository.create(record)
  } catch (err) {
    console.error('[attendanceData] autoCheckIn failed:', err)
    return null
  }
}

// ── Auto check-out ────────────────────────────────────────────
export async function autoCheckOut(driverName) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const existing = (await attendanceRepository.getByDate(today))
      .find(a => a.driver === driverName || a.driver_name === driverName)

    if (!existing) return null
    const checkOutTime = existing.checkOut || existing.check_out
    if (checkOutTime) return existing

    const now = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false })
    const checkInTime  = existing.checkIn || existing.check_in || '08:00'

    let workingHours = null
    try {
      const [ih, im] = checkInTime.split(':').map(Number)
      const [oh, om] = now.split(':').map(Number)
      const totalMin = (oh * 60 + om) - (ih * 60 + im)
      if (totalMin > 0) {
        const h = Math.floor(totalMin / 60), m = totalMin % 60
        workingHours = `${h}h ${String(m).padStart(2,'0')}m`
      }
    } catch {}

    return await attendanceRepository.update(existing.id, {
      checkOut:       now,
      check_out:      now,
      workingHours,
      autoCheckedOut: true,
    })
  } catch (err) {
    console.error('[attendanceData] autoCheckOut failed:', err)
    return null
  }
}

// ── Trip session tracking ─────────────────────────────────────
export async function startTripSession(driverName, tripId) {
  if (!driverName) return null
  const today = new Date().toISOString().slice(0, 10)
  try {
    const existing = (await attendanceRepository.getByDate(today))
      .find(a => a.driver === driverName || a.driver_name === driverName)
    const now = new Date().toISOString()

    if (existing) {
      const sessions = existing.tripSessions || existing.trip_sessions || []
      if (!sessions.some(s => s.tripId === tripId && !s.endedAt)) {
        sessions.push({ tripId, startedAt: now, endedAt: null })
      }
      return await attendanceRepository.update(existing.id, {
        status: 'present',
        tripSessions:  sessions,
        trip_sessions: sessions,
      })
    }

    const checkInTime = new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', hour12:false })
    return await attendanceRepository.create({
      driver:          driverName,
      date:            today,
      attendance_date: today,
      status:          'present',
      checkIn:         checkInTime,
      check_in:        checkInTime,
      checkOut:        null,
      check_out:       null,
      vehicle:         null,
      workingHours:    null,
      autoCheckedIn:   true,
      tripSessions:    [{ tripId, startedAt: now, endedAt: null }],
      trip_sessions:   [{ tripId, startedAt: now, endedAt: null }],
    })
  } catch (err) {
    console.error('[attendanceData] startTripSession failed:', err)
    return null
  }
}

export async function endTripSession(driverName, tripId) {
  if (!driverName) return null
  const today = new Date().toISOString().slice(0, 10)
  try {
    const existing = (await attendanceRepository.getByDate(today))
      .find(a => a.driver === driverName || a.driver_name === driverName)
    if (!existing) return null

    const now = new Date().toISOString()
    const sessions = (existing.tripSessions || existing.trip_sessions || []).map(s =>
      s.tripId === tripId && !s.endedAt ? { ...s, endedAt: now } : s
    )
    const tripWorkingMinutes = sessions.reduce((sum, s) => {
      if (!s.startedAt) return sum
      const end = s.endedAt ? new Date(s.endedAt) : new Date()
      return sum + Math.max(0, Math.round((end - new Date(s.startedAt)) / 60000))
    }, 0)

    return await attendanceRepository.update(existing.id, {
      tripSessions:        sessions,
      trip_sessions:       sessions,
      tripWorkingMinutes,
    })
  } catch (err) {
    console.error('[attendanceData] endTripSession failed:', err)
    return null
  }
}

// ── Today's attendance ────────────────────────────────────────
export async function loadAttendanceToday() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    return await attendanceRepository.getByDate(today)
  } catch (err) {
    console.error('[attendanceData] loadAttendanceToday failed:', err)
    return []
  }
}

// ── Vehicle assignments ───────────────────────────────────────
// Assignments are stored in a `vehicle_assignments` table in Supabase.
// If that table doesn't exist yet, run:
//   CREATE TABLE public.vehicle_assignments (
//     id            BIGSERIAL PRIMARY KEY,
//     vehicle_reg   TEXT NOT NULL,
//     vehicle_type  TEXT,
//     vehicle_model TEXT,
//     driver_id     TEXT,
//     driver_name   TEXT NOT NULL,
//     assigned_date DATE NOT NULL,
//     assigned_time TEXT,
//     assigned_at   TIMESTAMPTZ DEFAULT NOW(),
//     released_date DATE,
//     created_at    TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE public.vehicle_assignments DISABLE ROW LEVEL SECURITY;

export async function loadVehicleAssignments() {
  try {
    const { data, error } = await supabase
      .from('vehicle_assignments')
      .select('*')
      .order('assigned_at', { ascending: false })
    if (error) throw error
    // Normalise snake_case → camelCase for compatibility
    return (data || []).map(r => ({
      id:           r.id,
      vehicleReg:   r.vehicle_reg,
      vehicleType:  r.vehicle_type,
      vehicleModel: r.vehicle_model,
      driverId:     r.driver_id,
      driverName:   r.driver_name,
      assignedDate: r.assigned_date,
      assignedTime: r.assigned_time,
      assignedAt:   r.assigned_at,
      releasedDate: r.released_date,
    }))
  } catch (err) {
    console.error('[attendanceData] loadVehicleAssignments failed:', err)
    return []
  }
}

export async function saveVehicleAssignment(record) {
  try {
    const payload = {
      vehicle_reg:   record.vehicleReg,
      vehicle_type:  record.vehicleType,
      vehicle_model: record.vehicleModel,
      driver_id:     record.driverId,
      driver_name:   record.driverName,
      assigned_date: record.assignedDate,
      assigned_time: record.assignedTime,
      assigned_at:   record.assignedAt || new Date().toISOString(),
      released_date: record.releasedDate || null,
    }
    // Upsert: one active assignment per driver (no released_date)
    const { data: existing } = await supabase
      .from('vehicle_assignments')
      .select('id')
      .eq('driver_name', record.driverName)
      .is('released_date', null)
      .single()

    if (existing?.id) {
      await supabase
        .from('vehicle_assignments')
        .update(payload)
        .eq('id', existing.id)
    } else {
      await supabase.from('vehicle_assignments').insert([payload])
    }
    return record
  } catch (err) {
    console.error('[attendanceData] saveVehicleAssignment failed:', err)
    return null
  }
}

export async function getCurrentVehicleForDriver(driverName) {
  if (!driverName) return null
  try {
    const { data, error } = await supabase
      .from('vehicle_assignments')
      .select('*')
      .ilike('driver_name', driverName)
      .is('released_date', null)
      .order('assigned_at', { ascending: false })
      .limit(1)
      .single()
    if (error && error.code === 'PGRST116') return null
    if (error) throw error
    if (!data) return null
    return {
      vehicleReg:   data.vehicle_reg,
      vehicleType:  data.vehicle_type,
      vehicleModel: data.vehicle_model,
      driverId:     data.driver_id,
      driverName:   data.driver_name,
      assignedDate: data.assigned_date,
      assignedTime: data.assigned_time,
      assignedAt:   data.assigned_at,
      releasedDate: data.released_date,
    }
  } catch (err) {
    console.error('[attendanceData] getCurrentVehicleForDriver failed:', err)
    return null
  }
}

// ── Seed / reference data ─────────────────────────────────────
const TODAY = new Date()
function daysAgo(n) {
  const d = new Date(TODAY); d.setDate(d.getDate() - n)
  return d.toISOString().slice(0,10)
}