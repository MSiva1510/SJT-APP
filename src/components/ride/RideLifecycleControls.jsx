// ─── RideLifecycleControls — Start / Pause / Resume / End ────
// Renders the correct action buttons based on current rideState.
// Fully reusable — used in ActiveTripCard, TripCard rows, etc.

import { Play, Pause, RotateCcw, CheckCircle, X } from 'lucide-react'
import { RIDE_STATES } from '../../hooks/useRideLifecycle'

const BTN_BASE = 'inline-flex items-center justify-center gap-1.5 font-bold rounded-xl transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed select-none'

const SIZE = {
  sm: { px: 'px-3 py-1.5', text: 'text-xs', icon: 12 },
  md: { px: 'px-4 py-2.5', text: 'text-sm', icon: 15 },
  lg: { px: 'px-5 py-3',   text: 'text-base', icon: 17 },
}

function Btn({ label, icon: Icon, onClick, variant, size = 'md', fullWidth }) {
  const s = SIZE[size] || SIZE.md
  const variants = {
    start:  'bg-navy-900 dark:bg-blue-700 text-white hover:bg-navy-800 dark:hover:bg-blue-600 shadow-md hover:shadow-lg',
    pause:  'bg-amber-500 text-white hover:bg-amber-400 shadow-md',
    resume: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md',
    end:    'bg-emerald-600 text-white hover:bg-emerald-500 shadow-md',
    cancel: 'bg-transparent border border-white/25 text-white/70 hover:bg-white/10 hover:text-white',
    cancelDark: 'bg-transparent border border-slate-200 dark:border-navy-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700',
  }
  return (
    <button
      onClick={onClick}
      className={`${BTN_BASE} ${s.px} ${s.text} ${variants[variant] || variants.start} ${fullWidth ? 'w-full' : ''}`}
    >
      {Icon && <Icon size={s.icon} />}
      {label}
    </button>
  )
}

export default function RideLifecycleControls({
  rideState,
  onPause, onResume, onEnd, onCancel,
  size = 'md',
  layout = 'row',     // 'row' | 'grid'
  dark = false,       // true when rendered on dark (navy) background
}) {
  const isStarted = rideState === RIDE_STATES.STARTED
  const isPaused  = rideState === RIDE_STATES.PAUSED
  const isActive  = isStarted || isPaused

  if (!isActive) return null

  const wrapCls = layout === 'grid'
    ? 'grid grid-cols-2 gap-2'
    : 'flex gap-2'

  return (
    <div className={wrapCls}>
      {/* Pause / Resume toggle */}
      {isStarted && (
        <Btn label="Pause" icon={Pause} onClick={onPause} variant="pause" size={size} fullWidth={layout === 'grid'} />
      )}
      {isPaused && (
        <Btn label="Resume" icon={RotateCcw} onClick={onResume} variant="resume" size={size} fullWidth={layout === 'grid'} />
      )}

      {/* End ride — always shown */}
      <Btn label="End Ride" icon={CheckCircle} onClick={onEnd} variant="end" size={size} fullWidth={layout === 'grid'} />

      {/* Cancel — optional */}
      {onCancel && (
        <button
          onClick={onCancel}
          className={`${BTN_BASE} ${SIZE[size].px} ${SIZE[size].text} flex items-center gap-1.5
            ${dark
              ? 'bg-transparent border border-white/20 text-white/60 hover:text-white hover:bg-white/10'
              : 'bg-transparent border border-slate-200 dark:border-navy-600 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-700'
            }`}
          title="Cancel ride"
        >
          <X size={SIZE[size].icon} />
          <span className="hidden sm:inline">Cancel</span>
        </button>
      )}
    </div>
  )
}

// ── Start button — shown on pending trip cards ─────────────────
export function StartRideButton({ onStart, size = 'md', fullWidth = false, label = 'Start Ride', disabled = false }) {
  const s = SIZE[size] || SIZE.md
  return (
    <button
      onClick={onStart}
      disabled={disabled}
      className={`${BTN_BASE} ${s.px} ${s.text} bg-navy-900 dark:bg-blue-700 text-white hover:bg-navy-800 dark:hover:bg-blue-600 shadow-md hover:shadow-lg ${fullWidth ? 'w-full' : ''}`}
    >
      <Play size={s.icon} />
      {label}
    </button>
  )
}
