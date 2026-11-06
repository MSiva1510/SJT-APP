import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, X, ChevronDown, ChevronUp, CheckCircle,
  Clock, IndianRupee, User, Calendar, Edit2,
  Trash2, FileText, Settings, AlertTriangle,
  Printer, Send, Wallet,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Avatar     from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import {
  loadSettlements, saveSettlement, deleteSettlement, generateSettlementId,
  loadPayrollSettings, savePayrollSettings,
  buildSettlement, calculateIncentive,
  SETTLEMENT_STATUSES, getSettlementStatusCfg,
  PAYMENT_METHODS, DEDUCTION_TYPES,
  DEFAULT_PAYROLL_SETTINGS, monthLabel, settlementExists,
  savePayslip, loadPayslips,
  loadTripPayslips, saveTripPayslip,
} from '../data/settlementData'
import { loadExpenses } from '../data/expenseData'
import { driverRepository } from '../repositories'
import ModalOverlay from '../components/ui/ModalOverlay'
import { addAuditEvent } from '../data/auditLogData'

// ─────────────────────────────────────────────────────────────
//  Shared helpers
// ─────────────────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const CUR_YEAR  = new Date().getFullYear()
const CUR_MONTH = new Date().getMonth() + 1

function StatusBadge({ status }) {
  const cfg = getSettlementStatusCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function AmtRow({ label, value, hi, deduct, sub }) {
  return (
    <div className={`flex justify-between items-center py-2 ${sub ? 'pl-3 border-l-2 border-slate-200 dark:border-navy-700' : 'border-b border-slate-100 dark:border-navy-800 last:border-0'}`}>
      <span className={`text-xs ${sub ? 'text-slate-500 dark:text-slate-400' : 'text-slate-600 dark:text-slate-300'} font-medium`}>{label}</span>
      <span className={`text-xs font-bold ${deduct ? 'text-red-600 dark:text-red-400' : hi ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
        {deduct ? '− ' : ''}Rs. {Number(value||0).toLocaleString('en-IN')}
      </span>
    </div>
  )
}

function SectionHead({ title }) {
  return <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-3 mb-1.5 border-t border-slate-100 dark:border-navy-700 pt-3">{title}</p>
}

function FInput({ label, field, value, onChange, type = 'text', required, placeholder, readOnly }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input type={type} value={value ?? ''} onChange={e => onChange(field, e.target.value)}
        placeholder={placeholder} readOnly={readOnly} required={required}
        className={`w-full px-3 py-2 text-sm rounded-lg border bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
          focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all
          ${readOnly ? 'opacity-60 cursor-default' : ''}
          border-slate-200 dark:border-navy-700`} />
    </div>
  )
}

function FSelect({ label, field, value, onChange, children, required }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select value={value ?? ''} onChange={e => onChange(field, e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none">
        {children}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 6: Salary Configuration Panel
// ─────────────────────────────────────────────────────────────
function SalaryConfigPanel({ drivers, onClose }) {
  const [cfg, setCfg] = useState(DEFAULT_PAYROLL_SETTINGS)
  useEffect(() => { loadPayrollSettings().then(s => setCfg(s ?? DEFAULT_PAYROLL_SETTINGS)) }, [])
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const updDriver = (name, field, val) => {
    setCfg(prev => ({
      ...prev,
      drivers: { ...prev.drivers, [name]: { ...prev.drivers[name], [field]: Number(val) } }
    }))
  }
  const updRule = (i, field, val) => {
    setCfg(prev => ({
      ...prev,
      incentiveRules: prev.incentiveRules.map((r, idx) => idx === i ? { ...r, [field]: Number(val) } : r)
    }))
  }
  const handleSave = async () => {
    try {
      await savePayrollSettings(cfg)
      setSaveError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setSaveError('Could not save settings. Please try again.')
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[500px] max-h-[90vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Admin Only</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">Salary Configuration</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Per-driver settings */}
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Driver Salary Settings</p>
            {(drivers || []).map(d => (
              <div key={d.id} className="mb-4 p-3 bg-slate-50 dark:bg-navy-800/50 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <Avatar name={d.name} size={26} />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[['baseSalary','Base Salary (Rs.)'],['dailyBata','Daily Bata (Rs.)']].map(([f,l]) => (
                    <div key={f}>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{l}</label>
                      <input type="number" value={cfg.drivers?.[d.name]?.[f] ?? ''}
                        onChange={e => updDriver(d.name, f, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Module 7: Incentive rules */}
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Incentive Rules</p>
            <div className="space-y-2">
              {(cfg.incentiveRules || DEFAULT_PAYROLL_SETTINGS.incentiveRules).map((rule, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-navy-800/50 rounded-xl p-2.5">
                  <span className="text-[10px] font-bold text-slate-400 w-8 flex-shrink-0">#{i+1}</span>
                  <div className="flex items-center gap-1.5 flex-1">
                    <input type="number" value={rule.minTrips} onChange={e => updRule(i,'minTrips',e.target.value)}
                      className="w-14 px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none text-center" />
                    <span className="text-[10px] text-slate-400">–</span>
                    <input type="number" value={rule.maxTrips} onChange={e => updRule(i,'maxTrips',e.target.value)}
                      className="w-14 px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none text-center" />
                    <span className="text-[10px] text-slate-400">trips</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mx-1">=</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">Rs.</span>
                    <input type="number" value={rule.bonus} onChange={e => updRule(i,'bonus',e.target.value)}
                      className="w-16 px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none text-center" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex-shrink-0 space-y-2">
          {saveError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{saveError}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
            <button onClick={handleSave} className={`flex-1 py-2.5 rounded-xl text-white text-sm font-bold transition-all shadow-md active:scale-95 ${saved ? 'bg-emerald-600' : 'bg-navy-900 dark:bg-blue-700 hover:bg-navy-800 dark:hover:bg-blue-600'}`}>
              {saved ? '✓ Saved' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Create / Edit Settlement Modal
// ─────────────────────────────────────────────────────────────
function SettlementModal({ settlement, drivers, onClose, onSave, currentUser }) {
  const [settings, setSettings] = useState(DEFAULT_PAYROLL_SETTINGS)
  const [expenses, setExpenses] = useState([])
  useEffect(() => {
    Promise.all([loadPayrollSettings(), loadExpenses()]).then(([s, e]) => {
      setSettings(s ?? DEFAULT_PAYROLL_SETTINGS)
      setExpenses(Array.isArray(e) ? e : [])
    })
  }, [])
  const isEdit   = !!settlement?.id

  const [form, setForm] = useState(() => settlement || {
    driver: drivers?.[0]?.name || '',
    month: CUR_MONTH, year: CUR_YEAR,
    workingDays: 26, completedTrips: 0, totalTrips: 0,
    bonus: 0, deductions: [], notes: '',
    manualBata: 0, manualFuel: 0, manualParking: 0,
  })
  const [error, setError] = useState('')

  const upd = (field, val) => setForm(f => ({ ...f, [field]: val }))

  // Live calculation
  const calc = useMemo(() => buildSettlement(form, expenses, settings), [form, expenses, settings])

  // Deductions management
  const addDeduction = () => setForm(f => ({ ...f, deductions: [...(f.deductions||[]), { type:'advance', label:'Advance Salary', amount:0 }] }))
  const updDeduction = (i, field, val) => setForm(f => ({
    ...f,
    deductions: f.deductions.map((d, idx) => idx === i ? { ...d, [field]: field==='amount' ? Number(val) : val } : d)
  }))
  const removeDeduction = i => setForm(f => ({ ...f, deductions: f.deductions.filter((_,idx) => idx !== i) }))

  const handleSave = async () => {
    if (!form.driver) { setError('Select a driver'); return }
    if (!form.month || !form.year) { setError('Select month and year'); return }
    // Duplicate prevention
    if (!isEdit) {
      const exists = await settlementExists(form.driver, Number(form.month), Number(form.year))
      if (exists) {
        setError(`Settlement for ${form.driver} — ${monthLabel(form.month, form.year)} already exists.`)
        return
      }
    }
    const now  = new Date().toISOString()
    const full = {
      ...form,
      ...calc,
      id:         form.id || generateSettlementId(),
      month:      Number(form.month),
      year:       Number(form.year),
      workingDays:Number(form.workingDays),
      completedTrips:Number(form.completedTrips),
      totalTrips: Number(form.totalTrips),
      status:     form.status || 'draft',
      createdBy:  form.createdBy || currentUser?.name || '',
      createdAt:  form.createdAt || now,
      updatedAt:  now
    }
    onSave(full)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[520px] max-h-[94vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isEdit ? 'Edit Settlement' : 'New Settlement'}</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">{isEdit ? settlement.id : 'Create Settlement'}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700"><X size={15} /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-lg px-3 py-2.5">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}

          {/* Basic */}
          <div className="grid grid-cols-2 gap-3">
            <FSelect label="Driver" field="driver" value={form.driver} onChange={upd} required>
              {(drivers || []).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </FSelect>
            <FSelect label="Month" field="month" value={form.month} onChange={upd} required>
              {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
            </FSelect>
            <FInput label="Year" field="year" value={form.year} onChange={upd} type="number" required />
            <FInput label="Working Days" field="workingDays" value={form.workingDays} onChange={upd} type="number" />
            <FInput label="Completed Trips" field="completedTrips" value={form.completedTrips} onChange={upd} type="number" />
            <FInput label="Total Trips" field="totalTrips" value={form.totalTrips} onChange={upd} type="number" />
          </div>

          {/* Salary preview — live */}
          <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-4 border border-slate-200 dark:border-navy-700">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Live Calculation</p>
            <AmtRow label="Base Salary"        value={calc.baseSalary}   />
            <AmtRow label="Driver Bata"         value={calc.bataAmt}      sub />
            <AmtRow label="Fuel Reimbursement"  value={calc.fuelAmt}      sub />
            <AmtRow label="Parking"             value={calc.parkingAmt}   sub />
            <AmtRow label={`Incentive (${form.completedTrips} trips)`} value={calc.incentive} sub />
            <AmtRow label="Bonus"               value={calc.bonus}        sub />
            {calc.totalDeductions > 0 && <AmtRow label="Total Deductions" value={calc.totalDeductions} deduct />}
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-navy-700 flex justify-between">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Net Amount</span>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">Rs. {calc.netAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Manual overrides */}
          <SectionHead title="Manual Overrides (if not from expenses)" />
          <div className="grid grid-cols-3 gap-2">
            <FInput label="Bata (Rs.)"    field="manualBata"    value={form.manualBata}    onChange={upd} type="number" placeholder="0" />
            <FInput label="Fuel (Rs.)"    field="manualFuel"    value={form.manualFuel}    onChange={upd} type="number" placeholder="0" />
            <FInput label="Parking (Rs.)" field="manualParking" value={form.manualParking} onChange={upd} type="number" placeholder="0" />
          </div>
          <FInput label="Bonus (Rs.)" field="bonus" value={form.bonus} onChange={upd} type="number" placeholder="0" />

          {/* Module 8: Deductions */}
          <SectionHead title="Deductions" />
          <div className="space-y-2">
            {(form.deductions || []).map((d, i) => (
              <div key={i} className="flex items-center gap-2 bg-slate-50 dark:bg-navy-800/50 rounded-xl p-2.5">
                <select value={d.type} onChange={e => updDeduction(i,'type',e.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none">
                  {DEDUCTION_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <input type="number" value={d.amount} onChange={e => updDeduction(i,'amount',e.target.value)}
                  placeholder="Amount" className="w-24 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-800 dark:text-slate-100 focus:outline-none" />
                <button onClick={() => removeDeduction(i)} className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center hover:bg-red-100 transition-colors flex-shrink-0">
                  <X size={12} />
                </button>
              </div>
            ))}
            <button onClick={addDeduction}
              className="w-full py-2 rounded-xl border border-dashed border-slate-300 dark:border-navy-600 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
              + Add Deduction
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={form.notes||''} onChange={e => upd('notes', e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none resize-none" />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95">
            {isEdit ? 'Save Changes' : 'Create Settlement'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 4: Payslip View
// ─────────────────────────────────────────────────────────────
function PayslipView({ settlement, onClose }) {
  const tripAllowance  = Number(settlement.trip_allowance  || settlement.bataAmt  || 0)
  const nightAllowance = Number(settlement.night_allowance || 0)
  const fuelIncentive  = Number(settlement.fuel_incentive  || settlement.fuelAmt  || 0)
  const perfBonus      = Number(settlement.performance_bonus || settlement.bonus  || 0)
  const penalty        = Number(settlement.penalty  || 0)
  const advance        = Number(settlement.advance  || 0)
  const baseSalary     = Number(settlement.baseSalary || 0)
  const parking        = Number(settlement.parkingAmt || 0)
  const incentive      = Number(settlement.incentive  || 0)
  const totalEarnings  = baseSalary + tripAllowance + nightAllowance + fuelIncentive + perfBonus + parking + incentive
  const totalDeductions= Number(settlement.totalDeductions || 0) + penalty + advance
  const netSalary      = totalEarnings - totalDeductions

  const handlePrint = () => {
    const tableRow = (l, v) => `<tr><td style="padding:6px 4px;border-bottom:1px solid #f1f5f9">${l}</td><td style="padding:6px 4px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700">Rs. ${Number(v||0).toLocaleString('en-IN')}</td></tr>`
    const html = `<!DOCTYPE html><html><head><title>Payslip – ${settlement.driver} – ${monthLabel(settlement.month,settlement.year)}</title>
    <style>body{font-family:Arial,sans-serif;max-width:480px;margin:24px auto;color:#111;font-size:13px}.header{background:#0d1b4b;color:white;padding:20px;border-radius:8px 8px 0 0}.net{background:#065f46;color:white;padding:12px;border-radius:8px;text-align:center;margin-top:12px}.footer{text-align:center;font-size:10px;color:#94a3b8;margin-top:12px}table{width:100%;border-collapse:collapse}th{background:#f8fafc;padding:8px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase}</style>
    </head><body><div class="header"><div style="font-size:10px;opacity:.6;text-transform:uppercase">Sri Jayam Travels</div><h2 style="margin:4px 0">Monthly Payslip</h2><p style="margin:0;opacity:.6">${monthLabel(settlement.month,settlement.year)} · ${settlement.driver}</p></div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:16px;border-radius:0 0 8px 8px">
    <table><thead><tr><th>Attendance</th><th style="text-align:right"></th></tr></thead><tbody>
    <tr><td style="padding:6px 4px">Working Days</td><td style="padding:6px 4px;text-align:right;font-weight:700">${settlement.workingDays||0}</td></tr>
    <tr><td style="padding:6px 4px">Total Trips</td><td style="padding:6px 4px;text-align:right;font-weight:700">${settlement.totalTrips||0}</td></tr>
    <tr><td style="padding:6px 4px">Completed Trips</td><td style="padding:6px 4px;text-align:right;font-weight:700">${settlement.completedTrips||0}</td></tr>
    </tbody></table>
    <table style="margin-top:12px"><thead><tr><th>Earnings</th><th></th></tr></thead><tbody>
    ${tableRow('Base Salary',baseSalary)}
    ${tripAllowance?tableRow('Trip Allowance',tripAllowance):''}${nightAllowance?tableRow('Night Allowance',nightAllowance):''}
    ${fuelIncentive?tableRow('Fuel Incentive',fuelIncentive):''}${parking?tableRow('Parking',parking):''}
    ${incentive?tableRow('Trip Incentive',incentive):''}${perfBonus?tableRow('Performance Bonus',perfBonus):''}
    <tr style="font-weight:900;background:#f8fafc"><td style="padding:8px 4px">Gross Earnings</td><td style="padding:8px 4px;text-align:right">Rs. ${totalEarnings.toLocaleString('en-IN')}</td></tr>
    </tbody></table>
    ${totalDeductions>0?`<table style="margin-top:12px"><thead><tr><th>Deductions</th><th></th></tr></thead><tbody>
    ${penalty?tableRow('Penalty',penalty):''}${advance?tableRow('Advance Recovery',advance):''}
    ${(settlement.deductions||[]).map(d=>`<tr><td style="padding:6px 4px">${d.type}</td><td style="padding:6px 4px;text-align:right;font-weight:700;color:#dc2626">- Rs. ${Number(d.amount).toLocaleString('en-IN')}</td></tr>`).join('')}
    <tr style="color:#dc2626;font-weight:900"><td style="padding:8px 4px">Total Deductions</td><td style="padding:8px 4px;text-align:right">- Rs. ${totalDeductions.toLocaleString('en-IN')}</td></tr>
    </tbody></table>`:''}
    <div class="net"><div style="font-size:11px;opacity:.7;text-transform:uppercase">Net Salary</div><div style="font-size:28px;font-weight:900">Rs. ${netSalary.toLocaleString('en-IN')}</div><div style="font-size:10px;opacity:.6;margin-top:2px">${monthLabel(settlement.month,settlement.year)}</div></div>
    ${settlement.status==='paid'&&settlement.paymentDate?`<p style="text-align:center;color:#059669;font-size:11px;margin-top:10px">✓ Paid ${settlement.paymentDate} via ${settlement.paymentMethod||''}</p>`:''}
    <p class="footer">Generated by Sri Jayam Travels ERP · ${new Date().toLocaleDateString('en-IN')}</p></div></body></html>`
    const w = window.open('','_blank','width=560,height=700')
    w.document.write(html); w.document.close(); w.focus(); setTimeout(()=>{w.print();w.close()},350)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[420px] max-h-[92vh] sm:max-h-[88vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-t-3xl p-5 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest">Sri Jayam Travels</p>
              <h3 className="font-display font-black text-white text-lg">Monthly Payslip</h3>
              <p className="text-white/60 text-xs">{monthLabel(settlement.month, settlement.year)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button onClick={handlePrint} title="Print / Download"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-colors">
                <Printer size={12} /> Print
              </button>
              <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-white/60 hover:bg-white/20"><X size={15} /></button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Avatar name={settlement.driver} size={36} />
            <div><p className="font-bold text-white">{settlement.driver}</p><p className="text-white/50 text-xs">{settlement.id}</p></div>
            <div className="ml-auto"><StatusBadge status={settlement.status} /></div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {/* Attendance */}
          <div className="grid grid-cols-3 gap-2">
            {[{label:'Work Days',value:settlement.workingDays||0},{label:'Trips',value:settlement.totalTrips||0},{label:'Completed',value:settlement.completedTrips||0}].map(s=>(
              <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center border border-slate-100 dark:border-navy-700">
                <p className="text-base font-black text-slate-700 dark:text-slate-200">{s.value}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Earnings */}
          <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2">Earnings</p>
            <AmtRow label="Base Salary"       value={baseSalary}    />
            {tripAllowance  > 0 && <AmtRow label="Trip Allowance"    value={tripAllowance}  sub />}
            {nightAllowance > 0 && <AmtRow label="Night Allowance"   value={nightAllowance} sub />}
            {fuelIncentive  > 0 && <AmtRow label="Fuel Incentive"    value={fuelIncentive}  sub />}
            {parking        > 0 && <AmtRow label="Parking Reimb."    value={parking}        sub />}
            {incentive      > 0 && <AmtRow label="Trip Incentive"    value={incentive}      sub />}
            {perfBonus      > 0 && <AmtRow label="Performance Bonus" value={perfBonus}      sub />}
            <div className="flex justify-between pt-2 mt-1 border-t border-slate-200 dark:border-navy-700">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Gross Earnings</span>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Rs. {totalEarnings.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Deductions */}
          {(totalDeductions > 0 || (settlement.deductions||[]).length > 0) && (
            <div className="bg-red-50 dark:bg-red-900/15 rounded-xl p-3 border border-red-100 dark:border-red-800/30">
              <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-2">Deductions</p>
              {penalty > 0 && <AmtRow label="Penalty"          value={penalty} deduct />}
              {advance > 0 && <AmtRow label="Advance Recovery" value={advance} deduct />}
              {(settlement.deductions||[]).map((d,i) => (
                <div key={i} className="flex justify-between text-xs py-1">
                  <span className="text-red-700 dark:text-red-400 font-medium">{DEDUCTION_TYPES.find(t=>t.key===d.type)?.label||d.type}</span>
                  <span className="font-bold text-red-600 dark:text-red-400">− Rs. {Number(d.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
              {totalDeductions > 0 && (
                <div className="flex justify-between pt-2 mt-1 border-t border-red-200 dark:border-red-800/40">
                  <span className="text-xs font-bold text-red-700 dark:text-red-400">Total Deductions</span>
                  <span className="text-xs font-bold text-red-600 dark:text-red-400">− Rs. {totalDeductions.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          )}

          {/* Net hero */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-500 rounded-2xl p-4 text-center shadow-lg">
            <p className="text-white/70 text-xs font-bold uppercase tracking-wider mb-1">Net Salary</p>
            <p className="font-display font-black text-white text-3xl">Rs. {netSalary.toLocaleString('en-IN')}</p>
            <p className="text-white/60 text-[10px] mt-1">{monthLabel(settlement.month, settlement.year)}</p>
          </div>

          {settlement.status === 'paid' && settlement.paymentDate && (
            <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/15 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800/30">
              <Wallet size={16} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Paid on {settlement.paymentDate}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-500">{settlement.paymentMethod}{settlement.paymentRemarks?` · ${settlement.paymentRemarks}`:''}</p>
              </div>
            </div>
          )}
          {settlement.notes && <p className="text-xs text-slate-500 dark:text-slate-400 italic">{settlement.notes}</p>}
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Salary History Panel (Module 5) ──────────────────────────
function SalaryHistoryPanel({ settlements, onViewPayslip }) {
  const [driverFilter, setDriverFilter] = useState('all')
  const drivers = useMemo(() => [...new Set(settlements.map(s=>s.driver).filter(Boolean))].sort(), [settlements])
  const filtered = useMemo(() => {
    const items = driverFilter==='all' ? settlements : settlements.filter(s=>s.driver===driverFilter)
    return [...items].sort((a,b) => b.year!==a.year ? b.year-a.year : b.month-a.month)
  }, [settlements, driverFilter])
  const driverTotals = useMemo(() => {
    const map = {}
    settlements.forEach(s => {
      if (!map[s.driver]) map[s.driver] = { driver:s.driver, count:0, total:0, paid:0 }
      map[s.driver].count++
      map[s.driver].total += Number(s.netAmount||0)
      if (s.status==='paid') map[s.driver].paid += Number(s.netAmount||0)
    })
    return Object.values(map).sort((a,b)=>b.total-a.total)
  }, [settlements])
  const MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return (
    <div className="space-y-4">
      {driverTotals.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Driver Summary</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {driverTotals.map(d => (
              <div key={d.driver} onClick={() => setDriverFilter(driverFilter===d.driver?'all':d.driver)}
                className={`glass-card rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${driverFilter===d.driver?'ring-2 ring-navy-500/30':''}`}>
                <div className="flex items-center gap-2.5">
                  <Avatar name={d.driver} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{d.driver}</p>
                    <p className="text-[10px] text-slate-400">{d.count} settlements</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">Rs. {d.total.toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-slate-400">Rs. {d.paid.toLocaleString('en-IN')} paid</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <select value={driverFilter} onChange={e=>setDriverFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
          <option value="all">All Drivers</option>
          {drivers.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <p className="text-xs text-slate-400">{filtered.length} records</p>
      </div>
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <IndianRupee size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No salary history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => (
            <div key={s.id} className="glass-card rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 p-3.5">
                <div className="w-10 h-10 rounded-xl bg-navy-900 dark:bg-navy-800 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-bold text-blue-400 uppercase leading-none">{MN[s.month]}</span>
                  <span className="text-xs font-black text-white leading-tight">{s.year}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{s.driver}</p>
                  <p className="text-[10px] text-slate-400">{s.completedTrips||0} trips · {s.workingDays||0} days</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-black text-slate-800 dark:text-white">Rs. {Number(s.netAmount||0).toLocaleString('en-IN')}</p>
                  <StatusBadge status={s.status} />
                </div>
                <button onClick={() => onViewPayslip(s)}
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-700 flex-shrink-0 transition-colors">
                  <FileText size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 10: Mark Paid Modal
// ─────────────────────────────────────────────────────────────
function MarkPaidModal({ settlement, onClose, onSave }) {
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().slice(0,10), paymentMethod:'Bank Transfer', paymentRemarks:'' })
  const upd = (f,v) => setForm(p => ({ ...p, [f]: v }))
  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-80 bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mb-4 sm:hidden" />
        <h3 className="font-display font-black text-slate-800 dark:text-white text-base mb-1">Mark as Paid</h3>
        <p className="text-xs text-slate-500 mb-4">{settlement.driver} · {monthLabel(settlement.month, settlement.year)} · Rs. {settlement.netAmount.toLocaleString('en-IN')}</p>
        <div className="space-y-3 mb-4">
          <FInput    label="Payment Date"    field="paymentDate"    value={form.paymentDate}    onChange={upd} type="date" required />
          <FSelect   label="Payment Method"  field="paymentMethod"  value={form.paymentMethod}  onChange={upd}>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </FSelect>
          <FInput    label="Remarks"         field="paymentRemarks" value={form.paymentRemarks} onChange={upd} placeholder="Optional" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
          <button onClick={() => onSave({ ...settlement, status:'paid', ...form, updatedAt: new Date().toISOString() })}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-all shadow-md active:scale-95">
            Confirm Payment
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Settlement row detail panel
// ─────────────────────────────────────────────────────────────
function SettlementDetail({ s, onEdit, onDelete, onApprove, onSubmit, onMarkPaid, onViewPayslip, canEdit, canDelete, canApprove, isAdmin }) {
  const canSubmit  = s.status === 'draft'
  const canApprov  = canApprove && s.status === 'pending'
  const canPay     = isAdmin && s.status === 'approved'
  const isApproved = s.status === 'approved' || s.status === 'paid'

  return (
    <div className="border-t border-slate-100 dark:border-navy-700 p-4 bg-slate-50/50 dark:bg-navy-800/20 space-y-3">
      {/* Breakdown */}
      <div className="bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
        <AmtRow label="Base Salary"         value={s.baseSalary}       />
        <AmtRow label="Bata"                value={s.bataAmt}          sub />
        <AmtRow label="Fuel"                value={s.fuelAmt}          sub />
        <AmtRow label="Parking"             value={s.parkingAmt}       sub />
        <AmtRow label="Incentive"           value={s.incentive}        sub />
        {s.bonus > 0 && <AmtRow label="Bonus" value={s.bonus}         sub />}
        <AmtRow label="Gross"               value={s.grossAmount}      />
        {s.totalDeductions > 0 && <AmtRow label="Deductions" value={s.totalDeductions} deduct />}
        <div className="flex justify-between pt-2 mt-1 border-t border-slate-200 dark:border-navy-700">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Net Amount</span>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">Rs. {s.netAmount.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {/* Deductions detail */}
      {(s.deductions||[]).length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/15 rounded-xl p-3 border border-red-100 dark:border-red-800/30">
          <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider mb-1.5">Deductions</p>
          {s.deductions.map((d,i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span className="text-red-700 dark:text-red-400">{DEDUCTION_TYPES.find(t=>t.key===d.type)?.label || d.type}</span>
              <span className="font-bold text-red-600 dark:text-red-400">− Rs. {Number(d.amount).toLocaleString('en-IN')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payment info */}
      {s.status === 'paid' && s.paymentDate && (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-lg px-3 py-2 border border-emerald-200 dark:border-emerald-800/30">
          <Wallet size={13} className="text-emerald-600 flex-shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
            Paid {s.paymentDate} via {s.paymentMethod}
            {s.paymentRemarks ? ' · ' + s.paymentRemarks : ''}
          </p>
        </div>
      )}

      {s.notes && <p className="text-xs text-slate-500 dark:text-slate-400 italic">{s.notes}</p>}

      {/* Actions */}
      <div className="flex gap-2 flex-wrap pt-1">
        <button onClick={() => onViewPayslip(s)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
          <FileText size={13} /> Payslip
        </button>
        {canSubmit && (
          <button onClick={() => onSubmit(s)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-500 transition-all active:scale-95 shadow-md">
            <Send size={13} /> Submit
          </button>
        )}
        {canApprov && (
          <button onClick={() => onApprove(s)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition-all active:scale-95 shadow-md">
            <CheckCircle size={13} /> Approve
          </button>
        )}
        {canPay && (
          <button onClick={() => onMarkPaid(s)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-all active:scale-95 shadow-md">
            <Wallet size={13} /> Mark Paid
          </button>
        )}
        {canEdit && !isApproved && (
          <button onClick={() => onEdit(s)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
            <Edit2 size={13} /> Edit
          </button>
        )}
        {canDelete && !isApproved && (
          <button onClick={() => onDelete(s.id)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/25 transition-colors">
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Per-Trip Payslip Card
// ─────────────────────────────────────────────────────────────
function TripPayslipCard({ p }) {
  const [open, setOpen] = useState(false)
  const isPaid = p.status === 'paid'
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={() => setOpen(v => !v)}>
        {/* Date badge */}
        <div className="w-11 h-11 rounded-xl bg-navy-900 dark:bg-navy-800 flex flex-col items-center justify-center flex-shrink-0">
          <span className="text-[8px] font-bold text-blue-400 uppercase leading-none">
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][new Date(p.date).getMonth()]}
          </span>
          <span className="text-sm font-black text-white leading-tight">{new Date(p.date).getDate()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{p.customer}</p>
          <p className="text-[10px] text-slate-400 truncate">{p.pickup} → {p.drop || '—'}</p>
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{p.bookingNo}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-black text-emerald-600 dark:text-emerald-400">Rs. {p.net.toLocaleString('en-IN')}</p>
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
            {isPaid ? '✓ Paid' : 'Pending'}
          </span>
        </div>
        {open ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0" /> : <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />}
      </div>

      {open && (
        <div className="border-t border-slate-100 dark:border-navy-700 px-4 pb-4 pt-3 space-y-2 bg-slate-50/50 dark:bg-navy-800/20">
          <div className="bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700 space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-slate-500 dark:text-slate-400">Trip Fare</span><span className="font-bold text-slate-700 dark:text-slate-200">Rs. {p.fare.toLocaleString('en-IN')}</span></div>
            {p.bata > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500 dark:text-slate-400 pl-2">+ Daily Bata</span><span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {p.bata.toLocaleString('en-IN')}</span></div>}
            {p.fuel > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500 dark:text-slate-400 pl-2">+ Fuel</span><span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {p.fuel.toLocaleString('en-IN')}</span></div>}
            {p.parking > 0 && <div className="flex justify-between text-xs"><span className="text-slate-500 dark:text-slate-400 pl-2">+ Parking</span><span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {p.parking.toLocaleString('en-IN')}</span></div>}
            <div className="flex justify-between pt-1.5 border-t border-slate-100 dark:border-navy-700">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Net</span>
              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">Rs. {p.net.toLocaleString('en-IN')}</span>
            </div>
          </div>
          {isPaid && p.paidAt && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle size={10} /> Paid on {p.paidAt.slice(0,10)}{p.paidBy ? ` by ${p.paidBy}` : ''}
            </p>
          )}
          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{p.id} · {p.vehicle || '—'}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Driver-only payslips portal — per-trip model
// ─────────────────────────────────────────────────────────────
function DriverPayslipPortal({ user }) {
  const [_allPay, setAllPay] = useState([])
  useEffect(()=>{ loadTripPayslips().then(p=>setAllPay(Array.isArray(p)?p:[])) },[])
  const mine = _allPay.filter(p => p.driver === user?.name)

  const totalEarned = mine.reduce((s, p) => s + p.net, 0)
  const totalPaid   = mine.filter(p => p.status === 'paid').reduce((s, p) => s + p.net, 0)
  const pending     = mine.filter(p => p.status === 'pending').reduce((s, p) => s + p.net, 0)

  return (
    <div className="space-y-4">
      {/* Earnings summary */}
      <div className="rounded-2xl overflow-hidden shadow-xl" style={{ background:'linear-gradient(135deg,#0d1b4b 0%,#1e3a8a 60%,#1d4ed8 100%)' }}>
        <div className="p-5">
          <p className="text-white/50 text-[10px] font-bold uppercase tracking-widest mb-1">Sri Jayam Travels</p>
          <h2 className="font-display font-black text-white text-xl mb-4">My Trip Earnings</h2>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label:'Total Trips',  value: mine.length },
              { label:'Paid Trips',   value: mine.filter(p => p.status === 'paid').length },
              { label:'Pending',      value: mine.filter(p => p.status === 'pending').length },
            ].map(s => (
              <div key={s.label} className="bg-white/10 rounded-xl p-2.5 text-center">
                <p className="text-white font-bold text-sm">{s.value}</p>
                <p className="text-white/50 text-[9px] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-white/60 text-[10px] font-bold uppercase">Total Earned</p>
              <p className="font-display font-black text-white text-lg">Rs. {totalEarned.toLocaleString('en-IN')}</p>
            </div>
            <div className="bg-emerald-500/30 rounded-xl p-3 text-center">
              <p className="text-white/60 text-[10px] font-bold uppercase">Pending Pay</p>
              <p className="font-display font-black text-amber-300 text-lg">Rs. {pending.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Trip payslip list */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Trip Payslips</p>
        {mine.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center">
            <IndianRupee size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-slate-500 text-sm font-medium">No trip payslips yet</p>
            <p className="text-slate-400 text-xs mt-1">Payslips are generated automatically when you complete a trip</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {mine.map(p => <TripPayslipCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Payroll Page
// ─────────────────────────────────────────────────────────────
export default function Payroll() {
  const { user, isAdmin, isManager, isDriver, can } = useAuth()

  const canCreate  = isAdmin || isManager
  const canEdit    = isAdmin || isManager
  const canDelete  = isAdmin
  const canApprove = isAdmin

  const [tab,          setTab]          = useState('settlements') // 'settlements' | 'trip_payslips'
  const [settlements,  setSettlements]  = useState([])
  const [tripPayslips, setTripPayslips] = useState([])
  const [expanded,     setExpanded]     = useState(null)
  const [showCreate,   setShowCreate]   = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  const [payslipItem,  setPayslipItem]  = useState(null)
  const [markPaidItem, setMarkPaidItem] = useState(null)
  const [showConfig,   setShowConfig]   = useState(false)
  const [driverFilter, setDriverFilter] = useState('all')
  const [statFilter,   setStatFilter]   = useState('all')
  const [toast,        setToast]        = useState('')
  const [drivers,      setDrivers]      = useState([])
  const [loadError,    setLoadError]    = useState(null)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const reload = useCallback(async () => {
    const [s, p, d] = await Promise.allSettled([loadSettlements(), loadTripPayslips(), loadDrivers()])
    setSettlements( s.status === 'fulfilled' && Array.isArray(s.value) ? s.value : [])
    setTripPayslips(p.status === 'fulfilled' && Array.isArray(p.value) ? p.value : [])
    setDrivers(     d.status === 'fulfilled' && Array.isArray(d.value) ? d.value : [])
    const failed = [s, p, d].some(r => r.status === 'rejected')
    if (failed) {
      [s, p, d].forEach(r => { if (r.status === 'rejected') console.error('[Payroll] load failed:', r.reason) })
      setLoadError('Some payroll data failed to load. Try refreshing.')
    } else {
      setLoadError(null)
    }
  }, [])
  useEffect(() => { reload() }, [reload])

  // Driver gets their own portal
  if (isDriver) return (
    <div className="space-y-5 animate-fade-up max-w-lg mx-auto">
      <PageHeader title="My Payslips" subtitle="Per-trip payslip history" />
      <DriverPayslipPortal user={user} />
    </div>
  )

  // ── Filtered list ─────────────────────────────────────────
  const filtered = useMemo(() => settlements.filter(s => {
    const matchD = driverFilter === 'all' || s.driver === driverFilter
    const matchS = statFilter   === 'all' || s.status === statFilter
    return matchD && matchS
  }), [settlements, driverFilter, statFilter])

  // Module 3: KPI counts
  const totalPayroll  = settlements.filter(s => s.status === 'paid').reduce((sum,s) => sum + s.netAmount, 0)
  const pendingCount  = settlements.filter(s => s.status === 'pending').length
  const approvedCount = settlements.filter(s => s.status === 'approved').length
  const paidCount     = settlements.filter(s => s.status === 'paid').length

  // Actions
  const handleSave = async s => {
    const result = await saveSettlement(s)
    if (!result) { showToast('Could not save settlement. Please try again.'); return }
    await reload()
    setShowCreate(false)
    setEditItem(null)
    showToast(editItem ? 'Settlement updated' : 'Settlement created')
  }
  const handleDelete = async id => {
    if (!window.confirm('Delete this settlement?')) return
    const ok = await deleteSettlement(id)
    if (!ok) { showToast('Could not delete settlement. Please try again.'); return }
    await reload()
    setExpanded(null)
    showToast('Deleted')
  }
  const handleSubmit = async s => {
    const result = await saveSettlement({ ...s, status:'pending', updatedAt: new Date().toISOString() })
    if (!result) { showToast('Could not submit settlement. Please try again.'); return }
    await reload()
    showToast(`${s.id} submitted for approval`)
  }
  const handleApprove = async s => {
    const result = await saveSettlement({ ...s, status:'approved', approvedBy: user?.name, updatedAt: new Date().toISOString() })
    if (!result) { showToast('Could not approve settlement. Please try again.'); return }
    await reload()
    showToast(`${s.id} approved`)
  }
  const handleMarkPaid = async s => {
    const result = await saveSettlement(s)
    if (!result) { showToast('Could not mark settlement as paid. Please try again.'); return }
    await reload()
    setMarkPaidItem(null)
    showToast(`${s.id} marked as paid`)
    addAuditEvent('PAYROLL_SETTLED', {
      description: `${s.driver} — Rs. ${(s.netAmount||0).toLocaleString('en-IN')} marked paid`,
      driver: s.driver,
    })
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Payroll & Settlements"
        subtitle={`${settlements.length} settlements · ${tripPayslips.length} trip payslips`}
        action={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button onClick={() => setShowConfig(true)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
                <Settings size={15} />
              </button>
            )}
            {canCreate && tab === 'settlements' && (
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
                <Plus size={15} /> New Settlement
              </button>
            )}
          </div>
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

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 w-fit">
        {[['settlements','Monthly Settlements'],['trip_payslips','Trip Payslips'],['history','Salary History']].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              tab === key
                ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {lbl}
            <span className={`ml-1.5 text-[10px] ${tab === key ? 'text-blue-500' : 'text-slate-400'}`}>
              {key === 'settlements' ? settlements.length : tripPayslips.length}
            </span>
          </button>
        ))}
      </div>

      {toast && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{toast}</p>
        </div>
      )}

      {/* ── Trip Payslips tab ── */}
      {tab === 'trip_payslips' && (() => {
        const filteredTP = tripPayslips.filter(p =>
          (driverFilter === 'all' || p.driver === driverFilter)
        )
        const tpPending = tripPayslips.filter(p => p.status === 'pending').reduce((s,p) => s+p.net, 0)
        const tpPaid    = tripPayslips.filter(p => p.status === 'paid').reduce((s,p) => s+p.net, 0)
        return (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label:'Total Payslips', value: tripPayslips.length,           color:'text-navy-800 dark:text-blue-300' },
                { label:'Pending Pay',    value:`Rs.${(tpPending/1000).toFixed(1)}k`, color:'text-amber-600 dark:text-amber-400' },
                { label:'Total Paid',     value:`Rs.${(tpPaid/1000).toFixed(1)}k`,   color:'text-emerald-600 dark:text-emerald-400' },
              ].map(s => (
                <div key={s.label} className="glass-card rounded-xl px-3 py-3 text-center">
                  <p className={`text-xl font-display font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Driver filter */}
            <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none font-body">
              <option value="all">All Drivers</option>
              {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
            {/* List */}
            {filteredTP.length === 0 ? (
              <div className="glass-card rounded-2xl p-12 text-center">
                <FileText size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No trip payslips yet</p>
                <p className="text-slate-400 text-xs mt-1">Auto-generated when a driver completes a trip</p>
              </div>
            ) : (
              <div className="glass-card rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-navy-800/50 border-b border-slate-100 dark:border-navy-700">
                        {['Payslip ID','Driver','Customer','Date','Booking','Fare','Bata','Net','Status','Action'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTP.map(p => (
                        <tr key={p.id} className="border-b border-slate-50 dark:border-navy-800 hover:bg-slate-50/50 dark:hover:bg-navy-800/30 transition-colors">
                          <td className="px-3 py-2.5 text-[10px] font-mono text-slate-500 whitespace-nowrap">{p.id}</td>
                          <td className="px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">{p.driver}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{p.customer}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">{p.date}</td>
                          <td className="px-3 py-2.5 text-[10px] font-mono text-slate-400">{p.bookingNo}</td>
                          <td className="px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">Rs.{p.fare.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">Rs.{p.bata.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-xs font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">Rs.{p.net.toLocaleString('en-IN')}</td>
                          <td className="px-3 py-2.5">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              p.status === 'paid'
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {p.status === 'paid' ? '✓ Paid' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {p.status === 'pending' && isAdmin && (
                              <button
                                onClick={() => {
                                  const updated = { ...p, status:'paid', paidAt: new Date().toISOString(), paidBy: user?.name }
                                  saveTripPayslip(updated)
                                  reload()
                                  showToast(`${p.id} marked as paid`)
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-500 transition-colors whitespace-nowrap">
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )
      })()}
      {tab === 'settlements' && (<>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          // Module 3 (Day 20.5): company-wide Rs. total is a revenue-dashboard
          // figure — managers can operate payroll but must not see totals.
          { label:'Total Paid',          value: can('revenueDashboard') ? `Rs.${(totalPayroll/1000).toFixed(1)}k` : '—', color:'text-emerald-600 dark:text-emerald-400', filter:null, hidden: !can('revenueDashboard') },
          { label:'Pending Approval',    value: pendingCount,                           color:'text-blue-600 dark:text-blue-400',       filter:'pending'  },
          { label:'Approved (Unpaid)',   value: approvedCount,                          color:'text-violet-600 dark:text-violet-400',   filter:'approved' },
          { label:'Paid This Cycle',     value: paidCount,                              color:'text-navy-800 dark:text-blue-300',       filter:'paid'     },
        ].map(s => (
          <div key={s.label} onClick={() => s.filter && setStatFilter(s.filter)}
            className={`glass-card rounded-xl px-3 py-3 text-center ${s.filter ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all' : ''} ${s.hidden ? 'opacity-50' : ''}`}>
            <p className={`text-xl font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={driverFilter} onChange={e => setDriverFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none font-body">
          <option value="all">All Drivers</option>
          {drivers.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
        </select>
        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
          {[['all','All'], ...SETTLEMENT_STATUSES.map(s => [s.key, s.label])].map(([k,l]) => (
            <button key={k} onClick={() => setStatFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statFilter === k
                  ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                  : 'text-slate-500 dark:text-slate-400'
              }`}>{l}
            </button>
          ))}
        </div>
      </div>

      {/* Settlement list — Module 9 */}
      {filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <IndianRupee size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No settlements found</p>
          {canCreate && (
            <button onClick={() => setShowCreate(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 transition-all">
              <Plus size={13} /> Create First Settlement
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(s => {
            const isOpen = expanded === s.id
            return (
              <div key={s.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all">
                {/* Row */}
                <div className="flex items-center gap-3 p-4 cursor-pointer select-none"
                     onClick={() => setExpanded(isOpen ? null : s.id)}>
                  {/* Month badge */}
                  <div className="w-12 h-12 rounded-xl bg-navy-900 dark:bg-navy-800 flex flex-col items-center justify-center flex-shrink-0">
                    <span className="text-[8px] font-bold text-blue-400 uppercase leading-none">
                      {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][s.month-1]}
                    </span>
                    <span className="text-sm font-black text-white leading-tight">{s.year}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-bold text-slate-800 dark:text-white text-sm">{s.driver}</p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{s.id}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={9} />{s.workingDays} days</span>
                      <span className="flex items-center gap-1"><User size={9} />{s.completedTrips} trips</span>
                      {s.paymentDate && <span>· Paid {s.paymentDate}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <p className="text-base font-black text-emerald-600 dark:text-emerald-400">
                      Rs. {s.netAmount.toLocaleString('en-IN')}
                    </p>
                    <StatusBadge status={s.status} />
                  </div>

                  {isOpen ? <ChevronUp size={13} className="text-slate-400 flex-shrink-0 ml-1" />
                           : <ChevronDown size={13} className="text-slate-400 flex-shrink-0 ml-1" />}
                </div>

                {isOpen && (
                  <SettlementDetail
                    s={s}
                    onEdit={setEditItem}
                    onDelete={handleDelete}
                    onApprove={handleApprove}
                    onSubmit={handleSubmit}
                    onMarkPaid={setMarkPaidItem}
                    onViewPayslip={setPayslipItem}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    canApprove={canApprove}
                    isAdmin={isAdmin}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Salary History Tab */}
      {tab === 'history' && (
        <SalaryHistoryPanel settlements={settlements} onViewPayslip={setPayslipItem} />
      )}

      {/* Modals */}
      </>)}
      {(showCreate || editItem) && (
        <SettlementModal
          settlement={editItem}
          drivers={drivers}
          onClose={() => { setShowCreate(false); setEditItem(null) }}
          onSave={handleSave}
          currentUser={user}
        />
      )}
      {payslipItem  && <PayslipView    settlement={payslipItem}  onClose={() => setPayslipItem(null)}  />}
      {markPaidItem && <MarkPaidModal  settlement={markPaidItem} onClose={() => setMarkPaidItem(null)} onSave={handleMarkPaid} />}
      {showConfig   && <SalaryConfigPanel drivers={drivers} onClose={() => setShowConfig(false)} />}
    </div>
  )
}