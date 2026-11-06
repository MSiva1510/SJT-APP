// ─── Fleet Filters ────────────────────────────────────────────
// Toggle chips for the 8 filter states (Moving/Stopped/Offline,
// GPS ON/OFF, Ignition ON/OFF). Multi-select; missing filters
// imply "any".

const FILTER_CONFIG = [
  { key: 'moving',     label: 'Moving',     color: 'amber'  },
  { key: 'stopped',    label: 'Stopped',    color: 'slate'  },
  { key: 'offline',    label: 'Offline',    color: 'red'    },
  { key: 'gps_on',     label: 'GPS ON',     color: 'emerald' },
  { key: 'gps_off',    label: 'GPS OFF',    color: 'rose'   },
  { key: 'ignition_on',label: 'Ignition ON',color: 'blue'   },
  { key: 'ignition_off',label: 'Ignition OFF', color: 'violet' },
]

const COLOR_CLASSES = {
  amber:   { active: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  slate:   { active: 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-500',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  red:     { active: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  emerald: { active: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  rose:    { active: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  blue:    { active: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
  violet:  { active: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700',
             inactive: 'bg-white text-slate-600 border-slate-200 dark:bg-navy-800 dark:text-slate-300 dark:border-navy-700' },
}

export default function FleetFilters({ active, onChange }) {
  function toggle(key) {
    const next = new Set(active ?? [])
    if (next.has(key)) next.delete(key); else next.add(key)
    onChange?.(next)
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FILTER_CONFIG.map(({ key, label, color }) => {
        const isActive = (active ?? new Set()).has(key)
        const cls = isActive ? COLOR_CLASSES[color].active : COLOR_CLASSES[color].inactive
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${cls}`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export { FILTER_CONFIG }