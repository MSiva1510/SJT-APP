import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, CheckCircle, Navigation,
  AlertTriangle, Clock, MapPin, Car, Map, Pause, Coffee, Fuel, Wrench, HelpCircle, Users,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useRideLifecycleContext } from '../../context/RideLifecycleContext'
import { TRIP_TYPES } from '../../data/driverData'
import { loadBookings, saveBooking } from '../../data/tripTypes'
import { getCurrentVehicleForDriver, startTripSession, endTripSession } from '../../data/attendanceData'
import { buildTripPayslip, saveTripPayslip, loadPayrollSettings } from '../../data/settlementData'
import { RIDE_STATES, RIDE_STATE_CFG } from '../../hooks/useRideLifecycle'
import { useGPS, loadActiveRideGPS, saveActiveRideGPS, clearActiveRideGPS, appendGPSHistory } from '../../hooks/useGPS'
import ActiveTripCard from '../../components/ride/ActiveTripCard'
import { StartRideButton } from '../../components/ride/RideLifecycleControls'
import ModalOverlay from '../../components/ui/ModalOverlay'
import TripDocumentUpload from '../../components/ride/TripDocumentUpload'
// Day 19/20 integrations
import { addAuditEvent }    from '../../data/auditLogData'
import { addTimelineEvent, loadTimeline, fmtTimelineTime, getEventCfg } from '../../data/tripTimelineData'
import { startRouteRecording, buildRouteHistoryEntry, clearTripRoute, saveRoutePoint } from '../../data/gpsHistoryData'
import { saveDriverStatus }  from '../../data/driverStatusData'
import { markVehicleInUse, markVehicleAvailable } from '../../data/vehicleStatusData'
import { buildMapsUrl, estimateTravelTime } from '../../utils/locationUtils'

const FILTERS = [
  { key: 'all',       label: 'All'       },
  { key: 'pending',   label: 'Scheduled' },
  { key: 'driving',   label: 'Active'    },
  { key: 'completed', label: 'Done'      },
]

// Module 2 (Day 20.5): required pause reasons
const PAUSE_REASONS = [
  { key: 'On Break',              icon: Coffee     },
  { key: 'Waiting For Customer',  icon: Users      },
  { key: 'Vehicle Issue',         icon: Wrench     },
  { key: 'Fuel Stop',             icon: Fuel       },
  { key: 'Other',                 icon: HelpCircle },
]

function PauseReasonModal({ onConfirm, onClose }) {
  const [selected, setSelected] = useState(null)
  return (
    <ModalOverlay onClose={onClose} center>
      <div className="w-full max-w-sm bg-white dark:bg-navy-900 rounded-3xl shadow-2xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="font-display font-black text-slate-800 dark:text-white text-base">Why are you pausing?</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">A reason is required to pause this trip.</p>
        </div>
        <div className="space-y-2">
          {PAUSE_REASONS.map(r => {
            const Icon = r.icon
            const isSel = selected === r.key
            return (
              <button key={r.key} onClick={() => setSelected(r.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border-2 transition-all ${
                  isSel
                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 hover:bg-slate-50 dark:hover:bg-navy-800'
                }`}>
                <Icon size={16} className={isSel ? 'text-blue-500' : 'text-slate-400'} />
                <span className={`text-sm font-bold flex-1 text-left ${isSel ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}>{r.key}</span>
                {isSel && <CheckCircle size={16} className="text-blue-500" />}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            Cancel
          </button>
          <button onClick={() => selected && onConfirm(selected)} disabled={!selected}
            className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md disabled:opacity-40 active:scale-95">
            Confirm Pause
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

function StatusPill({ status }) {
  const mapped = status === 'driving' ? 'started' : status
  const cfg = RIDE_STATE_CFG[mapped] || { bg: 'bg-slate-100 dark:bg-navy-800', text: 'text-slate-600 dark:text-slate-400', dot: 'bg-slate-400', label: status }
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'driving' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}

export default function AssignedTrips() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const gps       = useGPS()

  // ── Module 1 (Day 20.5): resolve REAL manager assignment.
  const [liveAssignment, setLiveAssignment] = useState(null)
  useEffect(() => {
    if (!user?.name) return
    getCurrentVehicleForDriver(user.name)
      .then(setLiveAssignment)
      .catch(err => console.error('[AssignedTrips] load vehicle assignment failed:', err))
  }, [user?.name])
  const assignedVehicleReg = liveAssignment?.vehicleReg || user?.vehicle || null
  const hasVehicleAssigned = !!assignedVehicleReg

  const {
    activeRide, rideState, elapsed, elapsedFmt,
    isActive,
    startRide, pauseRide, resumeRide, endRide, cancelRide,
    onRideStart, onRidePause, onRideResume, onRideEnd,
  } = useRideLifecycleContext()

  const todayISO = new Date().toISOString().slice(0, 10)

  const [base, setBase] = useState([])
  useEffect(() => {
    if (!user?.name) return
    loadBookings()
      .then(all => {
        const matched = (Array.isArray(all) ? all : [])
          .filter(b =>
            // Match by driver name (case-insensitive)
            (b.driver?.toLowerCase() === user?.name?.toLowerCase()) &&
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
            status:  b.status === 'started'   ? 'driving'
                   : b.status === 'completed' ? 'completed'
                   : 'pending',
            fare:      b.fare  || 0,
            km:        b.km    || 0,
            notes:     b.notes || '',
            bookingId: b.id,
          }))
        setBase(matched)
        // Restore driving status for any trip already active in the lifecycle
        setTrips(
          activeRide?.tripId
            ? matched.map(t => t.tripId === activeRide.tripId ? { ...t, status: 'driving' } : t)
            : matched
        )
      })
      .catch(err => console.error('[AssignedTrips] loadBookings failed:', err))
  }, [user, todayISO]) // activeRide intentionally excluded — only re-load on user/date change

  const [trips, setTrips] = useState([])
  const [filter, setFilter] = useState('all')
  const [active, setActive] = useState(null)
  const [odomStart,   setOdomStart]   = useState(null)
  const [odomEnd,     setOdomEnd]     = useState(null)
  const [odomStartKm, setOdomStartKm] = useState('')
  const [odomEndKm,   setOdomEndKm]   = useState('')

  // Route recording cleanup ref
  const stopRecording = useRef(null)

  // ── Unmount cleanup — prevents leaked GPS interval if driver
  //    navigates away from this page mid-trip ────────────────
  useEffect(() => {
    return () => {
      if (stopRecording.current) {
        stopRecording.current()
        stopRecording.current = null
      }
    }
  }, [])

  const filtered   = filter === 'all' ? trips : trips.filter(t =>
    filter === 'driving' ? t.status === 'driving' : t.status === filter
  )
  const totalFare  = trips.reduce((s, t) => s + t.fare, 0)
  const doneCount  = trips.filter(t => t.status === 'completed').length

  // ── Sync booking status helper ────────────────────────────
  const syncBookingStatus = useCallback(async (bookingId, newStatus) => {
    const raw     = await loadBookings()
    const booking = (Array.isArray(raw) ? raw : []).find(b => b.id === bookingId)
    if (!booking) return
    await saveBooking({ ...booking, status: newStatus, updatedAt: new Date().toISOString() })
  }, [])

  // ── Start ride ────────────────────────────────────────────
  const handleStart = useCallback((tripId) => {
    const trip = trips.find(t => t.tripId === tripId)
    if (!trip || isActive) return
    if (!hasVehicleAssigned) {
      window.alert('No vehicle assigned. Contact your manager before starting a trip.')
      return
    }
    setOdomStart(tripId)
    setOdomStartKm('')
  }, [trips, isActive, hasVehicleAssigned])

  const confirmStartWithKm = useCallback(async () => {
    const tripId  = odomStart
    const trip    = trips.find(t => t.tripId === tripId)
    if (!trip) return
    const startKm = Number(odomStartKm) || 0
    setOdomStart(null)

    const ride       = startRide({ ...trip, vehicle: assignedVehicleReg }, user?.id)
    const startCoord = await gps.requestCurrent()

    if (startKm > 0) {
      const _allBk  = await loadBookings()
      const booking = (Array.isArray(_allBk) ? _allBk : []).find(b => b.id === tripId)
      if (booking) await saveBooking({ ...booking, startKm, updatedAt: new Date().toISOString() })
    }

    const rideGPS = {
      tripId,
      customer:   trip.customer,
      driver:     user?.name,
      startCoord: startCoord || null,
      startTime:  new Date().toISOString(),
      startKm,
      endCoord:   null,
      endTime:    null,
    }
    saveActiveRideGPS(rideGPS)

    onRideStart(ride)
    syncBookingStatus(trip.bookingId, 'started')
    setTrips(prev => prev.map(t => t.tripId === tripId ? { ...t, status: 'driving', startKm } : t))

    addAuditEvent('TRIP_STARTED', {
      description: `${trip.customer} — ${trip.pickup} → ${trip.drop}${startKm > 0 ? ` | Start KM: ${startKm}` : ''}`,
      tripId,
      driver: user?.name,
    })
    addTimelineEvent(tripId, 'started')
    saveDriverStatus(user?.name, 'driving', startCoord?.area || null)
    markVehicleInUse(assignedVehicleReg, user?.name, startCoord?.area || null)
    startTripSession(user?.name, tripId)

    // Save first route point immediately
    if (startCoord) {
      saveRoutePoint({ tripId, lat: startCoord.lat, lng: startCoord.lng, area: startCoord.area })
    }

    // Start recording route every 30 seconds
    if (stopRecording.current) stopRecording.current()
    stopRecording.current = startRouteRecording(tripId, () => gps.requestCurrent(), 15000)
  }, [odomStart, odomStartKm, trips, startRide, user, gps, onRideStart, syncBookingStatus, assignedVehicleReg])

  // ── Pause (Module 2, Day 20.5: reason required) ────────────
  const [pauseModalOpen, setPauseModalOpen] = useState(false)
  const handlePause = useCallback(() => {
    setPauseModalOpen(true)
  }, [])

  const confirmPause = useCallback((reason) => {
    pauseRide(reason)
    onRidePause(activeRide)
    addTimelineEvent(activeRide?.tripId, 'paused', reason)
    saveDriverStatus(user?.name, 'waiting', null)
    setPauseModalOpen(false)
  }, [pauseRide, onRidePause, activeRide, user])

  // ── Resume ────────────────────────────────────────────────
  const handleResume = useCallback(() => {
    resumeRide()
    onRideResume(activeRide)
    addTimelineEvent(activeRide?.tripId, 'resumed')
    saveDriverStatus(user?.name, 'driving', null)
  }, [resumeRide, onRideResume, activeRide, user])

  // ── End ride ──────────────────────────────────────────────
  const handleEnd = useCallback(() => {
    setOdomEnd(activeRide?.tripId || 'current')
    setOdomEndKm('')
  }, [activeRide])

  const confirmEndWithKm = useCallback(async () => {
    const endKm   = Number(odomEndKm) || 0
    setOdomEnd(null)

    const endCoord = await gps.requestCurrent()
    const now      = new Date()
    const saved    = loadActiveRideGPS()
    const tripId   = activeRide?.tripId
    const startKm  = saved?.startKm || 0
    const distKm   = endKm > startKm ? endKm - startKm : null

    // Build duration string
    const ms  = saved?.startTime ? now.getTime() - new Date(saved.startTime).getTime() : null
    const dur = ms ? (() => {
      const m = Math.floor(ms / 60000)
      const h = Math.floor(m / 60)
      return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
    })() : elapsedFmt

    // Save route history entry
    if (saved) {
      const historyEntry = buildRouteHistoryEntry({
        tripId,
        customer:   saved.customer,
        driver:     saved.driver || user?.name,
        startCoord: saved.startCoord,
        endCoord,
        startTime:  saved.startTime,
        endTime:    now.toISOString(),
        duration:   dur,
      })
      appendGPSHistory({ ...historyEntry, completedAt: now.toISOString() })
      // Route points are now archived in the summary (routePoints/distanceKm)
      // — safe to clear the raw per-trip key to avoid unbounded localStorage growth
      clearTripRoute(tripId)
    }

    // Clear active state
    clearActiveRideGPS()
    if (stopRecording.current) { stopRecording.current(); stopRecording.current = null }

    const result = endRide()
    onRideEnd(activeRide)

    // Update booking + auto-payslip
    const allBookings = await loadBookings()
    const completedBooking = allBookings.find(b => b.id === tripId)
    if (completedBooking) {
      const updated = {
        ...completedBooking,
        status: 'completed',
        updatedAt: now.toISOString(),
        endKm,
        startKm: startKm || completedBooking.startKm || 0,
        distanceKm: distKm,
      }
      saveBooking(updated)
      // Only auto-generate payslip once fare is set by the manager.
      // If fare is still null, skip and let the manager trigger it from the Payroll page
      // after they enter the actual fare in the Trips page edit modal.
      if (updated.fare != null && Number(updated.fare) > 0) {
        const payslip = buildTripPayslip(updated, await loadPayrollSettings())
        saveTripPayslip(payslip)
      } else {
        console.warn('[AssignedTrips] Payslip NOT generated — fare is null. Manager must set fare and regenerate from Payroll page.')
      }
    }

    setTrips(prev => prev.map(t =>
      t.tripId === tripId
        ? { ...t, status: 'completed', endTime: now.toLocaleTimeString(), duration: result?.duration || dur, endKm, startKm, distanceKm: distKm }
        : t
    ))

    // ── Day 19/20 integrations ──────────────────────────────
    addAuditEvent('TRIP_COMPLETED', {
      description: `Trip ${tripId?.slice(-8)} completed — ${dur}`,
      tripId,
      driver: user?.name,
    })
    addTimelineEvent(tripId, 'completed')
    saveDriverStatus(user?.name, 'available', endCoord?.area || null)
    markVehicleAvailable(assignedVehicleReg, endCoord?.area || null)
    endTripSession(user?.name, tripId)

  }, [odomEndKm, odomEnd, gps, endRide, onRideEnd, activeRide, elapsedFmt, user, assignedVehicleReg])

  // ── Cancel ────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    if (!window.confirm('Cancel this ride?')) return
    const tripId = activeRide?.tripId
    cancelRide('Driver cancelled')
    clearActiveRideGPS()
    clearTripRoute(tripId)
    if (stopRecording.current) { stopRecording.current(); stopRecording.current = null }
    syncBookingStatus(tripId, 'assigned')
    addTimelineEvent(tripId, 'cancelled')
    saveDriverStatus(user?.name, 'available', null)
    markVehicleAvailable(assignedVehicleReg, null)
    setTrips(prev => prev.map(t => t.tripId === tripId ? { ...t, status: 'pending' } : t))
  }, [activeRide, cancelRide, syncBookingStatus, user])

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-up pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/driver')}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors flex-shrink-0">
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-black text-slate-800 dark:text-white text-xl">Assigned Trips</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Today · {trips.length} trips scheduled</p>
        </div>
      </div>

      {/* Module 1 (Day 20.5): vehicle assignment gate */}
      {!hasVehicleAssigned && (
        <div className="glass-card rounded-2xl p-4 border-2 border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-900/10 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">No vehicle assigned.</p>
            <p className="text-xs text-red-500 dark:text-red-400/80 mt-0.5">You cannot start a trip until your manager assigns a vehicle.</p>
          </div>
        </div>
      )}

      {/* Active ride card */}
      {isActive && activeRide && (
        <>
          <ActiveTripCard
            ride={activeRide}
            elapsed={elapsed}
            rideState={rideState}
            onPause={handlePause}
            onResume={handleResume}
            onEnd={handleEnd}
            onCancel={handleCancel}
          />
          {(() => {
            const t       = trips.find(tr => tr.tripId === activeRide.tripId)
            if (!t) return null
            return (
              <a href={buildMapsUrl(t.pickup, t.drop)} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm shadow-lg active:scale-95 transition-all">
                <Map size={17} />
                Open Route in Google Maps
                <span className="text-white/70 text-xs ml-1 font-normal truncate max-w-[160px]">
                  {t.pickup} → {t.drop || '—'}
                </span>
              </a>
            )
          })()}
        </>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Total Trips', value: trips.length,    color: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Completed',   value: doneCount,       color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Total Fare',  value: `Rs. ${(totalFare/1000).toFixed(1)}k`, color: 'text-navy-800 dark:text-blue-300' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-xl p-3 text-center">
            <p className={`text-lg font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
        {FILTERS.map(f => {
          const cnt = f.key === 'all' ? trips.length : trips.filter(t =>
            f.key === 'driving' ? t.status === 'driving' : t.status === f.key
          ).length
          return (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f.key
                  ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              {f.label}
              {cnt > 0 && <span className={`ml-1 text-[10px] ${filter === f.key ? 'text-blue-500' : 'text-slate-400'}`}>{cnt}</span>}
            </button>
          )
        })}
      </div>

      {/* Trip list */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Car size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No trips in this category</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(trip => {
            const isExpanded = active === trip.tripId
            const typeLabel  = TRIP_TYPES[trip.tripType] || trip.tripType
            const isDriving  = trip.status === 'driving'
            const timeline   = loadTimeline(trip.tripId)

            return (
              <div key={trip.tripId} className={`glass-card rounded-2xl overflow-hidden ${isDriving ? 'ring-2 ring-blue-400/50' : ''}`}>
                {/* Card header */}
                <div className="flex items-center gap-3 p-4 cursor-pointer select-none"
                     onClick={() => setActive(isExpanded ? null : trip.tripId)}>
                  <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${isDriving ? 'bg-blue-600 animate-pulse' : 'bg-navy-900 dark:bg-navy-800'}`}>
                    <span className="text-[9px] font-bold text-blue-300 uppercase leading-none">{trip.scheduledTime.split(' ')[1]}</span>
                    <span className="text-sm font-black text-white leading-tight">{trip.scheduledTime.split(' ')[0]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{trip.customer}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{typeLabel} · {trip.km} km</p>
                    <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                      <MapPin size={9} /><span className="truncate">{trip.pickup}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <StatusPill status={trip.status} />
                    <p className="text-sm font-black text-navy-800 dark:text-blue-300">Rs. {(trip?.fare ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-slate-100 dark:border-navy-700 p-4 bg-slate-50/50 dark:bg-navy-800/30 space-y-3">

                    {/* Route visual */}
                    <div className="flex items-stretch gap-3 bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                        <div className="flex-1 w-0.5 border-l border-dashed border-slate-300 dark:border-navy-600" />
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Pickup</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{trip.pickup}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Drop</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{trip.drop}</p>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Trip ID',   value: trip.tripId,     mono: true },
                        { label: 'Scheduled', value: trip.scheduledTime           },
                        { label: 'Trip Type', value: typeLabel                    },
                        { label: 'Distance',  value: `${trip.km} km`             },
                        { label: 'Fare',      value: `Rs. ${(trip?.fare ?? 0).toLocaleString('en-IN')}`, hi: true },
                        { label: 'Contact',   value: trip.contact                 },
                        ...(trip.status === 'completed' ? [
                          { label: 'End Time',  value: trip.endTime               },
                          { label: 'Duration',  value: trip.duration, hi: true    },
                        ] : []),
                      ].map(d => (
                        <div key={d.label} className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{d.label}</p>
                          <p className={`text-xs font-bold leading-tight ${d.mono ? 'font-mono' : ''} ${d.hi ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{d.value}</p>
                        </div>
                      ))}
                    </div>

                    {trip.notes && (
                      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/15 rounded-xl px-3 py-2.5">
                        <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-tight">{trip.notes}</p>
                      </div>
                    )}

                    {/* Active inline controls */}
                    {isDriving && isActive && activeRide?.tripId === trip.tripId && (
                      <ActiveTripCard
                        ride={activeRide}
                        elapsed={elapsed}
                        rideState={rideState}
                        onPause={handlePause}
                        onResume={handleResume}
                        onEnd={handleEnd}
                        onCancel={handleCancel}
                        compact
                      />
                    )}

                    {/* Pending — route preview card + start */}
                    {trip.status === 'pending' && !isActive && (
                      <div className="space-y-2">

                        {/* Enhanced route preview card */}
                        {trip.pickup && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl p-3 space-y-2">
                            <div className="flex items-stretch gap-2.5">
                              <div className="flex flex-col items-center gap-1 pt-1">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                                <div className="flex-1 w-0.5 border-l border-dashed border-blue-300 dark:border-blue-700" />
                                <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                              </div>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <div>
                                  <p className="text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase">Pickup</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">{trip.pickup}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase">Destination</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">{trip.drop || '—'}</p>
                                </div>
                              </div>
                              {trip.km > 0 && (
                                <div className="flex-shrink-0 text-right">
                                  <p className="text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase">Distance</p>
                                  <p className="text-sm font-black text-slate-800 dark:text-white">{trip.km} KM</p>
                                  <p className="text-[9px] font-bold text-blue-500 dark:text-blue-400 uppercase mt-1">ETA</p>
                                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{estimateTravelTime(trip.km)}</p>
                                </div>
                              )}
                            </div>
                            <a href={buildMapsUrl(trip.pickup, trip.drop)}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors">
                              <Map size={12} />
                              Open Route in Google Maps
                            </a>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <a href={`tel:${trip.contact}`}
                            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
                            <Phone size={13} /> Call
                          </a>
                          <StartRideButton onStart={() => handleStart(trip.tripId)} fullWidth disabled={!hasVehicleAssigned} />
                        </div>
                      </div>
                    )}

                    {/* Completed */}
                    {trip.status === 'completed' && (
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl px-3 py-2">
                        <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">Trip completed successfully</p>
                        {trip.duration && <span className="ml-auto text-xs font-bold text-emerald-600 dark:text-emerald-400">{trip.duration}</span>}
                      </div>
                    )}

                    {/* Module 5 (Day 20.5): trip document uploads */}
                    <TripDocumentUpload tripId={trip.tripId} uploadedBy={user?.name} />

                    {/* Trip Timeline */}
                    {timeline.length > 0 && (
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Trip Timeline</p>
                        <div className="space-y-1.5">
                          {timeline.map((ev, i) => {
                            const evCfg = getEventCfg(ev.event)
                            return (
                              <div key={i} className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-navy-800/60 rounded-xl border border-slate-100 dark:border-navy-700">
                                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${evCfg.dot}`} />
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex-1">{ev.label}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{fmtTimelineTime(ev.timestamp)}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Module 2 (Day 20.5): pause requires a reason */}
      {pauseModalOpen && (
        <PauseReasonModal
          onConfirm={confirmPause}
          onClose={() => setPauseModalOpen(false)}
        />
      )}

      {/* Module 14: Start KM modal */}
      {odomStart && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:w-96 bg-white dark:bg-navy-900 rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-navy-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Start Trip</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-base">Enter Start Odometer</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">Record the vehicle odometer reading before starting this trip.</p>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Odometer Reading (KM) <span className="text-red-500">*</span></label>
                <input type="number" value={odomStartKm} onChange={e => setOdomStartKm(e.target.value)}
                  placeholder="e.g. 45230" autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/25" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2">
              <button onClick={() => setOdomStart(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
                Cancel
              </button>
              <button onClick={confirmStartWithKm}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-all shadow-md active:scale-95">
                Start Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Module 14: End KM modal */}
      {odomEnd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full sm:w-96 bg-white dark:bg-navy-900 rounded-2xl shadow-2xl overflow-hidden animate-fade-up">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-navy-700">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Complete Trip</p>
              <h3 className="font-display font-black text-slate-800 dark:text-white text-base">Enter End Odometer</h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">Record the vehicle odometer reading at trip completion.</p>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Odometer Reading (KM) <span className="text-red-500">*</span></label>
                <input type="number" value={odomEndKm} onChange={e => setOdomEndKm(e.target.value)}
                  placeholder="e.g. 45530" autoFocus
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/25" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2">
              <button onClick={() => setOdomEnd(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
                Cancel
              </button>
              <button onClick={confirmEndWithKm}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all shadow-md active:scale-95">
                Complete Trip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}