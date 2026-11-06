// ─── Error Logger ─────────────────────────────────────────────
// Central error tracking: severity levels, module tagging,
// Supabase persistence, localStorage fallback.

import supabase from '../lib/supabase'

const LS_KEY     = 'sjt_error_log'
const MAX_LOCAL  = 200

export const SEVERITY = {
  INFO:     'info',
  WARNING:  'warning',
  ERROR:    'error',
  CRITICAL: 'critical',
}

function rLS()      { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]') } catch { return [] } }
function wLS(items) { try { localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX_LOCAL))) } catch {} }

class ErrorLoggerImpl {
  constructor() {
    this._errors     = []
    this._userId     = null
    this._userRole   = null
  }

  setUser(userId, userRole) {
    this._userId   = userId
    this._userRole = userRole
  }

  async log(severity, module, message, options = {}) {
    const entry = {
      id:        `err-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      severity,
      module:    module || 'general',
      message:   String(message).slice(0, 500),
      stack:     options.stack ? String(options.stack).slice(0, 1000) : null,
      user_id:   options.userId   || this._userId,
      user_role: options.userRole || this._userRole,
      resolved:  false,
      metadata:  options.metadata || {},
      created_at:new Date().toISOString(),
    }

    // Local store
    const local = rLS()
    wLS([entry, ...local])
    this._errors.unshift(entry)

    // Supabase
    if (supabase) {
      try {
        await supabase.from('error_log').insert({
          severity:  entry.severity,
          module:    entry.module,
          message:   entry.message,
          stack:     entry.stack,
          user_id:   entry.user_id,
          user_role: entry.user_role,
          metadata:  entry.metadata,
        })
      } catch {}
    }

    if (severity === SEVERITY.CRITICAL) console.error(`[CRITICAL/${module}]`, message)
    else if (severity === SEVERITY.ERROR)  console.error(`[ERROR/${module}]`, message)

    return entry
  }

  info     (module, msg, opts) { return this.log(SEVERITY.INFO,     module, msg, opts) }
  warning  (module, msg, opts) { return this.log(SEVERITY.WARNING,  module, msg, opts) }
  error    (module, msg, opts) { return this.log(SEVERITY.ERROR,    module, msg, opts) }
  critical (module, msg, opts) { return this.log(SEVERITY.CRITICAL, module, msg, opts) }

  /** Capture unhandled errors. */
  captureException(err, module = 'uncaught') {
    return this.error(module, err?.message || String(err), { stack: err?.stack, metadata:{ type: err?.name } })
  }

  async getErrors({ severity, module, resolved, limit = 50, offset = 0 } = {}) {
    if (supabase) {
      try {
        let q = supabase.from('error_log').select('*', { count: 'exact' })
        if (severity) q = q.eq('severity', severity)
        if (module)   q = q.eq('module', module)
        if (resolved != null) q = q.eq('resolved', resolved)
        q = q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        const { data, count, error } = await q
        if (!error) return { data: data || [], count: count || 0 }
      } catch {}
    }
    let all = rLS()
    if (severity) all = all.filter(e => e.severity === severity)
    if (module)   all = all.filter(e => e.module   === module)
    if (resolved != null) all = all.filter(e => e.resolved === resolved)
    return { data: all.slice(offset, offset + limit), count: all.length }
  }

  async resolve(id, resolvedBy) {
    if (supabase && !id.startsWith('err-')) {
      try {
        await supabase.from('error_log').update({
          resolved:    true,
          resolved_by: resolvedBy,
          resolved_at: new Date().toISOString(),
        }).eq('id', id)
      } catch {}
    }
    const local = rLS().map(e => e.id === id ? { ...e, resolved: true } : e)
    wLS(local)
  }

  getStats() {
    const all = rLS()
    return {
      total:    all.length,
      critical: all.filter(e => e.severity === SEVERITY.CRITICAL).length,
      errors:   all.filter(e => e.severity === SEVERITY.ERROR).length,
      warnings: all.filter(e => e.severity === SEVERITY.WARNING).length,
      unresolved: all.filter(e => !e.resolved).length,
    }
  }
}

export const errorLogger = new ErrorLoggerImpl()

// ── Global uncaught error capture ─────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('error', e => {
    errorLogger.captureException(e.error || new Error(e.message), 'window')
  })
  window.addEventListener('unhandledrejection', e => {
    errorLogger.captureException(e.reason, 'promise')
  })
}
