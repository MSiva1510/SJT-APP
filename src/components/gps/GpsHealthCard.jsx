// ─── GPS Health Card ──────────────────────────────────────────
// Provider status, last sync, last error, API response time,
// manual sync button. Renders inline inside the Fleet page.

import { useGpsHistory } from '../../context/GpsHistoryContext'
import { Activity, RefreshCw, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react'

function timeAgo(iso) {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  if (ms < 60_000) return `${Math.floor(ms / 1000)} s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`
  return new Date(iso).toLocaleString()
}

function StatusBadge({ ok }) {
  if (ok === null) {
    return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">Idle</span>
  }
  if (ok) {
    return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Connected</span>
  }
  return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Disconnected</span>
}

export default function GpsHealthCard() {
  const { health, running, syncNow, settings } = useGpsHistory()

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600">
            <Activity size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">GPS Provider Health</h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              {settings?.provider || 'kingstrack'} • refresh every {settings?.refresh_interval ?? 60}s
            </p>
          </div>
        </div>
        <StatusBadge ok={health.ok} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat icon={Clock}       label="Last Sync"       value={timeAgo(health.lastSuccess)} />
        <Stat icon={Zap}         label="Response Time"   value={health.responseTimeMs ? `${health.responseTimeMs} ms` : '—'} />
        <Stat icon={Activity}    label="Vehicles"        value={health.lastVehicleCount ?? 0} />
        <Stat icon={RefreshCw}   label="Status"          value={running ? 'Running' : 'Stopped'} />
      </div>

      {health.lastError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 mb-3">
          <XCircle size={14} className="text-rose-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-rose-600 dark:text-rose-400">{health.lastError}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {health.mock ? 'Mock mode (no real API calls).' : 'Live mode.'}
        </p>
        <button
          onClick={() => syncNow()}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw size={12} /> Sync Now
        </button>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-100 dark:border-navy-700">
      <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-1">
        <Icon size={10} />
        {label}
      </div>
      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{value}</p>
    </div>
  )
}