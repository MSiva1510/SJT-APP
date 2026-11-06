// ─── LocationPinCard — shows a captured Start or End location ─
import { MapPin, Clock, Navigation, CheckCircle } from 'lucide-react'

export default function LocationPinCard({ type, coord, time, label }) {
  // type: 'start' | 'end' | 'current'
  const cfgMap = {
    start:   { dotColor: 'bg-emerald-500', borderColor: 'border-emerald-200 dark:border-emerald-800/50', bg: 'bg-emerald-50/60 dark:bg-emerald-900/15', icon: Navigation, iconColor: 'text-emerald-600 dark:text-emerald-400', heading: label || 'Start Location', tag: 'TRIP START' },
    end:     { dotColor: 'bg-red-500',     borderColor: 'border-red-200 dark:border-red-800/50',         bg: 'bg-red-50/60 dark:bg-red-900/15',           icon: CheckCircle, iconColor: 'text-red-600 dark:text-red-400',       heading: label || 'End Location',   tag: 'TRIP END'   },
    current: { dotColor: 'bg-blue-500 animate-pulse', borderColor: 'border-blue-200 dark:border-blue-800/50', bg: 'bg-blue-50/60 dark:bg-blue-900/15', icon: MapPin, iconColor: 'text-blue-600 dark:text-blue-400', heading: label || 'Current Location', tag: 'NOW' },
  }
  const cfg  = cfgMap[type] || cfgMap.current
  const Icon = cfg.icon

  if (!coord) return null

  return (
    <div className={`rounded-2xl border ${cfg.borderColor} ${cfg.bg} p-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-shrink-0">
            <div className={`w-9 h-9 rounded-xl bg-white dark:bg-navy-800 border ${cfg.borderColor} flex items-center justify-center`}>
              <Icon size={16} className={cfg.iconColor} />
            </div>
            <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-navy-800 ${cfg.dotColor}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${cfg.iconColor}`}>{cfg.heading}</p>
            <p className={`text-[9px] font-bold uppercase tracking-wider ${cfg.iconColor} opacity-70`}>{cfg.tag}</p>
          </div>
        </div>
        {(time || coord.timestamp) && (
          <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-mono flex-shrink-0">
            <Clock size={9} />
            {time || new Date(coord.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="bg-white/70 dark:bg-navy-800/60 rounded-xl px-2.5 py-2 border border-white/50 dark:border-navy-700">
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Latitude</p>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">{coord.lat}°</p>
        </div>
        <div className="bg-white/70 dark:bg-navy-800/60 rounded-xl px-2.5 py-2 border border-white/50 dark:border-navy-700">
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Longitude</p>
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">{coord.lng}°</p>
        </div>
      </div>

      <div className="bg-white/70 dark:bg-navy-800/60 rounded-xl px-2.5 py-2 border border-white/50 dark:border-navy-700 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Area</p>
          <p className={`text-xs font-bold truncate ${cfg.iconColor}`}>{coord.area}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-0.5">Accuracy</p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400">±{coord.accuracy}m</p>
        </div>
      </div>
    </div>
  )
}
