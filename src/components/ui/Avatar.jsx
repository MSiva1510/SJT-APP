const COLORS = [
  'from-blue-500 to-indigo-600',
  'from-teal-500 to-cyan-600',
  'from-violet-500 to-purple-600',
  'from-rose-500 to-pink-600',
  'from-amber-500 to-orange-600',
  'from-emerald-500 to-green-600',
]

export default function Avatar({ name = '', size = 36 }) {
  const safeName = String(name ?? '')
  const initials = safeName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color    = COLORS[(safeName.charCodeAt(0) || 0) % COLORS.length]
  const px = Math.round(size * 0.34)
  return (
    <div
      className={`bg-gradient-to-br ${color} rounded-full flex items-center justify-center flex-shrink-0 select-none`}
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-white leading-none" style={{ fontSize: px }}>
        {initials}
      </span>
    </div>
  )
}
