import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, Car, ChevronDown, ChevronUp,
  CheckCircle, Navigation, Signal, WifiOff, Zap,
  Calendar, User, RotateCcw,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { getDriverHistory, TRIP_TYPES } from '../../data/driverData'
import { loadBookings } from '../../data/tripTypes'
import { loadGPSHistory } from '../../hooks/useGPS'
import { loadRideHistory, RIDE_STATE_CFG, formatElapsed } from '../../hooks/useRideLifecycle'
import LocationPinCard from '../../components/gps/LocationPinCard'

const TYPE_COLORS = {
  outstation: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  airport:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  local:      'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  pickup:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  drop:       'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  roundtrip:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
}

// Merge completed Supabase bookings with locally captured lifecycle/GPS metadata.
function buildMergedHistory(bookingTrips, lifecycleHistory, gpsHistory) {
  // Start with lifecycle history (real completed rides)
  const lcItems = lifecycleHistory.map(lc => ({
    source:       'lifecycle',
    tripId:       lc.tripId,
    customer:     lc.customer,
    pickup:       lc.pickup  || '—',
    drop:         lc.drop    || '—',
    date:         lc.startDate || (lc.startedAt ? new Date(lc.startedAt).toLocaleDateString() : '—'),
    startTime:    lc.startTime  || (lc.startedAt ? new Date(lc.startedAt).toLocaleTimeString() : '—'),
    endTime:      lc.endTime    || (lc.endedAt   ? new Date(lc.endedAt).toLocaleTimeString()   : '—'),
    duration:     lc.duration   || (lc.durationSecs ? formatElapsed(lc.durationSecs) : '—'),
    rideState:    lc.rideState  || 'completed',
    pauseCount:   lc.pauseCount || 0,
    pauseReason:  lc.pauseReason || null,
    fare:         lc.fare || 0,
    km:           lc.km   || 0,
    vehicle:      lc.vehicle || '—',
    driverId:     lc.driverId || '—',
    events:       lc.events  || [],
    gps:          gpsHistory.find(g => g.tripId === lc.tripId) || null,
    earnings:     lc.fare ? Math.round(lc.fare * 0.12) : 0,
    tripType:     lc.tripType || 'local',
  }))

  const lcIds = new Set(lcItems.map(i => i.tripId))
  const bookingItems = bookingTrips
    .filter(t => !lcIds.has(t.tripId))
    .map(t => ({
      source:    'booking',
      tripId:    t.tripId,
      customer:  t.customer,
      pickup:    t.pickup,
      drop:      t.drop,
      date:      t.date,
      startTime: '—',
      endTime:   '—',
      duration:  t.duration,
      rideState: t.status === 'completed' ? 'completed' : t.status,
      pauseCount:0,
      fare:      t.fare,
      km:        t.km,
      vehicle:   '—',
      driverId:  '—',
      events:    [],
      gps:       gpsHistory.find(g => g.tripId === t.tripId || g.customer === t.customer) || null,
      earnings:  t.earnings,
      tripType:  t.tripType || 'local',
    }))

  return [...lcItems, ...bookingItems]
}

export default function RideHistory() {
  const { user }      = useAuth()
  const navigate      = useNavigate()

  const [bookings, setBookings] = useState([])
  const [loadError, setLoadError] = useState(null)
  useEffect(() => {
    loadBookings()
      .then(bks => { setBookings(Array.isArray(bks) ? bks : []); setLoadError(null) })
      .catch(err => { console.error('[RideHistory] load bookings failed:', err); setLoadError('Could not load your ride history.') })
  }, [])

  const normalizedBookings = bookings
    .filter(b => b.status === 'completed')
    .map(b => ({
      tripId:   b.id,
      customer: b.customer,
      pickup:   b.pickup,
      drop:     b.drop,
      date:     b.startDate,
      duration: '—',
      status:   b.status,
      fare:     b.fare || 0,
      km:       b.km || 0,
      earnings: b.fare ? Math.round(b.fare * 0.12) : 0,
      tripType: b.type || 'local',
      driver:   b.driver,
      driver_name: b.driver,
    }))

  const driverHistory    = getDriverHistory(user?.name, normalizedBookings)
  const lifecycleHistory = loadRideHistory()
  const gpsHistory       = loadGPSHistory()
  const history          = buildMergedHistory(driverHistory, lifecycleHistory, gpsHistory)

  const [expanded,   setExpanded]   = useState(null)
  const [filter,     setFilter]     = useState('all')
  const [showGPS,    setShowGPS]    = useState({})
  const [showEvents, setShowEvents] = useState({})

  const totalEarnings    = history.reduce((s, t) => s + (t.earnings || 0), 0)
  const totalKm          = history.reduce((s, t) => s + (t.km || 0), 0)
  const totalFare        = history.reduce((s, t) => s + (t.fare || 0), 0)
  const tripsWithGPS     = history.filter(t => t.gps).length
  const tripsWithLC      = history.filter(t => t.source === 'lifecycle').length
  const totalPauses      = history.reduce((s, t) => s + (t.pauseCount || 0), 0)

  const filtered = filter === 'all' ? history : history.filter(t =>
    filter === 'gps' ? !!t.gps : filter === 'lifecycle' ? t.source === 'lifecycle' : t.rideState === filter
  )

  const tripTypes = [...new Set(history.map(t => t.tripType))]

  const toggleGPS    = i => setShowGPS(p    => ({ ...p, [i]: !p[i]    }))
  const toggleEvents = i => setShowEvents(p => ({ ...p, [i]: !p[i] }))

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-up pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/driver')}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors flex-shrink-0">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="font-display font-black text-slate-800 dark:text-white text-xl">Ride History</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">{history.length} trips · May 2026</p>
        </div>
      </div>

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-3 flex items-center gap-2">
          <p className="text-xs font-bold text-red-700 dark:text-red-400">{loadError}</p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Total Trips',    value: history.length,                              icon: Navigation, color: 'from-navy-700 to-blue-600'    },
          { label: 'Your Earnings',  value: `Rs. ${totalEarnings.toLocaleString('en-IN')}`, icon: Car,    color: 'from-emerald-600 to-teal-500' },
          { label: 'KM Driven',      value: totalKm.toLocaleString(),                   icon: Car,        color: 'from-violet-600 to-purple-500' },
          { label: 'GPS Tracked',    value: tripsWithGPS,                               icon: Signal,     color: 'from-blue-500 to-indigo-600'   },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-2xl p-3.5 relative overflow-hidden">
            <div className={`absolute -top-4 -right-4 w-14 h-14 rounded-full opacity-15 blur-xl bg-gradient-to-br ${s.color}`} />
            <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center mb-2 relative z-10`}>
              <s.icon size={13} className="text-white" />
            </div>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5 relative z-10">{s.label}</p>
            <p className="text-sm font-display font-black text-slate-800 dark:text-white leading-tight relative z-10">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Lifecycle stats strip */}
      {tripsWithLC > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Lifecycle Stats</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Lifecycle Trips', value: tripsWithLC,  color: 'text-blue-600 dark:text-blue-400'       },
              { label: 'Total Pauses',    value: totalPauses,  color: 'text-amber-600 dark:text-amber-400'     },
              { label: 'GPS Recorded',    value: tripsWithGPS, color: 'text-emerald-600 dark:text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center">
                <p className={`text-lg font-display font-black ${s.color}`}>{s.value}</p>
                <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Earnings bar */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Fare Collected</p>
            <p className="font-display font-black text-slate-800 dark:text-white text-base">Rs. {totalFare.toLocaleString('en-IN')}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Your Share</p>
            <p className="font-display font-black text-emerald-600 dark:text-emerald-400 text-base">Rs. {totalEarnings.toLocaleString('en-IN')}</p>
          </div>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
            style={{ width: `${totalFare ? Math.round((totalEarnings / totalFare) * 100) : 0}%`, transition: 'width .5s' }} />
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 text-right">
          {totalFare ? Math.round((totalEarnings / totalFare) * 100) : 0}% of fare is your pay
        </p>
      </div>

      {/* Filter pills */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 pb-1" style={{ minWidth: 'max-content' }}>
          {[
            { key: 'all',        label: 'All',       count: history.length },
            { key: 'completed',  label: 'Completed', count: history.filter(t => t.rideState === 'completed').length },
            { key: 'cancelled',  label: 'Cancelled', count: history.filter(t => t.rideState === 'cancelled').length },
            { key: 'gps',        label: '📍 GPS',    count: tripsWithGPS },
            { key: 'lifecycle',  label: '⚡ Tracked', count: tripsWithLC },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                filter === f.key
                  ? 'bg-navy-900 dark:bg-blue-700 text-white shadow'
                  : 'bg-slate-100 dark:bg-navy-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-navy-700'
              }`}>
              {f.label}
              <span className="ml-1.5 opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* History list */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Clock size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No rides in this category</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((trip, i) => {
            const isOpen       = expanded === i
            const typeLabel    = TRIP_TYPES[trip.tripType] || trip.tripType
            const typeColor    = TYPE_COLORS[trip.tripType] || TYPE_COLORS.local
            const hasGPS       = !!trip.gps
            const hasLC        = trip.source === 'lifecycle'
            const gpsVisible   = showGPS[i]
            const eventsVisible = showEvents[i]
            const stateCfg     = RIDE_STATE_CFG[trip.rideState] || RIDE_STATE_CFG.completed

            return (
              <div key={i} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200">

                {/* Row header */}
                <div className="flex items-center gap-3 p-3.5 cursor-pointer select-none"
                     onClick={() => setExpanded(isOpen ? null : i)}>
                  {/* Date badge */}
                  <div className="w-11 h-11 rounded-xl bg-navy-900 dark:bg-navy-800 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[8px] font-bold text-blue-400 uppercase leading-none">
                      {typeof trip.date === 'string' ? trip.date.slice(3, 6) : '—'}
                    </span>
                    <span className="text-sm font-black text-white leading-tight">
                      {typeof trip.date === 'string' ? trip.date.slice(0, 2) : '?'}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{trip.customer}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${typeColor}`}>{typeLabel}</span>
                      {trip.duration && trip.duration !== '—' && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <Clock size={9} />{trip.duration}
                        </span>
                      )}
                      {trip.km > 0 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <Car size={9} />{trip.km} km
                        </span>
                      )}
                      {hasGPS && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                          <Signal size={8} /> GPS
                        </span>
                      )}
                      {hasLC && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 flex items-center gap-1">
                          <Zap size={8} /> Tracked
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        Rs. {(trip.earnings || 0).toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-slate-400">your pay</p>
                    </div>
                    {isOpen
                      ? <ChevronUp size={14} className="text-slate-400 flex-shrink-0" />
                      : <ChevronDown size={14} className="text-slate-400 flex-shrink-0" />
                    }
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-navy-700 p-3.5 pt-3 bg-slate-50/60 dark:bg-navy-800/30 space-y-3">

                    {/* Route */}
                    <div className="flex items-stretch gap-3 bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
                      <div className="flex flex-col items-center gap-1 pt-0.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                        <div className="flex-1 w-0.5 border-l border-dashed border-slate-300 dark:border-navy-600 min-h-[14px]" />
                        <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">From</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{trip.pickup}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">To</p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{trip.drop}</p>
                        </div>
                      </div>
                    </div>

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Fare',      value: `Rs. ${(trip.fare||0).toLocaleString('en-IN')}` },
                        { label: 'Your Pay',  value: `Rs. ${(trip.earnings||0).toLocaleString('en-IN')}`, hi: true },
                        { label: 'Duration',  value: trip.duration || '—' },
                        { label: 'Distance',  value: trip.km ? `${trip.km} km` : '—' },
                        { label: 'Start',     value: trip.startTime || '—' },
                        { label: 'End',       value: trip.endTime   || '—' },
                      ].map(d => (
                        <div key={d.label} className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
                          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{d.label}</p>
                          <p className={`text-xs font-bold leading-tight ${d.hi ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>{d.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Status + vehicle row */}
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${stateCfg.bg} ${stateCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stateCfg.dot}`} />
                        {stateCfg.label}
                      </span>
                      {trip.vehicle && trip.vehicle !== '—' && (
                        <span className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                          <Car size={10} /> {trip.vehicle}
                        </span>
                      )}
                      {trip.pauseCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                          <RotateCcw size={10} /> {trip.pauseCount} pause{trip.pauseCount !== 1 ? 's' : ''}
                          {trip.pauseReason && <span className="text-amber-500 dark:text-amber-400/80 font-normal">· {trip.pauseReason}</span>}
                        </span>
                      )}
                    </div>

                    {/* Completed strip */}
                    {trip.rideState === 'completed' && (
                      <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl px-3 py-2">
                        <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex-1">Trip completed</p>
                        <span className="text-[10px] text-emerald-500 font-mono">{trip.tripId?.slice(-10)}</span>
                      </div>
                    )}

                    {/* Cancelled strip */}
                    {trip.rideState === 'cancelled' && (
                      <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/15 rounded-xl px-3 py-2">
                        <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
                        <p className="text-xs font-semibold text-red-700 dark:text-red-400">Trip cancelled</p>
                      </div>
                    )}

                    {/* Lifecycle events */}
                    {hasLC && trip.events?.length > 0 && (
                      <div>
                        <button onClick={() => toggleEvents(i)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800/30 text-xs font-bold text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/25 transition-colors">
                          <div className="flex items-center gap-2">
                            <Zap size={13} />
                            <span>Ride Events ({trip.events.length})</span>
                          </div>
                          {eventsVisible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {eventsVisible && (
                          <div className="mt-2 space-y-1.5">
                            {trip.events.map((ev, ei) => {
                              const evCfg = {
                                started:   { dot: 'bg-blue-500',    label: 'Started'  },
                                paused:    { dot: 'bg-amber-500',   label: 'Paused'   },
                                resumed:   { dot: 'bg-emerald-500', label: 'Resumed'  },
                                completed: { dot: 'bg-emerald-600', label: 'Completed'},
                                cancelled: { dot: 'bg-red-500',     label: 'Cancelled'},
                              }[ev.type] || { dot: 'bg-slate-400', label: ev.type }
                              return (
                                <div key={ei} className="flex items-center gap-2.5 px-3 py-2 bg-white dark:bg-navy-800/60 rounded-xl border border-slate-100 dark:border-navy-700">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${evCfg.dot}`} />
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{ev.label}</span>
                                  <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                                    {new Date(ev.at).toLocaleTimeString()}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    {/* GPS section */}
                    {hasGPS ? (
                      <div>
                        <button onClick={() => toggleGPS(i)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/30 text-xs font-bold text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/25 transition-colors">
                          <div className="flex items-center gap-2">
                            <Signal size={13} />
                            <span>GPS Data</span>
                          </div>
                          {gpsVisible ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {gpsVisible && (
                          <div className="mt-2.5 space-y-2.5">
                            {trip.gps.startCoord && (
                              <LocationPinCard type="start" coord={trip.gps.startCoord}
                                time={trip.gps.startCoord.timestamp ? new Date(trip.gps.startCoord.timestamp).toLocaleTimeString() : undefined} />
                            )}
                            {trip.gps.endCoord && (
                              <LocationPinCard type="end" coord={trip.gps.endCoord}
                                time={trip.gps.endCoord.timestamp ? new Date(trip.gps.endCoord.timestamp).toLocaleTimeString() : undefined} />
                            )}
                            {(trip.gps.startCoord || trip.gps.endCoord) && (
                              <div className="bg-slate-900 dark:bg-navy-950 rounded-xl p-3 border border-slate-700 dark:border-navy-700">
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Raw Coordinates</p>
                                <div className="space-y-1.5">
                                  {trip.gps.startCoord && (
                                    <div className="flex justify-between text-[10px] font-mono">
                                      <span className="text-emerald-500">START</span>
                                      <span className="text-slate-300">{trip.gps.startCoord.lat}, {trip.gps.startCoord.lng}</span>
                                    </div>
                                  )}
                                  {trip.gps.endCoord && (
                                    <div className="flex justify-between text-[10px] font-mono">
                                      <span className="text-red-400">END</span>
                                      <span className="text-slate-300">{trip.gps.endCoord.lat}, {trip.gps.endCoord.lng}</span>
                                    </div>
                                  )}
                                  {trip.gps.duration && (
                                    <div className="flex justify-between text-[10px] font-mono border-t border-slate-700 pt-1.5 mt-1.5">
                                      <span className="text-blue-400">DURATION</span>
                                      <span className="text-slate-300">{trip.gps.duration}</span>
                                    </div>
                                  )}
                                  {trip.gps.distanceKm != null && (
                                    <div className="flex justify-between text-[10px] font-mono">
                                      <span className="text-violet-400">DISTANCE</span>
                                      <span className="text-slate-300">{trip.gps.distanceKm} km</span>
                                    </div>
                                  )}
                                  {trip.gps.routePoints != null && (
                                    <div className="flex justify-between text-[10px] font-mono">
                                      <span className="text-amber-400">ROUTE POINTS</span>
                                      <span className="text-slate-300">{trip.gps.routePoints} recorded</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-slate-50 dark:bg-navy-800/40 border border-slate-100 dark:border-navy-700 rounded-xl px-3 py-2">
                        <WifiOff size={12} className="text-slate-400 flex-shrink-0" />
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">No GPS data for this trip</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
