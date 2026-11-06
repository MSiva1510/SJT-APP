// ─── Admin Service ────────────────────────────────────────────
import { permissionEngine, PERMISSIONS }  from '../security/PermissionEngine'
import { sessionManager }                 from '../security/SessionManager'
import { errorLogger }                    from '../security/ErrorLogger'
import { addAuditEvent }                  from '../data/auditLogData'
import {
  rolePermissionRepository,
  systemSettingsRepository,
  backupRepository,
  userAdminRepository,
  healthRepository,
  sessionLogRepository,
  errorLogRepository,
} from '../repositories/adminRepository'

export { PERMISSIONS }

// ── Permission management ─────────────────────────────────────
export async function loadAllPermissions()         { return rolePermissionRepository.getAll() }
export async function loadRolePermissions(role)    { return rolePermissionRepository.getForRole(role) }
export async function setRolePermission(role, permission, allowed, actor) {
  await permissionEngine.setPermission(role, permission, allowed)
  addAuditEvent('PERMISSION_CHANGED', {
    description: `${role}.${permission} → ${allowed}`,
    module: 'security',
    oldValues: { allowed: !allowed },
    newValues: { allowed },
  })
  return rolePermissionRepository.upsert(role, permission, allowed)
}
export function canDo(role, permission) { return permissionEngine.can(role, permission) }
export function getRoleMatrix()         { return permissionEngine.getMatrix() }
export function getAllPermissions()     { return permissionEngine.getAllPermissions() }

// ── User management ───────────────────────────────────────────
export async function loadUsers()                  { return userAdminRepository.getAll() }
export async function updateUser(id, updates, actor) {
  addAuditEvent('USER_UPDATED', { description:`User ${id} updated by ${actor}`, module:'users' })
  return userAdminRepository.update(id, { ...updates, updated_at:new Date().toISOString() })
}
export async function deactivateUser(id, actor) {
  addAuditEvent('USER_DEACTIVATED', { description:`User ${id} deactivated by ${actor}`, module:'users' })
  return userAdminRepository.update(id, { is_active:false })
}
export async function activateUser(id, actor) {
  addAuditEvent('USER_ACTIVATED', { description:`User ${id} activated by ${actor}`, module:'users' })
  return userAdminRepository.update(id, { is_active:true })
}
export async function getUserActivity(userId)      { return userAdminRepository.getActivityLog(userId) }

// ── System settings ───────────────────────────────────────────
export async function loadSettings()               { return systemSettingsRepository.getAll() }
export async function saveSetting(key, value, actor) {
  addAuditEvent('SETTINGS_UPDATED', {
    description: `${key} = ${value}`,
    module: 'settings',
    oldValues: {}, newValues: { [key]: value },
  })
  return systemSettingsRepository.set(key, value, actor)
}
export async function saveSettings(pairs, actor) {
  addAuditEvent('SETTINGS_UPDATED', {
    description: `Bulk update: ${Object.keys(pairs).join(', ')}`,
    module: 'settings',
    newValues: pairs,
  })
  return systemSettingsRepository.setBulk(pairs, actor)
}
export async function getSettingValue(key)         { return systemSettingsRepository.get(key) }

// ── Session management ────────────────────────────────────────
export async function getSessionHistory(filters)   { return sessionLogRepository.getAll(filters) }
export function getSessionInfo()                   { return sessionManager.getSession() }
export function getSessionHistory2()               { return sessionManager.getHistory() }
export function getIdleSeconds()                   { return sessionManager.getIdleSeconds() }

// ── Backup ────────────────────────────────────────────────────
export async function loadBackupConfigs()          { return backupRepository.getConfigs() }
export async function loadBackupHistory()          { return backupRepository.getHistory() }

export async function runManualBackup(actor) {
  addAuditEvent('BACKUP_STARTED', { description:'Manual backup initiated', module:'backup' })
  const entry = await backupRepository.createHistoryEntry({
    provider: 'manual', status:'running', initiated_by: actor,
  })
  // Architecture only — no actual backup provider connected
  await new Promise(r => setTimeout(r, 1000))
  addAuditEvent('BACKUP_COMPLETED', { description:'Manual backup simulation complete', module:'backup' })
  return { ...entry, status:'success', completed_at:new Date().toISOString() }
}

// ── Health ────────────────────────────────────────────────────
export async function getHealthSummary()           { return healthRepository.getSummary() }
export async function checkDBConnection()          { return healthRepository.checkConnection() }

// ── Error log ─────────────────────────────────────────────────
export async function getErrorLog(filters)         { return errorLogRepository.getAll(filters) }
export async function resolveError(id, actor) {
  addAuditEvent('ERROR_RESOLVED', { description:`Error ${id} resolved by ${actor}`, module:'system' })
  return errorLogRepository.resolve(id, actor)
}
export function getErrorStats()                    { return errorLogger.getStats() }
