// ─── Event Bus ────────────────────────────────────────────────
// Central publish / subscribe system.
// Every module publishes events; the CommunicationEngine subscribes.
// Zero dependencies. Works in all environments.

// ── Event catalogue ───────────────────────────────────────────
export const EVENTS = {
  // Booking
  BOOKING_CREATED:       'BOOKING_CREATED',
  BOOKING_UPDATED:       'BOOKING_UPDATED',
  BOOKING_PENDING:       'BOOKING_PENDING',
  BOOKING_APPROVED:      'BOOKING_APPROVED',
  BOOKING_CANCELLED:     'BOOKING_CANCELLED',
  BOOKING_CLOSED:        'BOOKING_CLOSED',
  // Trip
  TRIP_ASSIGNED:         'TRIP_ASSIGNED',
  TRIP_STARTED:          'TRIP_STARTED',
  TRIP_COMPLETED:        'TRIP_COMPLETED',
  TRIP_CANCELLED:        'TRIP_CANCELLED',
  TRIP_DELAYED:          'TRIP_DELAYED',
  // Driver
  DRIVER_ADDED:          'DRIVER_ADDED',
  DRIVER_UPDATED:        'DRIVER_UPDATED',
  DRIVER_ASSIGNED:       'DRIVER_ASSIGNED',
  DRIVER_CHECKIN:        'DRIVER_CHECKIN',
  DRIVER_CHECKOUT:       'DRIVER_CHECKOUT',
  DRIVER_OFFLINE:        'DRIVER_OFFLINE',
  DRIVER_DOCUMENT_EXPIRY:'DRIVER_DOCUMENT_EXPIRY',
  // Vehicle
  VEHICLE_ADDED:         'VEHICLE_ADDED',
  VEHICLE_ASSIGNED:      'VEHICLE_ASSIGNED',
  VEHICLE_MAINTENANCE_DUE:'VEHICLE_MAINTENANCE_DUE',
  VEHICLE_DOCUMENT_EXPIRY:'VEHICLE_DOCUMENT_EXPIRY',
  // Customer
  CUSTOMER_ADDED:        'CUSTOMER_ADDED',
  CUSTOMER_UPDATED:      'CUSTOMER_UPDATED',
  // Attendance
  ATTENDANCE_MARKED:     'ATTENDANCE_MARKED',
  ATTENDANCE_MISSING:    'ATTENDANCE_MISSING',
  // Expense
  EXPENSE_ADDED:         'EXPENSE_ADDED',
  EXPENSE_APPROVED:      'EXPENSE_APPROVED',
  EXPENSE_REJECTED:      'EXPENSE_REJECTED',
  // Finance
  INVOICE_GENERATED:     'INVOICE_GENERATED',
  PAYMENT_RECEIVED:      'PAYMENT_RECEIVED',
  PAYROLL_GENERATED:     'PAYROLL_GENERATED',
  PAYROLL_PAID:          'PAYROLL_PAID',
  // Document
  DOCUMENT_EXPIRY:       'DOCUMENT_EXPIRY',
  DOCUMENT_EXPIRED:      'DOCUMENT_EXPIRED',
  // Auth / System
  USER_LOGIN:            'USER_LOGIN',
  USER_LOGOUT:           'USER_LOGOUT',
  PASSWORD_CHANGED:      'PASSWORD_CHANGED',
  PROFILE_UPDATED:       'PROFILE_UPDATED',
  SYSTEM_ERROR:          'SYSTEM_ERROR',
  // Scheduled
  SCHEDULED_REMINDER:    'SCHEDULED_REMINDER',
  DAILY_SUMMARY:         'DAILY_SUMMARY',
  WEEKLY_SUMMARY:        'WEEKLY_SUMMARY',
}

// ── Category mapping ──────────────────────────────────────────
export const EVENT_CATEGORY = {
  BOOKING_CREATED:        'booking',
  BOOKING_UPDATED:        'booking',
  BOOKING_PENDING:        'booking',
  BOOKING_APPROVED:       'booking',
  BOOKING_CANCELLED:      'booking',
  BOOKING_CLOSED:         'booking',
  TRIP_ASSIGNED:          'trip',
  TRIP_STARTED:           'trip',
  TRIP_COMPLETED:         'trip',
  TRIP_CANCELLED:         'trip',
  TRIP_DELAYED:           'trip',
  DRIVER_ADDED:           'driver',
  DRIVER_UPDATED:         'driver',
  DRIVER_ASSIGNED:        'trip',
  DRIVER_CHECKIN:         'attendance',
  DRIVER_CHECKOUT:        'attendance',
  DRIVER_OFFLINE:         'driver',
  DRIVER_DOCUMENT_EXPIRY: 'document',
  VEHICLE_ADDED:          'vehicle',
  VEHICLE_ASSIGNED:       'vehicle',
  VEHICLE_MAINTENANCE_DUE:'maintenance',
  VEHICLE_DOCUMENT_EXPIRY:'document',
  CUSTOMER_ADDED:         'customer',
  CUSTOMER_UPDATED:       'customer',
  ATTENDANCE_MARKED:      'attendance',
  ATTENDANCE_MISSING:     'attendance',
  EXPENSE_ADDED:          'expense',
  EXPENSE_APPROVED:       'expense',
  EXPENSE_REJECTED:       'expense',
  INVOICE_GENERATED:      'finance',
  PAYMENT_RECEIVED:       'finance',
  PAYROLL_GENERATED:      'payroll',
  PAYROLL_PAID:           'payroll',
  DOCUMENT_EXPIRY:        'document',
  DOCUMENT_EXPIRED:       'document',
  USER_LOGIN:             'security',
  USER_LOGOUT:            'security',
  PASSWORD_CHANGED:       'security',
  PROFILE_UPDATED:        'system',
  SYSTEM_ERROR:           'system',
  SCHEDULED_REMINDER:     'system',
  DAILY_SUMMARY:          'system',
  WEEKLY_SUMMARY:         'system',
}

// ── Priority mapping ──────────────────────────────────────────
export const EVENT_PRIORITY = {
  BOOKING_CREATED:         'medium',
  BOOKING_PENDING:         'medium',
  BOOKING_APPROVED:        'medium',
  BOOKING_CANCELLED:       'high',
  TRIP_ASSIGNED:           'high',
  TRIP_STARTED:            'medium',
  TRIP_COMPLETED:          'medium',
  TRIP_CANCELLED:          'high',
  TRIP_DELAYED:            'high',
  DRIVER_OFFLINE:          'high',
  DRIVER_DOCUMENT_EXPIRY:  'high',
  VEHICLE_MAINTENANCE_DUE: 'high',
  VEHICLE_DOCUMENT_EXPIRY: 'high',
  ATTENDANCE_MISSING:      'medium',
  EXPENSE_ADDED:           'low',
  EXPENSE_APPROVED:        'medium',
  EXPENSE_REJECTED:        'medium',
  INVOICE_GENERATED:       'medium',
  PAYMENT_RECEIVED:        'high',
  PAYROLL_GENERATED:       'medium',
  PAYROLL_PAID:            'high',
  DOCUMENT_EXPIRY:         'high',
  DOCUMENT_EXPIRED:        'critical',
  SYSTEM_ERROR:            'critical',
  USER_LOGIN:              'low',
  USER_LOGOUT:             'low',
  PASSWORD_CHANGED:        'high',
  DEFAULT:                 'medium',
}

// ── EventBus implementation ───────────────────────────────────
class EventBusImpl {
  constructor() {
    this._listeners = {}     // { eventType: [{ id, handler, once }] }
    this._history   = []     // last 200 events for debugging
    this._maxHistory = 200
    this._idCounter  = 0
  }

  /**
   * Subscribe to an event.
   * Returns an unsubscribe function.
   */
  on(eventType, handler) {
    if (!this._listeners[eventType]) this._listeners[eventType] = []
    const id = ++this._idCounter
    this._listeners[eventType].push({ id, handler, once: false })
    return () => this.off(eventType, id)
  }

  /** Subscribe to an event once only. */
  once(eventType, handler) {
    if (!this._listeners[eventType]) this._listeners[eventType] = []
    const id = ++this._idCounter
    this._listeners[eventType].push({ id, handler, once: true })
    return () => this.off(eventType, id)
  }

  /** Unsubscribe by listener id. */
  off(eventType, id) {
    if (!this._listeners[eventType]) return
    this._listeners[eventType] = this._listeners[eventType].filter(l => l.id !== id)
  }

  /**
   * Publish an event. Payload is free-form.
   * Returns count of handlers called.
   */
  emit(eventType, payload = {}) {
    const event = {
      type:      eventType,
      category:  EVENT_CATEGORY[eventType] || 'general',
      priority:  EVENT_PRIORITY[eventType]  || EVENT_PRIORITY.DEFAULT,
      payload,
      timestamp: new Date().toISOString(),
    }

    // Record in history
    this._history.unshift(event)
    if (this._history.length > this._maxHistory) this._history.pop()

    const listeners = [...(this._listeners[eventType] || []), ...(this._listeners['*'] || [])]
    let count = 0

    listeners.forEach(l => {
      try {
        l.handler(event)
        count++
      } catch (err) {
        console.error(`[EventBus] Handler error for ${eventType}:`, err)
      }
    })

    // Remove once-listeners
    if (this._listeners[eventType]) {
      this._listeners[eventType] = this._listeners[eventType].filter(l => !l.once)
    }

    return count
  }

  /** Get recent event history (for debugging). */
  getHistory(limit = 50) {
    return this._history.slice(0, limit)
  }

  /** Clear all listeners. */
  clear() {
    this._listeners = {}
  }
}

// ── Singleton ─────────────────────────────────────────────────
export const eventBus = new EventBusImpl()

/**
 * Convenience publisher. Usage:
 *   publish(EVENTS.BOOKING_CREATED, { bookingId, customer, ... })
 */
export function publish(eventType, payload = {}) {
  return eventBus.emit(eventType, payload)
}

/**
 * Convenience subscriber. Usage:
 *   const unsub = subscribe(EVENTS.TRIP_ASSIGNED, e => { ... })
 *   unsub() // cleanup
 */
export function subscribe(eventType, handler) {
  return eventBus.on(eventType, handler)
}
