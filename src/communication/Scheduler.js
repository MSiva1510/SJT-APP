// ─── Scheduler ────────────────────────────────────────────────
// Manages scheduled / recurring notifications.
// No external cron — runs in-browser using setTimeout intervals.
// Persists schedule to localStorage; Supabase sync optional.

import { eventBus, EVENTS } from './EventBus'
import { queueManager }     from './QueueManager'

const LS_SCHEDULE_KEY = 'sjt_comm_schedule'

export const SCHEDULE_TYPES = {
  TRIP_REMINDER:        'TRIP_REMINDER',          // Day before trip
  DOCUMENT_EXPIRY:      'DOCUMENT_EXPIRY',        // 30d / 15d / 7d before expiry
  VEHICLE_SERVICE:      'VEHICLE_SERVICE',        // Service due reminder
  INSURANCE_EXPIRY:     'INSURANCE_EXPIRY',
  PERMIT_EXPIRY:        'PERMIT_EXPIRY',
  FC_EXPIRY:            'FC_EXPIRY',              // Fitness Certificate
  DRIVER_LICENSE_EXPIRY:'DRIVER_LICENSE_EXPIRY',
  ATTENDANCE_REMINDER:  'ATTENDANCE_REMINDER',    // Daily at 20:00 for next-day drivers
  DAILY_SUMMARY:        'DAILY_SUMMARY',          // Admin: daily stats
  WEEKLY_SUMMARY:       'WEEKLY_SUMMARY',         // Admin: weekly stats
}

// ── Reminder intervals (days before expiry) ───────────────────
export const EXPIRY_REMIND_DAYS = [30, 15, 7, 3, 1]

function readSchedule()    { try { return JSON.parse(localStorage.getItem(LS_SCHEDULE_KEY)||'[]') } catch { return [] } }
function writeSchedule(s)  { try { localStorage.setItem(LS_SCHEDULE_KEY, JSON.stringify(s)) } catch {} }

class SchedulerImpl {
  constructor() {
    this._jobs    = new Map()   // id → { config, timer }
    this._history = []
    this._running = false
  }

  /**
   * Schedule a one-time job.
   * @param {string} type       SCHEDULE_TYPES.*
   * @param {Date}   runAt      When to fire
   * @param {object} payload    Passed to event
   * @param {string} [id]       Optional stable id (prevents duplicates)
   */
  scheduleOnce(type, runAt, payload, id = null) {
    const jobId = id || `sch-${Date.now()}-${Math.random().toString(36).slice(2,5)}`
    if (this._jobs.has(jobId)) return jobId  // Already scheduled

    const delay = Math.max(0, new Date(runAt) - Date.now())
    const timer = setTimeout(() => {
      this._fire(jobId, type, payload)
    }, delay)

    this._jobs.set(jobId, { id:jobId, type, runAt:new Date(runAt).toISOString(), payload, timer, recurring:false })
    this._persist()
    return jobId
  }

  /**
   * Schedule a recurring job.
   * @param {string} type         SCHEDULE_TYPES.*
   * @param {number} intervalMs   e.g. 86400000 for daily
   * @param {object} payload
   * @param {string} [id]
   */
  scheduleRecurring(type, intervalMs, payload, id = null) {
    const jobId = id || `sch-rec-${type}`
    if (this._jobs.has(jobId)) return jobId

    const timer = setInterval(() => {
      this._fire(jobId, type, payload)
    }, intervalMs)

    this._jobs.set(jobId, { id:jobId, type, intervalMs, payload, timer, recurring:true })
    this._persist()
    return jobId
  }

  /** Cancel a scheduled job. */
  cancel(jobId) {
    const job = this._jobs.get(jobId)
    if (!job) return false
    if (job.recurring) clearInterval(job.timer)
    else               clearTimeout(job.timer)
    this._jobs.delete(jobId)
    this._persist()
    return true
  }

  /** Cancel all jobs of a given type. */
  cancelByType(type) {
    let count = 0
    this._jobs.forEach((job, id) => {
      if (job.type === type) { this.cancel(id); count++ }
    })
    return count
  }

  _fire(jobId, type, payload) {
    const entry = { jobId, type, payload, firedAt: new Date().toISOString() }
    this._history.unshift(entry)
    if (this._history.length > 100) this._history.pop()

    // Publish to EventBus
    eventBus.emit(EVENTS.SCHEDULED_REMINDER, { scheduleType: type, ...payload })

    // Remove one-time jobs from map
    const job = this._jobs.get(jobId)
    if (job && !job.recurring) {
      this._jobs.delete(jobId)
      this._persist()
    }
  }

  _persist() {
    const data = []
    this._jobs.forEach(job => {
      data.push({
        id:          job.id,
        type:        job.type,
        runAt:       job.runAt,
        intervalMs:  job.intervalMs,
        payload:     job.payload,
        recurring:   job.recurring,
      })
    })
    writeSchedule(data)
  }

  getJobs() {
    const result = []
    this._jobs.forEach(job => result.push({ ...job, timer: undefined }))
    return result
  }

  getHistory(limit = 20) {
    return this._history.slice(0, limit)
  }

  // ── Built-in schedule helpers ──────────────────────────────

  /** Schedule a trip reminder for the day before. */
  scheduleTripReminder(bookingId, startDateStr, payload) {
    const tripDate = new Date(startDateStr + 'T07:00:00')
    const remindAt = new Date(tripDate.getTime() - 86400000)  // 24h before
    if (remindAt > new Date()) {
      this.scheduleOnce(SCHEDULE_TYPES.TRIP_REMINDER, remindAt,
        { bookingId, ...payload },
        `trip-reminder-${bookingId}`)
    }
  }

  /** Schedule expiry reminders for a document. */
  scheduleExpiryReminders(entityId, entityType, docType, expiryDateStr) {
    const expiry = new Date(expiryDateStr + 'T08:00:00')
    EXPIRY_REMIND_DAYS.forEach(days => {
      const remindAt = new Date(expiry.getTime() - days * 86400000)
      if (remindAt > new Date()) {
        this.scheduleOnce(
          SCHEDULE_TYPES.DOCUMENT_EXPIRY,
          remindAt,
          { entityId, entityType, docType, expiryDate: expiryDateStr, daysLeft: days },
          `expiry-${entityId}-${docType}-${days}d`
        )
      }
    })
  }

  /** Schedule daily summary for admin (every 24h). */
  scheduleDailySummary() {
    const MS_24H = 86400000
    // Fire first summary at next midnight
    const now    = new Date()
    const nextMN = new Date(now)
    nextMN.setHours(23, 0, 0, 0)
    if (nextMN < now) nextMN.setDate(nextMN.getDate() + 1)
    this.scheduleOnce(SCHEDULE_TYPES.DAILY_SUMMARY, nextMN, { auto: true }, 'daily-summary-first')
    this.scheduleRecurring(SCHEDULE_TYPES.DAILY_SUMMARY, MS_24H, { auto: true }, 'daily-summary-recurring')
  }

  /** Schedule weekly summary (Monday 08:00). */
  scheduleWeeklySummary() {
    const MS_7D = 7 * 86400000
    const now   = new Date()
    const next  = new Date(now)
    const dow   = now.getDay()                        // 0=Sun
    const daysToMon = (8 - dow) % 7 || 7
    next.setDate(now.getDate() + daysToMon)
    next.setHours(8, 0, 0, 0)
    this.scheduleOnce(SCHEDULE_TYPES.WEEKLY_SUMMARY, next, { auto: true }, 'weekly-summary-first')
    this.scheduleRecurring(SCHEDULE_TYPES.WEEKLY_SUMMARY, MS_7D, { auto: true }, 'weekly-summary-recurring')
  }
}

export const scheduler = new SchedulerImpl()
