// ─── Vehicle Timeline ─────────────────────────────────────────
// Day 33: Chronological event list derived from GPS segments + stops.
// Clicking an event row seeks the replay to that point.

import { memo } from 'react'
import { Navigation, ParkingSquare, Coffee, Flag, FlagTriangleRight, Gauge } from 'lucide-react'
import { formatDuration } from '../../services/gpsReplayService'

const TYPE_CFG = {
  start:   { label: 'Trip Start',  icon: FlagTriangleRight, dot: 'bg-emerald-500', line: 'border-emerald-300 dark:border-emerald-700', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  moving:  { label: 'Moving',      icon: Navigation,        dot: 'bg-blue-500',    line: 'border-blue-200 dark:border-blue-800',        badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  idle:    { label: 'Idling',      icon: Coffee,            dot: 'bg-amber-500',   line: 'border-amber-200 dark:border-amber-800',      badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  parked:  { label: 'Parked',      icon: ParkingSquare,     dot: 'bg-slate-500',   line: 'border-slate-200 dark:border-slate-700',      badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  stopped: { label: 'Stopped',     icon: ParkingSquare,     dot: 'bg-slate-500',   line: 'border-slate-200 dark:border-slate-700',      badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  end:     { label: 'Trip End',    icon: Flag,              dot: 'bg-red-500',     line: 'border-red-200 dark:border-red-800',          badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
}

function buildEvents(segments, stops, points) {
  if (!points?.length) return []
  const events = []

  // START
  events.push({
    type:       'start',
    ts:         points[0].timestamp,
    address:    points[0].address ?? '',
    pointIndex: 0,
  })

  // Segments → one event per type-change
  let pointOffset = 0
  for (const seg of segments) {
    if (!['moving', 'idle', 'stopped'].includes(seg.type)) { pointOffset += seg.points.length; continue }
    // Match stop metadata if this segment is a stop
    const matchedStop = stops.find(s => s.pointIndex === pointOffset)
    events.push({
      type:        seg.type === 'stopped' || seg.type === 'idle'
                     ? (matchedStop?.type ?? seg.type)
                     : seg.type,
      ts:          seg.startTs,
      endTs:       seg.endTs,
      address:     seg.points[0]?.address ?? '',
      durationSec: seg.durationSec,
      distance:    seg.distance,
      maxSpeed:    seg.maxSpeed,
      pointIndex:  pointOffset,
    })
    pointOffset += seg.points.length
  }

  // END
  events.push({
    type:       'end',
    ts:         points[points.length - 1].timestamp,
    address:    points[points.length - 1].address ?? '',
    pointIndex: points.length - 1,
  })

  return events
}

const VehicleTimeline = memo(function VehicleTimeline({ segments = [], stops = [], points = [], currentIndex = 0, onSeek }) {
  const events = buildEvents(segments, stops, points)

  if (!events.length) return (
    <div className="glass-card rounded-2xl p-6 text-center">
      <p className="text-sm text-slate-400">No timeline data. Load a trip to see events.</p>
    </div>
  )

  return (
    <div className="glass-card rounded-2xl p-4">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">Vehicle Timeline</h3>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-3 bottom-3 w-0.5 bg-slate-200 dark:bg-navy-700 rounded-full" />

        <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
          {events.map((ev, i) => {
            const cfg = TYPE_CFG[ev.type] ?? TYPE_CFG.stopped
            const Icon = cfg.icon
            const isCurrent = currentIndex >= ev.pointIndex &&
              (i === events.length - 1 || currentIndex < events[i + 1]?.pointIndex)

            return (
              <button
                key={i}
                onClick={() => onSeek?.(ev.pointIndex)}
                className={`w-full flex items-start gap-3 pl-2 pr-3 py-2.5 rounded-xl text-left transition-colors ${
                  isCurrent ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-slate-50/60 dark:hover:bg-navy-800/40'
                }`}
              >
                {/* Dot */}
                <div className={`relative z-10 flex-shrink-0 mt-0.5 w-5 h-5 rounded-full ${cfg.dot} flex items-center justify-center`}>
                  <Icon size={10} className="text-white" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                      {new Date(ev.ts).toLocaleTimeString()}
                    </span>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse">▶ NOW</span>
                    )}
                  </div>

                  {ev.address && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{ev.address}</p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {ev.durationSec != null && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        ⏱ {formatDuration(ev.durationSec)}
                      </span>
                    )}
                    {ev.distance != null && ev.type === 'moving' && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        📍 {ev.distance} km
                      </span>
                    )}
                    {ev.maxSpeed != null && ev.type === 'moving' && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-0.5">
                        <Gauge size={9} /> {ev.maxSpeed.toFixed(0)} km/h max
                      </span>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
})

export default VehicleTimeline
