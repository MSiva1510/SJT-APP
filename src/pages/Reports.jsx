import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Car, Users, User, IndianRupee, AlertTriangle,
  CheckCircle, Download, BarChart2, FileText,
  RefreshCw, Navigation, TrendingUp, TrendingDown,
  Calendar, Table,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import Avatar     from '../components/ui/Avatar'
import { useAuth } from '../context/AuthContext'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import {
  getExecutiveSummary, getTripReport, getDriverPerformance,
  getVehiclePerformance, getCustomerReport, getExpenseAnalytics,
  getPayrollAnalytics, getOperationsMonitor, getBusinessAlerts,
  exportToCSV, exportToExcel, exportToPDF, getMonthlySummary,
  todayStr, thisMonthStr,
} from '../data/reportData'
import { getStatusCfg } from '../data/tripTypes'

// ─────────────────────────────────────────────────────────────
//  Primitives
// ─────────────────────────────────────────────────────────────
function SectionTitle({ title, sub }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">{sub}</p>
      <h3 className="font-display font-black text-slate-800 dark:text-white text-lg">{title}</h3>
    </div>
  )
}

function KpiChip({ label, value, color }) {
  return (
    <div className="glass-card rounded-xl px-3 py-2.5 text-center">
      <p className={`text-xl font-display font-black leading-none ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}

function MiniBar({ label, value, max, color='bg-gradient-to-r from-blue-500 to-indigo-500', suffix='' }) {
  const pct = max>0 ? Math.round((value/max)*100) : 0
  return (
    <div className="mb-2.5 last:mb-0">
      {label && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[180px]">{label}</span>
          <span className="font-bold text-slate-700 dark:text-slate-200 flex-shrink-0 ml-2">{suffix}{Number(value).toLocaleString('en-IN')}</span>
        </div>
      )}
      <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width:`${pct}%`, transition:'width .5s' }} />
      </div>
    </div>
  )
}

function OpsBlock({ label, items }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">{label}</p>
      <div className="space-y-2.5">
        {items.map(it => (
          <div key={it.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${it.dot}`} />
              <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{it.label}</span>
            </div>
            <span className={`text-sm font-display font-black ${it.color}`}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExportBtn({ onClick }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-all active:scale-95">
      <Download size={13} /> CSV
    </button>
  )
}

function ExportPanel({ onCSV, onExcel, onPDF }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-all active:scale-95">
        <Download size={13} /> Export ▾
      </button>
      {open && (
        <div className="absolute right-0 top-9 bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 rounded-xl shadow-xl z-20 overflow-hidden py-1 min-w-[130px]">
          {[{label:'CSV',icon:'📊',fn:onCSV},{label:'Excel',icon:'📗',fn:onExcel},{label:'PDF',icon:'📄',fn:onPDF}].map(o => (
            <button key={o.label} onClick={() => { o.fn?.(); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
              <span>{o.icon}</span> {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 1: Executive Overview
// ─────────────────────────────────────────────────────────────
function ExecutiveOverview({ summary }) {
  const { trips, customers, vehicles, drivers, finance } = summary
  const cards = [
    { title:'Trips',     icon:Navigation, color:'text-blue-600 dark:text-blue-400',     bg:'bg-blue-50 dark:bg-blue-900/20',
      stats:[{l:'Total',v:trips.total,c:'text-navy-800 dark:text-blue-300'},{l:'Active',v:trips.active,c:'text-amber-600 dark:text-amber-400'},{l:'Completed',v:trips.completed,c:'text-emerald-600 dark:text-emerald-400'},{l:'Cancelled',v:trips.cancelled,c:'text-red-600 dark:text-red-400'}] },
    { title:'Customers', icon:Users,      color:'text-violet-600 dark:text-violet-400', bg:'bg-violet-50 dark:bg-violet-900/20',
      stats:[{l:'Total',v:customers.total,c:'text-navy-800 dark:text-blue-300'},{l:'Active',v:customers.active,c:'text-emerald-600 dark:text-emerald-400'},{l:'Corporate',v:customers.corporate,c:'text-violet-600 dark:text-violet-400'},{l:'Revenue',v:`Rs.${(finance.totalFare/1000).toFixed(0)}k`,c:'text-amber-600 dark:text-amber-400'}] },
    { title:'Vehicles',  icon:Car,        color:'text-teal-600 dark:text-teal-400',     bg:'bg-teal-50 dark:bg-teal-900/20',
      stats:[{l:'Total',v:vehicles.total,c:'text-navy-800 dark:text-blue-300'},{l:'Available',v:vehicles.available,c:'text-emerald-600 dark:text-emerald-400'},{l:'In Use',v:vehicles.inUse,c:'text-blue-600 dark:text-blue-400'},{l:'Maintenance',v:vehicles.maintenance,c:'text-red-600 dark:text-red-400'}] },
    { title:'Drivers',   icon:User,       color:'text-emerald-600 dark:text-emerald-400',bg:'bg-emerald-50 dark:bg-emerald-900/20',
      stats:[{l:'Total',v:drivers.total,c:'text-navy-800 dark:text-blue-300'},{l:'Available',v:drivers.available,c:'text-emerald-600 dark:text-emerald-400'},{l:'On Leave',v:drivers.onLeave,c:'text-amber-600 dark:text-amber-400'},{l:'Net Income',v:`Rs.${(finance.totalNet/1000).toFixed(0)}k`,c:'text-teal-600 dark:text-teal-400'}] },
  ]
  const financeKpis = [
    { label:'Total Revenue',  value:`Rs. ${(finance.totalFare/1000).toFixed(1)}k`, sub:'All bookings',  color:'text-navy-800 dark:text-blue-300',         bg:'bg-blue-50 dark:bg-blue-900/20',       icon:IndianRupee  },
    { label:'Total Expenses', value:`Rs. ${(finance.totalExp /1000).toFixed(1)}k`, sub:'Paid out',      color:'text-red-700 dark:text-red-400',            bg:'bg-red-50 dark:bg-red-900/20',         icon:TrendingDown },
    { label:'Net Profit',     value:`Rs. ${(finance.totalNet /1000).toFixed(1)}k`, sub:'Revenue − Exp', color:'text-emerald-700 dark:text-emerald-400',    bg:'bg-emerald-50 dark:bg-emerald-900/20', icon:TrendingUp   },
    { label:'Avg Trip Fare',  value: trips.total > 0 ? `Rs. ${Math.round(finance.totalFare/trips.total).toLocaleString('en-IN')}` : '—', sub:'Per trip', color:'text-amber-700 dark:text-amber-400', bg:'bg-amber-50 dark:bg-amber-900/20', icon:Car },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {financeKpis.map(k => (
          <div key={k.label} className="glass-card rounded-2xl p-4">
            <div className={`w-8 h-8 rounded-xl ${k.bg} flex items-center justify-center mb-3`}>
              <k.icon size={14} className={k.color} />
            </div>
            <p className={`text-xl font-display font-black ${k.color}`}>{k.value}</p>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-200 mt-0.5">{k.label}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">{k.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.title} className="glass-card rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-xl ${card.bg} flex items-center justify-center flex-shrink-0`}>
                <card.icon size={15} className={card.color} />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{card.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {card.stats.map(s => (
                <div key={s.l} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2 text-center">
                  <p className={`text-base font-display font-black ${s.c}`}>{s.v}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 2: Trip Reports
// ─────────────────────────────────────────────────────────────
function TripReports() {
  const today  = todayStr()
  const monStr = thisMonthStr()
  const [from, setFrom]     = useState(monStr+'-01')
  const [to, setTo]         = useState(today)
  const [driver, setDriver] = useState('all')
  const [vehicle,setVehicle]= useState('all')
  const [report, setReport] = useState({ rows:[], totalRevenue:0, totalDistance:0, completed:0, cancelled:0, cancelRate:0 })
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  useEffect(()=>{ getTripReport(from,to,driver,vehicle).then(d=>setReport(d ?? { rows:[], totalRevenue:0, totalDistance:0, completed:0, cancelled:0, cancelRate:0 })) },[from,to,driver,vehicle])
  useEffect(() => {
    loadDrivers().then(d => setDrivers(Array.isArray(d) ? d : [])).catch(err => console.error('[Reports] load drivers failed:', err))
    loadVehicles().then(v => setVehicles(Array.isArray(v) ? v : [])).catch(err => console.error('[Reports] load vehicles failed:', err))
  }, [])

  const handleExport = () => exportToCSV(report.rows,[
    {label:'Booking No.',key:'bookingNo'},{label:'Customer',key:'customer'},
    {label:'Type',key:'type'},{label:'Date',key:'startDate'},
    {label:'Pickup',key:'pickup'},{label:'Drop',key:'drop'},
    {label:'Driver',key:'driver'},{label:'Vehicle',key:'vehicle'},
    {label:'Fare',key:'fare'},{label:'KM',key:'km'},{label:'Status',key:'status'},
  ],'trip_report')

  const sel = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none'
  const inp = 'w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[110px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">From</label>
            <input type="date" value={from} onChange={e=>setFrom(e.target.value)} max={to} className={inp} />
          </div>
          <div className="flex-1 min-w-[110px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">To</label>
            <input type="date" value={to} onChange={e=>setTo(e.target.value)} min={from} max={today} className={inp} />
          </div>
          <div className="flex-1 min-w-[110px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Driver</label>
            <select value={driver} onChange={e=>setDriver(e.target.value)} className={sel}>
              <option value="all">All Drivers</option>
              {drivers.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[110px]">
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Vehicle</label>
            <select value={vehicle} onChange={e=>setVehicle(e.target.value)} className={sel}>
              <option value="all">All Vehicles</option>
              {vehicles.map(v=><option key={v.id} value={v.reg}>{v.reg}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiChip label="Trips"       value={report.rows.length}                         color="text-navy-800 dark:text-blue-300" />
        <KpiChip label="Completed"   value={report.completed}                           color="text-emerald-600 dark:text-emerald-400" />
        <KpiChip label="Cancelled"   value={report.cancelled}                           color="text-red-600 dark:text-red-400" />
        <KpiChip label="Revenue"     value={`Rs.${(report.totalRevenue/1000).toFixed(1)}k`} color="text-amber-600 dark:text-amber-400" />
        <KpiChip label="Cancel Rate" value={`${report.cancelRate}%`}                   color="text-violet-600 dark:text-violet-400" />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-navy-700">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{report.rows.length} trips</p>
          <ExportBtn onClick={handleExport} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-navy-800/50 border-b border-slate-100 dark:border-navy-700">
                {['Booking','Customer','Date','Route','Driver','Fare','Status'].map(h=>(
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.length===0
                ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">No trips in selected range</td></tr>
                : report.rows.slice(0,20).map(b=>{
                    const st=getStatusCfg(b.status)
                    return (
                      <tr key={b.id} className="border-b border-slate-50 dark:border-navy-800 hover:bg-slate-50/50 dark:hover:bg-navy-800/30 transition-colors">
                        <td className="px-4 py-2.5 text-[11px] font-mono text-slate-500 whitespace-nowrap">{b.bookingNo}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{b.customer}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.startDate}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 max-w-[150px] truncate">{b.pickup} → {b.drop||'—'}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300">{b.driver||'—'}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-navy-800 dark:text-blue-300 whitespace-nowrap">Rs.{(b.fare||0).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-2.5"><span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${st.badge}`}>{st.label}</span></td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
        {report.rows.length>20 && (
          <p className="px-4 py-2.5 text-xs text-slate-400 text-center border-t border-slate-100 dark:border-navy-700">
            Showing 20 of {report.rows.length} — Export CSV for all rows
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 3: Driver Performance
// ─────────────────────────────────────────────────────────────
function DriverPerformance() {
  const [data, setData] = useState([])
  useEffect(()=>{ getDriverPerformance().then(d=>setData(Array.isArray(d)?d:[])) },[])
  const maxTrips = Math.max(...data.map(d=>d.completedTrips),1)
  const handleExport = ()=>exportToCSV(data,[
    {label:'Driver',key:'name'},{label:'Total Trips',key:'totalTrips'},
    {label:'Completed',key:'completedTrips'},{label:'Revenue (Rs.)',key:'revenue'},
    {label:'Present Days',key:'presentDays'},{label:'Working Hours',key:'workingHours'},
    {label:'Incentive (Rs.)',key:'incentive'},{label:'Rating',key:'rating'},
  ],'driver_performance')
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {data.map((d,i)=>(
        <div key={d.id} className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative flex-shrink-0">
              <Avatar name={d.name} size={40} />
              {i===0&&<span className="absolute -top-1 -right-1 text-base">🏆</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-800 dark:text-white text-sm">{d.name}</p>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">★ {d.rating}</span>
              </div>
              <p className="text-[10px] text-slate-400">{d.vehicle} · {d.vehicleType}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-base font-black text-navy-800 dark:text-blue-300">{d.completedTrips} trips</p>
              <p className="text-[10px] text-slate-400">{d.presentDays} days present</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {[
              {l:'Revenue',    v:`Rs.${(d.revenue/1000).toFixed(1)}k`,    c:'text-emerald-600 dark:text-emerald-400'},
              {l:'Working Hrs',v:d.workingHours,                          c:'text-blue-600 dark:text-blue-400'},
              {l:'Incentive',  v:`Rs.${d.incentive.toLocaleString()}`,    c:'text-violet-600 dark:text-violet-400'},
              {l:'Total Trips',v:d.totalTrips,                            c:'text-slate-700 dark:text-slate-200'},
            ].map(s=>(
              <div key={s.l} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center">
                <p className={`text-sm font-display font-black ${s.c}`}>{s.v}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
          <MiniBar value={d.completedTrips} max={maxTrips} color="bg-gradient-to-r from-navy-700 to-blue-500" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 4: Vehicle Performance
// ─────────────────────────────────────────────────────────────
function VehiclePerformance() {
  const [data, setData] = useState([])
  useEffect(()=>{ getVehiclePerformance().then(d=>setData(Array.isArray(d)?d:[])) },[])
  const maxTrips = Math.max(...data.map(v=>v.completedTrips),1)
  const handleExport = ()=>exportToCSV(data,[
    {label:'Vehicle',key:'reg'},{label:'Type',key:'type'},{label:'Model',key:'model'},
    {label:'Total Trips',key:'totalTrips'},{label:'Completed',key:'completedTrips'},
    {label:'Distance (KM)',key:'distance'},{label:'Fuel Cost (Rs.)',key:'fuelCost'},
    {label:'Maint Cost (Rs.)',key:'maintCost'},{label:'Total Cost (Rs.)',key:'totalCost'},
  ],'vehicle_performance')
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      {data.map((v,i)=>(
        <div key={v.id} className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${i===0?'bg-gradient-to-br from-navy-700 to-blue-600':'bg-navy-900 dark:bg-navy-800'}`}>
              <Car size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display font-black text-slate-800 dark:text-white text-base tracking-wider">{v.reg}</p>
                {i===0&&<span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">Most Used</span>}
                {i===data.length-1&&data.length>1&&<span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-navy-700 px-2 py-0.5 rounded-full">Least Used</span>}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{v.model} · {v.type}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-base font-black text-navy-800 dark:text-blue-300">{v.completedTrips} trips</p>
              <p className="text-[10px] text-slate-400">{v.distance.toLocaleString()} km</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              {l:'Fuel Cost', v:`Rs.${v.fuelCost.toLocaleString()}`,  c:'text-orange-600 dark:text-orange-400'},
              {l:'Maint Cost',v:`Rs.${v.maintCost.toLocaleString()}`, c:'text-red-600 dark:text-red-400'},
              {l:'Total Cost',v:`Rs.${v.totalCost.toLocaleString()}`, c:'text-amber-600 dark:text-amber-400'},
            ].map(s=>(
              <div key={s.l} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center">
                <p className={`text-sm font-display font-black ${s.c}`}>{s.v}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
          <MiniBar value={v.completedTrips} max={maxTrips} color="bg-gradient-to-r from-teal-500 to-cyan-400" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 5: Customer Reports
// ─────────────────────────────────────────────────────────────
function CustomerReports() {
  const [report, setReport] = useState({ rows:[], totalCustomers:0, repeatCustomers:0, corporateCustomers:0, topByRevenue:[], topByTrips:[] })
  useEffect(()=>{ getCustomerReport().then(d=>setReport(d ?? { rows:[], totalCustomers:0, repeatCustomers:0, corporateCustomers:0, topByRevenue:[], topByTrips:[] })) },[])
  const maxTrips = Math.max(...report.topByTrips.map(c=>c.totalTrips),1)
  const handleExport = ()=>exportToCSV(report.rows,[
    {label:'Customer',key:'name'},{label:'Type',key:'type'},{label:'City',key:'city'},
    {label:'Mobile',key:'mobile'},{label:'Total Trips',key:'totalTrips'},
    {label:'Completed',key:'completedTrips'},{label:'Revenue (Rs.)',key:'totalRevenue'},
  ],'customer_report')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiChip label="Total Customers"   value={report.totalCustomers}     color="text-navy-800 dark:text-blue-300" />
        <KpiChip label="Repeat Customers"  value={report.repeatCustomers}    color="text-emerald-600 dark:text-emerald-400" />
        <KpiChip label="Corporate / Agent" value={report.corporateCustomers} color="text-violet-600 dark:text-violet-400" />
      </div>
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Top by Revenue</p>
          {report.topByRevenue.map((c,i)=>(
            <div key={c.id} className="flex items-center gap-2.5 mb-3 last:mb-0">
              <span className="text-[10px] font-bold text-slate-400 w-4 flex-shrink-0">{i+1}</span>
              <Avatar name={c.name} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{c.name}</p>
                <p className="text-[10px] text-slate-400">{c.totalTrips} trips</p>
              </div>
              <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0">Rs.{c.totalRevenue.toLocaleString('en-IN')}</p>
            </div>
          ))}
        </div>
        <div className="glass-card rounded-2xl p-4">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Top by Trips</p>
          {report.topByTrips.map((c,i)=>(
            <div key={c.id} className="mb-3 last:mb-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-slate-400 w-4 flex-shrink-0">{i+1}</span>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">{c.name}</p>
                <p className="text-xs font-black text-navy-800 dark:text-blue-300">{c.totalTrips}</p>
              </div>
              <MiniBar value={c.totalTrips} max={maxTrips} color="bg-gradient-to-r from-violet-500 to-purple-400" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 6: Expense Analytics
// ─────────────────────────────────────────────────────────────
function ExpenseAnalytics() {
  const [data, setData] = useState({ months:[], byCategory:[], monthTotal:0, allTimeTotal:0 })
  useEffect(()=>{ getExpenseAnalytics().then(d=>setData(d ?? { months:[], byCategory:[], monthTotal:0, allTimeTotal:0 })) },[])
  const maxMonth = Math.max(...data.months.map(m=>m.tot),1)
  const handleExport = ()=>exportToCSV(
    data.months.map(m=>({month:m.lbl,total:m.tot})),
    [{label:'Month',key:'month'},{label:'Total (Rs.)',key:'total'}],
    'expense_analytics'
  )
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExportBtn onClick={handleExport} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">6-Month Trend</p>
          <div className="flex items-end gap-1.5 h-24 mb-3">
            {data.months.map((m,i)=>{
              const isLast=i===data.months.length-1
              const pct=Math.max(6,Math.round((m.tot/maxMonth)*100))
              return (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full relative group">
                    <div className={`w-full rounded-t-md ${isLast?'bg-gradient-to-t from-amber-500 to-amber-400':'bg-slate-200 dark:bg-navy-700'}`}
                      style={{height:`${pct*0.6}px`}} />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-navy-900 text-white text-[10px] font-bold px-2 py-1 rounded-lg whitespace-nowrap pointer-events-none z-10">
                      Rs.{m.tot.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <span className="text-[9px] font-bold text-slate-400">{m.lbl}</span>
                </div>
              )
            })}
          </div>
          <div className="flex justify-between text-xs border-t border-slate-100 dark:border-navy-700 pt-2">
            <span className="text-slate-500">This Month</span>
            <span className="font-bold text-amber-600 dark:text-amber-400">Rs.{data.monthTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">By Category (All Time)</p>
          <div className="space-y-2.5">
            {data.byCategory.slice(0,7).map(t=>(
              <div key={t.key} className="flex items-center gap-2.5">
                <span className="text-base flex-shrink-0">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <MiniBar label={t.label} value={t.total} max={data.byCategory[0]?.total||1}
                    color={`bg-gradient-to-r ${t.color}`} suffix="Rs." />
                </div>
              </div>
            ))}
            {data.byCategory.length===0&&<p className="text-xs text-slate-400 text-center py-4">No expense data</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 7: Payroll Analytics
// ─────────────────────────────────────────────────────────────
function PayrollAnalytics() {
  const [data, setData] = useState({ totalPaid:0, pendingCount:0, approvedCount:0, paidCount:0, draftCount:0, totalIncentives:0, byDriver:[] })
  useEffect(()=>{ getPayrollAnalytics().then(d=>setData(d ?? { totalPaid:0, pendingCount:0, approvedCount:0, paidCount:0, draftCount:0, totalIncentives:0, byDriver:[] })) },[])
  const maxPay = Math.max(...data.byDriver.map(d=>d.paid),1)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiChip label="Total Paid"        value={`Rs.${(data.totalPaid/1000).toFixed(1)}k`}            color="text-emerald-600 dark:text-emerald-400" />
        <KpiChip label="Pending Approval"  value={data.pendingCount}                                    color="text-blue-600 dark:text-blue-400" />
        <KpiChip label="Approved (Unpaid)" value={data.approvedCount}                                   color="text-violet-600 dark:text-violet-400" />
        <KpiChip label="Total Incentives"  value={`Rs.${data.totalIncentives.toLocaleString('en-IN')}`} color="text-amber-600 dark:text-amber-400" />
      </div>
      <div className="glass-card rounded-2xl p-5">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">Paid Amount by Driver</p>
        {data.byDriver.map(d=>(
          <div key={d.name} className="flex items-center gap-3 mb-4 last:mb-0">
            <Avatar name={d.name} size={28} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{d.name}</p>
                <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 flex-shrink-0 ml-2">Rs.{d.paid.toLocaleString('en-IN')}</p>
              </div>
              <MiniBar value={d.paid} max={maxPay} color="bg-gradient-to-r from-emerald-500 to-teal-400" />
              <p className="text-[10px] text-slate-400 mt-0.5">{d.count} settlement{d.count!==1?'s':''}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 8: Operations Monitor
// ─────────────────────────────────────────────────────────────
function OperationsMonitor() {
  const [ops, setOps] = useState({ drivers:{available:0,onLeave:0}, vehicles:{available:0,maintenance:0,assigned:0}, trips:{scheduled:0,assigned:0,inProgress:0,completed:0,cancelled:0} })
  useEffect(()=>{ getOperationsMonitor().then(d=>setOps(d ?? { drivers:{available:0,onLeave:0}, vehicles:{available:0,maintenance:0,assigned:0}, trips:{scheduled:0,assigned:0,inProgress:0,completed:0,cancelled:0} })) },[])
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <OpsBlock label="Drivers" items={[
        {label:'Available', value:ops.drivers.available, dot:'bg-emerald-500', color:'text-emerald-600 dark:text-emerald-400'},
        {label:'On Leave',  value:ops.drivers.onLeave,   dot:'bg-amber-500',   color:'text-amber-600 dark:text-amber-400'},
      ]} />
      <OpsBlock label="Vehicles" items={[
        {label:'Available',   value:ops.vehicles.available,   dot:'bg-emerald-500', color:'text-emerald-600 dark:text-emerald-400'},
        {label:'Assigned',    value:ops.vehicles.assigned,    dot:'bg-blue-500',    color:'text-blue-600 dark:text-blue-400'},
        {label:'Maintenance', value:ops.vehicles.maintenance, dot:'bg-red-500',     color:'text-red-600 dark:text-red-400'},
      ]} />
      <OpsBlock label="Trips" items={[
        {label:'Scheduled',   value:ops.trips.scheduled,  dot:'bg-slate-400',              color:'text-slate-600 dark:text-slate-300'},
        {label:'Assigned',    value:ops.trips.assigned,   dot:'bg-blue-500',               color:'text-blue-600 dark:text-blue-400'},
        {label:'In Progress', value:ops.trips.inProgress, dot:'bg-amber-500 animate-pulse',color:'text-amber-600 dark:text-amber-400'},
        {label:'Completed',   value:ops.trips.completed,  dot:'bg-emerald-500',            color:'text-emerald-600 dark:text-emerald-400'},
        {label:'Cancelled',   value:ops.trips.cancelled,  dot:'bg-red-500',                color:'text-red-600 dark:text-red-400'},
      ]} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Module 9: Business Alerts
// ─────────────────────────────────────────────────────────────
function BusinessAlerts() {
  const [alerts, setAlerts] = useState([])
  useEffect(()=>{ getBusinessAlerts().then(setAlerts).catch(err=>console.error('[Reports] alerts load failed:',err)) },[])
  const PC = {
    high:  {badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',         label:'High'},
    medium:{badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label:'Medium'},
    low:   {badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',     label:'Low'},
  }
  const TI = {insurance:'🛡',permit:'📋',fc:'📄',puc:'💨',service:'🔧'}
  if (alerts.length===0) return (
    <div className="glass-card rounded-2xl p-8 text-center">
      <CheckCircle size={36} className="mx-auto text-emerald-400 mb-3" />
      <p className="font-bold text-slate-700 dark:text-slate-200">All documents are up to date</p>
      <p className="text-xs text-slate-400 mt-1">No alerts at this time</p>
    </div>
  )
  return (
    <div className="space-y-2.5">
      {alerts.map((a,i)=>{
        const pc=PC[a.priority]||PC.low
        return (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
            a.priority==='high'?'bg-red-50 dark:bg-red-900/15 border-red-200 dark:border-red-800/30':'bg-amber-50 dark:bg-amber-900/15 border-amber-200 dark:border-amber-800/30'
          }`}>
            <span className="text-xl flex-shrink-0">{TI[a.type]||'⚠'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{a.label}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Expires: {a.expiry} · {a.days<0?`${Math.abs(a.days)}d overdue`:a.days===0?'Today!':`${a.days}d left`}
              </p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${pc.badge}`}>{pc.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Reports Page
// ─────────────────────────────────────────────────────────────
// ── Monthly Summary (Day 29 Module 6) ────────────────────────
const ML = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function MonthlySummary() {
  const curYear = new Date().getFullYear()
  const [year, setYear] = useState(curYear)
  const [data, setData] = useState([])
  useEffect(() => { getMonthlySummary(year).then(setData).catch(()=>{}) }, [year])
  const maxRev = Math.max(...data.map(d=>d.revenue), 1)
  const totalRev = data.reduce((s,d)=>s+d.revenue,0)
  const totalBk  = data.reduce((s,d)=>s+d.bookings,0)
  const COLS = [{label:'Month',key:'month'},{label:'Bookings',key:'bookings'},{label:'Completed',key:'completed'},{label:'Cancelled',key:'cancelled'},{label:'Revenue',key:'revenue'}]
  const exportRows = data.map(d => ({...d, month:ML[d.month-1]}))
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">Year</label>
          <select value={year} onChange={e=>setYear(Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
            {[curYear-1,curYear,curYear+1].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <ExportPanel
          onCSV={()=>exportToCSV(exportRows,COLS,`monthly_${year}`)}
          onExcel={()=>exportToExcel(exportRows,COLS,`monthly_${year}`)}
          onPDF={()=>exportToPDF(exportRows,COLS,`monthly_${year}`,`Monthly Summary ${year}`)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card rounded-xl p-3 text-center"><p className="text-2xl font-display font-black text-navy-800 dark:text-white">Rs. {totalRev.toLocaleString('en-IN')}</p><p className="text-[10px] text-slate-400 mt-0.5">Total Revenue {year}</p></div>
        <div className="glass-card rounded-xl p-3 text-center"><p className="text-2xl font-display font-black text-blue-600 dark:text-blue-400">{totalBk}</p><p className="text-[10px] text-slate-400 mt-0.5">Total Bookings {year}</p></div>
      </div>
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Revenue by Month</p>
        {data.map(d=>(
          <div key={d.month}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-bold text-slate-700 dark:text-slate-200">{ML[d.month-1]}</span>
              <span className="text-slate-500 dark:text-slate-400">{d.bookings} trips · <span className="font-bold text-emerald-600 dark:text-emerald-400">Rs. {d.revenue.toLocaleString('en-IN')}</span></span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-navy-600 to-blue-500 transition-all duration-500" style={{width:`${Math.round((d.revenue/maxRev)*100)}%`}} />
            </div>
          </div>
        ))}
      </div>
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
              {COLS.map(c=><th key={c.key} className="px-4 py-2.5 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{c.label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-50 dark:divide-navy-800">
              {exportRows.map((r,i)=>(
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/20 transition-colors">
                  <td className="px-4 py-2.5 font-bold text-slate-700 dark:text-slate-200">{r.month}</td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.bookings}</td>
                  <td className="px-4 py-2.5 text-emerald-600 dark:text-emerald-400 font-bold">{r.completed}</td>
                  <td className="px-4 py-2.5 text-red-500">{r.cancelled}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-white">Rs. {r.revenue.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const TABS = [
  {key:'overview',  label:'Overview',   icon:BarChart2},
  {key:'trips',     label:'Trips',      icon:Navigation},
  {key:'drivers',   label:'Drivers',    icon:User},
  {key:'vehicles',  label:'Vehicles',   icon:Car},
  {key:'customers', label:'Customers',  icon:Users},
  {key:'expenses',  label:'Expenses',   icon:TrendingUp},
  {key:'payroll',   label:'Payroll',    icon:IndianRupee},
  {key:'monthly',   label:'Monthly',    icon:Calendar},
  {key:'operations',label:'Operations', icon:RefreshCw},
  {key:'alerts',    label:'Alerts',     icon:AlertTriangle},
]

const TAB_META = {
  overview:  {title:'Executive Overview',  sub:'All modules snapshot'},
  monthly:   {title:'Monthly Summary',     sub:'Revenue by month with export'},
  trips:     {title:'Trip Reports',        sub:'Date range filter + CSV export'},
  drivers:   {title:'Driver Performance',  sub:'Current month'},
  vehicles:  {title:'Vehicle Performance', sub:'All time'},
  customers: {title:'Customer Reports',    sub:'All customers'},
  expenses:  {title:'Expense Analytics',   sub:'6-month view'},
  payroll:   {title:'Payroll Analytics',   sub:'All settlements'},
  operations:{title:'Operations Monitor',  sub:'Live status'},
  alerts:    {title:'Business Alerts',     sub:'Documents & service'},
}

export default function Reports() {
  const { isDriver } = useAuth()
  const [tab,    setTab]   = useState('overview')
  const [summary, setSummary] = useState({ trips:{total:0,active:0,completed:0,cancelled:0,assigned:0,scheduled:0}, customers:{total:0,corporate:0,active:0}, vehicles:{total:0,available:0,inUse:0,maintenance:0}, drivers:{total:0,available:0,onLeave:0}, finance:{totalFare:0,totalNet:0,totalKm:0,totalExp:0,monthExpenses:0,paidPayroll:0} })
  useEffect(()=>{ getExecutiveSummary().then(d=>setSummary(d ?? summary)) },[])
  const [alerts, setAlerts] = useState([])
  useEffect(()=>{ getBusinessAlerts().then(setAlerts).catch(err=>console.error('[Reports] alerts load failed:',err)) },[])

  if (isDriver) return (
    <div className="glass-card rounded-2xl p-12 text-center">
      <AlertTriangle size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
      <p className="font-bold text-slate-500 dark:text-slate-400">Reports are not available for drivers.</p>
    </div>
  )

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Business intelligence across all modules"
        action={alerts.length>0&&(
          <button onClick={()=>setTab('alerts')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 text-red-700 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
            <AlertTriangle size={13} /> {alerts.length} Alert{alerts.length!==1?'s':''}
          </button>
        )}
      />

      {/* Tab bar */}
      <div className="overflow-x-auto no-scrollbar">
        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-2xl p-1" style={{minWidth:'max-content'}}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                tab===t.key?'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow':'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}>
              <t.icon size={13} />
              {t.label}
              {t.key==='alerts'&&alerts.length>0&&(
                <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ml-0.5">{alerts.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle title={TAB_META[tab]?.title||''} sub={TAB_META[tab]?.sub||''} />
        {tab==='overview'   && <ExecutiveOverview summary={summary} />}
        {tab==='trips'      && <TripReports />}
        {tab==='drivers'    && <DriverPerformance />}
        {tab==='vehicles'   && <VehiclePerformance />}
        {tab==='customers'  && <CustomerReports />}
        {tab==='expenses'   && <ExpenseAnalytics />}
        {tab==='payroll'    && <PayrollAnalytics />}
        {tab==='monthly'    && <MonthlySummary />}
        {tab==='operations' && <OperationsMonitor />}
        {tab==='alerts'     && <BusinessAlerts />}
      </div>
    </div>
  )
}