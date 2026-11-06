// ─── Fleet Vehicle List ───────────────────────────────────────
// Tabular view: click a row → opens detail side panel.
// GPS column uses gps_online boolean (not speed proxy).

import { Gauge, MapPin, Clock, ChevronRight, Radio, WifiOff, Flame } from 'lucide-react'

function timeAgo(iso) {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function vehicleStatus(s) {
  const ts = s.timestamp ? new Date(s.timestamp).getTime() : 0
  const isRecent = ts && (Date.now() - ts) < 5 * 60_000
  if (!isRecent) return 'offline'
  return Number(s.speed_kmh ?? 0) > 0 ? 'moving' : 'stopped'
}

const STATUS_BADGE = {
  moving:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  stopped: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  offline: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

export default function FleetVehicleList({ snapshots = [], onSelect, selectedId }) {
  if (!snapshots.length) return (
    <div className="glass-card rounded-2xl p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">No vehicles match the current filters.</p>
    </div>
  )

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
        <div className="col-span-4">Vehicle</div>
        <div className="col-span-2 text-right">Speed</div>
        <div className="col-span-2 text-center">Status</div>
        <div className="col-span-2 text-center">GPS/IGN</div>
        <div className="col-span-2 text-right">Updated</div>
      </div>
      <div className="max-h-[600px] overflow-y-auto">
        {snapshots.map(s => {
          const status    = vehicleStatus(s)
          const isSelected= selectedId === s.id
          const gpsOnline = s.gps_online === true
          const ignOn     = s.ignition   === true
          return (
            <button key={s.id} onClick={() => onSelect?.(s)}
              className={`w-full grid grid-cols-12 gap-2 px-4 py-3 text-left items-center border-b border-slate-100 dark:border-navy-700 last:border-0 transition-colors ${
                isSelected ? 'bg-blue-50/60 dark:bg-blue-900/20' : 'hover:bg-slate-50/60 dark:hover:bg-navy-800/40'}`}>
              <div className="col-span-4 min-w-0">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">
                  {s.registration || s.vehicle_id?.slice(0, 8) || '—'}
                </p>
                {s.driver_name && <p className="text-[11px] text-blue-500 dark:text-blue-400 truncate">{s.driver_name}</p>}
                <p className="text-[11px] text-slate-400 truncate flex items-center gap-1"><MapPin size={10} />{s.address || '—'}</p>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-end gap-1">
                  <Gauge size={11} className="text-slate-400" />{Number(s.speed_kmh ?? 0).toFixed(0)}<span className="text-[10px] text-slate-400">km/h</span>
                </span>
              </div>
              <div className="col-span-2 text-center">
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_BADGE[status]}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-center gap-1.5">
                <span title={gpsOnline ? 'GPS Active' : 'GPS Void'}
                  className={`flex items-center px-1.5 py-0.5 rounded text-[10px] ${gpsOnline ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {gpsOnline ? <Radio size={9} /> : <WifiOff size={9} />}
                </span>
                <span title={ignOn ? 'Ignition ON' : 'Ignition OFF'}
                  className={`flex items-center px-1.5 py-0.5 rounded text-[10px] ${ignOn ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  <Flame size={9} />
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1 text-[11px] text-slate-400">
                <Clock size={10} />{timeAgo(s.timestamp)}<ChevronRight size={12} className="text-slate-300" />
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
