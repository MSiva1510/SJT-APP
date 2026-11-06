// ─── ActiveTripCard — full active ride display with timer ─────
import { Phone, MapPin, Clock, Car, User, ChevronRight, Zap } from 'lucide-react'
import { RIDE_STATE_CFG, formatElapsed } from '../../hooks/useRideLifecycle'
import RideLifecycleControls from './RideLifecycleControls'

function InfoRow({ label, value, icon: Icon, mono }) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 dark:border-navy-700 last:border-0">
      {Icon && <Icon size={13} className="text-slate-400 dark:text-slate-500 flex-shrink-0" />}
      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide w-16 flex-shrink-0">{label}</span>
      <span className={`text-xs font-semibold text-slate-700 dark:text-slate-200 truncate ${mono ? 'font-mono' : ''}`}>{value || '—'}</span>
    </div>
  )
}

export default function ActiveTripCard({
  ride,
  elapsed,
  rideState,
  onPause,
  onResume,
  onEnd,
  onCancel,
  compact = false,
}) {
  if (!ride) return null

  const cfg     = RIDE_STATE_CFG[rideState] || RIDE_STATE_CFG.pending
  const elFmt   = formatElapsed(elapsed)
  const isPaused = rideState === 'paused'
  const isStarted = rideState === 'started'

  if (compact) {
    return (
      <div className={`glass-card rounded-2xl overflow-hidden border ${cfg.border}`}>
        {/* Accent top bar */}
        <div className={`h-1 ${isStarted ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : isPaused ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-gradient-to-r from-slate-300 to-slate-400'}`} />
        <div className="p-3.5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
              <div className="min-w-0">
                <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{ride.customer}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{ride.tripId}</p>
              </div>
            </div>
            {/* Timer */}
            <div className={`flex-shrink-0 px-2.5 py-1.5 rounded-xl font-mono font-black text-sm tracking-wider ${isStarted ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : isPaused ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300'}`}>
              {elFmt}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-slate-500 mb-3">
            <MapPin size={9} />
            <span className="truncate">{ride.pickup} → {ride.drop}</span>
          </div>
          <RideLifecycleControls
            rideState={rideState}
            onPause={onPause} onResume={onResume} onEnd={onEnd} onCancel={onCancel}
            size="sm" layout="row"
          />
        </div>
      </div>
    )
  }

  // Full card
  return (
    <div className={`rounded-2xl overflow-hidden shadow-xl border ${cfg.border}`}
         style={{ background: 'linear-gradient(135deg,#0d1b4b 0%,#1e3a8a 55%,#1d4ed8 100%)' }}>
      {/* Animated progress bar */}
      <div className="h-1 bg-white/10 overflow-hidden">
        {isStarted && (
          <div className="h-full bg-gradient-to-r from-blue-400 to-cyan-300 rounded-full"
               style={{ width: '100%', animation: 'shimmer 2s ease-in-out infinite' }} />
        )}
        {isPaused && (
          <div className="h-full bg-gradient-to-r from-amber-400 to-orange-300 rounded-full" style={{ width: '60%' }} />
        )}
      </div>

      <div className="p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${isStarted ? 'bg-blue-500/30 text-blue-200' : isPaused ? 'bg-amber-500/30 text-amber-200' : 'bg-white/10 text-white/60'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
              <span className="text-white/40 text-[10px] font-mono">{ride.tripId}</span>
            </div>
            <h3 className="font-display font-black text-white text-xl leading-tight truncate">{ride.customer}</h3>
            <a href={`tel:${ride.contact}`} className="text-blue-300 text-xs mt-0.5 flex items-center gap-1 hover:text-blue-200 transition-colors w-fit">
              <Phone size={10} /> {ride.contact}
            </a>
          </div>

          {/* Running timer — the hero element */}
          <div className="flex-shrink-0 text-right">
            <div className={`px-3 py-2 rounded-2xl font-mono font-black text-2xl tracking-wider leading-none ${
              isStarted
                ? 'bg-blue-500/25 text-white shadow-inner border border-blue-400/30'
                : isPaused
                ? 'bg-amber-500/25 text-amber-200 border border-amber-400/30'
                : 'bg-white/10 text-white/60 border border-white/10'
            }`}>
              {elFmt}
            </div>
            <p className="text-white/40 text-[10px] mt-1 text-center">
              {isStarted ? 'elapsed' : isPaused ? 'paused' : 'timer'}
            </p>
          </div>
        </div>

        {/* Route */}
        <div className="bg-white/8 rounded-xl p-3 mb-4">
          <div className="flex items-stretch gap-2.5">
            <div className="flex flex-col items-center gap-1 pt-0.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="flex-1 w-0.5 bg-white/15 rounded min-h-[16px]" />
              <div className="w-2.5 h-2.5 rounded-full bg-red-400 flex-shrink-0" />
            </div>
            <div className="flex-1 min-w-0 space-y-2.5">
              <div>
                <p className="text-[9px] text-white/35 font-bold uppercase tracking-wide">Pickup</p>
                <p className="text-white text-xs font-semibold leading-tight truncate">{ride.pickup}</p>
              </div>
              <div>
                <p className="text-[9px] text-white/35 font-bold uppercase tracking-wide">Drop</p>
                <p className="text-white text-xs font-semibold leading-tight truncate">{ride.drop}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xl font-display font-black text-white">Rs. {(ride.fare || 0).toLocaleString('en-IN')}</p>
              <p className="text-blue-300 text-[10px]">{ride.km} km</p>
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Vehicle',   value: ride.vehicle || '—',   icon: Car  },
            { label: 'Started',   value: ride.startTime || '—', icon: Clock },
            { label: 'Pauses',    value: ride.pauseCount || 0,  icon: Zap },
          ].map(d => (
            <div key={d.label} className="bg-white/8 rounded-xl p-2.5 text-center border border-white/8">
              <d.icon size={11} className="text-white/40 mx-auto mb-1" />
              <p className="text-white font-bold text-xs leading-tight">{d.value}</p>
              <p className="text-white/40 text-[9px] uppercase tracking-wide mt-0.5">{d.label}</p>
            </div>
          ))}
        </div>

        {/* Pause notice */}
        {isPaused && ride.pausedAt && (
          <div className="flex items-center gap-2 bg-amber-500/15 border border-amber-400/20 rounded-xl px-3 py-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-200 font-medium">
              Paused at {new Date(ride.pausedAt).toLocaleTimeString()} — tap Resume to continue
            </p>
          </div>
        )}

        {/* Lifecycle controls */}
        <RideLifecycleControls
          rideState={rideState}
          onPause={onPause} onResume={onResume} onEnd={onEnd} onCancel={onCancel}
          size="md" layout="row"
        />
      </div>
    </div>
  )
}
