// ─── Permission Guard ─────────────────────────────────────────
// HOC + component for granular permission-based rendering.
// Usage:
//   <PermissionGuard permission="delete_booking">
//     <DeleteButton />
//   </PermissionGuard>
//
//   const { guard } = usePermissionGuard()
//   if (!guard('approve_expense')) return null

import { useAuth } from '../../context/AuthContext'
import { permissionEngine } from '../../security/PermissionEngine'

export default function PermissionGuard({ permission, role, fallback = null, children }) {
  const { user } = useAuth()
  const effectiveRole = role || user?.role
  if (!effectiveRole) return fallback

  const allowed = permission
    ? permissionEngine.can(effectiveRole, permission)
    : true

  return allowed ? children : fallback
}

/** Hook version — returns a check function. */
export function usePermissionGuard() {
  const { user } = useAuth()
  const guard = (permission) => {
    if (!user?.role) return false
    return permissionEngine.can(user.role, permission)
  }
  const guardModule = (module) => {
    if (!user?.role) return false
    return permissionEngine.canModule(user.role, module)
  }
  return { guard, guardModule, role: user?.role }
}

/** Wraps a component: only renders when permission is met. */
export function withPermission(Component, permission) {
  return function GuardedComponent(props) {
    return (
      <PermissionGuard permission={permission}>
        <Component {...props} />
      </PermissionGuard>
    )
  }
}
