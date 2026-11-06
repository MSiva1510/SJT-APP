export default function StatCard({ label, value, sub, icon: Icon, gradient, trend, trendUp }) {
  return (
    <div className="stat-card animate-fade-up">
      {/* Gradient orb in corner */}
      <div className={`absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20 blur-2xl ${gradient}`} />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gradient} shadow-lg`}>
            <Icon size={18} className="text-white" />
          </div>
          {trend !== undefined && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              trendUp
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                : 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400'
            }`}>
              {trendUp ? '↑' : '↓'} {trend}%
            </span>
          )}
        </div>

        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
          {label}
        </p>
        <p className="text-2xl font-display font-black text-slate-800 dark:text-white leading-tight">
          {value}
        </p>
        {sub && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{sub}</p>
        )}
      </div>
    </div>
  )
}
