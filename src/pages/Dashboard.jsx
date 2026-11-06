import { useState, useEffect, useCallback } from 'react'
import {
  TrendingUp, TrendingDown, IndianRupee, Car, Receipt,
  CheckCircle, Clock, Users, Fuel, Plus, FileText,
  ShieldOff, CalendarCheck, BookOpen,
  Zap, XCircle, AlertTriangle, Wrench, Shield, Filter,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import StatCard   from '../components/ui/StatCard'
import Avatar     from '../components/ui/Avatar'
import Badge      from '../components/ui/Badge'
import Button     from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import { fleetAlertRepository } from '../repositories'
import { loadAttendanceToday }                         from '../data/attendanceData'
import { loadCustomers }                               from '../data/customerData'
import { loadExpenses, summariseByType, isThisMonth }  from '../data/expenseData'
import { loadBookings, getStatusCfg, TRIP_TYPE_CONFIG } from '../data/tripTypes'
import { loadSettlements }                             from '../data/settlementData'
import { docStatus, daysLabel }                        from '../utils/vehicleUtils'
import LiveFleetBoard                                  from '../components/fleet/LiveFleetBoard'
import { loadRecentActivity, fmtAuditTime }            from '../data/auditLogData'

// ── Blocked section placeholder ───────────────────────────────
function AccessBlocked({ label }) {
  return (
    <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-2 min-h-[120px]">
      <ShieldOff size={22} className="text-slate-300 dark:text-slate-600" />
      <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{label}</p>
      <p className="text-xs text-slate-300 dark:text-slate-600">Not available for your role</p>
    </div>
  )
}

function BarChart({ data }) {
  const max = Math.max(1, ...data.map(d => d.fare))
  return (
    <div className="flex items-end gap-1.5 h-24 w-full">
      {data.map((d, i) => {
        const pct    = Math.round((d.fare / max) * 100)
        const isLast = i === data.length - 1
        return (
          <div key={d.month} className="flex flex-col items-center gap-1 flex-1">
            <div className="w-full relative group">
              <div className={`w-full rounded-t-md transition-all duration-500 ${isLast ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-lg shadow-blue-500/30' : 'bg-slate-200 dark:bg-navy-700 group-hover:bg-slate-300 dark:group-hover:bg-navy-600'}`}
                   style={{ height: `${Math.max(pct * 0.88, 6)}px` }} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-navy-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
                Rs. {d.fare.toLocaleString('en-IN')}
              </div>
            </div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{d.month}</span>
          </div>
        )
      })}
    </div>
  )
}

function DonutRing({ pct, color, size = 110 }) {
  const r = 24, cx = 32, cy = 32, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="-rotate-90">
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-navy-700" />
      <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth="6" stroke={color}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition:'stroke-dasharray 0.6s ease' }} />
    </svg>
  )
}

export default function Dashboard() {
  const { can, isAdmin, isManager } = useAuth()
  const navigate = useNavigate()

  // ── Async state ───────────────────────────────────────────
  const [bookings,    setBookings]    = useState([])
  const [customers,   setCustomers]   = useState([])
  const [allExpenses, setAllExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [todayAttendance, setTodayAttendance] = useState([])
  const [drivers,     setDrivers]     = useState([])
  const [vehicles,    setVehicles]    = useState([])
  const [fleetAlerts, setFleetAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErrors, setLoadErrors] = useState([])

  // Each source loads independently — one failing table/query must not
  // blank out the rest of the dashboard. Failures are surfaced in
  // loadErrors instead of being masked with mock/local fallback data.
  const reload = useCallback(async () => {
    setLoading(true)
    const results = await Promise.allSettled([
      loadBookings(),
      loadCustomers(),
      loadExpenses(),
      loadSettlements(),
      loadAttendanceToday(),
      loadDrivers(),
      loadVehicles(),
      fleetAlertRepository.getActiveAlerts({ limit: 50 }) // Get recent active alerts
    ])
    const [bks, cust, exps, stls, att, drv, veh, alerts] = results
    const errors = []

    setBookings(    bks.status === 'fulfilled' && Array.isArray(bks.value)  ? bks.value  : [])
    setCustomers(   cust.status === 'fulfilled' && Array.isArray(cust.value) ? cust.value.filter(c => !c._deleted) : [])
    setAllExpenses( exps.status === 'fulfilled' && Array.isArray(exps.value) ? exps.value : [])
    setSettlements( stls.status === 'fulfilled' && Array.isArray(stls.value) ? stls.value : [])
    setTodayAttendance(att.status === 'fulfilled' && Array.isArray(att.value) ? att.value : [])
    setDrivers(     drv.status === 'fulfilled' && Array.isArray(drv.value)  ? drv.value  : [])
    setVehicles(    veh.status === 'fulfilled' && Array.isArray(veh.value)  ? veh.value  : [])
    setFleetAlerts( alerts.status === 'fulfilled' && Array.isArray(alerts.value) ? alerts.value : [])

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const labels = ['bookings','customers','expenses','settlements','attendance','drivers','vehicles','fleetAlerts']
        console.error(`[Dashboard] failed to load ${labels[i]}:`, r.reason)
        errors.push(labels[i])
      }
    })
    setLoadErrors(errors)
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── Attendance derived ────────────────────────────────────
  const presentCount = todayAttendance.filter(a => a.status === 'present' || a.status === 'half-day').length
  const absentCount  = todayAttendance.filter(a => a.status === 'absent').length

  // ── Booking derived ───────────────────────────────────────
  const todayStr         = new Date().toISOString().slice(0, 10)
  const bookingToday     = bookings.filter(b => b.startDate === todayStr)
  const bookingActive    = bookings.filter(b => b.status === 'started')
  const bookingCompleted = bookings.filter(b => b.status === 'completed')
  const bookingCancelled = bookings.filter(b => b.status === 'cancelled')
  const bookingPending   = bookings.filter(b => ['draft','confirmed','assigned'].includes(b.status))

  // ── Vehicle derived (still from static mockData) ──────────
  const availableVehicles   = vehicles.filter(v => v.status === 'active').length
  const maintenanceVehicles = vehicles.filter(v => v.status === 'maintenance').length
  const vehicleDocAlerts    = vehicles.flatMap(v =>
    [
      { label:`${v.reg} Insurance`,  expiry: v.insExpiry    },
      { label:`${v.reg} Permit`,     expiry: v.permitExpiry },
      { label:`${v.reg} FC`,         expiry: v.fcExpiry     },
      { label:`${v.reg} PUC`,        expiry: v.pucExpiry    },
    ].filter(d => { const s = docStatus(d.expiry); return s.key === 'expired' || s.key === 'soon' })
     .map(d => ({ ...d, st: docStatus(d.expiry) }))
  )

  // ── Customer derived ──────────────────────────────────────
  const thisMonthStr       = new Date().toISOString().slice(0, 7)
  const newCustomersMonth  = customers.filter(c => c.createdAt?.startsWith(thisMonthStr)).length
  const corporateCustomers = customers.filter(c => c.type === 'corporate' || c.type === 'agent').length

  // ── Expense derived ───────────────────────────────────────
  const monthExpenses    = allExpenses.filter(e => isThisMonth(e))
  const monthExpTotal    = monthExpenses.reduce((s, e) => s + e.amount, 0)
  const pendingApprovals = allExpenses.filter(e => e.status === 'submitted').length
  const expByCategory    = summariseByType(monthExpenses).slice(0, 3)

  // ── Settlement derived ────────────────────────────────────
  const totalPayrollPaid = settlements
    .filter(s => s.status === 'paid')
    .reduce((sum, s) => sum + (s.netAmount || 0), 0)
  const settledPending  = settlements.filter(s => s.status === 'pending').length
  const settledApproved = settlements.filter(s => s.status === 'approved').length

  // ── Revenue KPIs ──────────────────────────────────────────
  const totalFare = bookings.reduce((s, b) => s + (b.fare  || 0), 0)
  const totalKm   = bookings.reduce((s, b) => s + (b.km    || 0), 0)
  const totalExp  = allExpenses.reduce((s, e) => s + (e.amount || 0), 0)
  const totalNet  = totalFare - totalExp
  const doneTrips    = bookingCompleted.length
  const pendingTrips = bookingPending.length

  // ── Monthly fare trend ────────────────────────────────────
  const monthlyFare = (() => {
    const now = new Date()
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d     = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key   = d.toISOString().slice(0, 7)
      const label = d.toLocaleDateString('en-IN', { month: 'short' })
      const fare  = bookings
        .filter(b => b.startDate?.startsWith(key))
        .reduce((s, b) => s + (b.fare || 0), 0)
      months.push({ month: label, fare })
    }
    return months
  })()

  // ── Recent trips ──────────────────────────────────────────
  const recentTrips = [...bookings]
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    .slice(0, 7)
    .map(b => ({
      id:          b.id,
      customer:    b.customer,
      date:        b.startDate,
      source:      b.pickup,
      destination: b.drop,
      driver:      b.driver || '—',
      km:          b.km  || 0,
      fare:        b.fare || 0,
      net:         (b.fare||0) - (b.toll||0) - (b.bata||0) - (b.petrol||0) - (b.parking||0) - (b.extras||0),
      status:      b.status,
    }))

  // ── Loading screen ────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-slate-200 dark:bg-navy-700 rounded-xl w-48" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-200 dark:bg-navy-700 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-slate-200 dark:bg-navy-700 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="h-64 bg-slate-200 dark:bg-navy-700 rounded-2xl" />
          <div className="h-64 bg-slate-200 dark:bg-navy-700 rounded-2xl" />
        </div>
        <div className="h-48 bg-slate-200 dark:bg-navy-700 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Dashboard"
        subtitle="Overview — May 2026"
        action={can('trips') ? <Button icon={Plus} variant="primary" onClick={() => navigate('/trips')}>New Booking</Button> : null}
      />

      {loadErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">
              Couldn't load {loadErrors.join(', ')}. Showing partial data — try refreshing.
            </p>
          </div>
          <button onClick={reload}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* ── KPI Stats ── */}
      {can('revenueDashboard') ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Fare"  value={`Rs. ${totalFare.toLocaleString('en-IN')}`}  sub={`${bookings.length} trips`}      icon={IndianRupee} gradient="bg-gradient-to-br from-navy-700 to-blue-600"    trend={8.4} trendUp={true}  />
          <StatCard label="Net Income"  value={`Rs. ${totalNet.toLocaleString('en-IN')}`}   sub="After trip costs"             icon={TrendingUp}  gradient="bg-gradient-to-br from-emerald-600 to-teal-500" trend={5.2} trendUp={true}  />
          <StatCard label="Total KM"    value={totalKm.toLocaleString('en-IN')}             sub="Kilometres covered"           icon={Car}         gradient="bg-gradient-to-br from-violet-600 to-purple-500"             />
          <StatCard label="Expenses"    value={`Rs. ${totalExp.toLocaleString('en-IN')}`}   sub={`${allExpenses.length} entries`} icon={Receipt}     gradient="bg-gradient-to-br from-amber-500 to-orange-500"  trend={2.1} trendUp={false} />
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Total Trips"   value={bookings.length}           sub="This month"          icon={Car}         gradient="bg-gradient-to-br from-navy-700 to-blue-600"    />
          <StatCard label="Bills Done"    value={doneTrips}                 sub="Invoices generated"  icon={CheckCircle} gradient="bg-gradient-to-br from-emerald-600 to-teal-500" />
          <StatCard label="Total KM"      value={totalKm.toLocaleString()}  sub="Kilometres covered"  icon={Car}         gradient="bg-gradient-to-br from-violet-600 to-purple-500" />
          <StatCard label="Pending Bills" value={pendingTrips}              sub="Awaiting invoice"    icon={Clock}       gradient="bg-gradient-to-br from-amber-500 to-orange-500"  />
        </div>
      )}

      {/* ── Booking Widgets ── */}
      {!can('revenueDashboard') === false || can('trips') ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Booking Management</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Booking Overview</h3>
            </div>
            <button onClick={() => navigate('/trips')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors flex items-center gap-1">
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label:'Total Bookings', value: bookings.length,         icon: BookOpen,    color:'text-navy-800 dark:text-blue-300',         bg:'bg-navy-50 dark:bg-navy-800/60',          onClick:()=>navigate('/trips') },
              { label:"Today's Trips",  value: bookingToday.length,     icon: CalendarCheck,color:'text-blue-600 dark:text-blue-400',        bg:'bg-blue-50 dark:bg-blue-900/20',          onClick:()=>navigate('/trips') },
              { label:'Active Trips',   value: bookingActive.length,    icon: Zap,         color:'text-amber-600 dark:text-amber-400',       bg:'bg-amber-50 dark:bg-amber-900/20',        onClick:()=>navigate('/trips') },
              { label:'Completed',      value: bookingCompleted.length, icon: CheckCircle, color:'text-emerald-600 dark:text-emerald-400',   bg:'bg-emerald-50 dark:bg-emerald-900/20',    onClick:()=>navigate('/trips') },
              { label:'Cancelled',      value: bookingCancelled.length, icon: XCircle,     color:'text-red-600 dark:text-red-400',           bg:'bg-red-50 dark:bg-red-900/20',            onClick:()=>navigate('/trips') },
            ].map(s => (
              <div key={s.label} onClick={s.onClick}
                className="glass-card rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-display font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Today's bookings quick list ── */}
      {bookingToday.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2.5">Today's Schedule</p>
          <div className="glass-card rounded-2xl overflow-hidden">
            {bookingToday.slice(0, 4).map((b, i) => {
              const typeCfg = TRIP_TYPE_CONFIG[b.type]
              const stCfg   = getStatusCfg(b.status)
              return (
                <div key={b.id} onClick={() => navigate('/trips')}
                  className="flex items-center gap-3 px-4 py-3 border-b border-slate-50 dark:border-navy-800 last:border-0 hover:bg-blue-50/40 dark:hover:bg-navy-800/40 transition-colors cursor-pointer">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${typeCfg?.gradient || 'from-slate-400 to-slate-500'} flex items-center justify-center text-sm flex-shrink-0`}>
                    {typeCfg?.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{b.customer}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                      {b.startTime && `${b.startTime} · `}{b.pickup}{b.drop ? ` → ${b.drop}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${stCfg.badge}`}>
                      <span className={`w-1 h-1 rounded-full ${stCfg.dot.replace(' animate-pulse','')}`} />
                      {stCfg.label}
                    </span>
                    {b.driver && <p className="text-[10px] text-slate-400">{b.driver}</p>}
                  </div>
                </div>
              )
            })}
            {bookingToday.length > 4 && (
              <div className="px-4 py-2.5 text-center">
                <button onClick={() => navigate('/trips')} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                  +{bookingToday.length - 4} more trips today →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pending assignments notice ── */}
      {bookingPending.filter(b => !b.driver).length > 0 && (isAdmin || isManager) && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <Users size={15} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {bookingPending.filter(b => !b.driver).length} trip{bookingPending.filter(b => !b.driver).length !== 1 ? 's' : ''} need driver assignment
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Confirmed bookings without a driver</p>
            </div>
          </div>
          <button onClick={() => navigate('/trips')}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Assign
          </button>
        </div>
      )}

      {/* ── Vehicle dashboard widgets ── */}
      {can('vehicles') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fleet Management</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Vehicle Overview</h3>
            </div>
            <button onClick={() => navigate('/vehicles')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:'Total Vehicles',  value: vehicles.length,       icon: Car,       color:'text-navy-800 dark:text-blue-300',         bg:'bg-navy-50 dark:bg-navy-800/60'        },
              { label:'Available',       value: availableVehicles,      icon: CheckCircle,color:'text-emerald-600 dark:text-emerald-400',  bg:'bg-emerald-50 dark:bg-emerald-900/20'  },
              { label:'Maintenance',     value: maintenanceVehicles,    icon: Wrench,    color:'text-red-600 dark:text-red-400',           bg:'bg-red-50 dark:bg-red-900/20'          },
              { label:'Doc Alerts',      value: vehicleDocAlerts.length,icon: AlertTriangle, color:'text-amber-600 dark:text-amber-400',  bg:'bg-amber-50 dark:bg-amber-900/20'      },
            ].map(s => (
              <div key={s.label} onClick={() => navigate('/vehicles')}
                className="glass-card rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-display font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Vehicle doc expiry alert ── */}
      {vehicleDocAlerts.length > 0 && can('vehicles') && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {vehicleDocAlerts.length} vehicle document{vehicleDocAlerts.length !== 1 ? 's' : ''} need attention
              </p>
            </div>
            <button onClick={() => navigate('/vehicles')}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
              Review
            </button>
          </div>
          <div className="space-y-1.5">
            {vehicleDocAlerts.slice(0, 4).map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 truncate">{a.label}</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${a.st.badge}`}>{a.st.label}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-500 font-mono">{a.expiry}</span>
                </div>
              </div>
            ))}
            {vehicleDocAlerts.length > 4 && (
              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-semibold pt-1">
                +{vehicleDocAlerts.length - 4} more — view all in Vehicles
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Mini stat chips ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Bills Done',    value: doneTrips,       icon: CheckCircle, color:'text-emerald-500', bg:'bg-emerald-50 dark:bg-emerald-900/20' },
          { label:'Pending Bills', value: pendingTrips,    icon: Clock,       color:'text-amber-500',   bg:'bg-amber-50 dark:bg-amber-900/20'     },
          { label:'Drivers',       value: drivers.length,  icon: Users,       color:'text-blue-500',    bg:'bg-blue-50 dark:bg-blue-900/20'       },
          { label:'Vehicles',      value: vehicles.length, icon: Fuel,        color:'text-violet-500',  bg:'bg-violet-50 dark:bg-violet-900/20'   },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-4 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={18} className={s.color} />
            </div>
            <div>
              <p className="text-2xl font-display font-black text-slate-800 dark:text-white leading-none">{s.value}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Customer dashboard widgets — Module 8 ── */}
      {can('customers') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Customer Management</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Customer Overview</h3>
            </div>
            <button onClick={() => navigate('/customers')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:'Total Customers',   value: customers.length,         icon: Users,       color:'text-navy-800 dark:text-blue-300',        bg:'bg-navy-50 dark:bg-navy-800/60'       },
              { label:'Active',            value: customers.filter(c=>c.status==='active').length, icon: CheckCircle, color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50 dark:bg-emerald-900/20' },
              { label:'Corporate / Agent', value: corporateCustomers,       icon: Users,       color:'text-violet-600 dark:text-violet-400',    bg:'bg-violet-50 dark:bg-violet-900/20'   },
              { label:'New This Month',    value: newCustomersMonth,         icon: Plus,        color:'text-blue-600 dark:text-blue-400',        bg:'bg-blue-50 dark:bg-blue-900/20'       },
            ].map(s => (
              <div key={s.label} onClick={() => navigate('/customers')}
                className="glass-card rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-display font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Payroll widgets — Module 3 ── */}
      {can('payroll') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Payroll & Settlements</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Driver Salary</h3>
            </div>
            <button onClick={() => navigate('/payroll')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
              View all →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:'Total Paid',        value:`Rs.${(totalPayrollPaid/1000).toFixed(1)}k`, color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50 dark:bg-emerald-900/20' },
              { label:'Pending Approval',  value: settledPending,                             color:'text-blue-600 dark:text-blue-400',       bg:'bg-blue-50 dark:bg-blue-900/20'       },
              { label:'Approved (Unpaid)', value: settledApproved,                            color:'text-violet-600 dark:text-violet-400',   bg:'bg-violet-50 dark:bg-violet-900/20'   },
              { label:'Total Settlements', value: settlements.length,                         color:'text-navy-800 dark:text-blue-300',       bg:'bg-navy-50 dark:bg-navy-800/60'       },
            ].map(s => (
              <div key={s.label} onClick={() => navigate('/payroll')}
                className="glass-card rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <IndianRupee size={16} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-display font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
          {(settledPending > 0 || settledApproved > 0) && (
            <div className="flex items-center justify-between gap-3 bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800/30 rounded-2xl px-4 py-3 mt-3">
              <p className="text-sm font-bold text-violet-700 dark:text-violet-400">
                {settledPending > 0 && `${settledPending} settlement${settledPending!==1?'s':''} awaiting approval`}
                {settledPending > 0 && settledApproved > 0 && ' · '}
                {settledApproved > 0 && `${settledApproved} approved — ready to pay`}
              </p>
              <button onClick={() => navigate('/payroll')}
                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
                Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Expense widgets — Module 9 ── */}
      {can('expenses') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Expense Management</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">This Month</h3>
            </div>
            <button onClick={() => navigate('/expenses')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
              View all →
            </button>
          </div>

          {/* KPI chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[
              { label:'Month Total',    value:`Rs. ${(monthExpTotal/1000).toFixed(1)}k`, icon:TrendingDown, color:'text-amber-600 dark:text-amber-400', bg:'bg-amber-50 dark:bg-amber-900/20' },
              { label:'Entries',        value: monthExpenses.length,                    icon:Receipt,      color:'text-slate-600 dark:text-slate-300', bg:'bg-slate-50 dark:bg-navy-800/60'  },
              { label:'Pending Approval',value: pendingApprovals,                       icon:Clock,        color:'text-blue-600 dark:text-blue-400',   bg:'bg-blue-50 dark:bg-blue-900/20'   },
              { label:'Categories',     value: expByCategory.length,                   icon:Filter,       color:'text-violet-600 dark:text-violet-400',bg:'bg-violet-50 dark:bg-violet-900/20'},
            ].map(s => (
              <div key={s.label} onClick={() => navigate('/expenses')}
                className="glass-card rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 cursor-pointer">
                <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                  <s.icon size={16} className={s.color} />
                </div>
                <div className="min-w-0">
                  <p className={`text-xl font-display font-black leading-none ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Top 3 categories this month */}
          {expByCategory.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">Top Categories This Month</p>
              <div className="space-y-2.5">
                {expByCategory.map(t => {
                  const pct = Math.round((t.total / monthExpTotal) * 100)
                  return (
                    <div key={t.key}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
                          <span>{t.icon}</span>{t.label}
                        </span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          Rs. {t.total.toLocaleString('en-IN')} <span className="text-slate-400 font-normal">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${t.color}`}
                          style={{ width: `${pct}%`, transition:'width .5s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending approval alert */}
          {pendingApprovals > 0 && (
            <div className="flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/30 rounded-2xl px-4 py-3 mt-3">
              <div className="flex items-center gap-2.5">
                <Receipt size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
                  {pendingApprovals} expense{pendingApprovals!==1?'s':''} awaiting your approval
                </p>
              </div>
              <button onClick={() => navigate('/expenses')}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
                Review
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Attendance strip ── */}
      {can('attendance') && (
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CalendarCheck size={16} className="text-navy-700 dark:text-blue-400" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Today's Attendance</p>
            </div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date().toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short' })}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label:'Present',  value: presentCount, dot:'bg-emerald-500', text:'text-emerald-600 dark:text-emerald-400' },
              { label:'Absent',   value: absentCount,  dot:'bg-red-500',     text:'text-red-600 dark:text-red-400' },
              { label:'On Leave', value: todayAttendance.filter(a=>a.status==='leave').length,    dot:'bg-amber-500', text:'text-amber-600 dark:text-amber-400' },
              { label:'Half Day', value: todayAttendance.filter(a=>a.status==='half-day').length, dot:'bg-blue-500',  text:'text-blue-600 dark:text-blue-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1"><span className={`w-2 h-2 rounded-full ${s.dot}`} /></div>
                <p className={`text-xl font-display font-black ${s.text}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {can('revenueDashboard') ? (
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Fare</p>
                <p className="text-lg font-display font-black text-slate-800 dark:text-white">6-month trend</p>
              </div>
              <span className="badge badge-active">May</span>
            </div>
            <BarChart data={monthlyFare} />
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-navy-700 flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Total (May)</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">Rs. {totalFare.toLocaleString('en-IN')}</span>
            </div>
          </div>
        ) : (
          <AccessBlocked label="Revenue Chart" />
        )}

        {can('profitReports') ? (
          <div className="glass-card rounded-2xl p-5 flex flex-col">
            <div className="mb-4">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Profit Breakdown</p>
              <p className="text-lg font-display font-black text-slate-800 dark:text-white">Income vs Costs</p>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="relative">
                <DonutRing pct={totalFare > 0 ? Math.round((totalNet / totalFare) * 100) : 0} color="#10b981" />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-xl font-display font-black text-slate-800 dark:text-white">{totalFare > 0 ? Math.round((totalNet / totalFare) * 100) : 0}%</p>
                  <p className="text-[10px] text-slate-400">margin</p>
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {[
                { label:'Trip Revenue', amt:totalFare, color:'bg-blue-500'    },
                { label:'Net Income',   amt:totalNet,  color:'bg-emerald-500' },
                { label:'Expenses',     amt:totalExp,  color:'bg-amber-500'   },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-full ${r.color}`} /><span className="text-slate-500 dark:text-slate-400">{r.label}</span></div>
                  <span className="font-bold text-slate-700 dark:text-slate-200">Rs. {r.amt.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <AccessBlocked label="Profit Reports" />
        )}

        {/* Driver pay — always visible */}
        <div className="glass-card rounded-2xl p-5">
          <div className="mb-4">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Driver Stats</p>
            <p className="text-lg font-display font-black text-slate-800 dark:text-white">Pay summary</p>
          </div>
          <div className="space-y-4">
            {drivers.map(d => {
              const driverTrips = bookings.filter(t => t.driver === d.name)
              const farePct     = totalFare > 0 ? Math.round((driverTrips.reduce((s,t) => s+(t.fare||0),0) / totalFare) * 100) : 0
              const driverCost  = allExpenses.filter(e => e.driver === d.name).reduce((s, e) => s + (e.amount || 0), 0)
              return (
                <div key={d.id}>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <Avatar name={d.name} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{d.name}</p>
                      <p className="text-[10px] text-slate-400">{driverTrips.length} trips</p>
                    </div>
                    {can('financialAnalytics') && (
                      <p className="text-xs font-bold text-red-500">Rs. {driverCost.toLocaleString('en-IN')}</p>
                    )}
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full" style={{ width: `${farePct}%` }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">{farePct}% of total fare</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Live Fleet Board ── */}
      {(isAdmin || isManager) && (
        <div>
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Operations</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Live Fleet</h3>
          </div>
          <LiveFleetBoard />
        </div>
      )}

      {/* ── Fleet Alerts ── */}
      {can('fleetAlerts') && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Fleet Alerts</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Active Alerts</h3>
            </div>
            <button onClick={() => navigate('/fleet/alerts')}
              className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
              View All →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {/* Alert Statistics */}
            <div className="glass-card rounded-2xl p-4">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Critical Alerts</p>
                <p className="text-2xl font-display font-black text-red-600">
                  {fleetAlerts.filter(a => a.priority === 'critical' && a.status !== 'resolved' && a.status !== 'closed').length}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">High Priority Alerts</p>
                <p className="text-2xl font-display font-black text-amber-600">
                  {fleetAlerts.filter(a => a.priority === 'high' && a.status !== 'resolved' && a.status !== 'closed').length}
                </p>
              </div>
            </div>
            <div className="glass-card rounded-2xl p-4">
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Total Active Alerts</p>
                <p className="text-2xl font-display font-black text-slate-600">
                  {fleetAlerts.filter(a => a.status !== 'resolved' && a.status !== 'closed').length}
                </p>
              </div>
            </div>
          </div>
          {/* Recent Alerts List */}
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Recent Alerts</h3>
              <button onClick={() => navigate('/fleet/alerts')}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
                View All
              </button>
            </div>
            {fleetAlerts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-slate-500 dark:text-slate-400">No active alerts</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fleetAlerts.slice(0, 5).map((alert, index) => {
                  const priority = alert?.priority || 'medium'
                  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1)
                  return (
                  <div key={alert?.id || index} className={`border-l-4 ${priority === 'critical' ? 'border-red-500' : priority === 'high' ? 'border-amber-500' : 'border-blue-500'} p-3 mb-2 rounded-lg bg-slate-50 dark:bg-navy-800/20`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                          {alert?.title || 'Fleet alert'}
                        </p>
                        <p className="text-[9px] text-slate-500 dark:text-slate-400">
                          {alert?.vehicle_id ?
                            (String(alert.vehicle_id).substring(0, 8) + '...') :
                            'Unknown Vehicle'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${priority === 'critical' ? 'bg-red-100 text-red-800' : priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                          {priorityLabel}
                        </span>
                        <span className="text-[9px] text-slate-500">
                          {alert?.detected_at ? new Date(alert.detected_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                        </span>
                      </div>
                    </div>
                  </div>
                )})}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Recent Activity (Audit Log) ── */}
      {(isAdmin || isManager) && (() => {
        const recentActivity = loadRecentActivity(8)
        if (recentActivity.length === 0) return null
        return (
          <div>
            <div className="mb-3">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Audit Trail</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Recent Activity</h3>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-navy-700/60">
                {recentActivity.map(ev => (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-base flex-shrink-0">{ev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{ev.label}</p>
                      {ev.description && <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{ev.description}</p>}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 flex-shrink-0">{fmtAuditTime(ev.timestamp)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Recent trips table ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Recent Activity</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">Latest Trips</h3>
          </div>
          <Button icon={FileText} variant="outline" size="sm" onClick={() => navigate('/trips')}>View All</Button>
        </div>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/80 dark:bg-navy-800/50">
                  {['Customer','Route','Driver','KM',
                    ...(can('revenueDashboard') ? ['Fare','Net'] : []),
                    'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentTrips.map(t => (
                  <tr key={t.id} className="border-b border-slate-50 dark:border-navy-800 hover:bg-blue-50/40 dark:hover:bg-navy-800/50 transition-colors cursor-pointer" onClick={() => navigate('/trips')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={t.customer} size={28} />
                        <div>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{t.customer}</p>
                          <p className="text-[10px] text-slate-400">{t.date}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{t.source} <span className="text-slate-300 dark:text-slate-500 mx-1">→</span> {t.destination}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{t.driver}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{t.km} km</td>
                    {can('revenueDashboard') && <>
                      <td className="px-4 py-3 text-xs font-bold text-navy-800 dark:text-blue-300 whitespace-nowrap">Rs. {t.fare.toLocaleString('en-IN')}</td>
                      <td className="px-4 py-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Rs. {t.net.toLocaleString('en-IN')}</td>
                    </>}
                    <td className="px-4 py-3"><Badge status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
