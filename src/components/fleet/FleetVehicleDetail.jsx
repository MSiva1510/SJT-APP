// ─── Fleet Vehicle Detail (side panel) ───────────────────────
import { X, Gauge, Flame, MapPin, Clock, Navigation, Truck, Radio, WifiOff, User } from 'lucide-react'
import { buildMapsUrl } from '../../utils/locationUtils'

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-navy-700 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 text-right ml-2 min-w-0 break-all">{value ?? '—'}</span>
    </div>
  )
}

function Pill({ on, labelOn, labelOff }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${on ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-500' : 'bg-slate-400'}`} />
      {on ? labelOn : labelOff}
    </span>
  )
}

export default function FleetVehicleDetail({ snapshot, onClose }) {
  if (!snapshot) return null
  const mapsUrl = (snapshot.latitude && snapshot.longitude)
    ? buildMapsUrl(`${snapshot.latitude},${snapshot.longitude}`) : null
  const ts = snapshot.timestamp ? new Date(snapshot.timestamp).getTime() : 0
  const isRecent = ts && (Date.now() - ts) < 5 * 60_000
  const vehicleStatus = isRecent ? (Number(snapshot.speed_kmh ?? 0) > 0 ? 'Moving' : 'Stopped') : 'Offline'

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40 animate-fade-up" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-full sm:w-96 bg-white dark:bg-navy-900 z-50 shadow-xl flex flex-col animate-fade-up">
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-navy-700">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600"><Truck size={16} /></div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{snapshot.registration || snapshot.vehicle_id?.slice(0, 8) || 'Vehicle'}</h2>
              <p className="text-[11px] text-slate-400">{snapshot.vehicle_model || 'Vehicle Details'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800"><X size={16} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Identity</h3>
            <Row label="Vehicle No." value={snapshot.registration} />
            <Row label="IMEI" value={snapshot.imei ? <span className="font-mono text-xs">{snapshot.imei}</span> : null} />
            <Row label="Driver" value={snapshot.driver_name ? <span className="flex items-center gap-1.5"><User size={12} className="text-slate-400" />{snapshot.driver_name}</span> : 'Unassigned'} />
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">Status</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Pill on={snapshot.gps_online === true} labelOn="GPS Active" labelOff="GPS Void" />
              <Pill on={snapshot.ignition === true}   labelOn="Ignition ON" labelOff="Ignition OFF" />
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${vehicleStatus === 'Moving' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : vehicleStatus === 'Stopped' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{vehicleStatus}</span>
            </div>
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Location</h3>
            <Row label="Address"   value={snapshot.address} />
            <Row label="Latitude"  value={snapshot.latitude?.toFixed(6)} />
            <Row label="Longitude" value={snapshot.longitude?.toFixed(6)} />
            {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline"><Navigation size={12} />Open in Maps</a>}
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Telemetry</h3>
            <Row label="Speed"    value={<span className="flex items-center gap-1"><Gauge size={12} className="text-slate-400" />{Number(snapshot.speed_kmh ?? 0).toFixed(1)} km/h</span>} />
            <Row label="Odometer" value={snapshot.odometer ? `${Number(snapshot.odometer).toFixed(1)} km` : null} />
            <Row label="Accuracy" value={snapshot.accuracy ? `±${Number(snapshot.accuracy).toFixed(0)} m` : null} />
            <Row label="Bearing"  value={snapshot.bearing  ? `${Number(snapshot.bearing).toFixed(0)}°` : null} />
          </section>
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Sync</h3>
            <Row label="Last Update" value={snapshot.timestamp ? new Date(snapshot.timestamp).toLocaleString() : null} />
            <Row label="Snapshot ID" value={snapshot.id ? <span className="font-mono text-[11px]">{snapshot.id.slice(0, 8)}</span> : null} />
          </section>
        </div>
      </aside>
    </>
  )
}
