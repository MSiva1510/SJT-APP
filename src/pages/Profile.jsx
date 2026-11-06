// ─── Profile.jsx — Fix 4: improved readability, correct section order ─
import { useState, useEffect } from 'react'
import { Save, User, Lock, Bell, Sliders, Phone, Mail, Calendar, Shield } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Avatar     from '../components/ui/Avatar'
import Button     from '../components/ui/Button'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../context/AuthContext'
import { useApp } from '../context/AppContext'

function Toggle({ checked, onChange }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-200 dark:bg-navy-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// Fix 4: Solid, readable section card — minimal transparency
function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2.5 px-5 py-3.5 bg-slate-100 dark:bg-navy-800 border-b border-slate-200 dark:border-navy-700">
        <Icon size={15} className="text-navy-700 dark:text-blue-400" />
        <p className="text-xs font-bold text-navy-800 dark:text-slate-100 uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5 space-y-4 bg-white dark:bg-navy-900">{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', readOnly }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined} readOnly={readOnly}
        className={`w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-600
          text-slate-800 dark:text-slate-100 focus:outline-none transition-colors
          ${readOnly
            ? 'bg-slate-100 dark:bg-navy-800 cursor-default'
            : 'bg-white dark:bg-navy-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 dark:focus:border-blue-500'
          }`} />
    </div>
  )
}

function ToggleRow({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
        {sub && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  )
}

export default function Profile() {
  const { user, updateProfile, changePassword } = useAuth()
  const { darkMode, setDarkMode } = useApp()
  const roleColors = user ? ROLE_COLORS[user.role] : null

  const [notifRide,   setNotifRide]   = useState(true)
  const [notifEmail,  setNotifEmail]  = useState(false)
  const [notifSMS,    setNotifSMS]    = useState(true)
  const [twoFA,       setTwoFA]       = useState(false)
  const [savedMsg,    setSavedMsg]    = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [formError,   setFormError]   = useState('')

  // Editable profile fields (persisted to public.profiles via AuthContext)
  const [fullName, setFullName] = useState('')
  const [phone,    setPhone]    = useState('')
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (user && !hydrated) {
      setFullName(user.name || '')
      setPhone(user.phone || '')
      setHydrated(true)
    }
  }, [user, hydrated])

  // Password change fields
  const [pwNew,     setPwNew]     = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving,  setPwSaving]  = useState(false)

  const handleSave = async () => {
    if (saving) return
    if (!fullName.trim()) { setFormError('Full name cannot be empty.'); return }
    setSaving(true); setFormError('')
    try {
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim() })
      setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      console.error('[Profile] save failed:', err)
      setFormError(err.message?.includes('Supabase not configured')
        ? 'Database is not configured — changes cannot be saved.'
        : 'Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdatePassword = async () => {
    if (pwSaving) return
    if (!pwNew || pwNew.length < 6) { setFormError('New password must be at least 6 characters.'); return }
    if (pwNew !== pwConfirm) { setFormError('Passwords do not match.'); return }
    setPwSaving(true); setFormError('')
    try {
      await changePassword(pwNew)
      setPwNew(''); setPwConfirm('')
      setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000)
    } catch (err) {
      console.error('[Profile] password update failed:', err)
      setFormError(err.message?.includes('Supabase not configured')
        ? 'Database is not configured — password cannot be updated.'
        : 'Could not update password. Please try again.')
    } finally {
      setPwSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="space-y-5 animate-fade-up max-w-xl">
      <PageHeader title="My Profile" subtitle="Account details and preferences" />

      {/* ── 1. My Profile ── */}
      {/* Hero card — solid white/dark background */}
      <div className="rounded-2xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 shadow-sm overflow-hidden">
        {/* Top accent */}
        <div className="h-1 bg-gradient-to-r from-navy-700 to-blue-500" />
        <div className="p-5">
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <Avatar name={user.name} size={60} />
              <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full border-2 border-white dark:border-navy-900 ${roleColors?.dot}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-black text-slate-800 dark:text-white text-xl leading-tight">{user.name}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full ${roleColors?.bg} ${roleColors?.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${roleColors?.dot}`} />
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-2.5">
            {[
              { icon: Mail,     label: 'Email',    value: user.email   },
              { icon: Phone,    label: 'Phone',    value: user.phone   },
              { icon: Calendar, label: 'Joined',   value: user.joined  },
              { icon: Shield,   label: 'Role',     value: ROLE_LABELS[user.role] },
            ].map(d => (
              <div key={d.label} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-navy-800 last:border-0">
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0">
                  <d.icon size={13} className="text-slate-500 dark:text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{d.label}</p>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{d.value || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit name/phone */}
      <Section icon={User} title="Edit Profile">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full Name"    value={fullName} onChange={setFullName} />
          <Field label="Phone"        value={phone}    onChange={setPhone} type="tel" />
        </div>
        <Field label="Email Address" value={user.email} type="email" readOnly />
        {user.vehicle && <Field label="Assigned Vehicle" value={user.vehicle} readOnly />}
        {formError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{formError}</p>}
        {savedMsg
          ? <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-semibold"><span>✓</span> Saved successfully</div>
          : <Button icon={Save} variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        }
      </Section>

      {/* ── 2. Preferences ── */}
      <Section icon={Sliders} title="Preferences">
        <ToggleRow
          label="Dark Mode"
          sub="Switch between light and dark interface"
          checked={darkMode}
          onChange={setDarkMode}
        />
        <div className="pt-1 border-t border-slate-100 dark:border-navy-800">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Language</label>
          <select className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-600 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option>English</option>
            <option>Tamil</option>
          </select>
        </div>
      </Section>

      {/* ── 3. Security ── */}
      <Section icon={Lock} title="Security">
        <Field label="New Password"      value={pwNew}     onChange={setPwNew}     type="password" />
        <Field label="Confirm Password"  value={pwConfirm} onChange={setPwConfirm} type="password" />
        <ToggleRow
          label="Two-Factor Authentication"
          sub="Require OTP on every login"
          checked={twoFA}
          onChange={setTwoFA}
        />
        <Button icon={Lock} variant="secondary" onClick={handleUpdatePassword} disabled={pwSaving}>
          {pwSaving ? 'Updating…' : 'Update Password'}
        </Button>
      </Section>

      {/* ── 4. Notifications ── */}
      <Section icon={Bell} title="Notifications">
        <ToggleRow label="Ride Alerts"     sub="Notify on new trip assignment"      checked={notifRide}  onChange={setNotifRide}  />
        <ToggleRow label="Email Updates"   sub="Receive weekly summary emails"      checked={notifEmail} onChange={setNotifEmail} />
        <ToggleRow label="SMS Alerts"      sub="SMS for trip start and completion"  checked={notifSMS}   onChange={setNotifSMS}   />
      </Section>
    </div>
  )
}
