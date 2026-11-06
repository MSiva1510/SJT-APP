// ─── Communication Engine ────────────────────────────────────
// The single entry point for ALL outbound communications.
// Architecture:
//   Page → Context → Service → CommunicationEngine
//                                    ↓
//                            EventBus (publish)
//                                    ↓
//                          Provider Adapter(s)
//                            ↓         ↓         ↓
//                        WhatsApp     SMS      Push/Webhook
//                                    ↓
//                           QueueManager
//                                    ↓
//                           CommunicationLog (Supabase)

import supabase           from '../lib/supabase'
import { eventBus, EVENTS, EVENT_CATEGORY, EVENT_PRIORITY } from './EventBus'
import { whatsapp }        from './adapters/WhatsAppAdapter'
import { sms }             from './adapters/SMSAdapter'
import { push }            from './adapters/PushAdapter'
import { webhook }         from './adapters/WebhookAdapter'
import { queueManager }    from './QueueManager'

// ── Channel constants ─────────────────────────────────────────
export const CHANNELS = {
  IN_APP:   'in_app',
  WHATSAPP: 'whatsapp',
  SMS:      'sms',
  PUSH:     'push',
  WEBHOOK:  'webhook',
  EMAIL:    'email',
}

// ── Recipient types ───────────────────────────────────────────
export const RECIPIENT_TYPE = {
  ADMIN:    'admin',
  MANAGER:  'manager',
  DRIVER:   'driver',
  CUSTOMER: 'customer',
  SYSTEM:   'system',
}

// ── CommunicationRequest shape ────────────────────────────────
// {
//   eventType:     string           (from EVENTS)
//   channels:      string[]         (from CHANNELS)
//   recipient:     { id, type, name, contact, pushToken }
//   subject:       string
//   body:          string
//   templateId?:   string
//   templateData?: object
//   priority?:     string
//   scheduledAt?:  ISO string
//   relatedEntity?:{ type, id }
//   metadata?:     object
// }

const LS_LOGS_KEY = 'sjt_comm_logs'
function _readLogs()    { try { return JSON.parse(localStorage.getItem(LS_LOGS_KEY)||'[]') } catch { return [] } }
function _appendLog(entry) {
  try {
    const logs = _readLogs()
    logs.unshift(entry)
    localStorage.setItem(LS_LOGS_KEY, JSON.stringify(logs.slice(0, 500)))
  } catch {}
}

class CommunicationEngineImpl {
  constructor() {
    this._preferences = {}    // userId → preferences object
    this._initialized = false
    this._stats = { sent:0, failed:0, queued:0 }
  }

  // ── Initialise: wire EventBus → Engine ─────────────────────
  init() {
    if (this._initialized) return
    this._initialized = true

    // Subscribe to all ERP events and route to channels
    eventBus.on('*', async (event) => {
      // Wild-card subscription handled separately in _handleEvent
    })

    // Explicit event subscriptions for automation
    Object.values(EVENTS).forEach(eventType => {
      eventBus.on(eventType, (event) => this._handleEvent(event))
    })

    // Wire QueueManager handlers
    queueManager.registerHandler(CHANNELS.WHATSAPP, async (payload) => {
      return whatsapp.send(payload.to, payload.message)
    })
    queueManager.registerHandler(CHANNELS.SMS, async (payload) => {
      return sms.send(payload.to, payload.message)
    })
    queueManager.registerHandler(CHANNELS.PUSH, async (payload) => {
      return push.send(payload.token, payload)
    })
    queueManager.registerHandler(CHANNELS.WEBHOOK, async (payload) => {
      return webhook.dispatch(payload.eventType, payload.data)
    })
  }

  // ── Core: send through all requested channels ───────────────
  async send(request) {
    const {
      eventType, channels = [CHANNELS.IN_APP], recipient,
      subject, body, templateId, templateData,
      priority, scheduledAt, relatedEntity, metadata = {},
    } = request

    const results = []

    for (const channel of channels) {
      // Check user preferences before sending
      if (!this._isChannelAllowed(channel, recipient, eventType)) {
        results.push({ channel, status:'blocked_by_preference' })
        continue
      }

      const logEntry = await this._createLog({
        channel, recipient, eventType, subject, body,
        priority: priority || EVENT_PRIORITY[eventType] || 'medium',
        scheduledAt, relatedEntity, metadata,
        status: scheduledAt ? 'pending' : 'processing',
      })

      try {
        let result

        if (scheduledAt) {
          // Queue for later
          const queueId = await queueManager.enqueue({
            channel,
            payload: this._buildPayload(channel, recipient, subject, body),
            priority: priority || 'medium',
            scheduledAt,
            logId: logEntry?.id,
          })
          result = { channel, status:'queued', queueId }
          this._stats.queued++
        } else {
          result = await this._dispatch(channel, recipient, subject, body, eventType)
          await this._updateLog(logEntry?.id, { status:'delivered', sent_at: new Date().toISOString() })
          this._stats.sent++
        }

        results.push(result)
      } catch (err) {
        const failReason = err?.message || 'Unknown error'
        await this._updateLog(logEntry?.id, { status:'failed', failure_reason: failReason })
        results.push({ channel, status:'failed', error: failReason })
        this._stats.failed++
      }
    }

    return results
  }

  // ── Dispatch to the right adapter ──────────────────────────
  async _dispatch(channel, recipient, subject, body, eventType) {
    switch (channel) {
      case CHANNELS.WHATSAPP:
        if (recipient.contact) {
          return whatsapp.send(recipient.contact, body)
        }
        return { channel, status:'skipped', reason:'no_contact' }

      case CHANNELS.SMS:
        if (recipient.contact) {
          return sms.send(recipient.contact, body)
        }
        return { channel, status:'skipped', reason:'no_contact' }

      case CHANNELS.PUSH:
        if (recipient.pushToken) {
          return push.send(recipient.pushToken, { title: subject, body, type: eventType })
        }
        return { channel, status:'skipped', reason:'no_push_token' }

      case CHANNELS.WEBHOOK:
        return webhook.dispatch(eventType, { recipient, subject, body })

      case CHANNELS.IN_APP:
        // In-app notifications handled by notificationService (Supabase)
        return { channel, status:'handled_by_notification_service' }

      default:
        return { channel, status:'unknown_channel' }
    }
  }

  // ── Build channel-specific payloads ─────────────────────────
  _buildPayload(channel, recipient, subject, body) {
    switch (channel) {
      case CHANNELS.WHATSAPP: return { to: recipient.contact, message: body }
      case CHANNELS.SMS:      return { to: recipient.contact, message: body }
      case CHANNELS.PUSH:     return { token: recipient.pushToken, title: subject, body }
      default:                return { recipient, subject, body }
    }
  }

  // ── Automation: handle EventBus events ──────────────────────
  async _handleEvent(event) {
    // Only auto-handle scheduled reminders and critical events
    if (event.priority === 'critical') {
      console.info(`[CommEngine] Critical event: ${event.type}`)
    }
  }

  // ── Preference check ────────────────────────────────────────
  _isChannelAllowed(channel, recipient, eventType) {
    if (!recipient?.id) return true
    const prefs = this._preferences[recipient.id]
    if (!prefs) return true    // No prefs = allow all
    const channelKey = `${channel}_enabled`
    if (prefs[channelKey] === false) return false
    const category = EVENT_CATEGORY[eventType] || 'general'
    const catKey   = `${category}_notifications`
    if (prefs[catKey] === false) return false
    return true
  }

  // ── Load user preferences (called at login) ─────────────────
  async loadPreferences(userId) {
    if (!supabase || !userId) return
    try {
      const { data } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single()
      if (data) this._preferences[userId] = data
    } catch {}
  }

  // ── Update user preferences ──────────────────────────────────
  async savePreferences(userId, prefs) {
    this._preferences[userId] = { ...this._preferences[userId], ...prefs }
    if (!supabase || !userId) return
    try {
      await supabase.from('notification_preferences').upsert({
        user_id: userId, ...prefs, updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
    } catch {}
  }

  async getPreferences(userId) {
    if (this._preferences[userId]) return this._preferences[userId]
    await this.loadPreferences(userId)
    return this._preferences[userId] || this._defaultPreferences()
  }

  _defaultPreferences() {
    return {
      in_app_enabled: true, whatsapp_enabled: false, sms_enabled: false,
      push_enabled: false, email_enabled: false,
      booking_notifications: true, trip_notifications: true,
      expense_notifications: true, payroll_notifications: true,
      vehicle_notifications: true, attendance_notifications: true,
      document_notifications: true, system_notifications: true,
    }
  }

  // ── Communication log ────────────────────────────────────────
  async _createLog({ channel, recipient, eventType, subject, body, priority, scheduledAt, relatedEntity, metadata, status }) {
    const logData = {
      channel,
      recipient_id:      recipient?.id || null,
      recipient_type:    recipient?.type || RECIPIENT_TYPE.SYSTEM,
      recipient_name:    recipient?.name || null,
      recipient_contact: recipient?.contact || null,
      category:          EVENT_CATEGORY[eventType] || 'general',
      event_type:        eventType || null,
      subject:           subject || null,
      body:              body || null,
      status:            status || 'pending',
      priority:          priority || 'medium',
      scheduled_at:      scheduledAt || null,
      related_entity_type: relatedEntity?.type || null,
      related_entity_id:   relatedEntity?.id   || null,
      metadata:          metadata || {},
    }

    // Local log always
    const localEntry = { ...logData, id: `log-${Date.now()}`, created_at: new Date().toISOString() }
    _appendLog(localEntry)

    // Supabase log
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_logs').insert(logData).select().single()
        if (data) return data
      } catch {}
    }
    return localEntry
  }

  async _updateLog(logId, updates) {
    if (!logId) return
    if (supabase && !String(logId).startsWith('log-')) {
      try {
        await supabase.from('communication_logs').update(updates).eq('id', logId)
      } catch {}
    }
  }

  // ── Load communication logs ──────────────────────────────────
  async getLogs({ channel, category, status, limit = 50, offset = 0 } = {}) {
    if (supabase) {
      try {
        let q = supabase.from('communication_logs').select('*', { count:'exact' })
        if (channel)  q = q.eq('channel', channel)
        if (category) q = q.eq('category', category)
        if (status)   q = q.eq('status', status)
        q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        const { data, count, error } = await q
        if (!error) return { data: data || [], count: count || 0 }
      } catch {}
    }
    const local = _readLogs()
    let filtered = local
    if (channel)  filtered = filtered.filter(l => l.channel === channel)
    if (category) filtered = filtered.filter(l => l.category === category)
    if (status)   filtered = filtered.filter(l => l.status === status)
    return { data: filtered.slice(offset, offset + limit), count: filtered.length }
  }

  // ── Analytics ────────────────────────────────────────────────
  async getAnalytics() {
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_analytics').select('*')
        if (data) return data
      } catch {}
    }
    const logs = _readLogs()
    const channels = [...new Set(logs.map(l => l.channel))]
    return channels.map(ch => ({
      channel:   ch,
      total:     logs.filter(l => l.channel === ch).length,
      delivered: logs.filter(l => l.channel === ch && l.status === 'delivered').length,
      failed:    logs.filter(l => l.channel === ch && l.status === 'failed').length,
      pending:   logs.filter(l => l.channel === ch && l.status === 'pending').length,
    }))
  }

  getStats() { return { ...this._stats } }

  // ── Provider configuration ───────────────────────────────────
  async getProviders() {
    if (supabase) {
      try {
        const { data } = await supabase.from('communication_providers').select('*')
        if (data) return data
      } catch {}
    }
    return []
  }
}

// ── Singleton ────────────────────────────────────────────────
export const communicationEngine = new CommunicationEngineImpl()
communicationEngine.init()

// ── Convenience: send through engine ─────────────────────────
export async function sendCommunication(request) {
  return communicationEngine.send(request)
}
