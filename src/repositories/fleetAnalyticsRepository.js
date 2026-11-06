// ─── Fleet Analytics Repository ────────────────────────────────
// Day 36: Aggregates analytics from EXISTING Supabase tables only.
// Tables used (all confirmed in live DB):
//   bookings, drivers, vehicles, attendance, gps_tracking,
//   vehicle_status, driver_status
// Tables with localStorage fallback (not in Supabase):
//   fleet_alerts, geofence_zones, geofence_events
// Never queries Supabase for tables that don't exist there.

import supabase                             from '../lib/supabase'
import { vehicleRepository }               from './vehicleRepository'
import { driverRepository }                from './driverRepository'
import { gpsHistoryRepository }            from './gpsHistoryRepository'
import { fleetAlertRepository }            from './fleetAlertRepository'
import { loadVehicles }                    from '../data/vehicleData'
import { loadDrivers }                     from '../data/driverData'
import { geofenceZoneRepository, geofenceEventRepository } from './geofenceRepository'
import { distanceBetween }                 from '../utils/locationUtils'
import { withTimeout }                     from '../utils/withTimeout'

const TIMEOUT = 12_000

// ── Date helpers ──────────────────────────────────────────────
export function todayISO()     { return new Date().toISOString().slice(0, 10) }
export function monthStartISO(){ const d = new Date(); d.setDate(1); return d.toISOString().slice(0,10) }
export function weekStartISO() {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0,10)
}
export function rangeForPreset(preset, customFrom, customTo) {
  const today = todayISO()
  switch (preset) {
    case 'today':     return { since: today, until: today }
    case 'yesterday': { const d = new Date(); d.setDate(d.getDate()-1); const s = d.toISOString().slice(0,10); return { since: s, until: s } }
    case 'week':      return { since: weekStartISO(), until: today }
    case 'month':     return { since: monthStartISO(), until: today }
    case 'quarter': { const d = new Date(); d.setMonth(d.getMonth()-3); return { since: d.toISOString().slice(0,10), until: today } }
    case 'custom':    return { since: customFrom ?? today, until: customTo ?? today }
    default:          return { since: today, until: today }
  }
}

// ── Haversine helper ──────────────────────────────────────────
function _computeTrackDistance(rows) {
  if (!rows?.length) return 0
  const byVehicle = {}
  for (const r of rows) {
    if (!r.vehicle_id || !Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue
    if (!byVehicle[r.vehicle_id]) byVehicle[r.vehicle_id] = []
    byVehicle[r.vehicle_id].push(r)
  }
  let total = 0
  for (const pts of Object.values(byVehicle)) {
    const sorted = pts.slice().sort((a,b) => new Date(a.timestamp)-new Date(b.timestamp))
    for (let i = 1; i < sorted.length; i++) {
      total += distanceBetween(sorted[i-1].latitude, sorted[i-1].longitude, sorted[i].latitude, sorted[i].longitude)
    }
  }
  return Math.round(total * 10) / 10
}

// ── GPS stats helper (speed, idle time) ──────────────────────
function _computeGpsStats(rows) {
  let speedSum = 0, speedCount = 0, maxSpeed = 0
  let idleMinutes = 0, movingMinutes = 0
  for (const r of rows) {
    const spd = Number(r.speed_kmh ?? 0)
    if (spd > 0) { speedSum += spd; speedCount++; if (spd > maxSpeed) maxSpeed = spd }
    // Each GPS row ~ 1-minute interval
    if (r.ignition === true && spd <= 5) idleMinutes++
    if (spd > 5) movingMinutes++
  }
  return {
    avgSpeed:     speedCount ? Math.round(speedSum / speedCount) : 0,
    maxSpeed:     Math.round(maxSpeed),
    idleMinutes,
    movingMinutes,
  }
}

class FleetAnalyticsRepository {

  // ── 1. Fleet KPI Summary ─────────────────────────────────
  async getFleetSummary({ since, until } = {}) {
    const today = todayISO()
    const sinceTs = since ? `${since}T00:00:00.000Z` : `${today}T00:00:00.000Z`
    const untilTs = until ? `${until}T23:59:59.999Z` : `${today}T23:59:59.999Z`

    const [vehicles, drivers, snapshots] = await Promise.all([
      loadVehicles().catch(() => []),
      loadDrivers().catch(() => []),
      gpsHistoryRepository.getLatestForFleet().catch(() => []),
    ])

    // Online/offline from latest snapshots
    const now = Date.now()
    const vehiclesOnline  = snapshots.filter(s => s.timestamp && (now - new Date(s.timestamp).getTime()) < 5*60_000).length
    const vehiclesOffline = vehicles.length - vehiclesOnline

    // Drivers active from attendance
    let driversActive = 0
    if (supabase) {
      const { data: att } = await withTimeout(
        supabase.from('attendance').select('id').eq('attendance_date', today).eq('status', 'present'),
        TIMEOUT, { data: [] }
      )
      driversActive = att?.length ?? 0
    }

    // Trips in date range from bookings
    let tripsToday = 0, tripsCompleted = 0, tripsRunning = 0, tripsCancelled = 0
    if (supabase) {
      const { data: trips } = await withTimeout(
        supabase.from('bookings').select('id, status').gte('start_date', since ?? today).lte('start_date', until ?? today),
        TIMEOUT, { data: [] }
      )
      const t = trips ?? []
      tripsToday     = t.length
      tripsCompleted = t.filter(x => x.status === 'completed').length
      tripsRunning   = t.filter(x => ['started','in_progress','assigned'].includes(x.status)).length
      tripsCancelled = t.filter(x => x.status === 'cancelled').length
    }

    // GPS stats for today
    let distanceToday = 0, gpsStats = { avgSpeed: 0, maxSpeed: 0, idleMinutes: 0, movingMinutes: 0 }
    if (supabase) {
      const [trackRows, todayDist] = await Promise.all([
        withTimeout(
          supabase.from('gps_tracking').select('vehicle_id, latitude, longitude, speed_kmh, ignition, timestamp')
            .gte('timestamp', sinceTs).lte('timestamp', untilTs).limit(3000),
          TIMEOUT, { data: [] }
        ),
        gpsHistoryRepository.getTodayDistanceKm().catch(() => 0),
      ])
      distanceToday = todayDist
      gpsStats = _computeGpsStats(trackRows?.data ?? [])
    }

    // Alerts (localStorage fallback — fleet_alerts not in Supabase)
    let alertsToday = 0
    try {
      const alerts = await fleetAlertRepository.getAll({ since: sinceTs, until: untilTs })
      alertsToday = alerts?.length ?? 0
    } catch {}

    return {
      vehiclesTotal:   vehicles.length,
      vehiclesOnline,
      vehiclesOffline,
      driversTotal:    drivers.length,
      driversActive,
      tripsToday,
      tripsCompleted,
      tripsRunning,
      tripsCancelled,
      distanceToday,
      avgSpeed:        gpsStats.avgSpeed,
      maxSpeed:        gpsStats.maxSpeed,
      idleMinutes:     gpsStats.idleMinutes,
      movingMinutes:   gpsStats.movingMinutes,
      alertsToday,
    }
  }

  // ── 2. Per-vehicle analytics ──────────────────────────────
  async getVehicleSummary({ since, until } = {}, vehicleId = null) {
    const today = todayISO()
    const sinceTs = since ? `${since}T00:00:00.000Z` : `${today}T00:00:00.000Z`
    const untilTs = until ? `${until}T23:59:59.999Z` : `${today}T23:59:59.999Z`

    const vehicles = await loadVehicles().catch(() => [])
    if (!supabase) return vehicles.map(v => ({ ...v, trips: 0, distanceKm: 0, avgSpeed: 0, maxSpeed: 0, movingHours: 0, idleHours: 0 }))

    // Trips per vehicle from bookings
    let tripsQ = supabase.from('bookings').select('id, vehicle_id, status, total_km, start_date')
      .gte('start_date', since ?? today).lte('start_date', until ?? today)
    if (vehicleId) tripsQ = tripsQ.eq('vehicle_id', vehicleId)
    const { data: allTrips } = await withTimeout(tripsQ, TIMEOUT, { data: [] })

    // GPS data per vehicle
    let gpsQ = supabase.from('gps_tracking')
      .select('vehicle_id, latitude, longitude, speed_kmh, ignition, timestamp')
      .gte('timestamp', sinceTs).lte('timestamp', untilTs).limit(5000)
    if (vehicleId) gpsQ = gpsQ.eq('vehicle_id', vehicleId)
    const { data: gpsRows } = await withTimeout(gpsQ, TIMEOUT, { data: [] })

    return vehicles
      .filter(v => !vehicleId || v.id === vehicleId)
      .map(v => {
        const vTrips = (allTrips ?? []).filter(t => t.vehicle_id === v.id)
        const vGps   = (gpsRows   ?? []).filter(g => g.vehicle_id === v.id)
        const stats  = _computeGpsStats(vGps)
        const distKm = _computeTrackDistance(vGps)
        return {
          id:           v.id,
          registration: v.registration,
          vehicleType:  v.vehicle_type,
          model:        v.model,
          status:       v.status,
          trips:        vTrips.length,
          tripsCompleted: vTrips.filter(t => t.status === 'completed').length,
          distanceKm:   distKm,
          avgSpeed:     stats.avgSpeed,
          maxSpeed:     stats.maxSpeed,
          movingHours:  Math.round(stats.movingMinutes / 60 * 10) / 10,
          idleHours:    Math.round(stats.idleMinutes / 60 * 10) / 10,
        }
      })
      .sort((a, b) => b.trips - a.trips)
  }

  // ── 3. Per-driver analytics ────────────────────────────────
  async getDriverSummary({ since, until } = {}, driverId = null) {
    const today = todayISO()
    const sinceTs = since ? `${since}T00:00:00.000Z` : `${today}T00:00:00.000Z`
    const untilTs = until ? `${until}T23:59:59.999Z` : `${today}T23:59:59.999Z`

    const drivers = await loadDrivers().catch(() => [])
    if (!supabase) return drivers.map(d => ({ ...d, trips: 0, distanceKm: 0, drivingHours: 0, attendance: 0, avgSpeed: 0 }))

    // Trips per driver
    let tripsQ = supabase.from('bookings').select('id, driver_id, status, total_km, start_date')
      .gte('start_date', since ?? today).lte('start_date', until ?? today)
    if (driverId) tripsQ = tripsQ.eq('driver_id', driverId)
    const { data: allTrips } = await withTimeout(tripsQ, TIMEOUT, { data: [] })

    // Attendance per driver
    let attQ = supabase.from('attendance').select('driver_id, status')
      .gte('attendance_date', since ?? today).lte('attendance_date', until ?? today)
    if (driverId) attQ = attQ.eq('driver_id', driverId)
    const { data: attRows } = await withTimeout(attQ, TIMEOUT, { data: [] })

    // GPS per driver (via driver_id in gps_tracking)
    let gpsQ = supabase.from('gps_tracking')
      .select('driver_id, vehicle_id, latitude, longitude, speed_kmh, ignition, timestamp')
      .gte('timestamp', sinceTs).lte('timestamp', untilTs).limit(5000)
    if (driverId) gpsQ = gpsQ.eq('driver_id', driverId)
    const { data: gpsRows } = await withTimeout(gpsQ, TIMEOUT, { data: [] })

    return drivers
      .filter(d => !driverId || d.id === driverId)
      .map((d, rank) => {
        const dTrips  = (allTrips ?? []).filter(t => t.driver_id === d.id)
        const dAtt    = (attRows  ?? []).filter(a => a.driver_id === d.id)
        const dGps    = (gpsRows  ?? []).filter(g => g.driver_id === d.id)
        const stats   = _computeGpsStats(dGps)
        const distKm  = _computeTrackDistance(dGps)
        const present = dAtt.filter(a => a.status === 'present').length
        const totalDays = dAtt.length || 1
        return {
          id:           d.id,
          name:         d.name,
          phone:        d.phone,
          status:       d.status,
          rank:         rank + 1,
          trips:        dTrips.length,
          tripsCompleted: dTrips.filter(t => t.status === 'completed').length,
          distanceKm:   distKm,
          drivingHours: Math.round(stats.movingMinutes / 60 * 10) / 10,
          idleHours:    Math.round(stats.idleMinutes / 60 * 10) / 10,
          attendance:   Math.round((present / totalDays) * 100),
          avgSpeed:     stats.avgSpeed,
          maxSpeed:     stats.maxSpeed,
        }
      })
      .sort((a, b) => b.trips - a.trips)
      .map((d, i) => ({ ...d, rank: i + 1 }))
  }

  // ── 4. Trip analytics ──────────────────────────────────────
  async getTripSummary({ since, until } = {}) {
    const today = todayISO()
    if (!supabase) return { completed:0, running:0, cancelled:0, pending:0, avgDistanceKm:0, avgDurationDays:0, longestKm:0, shortestKm:0, byDay:[] }

    const { data: trips } = await withTimeout(
      supabase.from('bookings').select('id, status, total_km, start_date, end_date, created_at')
        .gte('start_date', since ?? today).lte('start_date', until ?? today)
        .order('start_date', { ascending: true }),
      TIMEOUT, { data: [] }
    )
    const t = trips ?? []
    const completed  = t.filter(x => x.status === 'completed')
    const running    = t.filter(x => ['started','in_progress','assigned'].includes(x.status)).length
    const cancelled  = t.filter(x => x.status === 'cancelled').length
    const pending    = t.filter(x => ['draft','confirmed','pending'].includes(x.status)).length

    const kms = completed.map(x => Number(x.total_km || 0)).filter(k => k > 0)
    const avgDistanceKm = kms.length ? Math.round(kms.reduce((a,b)=>a+b,0)/kms.length*10)/10 : 0
    const longestKm   = kms.length ? Math.max(...kms) : 0
    const shortestKm  = kms.length ? Math.min(...kms) : 0

    // Trip trend — group by day
    const dayMap = {}
    for (const trip of t) {
      const d = (trip.start_date ?? '').slice(0, 10)
      if (!d) continue
      if (!dayMap[d]) dayMap[d] = { date: d, total: 0, completed: 0, cancelled: 0 }
      dayMap[d].total++
      if (trip.status === 'completed') dayMap[d].completed++
      if (trip.status === 'cancelled') dayMap[d].cancelled++
    }
    const byDay = Object.values(dayMap).sort((a,b) => a.date.localeCompare(b.date))

    return {
      total:        t.length,
      completed:    completed.length,
      running,
      cancelled,
      pending,
      avgDistanceKm,
      longestKm:    Math.round(longestKm),
      shortestKm:   Math.round(shortestKm),
      byDay,
    }
  }

  // ── 5. Alert analytics (localStorage fallback) ─────────────
  async getAlertSummary({ since, until } = {}) {
    const empty = { total:0, critical:0, high:0, medium:0, low:0, open:0, resolved:0, overspeed:0, idle:0, offline:0, byType:[] }
    try {
      const alerts = await fleetAlertRepository.getAll({ since, until })
      const a = alerts ?? []
      const byTypeMap = {}
      for (const alert of a) {
        const t = alert.alert_type ?? alert.alertType ?? 'unknown'
        byTypeMap[t] = (byTypeMap[t] || 0) + 1
      }
      return {
        total:     a.length,
        critical:  a.filter(x => (x.priority ?? x.severity) === 'critical').length,
        high:      a.filter(x => (x.priority ?? x.severity) === 'high').length,
        medium:    a.filter(x => (x.priority ?? x.severity) === 'medium').length,
        low:       a.filter(x => (x.priority ?? x.severity) === 'low').length,
        open:      a.filter(x => ['open','acknowledged','in_progress'].includes(x.status)).length,
        resolved:  a.filter(x => ['resolved','closed'].includes(x.status)).length,
        overspeed: a.filter(x => (x.alert_type ?? x.alertType ?? '').includes('speed')).length,
        idle:      a.filter(x => (x.alert_type ?? x.alertType ?? '').includes('idle')).length,
        offline:   a.filter(x => (x.alert_type ?? x.alertType ?? '').includes('offline')).length,
        byType:    Object.entries(byTypeMap).map(([type, count]) => ({ type, count })).sort((a,b)=>b.count-a.count),
      }
    } catch { return empty }
  }

  // ── 6. Geofence analytics (localStorage fallback) ──────────
  async getGeofenceSummary() {
    const empty = { zones:0, totalEvents:0, entries:0, exits:0, topZones:[] }
    try {
      const [zones, events] = await Promise.all([
        geofenceZoneRepository.getZones().catch(() => []),
        geofenceEventRepository.getRecentEvents(500).catch(() => []),
      ])
      const z = zones ?? [], e = events ?? []
      const zoneMap = {}
      for (const ev of e) {
        const zid = ev.zoneId ?? ev.zone_id ?? ''
        if (!zoneMap[zid]) zoneMap[zid] = { zoneId: zid, entries:0, exits:0, total:0, name: ev.zoneName ?? zid }
        zoneMap[zid].total++
        if (ev.eventType === 'enter') zoneMap[zid].entries++
        if (ev.eventType === 'exit')  zoneMap[zid].exits++
      }
      const topZones = Object.values(zoneMap).sort((a,b)=>b.total-a.total).slice(0,5)
      return {
        zones:       z.length,
        totalEvents: e.length,
        entries:     e.filter(ev => ev.eventType === 'enter').length,
        exits:       e.filter(ev => ev.eventType === 'exit').length,
        topZones,
      }
    } catch { return empty }
  }

  // ── 7. Distance summary (for month chart) ─────────────────
  async getDistanceSummary({ since, until } = {}) {
    const today = todayISO()
    const sinceTs = since ? `${since}T00:00:00.000Z` : `${today}T00:00:00.000Z`
    const untilTs = until ? `${until}T23:59:59.999Z` : `${today}T23:59:59.999Z`
    if (!supabase) return { totalKm: 0, byVehicle: [], byDay: [] }

    const { data } = await withTimeout(
      supabase.from('gps_tracking')
        .select('vehicle_id, latitude, longitude, timestamp')
        .gte('timestamp', sinceTs).lte('timestamp', untilTs)
        .order('vehicle_id').order('timestamp')
        .limit(5000),
      TIMEOUT, { data: [] }
    )
    const rows = (data ?? []).filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    const totalKm = _computeTrackDistance(rows)

    // Group by day
    const dayKm = {}
    const dayRows = {}
    for (const r of rows) {
      const day = (r.timestamp ?? '').slice(0, 10)
      if (!day) continue
      if (!dayRows[day]) dayRows[day] = []
      dayRows[day].push(r)
    }
    const byDay = Object.entries(dayRows).map(([date, pts]) => ({
      date,
      km: _computeTrackDistance(pts),
    })).sort((a,b)=>a.date.localeCompare(b.date))

    // Group by vehicle
    const vehicles = await loadVehicles().catch(() => [])
    const vMap = Object.fromEntries(vehicles.map(v=>[v.id, v.registration]))
    const vRows = {}
    for (const r of rows) {
      if (!r.vehicle_id) continue
      if (!vRows[r.vehicle_id]) vRows[r.vehicle_id] = []
      vRows[r.vehicle_id].push(r)
    }
    const byVehicle = Object.entries(vRows).map(([vid, pts]) => ({
      vehicleId:    vid,
      registration: vMap[vid] ?? vid.slice(0,8),
      km:           _computeTrackDistance(pts),
    })).sort((a,b)=>b.km-a.km).slice(0,10)

    return { totalKm, byDay, byVehicle }
  }
}

export const fleetAnalyticsRepository = new FleetAnalyticsRepository()
export { FleetAnalyticsRepository }
