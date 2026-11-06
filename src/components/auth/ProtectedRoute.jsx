import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// ── Full-screen loading spinner shown while session is being restored ──
function AuthSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-navy-950 gap-4">
      <div className="w-12 h-12 rounded-2xl overflow-hidden border border-white/20 shadow-lg">
        <img
          src="https://travelsjayam.in/wp-content/uploads/2025/05/Untitled-design-1.png"
          alt="SJT"
          className="w-full h-full object-contain p-1"
          onError={e => { e.target.style.display = 'none' }}
        />
      </div>
      <div className="flex flex-col items-center gap-2">
        <div className="flex gap-1.5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-navy-600 dark:bg-blue-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
          Restoring session…
        </p>
      </div>
    </div>
  )
}

/**
 * ProtectedRoute
 *
 * 1. If auth hasn't been initialized yet (session restore in progress) → show spinner
 * 2. If no user → redirect to /login
 * 3. If user role not in allowedRoles → redirect to /unauthorized
 * 4. Otherwise → render children
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, initialized } = useAuth()
  const location = useLocation()

  if (!initialized) return <AuthSpinner />

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
