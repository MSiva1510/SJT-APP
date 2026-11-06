export default function Button({
  children, onClick, variant = 'primary', size = 'md',
  icon: Icon, iconRight, disabled, className = '',
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-200 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary:  'bg-navy-900 text-white hover:bg-navy-800 focus:ring-navy-500 shadow-lg hover:shadow-xl active:scale-95',
    secondary:'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 focus:ring-slate-400 active:scale-95',
    teal:     'bg-teal-600 text-white hover:bg-teal-500 focus:ring-teal-400 shadow-lg hover:shadow-xl active:scale-95',
    amber:    'bg-amber-500 text-white hover:bg-amber-400 focus:ring-amber-400 shadow-md hover:shadow-lg active:scale-95',
    danger:   'bg-red-600 text-white hover:bg-red-500 focus:ring-red-400 shadow-md active:scale-95',
    ghost:    'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 focus:ring-slate-300 active:scale-95',
    outline:  'border border-slate-300 dark:border-navy-700 text-slate-700 dark:text-slate-200 bg-white/60 dark:bg-navy-800/60 hover:border-navy-400 dark:hover:border-navy-500 hover:bg-slate-50 dark:hover:bg-navy-700 focus:ring-navy-400 active:scale-95',
  }

  const sizes = {
    sm:  'text-xs px-3 py-1.5',
    md:  'text-sm px-4 py-2.5',
    lg:  'text-base px-6 py-3',
  }

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {Icon && !iconRight && <Icon size={size === 'sm' ? 13 : size === 'lg' ? 18 : 15} />}
      {children}
      {Icon && iconRight && <Icon size={size === 'sm' ? 13 : size === 'lg' ? 18 : 15} />}
    </button>
  )
}
