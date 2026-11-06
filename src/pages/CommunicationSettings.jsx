// ─── Communication Settings Page ─────────────────────────────
// User notification preferences + provider configuration overview.

import { useState, useEffect } from 'react'
import { Bell, MessageSquare, Smartphone, Globe, Mail, Save, CheckCircle, Info } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useCommunicationCtx } from '../hooks/useCommunication'
import { useAuth } from '../context/AuthContext'

const CHANNEL_SETTINGS = [
  { key:'in_app_enabled',    label:'In-App Notifications', icon:'🔔', description:'Show notifications inside the app', Icon:Bell,           alwaysOn:true },
  { key:'whatsapp_enabled',  label:'WhatsApp',             icon:'💬', description:'Send WhatsApp messages (requires provider config)', Icon:MessageSquare },
  { key:'sms_enabled',       label:'SMS',                  icon:'📱', description:'Send SMS messages (requires provider config)',       Icon:Smartphone   },
  { key:'push_enabled',      label:'Push Notifications',   icon:'📲', description:'Send push to mobile app (requires app)',             Icon:Bell         },
  { key:'email_enabled',     label:'Email',                icon:'📧', description:'Send email notifications',                           Icon:Mail         },
]

const CATEGORY_SETTINGS = [
  { key:'booking_notifications',     label:'Booking Alerts',    icon:'📋', description:'New, approved, cancelled bookings' },
  { key:'trip_notifications',        label:'Trip Alerts',       icon:'🚗', description:'Trip start, complete, delays'      },
  { key:'expense_notifications',     label:'Expense Alerts',    icon:'💸', description:'Expense approvals and rejections'  },
  { key:'payroll_notifications',     label:'Payroll Alerts',    icon:'💰', description:'Salary and settlement updates'     },
  { key:'vehicle_notifications',     label:'Vehicle Alerts',    icon:'🚘', description:'Service due, document expiry'      },
  { key:'attendance_notifications',  label:'Attendance Alerts', icon:'📅', description:'Missing attendance reminders'      },
  { key:'document_notifications',    label:'Document Alerts',   icon:'📄', description:'Document expiry reminders'         },
  { key:'system_notifications',      label:'System Alerts',     icon:'⚙️', description:'Security and system events'        },
]

function Toggle({ on, onToggle, disabled }) {
  return (
    <button type="button" onClick={onToggle} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on?'bg-navy-800 dark:bg-blue-600':'bg-slate-200 dark:bg-navy-700'} ${disabled?'opacity-50 cursor-not-allowed':''}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${on?'left-6':'left-1'}`}/>
    </button>
  )
}

export default function CommunicationSettings() {
  const { user } = useAuth()
  const { preferences, prefLoading, updatePreferences, providers } = useCommunicationCtx()
  const [local, setLocal] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    if (preferences) setLocal({ ...preferences })
  }, [preferences])

  const toggle = (key) => setLocal(p => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    setSaving(true)
    await updatePreferences(local)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (prefLoading || !local) return (
    <div className="space-y-4 animate-pulse">
      <div className="h-10 bg-slate-200 dark:bg-navy-700 rounded-xl w-48"/>
      {[1,2,3].map(i=><div key={i} className="h-16 bg-slate-200 dark:bg-navy-700 rounded-xl"/>)}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Communication Settings"
        subtitle="Manage your notification channels and category preferences"
        action={
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50">
            {saved ? <><CheckCircle size={15}/> Saved!</> : saving ? 'Saving…' : <><Save size={15}/> Save Changes</>}
          </button>
        }
      />

      {/* Channel toggles */}
      <div className="glass-card rounded-2xl p-5 space-y-1">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Notification Channels</p>
        {CHANNEL_SETTINGS.map(ch => (
          <div key={ch.key} className="flex items-center gap-4 py-3 border-b border-slate-100 dark:border-navy-700 last:border-0">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0 text-lg">
              {ch.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{ch.label}</p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{ch.description}</p>
            </div>
            <Toggle
              on={ch.alwaysOn || !!local[ch.key]}
              onToggle={() => !ch.alwaysOn && toggle(ch.key)}
              disabled={ch.alwaysOn}
            />
          </div>
        ))}
      </div>

      {/* Category toggles */}
      <div className="glass-card rounded-2xl p-5 space-y-1">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Notification Categories</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {CATEGORY_SETTINGS.map(cat => (
            <div key={cat.key} className="flex items-center gap-3 py-2.5 px-1">
              <span className="text-base flex-shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{cat.label}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{cat.description}</p>
              </div>
              <Toggle on={!!local[cat.key]} onToggle={() => toggle(cat.key)} />
            </div>
          ))}
        </div>
      </div>

      {/* Quiet hours */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quiet Hours</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Pause non-critical notifications during these hours</p>
          </div>
          <Toggle on={!!local.quiet_hours_enabled} onToggle={() => toggle('quiet_hours_enabled')} />
        </div>
        {local.quiet_hours_enabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Start</label>
              <input type="time" value={local.quiet_hours_start||'22:00'}
                onChange={e=>setLocal(p=>({...p,quiet_hours_start:e.target.value}))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500/25"/>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">End</label>
              <input type="time" value={local.quiet_hours_end||'07:00'}
                onChange={e=>setLocal(p=>({...p,quiet_hours_end:e.target.value}))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500/25"/>
            </div>
          </div>
        )}
      </div>

      {/* Provider status overview */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Provider Status</p>
        <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 border border-blue-100 dark:border-blue-800/30">
          <Info size={13} className="text-blue-500 flex-shrink-0 mt-0.5"/>
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            Provider API keys are managed by the Admin in secure backend configuration.
            Contact your administrator to enable WhatsApp, SMS, or Push channels.
          </p>
        </div>
        <div className="space-y-2">
          {[
            { channel:'WhatsApp', count: providers.filter(p=>p.channel==='whatsapp').length, active: providers.filter(p=>p.channel==='whatsapp'&&p.is_active).length },
            { channel:'SMS',      count: providers.filter(p=>p.channel==='sms').length,      active: providers.filter(p=>p.channel==='sms'&&p.is_active).length      },
            { channel:'Push',     count: providers.filter(p=>p.channel==='push').length,     active: providers.filter(p=>p.channel==='push'&&p.is_active).length     },
            { channel:'Webhook',  count: providers.filter(p=>p.channel==='webhook').length,  active: providers.filter(p=>p.channel==='webhook'&&p.is_active).length  },
          ].map(p=>(
            <div key={p.channel} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-navy-700 last:border-0">
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{p.channel}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400">{p.count} providers registered</span>
                <span className={`w-2 h-2 rounded-full ${p.active>0?'bg-emerald-500':'bg-slate-300 dark:bg-navy-600'}`}/>
                <span className={`text-[10px] font-bold ${p.active>0?'text-emerald-600 dark:text-emerald-400':'text-slate-400'}`}>
                  {p.active>0?`${p.active} active`:'None active'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
