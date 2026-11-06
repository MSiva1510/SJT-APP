// ─── Communication Repository ────────────────────────────────
// Data access layer for communication_logs, notification_preferences,
// communication_queue, and communication_providers.

import supabase from '../lib/supabase'

const LS_LOGS   = 'sjt_comm_logs'
const LS_PREFS  = 'sjt_notif_prefs'
const LS_QUEUE  = 'sjt_comm_queue'

const rLS = key => { try { return JSON.parse(localStorage.getItem(key)||'[]') } catch { return [] } }
const wLS = (key, d) => { try { localStorage.setItem(key, JSON.stringify(d)) } catch {} }

// ── Communication Logs ────────────────────────────────────────
export const communicationLogRepository = {
  async getAll({ channel, category, status, recipientId, limit = 50, offset = 0 } = {}) {
    if (supabase) {
      try {
        let q = supabase.from('communication_logs').select('*', { count: 'exact' })
        if (channel)     q = q.eq('channel', channel)
        if (category)    q = q.eq('category', category)
        if (status)      q = q.eq('status', status)
        if (recipientId) q = q.eq('recipient_id', recipientId)
        q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        const { data, count, error } = await q
        if (!error) return { data: data || [], count: count || 0 }
      } catch {}
    }
    let all = rLS(LS_LOGS)
    if (channel)     all = all.filter(l => l.channel === channel)
    if (category)    all = all.filter(l => l.category === category)
    if (status)      all = all.filter(l => l.status === status)
    if (recipientId) all = all.filter(l => l.recipient_id === recipientId)
    return { data: all.slice(offset, offset + limit), count: all.length }
  },

  async create(log) {
    if (supabase) {
      try {
        const { data, error } = await supabase.from('communication_logs').insert(log).select().single()
        if (!error && data) return data
      } catch {}
    }
    const entry = { ...log, id: `log-${Date.now()}`, created_at: new Date().toISOString() }
    const logs = rLS(LS_LOGS)
    wLS(LS_LOGS, [entry, ...logs].slice(0, 500))
    return entry
  },

  async update(id, updates) {
    if (supabase && !String(id).startsWith('log-')) {
      try {
        const { data } = await supabase.from('communication_logs').update(updates).eq('id', id).select().single()
        if (data) return data
      } catch {}
    }
    const logs = rLS(LS_LOGS).map(l => l.id === id ? { ...l, ...updates } : l)
    wLS(LS_LOGS, logs)
    return logs.find(l => l.id === id)
  },

  async getStats() {
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_analytics').select('*')
        if (data) return data
      } catch {}
    }
    const all = rLS(LS_LOGS)
    const channels = ['in_app','whatsapp','sms','push','webhook']
    return channels.map(ch => ({
      channel:   ch,
      total:     all.filter(l => l.channel === ch).length,
      delivered: all.filter(l => l.channel === ch && l.status === 'delivered').length,
      failed:    all.filter(l => l.channel === ch && l.status === 'failed').length,
      pending:   all.filter(l => l.channel === ch && l.status === 'pending').length,
    })).filter(s => s.total > 0)
  },
}

// ── Notification Preferences ──────────────────────────────────
export const notificationPreferenceRepository = {
  async get(userId) {
    if (supabase && userId) {
      try {
        const { data } = await supabase.from('notification_preferences').select('*').eq('user_id', userId).single()
        if (data) return data
      } catch {}
    }
    const all = rLS(LS_PREFS)
    return all.find(p => p.user_id === userId) || _defaultPrefs(userId)
  },

  async upsert(userId, prefs) {
    const payload = { user_id: userId, ...prefs, updated_at: new Date().toISOString() }
    if (supabase && userId) {
      try {
        const { data } = await supabase.from('notification_preferences')
          .upsert(payload, { onConflict: 'user_id' }).select().single()
        if (data) return data
      } catch {}
    }
    const all = rLS(LS_PREFS)
    const idx = all.findIndex(p => p.user_id === userId)
    if (idx >= 0) all[idx] = { ...all[idx], ...payload }
    else all.unshift(payload)
    wLS(LS_PREFS, all)
    return payload
  },
}

// ── Communication Queue ───────────────────────────────────────
export const communicationQueueRepository = {
  async getPending() {
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_queue')
          .select('*').eq('status','pending').order('scheduled_at')
        if (data) return data
      } catch {}
    }
    return rLS(LS_QUEUE).filter(i => i.status === 'pending')
  },

  async updateStatus(id, status, extra = {}) {
    if (supabase && !String(id).startsWith('q-')) {
      try {
        await supabase.from('communication_queue')
          .update({ status, processed_at: new Date().toISOString(), ...extra }).eq('id', id)
      } catch {}
    }
    const q = rLS(LS_QUEUE).map(i => i.id === id ? { ...i, status, ...extra } : i)
    wLS(LS_QUEUE, q)
  },
}

// ── Provider Configuration ────────────────────────────────────
export const providerRepository = {
  async getAll() {
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_providers').select('*')
        if (data) return data
      } catch {}
    }
    return []
  },

  async getByChannel(channel) {
    const all = await this.getAll()
    return all.filter(p => p.channel === channel)
  },

  async getActive() {
    const all = await this.getAll()
    return all.filter(p => p.is_active)
  },
}

// ── Helpers ───────────────────────────────────────────────────
function _defaultPrefs(userId) {
  return {
    user_id: userId,
    in_app_enabled: true, whatsapp_enabled: false, sms_enabled: false,
    push_enabled: false, email_enabled: false,
    booking_notifications: true, trip_notifications: true,
    expense_notifications: true, payroll_notifications: true,
    vehicle_notifications: true, attendance_notifications: true,
    document_notifications: true, system_notifications: true,
    quiet_hours_enabled: false, quiet_hours_start: '22:00', quiet_hours_end: '07:00',
  }
}
