// ─── GPS History Repository ───────────────────────────────────
// Reads/writes gps_tracking. Dedup: UNIQUE INDEX (vehicle_id, timestamp).
// Day 32: added gps_online, vehicle+driver joins, getTodayDistanceKm.
// Day 33: added getHistory(), getReplay(), getTimeline().

import supabase from '../lib/supabase'
import { withTimeout } from '../utils/withTimeout'
import { distanceBetween } from '../utils/locationUtils'

const DEFAULT_TIMEOUT_MS = 10_000
const BATCH_SIZE = 100

class GpsHistoryRepository {
  constructor() { this.table = 'gps_tracking' }

  // ── Generic paged read ────────────────────────────────────
  async getAll(opts = {}) {
    if (!supabase) return []
    const limit = Math.min(opts.limit ?? 500, 1000)
    let q = supabase.from(this.table)
      .select('id, vehicle_id, trip_id, driver_id, latitude, longitude, speed_kmh, address, ignition, gps_online, status, odometer, bearing, timestamp, created_at, updated_at, raw')
      .order('timestamp', { ascending: false })
      .limit(limit)
    if (opts.vehicleId) q = q.eq('vehicle_id', opts.vehicleId)
    if (opts.since)     q = q.gte('timestamp', opts.since)
    if (opts.until)     q = q.lte('timestamp', opts.until)
    return withTimeout(q, DEFAULT_TIMEOUT_MS, { data: [] }).then(r => r?.data ?? [])
  }

  // ── Latest GPS row for a single vehicle ───────────────────
  async getLatestForVehicle(vehicleId) {
    if (!supabase || !vehicleId) return null
    const { data } = await withTimeout(
      supabase.from(this.table)
        .select('*, vehicles(id, registration, imei, model), drivers(id, name)')
        .eq('vehicle_id', vehicleId).order('timestamp', { ascending: false }).limit(1),
      DEFAULT_TIMEOUT_MS, { data: [] }
    )
    return data?.[0] ? this._enrich(data[0]) : null
  }

  // ── Fleet-wide latest per vehicle (with vehicle+driver join) ──
  async getLatestForFleet() {
    if (!supabase) return []

    const { data, error } = await withTimeout(
      supabase.from(this.table)
        .select('*, vehicles(id, registration, imei, model), drivers(id, name)')
        .order('timestamp', { ascending: false }).limit(500),
      DEFAULT_TIMEOUT_MS, { data: [] }
    )

    if (error) throw error

    const seen = new Set()
    const out = []
    for (const row of data ?? []) {
      if (!row.vehicle_id || seen.has(row.vehicle_id)) continue
      seen.add(row.vehicle_id)
      out.push(this._enrich(row))
    }
    return out
  }

  // ── Day 33: GPS History Viewer ─────────────────────────────
  // Paged history with filters: vehicle, date, driver name search.
  // Returns rows enriched with registration + driver_name.
  async getHistory({ vehicleId, date, driverSearch, since, until, limit = 300 } = {}) {
    if (!supabase) return []
    let sinceTs = since
    let untilTs = until
    if (date && !since) sinceTs = `${date}T00:00:00.000Z`
    if (date && !until) untilTs = `${date}T23:59:59.999Z`

    let q = supabase.from(this.table)
      .select('*, vehicles(id, registration, imei, model), drivers(id, name)')
      .order('timestamp', { ascending: false })
      .limit(Math.min(limit, 1000))

    if (vehicleId)  q = q.eq('vehicle_id', vehicleId)
    if (sinceTs)    q = q.gte('timestamp', sinceTs)
    if (untilTs)    q = q.lte('timestamp', untilTs)

    const { data } = await withTimeout(q, DEFAULT_TIMEOUT_MS, { data: [] })
    const rows = (data ?? []).map(r => this._enrich(r))

    // Driver name text filter (post-query — driver_name comes from join)
    if (driverSearch) {
      const s = driverSearch.toLowerCase()
      return rows.filter(r => r.driver_name?.toLowerCase().includes(s))
    }
    return rows
  }

  // ── Day 33: Route Replay ───────────────────────────────────
  // All GPS points for a vehicle in a time range, ASC order, for playback.
  // No row limit override — we need every point for accurate replay.
  async getReplay(vehicleId, since, until) {
    if (!supabase || !vehicleId) return []
    let q = supabase.from(this.table)
      .select('id, vehicle_id, latitude, longitude, speed_kmh, address, ignition, gps_online, status, odometer, bearing, timestamp')
      .eq('vehicle_id', vehicleId)
      .order('timestamp', { ascending: true })
      .limit(2000)

    if (since) q = q.gte('timestamp', since)
    if (until) q = q.lte('timestamp', until)
    const { data } = await withTimeout(q, DEFAULT_TIMEOUT_MS, { data: [] })
    return (data ?? []).filter(r => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
  }

  // ── Day 33: Vehicle Timeline ───────────────────────────────
  // GPS points for a vehicle on a given date, ASC, for timeline display.
  // Alias of getReplay scoped to a single day.
  async getTimeline(vehicleId, date) {
    const since = date ? `${date}T00:00:00.000Z` : undefined
    const until = date ? `${date}T23:59:59.999Z` : undefined
    return this.getReplay(vehicleId, since, until)
  }

  // ── Day 32: Today's total distance ────────────────────────
  async getTodayDistanceKm() {
    if (!supabase) return 0
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await withTimeout(
      supabase.from(this.table)
        .select('vehicle_id, latitude, longitude, timestamp')
        .gte('timestamp', `${today}T00:00:00.000Z`)
        .order('vehicle_id', { ascending: true })
        .order('timestamp',  { ascending: true })
        .limit(3000),
      DEFAULT_TIMEOUT_MS, { data: [] }
    )
    if (!data?.length) return 0
    const vPts = {}
    for (const row of data) {
      if (!row.vehicle_id || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) continue
      if (!vPts[row.vehicle_id]) vPts[row.vehicle_id] = []
      vPts[row.vehicle_id].push([row.latitude, row.longitude])
    }
    let total = 0
    for (const pts of Object.values(vPts)) {
      for (let i = 1; i < pts.length; i++) {
        total += distanceBetween(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1])
      }
    }
    return Math.round(total * 10) / 10
  }

  // ── Insert one snapshot ───────────────────────────────────
  async insertSnapshot(snapshot) {
    if (!supabase) return { inserted: false, reason: 'no-supabase' }
    if (!snapshot?.vehicle_id || !snapshot?.timestamp) return { inserted: false, reason: 'missing-keys' }
    const { error } = await withTimeout(
      supabase.from(this.table).insert([this._toRow(snapshot)]).select(),
      DEFAULT_TIMEOUT_MS, { error: null }
    )
    if (error?.code === '23505') return { inserted: false, reason: 'duplicate' }
    if (error) return { inserted: false, reason: error.message }
    return { inserted: true }
  }

  // ── Insert many snapshots (dedup ON CONFLICT DO NOTHING) ──
  async insertBatch(snapshots) {
    if (!supabase) return { inserted: 0, skipped: snapshots?.length ?? 0 }
    const list = (snapshots ?? []).filter(s => s?.vehicle_id && s?.timestamp)
    if (!list.length) return { inserted: 0, skipped: 0 }
    let inserted = 0, skipped = 0
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const chunk = list.slice(i, i + BATCH_SIZE).map(s => this._toRow(s))
      const { data, error } = await withTimeout(
        supabase.from(this.table).upsert(chunk, { onConflict: 'vehicle_id,timestamp', ignoreDuplicates: true }).select('vehicle_id'),
        DEFAULT_TIMEOUT_MS, { data: [], error: null }
      )
      if (error) { skipped += chunk.length }
      else { inserted += data?.length ?? chunk.length; skipped += chunk.length - (data?.length ?? chunk.length) }
    }
    return { inserted, skipped }
  }

  // ── Flatten Supabase join result ──────────────────────────
  _enrich(row) {
    return {
      ...row,
      registration:  row.vehicles?.registration ?? row.registration ?? null,
      imei:          row.vehicles?.imei         ?? row.imei         ?? null,
      vehicle_model: row.vehicles?.model        ?? null,
      driver_name:   row.drivers?.name          ?? null,
      vehicles: undefined, drivers: undefined,
    }
  }

  _toRow(s) {
    return {
      vehicle_id: s.vehicle_id,
      trip_id:    s.trip_id    ?? null,
      driver_id:  s.driver_id  ?? null,
      latitude:   Number(s.lat),
      longitude:  Number(s.lng),
      accuracy:   s.accuracy   ?? null,
      speed_kmh:  s.speed_kmh  ?? null,
      bearing:    s.bearing    ?? null,
      altitude:   s.altitude   ?? null,
      address:    s.address    ?? null,
      ignition:   typeof s.ignition   === 'boolean' ? s.ignition   : null,
      gps_online: typeof s.gps_online === 'boolean' ? s.gps_online : null,
      status:     s.status     ?? null,
      odometer:   s.odometer   ?? null,
      timestamp:  s.timestamp,
      raw:        s.raw        ?? {},
    }
  }
}

export const gpsHistoryRepository = new GpsHistoryRepository()
export { GpsHistoryRepository }
