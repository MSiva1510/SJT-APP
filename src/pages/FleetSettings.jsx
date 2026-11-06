import { useState, useEffect } from 'react'
import { Save, Navigation, RefreshCw, CheckCircle, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react'
import Button     from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { gpsSettingsRepository, GPS_DEFAULT_SETTINGS, SENSITIVE_KEYS } from '../repositories/gpsSettingsRepository'
import { createGpsProvider }                                            from '../services/gpsProvider'
import { addAuditEvent }                                                from '../data/auditLogData'
import { useAuth }                                                      from '../context/AuthContext'

// ── Local primitives (mirrors Settings.jsx) ───────────────────
function Toggle({ checked, onChange }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-navy-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-50/80 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
        <Icon size={15} className="text-navy-700 dark:text-blue-400" />
        <p className="text-xs font-bold text-navy-800 dark:text-slate-200 uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, name, value, onChange, type = 'text', options, rows = 3, help, sensitive }) {
  const cls = `w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700
               bg-white dark:bg-navy-800/60 text-slate-700 dark:text-slate-200
               focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
               transition-colors font-body`
  const inputType = sensitive ? 'password' : type
  return (
    <div>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
        {sensitive && <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">sensitive</span>}
      </label>
      {type === 'select' ? (
        <select className={cls} value={value} onChange={e => onChange(name, e.target.value)}>
          {options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className={cls} rows={rows} value={value} onChange={e => onChange(name, e.target.value)} />
      ) : (
        <input type={inputType} className={cls} value={value} onChange={e => onChange(name, e.target.value)} />
      )}
      {help && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{help}</p>}
    </div>
  )
}

// ── Bare field metadata (one row per gps_settings key) ────────
const FIELDS = [
  { key: 'provider',         label: 'GPS Provider',         type: 'select',  options: ['kingstrack'], help: 'Swappable vendor adapter. Only `kingstrack` is registered today.' },
  { key: 'api_url',          label: 'API URL',              sensitive: true, help: 'Vendor endpoint. POST JSON.' },
  { key: 'company_id',       label: 'Company ID',           sensitive: true, help: 'Issued by the provider.' },
  { key: 'user_id',          label: 'User ID',              sensitive: true, help: 'Issued by the provider.' },
  { key: 'refresh_interval', label: 'Refresh Interval (s)', type: 'number',  help: 'Seconds between fleet polls (5–3600).' },
  { key: 'timeout',          label: 'Request Timeout (s)',  type: 'number',  help: 'Per-request timeout (5–300).' },
  { key: 'retry_count',      label: 'Retry Count',          type: 'number',  help: 'Retries on a failed poll (0–10).' },
]

export default function FleetSettings() {
  const { user } = useAuth()
  const [cfg,       setCfg]       = useState(GPS_DEFAULT_SETTINGS)
  const [enabled,   setEnabled]   = useState(GPS_DEFAULT_SETTINGS.enabled)
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [toast,     setToast]     = useState('')
  const [toastErr,  setToastErr]  = useState(false)
  const [loadError, setLoadError] = useState(null)
  const [testing,   setTesting]   = useState(false)
  const [testResult,setTestResult]= useState(null)

  useEffect(() => {
    setLoading(true)
    gpsSettingsRepository.getAsObject()
      .then(s => {
        setCfg({ ...GPS_DEFAULT_SETTINGS, ...s })
        setEnabled(!!s.enabled)
        setLoadError(null)
      })
      .catch(err => {
        console.error('[FleetSettings] load failed:', err)
        setLoadError('Could not load GPS settings. Try refreshing.')
      })
      .finally(() => setLoading(false))
  }, [])

  const update = (k, v) => setCfg(c => ({ ...c, [k]: v }))

  async function handleSave() {
    const errs = gpsSettingsRepository.validate({ ...cfg, enabled })
    if (errs.length) {
      setToastErr(true)
      setToast(errs.join(' • '))
      setTimeout(() => setToast(''), 4000)
      return
    }
    setSaving(true)
    try {
      const result = await gpsSettingsRepository.setMany(
        { ...cfg, enabled },
        { updated_by: user?.name ?? user?.email ?? 'system' }
      )
      if (!result.ok) throw new Error(result.error || 'Save failed')
      addAuditEvent('SETTINGS_UPDATED', {
        description: `GPS settings updated (provider: ${cfg.provider}, enabled: ${enabled})`,
        module: 'security',
        severity: 'info',
      })
      setToastErr(false)
      setToast('GPS settings saved successfully!')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setToastErr(true)
      setToast('Could not save GPS settings: ' + (err?.message ?? 'unknown error'))
      setTimeout(() => setToast(''), 4000)
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const provider = createGpsProvider(cfg.provider, { ...cfg, enabled })
      const result = await provider.healthCheck()
      setTestResult(result)
    } catch (err) {
      setTestResult({ ok: false, error: err?.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="glass-card rounded-2xl p-8 flex items-center gap-3">
          <Loader2 className="animate-spin text-blue-500" size={20} />
          <span className="text-sm text-slate-500">Loading GPS settings…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up max-w-3xl mx-auto">
      <PageHeader
        title="GPS Settings"
        subtitle="Configure the GPS provider that powers the live fleet dashboard."
        action={
          <Button variant="primary" icon={Save} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </Button>
        }
      />

      {loadError && (
        <div className="flex items-start gap-2 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50">
          <AlertTriangle size={16} className="text-rose-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-rose-600 dark:text-rose-400">{loadError}</p>
        </div>
      )}

      {toast && (
        <div className={`flex items-center gap-2 p-3.5 rounded-xl border ${
          toastErr
            ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400'
        }`}>
          {toastErr ? <AlertTriangle size={16} /> : <CheckCircle size={16} />}
          <p className="text-sm font-medium">{toast}</p>
        </div>
      )}

      <SectionCard icon={Navigation} title="GPS Provider">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FIELDS.map(f => (
            <Field
              key={f.key}
              label={f.label}
              name={f.key}
              type={f.type}
              value={cfg[f.key] ?? ''}
              onChange={update}
              options={f.options}
              sensitive={f.sensitive}
              help={f.help}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-navy-700">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">GPS Sync Enabled</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">When disabled, polling is suspended across the dashboard.</p>
          </div>
          <Toggle checked={enabled} onChange={setEnabled} />
        </div>
      </SectionCard>

      <SectionCard icon={ShieldCheck} title="Connection Test">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Verify the Provider can reach the configured endpoint. This issues a small health-check request and reports latency.
        </p>
        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={RefreshCw} onClick={handleTest} disabled={testing}>
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
          {testResult && (
            <span className={`text-sm font-medium ${testResult.ok ? 'text-emerald-600' : 'text-rose-600'}`}>
              {testResult.ok
                ? `Connected (${testResult.latencyMs} ms${testResult.mock ? ' • mock' : ''})`
                : `Failed: ${testResult.error || 'Connection test failed'}`}
            </span>
          )}
        </div>
      </SectionCard>

      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        Changes take effect on the next polling cycle. The dashboard will pick them up automatically.
      </p>
    </div>
  )
}
