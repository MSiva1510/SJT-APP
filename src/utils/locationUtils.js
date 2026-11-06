// ─── Location Utilities ───────────────────────────────────────
// Granular area detection for Puducherry region.
// Built so future real API (Nominatim / Google) can be swapped
// in by replacing reverseGeocode() body only — signature stays.

// ── Area map — ordered inner→outer for precision ──────────────
const AREA_MAP = [
  // Puducherry inner localities
  { name: 'Reddiarpalayam',  latMin: 11.930, latMax: 11.960, lngMin: 79.845, lngMax: 79.875 },
  { name: 'Lawspet',         latMin: 11.958, latMax: 11.990, lngMin: 79.830, lngMax: 79.870 },
  { name: 'Mudaliarpet',     latMin: 11.942, latMax: 11.972, lngMin: 79.858, lngMax: 79.898 },
  { name: 'Muthialpet',      latMin: 11.922, latMax: 11.952, lngMin: 79.815, lngMax: 79.858 },
  { name: 'Ariyankuppam',    latMin: 11.868, latMax: 11.922, lngMin: 79.785, lngMax: 79.840 },
  { name: 'Villianur',       latMin: 11.893, latMax: 11.935, lngMin: 79.718, lngMax: 79.792 },
  { name: 'Kalapet',         latMin: 11.968, latMax: 11.998, lngMin: 79.855, lngMax: 79.895 },
  { name: 'Ozhukarai',       latMin: 11.905, latMax: 11.938, lngMin: 79.848, lngMax: 79.878 },
  { name: 'Gorimedu',        latMin: 11.935, latMax: 11.955, lngMin: 79.825, lngMax: 79.850 },
  { name: 'Thirubuvanai',    latMin: 11.952, latMax: 11.980, lngMin: 79.788, lngMax: 79.828 },
  { name: 'Auroville',       latMin: 11.972, latMax: 12.022, lngMin: 79.798, lngMax: 79.858 },
  { name: 'Puducherry',      latMin: 11.878, latMax: 11.982, lngMin: 79.768, lngMax: 79.902 },
  // Nearby towns / districts
  { name: 'Cuddalore',       latMin: 11.728, latMax: 11.802, lngMin: 79.728, lngMax: 79.798 },
  { name: 'Neyveli',         latMin: 11.528, latMax: 11.602, lngMin: 79.468, lngMax: 79.548 },
  { name: 'Villupuram',      latMin: 11.908, latMax: 11.962, lngMin: 79.448, lngMax: 79.548 },
  { name: 'Chidambaram',     latMin: 11.388, latMax: 11.432, lngMin: 79.678, lngMax: 79.722 },
  { name: 'Mahabalipuram',   latMin: 12.598, latMax: 12.662, lngMin: 80.168, lngMax: 80.222 },
  // Major cities / airports
  { name: 'Chennai Airport', latMin: 12.982, latMax: 13.022, lngMin: 80.152, lngMax: 80.198 },
  { name: 'Chennai',         latMin: 12.898, latMax: 13.202, lngMin: 80.098, lngMax: 80.312 },
  { name: 'Bangalore',       latMin: 12.848, latMax: 13.102, lngMin: 77.448, lngMax: 77.752 },
  { name: 'Tirupati',        latMin: 13.598, latMax: 13.702, lngMin: 79.378, lngMax: 79.482 },
  { name: 'Salem',           latMin: 11.598, latMax: 11.702, lngMin: 78.098, lngMax: 78.202 },
  { name: 'Coimbatore',      latMin: 10.978, latMax: 11.052, lngMin: 76.928, lngMax: 77.002 },
]

// ── Sync area lookup ──────────────────────────────────────────
// Inner Puducherry localities get a ", Puducherry" suffix for display
// (e.g. "Reddiarpalayam, Puducherry") — outer towns/cities stand alone.
const PUDUCHERRY_LOCALITIES = new Set([
  'Reddiarpalayam', 'Lawspet', 'Mudaliarpet', 'Muthialpet',
  'Ariyankuppam', 'Villianur', 'Kalapet', 'Ozhukarai',
  'Gorimedu', 'Thirubuvanai',
])

export function getAreaFromCoords(lat, lng) {
  if (lat == null || lng == null) return '—'
  for (const z of AREA_MAP) {
    if (lat >= z.latMin && lat <= z.latMax && lng >= z.lngMin && lng <= z.lngMax) {
      return PUDUCHERRY_LOCALITIES.has(z.name) ? `${z.name}, Puducherry` : z.name
    }
  }
  return `${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E`
}

// ── Async reverse geocoder (future-API-ready) ─────────────────
// To plug in a real API later, replace the body of this function.
// Signature must stay: (lat: number, lng: number) => Promise<string>
export async function reverseGeocode(lat, lng) {
  // MOCK — returns immediately using local lookup.
  // Future: return await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
  //           .then(r => r.json()).then(d => d.address?.suburb || d.address?.city || '—')
  return getAreaFromCoords(lat, lng)
}

// ── Haversine distance (km) ───────────────────────────────────
export function distanceBetween(lat1, lng1, lat2, lng2) {
  const R    = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a    = Math.sin(dLat / 2) ** 2
              + Math.cos(lat1 * Math.PI / 180)
              * Math.cos(lat2 * Math.PI / 180)
              * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Estimate travel time string ───────────────────────────────
export function estimateTravelTime(distanceKm, avgSpeedKph = 55) {
  if (!distanceKm || distanceKm <= 0) return '—'
  const totalMins = Math.round((distanceKm / avgSpeedKph) * 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ── Google Maps directions URL ────────────────────────────────
export function buildMapsUrl(origin, destination, mode = 'driving') {
  const base = 'https://www.google.com/maps/dir/?api=1'
  const o    = encodeURIComponent(origin      || '')
  const d    = encodeURIComponent(destination || '')
  return `${base}&origin=${o}&destination=${d}&travelmode=${mode}`
}
