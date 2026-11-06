import { useState, useMemo, useEffect } from 'react'
import { Truck, Move, OctagonPause, Power, Radio, WifiOff, Gauge, Clock, RefreshCw, Flame, Route } from 'lucide-react'
import PageHeader         from '../components/ui/PageHeader'
import StatCard           from '../components/ui/StatCard'
import FleetSearch        from '../components/fleet/FleetSearch'
import FleetFilters       from '../components/fleet/FleetFilters'
import FleetMap           from '../components/fleet/FleetMap'
import FleetVehicleList   from '../components/fleet/FleetVehicleList'
import FleetVehicleDetail from '../components/fleet/FleetVehicleDetail'
import GpsHealthCard      from '../components/gps/GpsHealthCard'
import GpsDebugPanel      from '../components/gps/GpsDebugPanel'
import { useGpsHistory }  from '../context/GpsHistoryContext'

function applyFilters(snapshots, filters, search) {
  const s = (search ?? '').trim().toLowerCase()
  return snapshots.filter(snap => {
    if (s) {
      const hay = [snap.registration, snap.address, snap.driver_name, snap.vehicle_id, snap.imei]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(s)) return false
    }
    if (!filters.size) return true
    const ts = snap.timestamp ? new Date(snap.timestamp).getTime() : 0
    const recent = ts && (Date.now() - ts) < 5 * 60_000
    const speed  = Number(snap.speed_kmh ?? 0)
    if (filters.has('moving')       && !(recent && speed > 0))   return false
    if (filters.has('stopped')      && !(recent && speed === 0)) return false
    if (filters.has('offline')      && recent)                   return false
    if (filters.has('gps_on')       && snap.gps_online !== true)  return false
    if (filters.has('gps_off')      && snap.gps_online !== false) return false
    if (filters.has('ignition_on')  && snap.ignition   !== true)  return false
    if (filters.has('ignition_off') && snap.ignition   !== false) return false
    return true
  })
}

export default function Fleet() {
  const { snapshots, fleet, syncNow, loading } = useGpsHistory()
  const [search,   setSearch]   = useState('')
  const [filters,  setFilters]  = useState(new Set())
  const [selected, setSelected] = useState(null)
  const [tick,     setTick]     = useState(0)

  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30_000); return () => clearInterval(t) }, [])

  const filtered = useMemo(() => applyFilters(snapshots, filters, search), [snapshots, filters, search, tick])

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Live Fleet Dashboard"
        subtitle={`${fleet.total} vehicles tracked • ${fleet.online} online now`}
        action={
          <button onClick={() => syncNow()}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 transition-colors">
            <RefreshCw size={14} /> Sync Now
          </button>
        }
      />

      {/* Row 1: vehicle counts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Vehicles" value={fleet.total    ?? 0} icon={Truck}        gradient="bg-gradient-to-br from-indigo-500 to-indigo-600" />
        <StatCard label="Moving"         value={fleet.moving   ?? 0} icon={Move}         gradient="bg-gradient-to-br from-amber-500 to-amber-600" />
        <StatCard label="Stopped"        value={fleet.stopped  ?? 0} icon={OctagonPause} gradient="bg-gradient-to-br from-slate-500 to-slate-600" />
        <StatCard label="Offline"        value={fleet.offline  ?? 0} icon={Power}        gradient="bg-gradient-to-br from-red-500 to-red-600" />
      </div>

      {/* Row 2: GPS + ignition */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="GPS Online"   value={fleet.gpsOn      ?? 0} icon={Radio}  gradient="bg-gradient-to-br from-emerald-500 to-emerald-600" />
        <StatCard label="GPS Offline"  value={fleet.gpsOff     ?? 0} icon={WifiOff}gradient="bg-gradient-to-br from-rose-500 to-rose-600" />
        <StatCard label="Ignition ON"  value={fleet.ignitionOn ?? 0} icon={Flame}  gradient="bg-gradient-to-br from-orange-500 to-orange-600" />
        <StatCard label="Ignition OFF" value={fleet.ignitionOff?? 0} icon={Flame}  gradient="bg-gradient-to-br from-violet-500 to-violet-600" />
      </div>

      {/* Row 3: speed / distance / sync */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Avg Speed"        value={`${fleet.avgSpeed      ?? 0} km/h`} icon={Gauge} gradient="bg-gradient-to-br from-cyan-500 to-cyan-600" />
        <StatCard label="Today's Distance" value={`${fleet.todayDistance ?? 0} km`}   icon={Route} gradient="bg-gradient-to-br from-blue-500 to-blue-600" />
        <StatCard label="Last Sync"        value={fleet.lastSync ? new Date(fleet.lastSync).toLocaleTimeString() : '—'} icon={Clock} gradient="bg-gradient-to-br from-teal-500 to-teal-600" />
      </div>

      {/* Search + filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FleetSearch value={search} onChange={setSearch} />
        <div className="text-xs text-slate-400">{filtered.length} / {snapshots.length} vehicles shown</div>
      </div>
      <FleetFilters active={filters} onChange={setFilters} />

      {/* Map + List */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3"><FleetMap snapshots={filtered} onSelect={setSelected} /></div>
        <div className="lg:col-span-2"><FleetVehicleList snapshots={filtered} onSelect={setSelected} selectedId={selected?.id} /></div>
      </div>

      <GpsHealthCard />
      <GpsDebugPanel />

      {selected && <FleetVehicleDetail snapshot={selected} onClose={() => setSelected(null)} />}
      {loading && <p className="text-center text-xs text-slate-400">Loading GPS data…</p>}
    </div>
  )
}
