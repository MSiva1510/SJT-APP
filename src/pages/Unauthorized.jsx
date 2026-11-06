import { useNavigate } from 'react-router-dom'
import { ShieldOff, ArrowLeft, Home } from 'lucide-react'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../context/AuthContext'

export default function Unauthorized() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const colors = user ? ROLE_COLORS[user.role] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-navy-950 bg-mesh px-5">
      <div className="max-w-md w-full text-center">

        {/* Icon */}
        <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 flex items-center justify-center mx-auto mb-6">
          <ShieldOff size={36} className="text-red-500" />
        </div>

        <h1 className="text-3xl font-display font-black text-slate-800 dark:text-white mb-2">
          Access Denied
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">
          You don't have permission to view this page.
          {user && (
            <> Your current role (<strong className={`${colors?.text}`}>{ROLE_LABELS[user.role]}</strong>) does not include access to this section.</>
          )}
        </p>

        {/* Role badge */}
        {user && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${colors?.bg} ${colors?.text} text-sm font-bold mb-7`}>
            <span className={`w-2 h-2 rounded-full ${colors?.dot}`} />
            Logged in as {user.name} · {ROLE_LABELS[user.role]}
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-navy-700 transition-all"
          >
            <ArrowLeft size={15} />
            Go Back
          </button>
          <button
            onClick={() => navigate(user?.role === 'driver' ? '/my-trips' : '/')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-semibold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg"
          >
            <Home size={15} />
            My Home
          </button>
        </div>
      </div>
    </div>
  )
}
