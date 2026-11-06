import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle, Clock, Database, RefreshCw, Server,
  ShieldCheck, XCircle,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { checkDBConnection, getHealthSummary } from '../../services/adminService'
import supabase from '../../lib/supabase'

function StatusBadge({ connected }) {
  const ok = Boolean(connected)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
      ok
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300'
        : 'bg-red-100 text-red-700 dark:bg-red-900/25 dark:text-red-300'
    }`}>
      {ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
      {ok ? 'Connected' : 'Disconnected'}
    </span>
  )
}

function Metric({ icon: Icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 dark:bg-navy-800/60 dark:text-slate-200',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/15 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/15 dark:text-amber-300',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/15 dark:text-blue-300',
  }

  return (
    <div className={`glass-card rounded-xl p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="opacity-70" />
        <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      </div>
      <p className="text-2xl font-display font-black">{value ?? '-'}</p>
    </div>
  )
}

export default function DatabaseStatus() {
  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [checking, setChecking] = useState(false)
  const [lastChecked, setLastChecked] = useState(null)

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const [dbResult, summaryResult] = await Promise.allSettled([
        checkDBConnection(),
        getHealthSummary(),
      ])

      setStatus(dbResult.status === 'fulfilled'
        ? dbResult.value
        : { connected: false, latencyMs: 0 })
      if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value)
      setLastChecked(new Date().toLocaleString('en-IN'))
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const configured = Boolean(supabase)
  const connected = Boolean(status?.connected)

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Database Status"
        subtitle={lastChecked ? `Last checked: ${lastChecked}` : 'Checking connection...'}
        action={
          <button onClick={refresh} disabled={checking}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-navy-700 transition-all disabled:opacity-50">
            <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="glass-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Database size={22} className="text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Supabase connection</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {configured
                ? connected ? 'Database queries are responding normally.' : 'Client is configured, but the health query failed.'
                : 'Supabase environment values are not configured.'}
            </p>
          </div>
        </div>
        <StatusBadge connected={connected} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric icon={Clock} label="Latency" value={status ? `${status.latencyMs || 0}ms` : '-'} tone={connected ? 'green' : 'amber'} />
        <Metric icon={Server} label="Client Config" value={configured ? 'Ready' : 'Missing'} tone={configured ? 'blue' : 'amber'} />
        <Metric icon={Activity} label="Audit Events 24h" value={summary?.audit_events_24h ?? 0} />
        <Metric icon={ShieldCheck} label="Unresolved Errors" value={summary?.unresolved_errors ?? 0} tone={(summary?.unresolved_errors ?? 0) > 0 ? 'amber' : 'green'} />
      </div>

      {!connected && (
        <div className="glass-card rounded-2xl p-4 flex gap-3 border-l-4 border-amber-400">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-slate-800 dark:text-white">Connection needs attention</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Check `.env.local` for Supabase URL and anon key values, then verify the `settings` table is available.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
