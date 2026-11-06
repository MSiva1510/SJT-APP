// ─── Queue Manager ────────────────────────────────────────────
// In-memory queue with Supabase persistence.
// Handles async delivery, retry, scheduling.

import supabase from '../lib/supabase'

const LS_KEY = 'sjt_comm_queue'

export const QUEUE_STATUS = {
  PENDING:    'pending',
  PROCESSING: 'processing',
  DELIVERED:  'delivered',
  FAILED:     'failed',
  RETRYING:   'retrying',
  CANCELLED:  'cancelled',
}

const DEFAULT_MAX_RETRIES = 3
const RETRY_DELAYS_MS = [5000, 15000, 60000]   // 5s, 15s, 60s

// ── Local fallback store ──────────────────────────────────────
function _readLocal()   { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]') } catch { return [] } }
function _writeLocal(q) { try { localStorage.setItem(LS_KEY, JSON.stringify(q.slice(0,200))) } catch {} }

class QueueManagerImpl {
  constructor() {
    this._queue     = []
    this._running   = false
    this._handlers  = {}           // { channel: async (item) => result }
    this._timers    = new Map()
  }

  /** Register a delivery handler for a channel. */
  registerHandler(channel, handler) {
    this._handlers[channel] = handler
  }

  /** Enqueue a message. Returns the queue item id. */
  async enqueue({
    channel, payload, priority = 'medium',
    scheduledAt = null, maxRetries = DEFAULT_MAX_RETRIES,
    logId = null,
  }) {
    const item = {
      id:          `q-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      channel,
      payload,
      priority,
      status:      QUEUE_STATUS.PENDING,
      scheduled_at:scheduledAt || new Date().toISOString(),
      created_at:  new Date().toISOString(),
      retry_count: 0,
      max_retries: maxRetries,
      log_id:      logId,
    }

    // Persist to Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase.from('communication_queue').insert({
          channel, payload, priority, status: QUEUE_STATUS.PENDING,
          scheduled_at: item.scheduled_at, max_retries: maxRetries, log_id: logId,
        }).select().single()
        if (!error && data) item.db_id = data.id
      } catch {}
    }

    // Local fallback
    const local = _readLocal()
    _writeLocal([item, ...local])
    this._queue.push(item)

    // Schedule processing
    const delay = scheduledAt ? Math.max(0, new Date(scheduledAt) - Date.now()) : 0
    const timer = setTimeout(() => this._process(item.id), delay)
    this._timers.set(item.id, timer)

    return item.id
  }

  /** Cancel a queued item. */
  async cancel(itemId) {
    this._clearTimer(itemId)
    this._updateStatus(itemId, QUEUE_STATUS.CANCELLED)
    if (supabase) {
      try { await supabase.from('communication_queue').update({ status: QUEUE_STATUS.CANCELLED }).eq('id', itemId) } catch {}
    }
  }

  /** Process a single queue item. */
  async _process(itemId) {
    this._clearTimer(itemId)
    const item = this._queue.find(i => i.id === itemId)
    if (!item || [QUEUE_STATUS.DELIVERED, QUEUE_STATUS.CANCELLED].includes(item.status)) return

    this._updateStatus(itemId, QUEUE_STATUS.PROCESSING)

    const handler = this._handlers[item.channel]
    if (!handler) {
      this._updateStatus(itemId, QUEUE_STATUS.FAILED, 'No handler registered for channel: ' + item.channel)
      return
    }

    try {
      const result = await handler(item.payload)
      this._updateStatus(itemId, QUEUE_STATUS.DELIVERED)
      await this._persistStatus(item, QUEUE_STATUS.DELIVERED)
    } catch (err) {
      const reason = err?.message || 'Unknown error'
      if (item.retry_count < item.max_retries) {
        item.retry_count++
        this._updateStatus(itemId, QUEUE_STATUS.RETRYING)
        const delay = RETRY_DELAYS_MS[item.retry_count - 1] || 60000
        const timer = setTimeout(() => this._process(itemId), delay)
        this._timers.set(itemId, timer)
      } else {
        this._updateStatus(itemId, QUEUE_STATUS.FAILED, reason)
        await this._persistStatus(item, QUEUE_STATUS.FAILED, reason)
      }
    }
  }

  _updateStatus(itemId, status, failureReason = null) {
    const item = this._queue.find(i => i.id === itemId)
    if (!item) return
    item.status = status
    if (failureReason) item.failure_reason = failureReason

    const local = _readLocal().map(i => i.id === itemId ? { ...i, status, failure_reason: failureReason } : i)
    _writeLocal(local)
  }

  async _persistStatus(item, status, failureReason = null) {
    if (!supabase || !item.db_id) return
    try {
      await supabase.from('communication_queue').update({
        status,
        processed_at: new Date().toISOString(),
        retry_count:  item.retry_count,
        ...(failureReason ? { failure_reason: failureReason } : {}),
      }).eq('id', item.db_id)
    } catch {}
  }

  _clearTimer(itemId) {
    if (this._timers.has(itemId)) {
      clearTimeout(this._timers.get(itemId))
      this._timers.delete(itemId)
    }
  }

  /** Get queue stats. */
  getStats() {
    const all = this._queue
    return {
      total:      all.length,
      pending:    all.filter(i => i.status === QUEUE_STATUS.PENDING).length,
      processing: all.filter(i => i.status === QUEUE_STATUS.PROCESSING).length,
      delivered:  all.filter(i => i.status === QUEUE_STATUS.DELIVERED).length,
      failed:     all.filter(i => i.status === QUEUE_STATUS.FAILED).length,
      retrying:   all.filter(i => i.status === QUEUE_STATUS.RETRYING).length,
      cancelled:  all.filter(i => i.status === QUEUE_STATUS.CANCELLED).length,
    }
  }

  /** Load persisted queue from localStorage on startup. */
  hydrate() {
    const local = _readLocal()
    this._queue = local.filter(i => i.status === QUEUE_STATUS.PENDING)
    this._queue.forEach(item => {
      const delay = item.scheduled_at
        ? Math.max(0, new Date(item.scheduled_at) - Date.now())
        : 0
      const timer = setTimeout(() => this._process(item.id), delay)
      this._timers.set(item.id, timer)
    })
  }

  /** Clear delivered/failed items from memory. */
  cleanup() {
    this._queue = this._queue.filter(i =>
      [QUEUE_STATUS.PENDING, QUEUE_STATUS.PROCESSING, QUEUE_STATUS.RETRYING].includes(i.status)
    )
  }
}

export const queueManager = new QueueManagerImpl()
// Restore pending items from localStorage on load
queueManager.hydrate()
