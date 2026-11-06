// ─── Vehicle Utility Functions ────────────────────────────────
// Extracted from pages/Vehicles.jsx so data modules and other
// pages can import these without pulling in a page component.

const _today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function docStatus(expiryDateStr) {
  if (!expiryDateStr) return {
    key: 'unknown', label: 'Unknown',
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
  }
  const exp  = new Date(expiryDateStr)
  const days = Math.floor((exp - _today()) / (1000 * 60 * 60 * 24))
  if (days < 0)   return { key: 'expired', label: 'Expired',       badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             dot: 'bg-red-500',    days }
  if (days <= 30) return { key: 'soon',    label: 'Expiring Soon', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     dot: 'bg-amber-500',  days }
  return              { key: 'active',  label: 'Active',       badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500', days }
}

export function daysLabel(days) {
  if (days == null) return ''
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'Expires today'
  return `${days}d left`
}
