// ─── KingsTrack Provider Adapter ──────────────────────────────
// GPS: 'A' = Active/Valid fix, 'V' = Void/No fix
// Mock: VITE_GPS_MOCK=true bypasses network for dev/CI

import { withTimeout } from '../../utils/withTimeout'

const DEFAULT_URL = 'https://mvt.apmkingstrack.com/fleettracking/api/live/json'
const GPS_PROXY_PATH = '/api/gps-proxy'

const MOCK_VEHICLES = [
  { Vehicle: 'TN-32-AQ-1234', Latitude: 11.9416, Longitude: 79.8083, Address: 'Puducherry Bypass', Speed: 42, Timestamp: new Date().toISOString(), GPS: 'A', Ignition: 'ON',  Status: 'Moving',  Odometer: 54321.5, IMEI: '352093081234567' },
  { Vehicle: 'TN-32-BH-5678', Latitude: 11.9350, Longitude: 79.8290, Address: 'White Town',        Speed: 0,  Timestamp: new Date().toISOString(), GPS: 'A', Ignition: 'OFF', Status: 'Stopped', Odometer: 98765.0, IMEI: '352093085678901' },
  { Vehicle: 'TN-32-CR-9012', Latitude: 11.9600, Longitude: 79.8400, Address: 'Auroville Main Rd', Speed: 18, Timestamp: new Date().toISOString(), GPS: 'V', Ignition: 'ON',  Status: 'Idle',    Odometer: 12345.6, IMEI: '352093089012345' },
]

function readValue(record, keys) {
  for (const key of keys) {
    if (record?.[key] !== undefined && record?.[key] !== null && record?.[key] !== '') return record[key]
  }
  return undefined
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value ?? '').trim().toUpperCase()
  if (['1', 'TRUE', 'YES', 'ON', 'A', 'ACTIVE', 'VALID'].includes(text)) return true
  if (['0', 'FALSE', 'NO', 'OFF', 'V', 'VOID', 'INACTIVE'].includes(text)) return false
  return fallback
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function createKingsTrackProvider(settings = {}) {
  const baseUrl = settings.api_url || DEFAULT_URL
  const timeout = Number(settings.timeout ?? 30) * 1000
  const isMock  = import.meta.env.VITE_GPS_MOCK === 'true'
  const useProxy = settings.use_proxy !== false

  function normalizeResponse(raw) {
    const list = Array.isArray(raw) ? raw
                : Array.isArray(raw?.data) ? raw.data
                : Array.isArray(raw?.vehicles) ? raw.vehicles
                : []
    return list.map(v => {
      const lat = toNumber(readValue(v, ['Latitude', 'latitude', 'lat']), NaN)
      const lng = toNumber(readValue(v, ['Longitude', 'longitude', 'lng']), NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

      const tsRaw = readValue(v, ['Timestamp', 'timestamp', 'ts', 'time']) ?? new Date().toISOString()
      const ts = new Date(tsRaw)
      const isoTs = Number.isFinite(ts.getTime()) ? ts.toISOString() : new Date().toISOString()

      const gpsText = String(readValue(v, ['GPS', 'gps', 'Gps']) ?? '').trim().toUpperCase()
      const ignitionText = String(readValue(v, ['Ignition', 'ignition']) ?? '').trim().toUpperCase()
      const statusText = String(readValue(v, ['Status', 'status']) ?? '').trim().toLowerCase()

      return {
        imei:         readValue(v, ['IMEI', 'imei', 'DeviceIMEI', 'imei_no']) ?? '',
        registration: readValue(v, ['Vehicle', 'registration', 'plate_no', 'plateNo', 'vehicle_no']) ?? '',
        lat,
        lng,
        address:      readValue(v, ['Address', 'address']) ?? '',
        speed_kmh:    toNumber(readValue(v, ['Speed', 'speed']), 0),
        ignition:     toBoolean(ignitionText, false),
        gps_online:   toBoolean(gpsText, false),
        status:       statusText,
        odometer:     toNumber(readValue(v, ['Odometer', 'odometer']), 0),
        timestamp:    isoTs,
        _epoch:       Math.floor(ts.getTime() / 60000) * 60000,
        _raw:         v,
      }
    }).filter(Boolean)
  }

  async function fetchFleet() {
    if (isMock) return { ok: true, mock: true, snapshots: normalizeResponse(MOCK_VEHICLES), raw: MOCK_VEHICLES }
    try {
      const body = { company_id: settings.company_id ?? '', user_id: settings.user_id ?? '' }
      const res = await requestGps(baseUrl, body, timeout, useProxy)
      if (!res) return { ok: false, error: 'timeout', snapshots: [] }
      if (!res.ok) return { ok: false, error: await readErrorResponse(res), snapshots: [] }
      const raw = await res.json().catch(() => null)
      if (!raw) return { ok: false, error: 'Invalid JSON', snapshots: [] }
      return { ok: true, raw, snapshots: normalizeResponse(raw) }
    } catch (err) {
      return { ok: false, error: err?.message ?? 'Network error', snapshots: [] }
    }
  }

  async function healthCheck() {
    if (isMock) return { ok: true, latencyMs: 1, mock: true }
    const t0 = performance.now()
    try {
      const body = { company_id: settings.company_id ?? '', user_id: settings.user_id ?? '' }
      const res = await requestGps(baseUrl, body, Math.min(timeout, 5000), useProxy)
      const latencyMs = Math.round(performance.now() - t0)
      if (!res) return { ok: false, latencyMs, error: 'timeout' }
      if (!res.ok) return { ok: false, latencyMs, error: await readErrorResponse(res) }
      return { ok: true, latencyMs }
    } catch (err) {
      return { ok: false, latencyMs: Math.round(performance.now() - t0), error: err?.message ?? 'Network error' }
    }
  }

  return { name: 'kingstrack', fetchFleet, healthCheck, normalizeResponse }
}

async function requestGps(targetUrl, body, timeout, useProxy) {
  const method = String(body.api_method || 'GET').toUpperCase()
  const first = await sendGpsRequest(targetUrl, body, timeout, useProxy, method)
  if (first?.status !== 405 || method === 'POST') return first
  return sendGpsRequest(targetUrl, body, timeout, useProxy, 'POST')
}

function sendGpsRequest(targetUrl, body, timeout, useProxy, vendorMethod) {
  const requestBody = useProxy
    ? { target_url: targetUrl, vendor_method: vendorMethod, ...body }
    : body
  const url = useProxy
    ? GPS_PROXY_PATH
    : vendorMethod === 'GET'
      ? withQueryParams(targetUrl, body)
      : targetUrl

  const isPost = vendorMethod === 'POST'
  const headers = useProxy
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': isPost ? 'application/x-www-form-urlencoded' : 'application/json' }
  const payload = useProxy
    ? JSON.stringify(requestBody)
    : vendorMethod === 'GET'
      ? undefined
      : new URLSearchParams(requestBody).toString()

  return withTimeout(
    fetch(url, {
      method: useProxy ? 'POST' : vendorMethod,
      headers,
      body: payload,
    }),
    timeout,
    null
  )
}

function withQueryParams(targetUrl, body) {
  const url = new URL(targetUrl)
  for (const [key, value] of Object.entries(body)) {
    if (value == null || value === '') continue
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function readErrorResponse(res) {
  const fallback = `HTTP ${res?.status ?? 'error'}`
  try {
    const text = await res.text()
    if (!text) return fallback
    try {
      const json = JSON.parse(text)
      return json.error || json.message || json.status || fallback
    } catch {
      return text.length > 160 ? `${text.slice(0, 157)}...` : text
    }
  } catch {
    return fallback
  }
}
