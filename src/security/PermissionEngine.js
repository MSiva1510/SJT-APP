// ─── Permission Engine ────────────────────────────────────────
// Granular, role-based permission system.
// Architecture: role → permission matrix → runtime checks.
// UI guards + future backend policy alignment.

import supabase from '../lib/supabase'

// ── All defined permissions ───────────────────────────────────
export const PERMISSIONS = {
  // Dashboard
  VIEW_DASHBOARD:           'view_dashboard',
  // Bookings
  CREATE_BOOKING:           'create_booking',
  EDIT_BOOKING:             'edit_booking',
  DELETE_BOOKING:           'delete_booking',
  APPROVE_BOOKING:          'approve_booking',
  // Trips
  ASSIGN_DRIVER:            'assign_driver',
  START_TRIP:               'start_trip',
  COMPLETE_TRIP:            'complete_trip',
  // Expenses
  CREATE_EXPENSE:           'create_expense',
  APPROVE_EXPENSE:          'approve_expense',
  REJECT_EXPENSE:           'reject_expense',
  // Finance
  GENERATE_INVOICE:         'generate_invoice',
  VIEW_FINANCE:             'view_finance',
  MANAGE_PAYROLL:           'manage_payroll',
  EXPORT_REPORTS:           'export_reports',
  VIEW_REPORTS:             'view_reports',
  // Entities
  MANAGE_DRIVERS:           'manage_drivers',
  MANAGE_VEHICLES:          'manage_vehicles',
  MANAGE_CUSTOMERS:         'manage_customers',
  MANAGE_DOCUMENTS:         'manage_documents',
  // Admin
  MANAGE_USERS:             'manage_users',
  MANAGE_ROLES:             'manage_roles',
  SYSTEM_SETTINGS:          'system_settings',
  NOTIFICATION_MANAGEMENT:  'notification_management',
  MANAGE_COMMUNICATIONS:    'manage_communications',
  VIEW_AUDIT_LOG:           'view_audit_log',
  BACKUP_RESTORE:           'backup_restore',
  VIEW_HEALTH:              'view_health',
}

// ── Default permission matrix ─────────────────────────────────
const DEFAULT_MATRIX = {
  admin: Object.values(PERMISSIONS).reduce((acc, p) => ({ ...acc, [p]: true }), {}),
  manager: {
    [PERMISSIONS.VIEW_DASHBOARD]:          true,
    [PERMISSIONS.CREATE_BOOKING]:          true,
    [PERMISSIONS.EDIT_BOOKING]:            true,
    [PERMISSIONS.DELETE_BOOKING]:          false,
    [PERMISSIONS.APPROVE_BOOKING]:         true,
    [PERMISSIONS.ASSIGN_DRIVER]:           true,
    [PERMISSIONS.START_TRIP]:              true,
    [PERMISSIONS.COMPLETE_TRIP]:           true,
    [PERMISSIONS.CREATE_EXPENSE]:          true,
    [PERMISSIONS.APPROVE_EXPENSE]:         true,
    [PERMISSIONS.REJECT_EXPENSE]:          true,
    [PERMISSIONS.GENERATE_INVOICE]:        false,
    [PERMISSIONS.VIEW_FINANCE]:            false,
    [PERMISSIONS.MANAGE_PAYROLL]:          true,
    [PERMISSIONS.EXPORT_REPORTS]:          false,
    [PERMISSIONS.VIEW_REPORTS]:            false,
    [PERMISSIONS.MANAGE_DRIVERS]:          true,
    [PERMISSIONS.MANAGE_VEHICLES]:         true,
    [PERMISSIONS.MANAGE_CUSTOMERS]:        true,
    [PERMISSIONS.MANAGE_DOCUMENTS]:        true,
    [PERMISSIONS.MANAGE_USERS]:            false,
    [PERMISSIONS.MANAGE_ROLES]:            false,
    [PERMISSIONS.SYSTEM_SETTINGS]:         false,
    [PERMISSIONS.NOTIFICATION_MANAGEMENT]: true,
    [PERMISSIONS.MANAGE_COMMUNICATIONS]:   true,
    [PERMISSIONS.VIEW_AUDIT_LOG]:          false,
    [PERMISSIONS.BACKUP_RESTORE]:          false,
    [PERMISSIONS.VIEW_HEALTH]:             false,
  },
  driver: Object.values(PERMISSIONS).reduce((acc, p) => ({ ...acc, [p]: false }), {}),
  // Future roles
  accountant: {
    [PERMISSIONS.VIEW_DASHBOARD]:   true,
    [PERMISSIONS.VIEW_FINANCE]:     true,
    [PERMISSIONS.GENERATE_INVOICE]: true,
    [PERMISSIONS.MANAGE_PAYROLL]:   true,
    [PERMISSIONS.VIEW_REPORTS]:     true,
    [PERMISSIONS.EXPORT_REPORTS]:   true,
  },
  hr: {
    [PERMISSIONS.VIEW_DASHBOARD]: true,
    [PERMISSIONS.MANAGE_DRIVERS]: true,
    [PERMISSIONS.MANAGE_PAYROLL]: true,
    [PERMISSIONS.VIEW_REPORTS]:   true,
  },
  dispatcher: {
    [PERMISSIONS.VIEW_DASHBOARD]:  true,
    [PERMISSIONS.CREATE_BOOKING]:  true,
    [PERMISSIONS.EDIT_BOOKING]:    true,
    [PERMISSIONS.ASSIGN_DRIVER]:   true,
    [PERMISSIONS.MANAGE_VEHICLES]: true,
  },
  readonly: {
    [PERMISSIONS.VIEW_DASHBOARD]: true,
    [PERMISSIONS.VIEW_REPORTS]:   true,
  },
}

// ── Module-to-permission mapping (for legacy can() checks) ────
const MODULE_PERMISSION_MAP = {
  trips:         PERMISSIONS.CREATE_BOOKING,
  vehicles:      PERMISSIONS.MANAGE_VEHICLES,
  customers:     PERMISSIONS.MANAGE_CUSTOMERS,
  expenses:      PERMISSIONS.CREATE_EXPENSE,
  invoices:      PERMISSIONS.GENERATE_INVOICE,
  reports:       PERMISSIONS.VIEW_REPORTS,
  settings:      PERMISSIONS.SYSTEM_SETTINGS,
  drivers:       PERMISSIONS.MANAGE_DRIVERS,
  attendance:    PERMISSIONS.VIEW_DASHBOARD,
  userManagement:PERMISSIONS.MANAGE_USERS,
  revenueDashboard:   PERMISSIONS.VIEW_FINANCE,
  profitReports:      PERMISSIONS.VIEW_REPORTS,
  financialAnalytics: PERMISSIONS.VIEW_FINANCE,
  expenseReports:     PERMISSIONS.VIEW_REPORTS,
  invoiceManagement:  PERMISSIONS.GENERATE_INVOICE,
}

class PermissionEngineImpl {
  constructor() {
    this._matrix    = { ...DEFAULT_MATRIX }
    this._overrides = {}   // userId → { permission → bool }
    this._loaded    = false
  }

  /** Load custom role permissions from Supabase (overlays defaults). */
  async loadFromDB() {
    if (!supabase) return
    try {
      const { data } = await supabase.from('role_permissions').select('role,permission,is_allowed')
      if (data && data.length > 0) {
        data.forEach(row => {
          if (!this._matrix[row.role]) this._matrix[row.role] = {}
          this._matrix[row.role][row.permission] = row.is_allowed
        })
      }
      this._loaded = true
    } catch {}
  }

  /** Save a permission change to DB. */
  async setPermission(role, permission, allowed) {
    if (this._matrix[role]) this._matrix[role][permission] = allowed
    if (supabase) {
      try {
        await supabase.from('role_permissions')
          .upsert({ role, permission, is_allowed: allowed, updated_at: new Date().toISOString() },
                  { onConflict: 'role,permission' })
      } catch {}
    }
  }

  /** Check if a role has a named permission. */
  can(role, permission) {
    if (!role) return false
    const matrix = this._matrix[role]
    if (!matrix) return false
    return !!matrix[permission]
  }

  /** Check legacy module-based permission (backward compat). */
  canModule(role, module) {
    const perm = MODULE_PERMISSION_MAP[module]
    if (!perm) return role === 'admin'
    return this.can(role, perm)
  }

  /** Get full permission set for a role. */
  getRolePermissions(role) {
    return { ...(DEFAULT_MATRIX[role] || {}), ...(this._matrix[role] || {}) }
  }

  /** Get all roles. */
  getRoles() {
    return Object.keys(this._matrix)
  }

  /** Get all permissions. */
  getAllPermissions() {
    return Object.values(PERMISSIONS)
  }

  getMatrix() { return this._matrix }
}

export const permissionEngine = new PermissionEngineImpl()

/** Boot: load from DB on app start. */
export async function bootPermissions() {
  await permissionEngine.loadFromDB()
}

/** Convenience: check current user permission. */
export function checkPermission(role, permission) {
  return permissionEngine.can(role, permission)
}
