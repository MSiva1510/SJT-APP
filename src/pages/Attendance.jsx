import { useState, useEffect, useCallback } from 'react'
import {
  CalendarCheck, Clock, UserCheck, UserX,
  ChevronDown, ChevronUp, Calendar, Car, AlertTriangle,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Avatar     from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { loadDrivers } from '../data/driverData'
import {
  loadAttendance, saveAttendanceRecord,
  ATTENDANCE_TYPES, getAttendanceCfg,
  loadAttendanceToday,
} from '../data/attendanceData'

// ── Attendance status badge ────────────────────────────────────
function AttBadge({ status }) {
  const cfg = getAttendanceCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Working hours bar ─────────────────────────────────────────
function HoursBar({ hours }) {
  if (!hours) return <span className="text-[10px] text-slate-400">—</span>
  const match = hours.match(/(\d+)h\s*(\d+)m/)
  if (!match) return <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{hours}</span>
  const h = parseInt(match[1]), m = parseInt(match[2])
  const pct = Math.min(100, Math.round(((h * 60 + m) / (12 * 60)) * 100))
  return (
    <div className="min-w-[80px]">
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{hours}</p>
      <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
             style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Driver View — own attendance
// ─────────────────────────────────────────────────────────────
function DriverAttendanceView({ user }) {
  const [all, setAll] = useState([])
  const [loadError, setLoadError] = useState(null)
  useEffect(() => {
    loadAttendance()
      .then(d => { setAll(Array.isArray(d) ? d : []); setLoadError(null) })
      .catch(err => { console.error('[Attendance] load failed:', err); setLoadError('Could not load your attendance history.') })
  }, [])
  const myRecords  = all.filter(a => a.driverId === user.id || a.driver === user.name)
                       .sort((a,b) => (b.date || '').localeCompare(a.date || ''))
  const today      = new Date().toISOString().slice(0,10)
  const todayRec   = myRecords.find(r => r.date === today)

  // Monthly summary
  const thisMonth  = myRecords.filter(r => r.date?.startsWith(today.slice(0,7)))
  const presentDays = thisMonth.filter(r => r.status === 'present' || r.status === 'half-day').length
  const absentDays  = thisMonth.filter(r => r.status === 'absent').length
  const leaveDays   = thisMonth.filter(r => r.status === 'leave').length

  const totalHoursMin = thisMonth.reduce((s, r) => {
    if (!r.workingHours) return s
    const m = r.workingHours.match(/(\d+)h\s*(\d+)m/)
    return m ? s + parseInt(m[1]) * 60 + parseInt(m[2]) : s
  }, 0)
  const totalHoursStr = totalHoursMin > 0
    ? `${Math.floor(totalHoursMin/60)}h ${totalHoursMin%60}m`
    : '—'

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center gap-2">
          <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      )}
      {/* Today card */}
      <div className="glass-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Today</p>
            <h2 className="text-lg font-display font-black text-slate-800 dark:text-white">
              {new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' })}
            </h2>
          </div>
          {todayRec ? <AttBadge status={todayRec.status} /> : <span className="text-xs text-slate-400">Not recorded</span>}
        </div>
        {todayRec ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label:'Check In',  value: todayRec.checkIn  || '—', icon: UserCheck },
              { label:'Check Out', value: todayRec.checkOut || 'Active',  icon: UserX   },
              { label:'Vehicle',   value: todayRec.vehicle  || '—', icon: Car      },
              { label:'Working',   value: todayRec.workingHours || (todayRec.checkIn ? 'In progress' : '—'), icon: Clock },
            ].map(d => (
              <div key={d.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 flex items-start gap-2">
                <d.icon size={13} className="text-slate-400 dark:text-slate-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{d.label}</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">{d.value}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-slate-400 dark:text-slate-500">
            No attendance record for today yet.<br />
            <span className="text-xs">Auto check-in happens when you start your first ride.</span>
          </div>
        )}
      </div>

      {/* Monthly summary */}
      <div className="glass-card rounded-2xl p-5">
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
          {new Date().toLocaleString('en-IN', { month:'long' })} Summary
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          {[
            { label:'Present Days',    value: presentDays, color:'text-emerald-600 dark:text-emerald-400' },
            { label:'Absent Days',     value: absentDays,  color:'text-red-600 dark:text-red-400'         },
            { label:'Leave Days',      value: leaveDays,   color:'text-amber-600 dark:text-amber-400'     },
            { label:'Total Hours',     value: totalHoursStr, color:'text-blue-600 dark:text-blue-400'     },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 text-center">
              <p className={`text-lg font-display font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* History list */}
      <div>
        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 px-0.5">
          Attendance History
        </p>
        <div className="space-y-2">
          {myRecords.slice(0, 14).map((r, i) => (
            <div key={i} className="glass-card rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-navy-900 dark:bg-navy-800 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-[8px] font-bold text-blue-400 uppercase leading-none">{r.date ? `${r.date.slice(5,7)}/${r.date.slice(8,10)}` : '—'}</span>
                <span className="text-xs font-black text-white leading-tight">
                  {r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'short' }) : '—'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <AttBadge status={r.status} />
                {r.checkIn && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {r.checkIn}{r.checkOut ? ` – ${r.checkOut}` : ' (no checkout)'}
                  </p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                {r.workingHours && <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{r.workingHours}</p>}
                {r.vehicle && <p className="text-[10px] font-mono text-slate-400">{r.vehicle}</p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Manager / Admin View
// ─────────────────────────────────────────────────────────────
function AdminAttendanceView({ isAdmin }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0,10))
  const [expandedDriver, setExpandedDriver] = useState(null)
  const [editRecord, setEditRecord] = useState(null)

  const [allRecords, setAllRecords] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loadError, setLoadError] = useState(null)

  const reload = useCallback(async () => {
    const [rec, drv] = await Promise.allSettled([loadAttendance(), loadDrivers()])
    setAllRecords(rec.status === 'fulfilled' && Array.isArray(rec.value) ? rec.value : [])
    setDrivers(   drv.status === 'fulfilled' && Array.isArray(drv.value) ? drv.value : [])
    const failed = rec.status === 'rejected' || drv.status === 'rejected'
    if (failed) {
      if (rec.status === 'rejected') console.error('[Attendance] load records failed:', rec.reason)
      if (drv.status === 'rejected') console.error('[Attendance] load drivers failed:', drv.reason)
      setLoadError('Could not load attendance data. Try refreshing.')
    } else {
      setLoadError(null)
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  const dateRecords = allRecords.filter(r => r.date === selectedDate)

  const driverRows = drivers.map(d => ({
    name: d.name,
    id: d.id,
    record: dateRecords.find(r => r.driver === d.name) || null,
  }))

  const presentCount  = driverRows.filter(d => ['present','half-day'].includes(d.record?.status)).length
  const absentCount   = driverRows.filter(d => d.record?.status === 'absent').length
  const leaveCount    = driverRows.filter(d => d.record?.status === 'leave').length
  const unknownCount  = driverRows.filter(d => !d.record).length

  const handleMarkAttendance = async (driverName, status) => {
    const existing = dateRecords.find(r => r.driver === driverName)
    const driverMeta = drivers.find(d => d.name === driverName)
    const record = {
      id:           existing?.id || Date.now(),
      driver:       driverName,
      driverId:     driverMeta?.id,
      date:         selectedDate,
      status,
      checkIn:      existing?.checkIn  || null,
      checkOut:     existing?.checkOut || null,
      vehicle:      existing?.vehicle  || null,
      workingHours: existing?.workingHours || null,
    }
    try {
      await saveAttendanceRecord(record)
      await reload()
    } catch (err) {
      console.error('[Attendance] mark attendance failed:', err)
      window.alert('Could not save attendance. Please try again.')
    }
  }

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
          </div>
          <button onClick={reload}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Date selector */}
      <div className="glass-card rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <Calendar size={16} className="text-navy-700 dark:text-blue-400 flex-shrink-0" />
        <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">Select Date</p>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          max={new Date().toISOString().slice(0,10)}
          className="ml-auto px-3 py-1.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label:'Present',  value: presentCount, dot:'bg-emerald-500', text:'text-emerald-600 dark:text-emerald-400' },
          { label:'Absent',   value: absentCount,  dot:'bg-red-500',     text:'text-red-600 dark:text-red-400'         },
          { label:'Leave',    value: leaveCount,   dot:'bg-amber-500',   text:'text-amber-600 dark:text-amber-400'     },
          { label:'Unknown',  value: unknownCount, dot:'bg-slate-400',   text:'text-slate-600 dark:text-slate-400'     },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-3 text-center">
            <div className="flex justify-center mb-1"><span className={`w-2 h-2 rounded-full ${s.dot}`} /></div>
            <p className={`text-xl font-display font-black ${s.text}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Driver attendance list */}
      <div className="space-y-3">
        {driverRows.map(({ name, record }) => {
          const isExpanded = expandedDriver === name
          return (
            <div key={name} className="glass-card rounded-2xl overflow-hidden">
              <div className="flex items-center gap-3 p-4 cursor-pointer select-none"
                   onClick={() => setExpandedDriver(isExpanded ? null : name)}>
                <Avatar name={name} size={38} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 dark:text-white text-sm">{name}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {record
                      ? <>
                          <AttBadge status={record.status} />
                          {record.checkIn && <span className="text-[10px] text-slate-400">In: {record.checkIn}</span>}
                          {record.checkOut && <span className="text-[10px] text-slate-400">Out: {record.checkOut}</span>}
                        </>
                      : <span className="text-[10px] text-slate-400">Not marked</span>
                    }
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {record?.workingHours && <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{record.workingHours}</span>}
                  {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-navy-700 p-4 bg-slate-50/50 dark:bg-navy-800/30 space-y-3">
                  {/* Detail grid */}
                  {record && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label:'Check In',       value: record.checkIn       || '—' },
                        { label:'Check Out',      value: record.checkOut      || '—' },
                        { label:'Vehicle',        value: record.vehicle       || '—' },
                        { label:'Working Hours',  value: record.workingHours  || '—' },
                        // Module 9 (Day 20.5): trip-driven session time, synced
                        // separately from the login/logout-based workingHours above.
                        ...(record.tripWorkingMinutes != null ? [{
                          label: 'Trip Driving Time',
                          value: record.tripWorkingMinutes > 0
                            ? `${Math.floor(record.tripWorkingMinutes/60)}h ${record.tripWorkingMinutes%60}m`
                            : '—',
                        }] : []),
                        ...(record.tripSessions?.length ? [{
                          label: 'Trips Today',
                          value: `${record.tripSessions.length}`,
                        }] : []),
                      ].map(d => (
                        <div key={d.label} className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{d.label}</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{d.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Mark attendance buttons */}
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Mark Attendance</p>
                    <div className="flex gap-2 flex-wrap">
                      {ATTENDANCE_TYPES.map(t => (
                        <button key={t.key}
                          onClick={() => handleMarkAttendance(name, t.key)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                            record?.status === t.key
                              ? `${t.bg} ${t.text} ring-2 ring-offset-1`
                              : 'bg-slate-100 dark:bg-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-navy-600'
                          }`}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Admin: full analytics */}
      {isAdmin && (
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Monthly Overview — All Drivers</p>
          {['Ramanan','Babu','Rajasekharan'].map(name => {
            const dRecords = allRecords.filter(r => r.driver === name)
            const thisMonth = dRecords.filter(r => r.date?.startsWith(new Date().toISOString().slice(0,7)))
            const p = thisMonth.filter(r => ['present','half-day'].includes(r.status)).length
            const a = thisMonth.filter(r => r.status === 'absent').length
            const l = thisMonth.filter(r => r.status === 'leave').length
            const totalMin = thisMonth.reduce((s, r) => {
              if (!r.workingHours) return s
              const m = r.workingHours.match(/(\d+)h\s*(\d+)m/)
              return m ? s + parseInt(m[1]) * 60 + parseInt(m[2]) : s
            }, 0)
            return (
              <div key={name} className="mb-4 last:mb-0">
                <div className="flex items-center gap-2.5 mb-2">
                  <Avatar name={name} size={26} />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1">{name}</span>
                  <span className="text-[10px] text-slate-400">{Math.floor(totalMin/60)}h total</span>
                </div>
                <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500" style={{ width:`${(p/7)*100}%` }} />
                  <div className="h-full bg-amber-400"   style={{ width:`${(l/7)*100}%` }} />
                  <div className="h-full bg-red-400"     style={{ width:`${(a/7)*100}%` }} />
                </div>
                <div className="flex gap-3 mt-1">
                  {[['Present',p,'text-emerald-600 dark:text-emerald-400'],['Leave',l,'text-amber-600 dark:text-amber-400'],['Absent',a,'text-red-600 dark:text-red-400']].map(([lbl,val,cls]) => (
                    <span key={lbl} className={`text-[10px] font-bold ${cls}`}>{val} {lbl}</span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Attendance Page
// ─────────────────────────────────────────────────────────────
export default function Attendance() {
  const { user, isDriver, isAdmin } = useAuth()

  return (
    <div className="space-y-5 animate-fade-up max-w-2xl mx-auto">
      <PageHeader
        title="Attendance"
        subtitle={isDriver ? 'Your work schedule & hours' : 'Driver attendance management'}
        action={
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <CalendarCheck size={14} className="text-navy-700 dark:text-blue-400" />
            {new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
          </div>
        }
      />
      {isDriver
        ? <DriverAttendanceView user={user} />
        : <AdminAttendanceView isAdmin={isAdmin} />
      }
    </div>
  )
}