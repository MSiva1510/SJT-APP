// ─── Role Manager Page ────────────────────────────────────────
import { useState } from 'react'
import { Shield, Check, X, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { useAdmin } from '../../context/AdminContext'
import { setRolePermission } from '../../services/adminService'
import { useAuth } from '../../context/AuthContext'

const PERMISSION_GROUPS = {
  'Dashboard':    ['view_dashboard'],
  'Bookings':     ['create_booking','edit_booking','delete_booking','approve_booking'],
  'Trips':        ['assign_driver','start_trip','complete_trip'],
  'Expenses':     ['create_expense','approve_expense','reject_expense'],
  'Finance':      ['generate_invoice','view_finance','manage_payroll','view_reports','export_reports'],
  'Entities':     ['manage_drivers','manage_vehicles','manage_customers','manage_documents'],
  'Admin':        ['manage_users','manage_roles','system_settings','notification_management',
                   'manage_communications','view_audit_log','backup_restore','view_health'],
}

const ROLE_COLORS = {
  admin:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  manager:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  driver:   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  accountant:'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  hr:       'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  dispatcher:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  readonly: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

const ROLES = ['admin','manager','driver']

export default function RoleManager() {
  const { user } = useAuth()
  const { roleMatrix, setRoleMatrix } = useAdmin()
  const [saving,       setSaving]       = useState({})
  const [expanded,     setExpanded]     = useState(null)
  const [saved,        setSaved]        = useState({})

  const handleToggle = async (role, permission, current) => {
    const key = `${role}.${permission}`
    setSaving(s => ({ ...s, [key]: true }))
    const newVal = !current
    await setRolePermission(role, permission, newVal, user?.name)
    setRoleMatrix(prev => ({
      ...prev,
      [role]: { ...(prev[role]||{}), [permission]: newVal }
    }))
    setSaving(s => ({ ...s, [key]: false }))
    setSaved(s => ({ ...s, [key]: true }))
    setTimeout(() => setSaved(s => ({ ...s, [key]: false })), 1500)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Role Manager"
        subtitle="Configure per-role permission matrix"
        action={
          <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400">
            <Shield size={13}/> Changes apply immediately
          </div>
        }
      />

      {/* Role summary chips */}
      <div className="flex gap-2 flex-wrap">
        {ROLES.map(role => (
          <button key={role} onClick={() => setExpanded(expanded===role?null:role)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              expanded===role ? 'ring-2 ring-offset-1 ring-navy-400/40 shadow' : 'hover:shadow-md'
            } ${ROLE_COLORS[role]||ROLE_COLORS.readonly} border-current/20`}>
            {role.charAt(0).toUpperCase()+role.slice(1)}
            {expanded===role ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
          </button>
        ))}
      </div>

      {/* Permission matrix */}
      {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
        <div key={group} className="glass-card rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">{group}</p>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-navy-800">
            {perms.map(perm => (
              <div key={perm} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 capitalize">
                    {perm.replace(/_/g,' ')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {ROLES.map(role => {
                    const key     = `${role}.${perm}`
                    const allowed = !!(roleMatrix[role]?.[perm])
                    const isSaving= saving[key]
                    const isSaved = saved[key]
                    return (
                      <div key={role} className="flex flex-col items-center gap-0.5">
                        <p className="text-[9px] text-slate-400 capitalize">{role}</p>
                        <button
                          onClick={() => handleToggle(role, perm, allowed)}
                          disabled={role==='admin'}
                          title={`${role}: ${perm}`}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border text-xs font-bold ${
                            isSaved   ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600'  :
                            allowed   ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'  :
                                        'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-300 dark:text-slate-600 hover:bg-slate-50'
                          } ${role==='admin'?'opacity-60 cursor-not-allowed':''}`}>
                          {isSaving ? <RefreshCw size={11} className="animate-spin"/> :
                           isSaved  ? <Check size={11}/> :
                           allowed  ? <Check size={11}/> : <X size={11}/>}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
