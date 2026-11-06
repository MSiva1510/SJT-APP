import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Plus, Wrench, Shield, Fuel, Gauge, X, CheckCircle,
  ChevronDown, ChevronUp, AlertTriangle, Car, User,
  Calendar, FileText, Edit2, History, MapPin, Clock,
} from 'lucide-react'
import PageHeader   from '../components/ui/PageHeader'
import Avatar       from '../components/ui/Avatar'
import ModalOverlay from '../components/ui/ModalOverlay'
import { useAuth }  from '../context/AuthContext'
import { vehicleRepository }                       from '../repositories/vehicleRepository'
import { driverRepository }                        from '../repositories/driverRepository'
import { loadDrivers }                            from '../data/driverData'
import { loadVehicles }                           from '../data/vehicleData'
import { loadVehicleAssignments, saveVehicleAssignment } from '../data/attendanceData'
import { docStatus, daysLabel }                    from '../utils/vehicleUtils'
import { getVehicleStatusEntry, getVehicleStatusCfg }   from '../data/vehicleStatusData'
import { fmtAuditTime }                            from '../data/auditLogData'
import { loadBookings }                            from '../data/tripTypes'
import { withTimeout } from '../utils/withTimeout'

// ─────────────────────────────────────────────────────────────
//  Status config
// ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  active:      { label:'Available',   badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', dot:'bg-emerald-500' },
  assigned:    { label:'Assigned',    badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',             dot:'bg-blue-500'    },
  maintenance: { label:'Maintenance', badge:'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',                 dot:'bg-red-500'     },
  offline:     { label:'Offline',     badge:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',            dot:'bg-slate-400'   },
}
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.active
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
//  Document row
// ─────────────────────────────────────────────────────────────
function DocRow({ icon: Icon, label, number, expiry }) {
  const st = docStatus(expiry)
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-100 dark:border-navy-700 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0">
        <Icon size={12} className="text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${st.badge}`}>{st.label}</span>
        </div>
        {number && <p className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">{number}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">{expiry || '—'}</p>
        {st.days != null && (
          <p className={`text-[9px] font-bold ${st.key === 'expired' ? 'text-red-500' : st.key === 'soon' ? 'text-amber-500' : 'text-emerald-500'}`}>
            {daysLabel(st.days)}
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Add / Edit Vehicle Modal
//  Field helpers defined OUTSIDE modal — prevents remount on keystroke
// ─────────────────────────────────────────────────────────────
const EMPTY_VEHICLE = {
  id: null, reg:'', type:'4+1 Sedan', model:'', year: new Date().getFullYear(),
  km:0, status:'active', fuelType:'Petrol', color:'White', driver:'',
  lastServiceDate:'', lastServiceKm:'', nextServiceDate:'', nextServiceKm:'',
  insProvider:'', insNumber:'', insExpiry:'',
  permitNumber:'', permitExpiry:'',
  fcNumber:'', fcExpiry:'',
  pucNumber:'', pucExpiry:'',
}

function VField({ label, field, type='text', required, value, onChange }) {
  const handleChange = (e) => {
    let v = e.target.value
    if (field === 'reg')          { v = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) }
    if (field === 'model')        { v = v.slice(0, 40) }
    if (field === 'color')        { v = v.replace(/[^a-zA-Z\s]/g, '').slice(0, 20) }
    if (field === 'year')         { v = v.replace(/\D/g, '').slice(0, 4) }
    if (['lastServiceKm','nextServiceKm','km'].includes(field)) {
      v = v.replace(/\D/g, '').slice(0, 7)
    }
    if (['insNumber','permitNumber','fcNumber','pucNumber'].includes(field)) {
      v = v.toUpperCase().replace(/[^A-Z0-9\-/]/g, '').slice(0, 20)
    }
    onChange(field, v)
  }
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input type={type} value={value || ''} onChange={handleChange} required={required}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/25 transition-all" />
    </div>
  )
}

function VSelectField({ label, field, options, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</label>
      <select value={value || ''} onChange={e => onChange(field, e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 focus:outline-none appearance-none">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Vehicle Service Panel (Module 8) ─────────────────────────
const SVC_TYPES = [
  {key:'oil_change',label:'Oil Change'},{key:'tyre',label:'Tyre'},{key:'battery',label:'Battery'},
  {key:'brake',label:'Brake'},{key:'general',label:'General Service'},{key:'other',label:'Other'},
]
const SVC_ICONS = {oil_change:'🛢️',tyre:'🔄',battery:'🔋',brake:'⛔',general:'🔧',other:'🔧'}
const SVC_LS = id => `sjt_vsvc_${id}`
const readSvc  = id => { try { return JSON.parse(localStorage.getItem(SVC_LS(id))||'[]') } catch { return [] } }
const writeSvc = (id,d) => { try { localStorage.setItem(SVC_LS(id),JSON.stringify(d)) } catch {} }

function VehicleServicePanel({ vehicle: v }) {
  const [services, setServices] = useState(() => readSvc(v.id||v.reg))
  const [showAdd,  setShowAdd]  = useState(false)
  const [form, setForm] = useState({service_type:'general',service_date:'',next_service_date:'',service_km:'',cost:'',vendor:'',notes:''})
  const totalCost = services.reduce((s,i)=>s+Number(i.cost||0),0)
  const latest    = [...services].sort((a,b)=>(b.service_date||'').localeCompare(a.service_date||''))[0]
  const handleAdd = () => {
    if (!form.service_date) return
    const item = {...form,id:`svc-${Date.now()}`,created_at:new Date().toISOString()}
    const updated = [item,...services]; setServices(updated); writeSvc(v.id||v.reg,updated)
    setForm({service_type:'general',service_date:'',next_service_date:'',service_km:'',cost:'',vendor:'',notes:''}); setShowAdd(false)
  }
  const INP = 'w-full px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none'
  return (
    <div className="space-y-3">
      {v.nextServiceKm && v.km && (
        <div className="bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-medium">KM to Next Service</span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{Number(v.km).toLocaleString()} / {Number(v.nextServiceKm).toLocaleString()} km</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{width:`${Math.min(100,Math.round((v.km/v.nextServiceKm)*100))}%`}} />
          </div>
          <p className="text-[10px] text-slate-400 mt-1 text-right">{Math.max(0,v.nextServiceKm-v.km).toLocaleString()} km remaining</p>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 text-center border border-slate-100 dark:border-navy-700"><p className="text-base font-black text-slate-700 dark:text-white">{services.length}</p><p className="text-[9px] text-slate-400 uppercase">Records</p></div>
        <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 text-center border border-slate-100 dark:border-navy-700"><p className="text-base font-black text-emerald-600 dark:text-emerald-400">Rs.{totalCost.toLocaleString('en-IN')}</p><p className="text-[9px] text-slate-400 uppercase">Total Cost</p></div>
        <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 text-center border border-slate-100 dark:border-navy-700"><p className="text-xs font-black text-slate-700 dark:text-white">{latest?.service_date||'—'}</p><p className="text-[9px] text-slate-400 uppercase">Last Done</p></div>
      </div>
      <button onClick={()=>setShowAdd(o=>!o)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all active:scale-95 shadow-md">
        <Plus size={13} /> Log Service
      </button>
      {showAdd && (
        <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 border border-slate-200 dark:border-navy-700 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Type</label>
              <select value={form.service_type} onChange={e=>setForm(f=>({...f,service_type:e.target.value}))} className={INP}>{SVC_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Date *</label>
              <input type="date" value={form.service_date} onChange={e=>setForm(f=>({...f,service_date:e.target.value}))} className={INP} /></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Next Service</label>
              <input type="date" value={form.next_service_date} onChange={e=>setForm(f=>({...f,next_service_date:e.target.value}))} className={INP} /></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cost (Rs.)</label>
              <input type="number" value={form.cost} onChange={e=>setForm(f=>({...f,cost:e.target.value}))} placeholder="0" className={INP} /></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">KM</label>
              <input type="number" value={form.service_km} onChange={e=>setForm(f=>({...f,service_km:e.target.value}))} placeholder="0" className={INP} /></div>
            <div><label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Vendor</label>
              <input value={form.vendor} onChange={e=>setForm(f=>({...f,vendor:e.target.value}))} placeholder="Garage name" className={INP} /></div>
          </div>
          <input value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Notes (optional)" className={INP} />
          <div className="flex gap-2">
            <button onClick={()=>setShowAdd(false)} className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-navy-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">Cancel</button>
            <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 transition-all active:scale-95">Save</button>
          </div>
        </div>
      )}
      {services.length === 0 ? <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">No service records yet.</p> : (
        <div className="space-y-2">
          {[...services].sort((a,b)=>(b.service_date||'').localeCompare(a.service_date||'')).map(svc=>(
            <div key={svc.id} className="bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-navy-700 flex items-center justify-center flex-shrink-0 text-sm">{SVC_ICONS[svc.service_type]||'🔧'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{SVC_TYPES.find(t=>t.key===svc.service_type)?.label||svc.service_type}</p>
                <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                  <span>{svc.service_date}</span>{svc.vendor&&<span>· {svc.vendor}</span>}{svc.service_km&&<span>· {Number(svc.service_km).toLocaleString()} km</span>}
                </div>
              </div>
              {svc.cost>0&&<span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex-shrink-0">Rs.{Number(svc.cost).toLocaleString('en-IN')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function VSectionHead({ title }) {
  return <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pt-2 pb-1 border-t border-slate-100 dark:border-navy-700 mt-2">{title}</p>
}

function VehicleModal({ vehicle, onClose, onSave }) {
  const [form,   setForm]   = useState(() => vehicle ? { ...vehicle } : { ...EMPTY_VEHICLE, id: `VEH-${Date.now()}` })
  const [saving, setSaving] = useState(false)
  const upd = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSave = async () => {
    if (!form.reg) return
    setSaving(true)
    try {
      let result
      if (vehicle?.id) {
        result = await vehicleRepository.update(vehicle.id, form)
      } else {
        result = await vehicleRepository.create(form)
      }
      onSave(result || form)
    } catch (err) {
      console.error('VehicleModal save failed:', err)
      alert('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[500px] max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <h3 className="font-display font-black text-slate-800 dark:text-white text-base">
            {vehicle ? 'Edit Vehicle' : 'Add Vehicle'}
          </h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <VField label="Reg. Number" field="reg" required value={form.reg} onChange={upd} />
            <VSelectField label="Type" field="type" options={['4+1 Sedan','7+1 SUV','Tempo Traveller','Mini Van']} value={form.type} onChange={upd} />
            <VField label="Model" field="model" required value={form.model} onChange={upd} />
            <VField label="Year" field="year" type="number" value={form.year} onChange={upd} />
            <VField label="Current KM" field="km" type="number" value={form.km} onChange={upd} />
            <VSelectField label="Fuel Type" field="fuelType" options={['Petrol','Diesel','CNG','Electric']} value={form.fuelType} onChange={upd} />
            <VField label="Color" field="color" value={form.color} onChange={upd} />
            <VSelectField label="Status" field="status" options={['active','maintenance','offline']} value={form.status} onChange={upd} />
          </div>
          <VSectionHead title="Service Tracking" />
          <div className="grid grid-cols-2 gap-3">
            <VField label="Last Service Date" field="lastServiceDate" type="date" value={form.lastServiceDate} onChange={upd} />
            <VField label="Last Service KM"   field="lastServiceKm"   type="number" value={form.lastServiceKm} onChange={upd} />
            <VField label="Next Service Date" field="nextServiceDate" type="date" value={form.nextServiceDate} onChange={upd} />
            <VField label="Next Service KM"   field="nextServiceKm"   type="number" value={form.nextServiceKm} onChange={upd} />
          </div>
          <VSectionHead title="Insurance" />
          <div className="grid grid-cols-2 gap-3">
            <VField label="Provider"   field="insProvider" value={form.insProvider} onChange={upd} />
            <VField label="Policy No." field="insNumber"   value={form.insNumber}   onChange={upd} />
            <div className="col-span-2"><VField label="Expiry Date" field="insExpiry" type="date" value={form.insExpiry} onChange={upd} /></div>
          </div>
          <VSectionHead title="Permit" />
          <div className="grid grid-cols-2 gap-3">
            <VField label="Permit No." field="permitNumber" value={form.permitNumber} onChange={upd} />
            <VField label="Expiry"     field="permitExpiry" type="date" value={form.permitExpiry} onChange={upd} />
          </div>
          <VSectionHead title="Fitness Certificate (FC)" />
          <div className="grid grid-cols-2 gap-3">
            <VField label="FC No." field="fcNumber" value={form.fcNumber} onChange={upd} />
            <VField label="Expiry" field="fcExpiry"  type="date" value={form.fcExpiry} onChange={upd} />
          </div>
          <VSectionHead title="Pollution Certificate (PUC)" />
          <div className="grid grid-cols-2 gap-3">
            <VField label="PUC No." field="pucNumber" value={form.pucNumber} onChange={upd} />
            <VField label="Expiry"  field="pucExpiry" type="date" value={form.pucExpiry} onChange={upd} />
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!form.reg || saving}
            className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50">
            {saving ? 'Saving…' : (vehicle ? 'Save Changes' : 'Add Vehicle')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Assignment Modal
// ─────────────────────────────────────────────────────────────
function AssignmentModal({ vehicle, drivers, onClose, onConfirm }) {
  const [selectedDriver, setSelectedDriver] = useState(vehicle.driver || '')
  const [saving, setSaving] = useState(false)
  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' })
  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })

  const handleConfirm = async () => {
    if (!selectedDriver) return
    setSaving(true)
    try {
      const matched = drivers.find(d => d.name === selectedDriver)
      const record  = {
        vehicleReg:   vehicle.reg,
        vehicleType:  vehicle.type,
        vehicleModel: vehicle.model,
        driverId:     matched?.id || null,
        driverName:   selectedDriver,
        assignedDate: now.toISOString().slice(0, 10),
        assignedTime: timeStr,
        assignedAt:   now.toISOString(),
        releasedDate: null,
      }
      await saveVehicleAssignment(record)
      // Also update the vehicle's driver field
      await vehicleRepository.update(vehicle.id, { driver: selectedDriver })
      onConfirm(record)
    } catch (err) {
      console.error('Assignment failed:', err)
      alert('Failed to assign driver. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-96 bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mb-4 sm:hidden" />
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assign Driver</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">{vehicle.reg}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{vehicle.model} · {vehicle.type}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700">
            <X size={15} />
          </button>
        </div>
        <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 mb-4 space-y-1">
          {[['Date', dateStr], ['Time', timeStr]].map(([l,v]) => (
            <div key={l} className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">{l}</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{v}</span>
            </div>
          ))}
        </div>
        <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
          {drivers.map(d => (
            <button key={d.id} onClick={() => setSelectedDriver(d.name)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${
                selectedDriver === d.name
                  ? 'border-navy-400 bg-navy-50 dark:bg-navy-800 ring-2 ring-navy-400/30'
                  : 'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 hover:bg-slate-50 dark:hover:bg-navy-800'
              }`}>
              <Avatar name={d.name} size={28} />
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.name}</p>
                <p className="text-[10px] text-slate-400">{d.vehicle || 'No vehicle assigned'}</p>
              </div>
              {selectedDriver === d.name && <CheckCircle size={16} className="text-navy-600 dark:text-blue-400 flex-shrink-0" />}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={!selectedDriver || saving}
            className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md disabled:opacity-40 active:scale-95">
            {saving ? 'Assigning…' : 'Confirm'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ─────────────────────────────────────────────────────────────
//  Vehicle Detail Panel
// ─────────────────────────────────────────────────────────────
function VehicleDetail({ v, trips, assignments, drivers, onEdit, onAssign, onDelete, canEdit, canAssign, canDelete }) {
  const vTrips   = trips.filter(t => t.vehicle === v.reg || t.car === v.reg)
  const vHistory = assignments.filter(a => a.vehicleReg === v.reg)
  const [tab, setTab] = useState('docs')

  const statusEntry = getVehicleStatusEntry(v.reg)
  const statusCfg   = getVehicleStatusCfg(statusEntry.status)
  const isIdle      = statusEntry.status !== 'in_use'

  return (
    <div className="border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/20">
      {/* Live status bar */}
      <div className="px-4 pt-4">
        <div className="bg-white dark:bg-navy-800/60 rounded-xl p-3.5 border border-slate-100 dark:border-navy-700 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${statusCfg.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusCfg.dot} ${statusEntry.status === 'in_use' ? 'animate-pulse' : ''}`} />
              {statusCfg.label}
            </span>
            {statusEntry.driver && (
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <User size={10} />{statusEntry.driver}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Fuel size={11} className="text-orange-500" />
              <span className="ml-1">{statusEntry.fuelLevel !== null ? `${statusEntry.fuelLevel}%` : '—'}</span>
            </span>
            <span className="flex items-center gap-1">
              <MapPin size={11} className="text-slate-400" />
              {statusEntry.area || (isIdle ? 'Last location unknown' : '—')}
            </span>
            {statusEntry.updatedAt && (
              <span className="flex items-center gap-1">
                <Clock size={11} className="text-slate-400" />
                {fmtAuditTime(statusEntry.updatedAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-3 pb-0">
        {[['docs','Documents'],['service','Service'],['history','History']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === k
                ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>{l}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* Documents tab */}
        {tab === 'docs' && (
          <div className="bg-white dark:bg-navy-800/60 rounded-xl p-4 border border-slate-100 dark:border-navy-700">
            <DocRow icon={Shield}   label="Insurance"       number={v.insNumber}    expiry={v.insExpiry}    />
            <DocRow icon={FileText} label="Permit"          number={v.permitNumber} expiry={v.permitExpiry} />
            <DocRow icon={FileText} label="Fitness (FC)"    number={v.fcNumber}     expiry={v.fcExpiry}     />
            <DocRow icon={FileText} label="Pollution (PUC)" number={v.pucNumber}    expiry={v.pucExpiry}    />
          </div>
        )}

        {/* Service tab */}
        {tab === 'service' && <VehicleServicePanel vehicle={v} />}

        {/* History tab */}
        {tab === 'history' && (
          <div>
            {vHistory.length === 0 ? (
              <div className="text-center py-6">
                <History size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-xs text-slate-400 dark:text-slate-500">No assignment history yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {vHistory.map((h, i) => (
                  <div key={i} className="bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700 flex items-center gap-3">
                    <Avatar name={h.driverName} size={28} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{h.driverName}</p>
                      <p className="text-[10px] text-slate-400">
                        Assigned {h.assignedDate} {h.assignedTime}
                        {h.releasedDate ? ` → Released ${h.releasedDate}` : ' · Active'}
                      </p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      h.releasedDate
                        ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    }`}>
                      {h.releasedDate ? 'Released' : 'Current'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-navy-700">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Trip Summary</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700 text-center">
                  <p className="text-lg font-display font-black text-navy-800 dark:text-blue-300">{vTrips.length}</p>
                  <p className="text-[10px] text-slate-400">Total Trips</p>
                </div>
                <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700 text-center">
                  <p className="text-lg font-display font-black text-emerald-600 dark:text-emerald-400">
                    {vTrips.reduce((s,t) => s + (t.km || 0), 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-slate-400">Total KM</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2 flex-wrap pt-1">
          {canAssign && v.status !== 'maintenance' && (
            <button onClick={() => onAssign(v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all active:scale-95 shadow-md">
              <User size={13} /> Assign Driver
            </button>
          )}
          {canEdit && (
            <button onClick={() => onEdit(v)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
              <Edit2 size={13} /> Edit
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(v.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/25 transition-colors">
              <X size={13} /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main Vehicles Page
// ─────────────────────────────────────────────────────────────
export default function Vehicles() {
  const { isAdmin, isManager, isDriver, user } = useAuth()

  const canAdd    = isAdmin || isManager
  const canEdit   = isAdmin || isManager
  const canAssign = isAdmin || isManager
  const canDelete = isAdmin

  const [vehicles,    setVehicles]    = useState([])
  const [drivers,     setDrivers]     = useState([])
  const [assignments, setAssignments] = useState([])
  const [trips,       setTrips]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState('')
  const [expanded,    setExpanded]    = useState(null)
  const [assignModal, setAssignModal] = useState(null)
  const [editModal,   setEditModal]   = useState(null)
  const [showAdd,     setShowAdd]     = useState(false)
  const [toast,       setToast]       = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // ── Load all data from Supabase ───────────────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const result = await withTimeout(
        Promise.all([
          loadVehicles(),
          loadVehicleAssignments(),
          loadBookings(),
        ]),
        10_000,
        null
      )
      if (result === null) {
        setVehicles([]); setAssignments([]); setTrips([])
        setLoadError('Request timed out — check your connection and try again.')
      } else {
        const [veh, asgn, bks] = result
        setVehicles(Array.isArray(veh) ? veh : [])
        setAssignments(Array.isArray(asgn) ? asgn : [])
        setTrips(Array.isArray(bks) ? bks : [])
        setLoadError('')
      }
      // Also load drivers for assignment modal (lazy — low priority)
      loadDrivers().then(d => setDrivers(d || []))
        .catch(err => console.error('[Vehicles] load drivers failed:', err))
    } catch (err) {
      console.error('Vehicles page load failed:', err)
      setLoadError('Could not load vehicle data. Try refreshing.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── Handlers ──────────────────────────────────────────────
  const handleSave = (savedVehicle) => {
    setVehicles(prev => {
      const idx = prev.findIndex(v => v.id === savedVehicle.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = savedVehicle; return next }
      return [savedVehicle, ...prev]
    })
    setEditModal(null)
    setShowAdd(false)
    showToast('Vehicle saved')
  }

  const handleAssigned = (record) => {
    setAssignments(prev => [...prev.filter(a => a.driverName !== record.driverName), record])
    // Update the vehicle's displayed driver
    setVehicles(prev => prev.map(v =>
      v.reg === record.vehicleReg ? { ...v, driver: record.driverName } : v
    ))
    setAssignModal(null)
    showToast(`${record.vehicleReg} assigned to ${record.driverName}`)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this vehicle?')) return
    try {
      await vehicleRepository.delete(id)
      setVehicles(prev => prev.filter(v => v.id !== id))
      showToast('Vehicle deleted')
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Failed to delete vehicle.')
    }
  }

  // ── Derived data ──────────────────────────────────────────
  const displayVehicles = isDriver
    ? vehicles.filter(v => v.driver === user?.name)
    : vehicles

  const counts = {
    total:       displayVehicles.length,
    available:   displayVehicles.filter(v => v.status === 'active').length,
    assigned:    displayVehicles.filter(v => v.driver).length,
    maintenance: displayVehicles.filter(v => v.status === 'maintenance').length,
  }

  const alerts = useMemo(() => {
    const list = []
    displayVehicles.forEach(v => {
      [
        { field:'insExpiry',    label:`${v.reg} Insurance` },
        { field:'permitExpiry', label:`${v.reg} Permit`    },
        { field:'fcExpiry',     label:`${v.reg} FC`        },
        { field:'pucExpiry',    label:`${v.reg} PUC`       },
      ].forEach(d => {
        const st = docStatus(v[d.field])
        if (st.key === 'expired' || st.key === 'soon') {
          list.push({ label: d.label, status: st, expiry: v[d.field] })
        }
      })
    })
    return list
  }, [displayVehicles])

  const getAssignment = (reg) => assignments.find(a => a.vehicleReg === reg)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading vehicles…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={isDriver ? 'My Vehicle' : 'Vehicle Management'}
        subtitle={isDriver ? 'Your assigned vehicle details' : `Fleet of ${counts.total} vehicles`}
        action={canAdd
          ? <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
              <Plus size={15} /> Add Vehicle
            </button>
          : null}
      />

      {/* Load error */}
      {loadError && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-700/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400 text-sm font-semibold">⚠ {loadError}</span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl px-4 py-2.5">
          <CheckCircle size={15} className="text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{toast}</p>
        </div>
      )}

      {/* Expiry alerts */}
      {alerts.length > 0 && !isDriver && (
        <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/30 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {alerts.length} document{alerts.length !== 1 ? 's' : ''} need{alerts.length === 1 ? 's' : ''} attention
            </p>
          </div>
          <div className="space-y-1.5">
            {alerts.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{a.label}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${a.status.badge}`}>{a.status.label}</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-500">{a.expiry}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats widgets */}
      {!isDriver && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Total Vehicles', value: counts.total,       color:'text-navy-800 dark:text-blue-300'       },
            { label:'Available',      value: counts.available,   color:'text-emerald-600 dark:text-emerald-400' },
            { label:'Assigned',       value: counts.assigned,    color:'text-blue-600 dark:text-blue-400'       },
            { label:'Maintenance',    value: counts.maintenance, color:'text-red-600 dark:text-red-400'         },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-xl p-4 text-center">
              <p className={`text-2xl font-display font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Vehicle list */}
      <div className="space-y-3">
        {displayVehicles.map(v => {
          const isOpen       = expanded === v.id
          const assignment   = getAssignment(v.reg)
          const assignedDriver = assignment?.driverName || v.driver || 'Unassigned'
          const isMaint      = v.status === 'maintenance'
          const vAlerts      = [v.insExpiry, v.permitExpiry, v.fcExpiry, v.pucExpiry]
            .filter(e => { const st = docStatus(e); return st.key === 'expired' || st.key === 'soon' }).length

          return (
            <div key={v.id} className={`glass-card rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-200 ${isMaint ? 'border border-red-200 dark:border-red-900/50' : ''}`}>
              {/* Banner */}
              <div className={`p-4 relative overflow-hidden ${isMaint ? 'bg-gradient-to-r from-red-900 to-rose-800' : 'bg-gradient-to-r from-navy-900 to-navy-800'}`}>
                <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
                <div className="relative flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <h3 className="font-display font-black text-white text-lg tracking-widest">{v.reg}</h3>
                      {vAlerts > 0 && (
                        <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                          <AlertTriangle size={9} /> {vAlerts} alert{vAlerts !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-white/60 text-xs">{v.model} · {v.year} · {v.color}</p>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">{v.type}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">{v.fuelType}</span>
                    </div>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
              </div>

              {/* Card body — tap to expand */}
              <div className="px-4 py-3.5 flex items-center gap-3 cursor-pointer select-none"
                onClick={() => setExpanded(isOpen ? null : v.id)}>
                <Avatar name={assignedDriver} size={34} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Assigned Driver</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{assignedDriver}</p>
                  {assignment && <p className="text-[10px] text-slate-400">Since {assignment.assignedDate}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 justify-end text-slate-600 dark:text-slate-300">
                    <Gauge size={12} />
                    <span className="text-sm font-bold">{(Number(v?.km) || 0).toLocaleString()}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">km</p>
                  <div className="flex items-center gap-1 justify-end text-slate-600 dark:text-slate-300 mt-1">
                    <Fuel size={10} className="text-orange-500" />
                    <span className="text-sm font-bold ml-1">{(getVehicleStatusEntry(v.reg).fuelLevel !== null ? `${getVehicleStatusEntry(v.reg).fuelLevel}%` : '—')}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">fuel</p>
                </div>
                {isOpen ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0 ml-1" />
                         : <ChevronDown size={15} className="text-slate-400 flex-shrink-0 ml-1" />}
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <VehicleDetail
                  v={v}
                  trips={trips}
                  assignments={assignments}
                  drivers={drivers}
                  onEdit={setEditModal}
                  onAssign={setAssignModal}
                  onDelete={handleDelete}
                  canEdit={canEdit}
                  canAssign={canAssign}
                  canDelete={canDelete}
                />
              )}
            </div>
          )
        })}

        {displayVehicles.length === 0 && (
          <div className="text-center py-16">
            <Car size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No vehicles yet</p>
            {canAdd && <p className="text-xs text-slate-400 mt-1">Click "Add Vehicle" to get started</p>}
          </div>
        )}
      </div>

      {/* Modals */}
      {(showAdd || editModal) && (
        <VehicleModal
          vehicle={editModal}
          onClose={() => { setShowAdd(false); setEditModal(null) }}
          onSave={handleSave}
        />
      )}
      {assignModal && (
        <AssignmentModal
          vehicle={assignModal}
          drivers={drivers}
          onClose={() => setAssignModal(null)}
          onConfirm={handleAssigned}
        />
      )}
    </div>
  )
}