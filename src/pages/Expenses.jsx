import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, Search, ChevronDown, ChevronUp,
  X, Edit2, Trash2, CheckCircle, AlertTriangle,
  Receipt, Calendar, User, Car, FileText,
  TrendingDown, Filter,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import ModalOverlay from '../components/ui/ModalOverlay'
import Avatar     from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import {
  loadExpenses, saveExpense, deleteExpense, generateExpenseId,
  EXPENSE_TYPES, APPROVAL_STATUSES, DRIVER_ALLOWED_TYPES,
  getExpTypeCfg, getApprovalCfg,
  isToday, isThisWeek, isThisMonth,
  summariseByType, getTripExpenses, getExpenseDate,
} from '../data/expenseData'
import { loadBookings } from '../data/tripTypes'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import { addAuditEvent } from '../data/auditLogData'

// ─────────────────────────────────────────────────────────────
//  Shared badges
// ─────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const cfg = getExpTypeCfg(type)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className="text-[11px]">{cfg.icon}</span>{cfg.label}
    </span>
  )
}

function ApprovalBadge({ status }) {
  const cfg = getApprovalCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
//  Add / Edit Expense Modal — Modules 2 & 3
// ─────────────────────────────────────────────────────────────
const EMPTY = {
  id:'', type:'fuel', status:'draft',
  date: new Date().toISOString().slice(0,10),
  amount:'', description:'', tripRef:'',
  driver:'', vehicle:'', addedBy:'',
  receiptName:'', receiptDate:'', notes:'',
}

// ── EF and ESel defined OUTSIDE modal so React doesn't remount on every keystroke ──
function EF({ label, field, type='text', required, placeholder, value, onChange, error }) {
  const handleChange = (e) => {
    let v = e.target.value
    if (type === 'number' && field === 'amount' && (isNaN(v) || Number(v) < 0)) v = ''
    if (field === 'description' || field === 'notes') v = v.slice(0, 200)
    if (field === 'driver' && v.length > 0 && !/^[a-zA-Z\s\-'.]*$/.test(v)) v = v.slice(0, -1)
    onChange(field, v)
  }
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input type={type} value={value || ''} placeholder={placeholder}
        onChange={handleChange} required={required}
        className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
          focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all
          ${error ? 'border-red-400 dark:border-red-600' : 'border-slate-200 dark:border-navy-700'}`} />
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function ESel({ label, field, children, required, value, onChange, error }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select value={value || ''} onChange={e => onChange(field, e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none">
        {children}
      </select>
      {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
    </div>
  )
}

function ExpenseModal({ expense, drivers, vehicles, onClose, onSave, currentUser, isDriver: isDrv }) {
  const [bookings, setBookings] = useState([])
  useEffect(() => { loadBookings().then(b => setBookings(Array.isArray(b) ? b : [])) }, [])
  const isEdit   = !!expense?.id
  const [form,   setForm]   = useState(() => expense || { ...EMPTY, addedBy: currentUser?.name || '' })
  const [errors, setErrors] = useState({})
  const upd = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const allowedTypes = isDrv ? EXPENSE_TYPES.filter(t => DRIVER_ALLOWED_TYPES.includes(t.key)) : EXPENSE_TYPES

  const validate = () => {
    const e = {}
    if (!form.type)               e.type   = 'Expense type is required'
    if (!form.amount || form.amount <= 0) e.amount = 'Valid amount is required'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const now = new Date().toISOString()
    onSave({
      ...form,
      id:        form.id || generateExpenseId(),
      amount:    Number(form.amount),
      status:    form.status || 'draft',
      createdAt: form.createdAt || now,
      updatedAt: now,
    })
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[480px] max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isEdit ? 'Edit Expense' : 'Add Expense'}</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">
              {isEdit ? form.id : 'New Expense'}
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ESel label="Expense Type" field="type" required value={form.type} onChange={upd} error={errors.type}>
              <option value="">— Select type —</option>
              {allowedTypes.map(t => (
                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
              ))}
            </ESel>
            <EF label="Date"   field="date"   type="date" required value={form.date} onChange={upd} error={errors.date} />
            <EF label="Amount (Rs.)" field="amount" type="number" required placeholder="0" value={form.amount} onChange={upd} error={errors.amount} />
            {!isDrv && (
              <ESel label="Status" field="status" value={form.status} onChange={upd} error={errors.status}>
                {APPROVAL_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </ESel>
            )}
          </div>

          <EF label="Description" field="description" placeholder="What was this expense for?" value={form.description} onChange={upd} error={errors.description} />

          <div className="grid grid-cols-2 gap-3">
            {!isDrv ? (
              <ESel label="Driver" field="driver" value={form.driver} onChange={upd} error={errors.driver}>
                <option value="">— None —</option>
                {(drivers||[]).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </ESel>
            ) : (
              <EF label="Driver" field="driver" placeholder={currentUser?.name} value={form.driver} onChange={upd} error={errors.driver} />
            )}
            <ESel label="Vehicle" field="vehicle" value={form.vehicle} onChange={upd} error={errors.vehicle}>
              <option value="">— None —</option>
              {(vehicles||[]).map(v => <option key={v.id} value={v.reg}>{v.reg} — {v.type}</option>)}
            </ESel>
          </div>

          {/* Trip reference */}
          <ESel label="Trip Reference (optional)" field="tripRef" value={form.tripRef} onChange={upd} error={errors.tripRef}>
            <option value="">— No trip linked —</option>
            {bookings.map(b => (
              <option key={b.id} value={b.bookingNo}>{b.bookingNo} — {b.customer}</option>
            ))}
          </ESel>

          {/* Module 4: Dynamic type-specific fields */}
          {form.type === 'fuel' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-900/30">
              <EF label="Odometer (KM)"   field="odometerKm"   type="number" placeholder="e.g. 45230"   value={form.odometerKm}   onChange={upd} />
              <EF label="Litres Filled"   field="litresFilled" type="number" placeholder="e.g. 20"      value={form.litresFilled} onChange={upd} />
              <EF label="Fuel Station"    field="fuelStation"               placeholder="Station name"   value={form.fuelStation}  onChange={upd} />
              <EF label="Rate per Litre"  field="fuelRate"     type="number" placeholder="e.g. 102.50"  value={form.fuelRate}     onChange={upd} />
            </div>
          )}
          {form.type === 'parking' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-teal-50 dark:bg-teal-900/10 rounded-xl border border-teal-100 dark:border-teal-900/30">
              <EF label="Parking Location" field="parkingLocation" placeholder="Airport, Mall, etc." value={form.parkingLocation} onChange={upd} />
              <EF label="Duration (hours)" field="parkingDuration" type="number" placeholder="e.g. 3" value={form.parkingDuration} onChange={upd} />
            </div>
          )}
          {form.type === 'toll' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
              <EF label="Toll Name/Plaza" field="tollName"  placeholder="e.g. Tindivanam Toll" value={form.tollName}  onChange={upd} />
              <EF label="Route"           field="tollRoute" placeholder="e.g. ECR Chennai"     value={form.tollRoute} onChange={upd} />
            </div>
          )}
          {form.type === 'bata' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
              <EF label="Driver Name"    field="bataDriver" placeholder="Driver name" value={form.bataDriver} onChange={upd} />
              <EF label="Trip Reference" field="bataTrip"   placeholder="BK-XXXX"    value={form.bataTrip}   onChange={upd} />
            </div>
          )}
          {form.type === 'maintenance' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700/50">
              <EF label="Vendor Name"    field="maintenanceVendor"  placeholder="Workshop/Garage name" value={form.maintenanceVendor}  onChange={upd} />
              <EF label="Invoice Number" field="maintenanceInvoice" placeholder="INV-XXXX"             value={form.maintenanceInvoice} onChange={upd} />
            </div>
          )}

          {/* Receipt attachment */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              Receipt (Mock — future Google Drive)
            </label>
            <div className="flex gap-2">
              <input type="text" value={form.receiptName || ''} onChange={e => upd('receiptName', e.target.value)}
                placeholder="receipt_filename.jpg"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25" />
              <button type="button" onClick={() => upd('receiptName', `receipt_${form.type}_${form.date}.jpg`)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors whitespace-nowrap">
                📎 Attach
              </button>
            </div>
            {form.receiptName && (
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle size={10} /> {form.receiptName}
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">Google Drive integration planned for a future release.</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={form.notes || ''} onChange={e => upd('notes', e.target.value)}
              placeholder="Additional details…" rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25 resize-none transition-all" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-all shadow-md active:scale-95">
            {isEdit ? 'Save Changes' : isDrv ? 'Submit Expense' : 'Add Expense'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Simple bar chart for category breakdown — Module 9
// ─────────────────────────────────────────────────────────────
function CategoryBar({ expenses }) {
  const summary  = summariseByType(expenses)
  const maxTotal = summary[0]?.total || 1
  return (
    <div className="space-y-3">
      {summary.slice(0, 6).map(t => (
        <div key={t.key}>
          <div className="flex justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium">
              <span>{t.icon}</span>{t.label}
              <span className="text-slate-400 dark:text-slate-500">({t.count})</span>
            </span>
            <span className="font-bold text-amber-600 dark:text-amber-400">Rs. {t.total.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
            <div className={`h-full rounded-full bg-gradient-to-r ${t.color}`}
              style={{ width: `${Math.round((t.total / maxTotal) * 100)}%`, transition:'width .5s' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Monthly trend sparkline — Module 9
// ─────────────────────────────────────────────────────────────
function TrendBars({ expenses }) {
  // Last 6 months
  const months = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const key = d.toISOString().slice(0, 7)
    const lbl = d.toLocaleString('en-IN', { month: 'short' })
    const tot = expenses.filter(e => (getExpenseDate(e) || '').startsWith(key)).reduce((s,e) => s+(e.amount||0), 0)
    months.push({ key, lbl, tot })
  }
  const max = Math.max(...months.map(m => m.tot), 1)
  return (
    <div className="flex items-end gap-1.5 h-16">
      {months.map((m, i) => {
        const isLast = i === months.length - 1
        const pct    = Math.max(6, Math.round((m.tot / max) * 100))
        return (
          <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full relative group">
              <div className={`w-full rounded-t-md ${isLast ? 'bg-gradient-to-t from-amber-500 to-amber-400' : 'bg-slate-200 dark:bg-navy-700'}`}
                style={{ height: `${pct * 0.6}px` }} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-navy-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
                Rs. {m.tot.toLocaleString('en-IN')}
              </div>
            </div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{m.lbl}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Expense row detail panel
// ─────────────────────────────────────────────────────────────
function ExpenseDetail({ expense, onEdit, onDelete, onApprove, onReject, canEdit, canDelete, canApprove }) {
  const isApproved = expense.status === 'approved'
  const isRejected = expense.status === 'rejected'
  const isDone     = isApproved || isRejected

  return (
    <div className="border-t border-slate-100 dark:border-navy-700 p-4 bg-slate-50/50 dark:bg-navy-800/20 space-y-3">
      {/* Detail grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          { label:'Expense ID', value: expense.id,          mono: true    },
          { label:'Date',       value: expense.date                        },
          { label:'Amount',     value: `Rs. ${expense.amount.toLocaleString('en-IN')}`, hi: true },
          { label:'Driver',     value: expense.driver  || '—'             },
          { label:'Vehicle',    value: expense.vehicle || '—'             },
          { label:'Trip Ref',   value: expense.tripRef || 'None',  mono: true },
          { label:'Added By',   value: expense.addedBy || '—'             },
        ].map(d => (
          <div key={d.label} className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{d.label}</p>
            <p className={`text-xs font-bold leading-tight ${d.mono ? 'font-mono' : ''} ${d.hi ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
              {d.value}
            </p>
          </div>
        ))}
      </div>

      {expense.notes && (
        <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-3 py-2.5 border border-amber-100 dark:border-amber-800/30">
          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">{expense.notes}</p>
        </div>
      )}

      {/* Module 5: Receipt */}
      {expense.receiptName && (
        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/15 rounded-lg px-3 py-2 border border-blue-100 dark:border-blue-800/30">
          <FileText size={12} className="text-blue-500 flex-shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-400 flex-1 truncate">{expense.receiptName}</span>
          <span className="text-[10px] text-blue-500">Stored locally</span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap pt-1">
        {/* Module 6: Approval actions */}
        {canApprove && expense.status === 'submitted' && (
          <>
            <button onClick={() => onApprove(expense)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all active:scale-95 shadow-md">
              <CheckCircle size={13} /> Approve
            </button>
            <button onClick={() => onReject(expense)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
              <X size={13} /> Reject
            </button>
          </>
        )}
        {canEdit && !isApproved && (
          <button onClick={() => onEdit(expense)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
            <Edit2 size={13} /> Edit
          </button>
        )}
        {canDelete && !isApproved && (
          <button onClick={() => onDelete(expense.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/25 transition-colors">
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Expenses Page
// ─────────────────────────────────────────────────────────────
export default function Expenses() {
  const { user, isAdmin, isManager, isDriver } = useAuth()

  const canAdd     = true          // all roles can add (drivers: limited types)
  const canEdit    = isAdmin || isManager
  const canDelete  = isAdmin
  const canApprove = isAdmin || isManager

  const [expenses,   setExpenses]  = useState([])
  const [drivers,    setDrivers]   = useState([])
  const [vehicles,   setVehicles]  = useState([])
  const [search,     setSearch]    = useState('')
  const [typeFilter, setTypeFilter]= useState('all')
  const [statFilter, setStatFilter]= useState('all')
  const [dateRange,  setDateRange] = useState('month')  // today | week | month | all
  const [expanded,   setExpanded]  = useState(null)
  const [showAdd,    setShowAdd]   = useState(false)
  const [editExp,    setEditExp]   = useState(null)
  const [toast,      setToast]     = useState('')
  const [page,       setPage]      = useState(1)

  const PAGE_SIZE = 10
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const [loadError, setLoadError] = useState(null)
  const reload = async () => {
    const [e, d, v] = await Promise.allSettled([
      loadExpenses(), loadDrivers(), loadVehicles(),
    ])
    setExpenses(e.status === 'fulfilled' && Array.isArray(e.value) ? e.value : [])
    setDrivers( d.status === 'fulfilled' && Array.isArray(d.value) ? d.value : [])
    setVehicles(v.status === 'fulfilled' && Array.isArray(v.value) ? v.value : [])
    if (e.status === 'rejected') {
      console.error('[Expenses] load failed:', e.reason)
      setLoadError('Could not load expenses. Try refreshing.')
    } else {
      setLoadError(null)
    }
  }
  useEffect(() => { reload() }, [])

  // Driver sees only their own expenses — Module 7
  const myExpenses = isDriver
    ? expenses.filter(e => e.addedBy === user?.username || e.addedBy === user?.name || e.driver === user?.name)
    : expenses

  // Date range filter
  const rangeFiltered = useMemo(() => myExpenses.filter(e => {
    if (dateRange === 'today') return isToday(e)
    if (dateRange === 'week')  return isThisWeek(e)
    if (dateRange === 'month') return isThisMonth(e)
    return true
  }), [myExpenses, dateRange])

  // Search + type + status filter
  const filtered = useMemo(() => {
    return rangeFiltered.filter(e => {
      const q = search.toLowerCase()
      const matchSearch = !q || e.description?.toLowerCase().includes(q)
        || e.driver?.toLowerCase().includes(q)
        || e.vehicle?.toLowerCase().includes(q)
        || e.tripRef?.toLowerCase().includes(q)
        || e.id?.toLowerCase().includes(q)
      const matchType = typeFilter === 'all' || e.type === typeFilter
      const matchStat = statFilter === 'all' || e.status === statFilter
      return matchSearch && matchType && matchStat
    })
  }, [rangeFiltered, search, typeFilter, statFilter])

  // Pagination
  const totalPages   = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated    = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)

  // Summary totals for dashboard (Module 1)
  const totalAmt     = rangeFiltered.reduce((s,e) => s + e.amount, 0)
  const fuelAmt      = rangeFiltered.filter(e=>e.type==='fuel').reduce((s,e)=>s+e.amount,0)
  const bataAmt      = rangeFiltered.filter(e=>e.type==='bata').reduce((s,e)=>s+e.amount,0)
  const tollAmt      = rangeFiltered.filter(e=>e.type==='toll').reduce((s,e)=>s+e.amount,0)
  const parkAmt      = rangeFiltered.filter(e=>e.type==='parking').reduce((s,e)=>s+e.amount,0)
  const pendingCount = rangeFiltered.filter(e=>e.status==='submitted').length

  const handleSave = async (exp) => {
    try {
      await saveExpense(exp)
      addAuditEvent('EXPENSE_ADDED', {
        description: `${exp.type} — Rs. ${(exp.amount||0).toLocaleString('en-IN')} by ${exp.driver || 'Staff'}`,
        driver: exp.driver,
      })
      await reload()
      setShowAdd(false)
      setEditExp(null)
      showToast(editExp ? 'Expense updated' : 'Expense added')
      setPage(1)
    } catch (err) {
      console.error('[Expenses] save failed:', err)
      showToast('Could not save expense. Please try again.')
    }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this expense?')) return
    try {
      await deleteExpense(id)
      await reload()
      setExpanded(null)
      showToast('Expense deleted')
    } catch (err) {
      console.error('[Expenses] delete failed:', err)
      showToast('Could not delete expense. Please try again.')
    }
  }

  const handleApprove = async exp => {
    try {
      await saveExpense({ ...exp, status: 'approved', updatedAt: new Date().toISOString() })
      await reload()
      showToast(`${exp.id} approved`)
    } catch (err) {
      console.error('[Expenses] approve failed:', err)
      showToast('Could not approve expense. Please try again.')
    }
  }

  const handleReject = async exp => {
    try {
      await saveExpense({ ...exp, status: 'rejected', updatedAt: new Date().toISOString() })
      await reload()
      showToast(`${exp.id} rejected`)
    } catch (err) {
      console.error('[Expenses] reject failed:', err)
      showToast('Could not reject expense. Please try again.')
    }
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={isDriver ? 'My Expenses' : 'Expense Management'}
        subtitle={isDriver ? 'Submit and track your expenses' : 'Operational cost tracker & approval'}
        action={
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-white font-bold text-sm transition-all shadow-lg active:scale-95">
            <Plus size={15} /> {isDriver ? 'Submit Expense' : 'Add Expense'}
          </button>
        }
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
          </div>
          <button onClick={reload}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {toast && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{toast}</p>
        </div>
      )}

      {/* Module 6: Pending approval alert */}
      {pendingCount > 0 && canApprove && (
        <div className="flex items-center justify-between gap-3 bg-blue-50 dark:bg-blue-900/15 border border-blue-200 dark:border-blue-800/30 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Receipt size={15} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p className="text-sm font-bold text-blue-700 dark:text-blue-400">
              {pendingCount} expense{pendingCount!==1?'s':''} awaiting approval
            </p>
          </div>
          <button onClick={() => setStatFilter('submitted')}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Review
          </button>
        </div>
      )}

      {/* Module 1: Dashboard summary */}
      {/* Date range tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 w-fit">
        {[['today','Today'],['week','This Week'],['month','This Month'],['all','All Time']].map(([k,l]) => (
          <button key={k} onClick={() => setDateRange(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              dateRange === k
                ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                : 'text-slate-500 dark:text-slate-400'
            }`}>{l}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label:'Total',     value: `Rs.${(totalAmt/1000).toFixed(1)}k`, color:'text-amber-600 dark:text-amber-400' },
          { label:'Fuel',      value: `Rs.${(fuelAmt/1000).toFixed(1)}k`,  color:'text-orange-600 dark:text-orange-400' },
          { label:'Toll',      value: `Rs.${(tollAmt).toLocaleString()}`,   color:'text-blue-600 dark:text-blue-400' },
          { label:'Parking',   value: `Rs.${(parkAmt).toLocaleString()}`,   color:'text-teal-600 dark:text-teal-400' },
          { label:'Bata',      value: `Rs.${(bataAmt).toLocaleString()}`,   color:'text-emerald-600 dark:text-emerald-400' },
          { label:'Entries',   value: rangeFiltered.length,                 color:'text-slate-600 dark:text-slate-300' },
        ].map(s => (
          <div key={s.label} className="glass-card rounded-lg px-3 py-2.5 text-center">
            <p className={`text-lg font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Module 9: Analytics row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Category breakdown */}
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">By Category</p>
          <h3 className="font-display font-black text-slate-800 dark:text-white text-base mb-4">Breakdown</h3>
          {rangeFiltered.length > 0
            ? <CategoryBar expenses={rangeFiltered} />
            : <p className="text-xs text-slate-400 text-center py-4">No expenses in this period</p>
          }
        </div>

        {/* Trend */}
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Monthly Trend</p>
          <h3 className="font-display font-black text-slate-800 dark:text-white text-base mb-4">6-Month View</h3>
          <TrendBars expenses={myExpenses} />
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-navy-700 flex justify-between text-xs">
            <span className="text-slate-500">This month</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">
              Rs. {myExpenses.filter(e=>isThisMonth(e)).reduce((s,e)=>s+e.amount,0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Top categories */}
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Top Categories</p>
          <h3 className="font-display font-black text-slate-800 dark:text-white text-base mb-4">All Time</h3>
          <div className="space-y-2.5">
            {summariseByType(myExpenses).slice(0, 5).map((t, i) => (
              <div key={t.key} className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-xs flex-shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm flex-shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.label}</p>
                  <p className="text-[10px] text-slate-400">{t.count} entries</p>
                </div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex-shrink-0">
                  Rs. {t.total.toLocaleString('en-IN')}
                </p>
              </div>
            ))}
            {summariseByType(myExpenses).length === 0 && (
              <p className="text-xs text-slate-400 text-center py-4">No expense data yet</p>
            )}
          </div>
        </div>
      </div>

      {/* Module 3: Expense list */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {/* List controls */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-navy-700 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">
              {filtered.length} Expenses
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[140px] max-w-xs">
              <Search size={13} className="text-slate-400 flex-shrink-0" />
              <input type="text" value={search} onChange={e=>{ setSearch(e.target.value); setPage(1) }}
                placeholder="Search…"
                className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none w-full font-body" />
            </div>

            <select value={typeFilter} onChange={e=>{ setTypeFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none font-body">
              <option value="all">All Types</option>
              {EXPENSE_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
            </select>

            {/* Approval status pill tabs */}
            <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
              {[
                { key:'all',       label:'All',         count: rangeFiltered.length },
                { key:'submitted', label:'⏳ Pending',  count: rangeFiltered.filter(e=>e.status==='submitted').length },
                { key:'approved',  label:'✅ Approved', count: rangeFiltered.filter(e=>e.status==='approved').length  },
                { key:'rejected',  label:'❌ Rejected', count: rangeFiltered.filter(e=>e.status==='rejected').length  },
              ].map(s => (
                <button key={s.key} onClick={()=>{setStatFilter(s.key);setPage(1)}}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap ${
                    statFilter===s.key
                      ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}>
                  {s.label}
                  <span className={`text-[9px] px-1 rounded-full ${statFilter===s.key?'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400':'bg-slate-200 dark:bg-navy-600 text-slate-400'}`}>
                    {s.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Expense rows */}
        {paginated.length === 0 ? (
          <div className="p-10 text-center">
            <TrendingDown size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No expenses found</p>
          </div>
        ) : (
          <div>
            {paginated.map(exp => {
              const isOpen  = expanded === exp.id
              const typeCfg = getExpTypeCfg(exp.type)
              return (
                <div key={exp.id} className="border-b border-slate-50 dark:border-navy-800 last:border-0">
                  {/* Row */}
                  <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-amber-50/30 dark:hover:bg-navy-800/40 transition-colors select-none"
                       onClick={() => setExpanded(isOpen ? null : exp.id)}>
                    {/* Type icon */}
                    <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${typeCfg.color} flex items-center justify-center text-lg flex-shrink-0 shadow-sm`}>
                      {typeCfg.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{exp.description || typeCfg.label}</p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1"><Calendar size={9} />{exp.date}</span>
                        {exp.driver  && <span className="flex items-center gap-1"><User size={9} />{exp.driver}</span>}
                        {exp.tripRef && <span className="flex items-center gap-1 font-mono">{exp.tripRef}</span>}
                        {exp.receiptName && <span className="flex items-center gap-1 text-blue-500">📎</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-sm font-black text-amber-600 dark:text-amber-400">
                        Rs. {exp.amount.toLocaleString('en-IN')}
                      </p>
                      <ApprovalBadge status={exp.status} />
                    </div>

                    {isOpen ? <ChevronUp size={13} className="text-slate-400 ml-1 flex-shrink-0" />
                             : <ChevronDown size={13} className="text-slate-400 ml-1 flex-shrink-0" />}
                  </div>

                  {isOpen && (
                    <ExpenseDetail
                      expense={exp}
                      onEdit={setEditExp}
                      onDelete={handleDelete}
                      onApprove={handleApprove}
                      onReject={handleReject}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canApprove={canApprove}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40">
                ‹
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = page <= 3 ? i+1 : page-2+i
                if (pg > totalPages) return null
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                      pg === page
                        ? 'bg-amber-500 text-white shadow'
                        : 'border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700'
                    }`}>{pg}
                  </button>
                )
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page===totalPages}
                className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors disabled:opacity-40">
                ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {(showAdd || editExp) && (
        <ExpenseModal
          expense={editExp}
          drivers={drivers}
          vehicles={vehicles}
          onClose={() => { setShowAdd(false); setEditExp(null) }}
          onSave={handleSave}
          currentUser={user}
          isDriver={isDriver}
        />
      )}
    </div>
  )
}