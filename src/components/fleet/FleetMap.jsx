// ─── Fleet Map ────────────────────────────────────────────────
// Leaflet map (OSM tiles, CartoDB Dark in dark mode) with one
// marker per vehicle. Markers are status-coloured divIcons (no
// hue-rotate CSS). Click a marker → opens the detail panel.

import { useMemo, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Maximize2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'

const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const DARK_TILES  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'

function statusOf(s) {
  const ts = s.timestamp ? new Date(s.timestamp).getTime() : 0
  const recent = ts && (Date.now() - ts) < 5 * 60_000
  if (!recent) return 'offline'
  return Number(s.speed_kmh ?? 0) > 0 ? 'moving' : 'stopped'
}

const COLORS = {
  moving:  '#10b981',  // emerald-500
  stopped: '#f59e0b',  // amber-500
  offline: '#94a3b8',  // slate-400
}

function makeIcon(status) {
  const colour = COLORS[status] || COLORS.offline
  const html = `
    <div style="position:relative;width:24px;height:24px;">
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:${colour};
        opacity:0.25;
        animation:${status === 'moving' ? 'pulse 2s infinite' : 'none'};
      "></div>
      <div style="
        position:absolute;top:6px;left:6px;width:12px;height:12px;
        border-radius:50%;background:${colour};
        border:2px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>
    </div>
  `
  return L.divIcon({
    className: 'fleet-marker',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -10],
  })
}

// Helper child to expose a fitBounds control
function FitBoundsControl({ snapshots }) {
  const map = useMap()
  const fit = () => {
    const pts = snapshots
      .filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map(s => [s.latitude, s.longitude])
    if (pts.length === 0) return
    if (pts.length === 1) {
      map.setView(pts[0], 13)
    } else {
      map.fitBounds(pts, { padding: [40, 40], maxZoom: 15 })
    }
  }
  return (
    <button
      onClick={fit}
      className="absolute right-3 bottom-3 z-[400] px-3 py-2 text-xs font-semibold rounded-xl
                 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200
                 border border-slate-200 dark:border-navy-700 shadow
                 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors
                 flex items-center gap-1.5"
    >
      <Maximize2 size={12} /> Fit all
    </button>
  )
}

export default function FleetMap({ snapshots = [], onSelect }) {
  const { darkMode } = useApp()
  const centre = useMemo(() => {
    const pts = snapshots
      .filter(s => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map(s => [s.latitude, s.longitude])
    if (!pts.length) return [11.9416, 79.8083] // Puducherry
    const lat = pts.reduce((a, [x]) => a + x, 0) / pts.length
    const lng = pts.reduce((a, [, y]) => a + y, 0) / pts.length
    return [lat, lng]
  }, [snapshots])

  // react-leaflet v4 + StrictMode mount guard
  const containerRef = useRef(null)

  return (
    <div ref={containerRef} className="glass-card rounded-2xl overflow-hidden h-[500px] relative">
      <MapContainer
        center={centre}
        zoom={11}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          key={darkMode ? 'dark' : 'light'}
          url={darkMode ? DARK_TILES : LIGHT_TILES}
          attribution={ATTRIBUTION}
          maxZoom={19}
        />
        {snapshots.map(s => {
          if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return null
          const status = statusOf(s)
          return (
            <Marker
              key={s.id}
              position={[s.latitude, s.longitude]}
              icon={makeIcon(status)}
              eventHandlers={{ click: () => onSelect?.(s) }}
            >
              <Popup>
                <div className="text-xs space-y-1">
                  <p className="font-bold text-sm">
                    {s.registration || s.vehicle_id?.slice(0, 8)}
                  </p>
                  <p>{Number(s.speed_kmh ?? 0).toFixed(0)} km/h</p>
                  <p>{s.address || '—'}</p>
                  <p className="text-slate-500">
                    {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : '—'}
                  </p>
                </div>
              </Popup>
            </Marker>
          )
        })}
        <FitBoundsControl snapshots={snapshots} />
      </MapContainer>
    </div>
  )
}