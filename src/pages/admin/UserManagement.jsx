// ─── User Management ──────────────────────────────────────────
// Admin  : create admin / manager / driver + edit / deactivate all
// Manager: create driver only + edit / deactivate drivers

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit2, UserX, UserCheck, Key, X,
  Shield, User, Car, AlertCircle, CheckCircle,
  Search, RefreshCw, Mail, Phone, Lock, Eye, EyeOff,
} from 'lucide-react'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../../context/AuthContext'
import { authRepository }  from '../../repositories/authRepository'
import PageHeader          from '../../components/ui/PageHeader'
import Avatar              from '../../components/ui/Avatar'

// ── Role badge ─────────────────────────────────────────────────
function RoleBadge({ role }) {
  const cfg  = ROLE_COLORS[role] || ROLE_COLORS.driver
  const Icon = role === 'admin' ? Shield : role === 'manager' ? User : Car
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={11} /> {ROLE_LABELS[role] || role}
    </span>
  )
}

// ── Status pill ────────────────────────────────────────────────
function StatusPill({ status }) {
  return status === 'active'
    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Active
      </span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />Inactive
      </span>
}

// ─── Add / Edit User Modal ────────────────────────────────────
// Defined OUTSIDE the page component to prevent remount on keypress
function UserModal({ editUser, currentUserRole, onClose, onSaved, showToast, defaultRole = 'driver' }) {
  const isEdit = !!editUser

  const [form, setForm] = useState({
    full_name: editUser?.full_name || editUser?.name || '',
    email:     editUser?.email     || '',
    phone:     editUser?.phone     || '',
    role:      editUser?.role      || defaultRole,
    password:  '',
    confirm:   '',
  })
  const [showPwd,  setShowPwd]  = useState(false)
  const [errors,   setErrors]   = useState({})
  const [saving,   setSaving]   = useState(false)
  const [step,     setStep]     = useState('form')  // 'form' | 'success'
  const [created,  setCreated]  = useState(null)

  const upd = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '', form: '' }))
  }

  // Managers can only create drivers
  const allowedRoles = currentUserRole === 'admin'
    ? [
        { value: 'driver',  label: 'Driver',        icon: Car },
        { value: 'manager', label: 'Manager',        icon: User },
        { value: 'admin',   label: 'Administrator',  icon: Shield },
      ]
    : [{ value: 'driver', label: 'Driver', icon: Car }]

  const validate = () => {
    const e = {}
    if (!form.full_name.trim())               e.full_name = 'Full name is required'
    if (!isEdit) {
      if (!form.email.trim())                 e.email    = 'Email is required'
      if (!/\S+@\S+\.\S+/.test(form.email))  e.email    = 'Enter a valid email'
      if (!form.password)                     e.password = 'Password is required'
      if (form.password.length < 8)           e.password = 'Minimum 8 characters'
      if (form.password !== form.confirm)     e.confirm  = 'Passwords do not match'
    }
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    setErrors({})
    try {
      if (isEdit) {
        await authRepository.updateProfile(editUser.id, {
          full_name: form.full_name.trim(),
          phone:     form.phone.trim() || null,
          role:      form.role,
        })
        showToast(`${form.full_name} updated`)
        onSaved()
        onClose()
      } else {
        const result = await authRepository.adminCreateUser({
          email:     form.email.trim().toLowerCase(),
          password:  form.password,
          full_name: form.full_name.trim(),
          role:      form.role,
          phone:     form.phone.trim() || null,
        })
        setCreated(result)
        setStep('success')
        onSaved()
      }
    } catch (err) {
      console.error('[UserModal] save error:', err)
      const msg = err.message?.includes('already registered')
        ? 'An account with this email already exists.'
        : err.message?.includes('Password should be at least')
        ? 'Password must be at least 8 characters.'
        : err.message || 'Failed to create user. Please try again.'
      setErrors({ form: msg })
    } finally {
      setSaving(false)
    }
  }

  const inp = `w-full px-3 py-2.5 text-sm rounded-xl border bg-white dark:bg-navy-800/60
    text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600
    focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all`

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4" onClick={onClose}>
      <div className="relative w-full sm:w-[460px] max-h-[92vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up" onClick={e => e.stopPropagation()}>

        {/* Drag handle (mobile) */}
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {isEdit ? 'Edit User' : 'Add New User'}
            </p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">
              {isEdit ? form.full_name || 'Edit User' : 'Create Account'}
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Success screen */}
        {step === 'success' ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle size={32} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="font-display font-black text-slate-800 dark:text-white text-lg">User Created!</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                <strong>{form.full_name}</strong> ({ROLE_LABELS[form.role]})
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Account: <span className="font-mono font-bold">{form.email}</span>
              </p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 rounded-xl p-3 text-left w-full">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-1">⚠ Email confirmation</p>
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                If the user can't log in, go to <strong>Supabase → Authentication → Settings</strong> and disable <strong>"Confirm email"</strong>, then ask the user to try again.
              </p>
            </div>
            <button onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all">
              Done
            </button>
          </div>
        ) : (
          /* Form */
          <>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3.5">

              {/* Error banner */}
              {errors.form && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 dark:text-red-400">{errors.form}</p>
                </div>
              )}

              {/* Role selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Role</label>
                <div className={`grid gap-2 ${allowedRoles.length === 1 ? 'grid-cols-1' : allowedRoles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {allowedRoles.map(({ value, label, icon: Icon }) => {
                    const cfg = ROLE_COLORS[value]
                    const selected = form.role === value
                    return (
                      <button key={value} type="button" onClick={() => upd('role', value)}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 transition-all ${
                          selected
                            ? `border-current ${cfg.bg} ${cfg.text}`
                            : 'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-navy-600'
                        }`}>
                        <Icon size={18} />
                        <span className="text-xs font-bold">{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={`${inp} pl-9 ${errors.full_name ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                    value={form.full_name} onChange={e => upd('full_name', e.target.value)}
                    placeholder={form.role === 'driver' ? 'e.g. Ramanan Kumar' : form.role === 'manager' ? 'e.g. Kavitha Rajan' : 'e.g. Arjun Sharma'}
                    autoFocus />
                  {errors.full_name && <p className="text-[10px] text-red-500 mt-1">{errors.full_name}</p>}
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={`${inp} pl-9 border-slate-200 dark:border-navy-700`}
                    value={form.phone} onChange={e => upd('phone', e.target.value.replace(/\D/g,'').slice(0,10))}
                    placeholder="10-digit mobile" />
                </div>
              </div>

              {/* Email — only for new user */}
              {!isEdit && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" className={`${inp} pl-9 ${errors.email ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                      value={form.email} onChange={e => upd('email', e.target.value)}
                      placeholder={`${form.role}@jayamtravels.in`} />
                    {errors.email && <p className="text-[10px] text-red-500 mt-1">{errors.email}</p>}
                  </div>
                </div>
              )}

              {/* Password — only for new user */}
              {!isEdit && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type={showPwd ? 'text' : 'password'}
                        className={`${inp} pl-9 pr-10 ${errors.password ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                        value={form.password} onChange={e => upd('password', e.target.value)}
                        placeholder="Min. 8 characters" />
                      <button type="button" onClick={() => setShowPwd(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                        {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      {errors.password && <p className="text-[10px] text-red-500 mt-1">{errors.password}</p>}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
                      Confirm Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type={showPwd ? 'text' : 'password'}
                        className={`${inp} pl-9 ${errors.confirm ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                        value={form.confirm} onChange={e => upd('confirm', e.target.value)}
                        placeholder="Repeat password" />
                      {errors.confirm && <p className="text-[10px] text-red-500 mt-1">{errors.confirm}</p>}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50">
                {saving
                  ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"/></svg>Creating…</span>
                  : isEdit ? 'Save Changes' : `Create ${ROLE_LABELS[form.role]}`
                }
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function UserManagement() {
  const { user: currentUser, isAdmin, isManager } = useAuth()

  const [profiles,   setProfiles]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [showModal,  setShowModal]  = useState(false)
  const [editUser,   setEditUser]   = useState(null)
  const [toast,      setToast]      = useState('')
  const [resetting,  setResetting]  = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  const load = useCallback(async () => {
    setLoading(true)
    const list = await authRepository.listProfiles()
    setProfiles(isAdmin ? list : list.filter(p => p.role === 'driver'))
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  const handleOpen = (user = null) => {
    setEditUser(user)
    setShowModal(true)
  }

  const handleToggleStatus = async (profile) => {
    if (profile.id === currentUser?.id) {
      showToast('You cannot deactivate your own account.')
      return
    }
    const next = profile.status === 'active' ? 'inactive' : 'active'
    await authRepository.updateProfile(profile.id, { status: next })
    showToast(`${profile.full_name} ${next === 'active' ? 'activated' : 'deactivated'}`)
    load()
  }

  const handleResetPwd = async (profile) => {
    setResetting(profile.id)
    try {
      await authRepository.sendPasswordReset(profile.email)
      showToast(`Password reset sent to ${profile.email}`)
    } catch {
      showToast('Failed to send reset email.')
    } finally {
      setResetting(null)
    }
  }

  const filtered = profiles.filter(p => {
    const matchRole   = roleFilter === 'all' || p.role === roleFilter
    const matchSearch = !search
      || p.full_name?.toLowerCase().includes(search.toLowerCase())
      || p.email?.toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const counts = {
    all:     profiles.length,
    admin:   profiles.filter(p => p.role === 'admin').length,
    manager: profiles.filter(p => p.role === 'manager').length,
    driver:  profiles.filter(p => p.role === 'driver').length,
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="User Accounts"
        subtitle={`${counts.all} accounts · ${profiles.filter(p => p.status==='active').length} active`}
        action={
          <button onClick={() => handleOpen(null)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
            <Plus size={15} /> Add User
          </button>
        }
      />

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{toast}</p>
        </div>
      )}

      {/* Quick-add row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(isAdmin ? [
          { role:'manager', label:'Add Manager', color:'bg-blue-600 hover:bg-blue-500',   icon: User    },
          { role:'driver',  label:'Add Driver',  color:'bg-teal-600 hover:bg-teal-500',   icon: Car     },
          { role:'admin',   label:'Add Admin',   color:'bg-violet-600 hover:bg-violet-500',icon: Shield  },
        ] : [
          { role:'driver',  label:'Add Driver',  color:'bg-teal-600 hover:bg-teal-500',   icon: Car     },
        ]).map(({ role, label, color, icon: Icon }) => (
          <button key={role}
            onClick={() => { setEditUser(null); setShowModal({ defaultRole: role }) }}
            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl ${color} text-white font-bold text-sm transition-all shadow-md active:scale-95`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-navy-500/20 transition-all" />
        </div>
        <div className="flex gap-1.5">
          {['all','admin','manager','driver'].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                roleFilter === r
                  ? 'bg-navy-900 dark:bg-blue-700 text-white shadow'
                  : 'bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 text-slate-500 dark:text-slate-400 hover:border-slate-300'
              }`}>
              {r === 'all' ? `All (${counts.all})` : `${ROLE_LABELS[r]} (${counts[r]})`}
            </button>
          ))}
        </div>
        <button onClick={load}
          className="w-10 h-10 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors" title="Refresh">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading accounts…</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14">
            <User size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No accounts found</p>
            {search && <p className="text-xs text-slate-400 mt-1">Try a different search</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/80 dark:bg-navy-800/50">
                  {['Account','Role','Phone','Status','Added','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isSelf = p.id === currentUser?.id
                  const canManage = isAdmin || (isManager && p.role === 'driver')
                  return (
                    <tr key={p.id} className={`border-b border-slate-50 dark:border-navy-800 hover:bg-slate-50/60 dark:hover:bg-navy-800/40 transition-colors ${isSelf ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.full_name} size={34} />
                          <div>
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {p.full_name}
                              {isSelf && <span className="ml-1.5 text-[9px] font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">You</span>}
                            </p>
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">{p.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={p.role} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.phone || '—'}</td>
                      <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{p.created_at?.slice(0,10) || '—'}</td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleOpen(p)} title="Edit"
                              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-700 flex items-center justify-center text-slate-500 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors">
                              <Edit2 size={12} />
                            </button>
                            <button onClick={() => handleResetPwd(p)} disabled={resetting === p.id} title="Send password reset"
                              className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-700 flex items-center justify-center text-slate-500 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900/30 dark:hover:text-amber-400 transition-colors disabled:opacity-40">
                              <Key size={12} />
                            </button>
                            {!isSelf && (
                              <button onClick={() => handleToggleStatus(p)}
                                title={p.status === 'active' ? 'Deactivate' : 'Activate'}
                                className={`w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-700 flex items-center justify-center transition-colors ${
                                  p.status === 'active'
                                    ? 'text-slate-500 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                                    : 'text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400'
                                }`}>
                                {p.status === 'active' ? <UserX size={12} /> : <UserCheck size={12} />}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal — pass defaultRole from quick-add buttons */}
      {showModal && (
        <UserModal
          editUser={editUser}
          currentUserRole={currentUser?.role}
          onClose={() => { setShowModal(false); setEditUser(null) }}
          onSaved={load}
          showToast={showToast}
          defaultRole={typeof showModal === 'object' ? showModal.defaultRole : undefined}
        />
      )}
    </div>
  )
}
