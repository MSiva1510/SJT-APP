// ─── Live Fleet Board ─────────────────────────────────────────
// Real-time overview of all vehicles, drivers, and active trips.
// Reads from bookings, driverStatusData, and gpsHistoryData.
// Auto-refreshes every 30 seconds.

import { useState, useEffect, useCallback } from 'react'
import { Car, MapPin, Clock, RefreshCw, Activity, User, Navigation } from 'lucide-react'
import { loadDrivers } from '../../data/driverData'
import { loadVehicles } from '../../data/vehicleData'
import { loadBookings } from '../../data/tripTypes'
import { loadDriverStatuses, getStatusCfg, DRIVER_STATUS_OFFLINE_MS } from '../../data/driverStatusData'
import { getLatestRoutePoint } from '../../data/gpsHistoryData'

function StatusPill({ statusKey }) {
  const cfg   = getStatusCfg(statusKey)
  const pulse = statusKey === 'driving' || statusKey === 'passenger_onboard'
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${pulse ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  )
}

function formatDuration(isoStart) {
  if (!isoStart) return '—'
  const ms   = Date.now() - new Date(isoStart).getTime()
  if (ms < 0) return '—'
  const mins = Math.floor(ms / 60000)
  const hrs  = Math.floor(mins / 60)
  const m    = mins % 60
  return `${String(hrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export default function LiveFleetBoard() {
  const [bookings, setBookings] = useState([])
  const [drivers,  setDrivers]  = useState([])
  const [vehicles, setVehicles] = useState([])
  const [statuses, setStatuses] = useState({})
  const [tick,     setTick]     = useState(0)

  // ── Async data fetch — runs on mount and every 30 s ──────
  const fetchData = useCallback(async () => {
    const [bk, dr, ve, st] = await Promise.allSettled([
      loadBookings(),
      loadDrivers(),
      loadVehicles(),
      loadDriverStatuses(),
    ])
    if (bk.status === 'fulfilled') setBookings(Array.isArray(bk.value) ? bk.value : [])
    else console.error('[LiveFleetBoard] loadBookings failed:', bk.reason)
    if (dr.status === 'fulfilled') setDrivers(Array.isArray(dr.value) ? dr.value : [])
    else console.error('[LiveFleetBoard] load drivers failed:', dr.reason)
    if (ve.status === 'fulfilled') setVehicles(Array.isArray(ve.value) ? ve.value : [])
    else console.error('[LiveFleetBoard] load vehicles failed:', ve.reason)
    if (st.status === 'fulfilled') setStatuses(st.value || {})
    else console.error('[LiveFleetBoard] load driver statuses failed:', st.reason)
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(() => {
      setTick(t => t + 1)
      fetchData()
    }, 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  const todayISO = new Date().toISOString().slice(0, 10)

  const rows = drivers.map(driver => {
    const driverName = driver?.name || driver?.full_name || 'Unknown driver'
    const driverVehicle = driver?.vehicle || driver?.vehicleReg || driver?.vehicle_reg || 'Unassigned'
    const vehicle = vehicles.find(v => v.reg === driverVehicle)

    // Active booking for this driver today
    const activeBooking = bookings.find(b =>
      (b.driver || b.driver_name || '').toLowerCase() === driverName.toLowerCase() &&
      b.startDate === todayISO &&
      ['started', 'assigned', 'confirmed'].includes(b.status)
    )

    // Resolve live status — keyed by driver UUID, matching driver_status.driver_id
    const stored = statuses[driver.id]
    let   status = 'offline'
    if (stored?.status) {
      const elapsed = stored.updated_at
        ? Date.now() - new Date(stored.updated_at).getTime()
        : Infinity
      status = elapsed > DRIVER_STATUS_OFFLINE_MS ? 'offline' : stored.status
    } else if (activeBooking?.status === 'started') {
      status = 'driving'
    } else if (['assigned', 'confirmed'].includes(activeBooking?.status)) {
      status = 'available'
    }

    // Current area — latest GPS point → stored area → fallback
    const latestGPS   = activeBooking ? getLatestRoutePoint(activeBooking.id) : null
    const currentArea = latestGPS?.area
      || (driver.status === 'active' ? 'Puducherry' : '—')

    return { driver, driverName, driverVehicle, vehicle, status, activeBooking, currentArea }
  })

  const onlineCount  = rows.filter(r => r.status !== 'offline').length
  const drivingCount = rows.filter(r => r.status === 'driving' || r.status === 'passenger_onboard').length

  return (
    <div className="glass-card rounded-2xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-100 dark:border-navy-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <Activity size={15} className="text-white" />
          </div>
          <div>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-sm">Live Fleet Board</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{onlineCount} online · {drivingCount} driving</p>
          </div>
        </div>
        <button
          onClick={() => { setTick(t => t + 1); fetchData() }}
          className="w-7 h-7 rounded-lg border border-slate-200 dark:border-navy-600 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-700 transition-all"
          title="Refresh now"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Table header — desktop only */}
      <div className="hidden sm:grid grid-cols-6 gap-2 px-4 py-2 bg-slate-50 dark:bg-navy-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
        <span>Vehicle</span>
        <span>Driver</span>
        <span>Current Area</span>
        <span>Current Trip</span>
        <span>Status</span>
        <span>Duration</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-100 dark:divide-navy-700/60">
        {rows.map(({ driver, driverName, driverVehicle, vehicle, status, activeBooking, currentArea }) => {
          const isActive  = status === 'driving' || status === 'passenger_onboard'
          const startedAt = activeBooking?.updatedAt || null
          const tripId    = activeBooking?.id || null

          return (
            <div key={driver.id}
              className={`px-4 py-3 transition-colors ${isActive ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
            >
              {/* Mobile */}
              <div className="flex items-start justify-between gap-2 sm:hidden">
                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-600' : 'bg-slate-100 dark:bg-navy-800'}`}>
                    <Car size={15} className={isActive ? 'text-white' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800 dark:text-white text-xs font-mono">{driverVehicle}</span>
                      <StatusPill statusKey={status} />
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <User size={9} /><span>{driverName}</span>
                      <span className="mx-1">·</span>
                      <MapPin size={9} /><span>{currentArea}</span>
                    </div>
                    {tripId && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                        <Navigation size={9} />
                        <span className="font-mono truncate">{tripId.slice(-10)}</span>
                        {isActive && startedAt && (
                          <span className="ml-1 text-slate-400 font-sans">{formatDuration(startedAt)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop */}
              <div className="hidden sm:grid grid-cols-6 gap-2 items-center">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-blue-600' : 'bg-slate-100 dark:bg-navy-700'}`}>
                    <Car size={12} className={isActive ? 'text-white' : 'text-slate-400'} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white text-xs font-mono leading-tight">{driverVehicle}</p>
                    <p className="text-[9px] text-slate-400">{vehicle?.model || ''}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{driverName}</p>
                  <p className="text-[9px] text-slate-400">{vehicle?.type || ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin size={10} className="text-slate-400 flex-shrink-0" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{currentArea}</span>
                </div>
                <div>
                  {tripId ? (
                    <>
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 font-mono">{tripId.slice(-10)}</span>
                      {activeBooking?.customer && (
                        <p className="text-[9px] text-slate-400 truncate max-w-[120px]">{activeBooking.customer}</p>
                      )}
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                  )}
                </div>
                <StatusPill statusKey={status} />
                <div>
                  {isActive && startedAt ? (
                    <div className="flex items-center gap-1">
                      <Clock size={10} className="text-blue-500" />
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">{formatDuration(startedAt)}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="px-4 py-2 border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30">
        <p className="text-[9px] text-slate-400 dark:text-slate-500">
          Auto-refreshes every 30s · Drivers go offline after 10 min with no GPS update
        </p>
      </div>
    </div>
  )
}
