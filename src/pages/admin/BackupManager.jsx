// ─── Backup Manager Page ──────────────────────────────────────
import { useState } from 'react'
import { Database, Download, CheckCircle, Clock, XCircle, Play, RefreshCw, Info } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { useAdmin } from '../../context/AdminContext'
import { runManualBackup } from '../../services/adminService'
import { useAuth } from '../../context/AuthContext'

const PROVIDER_INFO = {
  manual:   { label:'Manual Backup',  icon:'💾', color:'text-blue-500',    bg:'bg-blue-50 dark:bg-blue-900/10',       note:'Download a JSON snapshot of your data now.' },
  supabase: { label:'Supabase Auto',  icon:'⚡', color:'text-violet-500',  bg:'bg-violet-50 dark:bg-violet-900/10',   note:'Automated daily backups via Supabase. Configure in Supabase dashboard.' },
  gdrive:   { label:'Google Drive',   icon:'📁', color:'text-emerald-500', bg:'bg-emerald-50 dark:bg-emerald-900/10', note:'Connect Google Drive API to enable automatic cloud backups.' },
  onedrive: { label:'OneDrive',       icon:'☁️', color:'text-sky-500',     bg:'bg-sky-50 dark:bg-sky-900/10',         note:'Connect Microsoft OneDrive to enable automatic cloud backups.' },
}

function StatusBadge({ status }) {
  const cfg = {
    success:{ label:'Success', cls:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    failed: { label:'Failed',  cls:'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'                 },
    running:{ label:'Running', cls:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'             },
    pending:{ label:'Pending', cls:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'            },
    never:  { label:'Never',   cls:'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'            },
  }[status] || { label:status, cls:'bg-slate-100 text-slate-500' }
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.cls}`}>{cfg.label}</span>
}

export default function BackupManager() {
  const { user } = useAuth()
  const { backupConfigs, backupHistory, setBackupHistory } = useAdmin()
  const [running, setRunning] = useState(false)
  const [result,  setResult]  = useState(null)

  const handleManualBackup = async () => {
    setRunning(true); setResult(null)
    try {
      const res = await runManualBackup(user?.name)
      setResult({ ok:true, msg:'Backup completed successfully (simulation).' })
      setBackupHistory(prev => [res, ...prev])
    } catch {
      setResult({ ok:false, msg:'Backup failed. Check error log.' })
    }
    setRunning(false)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Backup Manager" subtitle="Configure and run data backups" />

      {/* Info banner */}
      <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3.5 border border-blue-100 dark:border-blue-800/30">
        <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5"/>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Provider integrations (Google Drive, OneDrive, Supabase Auto) are architecture-ready.
          Connect API credentials in your backend to enable cloud backups without changing this UI.
        </p>
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {backupConfigs.map(cfg => {
          const info = PROVIDER_INFO[cfg.provider] || PROVIDER_INFO.manual
          return (
            <div key={cfg.id} className={`glass-card rounded-2xl p-4 space-y-3 ${cfg.is_active?'border-l-4 border-emerald-500':''}`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${info.bg} flex items-center justify-center text-xl flex-shrink-0`}>
                  {info.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-800 dark:text-white">{info.label}</p>
                    {cfg.is_active && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Active</span>}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{info.note}</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Retention: {cfg.retention_days}d</span>
                <StatusBadge status={cfg.last_backup_status||'never'}/>
              </div>
              {cfg.provider === 'manual' && (
                <button onClick={handleManualBackup} disabled={running}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-50">
                  {running ? <><RefreshCw size={12} className="animate-spin"/> Running…</> : <><Play size={12}/> Run Backup Now</>}
                </button>
              )}
              {cfg.provider !== 'manual' && (
                <div className="flex items-center gap-1.5 py-2 px-3 rounded-xl bg-slate-50 dark:bg-navy-800/40 border border-dashed border-slate-300 dark:border-navy-600 text-slate-400 text-[11px]">
                  🔌 Provider not connected — configure API credentials to enable
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Result alert */}
      {result && (
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${result.ok
          ? 'bg-emerald-50 dark:bg-emerald-900/15 border-emerald-200 dark:border-emerald-800/30 text-emerald-700 dark:text-emerald-400'
          : 'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800/30 text-red-600 dark:text-red-400'
        }`}>
          {result.ok ? <CheckCircle size={14}/> : <XCircle size={14}/>}
          <p className="text-xs font-bold">{result.msg}</p>
        </div>
      )}

      {/* Backup history */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-4 py-3 bg-slate-50 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Backup History</p>
        </div>
        {backupHistory.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-8 text-slate-400">
            <Database size={18}/><p className="text-sm">No backup records yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-navy-800">
            {backupHistory.map((b,i) => (
              <div key={b.id||i} className="flex items-center gap-3 px-4 py-3">
                {b.status==='success' ? <CheckCircle size={13} className="text-emerald-500 flex-shrink-0"/>
                : b.status==='failed' ? <XCircle size={13} className="text-red-500 flex-shrink-0"/>
                : <Clock size={13} className="text-slate-400 flex-shrink-0"/>}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 capitalize">{b.provider||'manual'}</p>
                  <p className="text-[10px] text-slate-400">by {b.initiated_by||'system'}</p>
                </div>
                <StatusBadge status={b.status||'pending'}/>
                <p className="text-[10px] text-slate-400 flex-shrink-0">
                  {b.started_at ? new Date(b.started_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
