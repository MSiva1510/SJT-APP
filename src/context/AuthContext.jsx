// ─── Auth Context ─────────────────────────────────────────────
// Single source of truth: Supabase auth.users + public.profiles
// Day 31: integrated with PermissionEngine + SessionManager

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { autoCheckIn, autoCheckOut } from '../data/attendanceData'
import { authRepository }            from '../repositories/authRepository'
import { permissionEngine, bootPermissions } from '../security/PermissionEngine'
import { sessionManager }            from '../security/SessionManager'
import { addAuditEvent }             from '../data/auditLogData'
import { withTimeout }               from '../utils/withTimeout'
import { backgroundServiceManager }  from '../services/BackgroundServiceManager'

const AUTH_TIMEOUT_MS = 10_000

// ── Legacy module permission matrix (backward compat) ─────────
export const ROLE_PERMISSIONS = {
  admin: {
    trips:true, vehicles:true, customers:true, expenses:true, invoices:true,
    reports:true, settings:true, drivers:true, attendance:true, userManagement:true,
    revenueDashboard:true, profitReports:true, financialAnalytics:true,
    expenseReports:true, invoiceManagement:true,
  },
  manager: {
    trips:true, vehicles:true, customers:true, expenses:true, invoices:false,
    reports:false, settings:false, drivers:true, attendance:true, userManagement:false,
    revenueDashboard:false, profitReports:false, financialAnalytics:false,
    expenseReports:false, invoiceManagement:false,
  },
  driver: {
    trips:false, vehicles:false, customers:false, expenses:false,
    invoices:false, reports:false, settings:false, drivers:false,
    attendance:false, userManagement:false,
    revenueDashboard:false, profitReports:false, financialAnalytics:false,
    expenseReports:false, invoiceManagement:false,
    viewOwnPayslips:true, viewOwnEarnings:true,
    viewPayrollDashboard:false, viewExpenseAnalytics:false,
  },
}

export const ROLE_ROUTES = {
  admin:   ['/', '/invoices', '/customers', '/expenses', '/drivers', '/vehicles',
             '/settings', '/trips', '/create-trip', '/attendance', '/profile',
             '/payroll', '/reports', '/admin/database-status', '/admin/users'],
  manager: ['/', '/customers', '/expenses', '/drivers', '/vehicles', '/trips',
             '/create-trip', '/attendance', '/profile', '/payroll'],
  driver:  ['/driver', '/assigned-trips', '/ride-history', '/driver-profile',
             '/live-location', '/payslips'],
}

export const ROLE_LABELS = { admin:'Administrator', manager:'Manager', driver:'Driver' }

export const ROLE_COLORS = {
  admin:   { bg:'bg-violet-100 dark:bg-violet-900/40', text:'text-violet-700 dark:text-violet-300', dot:'bg-violet-500' },
  manager: { bg:'bg-blue-100 dark:bg-blue-900/40',     text:'text-blue-700 dark:text-blue-300',     dot:'bg-blue-500'   },
  driver:  { bg:'bg-teal-100 dark:bg-teal-900/40',     text:'text-teal-700 dark:text-teal-300',     dot:'bg-teal-500'   },
}

function profileToUser(authUser, profile) {
  if (!profile) return null
  return {
    id:         profile.id,
    email:      profile.email || authUser?.email || '',
    name:       profile.full_name,
    role:       profile.role,
    phone:      profile.phone  || '',
    avatar_url: profile.avatar_url || null,
    status:     profile.status || 'active',
    lastLogin:  new Date().toISOString(),
  }
}

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [initialized, setInitialized] = useState(false)
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [loginError,  setLoginError]  = useState('')

  // Boot permission engine on mount
  useEffect(() => { bootPermissions() }, [])

  // Set session timeout handler
  useEffect(() => {
    sessionManager.onTimeout(() => {
      logout()
      window.location.href = '/login?reason=timeout'
    })
  }, [])

  const loadProfileUser = useCallback(async (authUser) => {
    if (!authUser?.id) return { user: null, profile: null, timedOut: false }
    const profile = await withTimeout(
      authRepository.getProfile(authUser.id),
      AUTH_TIMEOUT_MS,
      '__timeout__'
    )
    if (profile === '__timeout__') {
      return { user: null, profile: null, timedOut: true }
    }
    return { user: profileToUser(authUser, profile), profile, timedOut: false }
  }, [])

  const applySession = useCallback(async (session, { startSession = false } = {}) => {
    if (!session?.user) {
      setUser(null)
      return null
    }

    const { user: sessionUser, profile, timedOut } = await loadProfileUser(session.user)
    if (timedOut) {
      setUser(null)
      setLoginError('Login is taking too long. Check your connection and try again.')
      return null
    }
    if (!profile) {
      setUser(null)
      setLoginError('User profile not found. Please contact Administrator.')
      return null
    }
    if (profile.status !== 'active') {
      await authRepository.signOut()
      setUser(null)
      setLoginError('Your account has been deactivated. Contact Administrator.')
      return null
    }

    setUser(sessionUser)
    if (startSession) sessionManager.start(sessionUser)
    return sessionUser
  }, [loadProfileUser])

  useEffect(() => {
    let mounted = true

    const restoreInitialSession = async () => {
      try {
        const session = await withTimeout(authRepository.getSession(), AUTH_TIMEOUT_MS, null)
        if (!mounted) return
        await applySession(session, { startSession: Boolean(session?.user) })
      } finally {
        if (mounted) setInitialized(true)
      }
    }

    const unsubscribe = authRepository.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return

      setTimeout(() => {
        if (!mounted) return
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setInitialized(true)
          return
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          applySession(session, { startSession: event === 'SIGNED_IN' })
            .finally(() => { if (mounted) setInitialized(true) })
        }
      }, 0)
    })

    restoreInitialSession()
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [applySession])

  const login = useCallback(async ({ email, password }) => {
    setAuthLoading(true)
    setLoginError('')
    try {
      const { user: authUser } = await authRepository.signIn({ email, password })
      const profile = await withTimeout(
        authRepository.getProfile(authUser.id),
        AUTH_TIMEOUT_MS,
        '__timeout__'
      )
      if (profile === '__timeout__') {
        setLoginError('Login is taking too long. Check your connection and try again.')
        setAuthLoading(false)
        return false
      }
      if (!profile) {
        await authRepository.signOut()
        setLoginError('User profile not found. Please contact Administrator.')
        setAuthLoading(false)
        return false
      }
      if (profile.status !== 'active') {
        await authRepository.signOut()
        setLoginError('Your account has been deactivated. Contact Administrator.')
        setAuthLoading(false)
        return false
      }
      if (profile.role === 'driver') {
        autoCheckIn(profile.full_name, '').catch(() => {})
      }
      const sessionUser = profileToUser(authUser, profile)
      setUser(sessionUser)
      // Start session tracking
      sessionManager.start(sessionUser)
      // Start background services
      backgroundServiceManager.startAll()
      // Audit log
      addAuditEvent('USER_LOGIN', {
        description: `${profile.full_name} (${profile.role}) logged in`,
        module: 'security', severity: 'info',
      })
      setAuthLoading(false)
      return sessionUser
    } catch (err) {
      const msg = err.message?.includes('Invalid login credentials')
        ? 'Invalid email or password.'
        : err.message?.includes('Email not confirmed')
        ? 'Email not confirmed. Check your inbox or contact Administrator.'
        : 'Login failed. Please try again.'
      setLoginError(msg)
      setAuthLoading(false)
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    if (user?.role === 'driver') {
      autoCheckOut(user.name).catch(() => {})
    }
    addAuditEvent('USER_LOGOUT', {
      description: `${user?.name || 'Unknown'} logged out`,
      module: 'security', severity: 'info',
    })
    // Stop background services
    backgroundServiceManager.stopAll()
    sessionManager.end('logout')
    try { await authRepository.signOut() } catch {}
    setUser(null)
  }, [user])

  const sendPasswordReset = useCallback(async (email) => {
    await authRepository.sendPasswordReset(email)
  }, [])

  // Persist profile edits (full_name, phone ...) to public.profiles and
  // keep the cached session user in sync with the database row.
  const updateProfile = useCallback(async (updates) => {
    if (!user?.id) throw new Error('Not signed in')
    const profile = await authRepository.updateProfile(user.id, updates)
    setUser(prev => prev ? {
      ...prev,
      name:       profile.full_name,
      phone:      profile.phone || '',
      avatar_url: profile.avatar_url || null,
    } : prev)
    return profile
  }, [user])

  const changePassword = useCallback(async (newPassword) => {
    await authRepository.updatePassword(newPassword)
  }, [])

  // Granular permission check via PermissionEngine.
  // Named permissions ('create_booking', 'view_finance' ...) are checked directly.
  // Legacy module names ('trips', 'vehicles' ...) are routed through the
  // MODULE_PERMISSION_MAP inside the engine so the two systems never conflict.
  const can = useCallback((permission) => {
    if (!user) return false
    // Named granular permission (e.g. PERMISSIONS.CREATE_BOOKING)
    const granular = permissionEngine.can(user.role, permission)
    if (granular) return true
    // Legacy module name (e.g. 'trips', 'vehicles') — route through the engine
    // so we use a single source of truth and don't re-grant denied permissions
    return permissionEngine.canModule(user.role, permission)
  }, [user])

  // Check granular named permission
  const canDo = useCallback((namedPermission) => {
    if (!user) return false
    return permissionEngine.can(user.role, namedPermission)
  }, [user])

  const isAdmin   = user?.role === 'admin'
  const isManager = user?.role === 'manager'
  const isDriver  = user?.role === 'driver'

  return (
    <AuthContext.Provider value={{
      user, initialized, authLoading, loginError, setLoginError,
      login, logout, sendPasswordReset, updateProfile, changePassword,
      can, canDo,
      isAdmin, isManager, isDriver,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

// ── Role permission matrix ─────────────────────────────────────