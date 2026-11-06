import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Phone, Star, FileText, TrendingUp, Upload, X } from 'lucide-react'
import Avatar      from '../components/ui/Avatar'
import Badge       from '../components/ui/Badge'
import Button      from '../components/ui/Button'
import PageHeader  from '../components/ui/PageHeader'
import ModalOverlay from '../components/ui/ModalOverlay'
import { driverRepository }  from '../repositories/driverRepository'
import { loadDrivers }        from '../data/driverData'
import { loadBookings }       from '../data/tripTypes'
import { loadTripPayslips }   from '../data/settlementData'

// ── Status badge colours ──────────────────────────────────────
const STATUS_COLORS = {
  active:     'badge-active',
  'on-leave': 'badge-pending',
}

// ── Add Driver Modal ──────────────────────────────────────────
// Defined OUTSIDE the page component so React never remounts
// inner elements between keystrokes.
function AddDriverModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name:'', mobile:'', vehicle:'', license:'', vehicleType:'',
    joined: new Date().toISOString().slice(0,10), status:'active', rating: 4.5,
    licenseExpiry:'', badge:'', medicalExpiry:'',
    bankName:'', accountNo:'', ifscCode:'',
    emergencyName:'', emergencyContact:'',
  })
  const [licenceImg, setLicenceImg] = useState(null)
  const [preview,    setPreview]    = useState(null)
  const [errors,     setErrors]     = useState({})
  const [saving,     setSaving]     = useState(false)
  const fileRef = useRef()

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { alert('File too large. Max 2MB.'); return }
    const reader = new FileReader()
    reader.onload = ev => { setLicenceImg(ev.target.result); setPreview(ev.target.result) }
    reader.readAsDataURL(file)
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim())                          e.name    = 'Required'
    if (!form.mobile.trim() || form.mobile.length < 10) e.mobile = '10 digits required'
    if (!form.license.trim())                       e.license = 'Required'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        id:           `DRV-${Date.now()}`,
        licenceImage: licenceImg || null,
        createdAt:    new Date().toISOString(),
      }
      const created = await driverRepository.create(payload)
      onSaved(created || payload)
      onClose()
    } catch (err) {
      console.error('AddDriver failed:', err)
      alert('Failed to save driver. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const inp = `w-full px-3 py-2.5 text-sm rounded-xl border bg-white dark:bg-navy-800/60
    text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/25 transition-all`

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[480px] max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Add Driver</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">New Driver</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Name <span className="text-red-500">*</span></label>
              <input className={`${inp} ${errors.name ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Full name" />
              {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Mobile <span className="text-red-500">*</span></label>
              <input className={`${inp} ${errors.mobile ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                value={form.mobile} onChange={e => upd('mobile', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="10 digits" />
              {errors.mobile && <p className="text-[10px] text-red-500 mt-0.5">{errors.mobile}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Vehicle Reg</label>
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.vehicle} onChange={e => upd('vehicle', e.target.value)} placeholder="PY01XX1234" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Vehicle Type</label>
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.vehicleType} onChange={e => upd('vehicleType', e.target.value)} placeholder="4+1 Sedan / 7+1 SUV" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Licence Number <span className="text-red-500">*</span></label>
              <input className={`${inp} ${errors.license ? 'border-red-400' : 'border-slate-200 dark:border-navy-700'}`}
                value={form.license} onChange={e => upd('license', e.target.value)} placeholder="TN1234567890" />
              {errors.license && <p className="text-[10px] text-red-500 mt-0.5">{errors.license}</p>}
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Licence Expiry</label>
              <input type="date" className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.licenseExpiry||''} onChange={e => upd('licenseExpiry', e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Badge No.</label>
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.badge||''} onChange={e => upd('badge', e.target.value)} placeholder="Badge number" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Medical Cert Expiry</label>
              <input type="date" className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.medicalExpiry||''} onChange={e => upd('medicalExpiry', e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Join Date</label>
              <input type="date" className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.joined} onChange={e => upd('joined', e.target.value)} />
            </div>
          </div>

          {/* Bank Details */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Bank Details</p>
            <div className="grid grid-cols-3 gap-2">
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.bankName||''} onChange={e=>upd('bankName',e.target.value)} placeholder="Bank name" />
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.accountNo||''} onChange={e=>upd('accountNo',e.target.value)} placeholder="Account no." />
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.ifscCode||''} onChange={e=>upd('ifscCode',e.target.value.toUpperCase())} placeholder="IFSC" />
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">Emergency Contact</p>
            <div className="grid grid-cols-2 gap-2">
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.emergencyName||''} onChange={e=>upd('emergencyName',e.target.value)} placeholder="Contact name" />
              <input className={`${inp} border-slate-200 dark:border-navy-700`}
                value={form.emergencyContact||''} onChange={e=>upd('emergencyContact',e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="Mobile number" />
            </div>
          </div>

          {/* Licence Upload */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Driving Licence Upload</label>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={handleFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 border-dashed border-teal-300 dark:border-teal-700/50 bg-teal-50 dark:bg-teal-900/10 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/20 transition-colors">
              <Upload size={15} className="flex-shrink-0" />
              <span className="text-sm font-bold">{licenceImg ? 'Replace Licence Image' : 'Upload Licence (image / PDF)'}</span>
            </button>
            {preview && (
              <div className="mt-2 relative">
                <img src={preview} alt="Licence preview" className="w-full max-h-40 object-cover rounded-xl border border-teal-200 dark:border-teal-800/40" />
                <button type="button" onClick={() => { setLicenceImg(null); setPreview(null) }}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs hover:bg-red-600">✕</button>
                <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-1">✓ Licence image attached</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-all shadow-md active:scale-95 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Driver'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Driver Detail Modal ───────────────────────────────────────
function DriverModal({ driver, bookings, payslips, onClose }) {
  const mine        = bookings.filter(b => b.driver === driver.name)
  const mySlips     = payslips.filter(p => p.driver === driver.name)
  const totalEarned = mySlips.reduce((s, p) => s + p.net, 0)
  const pendingPay  = mySlips.filter(p => p.status === 'pending').reduce((s, p) => s + p.net, 0)

  return (
    <ModalOverlay center onClose={onClose}>
      <div className="w-full max-w-lg glass-card rounded-3xl overflow-hidden shadow-2xl animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-br from-navy-900 to-navy-800 p-6">
          <div className="flex items-center gap-4">
            <Avatar name={driver.name} size={52} />
            <div className="flex-1">
              <h2 className="font-display font-black text-white text-xl">{driver.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`badge ${STATUS_COLORS[driver.status] || 'badge-active'} text-[10px]`}>
                  {driver.status === 'active' ? '● Active' : '○ On Leave'}
                </span>
                <span className="flex items-center gap-1 text-amber-300 text-xs font-bold">
                  <Star size={11} className="fill-amber-400 text-amber-400" /> {driver.rating}
                </span>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/10 text-white/70 flex items-center justify-center hover:bg-white/20 transition-colors text-sm font-bold">✕</button>
          </div>
        </div>
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label:'Mobile',          value: driver.mobile           },
              { label:'Vehicle',         value: driver.vehicle          },
              { label:'Licence No.',     value: driver.license          },
              { label:'Joined',          value: driver.joined           },
              { label:'Licence Expiry',  value: driver.licenseExpiry || '—' },
              { label:'Badge No.',       value: driver.badge            || '—' },
              { label:'Medical Expiry',  value: driver.medicalExpiry    || '—' },
            ].filter(r=>r.value&&r.value!=='—'||['Licence Expiry','Badge No.','Medical Expiry'].includes(r.label)).map(r => (
              <div key={r.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{r.label}</p>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">{r.value||'—'}</p>
              </div>
            ))}
          </div>
          {(driver.bankName || driver.emergencyName) && (
            <div className="grid grid-cols-2 gap-3">
              {driver.bankName && (
                <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 col-span-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Bank</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{driver.bankName}</p>
                  {driver.accountNo && <p className="text-[10px] text-slate-400">{driver.accountNo}</p>}
                </div>
              )}
              {driver.emergencyName && (
                <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 col-span-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">Emergency</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{driver.emergencyName}</p>
                  <p className="text-[10px] text-slate-400">{driver.emergencyContact}</p>
                </div>
              )}
            </div>
          )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label:'Total Trips',  value: mine.length,                                color:'text-blue-600 dark:text-blue-400'    },
              { label:'Total Earned', value:`Rs.${(totalEarned/1000).toFixed(1)}k`,      color:'text-emerald-600 dark:text-emerald-400' },
              { label:'Pending Pay',  value:`Rs.${(pendingPay/1000).toFixed(1)}k`,       color:'text-amber-600 dark:text-amber-400'  },
            ].map(s => (
              <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 text-center">
                <p className={`text-base font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recent Trips</p>
            {mine.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No trips yet</p>
            ) : (
              <div className="space-y-1.5">
                {mine.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-navy-800/50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{b.customer}</p>
                      <p className="text-[10px] text-slate-400 truncate">{b.pickup} → {b.drop}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{b.fare ? `Rs.${b.fare.toLocaleString('en-IN')}` : '—'}</p>
                      <p className="text-[10px] text-slate-400">{b.startDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalOverlay>
  )
}

// ── Main Drivers Page ─────────────────────────────────────────
export default function Drivers() {
  const [drivers,  setDrivers]  = useState([])
  const [bookings, setBookings] = useState([])
  const [payslips, setPayslips] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)

  // ── Load all data from Supabase on mount ──────────────────
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [drs, bks, pys] = await Promise.all([
        loadDrivers(),
        loadBookings(),
        loadTripPayslips(),
      ])
      setDrivers(drs  || [])
      setBookings(bks || [])
      setPayslips(pys || [])
    } catch (err) {
      console.error('Drivers page load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // ── Per-driver computed stats ────────────────────────────
  const driversWithStats = drivers.map(d => {
    const mine      = bookings.filter(b => b.driver === d.name)
    const mySlips   = payslips.filter(p => p.driver === d.name)
    const completed = mine.filter(b => b.status === 'completed').length
    const totalFare = mine.reduce((s, b) => s + (b.fare || 0), 0)
    const totalPay  = mySlips.reduce((s, p) => s + p.net, 0)
    return { ...d, tripCount: completed, fareCollected: totalFare, totalPay }
  })

  const totalAllFare = driversWithStats.reduce((s, d) => s + d.fareCollected, 0) || 1

  // ── Handlers ─────────────────────────────────────────────
  const handleDriverSaved = (newDriver) => {
    setDrivers(prev => [newDriver, ...prev.filter(d => d.id !== newDriver.id)])
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Loading drivers…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Drivers"
        subtitle={`${drivers.length} drivers · fleet management`}
        action={<Button icon={Plus} variant="teal" onClick={() => setShowAdd(true)}>Add Driver</Button>}
      />

      {/* Driver cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {driversWithStats.map(d => {
          const farePct = Math.round((d.fareCollected / totalAllFare) * 100)
          return (
            <div key={d.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200">
              {/* Header */}
              <div className="bg-gradient-to-br from-navy-900 to-navy-800 p-5 relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/5" />
                <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
                <div className="relative flex items-start gap-3">
                  <Avatar name={d.name} size={48} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-black text-white text-base truncate">{d.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-white/60 text-xs">
                      <Phone size={11} />
                      <span>{d.mobile}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-amber-400/20 border border-amber-400/30 rounded-full px-2.5 py-1 flex-shrink-0">
                    <Star size={11} className="text-amber-400 fill-amber-400" />
                    <span className="text-xs font-bold text-amber-300">{d.rating}</span>
                  </div>
                </div>
                <div className="relative mt-3 flex gap-2 flex-wrap">
                  <span className={`badge ${STATUS_COLORS[d.status] || 'badge-active'} text-[10px]`}>
                    {d.status === 'active' ? '● Active' : '○ On Leave'}
                  </span>
                  <span className="badge badge-active text-[10px]">Joined {d.joined}</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { label:'Vehicle',    value: d.vehicle },
                    { label:'Licence',    value: d.license?.slice(-8) || '—' },
                    { label:'Trips Done', value: d.tripCount },
                    { label:'Total Pay',  value:`Rs. ${d.totalPay.toLocaleString('en-IN')}` },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3">
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wide">{s.label}</p>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-0.5">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Fare share bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">Fare share</span>
                    <span className="font-bold text-teal-600 dark:text-teal-400">{farePct}% — Rs. {d.fareCollected.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all" style={{ width:`${farePct}%` }} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button icon={TrendingUp} variant="outline" size="sm" className="flex-1" onClick={() => setSelected(d)}>Details</Button>
                  <Button icon={FileText}   variant="ghost"   size="sm" className="flex-1" onClick={() => setSelected(d)}>Trips</Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bata Ledger */}
      <div>
        <h3 className="font-display font-black text-slate-800 dark:text-white text-lg mb-3">Bata Ledger</h3>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/80 dark:bg-navy-800/50">
                  {['Driver','Date','Route','Vehicle','Fare','Bata','Net Pay','Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                      No payslips yet — complete a trip to generate a payslip
                    </td>
                  </tr>
                ) : payslips.slice(0, 20).map(p => (
                  <tr key={p.id} className="border-b border-slate-50 dark:border-navy-800 hover:bg-teal-50/40 dark:hover:bg-navy-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.driver} size={24} />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{p.driver}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{p.date}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[180px] truncate">{p.pickup} → {p.drop}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{p.vehicle || '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">Rs. {p.fare.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-xs text-emerald-600 dark:text-emerald-400">{p.bata > 0 ? `Rs. ${p.bata}` : '—'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-navy-700 dark:text-blue-300 whitespace-nowrap">Rs. {p.net.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        p.status === 'paid'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      }`}>
                        {p.status === 'paid' ? '✓ Paid' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <DriverModal
          driver={selected}
          bookings={bookings}
          payslips={payslips}
          onClose={() => setSelected(null)}
        />
      )}
      {showAdd && (
        <AddDriverModal
          onClose={() => setShowAdd(false)}
          onSaved={handleDriverSaved}
        />
      )}
    </div>
  )
}