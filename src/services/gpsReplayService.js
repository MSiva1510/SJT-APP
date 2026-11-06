// ─── GPS Replay Service ───────────────────────────────────────
// Day 33: Processes raw GPS tracks into replay-ready data.
// Called by RouteReplay page. Never calls the provider directly.
//
// Responsibilities:
//   - Stop/idle detection
//   - Route segmentation (moving | idle | stopped)
//   - Trip statistics computation
//   - In-memory cache (one load per vehicle+range, zero re-fetches)

import { distanceBetween } from '../utils/locationUtils'

// ─── Constants ────────────────────────────────────────────────
export const SPEED_THRESHOLD_KMH   = 5   // ≤ 5 = stopped/idle
export const MIN_STOP_DURATION_SEC = 90  // ignore micro-pauses < 90s

// Replay speeds: multiplier → interval between points in ms
export const REPLAY_SPEEDS = [
  { label: '1×',  value: 1  },
  { label: '2×',  value: 2  },
  { label: '5×',  value: 5  },
  { label: '10×', value: 10 },
]
export const REPLAY_INTERVAL_MS = 800   // base interval at 1× speed

// ─── In-memory cache (cleared when vehicleId or range changes) ─
const _cache = new Map()
function _cacheKey(vehicleId, since, until) { return `${vehicleId}|${since ?? ''}|${until ?? ''}` }

export function clearReplayCache() { _cache.clear() }

// ─── Main entry: process raw GPS points ──────────────────────
/**
 * @param {object[]} points  Raw rows from gpsHistoryRepository.getReplay()
 * @returns {{ segments, stops, stats, coloredPath }}
 */
export function processReplayData(points) {
  if (!points?.length) {
    return { segments: [], stops: [], stats: emptyStats(), coloredPath: [] }
  }

  const segments    = buildSegments(points)
  const stops       = detectStops(points)
  const stats       = computeStats(points, segments, stops)
  const coloredPath = buildColoredPath(segments)

  return { segments, stops, stats, coloredPath }
}

// ─── Segment builder ─────────────────────────────────────────
function buildSegments(points) {
  const segments = []
  let current = null

  for (const p of points) {
    const speed = Number(p.speed_kmh ?? 0)
    const type  = speed > SPEED_THRESHOLD_KMH ? 'moving'
                : (p.ignition === true ? 'idle' : 'stopped')

    if (!current || current.type !== type) {
      if (current) _finalise(current)
      current = { type, points: [p] }
    } else {
      current.points.push(p)
    }
  }
  if (current) { _finalise(current); segments.push(current) }

  // Flush all completed segments (pushed in _finalise or end)
  return segments

  function _finalise(seg) {
    const last = seg.points[seg.points.length - 1]
    seg.startTs   = seg.points[0].timestamp
    seg.endTs     = last.timestamp
    seg.durationSec = Math.max(0,
      (new Date(last.timestamp) - new Date(seg.points[0].timestamp)) / 1000)
    seg.distance  = _segmentDistance(seg.points)
    seg.maxSpeed  = seg.points.reduce((m, p) => Math.max(m, Number(p.speed_kmh ?? 0)), 0)
    segments.push(seg)
  }
}

function _segmentDistance(points) {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += distanceBetween(
      points[i-1].latitude, points[i-1].longitude,
      points[i].latitude,   points[i].longitude
    )
  }
  return Math.round(d * 10) / 10
}

// ─── Stop detection ───────────────────────────────────────────
function detectStops(points) {
  const stops = []
  let stopStart = null
  let stopPts   = []

  for (const p of points) {
    const speed = Number(p.speed_kmh ?? 0)
    if (speed <= SPEED_THRESHOLD_KMH) {
      if (!stopStart) { stopStart = p; stopPts = [p] }
      else stopPts.push(p)
    } else {
      if (stopPts.length >= 2) {
        const last   = stopPts[stopPts.length - 1]
        const durSec = (new Date(last.timestamp) - new Date(stopStart.timestamp)) / 1000
        if (durSec >= MIN_STOP_DURATION_SEC) {
          stops.push({
            lat:        stopStart.latitude,
            lng:        stopStart.longitude,
            address:    stopStart.address ?? '',
            startTs:    stopStart.timestamp,
            endTs:      last.timestamp,
            durationSec: durSec,
            type:       stopStart.ignition === true ? 'idle' : 'parked',
            pointIndex: points.indexOf(stopStart),
          })
        }
      }
      stopStart = null; stopPts = []
    }
  }
  // Handle trailing stop
  if (stopPts.length >= 2) {
    const last   = stopPts[stopPts.length - 1]
    const durSec = (new Date(last.timestamp) - new Date(stopStart.timestamp)) / 1000
    if (durSec >= MIN_STOP_DURATION_SEC) {
      stops.push({
        lat: stopStart.latitude, lng: stopStart.longitude,
        address: stopStart.address ?? '',
        startTs: stopStart.timestamp, endTs: last.timestamp,
        durationSec: durSec,
        type: stopStart.ignition === true ? 'idle' : 'parked',
        pointIndex: points.indexOf(stopStart),
      })
    }
  }
  return stops
}

// ─── Trip statistics ──────────────────────────────────────────
function computeStats(points, segments, stops) {
  if (!points.length) return emptyStats()

  const first = points[0]
  const last  = points[points.length - 1]

  const totalDurationSec = Math.max(0,
    (new Date(last.timestamp) - new Date(first.timestamp)) / 1000)

  const movingSegs = segments.filter(s => s.type === 'moving')
  const totalDistance = movingSegs.reduce((s, seg) => s + (seg.distance ?? 0), 0)
  const totalMovingSec= movingSegs.reduce((s, seg) => s + (seg.durationSec ?? 0), 0)
  const idleSec = segments.filter(s => s.type === 'idle').reduce((s, seg) => s + (seg.durationSec ?? 0), 0)

  const speeds    = points.map(p => Number(p.speed_kmh ?? 0)).filter(v => v > 0)
  const avgSpeed  = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0
  const maxSpeed  = speeds.length ? Math.round(Math.max(...speeds)) : 0

  return {
    startTs:         first.timestamp,
    endTs:           last.timestamp,
    durationSec:     totalDurationSec,
    totalDistanceKm: Math.round(totalDistance * 10) / 10,
    avgSpeedKmh:     avgSpeed,
    maxSpeedKmh:     maxSpeed,
    stopCount:       stops.length,
    idleTimeSec:     Math.round(idleSec),
    movingTimeSec:   Math.round(totalMovingSec),
    pointCount:      points.length,
  }
}

function emptyStats() {
  return { startTs: null, endTs: null, durationSec: 0, totalDistanceKm: 0, avgSpeedKmh: 0, maxSpeedKmh: 0, stopCount: 0, idleTimeSec: 0, movingTimeSec: 0, pointCount: 0 }
}

// ─── Coloured path for Polyline rendering ─────────────────────
// Returns [{ positions: [[lat,lng],...], color, type }]
export function buildColoredPath(segments) {
  const COLORS = { moving: '#10b981', idle: '#f59e0b', stopped: '#94a3b8' }
  return segments.map(seg => ({
    positions: seg.points.map(p => [p.latitude, p.longitude]),
    color:     COLORS[seg.type] ?? COLORS.stopped,
    type:      seg.type,
  }))
}

// ─── Helpers ─────────────────────────────────────────────────
export function formatDuration(sec) {
  if (!sec || sec < 0) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2,'0')}s`
  return `${s}s`
}

export function formatTs(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}
