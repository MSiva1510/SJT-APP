// ─── useRideLifecycle — Ride Lifecycle Management Hook ────────
//
// Manages the full state machine for a driver's active ride:
//   pending → started → paused ⇄ started → completed
//                                        → cancelled
//
// All state is persisted to localStorage so page refresh
// restores the exact ride state including elapsed timer.
//
// GPS integration: exposes lifecycle event callbacks
//   onRideStart / onRidePause / onRideResume / onRideEnd
// that the DriverDashboard calls after capturing GPS coords.
// This hook does NOT import useGPS — GPS is opt-in.

import { useState, useEffect, useRef, useCallback } from 'react'
import { sessionManager } from '../security/SessionManager'

// ── Storage keys ──────────────────────────────────────────────
export const LIFECYCLE_KEY         = 'sjt_ride_lifecycle'
export const LIFECYCLE_HISTORY_KEY = 'sjt_ride_history'

// ── Ride states ───────────────────────────────────────────────
export const RIDE_STATES = {
  PENDING:   'pending',
  STARTED:   'started',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

// ── Status display config ─────────────────────────────────────
export const RIDE_STATE_CFG = {
  pending:   { label: 'Assigned',    bg: 'bg-slate-100 dark:bg-slate-800/60',     text: 'text-slate-600 dark:text-slate-400',       dot: 'bg-slate-400',                     border: 'border-slate-200 dark:border-slate-700'   },
  started:   { label: 'In Progress', bg: 'bg-blue-100 dark:bg-blue-900/30',        text: 'text-blue-700 dark:text-blue-300',          dot: 'bg-blue-500 animate-pulse',        border: 'border-blue-200 dark:border-blue-800/50'  },
  paused:    { label: 'Paused',      bg: 'bg-amber-100 dark:bg-amber-900/30',      text: 'text-amber-700 dark:text-amber-300',        dot: 'bg-amber-500',                     border: 'border-amber-200 dark:border-amber-800/50'},
  completed: { label: 'Completed',   bg: 'bg-emerald-100 dark:bg-emerald-900/30',  text: 'text-emerald-700 dark:text-emerald-300',    dot: 'bg-emerald-500',                   border: 'border-emerald-200 dark:border-emerald-800/50' },
  cancelled: { label: 'Cancelled',   bg: 'bg-red-100 dark:bg-red-900/30',          text: 'text-red-700 dark:text-red-400',            dot: 'bg-red-500',                       border: 'border-red-200 dark:border-red-800/50'   },
}

// ── Null active ride shape ─────────────────────────────────────
const NULL_RIDE = null

// ── localStorage helpers ──────────────────────────────────────
function readLifecycle() {
  try { const r = localStorage.getItem(LIFECYCLE_KEY);  return r ? JSON.parse(r) : null } catch { return null }
}
function writeLifecycle(data) {
  try { localStorage.setItem(LIFECYCLE_KEY, JSON.stringify(data)) } catch {}
}
function clearLifecycle() {
  try { localStorage.removeItem(LIFECYCLE_KEY) } catch {}
}
export function loadRideHistory() {
  try { const r = localStorage.getItem(LIFECYCLE_HISTORY_KEY); return r ? JSON.parse(r) : [] } catch { return [] }
}
function appendHistory(entry) {
  try {
    const h = loadRideHistory()
    h.unshift(entry)
    localStorage.setItem(LIFECYCLE_HISTORY_KEY, JSON.stringify(h.slice(0, 200)))
  } catch {}
}

// ── Format elapsed seconds as HH:MM:SS ───────────────────────
export function formatElapsed(totalSeconds) {
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const pad = n => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

// ── Compute elapsed seconds from a saved ride ─────────────────
// Accounts for multiple pause/resume cycles
function computeElapsedSeconds(ride) {
  if (!ride || !ride.startedAt) return 0
  const now = Date.now()

  // Sum up all completed segments
  let total = 0
  const segs = ride.segments || []
  for (const seg of segs) {
    const segStart = new Date(seg.startedAt).getTime()
    const segEnd   = seg.endedAt ? new Date(seg.endedAt).getTime() : now
    total += Math.max(0, segEnd - segStart)
  }
  return Math.floor(total / 1000)
}

// ─────────────────────────────────────────────────────────────
//  Main hook
// ─────────────────────────────────────────────────────────────
export function useRideLifecycle() {
  // Restore from localStorage on mount
  const [activeRide, setActiveRide] = useState(() => readLifecycle())
  const [elapsed,    setElapsed]    = useState(() => {
    const saved = readLifecycle()
    return saved ? computeElapsedSeconds(saved) : 0
  })

  const timerRef = useRef(null)

  // ── Timer engine ──────────────────────────────────────────
  // Runs every second when state is 'started'
  const startTimer = useCallback(() => {
    if (timerRef.current) return
    timerRef.current = setInterval(() => {
      setActiveRide(prev => {
        if (!prev || prev.rideState !== RIDE_STATES.STARTED) return prev
        const secs = computeElapsedSeconds(prev)
        setElapsed(secs)
        return prev
      })
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // On mount: resume timer if ride was started
  useEffect(() => {
    const saved = readLifecycle()
    if (saved?.rideState === RIDE_STATES.STARTED) {
      setElapsed(computeElapsedSeconds(saved))
      startTimer()
    }
    return () => stopTimer()
  }, [startTimer, stopTimer])

  // ── Persist whenever activeRide changes ───────────────────
  useEffect(() => {
    if (activeRide) {
      writeLifecycle(activeRide)
    }
  }, [activeRide])

  // ─────────────────────────────────────────────────────────
  //  Actions
  // ─────────────────────────────────────────────────────────

  // ── START RIDE ────────────────────────────────────────────
  // GPS hook point: call onRideStart(ride) after this resolves
  const startRide = useCallback((trip, driverId) => {
    const now    = new Date().toISOString()
    const nowFmt = new Date().toLocaleTimeString()

    const ride = {
      tripId:     trip.tripId,
      customer:   trip.customer,
      contact:    trip.contact,
      pickup:     trip.pickup,
      drop:       trip.drop,
      tripType:   trip.tripType,
      vehicle:    trip.vehicle || '',
      driverId:   driverId || '',
      fare:       trip.fare,
      km:         trip.km,
      notes:      trip.notes || '',
      rideState:  RIDE_STATES.STARTED,
      startedAt:  now,
      startDate:  new Date().toLocaleDateString(),
      startTime:  nowFmt,
      pausedAt:   null,
      endedAt:    null,
      endTime:    null,
      duration:   null,
      pauseCount: 0,
      totalPausedMs: 0,
      segments:   [{ startedAt: now, endedAt: null }],
      events:     [{ type: 'started', at: now, label: 'Ride started' }],
    }

    setActiveRide(ride)
    setElapsed(0)
    writeLifecycle(ride)
    startTimer()
    return ride
  }, [startTimer])

  // ── PAUSE RIDE ────────────────────────────────────────────
  // GPS hook point: call onRidePause(ride) after this resolves
  // Module 2 (Day 20.5): reason is now required and stored with
  // the pause event — pauseReason/pausedAt surface in ride history.
  const pauseRide = useCallback((reason = 'Other') => {
    const now = new Date().toISOString()
    setActiveRide(prev => {
      if (!prev || prev.rideState !== RIDE_STATES.STARTED) return prev
      const updated = {
        ...prev,
        rideState:  RIDE_STATES.PAUSED,
        pausedAt:   now,
        pauseReason: reason,
        pauseCount: (prev.pauseCount || 0) + 1,
        // Close the current open segment
        segments: prev.segments.map((seg, i) =>
          i === prev.segments.length - 1 && !seg.endedAt
            ? { ...seg, endedAt: now }
            : seg
        ),
        events: [...(prev.events || []), { type: 'paused', at: now, label: 'Ride paused', reason }],
      }
      writeLifecycle(updated)
      return updated
    })
    // Re-enable the session idle timer now that the ride is over
    sessionManager.resumeTimeoutAfterRide()
    stopTimer()
  }, [stopTimer])

  // ── RESUME RIDE ───────────────────────────────────────────
  // GPS hook point: call onRideResume(ride) after this resolves
  const resumeRide = useCallback(() => {
    const now = new Date().toISOString()
    setActiveRide(prev => {
      if (!prev || prev.rideState !== RIDE_STATES.PAUSED) return prev
      const updated = {
        ...prev,
        rideState: RIDE_STATES.STARTED,
        pausedAt:  null,
        // Start a new segment
        segments: [...(prev.segments || []), { startedAt: now, endedAt: null }],
        events: [...(prev.events || []), { type: 'resumed', at: now, label: 'Ride resumed' }],
      }
      writeLifecycle(updated)
      return updated
    })
    startTimer()
  }, [startTimer])

  // ── END RIDE ──────────────────────────────────────────────
  // GPS hook point: call onRideEnd(ride) after this resolves
  const endRide = useCallback(() => {
    const now        = new Date().toISOString()
    const nowFmt     = new Date().toLocaleTimeString()
    const totalSecs  = computeElapsedSeconds({ ...activeRide, segments: activeRide?.segments?.map((seg, i) => i === (activeRide.segments?.length || 0) - 1 && !seg.endedAt ? { ...seg, endedAt: now } : seg) || [] })
    const durationStr = formatElapsed(totalSecs)

    setActiveRide(prev => {
      if (!prev) return prev
      const completed = {
        ...prev,
        rideState: RIDE_STATES.COMPLETED,
        endedAt:   now,
        endTime:   nowFmt,
        duration:  durationStr,
        durationSecs: totalSecs,
        segments: prev.segments.map((seg, i) =>
          i === prev.segments.length - 1 && !seg.endedAt
            ? { ...seg, endedAt: now }
            : seg
        ),
        events: [...(prev.events || []), { type: 'completed', at: now, label: 'Ride completed' }],
      }
      appendHistory(completed)
      clearLifecycle()
      return NULL_RIDE
    })

    stopTimer()
    setElapsed(0)
    return { duration: durationStr, durationSecs: totalSecs }
  }, [activeRide, stopTimer])

  // ── CANCEL RIDE ───────────────────────────────────────────
  const cancelRide = useCallback((reason = '') => {
    const now = new Date().toISOString()
    setActiveRide(prev => {
      if (!prev) return prev
      const cancelled = {
        ...prev,
        rideState:    RIDE_STATES.CANCELLED,
        endedAt:      now,
        cancelReason: reason,
        events: [...(prev.events || []), { type: 'cancelled', at: now, label: `Ride cancelled${reason ? ': ' + reason : ''}` }],
      }
      appendHistory(cancelled)
      clearLifecycle()
      return NULL_RIDE
    })
    stopTimer()
    setElapsed(0)
  }, [stopTimer])

  // ── Derived state ─────────────────────────────────────────
  const rideState    = activeRide?.rideState || null
  const isStarted    = rideState === RIDE_STATES.STARTED
  const isPaused     = rideState === RIDE_STATES.PAUSED
  const isActive     = isStarted || isPaused   // has an active ride at all
  const canStart     = !isActive
  const canPause     = isStarted
  const canResume    = isPaused
  const canEnd       = isActive
  const elapsedFmt   = formatElapsed(elapsed)

  return {
    // State
    activeRide, rideState, elapsed, elapsedFmt,
    isStarted, isPaused, isActive,
    canStart, canPause, canResume, canEnd,
    // Actions
    startRide, pauseRide, resumeRide, endRide, cancelRide,
    // GPS hook points (these are called BY the dashboard after GPS capture)
    // Usage: const ride = startRide(trip, driverId); onRideStart(ride)
    onRideStart:  (ride) => {/* GPS module will hook here */},
    onRidePause:  (ride) => {/* GPS module will hook here */},
    onRideResume: (ride) => {/* GPS module will hook here */},
    onRideEnd:    (ride) => {/* GPS module will hook here */},
  }
}