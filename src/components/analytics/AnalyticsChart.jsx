// ─── Analytics Charts ──────────────────────────────────────────
// Day 36: Pure SVG chart components following the existing pattern
// from Dashboard.jsx (BarChart, DonutRing). No external library.
// Fully responsive, dark-mode aware via Tailwind.

// ── 1. Bar Chart ─────────────────────────────────────────────
export function BarChart({ data = [], valueKey = 'value', labelKey = 'label', height = 120, color = 'from-blue-500 to-indigo-500', suffix = '' }) {
  const values = data.map(d => Number(d[valueKey] ?? 0))
  const max    = Math.max(1, ...values)
  if (!data.length) return <Empty />
  return (
    <div style={{ height }} className="flex items-end gap-1.5 w-full">
      {data.map((d, i) => {
        const pct = Math.round((values[i] / max) * 100)
        return (
          <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
            <div className="w-full relative">
              <div className={`w-full rounded-t-md bg-gradient-to-t ${color} shadow-sm transition-all duration-500`}
                   style={{ height: `${Math.max(pct * (height - 24) / 100, 4)}px` }} />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
                {values[i].toLocaleString('en-IN')}{suffix}
              </div>
            </div>
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 truncate w-full text-center leading-tight">
              {String(d[labelKey]).slice(0, 6)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── 2. Donut Chart ────────────────────────────────────────────
export function DonutChart({ segments = [], size = 96, thickness = 8 }) {
  // segments: [{ label, value, color }]
  const total  = segments.reduce((s, x) => s + (x.value ?? 0), 0) || 1
  const r      = (size / 2) - thickness
  const cx     = size / 2, cy = size / 2
  const circ   = 2 * Math.PI * r
  if (!segments.length) return <Empty size={size} />

  let offset = 0
  const arcs = segments.map(seg => {
    const frac = (seg.value ?? 0) / total
    const dash = frac * circ
    const arc  = { ...seg, dash, offset: circ - offset, frac }
    offset += dash
    return arc
  })

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={cx} cy={cy} r={r} fill="none" strokeWidth={thickness} className="stroke-slate-100 dark:stroke-navy-800" />
          {arcs.map((arc, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" strokeWidth={thickness}
              stroke={arc.color}
              strokeDasharray={`${arc.dash} ${circ}`}
              strokeDashoffset={arc.offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-black text-slate-700 dark:text-white">{total.toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400">
            <span style={{ background: seg.color }} className="w-2 h-2 rounded-full inline-block flex-shrink-0" />
            {seg.label}: <strong className="ml-0.5 text-slate-700 dark:text-slate-300">{seg.value}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 3. Line Chart ─────────────────────────────────────────────
export function LineChart({ data = [], valueKey = 'value', labelKey = 'date', height = 80, color = '#3b82f6' }) {
  const values = data.map(d => Number(d[valueKey] ?? 0))
  const max    = Math.max(1, ...values)
  const min    = 0
  const w      = 300, h = height

  if (data.length < 2) return <Empty />

  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - ((v - min) / (max - min)) * (h - 12)
    return `${x},${y}`
  })
  const polyline = pts.join(' ')
  // Fill path
  const fill = `M 0,${h} L ${pts.join(' L ')} L ${w},${h} Z`

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h + 4}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id="lgFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.03" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#lgFill)" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const [x, y] = pts[i].split(',').map(Number)
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="3" fill={color} />
              <title>{data[i][labelKey]}: {v}</title>
            </g>
          )
        })}
      </svg>
      {/* X labels */}
      {data.length <= 12 && (
        <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-0.5">
          {data.map((d, i) => (
            <span key={i} className="truncate">{String(d[labelKey]).slice(5)}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 4. Horizontal mini-bar list ───────────────────────────────
export function MiniBarList({ items = [], valueKey = 'value', labelKey = 'label', color = 'bg-gradient-to-r from-blue-500 to-indigo-500', suffix = '' }) {
  const max = Math.max(1, ...items.map(x => Number(x[valueKey] ?? 0)))
  if (!items.length) return <Empty />
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => {
        const val = Number(item[valueKey] ?? 0)
        const pct = Math.round((val / max) * 100)
        return (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[160px]">{item[labelKey]}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200 flex-shrink-0 ml-2">{val.toLocaleString('en-IN')}{suffix}</span>
            </div>
            <div className="h-1.5 bg-slate-100 dark:bg-navy-800 rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 5. Stat pill ──────────────────────────────────────────────
export function StatPill({ label, value, color = 'bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-300' }) {
  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-xl ${color}`}>
      <span className="text-lg font-black leading-none">{value}</span>
      <span className="text-[10px] mt-0.5 opacity-80 uppercase tracking-wide font-bold">{label}</span>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────
function Empty({ size }) {
  return (
    <div className="flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 py-4 w-full" style={size ? {width:size,height:size} : {}}>
      No data
    </div>
  )
}
