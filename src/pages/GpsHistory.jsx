// ─── GPS History Viewer ───────────────────────────────────────
// Day 33: Browse gps_tracking rows with filters.
// Clicking "Replay" navigates to /gps-history/replay.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate }           from 'react-router-dom'
import { Search, Play, RefreshCw, MapPin, Gauge, Radio, WifiOff, Flame, ChevronRight } from 'lucide-react'
import PageHeader                from '../components/ui/PageHeader'
import { gpsHistoryRepository } from '../repositories/gpsHistoryRepository'
import { loadVehicles }    from '../data/vehicleData'

function fmtTs(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })
}

function StatusBadge({ speed, ts }) {
  const isRecent = ts && (Date.now() - new Date(ts).getTime()) < 5 * 60_000
  if (!isRecent) return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">Offline</span>
  return Number(speed ?? 0) > 0
    ? <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Moving</span>
    : <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Stopped</span>
}

export default function GpsHistory() {
  const navigate = useNavigate()

  // Filters
  const [vehicleId,    setVehicleId]   = useState('')
  const [date,         setDate]        = useState(() => new Date().toISOString().slice(0, 10))
  const [driverSearch, setDriverSearch]= useState('')

  // Data
  const [vehicles, setVehicles] = useState([])
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)

  // Load vehicles for picker
  useEffect(() => {
    loadVehicles().then(v => setVehicles(v ?? [])).catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await gpsHistoryRepository.getHistory({
        vehicleId:    vehicleId || undefined,
        date,
        driverSearch: driverSearch.trim() || undefined,
      })
      setRows(data)
    } catch (err) {
      setError(err?.message ?? 'Failed to load GPS history')
    } finally {
      setLoading(false)
    }
  }, [vehicleId, date, driverSearch])

  // Auto-load on mount + filter changes
  useEffect(() => { load() }, [load])

  const goReplay = () => {
    if (!vehicleId) return
    const since = `${date}T00:00:00.000Z`
    const until = `${date}T23:59:59.999Z`
    navigate(`/gps-history/replay?vehicleId=${vehicleId}&since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`)
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="GPS History"
        subtitle="Browse recorded GPS snapshots"
        action={
          <button onClick={goReplay} disabled={!vehicleId}
            className="px-4 py-2 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Play size={14} /> Replay Day
          </button>
        }
      />

      {/* Filters */}
      <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-end">
        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Vehicle</label>
          <select
            value={vehicleId}
            onChange={e => setVehicleId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All vehicles</option>
            {vehicles.map(v => (
              <option key={v.id} value={v.id}>{v.registration ?? v.id}</option>
            ))}
          </select>
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1">
          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">Driver (search)</label>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Driver name…"
              value={driverSearch}
              onChange={e => setDriverSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button onClick={load}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 transition-colors">
          <RefreshCw size={13} /> Reload
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-bold text-slate-700 dark:text-slate-300">{rows.length} records</span>
        {vehicleId && date && (
          <button onClick={goReplay} className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-semibold">
            <Play size={11} /> Replay this day
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card rounded-2xl p-4 border-l-4 border-red-500">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-2xl p-8 text-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-slate-400">Loading GPS history…</p>
        </div>
      )}

      {/* Table */}
      {!loading && rows.length === 0 && !error && (
        <div className="glass-card rounded-2xl p-10 text-center">
          <MapPin size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">No GPS records found for the selected filters.</p>
          <p className="text-xs text-slate-400 mt-1">Try a different vehicle or date.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-slate-50/80 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
            <div className="col-span-2">Time</div>
            <div className="col-span-2">Vehicle</div>
            <div className="col-span-1">Driver</div>
            <div className="col-span-4">Address</div>
            <div className="col-span-1 text-right">Speed</div>
            <div className="col-span-1 text-center">GPS</div>
            <div className="col-span-1 text-center">Ign</div>
          </div>

          <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100 dark:divide-navy-700">
            {rows.map(r => (
              <div key={r.id}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center hover:bg-slate-50/60 dark:hover:bg-navy-800/30 transition-colors">
                <div className="col-span-2">
                  <p className="text-[11px] font-mono text-slate-700 dark:text-slate-300">{fmtTs(r.timestamp)}</p>
                </div>
                <div className="col-span-2 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                    {r.registration || r.vehicle_id?.slice(0, 8) || '—'}
                  </p>
                  <StatusBadge speed={r.speed_kmh} ts={r.timestamp} />
                </div>
                <div className="col-span-1 min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.driver_name ?? '—'}</p>
                </div>
                <div className="col-span-4 min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
                    <MapPin size={9} className="flex-shrink-0 text-slate-400" />
                    {r.address ?? '—'}
                  </p>
                  {(r.latitude && r.longitude) && (
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                      {r.latitude?.toFixed(4)}, {r.longitude?.toFixed(4)}
                    </p>
                  )}
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-end gap-0.5">
                    <Gauge size={10} className="text-slate-400" />{Number(r.speed_kmh ?? 0).toFixed(0)}
                  </span>
                </div>
                <div className="col-span-1 flex justify-center">
                  {r.gps_online === true
                    ? <Radio size={13} className="text-emerald-500" />
                    : <WifiOff size={13} className="text-slate-400" />}
                </div>
                <div className="col-span-1 flex justify-center">
                  <Flame size={13} className={r.ignition === true ? 'text-orange-500' : 'text-slate-300 dark:text-slate-600'} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
