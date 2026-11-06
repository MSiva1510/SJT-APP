// ─── Admin Context ────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  loadUsers, loadSettings, loadBackupConfigs, loadBackupHistory,
  getHealthSummary, checkDBConnection, getErrorLog, getErrorStats,
  getSessionHistory, getRoleMatrix, loadAllPermissions,
  PERMISSIONS,
} from '../services/adminService'
import { permissionEngine, bootPermissions } from '../security/PermissionEngine'
import { sessionManager } from '../security/SessionManager'
import { DEFAULT_BACKUP_CONFIGS } from '../repositories/adminRepository'

const AdminContext = createContext(null)

export function AdminProvider({ children }) {
  const { user, isAdmin } = useAuth()

  const [users,         setUsers]         = useState([])
  const [settings,      setSettings]      = useState([])
  const [backupConfigs, setBackupConfigs] = useState(DEFAULT_BACKUP_CONFIGS)
  const [backupHistory, setBackupHistory] = useState([])
  const [health,        setHealth]        = useState(null)
  const [dbStatus,      setDbStatus]      = useState(null)
  const [errorLog,      setErrorLog]      = useState([])
  const [errorStats,    setErrorStats]    = useState({})
  const [sessionLog,    setSessionLog]    = useState([])
  const [roleMatrix,    setRoleMatrix]    = useState({})
  const [permissions,   setPermissions]   = useState([])
  const [loading,       setLoading]       = useState(false)

  // ── Boot permissions on mount ────────────────────────────
  useEffect(() => {
    bootPermissions().then(() => setRoleMatrix(getRoleMatrix()))
  }, [])

  // ── Configure session timeout from settings ──────────────
  useEffect(() => {
    const t = settings.find(s => s.setting_key === 'session_timeout_minutes')?.setting_value
    if (t) sessionManager.setTimeoutMinutes(Number(t))
  }, [settings])

  const loadAdminData = useCallback(async () => {
    if (!isAdmin) return
    setLoading(true)
    try {
      const [u, s, bc, bh, h, db, el, sl, perms] = await Promise.allSettled([
        loadUsers(), loadSettings(), loadBackupConfigs(), loadBackupHistory(),
        getHealthSummary(), checkDBConnection(),
        getErrorLog({ limit:50 }), getSessionHistory({ limit:50 }),
        loadAllPermissions(),
      ])
      if (u.status  === 'fulfilled') setUsers(u.value)
      if (s.status  === 'fulfilled') setSettings(s.value)
      if (bc.status === 'fulfilled') setBackupConfigs(bc.value)
      if (bh.status === 'fulfilled') setBackupHistory(bh.value)
      if (h.status  === 'fulfilled') setHealth(h.value)
      if (db.status === 'fulfilled') setDbStatus(db.value)
      if (el.status === 'fulfilled') setErrorLog(el.value?.data || [])
      if (sl.status === 'fulfilled') setSessionLog(sl.value?.data || [])
      if (perms.status==='fulfilled') setPermissions(perms.value)
      setErrorStats(getErrorStats())
      setRoleMatrix(getRoleMatrix())
    } catch {}
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { if (isAdmin && user?.id) loadAdminData() }, [isAdmin, user?.id, loadAdminData])

  const can = useCallback((permission) => {
    if (!user?.role) return false
    return permissionEngine.can(user.role, permission)
  }, [user?.role])

  const value = {
    // Data
    users, settings, backupConfigs, backupHistory,
    health, dbStatus, errorLog, errorStats, sessionLog,
    roleMatrix, permissions, loading,
    // Actions
    reload: loadAdminData,
    can, PERMISSIONS,
    setUsers, setSettings, setBackupConfigs,
    setBackupHistory, setHealth, setErrorLog, setSessionLog,
    setRoleMatrix,
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be inside AdminProvider')
  return ctx
}

export default AdminContext
