// ─── Session Manager ──────────────────────────────────────────
// Tracks login sessions, auto-logout on inactivity,
// login history, and concurrent session detection.

import supabase from '../lib/supabase'

const LS_SESSION_KEY  = 'sjt_session'
const LS_HISTORY_KEY  = 'sjt_session_history'
const LS_LAST_ACTIVE  = 'sjt_last_active'
const DEFAULT_TIMEOUT = 60  // minutes

function rLS(k)   { try { return JSON.parse(localStorage.getItem(k)||'null') } catch { return null } }
function wLS(k,v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

class SessionManagerImpl {
  constructor() {
    this._timer       = null
    this._timeout     = DEFAULT_TIMEOUT
    this._onTimeout   = null    // callback
    this._session     = null
    this._startedAt   = null
  }

  // ── Start a session ───────────────────────────────────────
  start(user, timeoutMinutes = DEFAULT_TIMEOUT) {
    this._timeout   = timeoutMinutes
    this._startedAt = new Date().toISOString()
    this._session   = {
      userId:   user.id,
      userName: user.name,
      userRole: user.role,
      device:   this._getDevice(),
      startedAt:this._startedAt,
    }
    wLS(LS_SESSION_KEY, this._session)
    wLS(LS_LAST_ACTIVE, new Date().toISOString())
    this._scheduleTimeout()
    this._logEvent('login', user)
  }

  // ── Refresh activity (call on any user interaction) ───────
  touch() {
    wLS(LS_LAST_ACTIVE, new Date().toISOString())
    this._scheduleTimeout()
  }

  // ── End session ───────────────────────────────────────────
  end(reason = 'logout') {
    this._clearTimer()
    const duration = this._session
      ? Math.floor((Date.now() - new Date(this._session.startedAt)) / 1000)
      : 0
    if (this._session) {
      this._logEvent(reason === 'timeout' ? 'timeout' : 'logout', null, duration)
    }
    this._session = null
    localStorage.removeItem(LS_SESSION_KEY)
    localStorage.removeItem(LS_LAST_ACTIVE)
  }

  // ── Register timeout callback ─────────────────────────────
  onTimeout(cb) { this._onTimeout = cb }

  // ── Get current session ───────────────────────────────────
  getSession() { return this._session || rLS(LS_SESSION_KEY) }

  // ── Get session history ───────────────────────────────────
  getHistory(limit = 20) {
    const all = rLS(LS_HISTORY_KEY) || []
    return all.slice(0, limit)
  }

  // ── Get seconds since last activity ───────────────────────
  getIdleSeconds() {
    const last = rLS(LS_LAST_ACTIVE)
    if (!last) return 0
    return Math.floor((Date.now() - new Date(last)) / 1000)
  }

  // ── Is session still valid? ───────────────────────────────
  isActive() {
    return this.getIdleSeconds() < this._timeout * 60
  }

  // ── Update timeout from settings ─────────────────────────
  setTimeoutMinutes(minutes) {
    this._timeout = Number(minutes) || DEFAULT_TIMEOUT
    if (this._session) this._scheduleTimeout()
  }

  // ── Internal ──────────────────────────────────────────────
  _scheduleTimeout() {
    this._clearTimer()
    // Never auto-logout a driver mid-trip: the active ride is more important
    // than the idle timer. The timer resumes when the ride ends.
    try {
      const activeRide = JSON.parse(localStorage.getItem('sjt_ride_lifecycle') || 'null')
      if (activeRide?.state && activeRide.state !== 'idle') return
    } catch {}
    const ms = this._timeout * 60 * 1000
    this._timer = setTimeout(() => {
      if (this._onTimeout) this._onTimeout()
    }, ms)
  }

  // Call this when a ride ends so the idle timer can resume.
  resumeTimeoutAfterRide() {
    this._scheduleTimeout()
  }

  _clearTimer() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
  }

  _getDevice() {
    try {
      const ua = navigator.userAgent
      if (/Mobile/i.test(ua))  return 'mobile'
      if (/Tablet/i.test(ua))  return 'tablet'
      return 'desktop'
    } catch { return 'unknown' }
  }

  async _logEvent(event, user, duration = null) {
    const entry = {
      id:       `ses-${Date.now()}`,
      event,
      userId:   user?.id || this._session?.userId,
      userName: user?.name || this._session?.userName,
      userRole: user?.role || this._session?.userRole,
      device:   this._getDevice(),
      duration,
      createdAt:new Date().toISOString(),
    }

    // Local history
    const history = rLS(LS_HISTORY_KEY) || []
    wLS(LS_HISTORY_KEY, [entry, ...history].slice(0, 100))

    // Supabase log
    if (supabase) {
      try {
        await supabase.from('session_log').insert({
          user_id:          entry.userId,
          user_name:        entry.userName,
          user_role:        entry.userRole,
          event:            entry.event,
          device_info:      entry.device,
          session_duration: entry.duration,
        })
      } catch {}
    }
  }
}

export const sessionManager = new SessionManagerImpl()

// ── Activity listener: touch session on any DOM event ─────────
if (typeof window !== 'undefined') {
  const EVENTS = ['mousemove','keydown','click','scroll','touchstart']
  let _debounce = null
  const _touch = () => {
    if (_debounce) return
    sessionManager.touch()
    _debounce = setTimeout(() => { _debounce = null }, 10000)  // debounce 10s
  }
  EVENTS.forEach(e => document.addEventListener(e, _touch, { passive:true }))
}