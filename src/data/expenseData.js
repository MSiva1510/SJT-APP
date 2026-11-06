// ─── Expense Data & Storage ───────────────────────────────────
// Storage: Supabase `expenses` table via expenseRepository

import { expenseRepository } from '../repositories/expenseRepository'
import { withCache, cacheClear } from '../utils/dataCache'

export const EXPENSE_TYPES = [
  { key:'fuel',        label:'Fuel',          icon:'⛽', color:'from-orange-500 to-amber-500',  badge:'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',  dot:'bg-orange-500'  },
  { key:'toll',        label:'Toll',          icon:'🛣',  color:'from-blue-500 to-indigo-500',   badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',           dot:'bg-blue-500'    },
  { key:'parking',     label:'Parking',       icon:'🅿',  color:'from-teal-500 to-cyan-500',     badge:'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',           dot:'bg-teal-500'    },
  { key:'bata',        label:'Driver Bata',   icon:'💵', color:'from-emerald-600 to-green-500', badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',dot:'bg-emerald-500' },
  { key:'food',        label:'Food',          icon:'🍽',  color:'from-rose-500 to-pink-500',     badge:'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',           dot:'bg-rose-500'    },
  { key:'maintenance', label:'Maintenance',   icon:'🔧', color:'from-slate-500 to-slate-600',   badge:'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',       dot:'bg-slate-500'   },
  { key:'repair',      label:'Repair',        icon:'🔩', color:'from-red-500 to-rose-600',      badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',               dot:'bg-red-500'     },
  { key:'permit',      label:'Permit',        icon:'📋', color:'from-violet-500 to-purple-600', badge:'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',   dot:'bg-violet-500'  },
  { key:'insurance',   label:'Insurance',     icon:'🛡',  color:'from-sky-500 to-blue-600',      badge:'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',              dot:'bg-sky-500'     },
  { key:'misc',        label:'Miscellaneous', icon:'📦', color:'from-amber-500 to-yellow-500',  badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',       dot:'bg-amber-500'   },
]

export const getExpTypeCfg = key => EXPENSE_TYPES.find(t => t.key === key) || EXPENSE_TYPES[EXPENSE_TYPES.length - 1]

export const APPROVAL_STATUSES = [
  { key:'draft',     label:'Draft',     badge:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',                dot:'bg-slate-400'   },
  { key:'submitted', label:'Submitted', badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',                  dot:'bg-blue-500'    },
  { key:'approved',  label:'Approved',  badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',      dot:'bg-emerald-500' },
  { key:'rejected',  label:'Rejected',  badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',                     dot:'bg-red-500'     },
]
export const getApprovalCfg = key => APPROVAL_STATUSES.find(s => s.key === key) || APPROVAL_STATUSES[0]

export function generateExpenseId() {
  const d  = new Date()
  const y  = d.getFullYear().toString().slice(-2)
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const ts = Date.now().toString().slice(-4)
  return `EXP-${y}${m}-${ts}`
}

export const DRIVER_ALLOWED_TYPES = ['toll','parking','food','bata']

// ── Supabase expense store ────────────────────────────────────
// All functions are async — callers must await them.

async function _loadExpenses() {
  try {
    const rows = await expenseRepository.getAll()
    return (Array.isArray(rows) ? rows : []).map(normalizeExpense)
  } catch (err) {
    console.error('[expenseData] loadExpenses failed:', err)
    throw err
  }
}
export const loadExpenses = withCache('expenses', _loadExpenses)
export const getExpenses = loadExpenses

export function normalizeExpense(row = {}) {
  return {
    ...row,
    id: row.id || row.expense_id,
    date: row.date ?? row.expense_date ?? '',
    amount: Number(row.amount ?? 0),
    description: row.description ?? row.notes ?? row.location ?? '',
    tripRef: row.tripRef ?? row.booking_id ?? '',
    driver: row.driver ?? row.driver_name ?? row.driver_id ?? '',
    vehicle: row.vehicle ?? row.vehicle_registration ?? row.vehicle_id ?? '',
    addedBy: row.addedBy ?? row.created_by ?? '',
    receiptName: row.receiptName ?? row.bill_image_url ?? '',
    receiptDate: row.receiptDate ?? row.expense_date ?? '',
    status: row.status ?? 'draft',
    createdAt: row.createdAt ?? row.created_at ?? '',
    updatedAt: row.updatedAt ?? row.updated_at ?? row.created_at ?? '',
    // Fuel-specific fields
    odometerKm: row.odometer_km || row.odometerKm || 0,
    litresFilled: row.litres_filled || row.litresFilled || 0,
    fuelStation: row.fuel_station || row.fuelStation || '',
    fuelRate: row.fuel_rate || row.fuelRate || 0,
  }
}



export async function saveExpense(expense) {
  const { id, ...rest } = expense
  const existing = id ? await expenseRepository.getById(id) : null
  const result = existing
    ? await expenseRepository.update(id, { ...rest, updatedAt: new Date().toISOString() })
    : await expenseRepository.create({ id: id || generateExpenseId(), ...rest })
  cacheClear('expenses')
  return result
}

export async function deleteExpense(id) {
  const result = await expenseRepository.delete(id)
  cacheClear('expenses')
  return result
}

// ── Date range helpers ────────────────────────────────────────
// ── Date extraction — field-name-agnostic ─────────────────────
// Accepts a full expense object OR a raw date string.
// Supabase may return expense_date, date, created_at, or createdAt.
export function getExpenseDate(expenseOrStr) {
  if (!expenseOrStr) return null
  if (typeof expenseOrStr === 'string') return expenseOrStr.slice(0, 10)
  // Object: try known field names in priority order
  const raw = expenseOrStr.expense_date
    ?? expenseOrStr.date
    ?? expenseOrStr.created_at
    ?? expenseOrStr.createdAt
    ?? null
  if (!raw) return null
  return typeof raw === 'string' ? raw.slice(0, 10) : null
}

// ── Null-safe date helpers ─────────────────────────────────────
// Each accepts an expense object OR a date string — never crashes.
export function isToday(expenseOrDateStr) {
  const d = getExpenseDate(expenseOrDateStr)
  if (!d) return false
  return d === new Date().toISOString().slice(0, 10)
}

export function isThisWeek(expenseOrDateStr) {
  const d = getExpenseDate(expenseOrDateStr)
  if (!d) return false
  const expDate     = new Date(d + 'T00:00:00')
  const now         = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  return expDate >= startOfWeek
}

export function isThisMonth(expenseOrDateStr) {
  const d = getExpenseDate(expenseOrDateStr)
  if (!d) return false
  return d.startsWith(new Date().toISOString().slice(0, 7))
}

// ── Category summary (computed — no storage) ──────────────────
export function summariseByType(expenses) {
  return EXPENSE_TYPES.map(t => ({
    ...t,
    total: (expenses ?? []).filter(e => e.type === t.key).reduce((s, e) => s + (e.amount || 0), 0),
    count: (expenses ?? []).filter(e => e.type === t.key).length,
  })).filter(t => t.total > 0).sort((a, b) => b.total - a.total)
}

export function getTripExpenses(tripRef, expenses) {
  return (expenses ?? []).filter(e => e.tripRef === tripRef)
}

// ── Seed / reference data ─────────────────────────────────────