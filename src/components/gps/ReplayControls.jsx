// ─── Replay Controls ──────────────────────────────────────────
// Day 33: Play/Pause/Stop + Speed selector + Progress slider.

import { memo } from 'react'
import { Play, Pause, Square, Gauge, MapPin, Clock } from 'lucide-react'
import { REPLAY_SPEEDS, formatDuration } from '../../services/gpsReplayService'

const ReplayControls = memo(function ReplayControls({
  playing, speed, currentIndex, total, currentPoint,
  onPlay, onPause, onStop, onSeek, onSpeedChange,
}) {
  const progress = total > 1 ? Math.round((currentIndex / (total - 1)) * 100) : 0

  return (
    <div className="glass-card rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Playback Controls</h3>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
          {currentIndex + 1} / {total} pts
        </span>
      </div>

      {/* Main controls */}
      <div className="flex items-center gap-3">
        {playing ? (
          <button onClick={onPause}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white transition-colors">
            <Pause size={15} /> Pause
          </button>
        ) : (
          <button onClick={onPlay} disabled={total === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Play size={15} /> {currentIndex > 0 && currentIndex < total - 1 ? 'Resume' : 'Play'}
          </button>
        )}
        <button onClick={onStop}
          className="p-2 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors">
          <Square size={15} />
        </button>

        {/* Speed selector */}
        <div className="flex items-center gap-1 ml-auto">
          <Gauge size={12} className="text-slate-400" />
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-navy-700">
            {REPLAY_SPEEDS.map(s => (
              <button key={s.value} onClick={() => onSpeedChange(s.value)}
                className={`px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  speed === s.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Progress slider */}
      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={currentIndex}
          onChange={e => onSeek(Number(e.target.value))}
          className="w-full h-1.5 rounded-full accent-blue-600 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          <span>{progress}%</span>
          <span>{total} points</span>
        </div>
      </div>

      {/* Current point info */}
      {currentPoint && (
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-100 dark:border-navy-700">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5"><Clock size={9} />Time</div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
              {new Date(currentPoint.timestamp).toLocaleTimeString()}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-100 dark:border-navy-700">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5"><Gauge size={9} />Speed</div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {Number(currentPoint.speed_kmh ?? 0).toFixed(0)} km/h
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-100 dark:border-navy-700">
            <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5"><MapPin size={9} />Odo</div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
              {currentPoint.odometer ? `${Number(currentPoint.odometer).toFixed(0)} km` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Current address */}
      {currentPoint?.address && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <MapPin size={10} className="mt-0.5 flex-shrink-0 text-blue-500" />
          {currentPoint.address}
        </p>
      )}
    </div>
  )
})

export default ReplayControls
