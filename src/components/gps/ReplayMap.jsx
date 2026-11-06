// ─── Replay Map ───────────────────────────────────────────────
// Day 33: Leaflet map for Route Replay.
// Reuses tile layers from FleetMap; adds Polyline + animated marker.
// Props:
//   points       – full GPS track array
//   currentIndex – which point to show the animated marker on
//   coloredPath  – [{ positions, color, type }] for polyline segments
//   darkMode     – bool from AppContext

import { useEffect, useRef, useMemo, memo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Maximize2 } from 'lucide-react'

// Same tiles as FleetMap
const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

// ── Icon factories ────────────────────────────────────────────
function makeCurrentIcon(speed) {
  const color  = speed > 5 ? '#10b981' : '#f59e0b'
  const pulsed = speed > 5
  return L.divIcon({
    className: 'replay-current',
    html: `<div style="position:relative;width:20px;height:20px;">
      <div style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:0.2;${pulsed ? 'animation:pulse 1.5s infinite;' : ''}"></div>
      <div style="position:absolute;top:4px;left:4px;width:12px;height:12px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>
    </div>`,
    iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -12],
  })
}

function makeEndpointIcon(type) {
  const cfg = type === 'start'
    ? { bg: '#22c55e', label: 'S' }
    : { bg: '#ef4444', label: 'E' }
  return L.divIcon({
    className: 'replay-endpoint',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${cfg.bg};border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:white;">${cfg.label}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -13],
  })
}

// ── Auto-fit bounds helper ────────────────────────────────────
function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    const valid = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    if (!valid.length) return
    if (valid.length === 1) { map.setView([valid[0].latitude, valid[0].longitude], 14); return }
    const lats = valid.map(p => p.latitude), lngs = valid.map(p => p.longitude)
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)],[Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40], maxZoom: 16 })
  }, [])  // run once on mount
  return null
}

// ── Fit-all button ────────────────────────────────────────────
function FitAllButton({ points }) {
  const map = useMap()
  const fit = () => {
    const valid = points.filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    if (!valid.length) return
    if (valid.length === 1) { map.setView([valid[0].latitude, valid[0].longitude], 14); return }
    const lats = valid.map(p => p.latitude), lngs = valid.map(p => p.longitude)
    map.fitBounds([[Math.min(...lats), Math.min(...lngs)],[Math.max(...lats), Math.max(...lngs)]], { padding: [40, 40] })
  }
  return (
    <button onClick={fit}
      className="absolute right-3 bottom-3 z-[400] px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-navy-700 shadow hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors flex items-center gap-1.5">
      <Maximize2 size={12} /> Fit route
    </button>
  )
}

// ── Moving marker synced to currentIndex ──────────────────────
function AnimatedMarker({ points, currentIndex }) {
  const markerRef = useRef(null)
  const map = useMap()

  const current = points[currentIndex]
  useEffect(() => {
    if (!current || !markerRef.current) return
    const ll = [current.latitude, current.longitude]
    markerRef.current.setLatLng(ll)
    markerRef.current.setIcon(makeCurrentIcon(Number(current.speed_kmh ?? 0)))
    // Pan map to keep marker visible (soft pan, not re-centre)
    const bounds = map.getBounds()
    if (!bounds.contains(ll)) map.panTo(ll, { animate: true, duration: 0.5 })
  }, [currentIndex, current, map])

  if (!current || !Number.isFinite(current.latitude)) return null

  return (
    <Marker
      position={[current.latitude, current.longitude]}
      icon={makeCurrentIcon(Number(current.speed_kmh ?? 0))}
      ref={markerRef}
    >
      <Popup>
        <div className="text-xs space-y-1 min-w-[140px]">
          <p className="font-bold">{new Date(current.timestamp).toLocaleTimeString()}</p>
          <p>{Number(current.speed_kmh ?? 0).toFixed(0)} km/h</p>
          {current.address && <p className="text-slate-500 truncate max-w-[180px]">{current.address}</p>}
        </div>
      </Popup>
    </Marker>
  )
}

// ── Main export ───────────────────────────────────────────────
const ReplayMap = memo(function ReplayMap({ points = [], currentIndex = 0, coloredPath = [], darkMode = false }) {
  const first = points[0]
  const last  = points[points.length - 1]

  const centre = useMemo(() => {
    if (!first) return [11.9416, 79.8083]  // Puducherry default
    return [first.latitude, first.longitude]
  }, [first])

  const hasTrack = points.length > 1

  return (
    <div className="glass-card rounded-2xl overflow-hidden h-[500px] relative">
      <MapContainer center={centre} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          key={darkMode ? 'dark' : 'light'}
          url={darkMode ? DARK_TILES : LIGHT_TILES}
          attribution={ATTRIBUTION}
          maxZoom={19}
        />

        {/* Auto-fit on load */}
        {hasTrack && <FitBounds points={points} />}

        {/* Route polyline — one Polyline per segment for colour variation */}
        {coloredPath.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{ color: seg.color, weight: 4, opacity: 0.85 }}
          />
        ))}

        {/* Start marker */}
        {first && Number.isFinite(first.latitude) && (
          <Marker position={[first.latitude, first.longitude]} icon={makeEndpointIcon('start')}>
            <Popup><div className="text-xs"><p className="font-bold text-emerald-600">Trip Start</p><p>{new Date(first.timestamp).toLocaleString()}</p></div></Popup>
          </Marker>
        )}

        {/* End marker (only if we have > 1 point) */}
        {last && last !== first && Number.isFinite(last.latitude) && (
          <Marker position={[last.latitude, last.longitude]} icon={makeEndpointIcon('end')}>
            <Popup><div className="text-xs"><p className="font-bold text-red-600">Trip End</p><p>{new Date(last.timestamp).toLocaleString()}</p></div></Popup>
          </Marker>
        )}

        {/* Animated current-position marker */}
        {hasTrack && <AnimatedMarker points={points} currentIndex={currentIndex} />}

        <FitAllButton points={points} />
      </MapContainer>

      {/* Legend */}
      <div className="absolute top-3 left-3 z-[400] flex flex-col gap-1 bg-white/90 dark:bg-navy-900/90 rounded-xl px-3 py-2 shadow text-[10px] font-bold border border-slate-100 dark:border-navy-700">
        {[['#10b981','Moving'],['#f59e0b','Idle'],['#94a3b8','Stopped']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
            <span style={{ background: c }} className="w-3 h-2 rounded-sm inline-block" />{l}
          </span>
        ))}
      </div>
    </div>
  )
})

export default ReplayMap
