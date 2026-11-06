// ─── Fleet Analytics Page ──────────────────────────────────────
// Day 36: Enterprise analytics with 6 tabs.
// Architecture: Page → Context → Repository → Supabase
// Reuses StatCard, PageHeader, existing export utilities.

import { useState, useMemo } from 'react'
import {
  BarChart2, RefreshCw, Download, Car, Users, Route,
  Bell, MapPin, Truck, TrendingUp, Clock, Gauge,
  CheckCircle, XCircle, AlertTriangle, Activity,
  Trophy, Calendar, Fuel, Info,
} from 'lucide-react'
import { useFleetAnalytics }       from '../context/FleetAnalyticsContext'
import PageHeader                  from '../components/ui/PageHeader'
import StatCard                    from '../components/ui/StatCard'
import {
  BarChart, DonutChart, LineChart, MiniBarList, StatPill,
} from '../components/analytics/AnalyticsChart'
import { exportToCSV, exportToExcel, exportToPDF } from '../data/reportData'

// ── Tab config ────────────────────────────────────────────────
const TABS = [
  { key: 'kpi',      label: 'Fleet KPIs',  icon: Activity },
  { key: 'vehicles', label: 'Vehicles',    icon: Car },
  { key: 'drivers',  label: 'Drivers',     icon: Users },
  { key: 'trips',    label: 'Trips',       icon: Route },
  { key: 'alerts',   label: 'Alerts',      icon: Bell },
  { key: 'geofence', label: 'Geofence',    icon: MapPin },
]

const PRESETS = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'This Week' },
  { key: 'month',     label: 'This Month'},
  { key: 'quarter',   label: '3 Months'  },
  { key: 'custom',    label: 'Custom'    },
]

// ── Shared card wrapper ───────────────────────────────────────
function Card({ title, children, className = '' }) {
  return (
    <div className={`glass-card rounded-2xl p-4 ${className}`}>
      {title && <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-4">{title}</h3>}
      {children}
    </div>
  )
}

// ── Loading skeleton ──────────────────────────────────────────
function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 bg-slate-100 dark:bg-navy-800 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

// ── Empty placeholder ─────────────────────────────────────────
function NoData({ message = 'No data available for this period.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      <Info size={28} className="text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-400 dark:text-slate-500">{message}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 1: Fleet KPIs
// ─────────────────────────────────────────────────────────────
function KpiTab() {
  const { fleetSummary: f, loading, distanceSummary } = useFleetAnalytics()
  if (loading && !f) return <Skeleton rows={6} />
  if (!f)           return <NoData />

  const movingHrs = Math.round((f.movingMinutes ?? 0) / 60 * 10) / 10
  const idleHrs   = Math.round((f.idleMinutes  ?? 0) / 60 * 10) / 10

  return (
    <div className="space-y-4">
      {/* Row 1: fleet status */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Vehicles" value={f.vehiclesTotal  ?? 0} icon={Truck}       gradient="bg-gradient-to-br from-indigo-500 to-indigo-600" />
        <StatCard label="Online"         value={f.vehiclesOnline ?? 0} icon={Activity}    gradient="bg-gradient-to-br from-emerald-500 to-emerald-600" />
        <StatCard label="Offline"        value={f.vehiclesOffline?? 0} icon={XCircle}     gradient="bg-gradient-to-br from-red-500 to-red-600" />
        <StatCard label="Drivers Active" value={f.driversActive  ?? 0} icon={Users}       gradient="bg-gradient-to-br from-blue-500 to-blue-600" />
      </div>

      {/* Row 2: trips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Trips (period)"   value={f.tripsToday    ?? 0} icon={Route}        gradient="bg-gradient-to-br from-violet-500 to-violet-600" />
        <StatCard label="Completed"        value={f.tripsCompleted?? 0} icon={CheckCircle}  gradient="bg-gradient-to-br from-teal-500 to-teal-600" />
        <StatCard label="Running"          value={f.tripsRunning  ?? 0} icon={TrendingUp}   gradient="bg-gradient-to-br from-amber-500 to-amber-600" />
        <StatCard label="Cancelled"        value={f.tripsCancelled?? 0} icon={XCircle}      gradient="bg-gradient-to-br from-rose-500 to-rose-600" />
      </div>

      {/* Row 3: telemetry */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Distance (GPS)"   value={`${f.distanceToday ?? 0} km`}  icon={Gauge}       gradient="bg-gradient-to-br from-cyan-500 to-cyan-600" />
        <StatCard label="Avg Speed"        value={`${f.avgSpeed ?? 0} km/h`}     icon={TrendingUp}  gradient="bg-gradient-to-br from-sky-500 to-sky-600" />
        <StatCard label="Max Speed"        value={`${f.maxSpeed ?? 0} km/h`}     icon={Gauge}       gradient="bg-gradient-to-br from-orange-500 to-orange-600" />
        <StatCard label="Alerts"           value={f.alertsToday  ?? 0}           icon={Bell}        gradient="bg-gradient-to-br from-pink-500 to-pink-600" />
      </div>

      {/* Row 4: time */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Moving Time"  value={`${movingHrs} h`} icon={Activity} gradient="bg-gradient-to-br from-lime-500 to-lime-600" />
        <StatCard label="Idle Time"    value={`${idleHrs} h`}   icon={Clock}    gradient="bg-gradient-to-br from-slate-500 to-slate-600" />
      </div>

      {/* Distance chart */}
      {distanceSummary?.byDay?.length > 1 && (
        <Card title="Daily Distance (km)">
          <LineChart data={distanceSummary.byDay} valueKey="km" labelKey="date" color="#3b82f6" height={90} />
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 2: Vehicle Analytics
// ─────────────────────────────────────────────────────────────
function VehiclesTab() {
  const { vehicleSummary: vehicles, loading, filter, setFilter } = useFleetAnalytics()
  if (loading) return <Skeleton rows={4} />
  if (!vehicles?.length) return <NoData message="No vehicle data for this period." />

  const topByTrips    = [...vehicles].sort((a,b) => b.trips - a.trips).slice(0,8)
  const topByDistance = [...vehicles].sort((a,b) => b.distanceKm - a.distanceKm).slice(0,8)

  const exportCols = [
    { label: 'Vehicle',        key: 'registration' },
    { label: 'Type',           key: 'vehicleType' },
    { label: 'Trips',          key: 'trips' },
    { label: 'Completed',      key: 'tripsCompleted' },
    { label: 'Distance (km)',  key: 'distanceKm' },
    { label: 'Avg Speed',      key: 'avgSpeed' },
    { label: 'Max Speed',      key: 'maxSpeed' },
    { label: 'Moving (h)',     key: 'movingHours' },
    { label: 'Idle (h)',       key: 'idleHours' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Trips by Vehicle">
          <MiniBarList items={topByTrips} labelKey="registration" valueKey="trips" color="bg-gradient-to-r from-blue-500 to-indigo-500" />
        </Card>
        <Card title="Distance by Vehicle (km)">
          <MiniBarList items={topByDistance} labelKey="registration" valueKey="distanceKm" color="bg-gradient-to-r from-emerald-500 to-teal-500" suffix=" km" />
        </Card>
      </div>

      {/* Table */}
      <Card title="Vehicle Details">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-navy-700">
                {['Vehicle','Trips','Completed','Distance','Avg Spd','Max Spd','Moving','Idle'].map(h=>(
                  <th key={h} className="text-left py-2 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-navy-800">
              {vehicles.map(v => (
                <tr key={v.id} className="hover:bg-slate-50/60 dark:hover:bg-navy-800/30 transition-colors">
                  <td className="py-2 pr-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{v.registration}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{v.trips}</td>
                  <td className="py-2 pr-3 text-emerald-600 dark:text-emerald-400">{v.tripsCompleted}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{v.distanceKm} km</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{v.avgSpeed} km/h</td>
                  <td className="py-2 pr-3 text-orange-600 dark:text-orange-400">{v.maxSpeed} km/h</td>
                  <td className="py-2 pr-3 text-blue-600 dark:text-blue-400">{v.movingHours} h</td>
                  <td className="py-2 pr-3 text-amber-600 dark:text-amber-400">{v.idleHours} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-navy-700">
          <button onClick={() => exportToCSV(vehicles, exportCols, 'vehicle_analytics')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors flex items-center gap-1.5">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => exportToExcel(vehicles, exportCols, 'vehicle_analytics')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5">
            <Download size={12} /> Excel
          </button>
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 3: Driver Analytics
// ─────────────────────────────────────────────────────────────
function DriversTab() {
  const { driverSummary: drivers, loading } = useFleetAnalytics()
  if (loading) return <Skeleton rows={4} />
  if (!drivers?.length) return <NoData message="No driver data for this period." />

  const top5 = drivers.slice(0, 5)

  const exportCols = [
    { label: 'Rank',          key: 'rank' },
    { label: 'Driver',        key: 'name' },
    { label: 'Trips',         key: 'trips' },
    { label: 'Completed',     key: 'tripsCompleted' },
    { label: 'Distance (km)', key: 'distanceKm' },
    { label: 'Driving (h)',   key: 'drivingHours' },
    { label: 'Idle (h)',      key: 'idleHours' },
    { label: 'Attendance %',  key: 'attendance' },
    { label: 'Avg Speed',     key: 'avgSpeed' },
  ]

  return (
    <div className="space-y-4">
      {/* Top drivers podium */}
      <Card title="Driver Ranking — Trips">
        <MiniBarList items={top5} labelKey="name" valueKey="trips" color="bg-gradient-to-r from-violet-500 to-purple-500" />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top Drivers — Distance (km)">
          <MiniBarList items={top5.slice().sort((a,b)=>b.distanceKm-a.distanceKm)} labelKey="name" valueKey="distanceKm" color="bg-gradient-to-r from-emerald-500 to-teal-500" suffix=" km" />
        </Card>
        <Card title="Attendance (%)">
          <MiniBarList items={drivers.slice(0,5)} labelKey="name" valueKey="attendance" color="bg-gradient-to-r from-blue-500 to-cyan-500" suffix="%" />
        </Card>
      </div>

      {/* Table */}
      <Card title="Driver Details">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-navy-700">
                {['#','Driver','Trips','Done','Dist','Drive (h)','Idle (h)','Attend%','Avg Spd'].map(h=>(
                  <th key={h} className="text-left py-2 pr-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-navy-800">
              {drivers.map(d => (
                <tr key={d.id} className="hover:bg-slate-50/60 dark:hover:bg-navy-800/30 transition-colors">
                  <td className="py-2 pr-3 font-black text-slate-400 dark:text-slate-500">
                    {d.rank <= 3 ? ['🥇','🥈','🥉'][d.rank-1] : d.rank}
                  </td>
                  <td className="py-2 pr-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{d.name}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{d.trips}</td>
                  <td className="py-2 pr-3 text-emerald-600 dark:text-emerald-400">{d.tripsCompleted}</td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{d.distanceKm} km</td>
                  <td className="py-2 pr-3 text-blue-600 dark:text-blue-400">{d.drivingHours} h</td>
                  <td className="py-2 pr-3 text-amber-600 dark:text-amber-400">{d.idleHours} h</td>
                  <td className="py-2 pr-3">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${d.attendance >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : d.attendance >= 50 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'}`}>{d.attendance}%</span>
                  </td>
                  <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{d.avgSpeed} km/h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-navy-700">
          <button onClick={() => exportToCSV(drivers, exportCols, 'driver_analytics')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 flex items-center gap-1.5">
            <Download size={12} /> CSV
          </button>
          <button onClick={() => exportToExcel(drivers, exportCols, 'driver_analytics')}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5">
            <Download size={12} /> Excel
          </button>
        </div>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 4: Trip Analytics
// ─────────────────────────────────────────────────────────────
function TripsTab() {
  const { tripSummary: t, distanceSummary: d, loading } = useFleetAnalytics()
  if (loading) return <Skeleton rows={4} />
  if (!t)      return <NoData />

  const statusSegments = [
    { label: 'Completed', value: t.completed ?? 0, color: '#10b981' },
    { label: 'Running',   value: t.running   ?? 0, color: '#f59e0b' },
    { label: 'Cancelled', value: t.cancelled ?? 0, color: '#ef4444' },
    { label: 'Pending',   value: t.pending   ?? 0, color: '#94a3b8' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-4">
      {/* KPI pills */}
      <Card>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatPill label="Total Trips"   value={t.total     ?? 0} color="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" />
          <StatPill label="Completed"     value={t.completed ?? 0} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" />
          <StatPill label="Running"       value={t.running   ?? 0} color="bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" />
          <StatPill label="Cancelled"     value={t.cancelled ?? 0} color="bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status donut */}
        {statusSegments.length > 0 && (
          <Card title="Trip Status Breakdown">
            <div className="flex justify-center py-2">
              <DonutChart segments={statusSegments} size={120} thickness={10} />
            </div>
          </Card>
        )}

        {/* KPI stats */}
        <Card title="Trip Metrics">
          <div className="space-y-3">
            {[
              { label: 'Avg Distance',   value: `${t.avgDistanceKm ?? 0} km` },
              { label: 'Longest Trip',   value: `${t.longestKm  ?? 0} km` },
              { label: 'Shortest Trip',  value: `${t.shortestKm ?? 0} km` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-navy-800 last:border-0">
                <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Trip trend chart */}
      {t.byDay?.length > 1 && (
        <Card title="Daily Trip Volume">
          <BarChart data={t.byDay} valueKey="total" labelKey="date" color="from-violet-500 to-purple-500" height={90} />
        </Card>
      )}

      {/* Distance by day */}
      {d?.byDay?.length > 1 && (
        <Card title="Daily Distance (km)">
          <LineChart data={d.byDay} valueKey="km" labelKey="date" color="#10b981" height={80} />
        </Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 5: Alert Analytics
// ─────────────────────────────────────────────────────────────
function AlertsTab() {
  const { alertSummary: a, loading } = useFleetAnalytics()
  if (loading) return <Skeleton rows={3} />
  if (!a)      return <NoData />

  const severitySegs = [
    { label: 'Critical', value: a.critical ?? 0, color: '#ef4444' },
    { label: 'High',     value: a.high     ?? 0, color: '#f97316' },
    { label: 'Medium',   value: a.medium   ?? 0, color: '#f59e0b' },
    { label: 'Low',      value: a.low      ?? 0, color: '#94a3b8' },
  ].filter(s => s.value > 0)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total Alerts"  value={a.total    ?? 0} icon={Bell}          gradient="bg-gradient-to-br from-slate-500 to-slate-600" />
        <StatCard label="Open"          value={a.open     ?? 0} icon={AlertTriangle}  gradient="bg-gradient-to-br from-red-500 to-red-600" />
        <StatCard label="Resolved"      value={a.resolved ?? 0} icon={CheckCircle}   gradient="bg-gradient-to-br from-emerald-500 to-emerald-600" />
        <StatCard label="Critical"      value={a.critical ?? 0} icon={AlertTriangle}  gradient="bg-gradient-to-br from-rose-600 to-rose-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {severitySegs.length > 0 ? (
          <Card title="By Severity">
            <div className="flex justify-center py-2">
              <DonutChart segments={severitySegs} size={120} thickness={10} />
            </div>
          </Card>
        ) : (
          <Card title="By Severity"><NoData message="No alerts recorded." /></Card>
        )}

        <Card title="By Type">
          <div className="space-y-2">
            {[
              { label: 'Overspeed', value: a.overspeed ?? 0, color: 'text-red-600' },
              { label: 'Idle',      value: a.idle      ?? 0, color: 'text-amber-600' },
              { label: 'Offline',   value: a.offline   ?? 0, color: 'text-slate-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-navy-800 last:border-0">
                <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                <span className={`text-sm font-bold ${color}`}>{value}</span>
              </div>
            ))}
            {(a.byType ?? []).filter(x => !['speed','idle','offline'].some(k=>x.type.includes(k))).slice(0,5).map(x=>(
              <div key={x.type} className="flex items-center justify-between py-1.5 border-b border-slate-50 dark:border-navy-800 last:border-0">
                <span className="text-sm text-slate-500 dark:text-slate-400 capitalize">{x.type.replace(/_/g,' ')}</span>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{x.count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {!a.total && (
        <Card><NoData message="No alerts found. Either fleet_alerts table is empty or no alerts were triggered in this period." /></Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB 6: Geofence Analytics
// ─────────────────────────────────────────────────────────────
function GeofenceTab() {
  const { geofenceSummary: g, loading } = useFleetAnalytics()
  if (loading) return <Skeleton rows={3} />
  if (!g)      return <NoData />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Zones"         value={g.zones        ?? 0} icon={MapPin}     gradient="bg-gradient-to-br from-blue-500 to-blue-600" />
        <StatCard label="Total Events"  value={g.totalEvents  ?? 0} icon={Activity}   gradient="bg-gradient-to-br from-violet-500 to-violet-600" />
        <StatCard label="Entries"       value={g.entries      ?? 0} icon={TrendingUp}  gradient="bg-gradient-to-br from-emerald-500 to-emerald-600" />
        <StatCard label="Exits"         value={g.exits        ?? 0} icon={TrendingUp}  gradient="bg-gradient-to-br from-orange-500 to-orange-600" />
      </div>

      {g.topZones?.length > 0 ? (
        <Card title="Most Visited Zones">
          <MiniBarList items={g.topZones} labelKey="name" valueKey="total" color="bg-gradient-to-r from-blue-500 to-indigo-500" />
        </Card>
      ) : (
        <Card><NoData message="No geofence events recorded. Geofence data is stored locally — events appear after vehicles trigger zone alerts." /></Card>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Filter bar
// ─────────────────────────────────────────────────────────────
function FilterBar() {
  const { filter, setFilter } = useFleetAnalytics()
  return (
    <div className="glass-card rounded-2xl p-3 flex flex-wrap items-center gap-2">
      <Calendar size={14} className="text-slate-400 flex-shrink-0" />
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 mr-1">Period:</span>
      {PRESETS.map(p => (
        <button key={p.key} onClick={() => setFilter(f => ({ ...f, preset: p.key }))}
          className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
            filter.preset === p.key
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700'
          }`}>
          {p.label}
        </button>
      ))}
      {filter.preset === 'custom' && (
        <div className="flex items-center gap-2 ml-1">
          <input type="date" value={filter.customFrom}
            onChange={e => setFilter(f => ({ ...f, customFrom: e.target.value }))}
            className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-slate-400 text-xs">—</span>
          <input type="date" value={filter.customTo}
            onChange={e => setFilter(f => ({ ...f, customTo: e.target.value }))}
            className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function FleetAnalytics() {
  const { activeTab, setActiveTab, loading, error, refresh, fleetSummary } = useFleetAnalytics()

  const TAB_CONTENT = {
    kpi:      <KpiTab />,
    vehicles: <VehiclesTab />,
    drivers:  <DriversTab />,
    trips:    <TripsTab />,
    alerts:   <AlertsTab />,
    geofence: <GeofenceTab />,
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <PageHeader
        title="Fleet Analytics"
        subtitle="Operational intelligence from live Supabase data"
        action={
          <button onClick={refresh} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-60">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      {/* Date filter */}
      <FilterBar />

      {/* Tab nav */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25'
                  : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-navy-700 hover:bg-slate-50 dark:hover:bg-navy-700'
              }`}>
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card rounded-2xl p-4 border-l-4 border-red-500">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Tab content */}
      <div className="min-h-[300px]">
        {TAB_CONTENT[activeTab] ?? <NoData />}
      </div>
    </div>
  )
}
