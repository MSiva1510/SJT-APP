import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Navigation, IndianRupee, Clock, Car, CheckCircle,
  AlertTriangle, History, List, Phone,
  MapPin, ChevronRight, Star, Calendar, Gauge,
  Signal, WifiOff, Zap,
} from 'lucide-react'
import { useAuth }  from '../../context/AuthContext'
import { useRideLifecycleContext } from '../../context/RideLifecycleContext'
import {
  TODAY_DAY, DRIVER_STATUSES, TRIP_STATUS_CFG,
  TRIP_TYPES, getTodayStats, getDriverProfile, getDriverVehicle,
} from '../../data/driverData'
import { loadBookings } from '../../data/tripTypes'
import { getCurrentVehicleForDriver } from '../../data/attendanceData'
import {
  useGPS,
  loadActiveRideGPS, saveActiveRideGPS, clearActiveRideGPS,
  appendGPSHistory,
} from '../../hooks/useGPS'
import { RIDE_STATES, RIDE_STATE_CFG, loadRideHistory } from '../../hooks/useRideLifecycle'
import Avatar                from '../../components/ui/Avatar'
import GPSStatusCard         from '../../components/gps/GPSStatusCard'
import { GPSChip }           from '../../components/gps/GPSStatusCard'
import LocationPinCard       from '../../components/gps/LocationPinCard'
import ActiveTripCard        from '../../components/ride/ActiveTripCard'
import { StartRideButton }   from '../../components/ride/RideLifecycleControls'
import ModalOverlay from '../../components/ui/ModalOverlay'
// ─────────────────────────────────────────────────────────────
//  Shared sub-components
// ─────────────────────────────────────────────────────────────
function StatWidget({ icon: Icon, label, value, sub, gradient, pulse, highlight }) {
  return (
    <div className={`glass-card rounded-2xl p-3.5 relative overflow-hidden ${highlight ? 'ring-2 ring-blue-400/40' : ''}`}>
      <div className={`absolute -top-5 -right-5 w-16 h-16 rounded-full opacity-15 blur-xl ${gradient}`} />
      <div className={`w-8 h-8 rounded-xl ${gradient} flex items-center justify-center mb-2 relative z-10`}>
        <Icon size={15} className="text-white" />
        {pulse && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white dark:border-navy-800 animate-pulse" />}
      </div>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none mb-1 relative z-10">{label}</p>
      <p className="text-xl font-display font-black text-slate-800 dark:text-white leading-tight relative z-10">{value}</p>
      {sub && <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 relative z-10">{sub}</p>}
    </div>
  )
}

function TripStatusPill({ status }) {
  // Map legacy 'driving' → 'started' for display
  const mapped = status === 'driving' ? 'started' : status
  const cfg = RIDE_STATE_CFG[mapped] || TRIP_STATUS_CFG[status] || TRIP_STATUS_CFG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg || cfg.badge} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function QuickAction({ icon: Icon, label, sub, color, onClick, danger, badge }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border transition-all duration-200 active:scale-95 text-center w-full relative
        ${danger
          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30'
          : 'glass-card hover:shadow-lg hover:-translate-y-0.5'}`}>
      {badge && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className={`text-xs font-bold leading-tight ${danger ? 'text-red-700 dark:text-red-400' : 'text-slate-700 dark:text-slate-200'}`}>{label}</p>
        {sub && <p className={`text-[10px] mt-0.5 ${danger ? 'text-red-500' : 'text-slate-400 dark:text-slate-500'}`}>{sub}</p>}
      </div>
    </button>
  )
}

function StatusModal({ current, onSelect, onClose }) {
  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-80 bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl z-10 animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mb-4 sm:hidden" />
        <h3 className="font-display font-black text-slate-800 dark:text-white text-base mb-1">Set Your Status</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Let dispatch know your availability</p>
        <div className="space-y-2">
          {DRIVER_STATUSES.map(s => (
            <button key={s.key} onClick={() => { onSelect(s.key); onClose() }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all
                ${current === s.key
                  ? `ring-2 ${s.ring} border-transparent bg-slate-50 dark:bg-navy-800`
                  : 'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/50 hover:bg-slate-50 dark:hover:bg-navy-800'}`}>
              <span className={`w-3 h-3 rounded-full flex-shrink-0 ${s.dot} ${current === s.key ? 'animate-pulse' : ''}`} />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.label}</span>
              {current === s.key && <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500">Current</span>}
            </button>
          ))}
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Pending trip card (no active ride) ────────────────────────
function PendingTripCard({ trip, onStart, isNext }) {
  const typeLabel = TRIP_TYPES[trip.tripType] || trip.tripType
  return (
    <div className={`glass-card rounded-2xl overflow-hidden ${isNext ? 'ring-2 ring-blue-400/60 shadow-lg shadow-blue-500/10' : ''}`}>
      <div className={`px-4 pt-3.5 pb-2.5 flex items-center justify-between gap-2 ${isNext ? 'bg-blue-50/80 dark:bg-blue-900/20' : ''}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex flex-col items-center justify-center ${isNext ? 'bg-blue-600' : 'bg-navy-900 dark:bg-navy-800'}`}>
            <span className="text-[9px] font-bold text-blue-300 uppercase leading-none">{trip.scheduledTime.split(' ')[1]}</span>
            <span className="text-sm font-black text-white leading-tight">{trip.scheduledTime.split(' ')[0]}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {isNext && <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded-full uppercase">Next up</span>}
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">{typeLabel}</span>
            </div>
            <p className="font-bold text-slate-800 dark:text-white text-sm leading-tight truncate">{trip.customer}</p>
          </div>
        </div>
        <TripStatusPill status={trip.status} />
      </div>

      <div className="px-4 pb-3 pt-1">
        <div className="flex items-stretch gap-2.5 mb-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
            <div className="flex-1 w-0.5 border-l border-dashed border-slate-300 dark:border-navy-600 min-h-[14px]" />
            <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div>
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Pickup</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{trip.pickup}</p>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Drop</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight truncate">{trip.drop}</p>
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-base font-black text-navy-800 dark:text-blue-300">Rs. {trip.fare.toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-slate-400">{trip.km} km</p>
          </div>
        </div>

        {trip.notes && (
          <div className="flex items-start gap-1.5 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-2.5 py-1.5 mb-3">
            <AlertTriangle size={10} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium leading-tight">{trip.notes}</p>
          </div>
        )}

        {trip.status === 'completed' && (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl px-3 py-2 mb-3">
            <CheckCircle size={12} className="text-emerald-500 flex-shrink-0" />
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">Completed · {trip.startTime} – {trip.endTime}</span>
            {trip.duration && <span className="ml-auto text-[10px] font-bold text-emerald-600 dark:text-emerald-400">{trip.duration}</span>}
          </div>
        )}

        <div className="flex gap-2">
          <a href={`tel:${trip.contact}`}
             className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
            <Phone size={12} /> Call
          </a>
          {trip.status === 'pending' && onStart && (
            <StartRideButton onStart={() => onStart(trip.tripId)} fullWidth label="Start Ride" />
          )}
          {trip.status === 'completed' && (
            <div className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
              <CheckCircle size={12} /> Done
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── GPS area widget ────────────────────────────────────────────
function AreaWidget({ label, area, gradient, icon: Icon }) {
  return (
    <div className="glass-card rounded-2xl p-3.5 relative overflow-hidden col-span-2">
      <div className={`absolute -top-5 -right-5 w-16 h-16 rounded-full opacity-15 blur-xl ${gradient}`} />
      <div className={`w-8 h-8 rounded-xl ${gradient} flex items-center justify-center mb-2 relative z-10`}>
        <Icon size={15} className="text-white" />
      </div>
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none mb-1 relative z-10">{label}</p>
      <p className="text-sm font-display font-black text-slate-800 dark:text-white leading-tight relative z-10 truncate">{area || '—'}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main DriverDashboard
// ─────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  const [bookings, setBookings] = useState([])
  useEffect(() => {
    loadBookings().then(b => setBookings(Array.isArray(b) ? b : []))
  }, [])

  const { user }     = useAuth()
  const navigate     = useNavigate()
  const gps          = useGPS()

  // Ride lifecycle from context (shared across all driver pages)
  const {
    activeRide, rideState, elapsed, elapsedFmt,
    isActive, isStarted, isPaused,
    startRide, pauseRide, resumeRide, endRide, cancelRide,
    onRideStart, onRidePause, onRideResume, onRideEnd,
  } = useRideLifecycleContext()

  const driverKey  = user?.username?.toLowerCase() || ''
  const driverName = user?.name || ''

  const [profile, setProfile] = useState(null)
  useEffect(() => {
    if (!driverName) return
    getDriverProfile(driverName)
      .then(setProfile)
      .catch(err => console.error('[DriverDashboard] load profile failed:', err))
  }, [driverName])

  // ── Module 1 (Day 20.5): resolve REAL manager assignment first.
  const [liveAssignment, setLiveAssignment] = useState(null)
  useEffect(() => {
    if (!driverName) return
    getCurrentVehicleForDriver(driverName)
      .then(setLiveAssignment)
      .catch(err => console.error('[DriverDashboard] load vehicle assignment failed:', err))
  }, [driverName])
  const assignedVehicleReg = liveAssignment?.vehicleReg || user?.vehicle || null
  const hasVehicleAssigned = !!assignedVehicleReg

  const [vehicle, setVehicle] = useState(null)
  useEffect(() => {
    if (!assignedVehicleReg) { setVehicle(null); return }
    getDriverVehicle(assignedVehicleReg)
      .then(setVehicle)
      .catch(err => console.error('[DriverDashboard] load vehicle failed:', err))
  }, [assignedVehicleReg])

  // Confirmation prompt: shown once per fresh assignment, ack'd via localStorage
  const vehicleAckKey = `sjt_vehicle_ack_${driverKey}_${liveAssignment?.assignedAt || ''}`
  const [vehicleConfirmed, setVehicleConfirmed] = useState(() => {
    if (!liveAssignment) return true // no live assignment to confirm — nothing to gate
    try { return localStorage.getItem(vehicleAckKey) === '1' } catch { return false }
  })
  const confirmVehicleAssignment = useCallback(() => {
    try { localStorage.setItem(vehicleAckKey, '1') } catch {}
    setVehicleConfirmed(true)
  }, [vehicleAckKey])

  // Load today's trips from real bookings (same logic as AssignedTrips)
  const todayISO  = new Date().toISOString().slice(0, 10)
  const todayBase = bookings.filter(b =>
    b.driver?.toLowerCase() === driverName.toLowerCase() &&
    b.startDate === todayISO &&
    b.status !== 'cancelled'
  )
    .map(b => ({
      tripId:        b.id,
      customer:      b.customer,
      contact:       b.contact || '',
      pickup:        b.pickup  || '',
      drop:          b.drop    || '',
      tripType:      b.type    || 'one_way',
      scheduledTime: b.startTime
        ? new Date(`${b.startDate}T${b.startTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—',
      status:  b.status === 'started' ? 'driving'
             : b.status === 'completed' ? 'completed'
             : 'pending',
      fare:    b.fare  || 0,
      km:      b.km    || 0,
      notes:   b.notes || '',
    }))

  const stats      = getTodayStats(driverName)
  const rideHistory = loadRideHistory()
  const todayHistoryCount = rideHistory.filter(r => {
    if (!r.startedAt) return false
    const d = new Date(r.startedAt)
    const now = new Date()
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth()
  }).length

  // ── Local trip list state ──────────────────────────────────
  const [trips,           setTrips]           = useState(() => {
    // If lifecycle context has an active ride, mark that tripId as started
    if (activeRide?.tripId) {
      return todayBase.map(t =>
        t.tripId === activeRide.tripId ? { ...t, status: 'driving' } : t
      )
    }
    return todayBase
  })
  const [driverStatus,    setDriverStatus]    = useState(() => isActive ? 'driving' : 'available')
  const [showStatusModal, setShowStatusModal] = useState(false)

  // ── GPS active ride ────────────────────────────────────────
  const [activeRideGPS,   setActiveRideGPS]   = useState(() => loadActiveRideGPS())

  const nextTrip    = trips.find(t => t.status === 'pending')
  const completedTrips = trips.filter(t => t.status === 'completed' || t.status === 'done')
  const curStatus   = DRIVER_STATUSES.find(s => s.key === driverStatus)

  // Sync driverStatus when lifecycle changes
  useEffect(() => {
    if (isActive) setDriverStatus('driving')
    else          setDriverStatus(prev => prev === 'driving' ? 'available' : prev)
  }, [isActive])

  // ── Start Ride — lifecycle + GPS ───────────────────────────
  const handleStartRide = useCallback(async (tripId) => {
    const trip = trips.find(t => t.tripId === tripId)
    if (!trip || isActive) return

    // 1. Start lifecycle
    const enrichedTrip = { ...trip, vehicle: user?.vehicle || '' }
    const ride = startRide(enrichedTrip, user?.id || driverName)

    // 2. GPS hook point — capture start location
    const startCoord = await gps.requestCurrent()
    const rideGPS = {
      tripId,
      customer:     trip.customer,
      startCoord:   startCoord || null,
      startTime:    new Date().toISOString(),
      endCoord:     null,
      endTime:      null,
      currentCoord: startCoord || null,
    }
    setActiveRideGPS(rideGPS)
    saveActiveRideGPS(rideGPS)
    onRideStart(ride)

    // 3. Update local trip status
    setTrips(prev => prev.map(t =>
      t.tripId === tripId ? { ...t, status: 'driving' } : t
    ))
    setDriverStatus('driving')
  }, [trips, isActive, startRide, user, driverName, gps, onRideStart])

  // ── Pause Ride ─────────────────────────────────────────────
  const handlePauseRide = useCallback(() => {
    pauseRide()
    onRidePause(activeRide)
  }, [pauseRide, onRidePause, activeRide])

  // ── Resume Ride ────────────────────────────────────────────
  const handleResumeRide = useCallback(() => {
    resumeRide()
    onRideResume(activeRide)
  }, [resumeRide, onRideResume, activeRide])

  // ── End Ride — lifecycle + GPS ─────────────────────────────
  const handleEndRide = useCallback(async () => {
    // 1. GPS hook point — capture end location
    const endCoord = await gps.requestCurrent()
    const now = new Date()

    if (activeRideGPS) {
      const completedGPS = { ...activeRideGPS, endCoord, endTime: now.toISOString(), currentCoord: endCoord }
      const startMs    = activeRideGPS.startTime ? new Date(activeRideGPS.startTime).getTime() : null
      const durationMs = startMs ? now.getTime() - startMs : null
      const durationStr = durationMs
        ? (() => { const m = Math.floor(durationMs / 60000); const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m` })()
        : elapsedFmt
      appendGPSHistory({ ...completedGPS, duration: durationStr, completedAt: now.toISOString() })
    }
    clearActiveRideGPS()
    setActiveRideGPS(null)

    // 2. End lifecycle
    const result = endRide()
    onRideEnd(activeRide)

    // 3. Update local trip
    const tripId = activeRide?.tripId
    setTrips(prev => prev.map(t =>
      t.tripId === tripId
        ? { ...t, status: 'completed', endTime: now.toLocaleTimeString(), duration: result?.duration || elapsedFmt }
        : t
    ))
    setDriverStatus('available')
  }, [activeRideGPS, activeRide, endRide, onRideEnd, gps, elapsedFmt])

  // ── Cancel Ride ────────────────────────────────────────────
  const handleCancelRide = useCallback(() => {
    if (!window.confirm('Cancel this ride? This action cannot be undone.')) return
    const tripId = activeRide?.tripId
    cancelRide('Driver cancelled')
    clearActiveRideGPS()
    setActiveRideGPS(null)
    setTrips(prev => prev.map(t =>
      t.tripId === tripId ? { ...t, status: 'pending' } : t
    ))
    setDriverStatus('available')
  }, [activeRide, cancelRide])

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const startArea   = activeRideGPS?.startCoord?.area
  const currentArea = gps.currentCoord?.area || activeRideGPS?.currentCoord?.area

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-up pb-6">

      {/* ── Welcome card ── */}
      <div className="glass-card rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl bg-gradient-to-br from-blue-500 to-teal-400" />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar name={driverName} size={48} />
                <span className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white dark:border-navy-800 ${curStatus?.dot}`} />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{greeting}</p>
                <h2 className="font-display font-black text-slate-800 dark:text-white text-lg leading-tight">{driverName}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Driver · {user?.vehicleType || '4+1 Sedan'}</p>
              </div>
            </div>
            <button onClick={() => setShowStatusModal(true)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 border-transparent transition-all ${curStatus?.badge}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${curStatus?.dot} ${isActive ? 'animate-pulse' : ''}`} />
              <span className="text-xs font-bold whitespace-nowrap">{curStatus?.label}</span>
            </button>
          </div>
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <Calendar size={12} /><span>{TODAY_DAY}</span>
            </div>
            <div className="flex items-center gap-2">
              <GPSChip status={gps.status} coord={gps.currentCoord} onRefresh={gps.requestCurrent} loading={gps.loading} />
              <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">
                <Star size={11} className="text-amber-500 fill-amber-500" />
                <span className="text-amber-700 dark:text-amber-400 font-bold text-[11px]">{profile?.rating ?? 4.8}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Module 1 (Day 20.5): vehicle assignment gate ────────
          Driver cannot proceed without a manager-assigned vehicle.
          If freshly assigned, show a one-time confirmation prompt. */}
      {!hasVehicleAssigned && (
        <div className="glass-card rounded-2xl p-4 border-2 border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">No vehicle assigned.</p>
            <p className="text-xs text-red-500 dark:text-red-400/80 mt-0.5">Contact your manager to get a vehicle assigned before starting trips.</p>
          </div>
        </div>
      )}

      {hasVehicleAssigned && liveAssignment && !vehicleConfirmed && (
        <div className="glass-card rounded-2xl p-4 border-2 border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10 flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
            <Car size={18} className="text-blue-500" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">Vehicle assigned: {liveAssignment.vehicleReg}</p>
            <p className="text-xs text-blue-500 dark:text-blue-400/80 mt-0.5">{liveAssignment.vehicleModel || liveAssignment.vehicleType} · Please confirm to proceed</p>
          </div>
          <button onClick={confirmVehicleAssignment}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex-shrink-0">
            <CheckCircle size={13} /> Confirm Vehicle
          </button>
        </div>
      )}

      {/* ── Active Ride Card (lifecycle-aware) ── */}
      {isActive && activeRide && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 px-0.5">Active Ride</p>
          <ActiveTripCard
            ride={activeRide}
            elapsed={elapsed}
            rideState={rideState}
            onPause={handlePauseRide}
            onResume={handleResumeRide}
            onEnd={handleEndRide}
            onCancel={handleCancelRide}
          />
        </div>
      )}

      {/* ── GPS area widgets ── */}
      {(startArea || currentArea) && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 px-0.5">GPS Tracking</p>
          <div className="grid grid-cols-2 gap-2.5">
            {startArea   && <AreaWidget label="Start Area"   area={startArea}   gradient="bg-gradient-to-br from-emerald-600 to-teal-500"  icon={MapPin}      />}
            {currentArea && <AreaWidget label="Current Area" area={currentArea} gradient="bg-gradient-to-br from-blue-600 to-indigo-600"   icon={Navigation} />}
          </div>
        </div>
      )}

      {/* ── Today's stats ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 px-0.5">Today's Summary</p>
        <div className="grid grid-cols-2 gap-2.5">
          <StatWidget icon={Navigation}  label="Trips Today"    value={trips.length}                sub={`${completedTrips.length} completed`}  gradient="bg-gradient-to-br from-navy-700 to-blue-600" />
          <StatWidget icon={IndianRupee} label="Earnings Today" value={`Rs. ${stats.earningsToday.toLocaleString('en-IN')}`} sub="Bata + expenses" gradient="bg-gradient-to-br from-emerald-600 to-teal-500" pulse />
          <StatWidget icon={Clock}       label="Working Hours"  value={`${stats.hoursOnRoad}h`}     sub="Active drive time"                     gradient="bg-gradient-to-br from-violet-600 to-purple-500" />
          <StatWidget icon={Zap}         label="Active Ride"    value={isActive ? elapsedFmt : '—'} sub={isActive ? (isPaused ? 'Paused' : 'Running') : 'No active ride'} gradient="bg-gradient-to-br from-blue-500 to-cyan-500" highlight={isActive} />
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 px-0.5">Quick Actions</p>
        <div className="grid grid-cols-2 gap-2.5">
          <QuickAction icon={Signal}        label="Live Location"  sub={gps.status === 'granted' ? currentArea || 'GPS active' : 'Tap to track'} color="bg-gradient-to-br from-teal-600 to-cyan-500"    onClick={() => navigate('/live-location')} badge={gps.status === 'granted'} />
          <QuickAction icon={List}          label="Assigned Trips" sub={`${trips.length} trips today`} color="bg-gradient-to-br from-violet-600 to-purple-500" onClick={() => navigate('/assigned-trips')} />
          <QuickAction icon={History}       label="Ride History"   sub={`${todayHistoryCount} completed today`} color="bg-gradient-to-br from-blue-600 to-indigo-600"   onClick={() => navigate('/ride-history')} />
          <QuickAction icon={AlertTriangle} label="Emergency"      sub="SOS — Contact office" color="bg-gradient-to-br from-red-600 to-rose-500" onClick={() => window.confirm('Call Sri Jayam Travels?\n+91 94423 37470') && window.open('tel:+919442337470')} danger />
        </div>
      </div>

      {/* ── Today's schedule ── */}
      <div>
        <div className="flex items-center justify-between mb-2.5 px-0.5">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Today's Schedule</p>
            <p className="font-display font-black text-slate-800 dark:text-white text-sm">{trips.length} trips assigned</p>
          </div>
          <button onClick={() => navigate('/assigned-trips')}
                  className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">
            View all <ChevronRight size={13} />
          </button>
        </div>
        {trips.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <Car size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-semibold text-slate-500 dark:text-slate-400 text-sm">No trips assigned for today</p>
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip, i) => (
              <PendingTripCard
                key={trip.tripId}
                trip={trip}
                onStart={!isActive ? handleStartRide : null}
                isNext={trip.status === 'pending' && !isActive && i === trips.findIndex(t => t.status === 'pending')}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── GPS Status ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 px-0.5">GPS Status</p>
        <GPSStatusCard status={gps.status} coord={gps.currentCoord} error={gps.error} loading={gps.loading} onRefresh={gps.requestCurrent} />
        {!gps.isSupported && (
          <div className="flex items-center gap-2 mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl px-3 py-2.5">
            <WifiOff size={14} className="text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">GPS not supported. Use Chrome/Firefox on Android.</p>
          </div>
        )}
      </div>

      {/* ── Vehicle strip ── */}
      {vehicle && (
        <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-navy-900 dark:bg-navy-800 flex items-center justify-center flex-shrink-0">
            <Car size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 dark:text-white text-sm">{user?.vehicle}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{vehicle.model} · {vehicle.fuelType}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 justify-end">
              <Gauge size={12} /><span>{(vehicle?.km ?? 0).toLocaleString()} km</span>
            </div>
            <p className={`text-[10px] font-bold mt-0.5 ${vehicle.status === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
              {vehicle.status === 'active' ? '● Ready' : '⚠ Service'}
            </p>
          </div>
        </div>
      )}

      {showStatusModal && (
        <StatusModal current={driverStatus} onSelect={setDriverStatus} onClose={() => setShowStatusModal(false)} />
      )}
    </div>
  )
}