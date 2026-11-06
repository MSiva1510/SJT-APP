// ─── Fleet Search ─────────────────────────────────────────────
// Debounced search across registration, IMEI, and driver name.

import { useState, useEffect } from 'react'
import { Search, X } from 'lucide-react'

export default function FleetSearch({ value, onChange, placeholder = 'Search by vehicle, IMEI, or driver…' }) {
  const [local, setLocal] = useState(value ?? '')

  useEffect(() => {
    setLocal(value ?? '')
  }, [value])

  // Debounce 250 ms
  useEffect(() => {
    const t = setTimeout(() => {
      if (onChange && local !== value) onChange(local)
    }, 250)
    return () => clearTimeout(t)
  }, [local])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full sm:w-80">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-navy-700
                   bg-white dark:bg-navy-800/60 text-slate-700 dark:text-slate-200
                   focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400
                   transition-colors"
      />
      {local && (
        <button
          onClick={() => setLocal('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}