// ─── GpsProvider Factory ──────────────────────────────────────
//
// Swappable provider interface for GPS vendor adapters.
//
// To add a new vendor:
//   1. Create src/services/gpsProvider/<name>Provider.js exporting
//      `{ fetchFleet, healthCheck, normalizeResponse }`.
//   2. Register it in REGISTRY below.
//
// Future GPS APIs need only a new Provider Adapter — no changes
// to Context, Page, Service, or Repository.

import { createKingsTrackProvider } from './kingsTrackProvider'

/**
 * @typedef {Object} NormalizedSnapshot
 * @property {string}  imei       Device IMEI (vendor-issued id)
 * @property {string=} registration  Optional vehicle registration if vendor provides it
 * @property {number}  lat        Latitude (decimal degrees)
 * @property {number}  lng        Longitude (decimal degrees)
 * @property {string=} address    Reverse-geocoded address (best-effort)
 * @property {number=} speed_kmh  Current speed
 * @property {boolean=} ignition  Ignition on?
 * @property {string=} status     Vendor-supplied status string
 * @property {string=} odometer   Vehicle odometer reading
 * @property {string}  timestamp  ISO timestamp from the device
 * @property {number}  _epoch     timestamp rounded to nearest minute (ms) — used for dedup
 */

/**
 * @typedef {Object} GpsProvider
 * @property {string}   name             Provider identifier
 * @property {() => Promise<{ok: boolean, raw?: any, snapshots: NormalizedSnapshot[], error?: string}>} fetchFleet
 * @property {() => Promise<{ok: boolean, latencyMs?: number, error?: string}>} healthCheck
 * @property {(raw: any) => NormalizedSnapshot[]} normalizeResponse
 */

const REGISTRY = {
  kingstrack: createKingsTrackProvider,
  // future: 'provider2': createProvider2,
  // future: 'provider3': createProvider3,
}

/**
 * Create a GPS provider instance.
 * @param {string} providerName   One of the keys in REGISTRY.
 * @param {object} settings       Row of gps settings from the DB.
 * @returns {GpsProvider}
 */
export function createGpsProvider(providerName, settings = {}) {
  const factory = REGISTRY[providerName]
  if (!factory) {
    throw new Error(
      `[GpsProvider] Unknown provider "${providerName}". Registered: ${Object.keys(REGISTRY).join(', ')}`
    )
  }
  return factory(settings)
}

export const GPS_PROVIDER_NAMES = Object.keys(REGISTRY)