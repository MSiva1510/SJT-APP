import { useState, useEffect } from 'react'
import { Save, Building, FileText, Bell, Palette, CheckCircle, RotateCcw, AlertTriangle } from 'lucide-react'
import Button     from '../components/ui/Button'
import PageHeader from '../components/ui/PageHeader'
import { loadSettings, saveSettings, resetSettings, DEFAULT_SETTINGS } from '../data/settingsData'

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

function Field({ label, name, value, onChange, type = 'text', options, rows = 3 }) {
  const cls = `w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700
               bg-white dark:bg-navy-800/60 text-slate-700 dark:text-slate-200
               focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
               transition-colors font-body`
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      {type === 'select' ? (
        <select className={cls} value={value} onChange={e => onChange(name, e.target.value)}>
          {options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className={cls} rows={rows} value={value} onChange={e => onChange(name, e.target.value)} />
      ) : (
        <input type={type} className={cls} value={value} onChange={e => onChange(name, e.target.value)} />
      )}
    </div>
  )
}

const THEME_COLORS = [
  { label:'Navy Blue',  value:'#1e3a5f', bg:'bg-[#1e3a5f]' },
  { label:'Deep Green', value:'#14532d', bg:'bg-[#14532d]' },
  { label:'Indigo',     value:'#312e81', bg:'bg-[#312e81]' },
  { label:'Charcoal',   value:'#1f2937', bg:'bg-[#1f2937]' },
  { label:'Burgundy',   value:'#7f1d1d', bg:'bg-[#7f1d1d]' },
  { label:'Teal',       value:'#134e4a', bg:'bg-[#134e4a]' },
]
const BRAND_COLORS = [
  { label:'Gold',    value:'#f59e0b', bg:'bg-amber-400'  },
  { label:'Sky',     value:'#0ea5e9', bg:'bg-sky-500'    },
  { label:'Emerald', value:'#10b981', bg:'bg-emerald-500'},
  { label:'Orange',  value:'#f97316', bg:'bg-orange-500' },
  { label:'Rose',    value:'#f43f5e', bg:'bg-rose-500'   },
  { label:'Violet',  value:'#8b5cf6', bg:'bg-violet-500' },
]

export default function Settings() {
  const [cfg,        setCfg]        = useState(DEFAULT_SETTINGS)
  const [loading,    setLoading]    = useState(true)
  const [saved,      setSaved]      = useState(false)
  const [toast,      setToast]      = useState('')
  const [loadError,  setLoadError]  = useState(null)
  const [themeColor, setThemeColor] = useState(() => localStorage.getItem('sjt_theme_color') || '#1e3a5f')
  const [brandColor, setBrandColor] = useState(() => localStorage.getItem('sjt_brand_color') || '#f59e0b')

  const fetchSettings = () => {
    setLoading(true)
    loadSettings()
      .then(s => { setCfg(s); setLoadError(null) })
      .catch(err => { console.error('[Settings] load failed:', err); setLoadError('Could not load settings. Try refreshing.') })
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchSettings() }, [])

  const updateBiz    = (k, v) => setCfg(c => ({ ...c, biz:           { ...c.biz,           [k]: v } }))
  const updateInv    = (k, v) => setCfg(c => ({ ...c, invoice:       { ...c.invoice,       [k]: v } }))
  const updateNotif  = (k, v) => setCfg(c => ({ ...c, notifications: { ...c.notifications, [k]: v } }))
  const updateAppear = (k, v) => setCfg(c => ({ ...c, appearance:    { ...c.appearance,    [k]: v } }))

  async function handleSave() {
    try {
      await saveSettings(cfg)
      localStorage.setItem('sjt_theme_color', themeColor)
      localStorage.setItem('sjt_brand_color', brandColor)
      setSaved(true); setToast('Settings saved successfully!')
      setTimeout(() => { setSaved(false); setToast('') }, 3000)
    } catch (err) {
      setToast('Could not save settings. Please try again.')
      setTimeout(() => setToast(''), 3000)
    }
  }

  async function handleReset() {
    if (!window.confirm('Reset all settings to defaults?')) return
    try {
      await resetSettings()
      fetchSettings()
      setThemeColor('#1e3a5f'); setBrandColor('#f59e0b')
      localStorage.removeItem('sjt_theme_color'); localStorage.removeItem('sjt_brand_color')
      setToast('Settings reset to defaults.')
      setTimeout(() => setToast(''), 3000)
    } catch (err) {
      setToast('Could not reset settings. Please try again.')
      setTimeout(() => setToast(''), 3000)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 animate-fade-up max-w-3xl">
        <PageHeader title="Settings" subtitle="Business configuration and app preferences" />
        <div className="glass-card rounded-2xl p-10 text-center text-slate-400 text-sm font-medium">Loading settings…</div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <PageHeader
        title="Settings"
        subtitle="Business configuration and app preferences"
        action={
          <Button icon={saved ? CheckCircle : Save} variant="primary" onClick={handleSave}>
            {saved ? 'Saved!' : 'Save Changes'}
          </Button>
        }
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
          </div>
          <button onClick={fetchSettings}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-sm text-emerald-700 dark:text-emerald-400 font-medium">
          <CheckCircle size={15} className="flex-shrink-0" /> {toast}
        </div>
      )}

      <SectionCard icon={Building} title="Business Information">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Business Name"    name="name"    value={cfg.biz.name}    onChange={updateBiz} />
          <Field label="Phone Number"     name="phone"   value={cfg.biz.phone}   onChange={updateBiz} type="tel" />
          <Field label="Email Address"    name="email"   value={cfg.biz.email}   onChange={updateBiz} type="email" />
          <Field label="Website"          name="website" value={cfg.biz.website} onChange={updateBiz} type="url" />
          <Field label="GSTIN (optional)" name="gstin"   value={cfg.biz.gstin}   onChange={updateBiz} />
          <Field label="Logo URL"         name="logo"    value={cfg.biz.logo}    onChange={updateBiz} type="url" />
        </div>
        <Field label="Address" name="address" value={cfg.biz.address} onChange={updateBiz} type="textarea" rows={2} />
      </SectionCard>

      <SectionCard icon={FileText} title="Invoice Settings">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Invoice Prefix"    name="prefix"   value={cfg.invoice.prefix}   onChange={updateInv} />
          <Field label="Currency Symbol"   name="currency" value={cfg.invoice.currency} onChange={updateInv} type="select" options={['Rs.','₹','INR']} />
          <Field label="Default Bill Type" name="billType" value={cfg.invoice.billType} onChange={updateInv} type="select" options={['Pay Slip only','Invoice only','Both']} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Financial Year Start" name="fyStart"    value={cfg.invoice.fyStart}    onChange={updateInv} type="select" options={['April','January']} />
          <Field label="Invoice Footer Text"  name="footerText" value={cfg.invoice.footerText} onChange={updateInv} />
        </div>
        <Field label="Terms & Conditions" name="termsText" value={cfg.invoice.termsText} onChange={updateInv} type="textarea" rows={2} />
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Show GSTIN on invoice</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Display GSTIN on generated invoices</p>
          </div>
          <Toggle checked={cfg.invoice.showGSTIN} onChange={v => updateInv('showGSTIN', v)} />
        </div>
      </SectionCard>

      <SectionCard icon={Bell} title="Notifications & Automation">
        {[
          { key:'whatsapp',    label:'WhatsApp invoice to customer', sub:'Auto-send invoice via WA after bill generation' },
          { key:'email',       label:'Email notifications',          sub:'Send invoice copy to business email'            },
          { key:'autoInvoice', label:'Auto-generate bill',           sub:'Generate PDF automatically after trip entry'    },
        ].map(t => (
          <div key={t.key} className="flex items-center justify-between gap-4 py-1">
            <div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t.label}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t.sub}</p>
            </div>
            <Toggle checked={cfg.notifications[t.key]} onChange={v => updateNotif(t.key, v)} />
          </div>
        ))}
      </SectionCard>

      <SectionCard icon={Palette} title="Appearance & Theme">
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Compact mode</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Reduce spacing for denser data view</p>
          </div>
          <Toggle checked={cfg.appearance.compactMode} onChange={v => updateAppear('compactMode', v)} />
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Theme Color</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2.5">Primary sidebar and nav color</p>
          <div className="flex gap-2 flex-wrap">
            {THEME_COLORS.map(c => (
              <button key={c.value} onClick={() => setThemeColor(c.value)} title={c.label}
                className={`w-9 h-9 rounded-xl ${c.bg} transition-all ${themeColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`} />
            ))}
            <div className="flex items-center gap-2 ml-1">
              <input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 cursor-pointer" title="Custom" />
              <span className="text-xs text-slate-400">Custom</span>
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">Brand / Accent Color</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2.5">Buttons, highlights, and badges</p>
          <div className="flex gap-2 flex-wrap">
            {BRAND_COLORS.map(c => (
              <button key={c.value} onClick={() => setBrandColor(c.value)} title={c.label}
                className={`w-9 h-9 rounded-xl ${c.bg} transition-all ${brandColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'}`} />
            ))}
            <div className="flex items-center gap-2 ml-1">
              <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)}
                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 cursor-pointer" title="Custom" />
              <span className="text-xs text-slate-400">Custom</span>
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="flex gap-3">
        <Button icon={Save} variant="primary" onClick={handleSave}>
          {saved ? '✓ Saved!' : 'Save All Changes'}
        </Button>
        <Button icon={RotateCcw} variant="secondary" onClick={handleReset}>Reset to Defaults</Button>
      </div>
    </div>
  )
}