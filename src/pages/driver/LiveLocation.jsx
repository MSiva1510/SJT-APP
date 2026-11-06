import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Navigation, WifiOff, Satellite,
  RefreshCw, Car, Route, Clock,
} from 'lucide-react'
import { useGPS, loadActiveRideGPS } from '../../hooks/useGPS'
import GPSStatusCard   from '../../components/gps/GPSStatusCard'
import LocationPinCard from '../../components/gps/LocationPinCard'
import { loadTripRoute } from '../../data/gpsHistoryData'

function VehicleMap({ coord, startCoord, routePoints = [], status }) {
  const W = 340, H = 220, pad = 24

  const allPts = [
    ...(startCoord ? [startCoord] : []),
    ...(routePoints || []),
    ...(coord ? [coord] : []),
  ].filter(Boolean)

  let svgPoints = []
  if (allPts.length >= 2) {
    const lats = allPts.map(p => p.lat)
    const lngs = allPts.map(p => p.lng)
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const rangeW = maxLng - minLng || 0.001
    const rangeH = maxLat - minLat || 0.001
    svgPoints = allPts.map(p => ({
      x: pad + ((p.lng - minLng) / rangeW) * (W - 2 * pad),
      y: (H - pad) - ((p.lat - minLat) / rangeH) * (H - 2 * pad),
    }))
  } else {
    svgPoints = [{ x: W / 2, y: H / 2 }]
  }

  const current  = svgPoints[svgPoints.length - 1]
  const start    = svgPoints[0]
  const polyline = svgPoints.map(p => `${p.x},${p.y}`).join(' ')
  const statusColor = status === 'driving' ? '#10b981' : status === 'paused' ? '#f59e0b' : '#94a3b8'

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-900">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <rect width={W} height={H} fill="currentColor" className="text-slate-50 dark:text-navy-900" />
        {[...Array(6)].map((_, i) => (
          <g key={i}>
            <line x1={0} y1={i*(H/5)} x2={W} y2={i*(H/5)} stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-navy-700" />
            <line x1={i*(W/5)} y1={0} x2={i*(W/5)} y2={H} stroke="currentColor" strokeWidth="0.5" className="text-slate-200 dark:text-navy-700" />
          </g>
        ))}
        {svgPoints.length >= 2 && (
          <>
            <polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" strokeDasharray="6 3" />
            <polyline points={polyline} fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          </>
        )}
        {svgPoints.length >= 2 && (
          <g transform={`translate(${start.x},${start.y})`}>
            <circle r="6" fill="#10b981" opacity="0.2" />
            <circle r="4" fill="#10b981" />
            <circle r="2" fill="white" />
          </g>
        )}
        <g transform={`translate(${current.x},${current.y})`}>
          <circle r="18" fill={statusColor} opacity="0.15" />
          <circle r="12" fill={statusColor} opacity="0.25" />
          <circle r="8"  fill={statusColor} />
          <text textAnchor="middle" dominantBaseline="central" fontSize="9" fill="white">🚗</text>
        </g>
        <g transform={`translate(${W-20},20)`}>
          <circle r="12" fill="white" opacity="0.9" />
          <text textAnchor="middle" dominantBaseline="central" fontSize="8" fill="#334155" fontWeight="bold">N</text>
        </g>
      </svg>
      <div className="absolute bottom-2 left-2">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold backdrop-blur-sm
          ${status === 'driving' ? 'bg-emerald-500/90 text-white'
          : status === 'paused'  ? 'bg-amber-500/90 text-white'
          : 'bg-white/90 dark:bg-navy-800/90 text-slate-600 dark:text-slate-300'}`}>
          <span className={`w-1.5 h-1.5 rounded-full bg-current ${status === 'driving' ? 'animate-pulse' : ''}`} />
          {status === 'driving' ? 'Moving' : status === 'paused' ? 'Paused' : 'Stationary'}
        </span>
      </div>
    </div>
  )
}

export default function LiveLocation() {
  const navigate   = useNavigate()
  const gps        = useGPS()
  const activeRide = loadActiveRideGPS()
  const [routePts, setRoutePts] = useState([])
  const [elapsed,  setElapsed]  = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    gps.requestCurrent()
    if (activeRide?.tripId) setRoutePts(loadTripRoute(activeRide.tripId) || [])
  }, [])

  useEffect(() => {
    if (!activeRide?.startTime) return
    const tick = () => {
      const ms = Date.now() - new Date(activeRide.startTime).getTime()
      const m  = Math.floor(ms / 60000)
      const h  = Math.floor(m / 60)
      setElapsed(h > 0 ? `${h}h ${m % 60}m` : `${m}m`)
    }
    tick()
    timerRef.current = setInterval(tick, 30000)
    return () => clearInterval(timerRef.current)
  }, [activeRide?.startTime])

  const rideStatus = activeRide ? (activeRide.paused ? 'paused' : 'driving') : 'idle'

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-up pb-6">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/driver')}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors flex-shrink-0">
          <ArrowLeft size={17} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display font-black text-slate-800 dark:text-white text-xl">Live Vehicle Map</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Real-time GPS tracking</p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold
          ${gps.status === 'granted'    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : gps.status === 'requesting' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
          : 'bg-slate-100 text-slate-600 dark:bg-navy-800 dark:text-slate-400'}`}>
          <span className={`w-2 h-2 rounded-full ${
            gps.status === 'granted' ? 'bg-emerald-500' : gps.status === 'requesting' ? 'bg-blue-500 animate-pulse' : 'bg-slate-400'}`} />
          {gps.status === 'granted' ? 'Active' : gps.status === 'requesting' ? 'Acquiring' : 'Offline'}
        </div>
      </div>

      {/* Map */}
      <div>
        <div className="flex items-center justify-between mb-2 px-0.5">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Vehicle Position</p>
          <button onClick={() => { gps.requestCurrent(); if (activeRide?.tripId) setRoutePts(loadTripRoute(activeRide.tripId) || []) }}
            className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-500 transition-colors">
            <RefreshCw size={9} /> Refresh
          </button>
        </div>
        <VehicleMap coord={gps.currentCoord} startCoord={activeRide?.startCoord} routePoints={routePts} status={rideStatus} />
      </div>

      {/* Active trip stats */}
      {activeRide && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Car,   label:'Status',    value: rideStatus === 'driving' ? 'Moving' : rideStatus === 'paused' ? 'Paused' : 'Idle' },
            { icon: Clock, label:'Elapsed',   value: elapsed || '—' },
            { icon: Route, label:'Route Pts', value: String(routePts.length || 0) },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-3 text-center">
              <s.icon size={14} className="text-slate-400 mx-auto mb-1" />
              <p className="text-xs font-black text-slate-800 dark:text-white">{s.value}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wide">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Current location */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2 px-0.5">Current Location</p>
        <GPSStatusCard status={gps.status} coord={gps.currentCoord} error={gps.error} loading={gps.loading} onRefresh={gps.requestCurrent} />
      </div>

      {gps.currentCoord && <LocationPinCard type="current" coord={gps.currentCoord} label="Your current position" />}

      {activeRide && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-0.5">
            Trip — {activeRide.customer || 'Active Ride'}
          </p>
          {activeRide.startCoord && (
            <LocationPinCard type="start" coord={activeRide.startCoord}
              time={activeRide.startCoord.timestamp ? new Date(activeRide.startCoord.timestamp).toLocaleTimeString() : undefined} />
          )}
          {activeRide.endCoord && (
            <LocationPinCard type="end" coord={activeRide.endCoord}
              time={activeRide.endCoord.timestamp ? new Date(activeRide.endCoord.timestamp).toLocaleTimeString() : undefined} />
          )}
        </div>
      )}

      {!activeRide && (
        <div className="glass-card rounded-2xl p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center mx-auto mb-3">
            <Satellite size={22} className="text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">No Active Ride</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
            GPS tracking starts automatically when you begin a trip.
          </p>
          <button onClick={() => navigate('/driver')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md">
            <Navigation size={13} /> Go to Driver Home
          </button>
        </div>
      )}

      {!gps.isSupported && (
        <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4">
          <WifiOff size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">GPS Not Supported</p>
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-1 leading-relaxed">
              Please use Chrome or Safari on Android/iOS for GPS features.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}