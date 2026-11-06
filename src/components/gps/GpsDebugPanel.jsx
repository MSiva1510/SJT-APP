// ─── GPS Debug Panel ──────────────────────────────────────────
// Admin-only diagnostic view. Shows raw settings + health state
// for fast triage when the dashboard misbehaves.

import { useGpsHistory } from '../../context/GpsHistoryContext'
import { useAuth }      from '../../context/AuthContext'
import { Bug } from 'lucide-react'

export default function GpsDebugPanel() {
  const { isAdmin } = useAuth()
  const { health, settings, snapshots } = useGpsHistory()

  if (!isAdmin) return null

  return (
    <details className="glass-card rounded-2xl p-4">
      <summary className="flex items-center gap-2 cursor-pointer list-none">
        <Bug size={14} className="text-rose-500" />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
          Debug Panel (admin)
        </span>
      </summary>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Section title="Health State">
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
{JSON.stringify({
  ok:                 health.ok,
  lastPoll:           health.lastPoll,
  lastSuccess:        health.lastSuccess,
  lastError:          health.lastError,
  responseTimeMs:     health.responseTimeMs,
  consecutiveFailures: health.consecutiveFailures,
  lastVehicleCount:   health.lastVehicleCount,
  mock:               health.mock,
}, null, 2)}
          </pre>
        </Section>

        <Section title="GPS Settings (sensitive keys redacted)">
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
{JSON.stringify(redactSettings(settings), null, 2)}
          </pre>
        </Section>

        <Section title="Latest Snapshots (count + 1 sample)">
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
{JSON.stringify({
  count: snapshots.length,
  sample: snapshots[0] ? redactSnapshot(snapshots[0]) : null,
}, null, 2)}
          </pre>
        </Section>

        <Section title="Environment">
          <pre className="text-[10px] font-mono leading-relaxed">
{JSON.stringify({
  mock:           import.meta.env.VITE_GPS_MOCK === 'true',
  supabaseConfigured: !!import.meta.env.VITE_SUPABASE_URL,
}, null, 2)}
          </pre>
        </Section>
      </div>
    </details>
  )
}

function Section({ title, children }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-100 dark:border-navy-700">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">{title}</p>
      {children}
    </div>
  )
}

function redactSettings(s = {}) {
  return {
    ...s,
    company_id: s.company_id ? '••••' + String(s.company_id).slice(-4) : '',
    user_id:    s.user_id    ? '••••' + String(s.user_id).slice(-4)    : '',
    api_url:    s.api_url    ? s.api_url : '',
  }
}

function redactSnapshot(s = {}) {
  return {
    id: s.id,
    vehicle_id: s.vehicle_id,
    timestamp: s.timestamp,
    speed_kmh: s.speed_kmh,
    status: s.status,
    ignition: s.ignition,
    has_address: !!s.address,
  }
}