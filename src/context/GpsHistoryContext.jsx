// ─── GPS History Context ──────────────────────────────────────
// Thin wrapper around gpsSyncService. Provides fleet snapshots,
// KPI summary, settings, and today's distance to Fleet page.

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { gpsSyncService }        from '../services/gpsSyncService'
import { gpsHistoryRepository }  from '../repositories/gpsHistoryRepository'
import { gpsSettingsRepository } from '../repositories/gpsSettingsRepository'
import { useAuth }               from './AuthContext'

const GpsHistoryContext = createContext(null)

export function GpsHistoryProvider({ children }) {
  const { user } = useAuth()
  const [health,        setHealth]       = useState(() => gpsSyncService.getHealth())
  const [running,       setRunning]      = useState(false)
  const [snapshots,     setSnapshots]    = useState([])
  const [settings,      setSettings]     = useState(null)
  const [loading,       setLoading]      = useState(true)
  const [error,         setError]        = useState(null)
  const [todayDistance, setTodayDistance]= useState(0)

  // Subscribe to sync-service health updates
  useEffect(() => {
    const unsub = gpsSyncService.subscribe(({ health, running }) => {
      setHealth({ ...health }); setRunning(!!running)
    })
    return unsub
  }, [])

  // Initial load: settings + fleet snapshot + today's distance
  // Only fetch when user is authenticated
  useEffect(() => {
    if (!user) {
      // Clear data when user logs out
      setSettings(null)
      setSnapshots([])
      setTodayDistance(0)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        const [s, f, dist] = await Promise.all([
          gpsSettingsRepository.getAsObject(),
          gpsHistoryRepository.getLatestForFleet(),
          gpsHistoryRepository.getTodayDistanceKm(),
        ])
        if (cancelled) return
        setSettings(s); setSnapshots(Array.isArray(f) ? f : []); setTodayDistance(dist)
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'Failed to load GPS data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [user])

  // Start polling; stop on unmount
  // Note: GPS sync service is now managed by BackgroundServiceManager
  // This useEffect is kept only for backward compatibility during transition
  useEffect(() => {
    return () => {
      // Do not stop gpsSyncService here - it's managed centrally
    }
  }, [])

  // Refresh fleet snapshot + distance every 15 s
  // Only refresh when user is authenticated
  useEffect(() => {
    if (!user) return

    const t = setInterval(async () => {
      try {
        const [f, dist] = await Promise.all([
          gpsHistoryRepository.getLatestForFleet(),
          gpsHistoryRepository.getTodayDistanceKm(),
        ])
        setSnapshots(Array.isArray(f) ? f : []); setTodayDistance(dist)
      } catch {
        // Silently ignore errors to prevent infinite error loops
        // Errors will be caught and displayed in the initial load
      }
    }, 15_000)
    return () => clearInterval(t)
  }, [user])

  const syncNow = useCallback(async () => {
    try {
      await gpsSyncService.syncNow()
      const [f, dist] = await Promise.all([
        gpsHistoryRepository.getLatestForFleet(),
        gpsHistoryRepository.getTodayDistanceKm(),
      ])
      setSnapshots(Array.isArray(f) ? f : []); setTodayDistance(dist)
      return { ok: true }
    } catch (err) { return { ok: false, error: err?.message ?? 'Sync failed' } }
  }, [])

  const healthCheck    = useCallback(() => gpsSyncService.healthCheck(), [])
  const reloadSettings = useCallback(async () => {
    const s = await gpsSettingsRepository.getAsObject(); setSettings(s); return s
  }, [])

  return (
    <GpsHistoryContext.Provider value={{
      health, running, snapshots, settings, loading, error, todayDistance,
      syncNow, healthCheck, reloadSettings,
    }}>
      {children}
    </GpsHistoryContext.Provider>
  )
}

export function useGpsHistory() {
  const ctx = useContext(GpsHistoryContext)
  if (!ctx) throw new Error('useGpsHistory must be used within GpsHistoryProvider')
  return { ...ctx, fleet: computeFleetSummary(ctx.snapshots, ctx.todayDistance) }
}

function computeFleetSummary(snapshots = [], todayDistance = 0) {
  let total = snapshots.length
  let online = 0, moving = 0, stopped = 0, offline = 0
  let gpsOn = 0, gpsOff = 0, ignitionOn = 0, ignitionOff = 0
  let speedSum = 0, speedCount = 0, lastSync = null

  for (const s of snapshots) {
    const ts = s.timestamp ? new Date(s.timestamp).getTime() : 0
    const isRecent = ts && (Date.now() - ts) < 5 * 60_000

    // GPS online — use explicit boolean (null = legacy, excluded from counts)
    if (s.gps_online === true)  gpsOn++
    else if (s.gps_online === false) gpsOff++

    if (s.ignition === true)  ignitionOn++
    else if (s.ignition === false) ignitionOff++

    if (isRecent) {
      online++
      const speed = Number(s.speed_kmh ?? 0)
      if (speed > 0) { moving++; speedSum += speed; speedCount++ } else stopped++
    } else offline++

    if (ts && (!lastSync || ts > lastSync)) lastSync = ts
  }

  return {
    total, online, moving, stopped, offline,
    gpsOn, gpsOff, ignitionOn, ignitionOff,
    avgSpeed: speedCount ? Math.round(speedSum / speedCount) : 0,
    todayDistance,
    lastSync: lastSync ? new Date(lastSync).toISOString() : null,
  }
}
