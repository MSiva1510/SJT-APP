// ─── Security Settings Page ───────────────────────────────────
import { useState, useEffect } from 'react'
import { Shield, Save, CheckCircle, Lock, Clock, AlertTriangle, Key, RefreshCw } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { useAdmin } from '../../context/AdminContext'
import { saveSettings } from '../../services/adminService'
import { useAuth } from '../../context/AuthContext'
import { generatePassword, getPasswordStrength, getChecks } from '../../security/PasswordManager'
import { sessionManager } from '../../security/SessionManager'

const SECURITY_KEYS = [
  'session_timeout_minutes','max_login_attempts','password_min_length',
  'password_require_uppercase','password_require_number',
  'allow_concurrent_sessions','force_password_change_days',
  'data_retention_audit_days','data_retention_comm_days',
]

function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on?'bg-navy-800 dark:bg-blue-600':'bg-slate-200 dark:bg-navy-700'} ${disabled?'opacity-50 cursor-not-allowed':''}`}>
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${on?'left-6':'left-1'}`}/>
    </button>
  )
}

function NumberInput({ value, onChange, min, max, suffix }) {
  return (
    <div className="flex items-center gap-2">
      <input type="number" value={value} onChange={e=>onChange(e.target.value)} min={min} max={max}
        className="w-20 px-2 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500/25 text-center"/>
      {suffix && <span className="text-xs text-slate-400">{suffix}</span>}
    </div>
  )
}

export default function SecuritySettings() {
  const { user } = useAuth()
  const { settings } = useAdmin()
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)
  const [testPwd,setTestPwd]= useState('')

  // Map settings array to form object
  useEffect(() => {
    const map = {}
    settings.forEach(s => { map[s.setting_key] = s.setting_value })
    setForm({
      session_timeout_minutes:   map.session_timeout_minutes   || '60',
      max_login_attempts:        map.max_login_attempts         || '5',
      password_min_length:       map.password_min_length        || '8',
      password_require_uppercase:map.password_require_uppercase || 'true',
      password_require_number:   map.password_require_number    || 'true',
      allow_concurrent_sessions: map.allow_concurrent_sessions  || 'false',
      force_password_change_days:map.force_password_change_days || '0',
      data_retention_audit_days: map.data_retention_audit_days  || '365',
      data_retention_comm_days:  map.data_retention_comm_days   || '180',
    })
  }, [settings])

  const upd = (key, val) => setForm(f => ({ ...f, [key]: String(val) }))
  const bool = (key) => form[key] === 'true'
  const num  = (key) => form[key] || '0'

  const handleSave = async () => {
    setSaving(true)
    await saveSettings(form, user?.name)
    sessionManager.setTimeoutMinutes(Number(form.session_timeout_minutes))
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const strength = testPwd ? getPasswordStrength(testPwd) : null
  const checks   = testPwd ? getChecks(testPwd) : []

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Security Settings"
        subtitle="Session, password, and access configuration"
        action={
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95 disabled:opacity-50">
            {saved ? <><CheckCircle size={15}/> Saved!</> : saving ? 'Saving…' : <><Save size={15}/> Save</>}
          </button>
        }
      />

      {/* Session settings */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-slate-500"/>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Session Management</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Session Timeout</p>
              <p className="text-[11px] text-slate-400">Auto-logout after inactivity</p>
            </div>
            <NumberInput value={num('session_timeout_minutes')} onChange={v=>upd('session_timeout_minutes',v)} min={5} max={480} suffix="minutes"/>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Max Login Attempts</p>
              <p className="text-[11px] text-slate-400">Lock account after N failed attempts</p>
            </div>
            <NumberInput value={num('max_login_attempts')} onChange={v=>upd('max_login_attempts',v)} min={3} max={10} suffix="attempts"/>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Allow Concurrent Sessions</p>
              <p className="text-[11px] text-slate-400">Same user on multiple devices simultaneously</p>
            </div>
            <Toggle on={bool('allow_concurrent_sessions')} onChange={()=>upd('allow_concurrent_sessions', !bool('allow_concurrent_sessions'))}/>
          </div>
        </div>
      </div>

      {/* Password settings */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={15} className="text-slate-500"/>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Password Policy</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Minimum Length</p></div>
            <NumberInput value={num('password_min_length')} onChange={v=>upd('password_min_length',v)} min={6} max={32} suffix="chars"/>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Require Uppercase</p></div>
            <Toggle on={bool('password_require_uppercase')} onChange={()=>upd('password_require_uppercase',!bool('password_require_uppercase'))}/>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Require Number</p></div>
            <Toggle on={bool('password_require_number')} onChange={()=>upd('password_require_number',!bool('password_require_number'))}/>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Force Change Every</p>
              <p className="text-[11px] text-slate-400">0 = disabled</p>
            </div>
            <NumberInput value={num('force_password_change_days')} onChange={v=>upd('force_password_change_days',v)} min={0} max={365} suffix="days"/>
          </div>
        </div>
      </div>

      {/* Password tester */}
      <div className="glass-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key size={15} className="text-slate-500"/>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Password Strength Tester</p>
          </div>
          <button onClick={() => setTestPwd(generatePassword(12))}
            className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">
            <RefreshCw size={11}/> Generate
          </button>
        </div>
        <input value={testPwd} onChange={e=>setTestPwd(e.target.value)} placeholder="Type a password to test…"
          className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25"/>
        {strength && (
          <>
            <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${strength.color}`} style={{width:`${strength.score}%`}}/>
            </div>
            <p className={`text-xs font-bold ${strength.text}`}>{strength.label}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {checks.map(c=>(
                <div key={c.label} className={`flex items-center gap-1.5 text-[11px] ${c.pass?'text-emerald-600 dark:text-emerald-400':'text-slate-400'}`}>
                  {c.pass ? <CheckCircle size={11}/> : <AlertTriangle size={11}/>} {c.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Data retention */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={15} className="text-slate-500"/>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Data Retention</p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Audit Log Retention</p><p className="text-[11px] text-slate-400">Keep audit entries for</p></div>
            <NumberInput value={num('data_retention_audit_days')} onChange={v=>upd('data_retention_audit_days',v)} min={30} max={3650} suffix="days"/>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Comm Log Retention</p><p className="text-[11px] text-slate-400">Keep communication logs for</p></div>
            <NumberInput value={num('data_retention_comm_days')} onChange={v=>upd('data_retention_comm_days',v)} min={30} max={3650} suffix="days"/>
          </div>
        </div>
      </div>
    </div>
  )
}
