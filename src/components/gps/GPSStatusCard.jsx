import { RefreshCw, Navigation, WifiOff, AlertTriangle, Signal } from 'lucide-react'

const STATUS_CFG = {
  idle:        { icon: Navigation,   label: 'GPS Ready',        sub: 'Tap Refresh to capture location',    color: 'text-slate-500 dark:text-slate-400',      bg: 'bg-slate-50 dark:bg-navy-800/50',          dot: 'bg-slate-400',                    ring: '' },
  requesting:  { icon: RefreshCw,    label: 'Getting GPS…',     sub: 'Waiting for satellite signal',       color: 'text-blue-600 dark:text-blue-400',         bg: 'bg-blue-50 dark:bg-blue-900/20',           dot: 'bg-blue-500 animate-pulse',       ring: 'ring-1 ring-blue-300/40' },
  granted:     { icon: Signal,       label: 'GPS Active',       sub: 'Location successfully captured',     color: 'text-emerald-600 dark:text-emerald-400',   bg: 'bg-emerald-50 dark:bg-emerald-900/20',     dot: 'bg-emerald-500',                  ring: 'ring-1 ring-emerald-300/40' },
  denied:      { icon: WifiOff,      label: 'Permission Denied',sub: 'Enable location in device settings', color: 'text-red-600 dark:text-red-400',           bg: 'bg-red-50 dark:bg-red-900/20',             dot: 'bg-red-500',                      ring: 'ring-1 ring-red-300/40' },
  unavailable: { icon: WifiOff,      label: 'GPS Unavailable',  sub: 'Move to an open area and retry',     color: 'text-amber-600 dark:text-amber-400',       bg: 'bg-amber-50 dark:bg-amber-900/20',         dot: 'bg-amber-500',                    ring: 'ring-1 ring-amber-300/40' },
  timeout:     { icon: AlertTriangle,label: 'GPS Timed Out',    sub: 'Signal lost — tap to retry',         color: 'text-amber-600 dark:text-amber-400',       bg: 'bg-amber-50 dark:bg-amber-900/20',         dot: 'bg-amber-500',                    ring: 'ring-1 ring-amber-300/40' },
}

// ── Small inline chip for embedding in banners ────────────────
export function GPSChip({ status, coord, onRefresh, loading }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.idle
  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-navy-700 ${cfg.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span className={`text-[10px] font-bold ${cfg.color}`}>{cfg.label}</span>
      {coord && <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate max-w-[100px]">{coord.area}</span>}
      {onRefresh && (
        <button onClick={onRefresh} disabled={loading}
          className="w-4 h-4 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity disabled:cursor-not-allowed">
          <RefreshCw size={9} className={loading ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  )
}

// ── Coordinate display box ────────────────────────────────────
function CoordBox({ label, value }) {
  return (
    <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl px-3 py-2 border border-slate-100 dark:border-navy-700">
      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono truncate">{value ?? '—'}</p>
    </div>
  )
}

// ── Full GPS card ─────────────────────────────────────────────
export default function GPSStatusCard({ status, coord, error, loading, onRefresh }) {
  const cfg  = STATUS_CFG[status] || STATUS_CFG.idle
  const Icon = cfg.icon

  return (
    <div className={`glass-card rounded-2xl p-4 ${cfg.ring} transition-all duration-300`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 border border-slate-100 dark:border-navy-700`}>
            <Icon size={17} className={`${cfg.color} ${status === 'requesting' ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${cfg.color}`}>{cfg.label}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{cfg.sub}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 text-xs font-bold transition-all active:scale-95 text-slate-600 dark:text-slate-300 ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-navy-700 cursor-pointer'}`}
            >
              <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Getting…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl px-3 py-2.5 mb-3">
          <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-400 font-medium leading-relaxed">{error}</p>
        </div>
      )}

      {/* Coordinate display */}
      {coord ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <CoordBox label="Latitude"  value={`${coord.lat}°`} />
            <CoordBox label="Longitude" value={`${coord.lng}°`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><CoordBox label="Area / Location" value={coord.area} /></div>
            <CoordBox label="Accuracy" value={`±${coord.accuracy}m`} />
          </div>
          {coord.timestamp && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-right font-mono">
              {new Date(coord.timestamp).toLocaleTimeString()}
            </p>
          )}
        </div>
      ) : (
        !error && (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
            {status === 'idle' ? 'Tap Refresh to capture your current location' : 'Acquiring location…'}
          </p>
        )
      )}
    </div>
  )
}
