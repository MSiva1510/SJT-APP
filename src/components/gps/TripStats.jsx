// ─── Trip Statistics Card ─────────────────────────────────────
// Day 33: Displays computed trip metrics from gpsReplayService.

import { memo } from 'react'
import { Clock, Route, Gauge, TrendingUp, ParkingSquare, Coffee } from 'lucide-react'
import { formatDuration, formatTs } from '../../services/gpsReplayService'

function Stat({ icon: Icon, label, value, color = 'text-slate-600 dark:text-slate-300' }) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 dark:border-navy-700 last:border-0">
      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-navy-800 flex-shrink-0">
        <Icon size={13} className={color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value ?? '—'}</p>
      </div>
    </div>
  )
}

const TripStats = memo(function TripStats({ stats }) {
  if (!stats) return null

  return (
    <div className="glass-card rounded-2xl p-4 space-y-1">
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Trip Statistics</h3>

      <Stat icon={Clock}         label="Trip Start"       value={formatTs(stats.startTs)} color="text-emerald-500" />
      <Stat icon={Clock}         label="Trip End"         value={formatTs(stats.endTs)}   color="text-red-500" />
      <Stat icon={Clock}         label="Total Duration"   value={formatDuration(stats.durationSec)} />
      <Stat icon={Route}         label="Distance"         value={`${stats.totalDistanceKm ?? 0} km`} color="text-blue-500" />
      <Stat icon={Gauge}         label="Average Speed"    value={`${stats.avgSpeedKmh ?? 0} km/h`} />
      <Stat icon={TrendingUp}    label="Max Speed"        value={`${stats.maxSpeedKmh ?? 0} km/h`} color="text-amber-500" />
      <Stat icon={ParkingSquare} label="Number of Stops"  value={stats.stopCount ?? 0} color="text-slate-500" />
      <Stat icon={Coffee}        label="Total Idle Time"  value={formatDuration(stats.idleTimeSec)} color="text-orange-500" />
    </div>
  )
})

export default TripStats
