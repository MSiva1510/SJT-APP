// ─── System Health Page ───────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import {
  Activity, Database, CheckCircle, AlertTriangle, XCircle,
  RefreshCw, Clock, Users, Car, BookOpen, MessageSquare,
  Shield, Zap,
} from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { useAdmin } from '../../context/AdminContext'
import { getHealthSummary, checkDBConnection, getErrorStats, loadBackupHistory } from '../../services/adminService'
import { sessionManager } from '../../security/SessionManager'

function StatusDot({ ok }) {
  return ok
    ? <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0"/>
    : <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0"/>
}

function MetricCard({ icon: Icon, label, value, sub, color='text-slate-700 dark:text-slate-200', bg='bg-slate-50 dark:bg-navy-800/60' }) {
  return (
    <div className={`${bg} glass-card rounded-xl p-3.5`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon size={14} className="text-slate-400 dark:text-slate-500"/>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-2xl font-display font-black ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function SystemHealth() {
  const { errorStats } = useAdmin()
  const [health,    setHealth]   = useState(null)
  const [dbStatus,  setDbStatus] = useState(null)
  const [backups,   setBackups]  = useState([])
  const [checking,  setChecking] = useState(false)
  const [lastCheck, setLastCheck]= useState(null)
  const session = sessionManager.getSession()
  const idleSec = sessionManager.getIdleSeconds()

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const [h, db, bh] = await Promise.allSettled([
        getHealthSummary(), checkDBConnection(), loadBackupHistory()
      ])
      if (h.status  === 'fulfilled') setHealth(h.value)
      if (db.status === 'fulfilled') setDbStatus(db.value)
      if (bh.status === 'fulfilled') setBackups(bh.value)
      setLastCheck(new Date().toLocaleTimeString('en-IN'))
    } catch {}
    setChecking(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const dbOk = dbStatus?.connected
  const lastBackup = backups[0]
  const errCount   = errorStats?.unresolved || 0

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="System Health"
        subtitle={lastCheck ? `Last checked: ${lastCheck}` : 'Checking…'}
        action={
          <button onClick={refresh} disabled={checking}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-navy-700 transition-all disabled:opacity-50">
            <RefreshCw size={14} className={checking?'animate-spin':''}/> Refresh
          </button>
        }
      />

      {/* Status strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label:'Database',      ok: dbOk,             detail: dbStatus ? `${dbStatus.latencyMs}ms` : '—'     },
          { label:'Error Log',     ok: errCount===0,      detail: `${errCount} unresolved`                       },
          { label:'Session',       ok: !!session,         detail: session?.userName || 'Not active'              },
          { label:'Last Backup',   ok: lastBackup?.status==='success', detail: lastBackup ? lastBackup.provider : 'Never' },
        ].map(s => (
          <div key={s.label} className={`glass-card rounded-xl p-3 flex items-center gap-3 ${!s.ok?'border-l-4 border-amber-400':''}`}>
            <StatusDot ok={s.ok}/>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.label}</p>
              <p className="text-[10px] text-slate-400 truncate">{s.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* DB metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={BookOpen}     label="Total Bookings"   value={health?.total_bookings}   />
        <MetricCard icon={Car}          label="Active Trips"     value={health?.active_trips}     color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/10"/>
        <MetricCard icon={Users}        label="Active Drivers"   value={health?.active_drivers}   color="text-blue-600 dark:text-blue-400"   bg="bg-blue-50 dark:bg-blue-900/10"/>
        <MetricCard icon={Users}        label="Customers"        value={health?.total_customers}  />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard icon={Activity}     label="Audit Events 24h" value={health?.audit_events_24h}  />
        <MetricCard icon={MessageSquare}label="Comm Events 24h"  value={health?.comm_events_24h}   />
        <MetricCard icon={AlertTriangle}label="Unresolved Errors"value={errCount}
          color={errCount>0?'text-red-600 dark:text-red-400':'text-emerald-600 dark:text-emerald-400'}
          bg={errCount>0?'bg-red-50 dark:bg-red-900/10':'bg-emerald-50 dark:bg-emerald-900/10'} />
        <MetricCard icon={Database}     label="DB Latency"       value={dbStatus?`${dbStatus.latencyMs}ms`:'—'}
          color={!dbStatus?.connected?'text-red-500':'text-emerald-600 dark:text-emerald-400'} />
      </div>

      {/* Session info */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Current Session</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'User',     value: session?.userName || '—'   },
            { label:'Role',     value: session?.userRole || '—'   },
            { label:'Device',   value: session?.device   || '—'   },
            { label:'Idle',     value: `${Math.floor(idleSec/60)}m ${idleSec%60}s` },
          ].map(s => (
            <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5 capitalize">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Error log preview */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recent Errors</p>
          {errCount > 0 && <span className="text-[10px] font-bold text-red-500">{errCount} unresolved</span>}
        </div>
        {errCount === 0 ? (
          <div className="flex items-center gap-2 py-2">
            <CheckCircle size={14} className="text-emerald-500"/>
            <p className="text-xs text-slate-400">No unresolved errors</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Go to Admin → Error Log to review and resolve.</p>
        )}
      </div>

      {/* Backup history */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Backup History</p>
        {backups.length === 0 ? (
          <p className="text-xs text-slate-400">No backups recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {backups.slice(0,5).map((b,i) => (
              <div key={b.id||i} className="flex items-center gap-3 py-1.5 border-b border-slate-100 dark:border-navy-700 last:border-0">
                {b.status==='success'
                  ? <CheckCircle size={13} className="text-emerald-500 flex-shrink-0"/>
                  : b.status==='failed'
                  ? <XCircle size={13} className="text-red-500 flex-shrink-0"/>
                  : <Clock size={13} className="text-slate-400 flex-shrink-0"/>}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 capitalize">{b.provider||'manual'}</p>
                  <p className="text-[10px] text-slate-400">{b.initiated_by||'—'}</p>
                </div>
                <p className="text-[10px] text-slate-400 flex-shrink-0">
                  {b.started_at ? new Date(b.started_at).toLocaleDateString('en-IN') : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
