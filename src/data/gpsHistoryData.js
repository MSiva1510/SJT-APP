// ─── GPS History Data — Supabase gps_tracking + trip_routes ───
// gps_tracking: id, trip_id, driver_id, latitude, longitude,
//               accuracy, speed_kmh, bearing, altitude, timestamp
// trip_routes:  id, booking_id, route_data (jsonb), created_at, updated_at

import supabase from '../lib/supabase'

const GPS_ROUTE_KEY = 'sjt_gps_route'
const routeKey = tripId => `${GPS_ROUTE_KEY}:${tripId}`

function normalizePoint(point = {}) {
  return {
    lat: Number(point.lat ?? point.latitude ?? 0),
    lng: Number(point.lng ?? point.longitude ?? 0),
    area: point.area ?? null,
    accuracy: point.accuracy ?? null,
    speed: Number(point.speed ?? point.speed_kmh ?? 0),
    bearing: Number(point.bearing ?? 0),
    altitude: point.altitude ?? null,
    ts: point.ts ?? point.timestamp ?? new Date().toISOString(),
  }
}

function loadLocalRoute(tripId) {
  if (!tripId) return []
  try {
    const raw = localStorage.getItem(routeKey(tripId))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalRoute(tripId, points) {
  try {
    localStorage.setItem(routeKey(tripId), JSON.stringify(points.slice(-1000)))
  } catch {}
}

// Load GPS track for a trip from the local live route buffer.
// Supabase writes are async, while the UI expects this helper to be synchronous.
export function loadTripRoute(tripId) {
  return loadLocalRoute(tripId)
}

// Get most recent GPS point for a trip
export function getLatestRoutePoint(tripId) {
  const points = loadLocalRoute(tripId)
  return points.length ? points[points.length - 1] : null
}

// Save a single GPS point
export function saveRoutePoint(tripIdOrPoint, pointArg = {}) {
  const tripId = typeof tripIdOrPoint === 'object' ? tripIdOrPoint.tripId : tripIdOrPoint
  const point = typeof tripIdOrPoint === 'object' ? tripIdOrPoint : pointArg
  const { lat, lng, accuracy, speed, bearing, altitude, driverId } = point
  if (!tripId || !lat || !lng) return

  const route = loadLocalRoute(tripId)
  route.push(normalizePoint(point))
  saveLocalRoute(tripId, route)

  if (!supabase || !tripId || !lat || !lng) return
  try {
    supabase.from('gps_tracking').insert([{
      trip_id:    tripId,
      driver_id:  driverId   || null,
      latitude:   lat,
      longitude:  lng,
      accuracy:   accuracy   || null,
      speed_kmh:  speed      || null,
      bearing:    bearing    || null,
      altitude:   altitude   || null,
      timestamp:  new Date().toISOString(),
    }])
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[GPS] save failed:', err.message)
  }
}

export function clearTripRoute(tripId) {
  if (!tripId) return
  try { localStorage.removeItem(routeKey(tripId)) } catch {}
}

export function buildRouteHistoryEntry({
  tripId,
  customer,
  driver,
  startCoord,
  endCoord,
  startTime,
  endTime,
  duration,
} = {}) {
  const routePoints = loadLocalRoute(tripId)
  return {
    tripId,
    customer,
    driver,
    startCoord,
    endCoord,
    startTime,
    endTime,
    duration,
    routePoints: routePoints.length,
    distanceKm: calcRouteDistanceKm(routePoints),
  }
}

export function startRouteRecording(tripId, getCurrentPoint, intervalMs = 30000) {
  if (!tripId || typeof getCurrentPoint !== 'function') return () => {}

  let cancelled = false
  const record = async () => {
    if (cancelled) return
    const point = await getCurrentPoint()
    if (point?.lat && point?.lng) saveRoutePoint(tripId, point)
  }

  record()
  const timer = setInterval(record, intervalMs)
  return () => {
    cancelled = true
    clearInterval(timer)
  }
}

// Calculate route distance in km from array of {lat, lng} points
export function calcRouteDistanceKm(points = []) {
  if (typeof points === 'string') points = loadLocalRoute(points)
  if (!Array.isArray(points) || points.length < 2) return 0
  let dist = 0
  for (let i = 1; i < points.length; i++) {
    const { lat: lat1, lng: lon1 } = points[i - 1]
    const { lat: lat2, lng: lon2 } = points[i]
    if (!lat1 || !lon1 || !lat2 || !lon2) continue
    const R    = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLon / 2) ** 2
    dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
  return Math.round(dist * 10) / 10
}
