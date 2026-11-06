// ─── Background Service Manager ─────────────────────────────────────
// Centralized manager for starting/stopping background services during auth state changes

import { gpsSyncService } from './gpsSyncService'
import { scheduler } from '../communication/Scheduler'
import { sessionManager } from '../security/SessionManager'

class BackgroundServiceManagerImpl {
  constructor() {
    this._gpsStarted = false
    this._schedulerJobs = []
  }

  // Start all background services (called when user authenticates)
  startAll() {
    this.startGpsSync()
    this.startScheduler()
    // Note: sessionManager is started elsewhere (on login)
  }

  // Stop all background services (called when user logs out)
  stopAll() {
    this.stopGpsSync()
    this.stopScheduler()
    // Note: sessionManager is ended elsewhere (in logout)
  }

  // GPS Sync Service
  startGpsSync() {
    if (!this._gpsStarted) {
      gpsSyncService.start()
      this._gpsStarted = true
    }
  }

  stopGpsSync() {
    if (this._gpsStarted) {
      gpsSyncService.stop()
      this._gpsStarted = false
    }
  }

  // Scheduler (for recurring notifications)
  startScheduler() {
    // The scheduler is always running, but we can track jobs started during this session
    // For now, we'll just note that scheduler is active
    // In a more complex implementation, we might want to stop all scheduler jobs
    // But since scheduler jobs are meant to persist (like daily summaries),
    // we should only stop jobs that are tied to user session
    // For simplicity, we'll leave scheduler running as it's designed to persist
  }

  stopScheduler() {
    // Cancel all scheduler jobs that were started during this user session
    // In a real implementation, we'd track which jobs belong to which user
    // For now, we'll leave scheduler running as it's designed to persist system-wide
    // jobs like daily summaries, expiry reminders, etc.
  }

  // Clear all scheduler jobs (use with caution)
  clearAllSchedulerJobs() {
    const jobs = scheduler.getJobs()
    jobs.forEach(job => {
      scheduler.cancel(job.id)
    })
  }
}

export const backgroundServiceManager = new BackgroundServiceManagerImpl()