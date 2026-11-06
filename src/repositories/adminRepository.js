// ─── Admin Repository ─────────────────────────────────────────
import supabase from '../lib/supabase'

const LS = {
  ROLES:    'sjt_role_perms',
  SESSIONS: 'sjt_session_history',
  ERRORS:   'sjt_error_log',
  SETTINGS: 'sjt_system_settings',
  BACKUPS:  'sjt_backup_history',
}
const rLS = (k,d=[]) => { try { return JSON.parse(localStorage.getItem(k)||JSON.stringify(d)) } catch { return d } }
const wLS = (k,v)    => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

export const DEFAULT_BACKUP_CONFIGS = [
  { id:'bc-1', name:'Manual Backup',  provider:'manual',   is_active:true,  retention_days:30, last_backup_status:'never' },
  { id:'bc-2', name:'Supabase Auto',  provider:'supabase', is_active:false, retention_days:7,  last_backup_status:'never' },
  { id:'bc-3', name:'Google Drive',   provider:'gdrive',   is_active:false, retention_days:90, last_backup_status:'never' },
  { id:'bc-4', name:'OneDrive',       provider:'onedrive', is_active:false, retention_days:90, last_backup_status:'never' },
]

// ── Role Permissions ──────────────────────────────────────────
export const rolePermissionRepository = {
  async getAll() {
    if (supabase) {
      try {
        const { data } = await supabase.from('role_permissions').select('*')
        if (data) return data
      } catch {}
    }
    return rLS(LS.ROLES)
  },
  async upsert(role, permission, isAllowed) {
    const entry = { role, permission, is_allowed: isAllowed, updated_at: new Date().toISOString() }
    if (supabase) {
      try {
        const { data } = await supabase.from('role_permissions')
          .upsert(entry, { onConflict: 'role,permission' }).select().single()
        if (data) return data
      } catch {}
    }
    const local = rLS(LS.ROLES)
    const idx = local.findIndex(r => r.role === role && r.permission === permission)
    if (idx >= 0) local[idx] = { ...local[idx], ...entry }
    else local.push(entry)
    wLS(LS.ROLES, local)
    return entry
  },
  async getForRole(role) {
    const all = await this.getAll()
    return all.filter(r => r.role === role)
  },
}

// ── Session Log ───────────────────────────────────────────────
export const sessionLogRepository = {
  async getAll({ userId, limit = 50, offset = 0 } = {}) {
    if (supabase) {
      try {
        let q = supabase.from('session_log').select('*', { count: 'exact' })
        if (userId) q = q.eq('user_id', userId)
        q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        const { data, count } = await q
        if (data) return { data, count: count || 0 }
      } catch {}
    }
    const local = rLS(LS.SESSIONS)
    const filtered = userId ? local.filter(s => s.userId === userId) : local
    return { data: filtered.slice(offset, offset + limit), count: filtered.length }
  },
}

// ── Error Log ─────────────────────────────────────────────────
export const errorLogRepository = {
  async getAll({ severity, module, resolved, limit = 50, offset = 0 } = {}) {
    if (supabase) {
      try {
        let q = supabase.from('error_log').select('*', { count: 'exact' })
        if (severity != null) q = q.eq('severity', severity)
        if (module)           q = q.eq('module', module)
        if (resolved != null) q = q.eq('resolved', resolved)
        q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        const { data, count } = await q
        if (data) return { data, count: count || 0 }
      } catch {}
    }
    let local = rLS(LS.ERRORS)
    if (severity != null) local = local.filter(e => e.severity === severity)
    if (module)           local = local.filter(e => e.module   === module)
    if (resolved != null) local = local.filter(e => e.resolved === resolved)
    return { data: local.slice(offset, offset + limit), count: local.length }
  },
  async resolve(id, resolvedBy) {
    if (supabase && !String(id).startsWith('err-')) {
      try {
        await supabase.from('error_log').update({
          resolved:true, resolved_by:resolvedBy, resolved_at:new Date().toISOString()
        }).eq('id', id)
      } catch {}
    }
    const local = rLS(LS.ERRORS).map(e => e.id===id ? {...e,resolved:true} : e)
    wLS(LS.ERRORS, local)
  },
}

// ── System Settings ───────────────────────────────────────────
export const systemSettingsRepository = {
  async getAll() {
    if (supabase) {
      try {
        const { data } = await supabase.from('settings').select('*')
        if (data) return data
      } catch {}
    }
    return rLS(LS.SETTINGS)
  },
  async get(key) {
    if (supabase) {
      try {
        const { data } = await supabase.from('settings').select('*').eq('setting_key', key).single()
        if (data) return data.setting_value
      } catch {}
    }
    const local = rLS(LS.SETTINGS)
    return local.find(s => s.setting_key === key)?.setting_value
  },
  async set(key, value, updatedBy) {
    if (supabase) {
      try {
        await supabase.from('settings').upsert(
          { setting_key:key, setting_value:String(value), updated_by:updatedBy, updated_at:new Date().toISOString() },
          { onConflict:'setting_key' }
        )
      } catch {}
    }
    const local = rLS(LS.SETTINGS)
    const idx = local.findIndex(s => s.setting_key === key)
    const entry = { setting_key:key, setting_value:String(value), updated_by:updatedBy }
    if (idx>=0) local[idx] = {...local[idx], ...entry}
    else local.push(entry)
    wLS(LS.SETTINGS, local)
  },
  async setBulk(pairs, updatedBy) {
    return Promise.all(Object.entries(pairs).map(([k,v]) => this.set(k, v, updatedBy)))
  },
}

// ── Backup Config ─────────────────────────────────────────────
export const backupRepository = {
  async getConfigs() {
    if (supabase) {
      try {
        const { data } = await supabase.from('backup_config').select('*').order('created_at')
        if (data?.length) return data
      } catch {}
    }
    return DEFAULT_BACKUP_CONFIGS
  },
  async getHistory({ limit=20 } = {}) {
    if (supabase) {
      try {
        const { data } = await supabase.from('backup_history').select('*').order('started_at',{ascending:false}).limit(limit)
        if (data) return data
      } catch {}
    }
    return rLS(LS.BACKUPS)
  },
  async createHistoryEntry(entry) {
    const item = { ...entry, id:`bk-${Date.now()}`, started_at:new Date().toISOString() }
    if (supabase) {
      try {
        const { data } = await supabase.from('backup_history').insert(item).select().single()
        if (data) return data
      } catch {}
    }
    const local = rLS(LS.BACKUPS)
    wLS(LS.BACKUPS, [item, ...local].slice(0,100))
    return item
  },
}

// ── Users (admin management) ──────────────────────────────────
export const userAdminRepository = {
  async getAll() {
    if (supabase) {
      try {
        const { data } = await supabase.from('users').select('*').order('created_at',{ascending:false})
        if (data) return data
      } catch {}
    }
    return []
  },
  async update(id, updates) {
    if (supabase) {
      try {
        const { data } = await supabase.from('users').update(updates).eq('id',id).select().single()
        if (data) return data
      } catch {}
    }
    return { id, ...updates }
  },
  async getActivityLog(userId, limit=20) {
    if (supabase) {
      try {
        const { data } = await supabase.from('audit_logs')
          .select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(limit)
        if (data) return data
      } catch {}
    }
    return []
  },
}

// ── Health ────────────────────────────────────────────────────
export const healthRepository = {
  async getSummary() {
    if (supabase) {
      try {
        const { data } = await supabase.from('system_health_summary').select('*').single()
        if (data) return data
      } catch {}
    }
    return { total_bookings:0, active_trips:0, active_drivers:0, total_vehicles:0,
             total_customers:0, audit_events_24h:0, unresolved_errors:0, comm_events_24h:0,
             checked_at:new Date().toISOString() }
  },
  async checkConnection() {
    if (!supabase) return { connected:false, latencyMs:0 }
    try {
      const start = Date.now()
      await supabase.from('settings').select('setting_key').limit(1)
      return { connected:true, latencyMs: Date.now()-start }
    } catch {
      return { connected:false, latencyMs:0 }
    }
  },
}
