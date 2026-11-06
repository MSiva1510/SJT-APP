import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Plus, Search, ChevronDown, ChevronUp,
  Calendar, Car, User, MapPin,
  CheckCircle, X, Edit2, Trash2, UserCheck,
  ChevronLeft, ChevronRight, AlertTriangle, Navigation, Clock,
  MessageCircle, IndianRupee,
} from 'lucide-react'
import PageHeader   from '../components/ui/PageHeader'
import Avatar       from '../components/ui/Avatar'
import ModalOverlay from '../components/ui/ModalOverlay'
import { useAuth }  from '../context/AuthContext'
import {
  TRIP_TYPE_CONFIG, TRIP_TYPE_LIST, BOOKING_STATUSES,
  DRIVER_AVAIL_CFG, VEHICLE_AVAIL_CFG,
  getStatusCfg, getDriverAvailability, getVehicleAvailability,
  generateBookingNumber, loadBookings, saveBooking, deleteBooking,
  getWorkflowTransitions,
} from '../data/tripTypes'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import { addAuditEvent }    from '../data/auditLogData'
import { loadTripRoute, calcRouteDistanceKm } from '../data/gpsHistoryData'
import { loadGPSHistory }   from '../hooks/useGPS'
import { loadTimeline, addTimelineEvent, fmtTimelineTime, getEventCfg } from '../data/tripTimelineData'
import { upsertCustomerFromBooking, findCustomerByMobile, loadCustomers } from '../data/customerData'
import { notify } from '../services/notificationService'

// ── WhatsApp builder ──────────────────────────────────────────
function buildWhatsAppUrl(booking, messageType = 'assigned') {
  const phone = (booking.contact || '').replace(/\D/g, '')
  const msgs = {
    assigned:  `Hello ${booking.customer || 'Customer'},\n\nYour trip is confirmed! 🚗\n\n📋 Booking: ${booking.bookingNo}\n📍 Pickup: ${booking.pickup}\n🏁 Drop: ${booking.drop || '—'}\n📅 Date: ${booking.startDate}\n⏰ Time: ${booking.startTime || 'TBD'}\n🚘 Vehicle: ${booking.vehicle || 'TBD'}\n\nThank you — Sri Jayam Travels`,
    cancelled: `Hello ${booking.customer || 'Customer'},\n\nBooking ${booking.bookingNo} has been cancelled.\n\nSorry for the inconvenience — Sri Jayam Travels`,
  }
  const text = encodeURIComponent(msgs[messageType] || msgs.assigned)
  if (phone.length >= 10) return `https://wa.me/91${phone.slice(-10)}?text=${text}`
  return `https://wa.me/?text=${text}`
}

// ── Shared primitives ─────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = getStatusCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}
function TypeBadge({ type }) {
  const cfg = TRIP_TYPE_CONFIG[type]; if (!cfg) return null
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>{cfg.icon} {cfg.label}</span>
}
function AvailDot({ avail, cfgMap }) {
  const cfg = cfgMap[avail] || cfgMap.available
  return <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}><span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />{cfg.label}</span>
}
function FieldLabel({ children, required }) {
  return <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">{children}{required && <span className="text-red-500 ml-1">*</span>}</label>
}
function Input({ value, onChange, placeholder, type = 'text', required, field }) {
  const handleChange = e => {
    let v = e.target.value
    if (field === 'contact') v = v.replace(/\D/g,'').slice(0,10)
    if (field === 'customer') { v = v.slice(0,60); if (v.length > 0 && !/^[a-zA-Z0-9\s\-'.&()]*$/.test(v)) v = v.slice(0,-1) }
    if (type === 'number' && field === 'fare' && Number(v) < 0) v = '0'
    onChange({ target: { value: v } })
  }
  return <input type={type} value={value} onChange={handleChange} placeholder={placeholder} required={required}
    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25 focus:border-navy-400 transition-all font-body" />
}
function Select({ value, onChange, children, required }) {
  return <select value={value} onChange={onChange} required={required}
    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25 focus:border-navy-400 transition-all font-body appearance-none">
    {children}
  </select>
}
function Grid2({ children }) { return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div> }

// ── Create / Edit Modal ───────────────────────────────────────
function BookingModal({ booking, onClose, onSave, userName }) {
  const isEdit = !!booking?.bookingNo
  const [form, setForm] = useState(() => booking || {
    customer:'', contact:'', type:'one_way',
    pickup:'', drop:'', startDate:'', startTime:'',
    returnDate:'', returnTime:'', notes:'', fare:'', status:'draft',
  })
  const [errors, setErrors] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [allCustomers, setAllCustomers] = useState([])
  useEffect(() => { loadCustomers().then(cs => setAllCustomers(Array.isArray(cs) ? cs.filter(x=>!x._deleted) : [])) }, [])
  const upd = patch => setForm(f => ({ ...f, ...patch }))

  const handleCustomerChange = val => {
    upd({ customer: val })
    if (val.length >= 2) {
      const matches = allCustomers.filter(c => (c.name??'').toLowerCase().includes(val.toLowerCase()) || (c.mobile&&c.mobile.includes(val))).slice(0,5)
      setSuggestions(matches); setShowSugg(matches.length > 0)
    } else setShowSugg(false)
  }
  const handleContactChange = val => {
    const digits = val.replace(/\D/g,'').slice(0,10)
    upd({ contact: digits })
    if (digits.length === 10) { const m = findCustomerByMobile(digits); if (m) { upd({ customer:m.name, contact:digits }); setShowSugg(false) } }
  }
  const selectCustomer = c => { upd({ customer:c.name, contact:c.mobile||form.contact }); setShowSugg(false) }

  const validate = () => {
    const e = {}
    if (!form.customer.trim()) e.customer  = 'Required'
    if (!form.type)            e.type      = 'Required'
    if (!form.pickup.trim())   e.pickup    = 'Required'
    if (!form.startDate)       e.startDate = 'Required'
    return e
  }
  const handleSave = () => {
    const e = validate(); if (Object.keys(e).length) { setErrors(e); return }
    const now = new Date().toISOString()
    const saved = { ...form, id:form.id||generateBookingNumber(), bookingNo:form.bookingNo||generateBookingNumber(),
      fare:Number(form.fare)||0, createdAt:form.createdAt||now, updatedAt:now,
      createdBy:form.createdBy||userName||'manager', driver:form.driver||null, vehicle:form.vehicle||null }
    upsertCustomerFromBooking({ name:form.customer, mobile:form.contact })
    onSave(saved)
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[520px] max-h-[92vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 mb-1 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{isEdit ? 'Edit Booking' : 'New Booking'}</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">{isEdit ? form.bookingNo : 'Create Booking'}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <Grid2>
            <div className="relative">
              <FieldLabel required>Customer Name</FieldLabel>
              <Input value={form.customer} onChange={e=>handleCustomerChange(e.target.value)} placeholder="Full name or company" required field="customer" />
              {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer}</p>}
              {showSugg && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 rounded-xl shadow-xl overflow-hidden">
                  {suggestions.map(c => (
                    <button key={c.id} type="button" onClick={() => selectCustomer(c)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors text-left">
                      <div className="w-7 h-7 rounded-full bg-navy-100 dark:bg-navy-700 flex items-center justify-center flex-shrink-0 text-xs font-bold text-navy-700 dark:text-blue-300">{(c.name??'').charAt(0)}</div>
                      <div className="min-w-0"><p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{c.name}</p><p className="text-[10px] text-slate-400">{c.mobile||'—'}</p></div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Contact</FieldLabel>
              <Input type="tel" value={form.contact} onChange={e=>handleContactChange(e.target.value)} placeholder="10-digit mobile" field="contact" />
            </div>
          </Grid2>
          <div>
            <FieldLabel required>Trip Type</FieldLabel>
            <Select value={form.type} onChange={e=>upd({type:e.target.value})} required>
              {TRIP_TYPE_LIST.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
            </Select>
            {errors.type && <p className="text-xs text-red-500 mt-1">{errors.type}</p>}
          </div>
          <div>
            <FieldLabel required>Pickup Location</FieldLabel>
            <Input value={form.pickup} onChange={e=>upd({pickup:e.target.value})} placeholder="e.g. Hotel Atithi, Puducherry" required field="pickup" />
            {errors.pickup && <p className="text-xs text-red-500 mt-1">{errors.pickup}</p>}
          </div>
          <div>
            <FieldLabel>Drop / Destination</FieldLabel>
            <Input value={form.drop} onChange={e=>upd({drop:e.target.value})} placeholder="e.g. Chennai Airport" field="drop" />
          </div>
          <Grid2>
            <div>
              <FieldLabel required>Pickup Date</FieldLabel>
              <Input type="date" value={form.startDate} onChange={e=>upd({startDate:e.target.value})} required />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div><FieldLabel>Pickup Time</FieldLabel><Input type="time" value={form.startTime} onChange={e=>upd({startTime:e.target.value})} /></div>
          </Grid2>
          {form.type === 'round_trip' && (
            <Grid2>
              <div><FieldLabel>Return Date</FieldLabel><Input type="date" value={form.returnDate||''} onChange={e=>upd({returnDate:e.target.value})} /></div>
              <div><FieldLabel>Return Time</FieldLabel><Input type="time" value={form.returnTime||''} onChange={e=>upd({returnTime:e.target.value})} /></div>
            </Grid2>
          )}
          <Grid2>
            <div>
              <FieldLabel>Fare (Rs.)</FieldLabel>
              <Input type="number" value={form.fare} onChange={e=>upd({fare:e.target.value})} placeholder="0" field="fare" />
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <Select value={form.status} onChange={e=>upd({status:e.target.value})}>
                {BOOKING_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </div>
          </Grid2>
          <div>
            <FieldLabel>Notes</FieldLabel>
            <textarea value={form.notes} onChange={e=>upd({notes:e.target.value})} placeholder="Special instructions, passenger count…" rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 placeholder-slate-300 dark:placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25 resize-none transition-all" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
          <button onClick={handleSave} className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95">
            {isEdit ? 'Save Changes' : 'Create Booking'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Assign Modal ──────────────────────────────────────────────
function AssignModal({ booking, bookings, drivers, vehicles, onClose, onAssign }) {
  const [driver,  setDriver]  = useState(booking.driver  || '')
  const [vehicle, setVehicle] = useState(booking.vehicle || '')
  const driverAvail  = (drivers||[]).map(d => ({ ...d, avail: getDriverAvailability(d.name, booking.startDate, bookings, d.status==='on-leave'?'on-leave':'available') }))
  const vehicleAvail = (vehicles||[]).map(v => ({ ...v, avail: getVehicleAvailability(v.reg, booking.startDate, bookings, v.status) }))
  const canAssign = driver && vehicle
  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[440px] max-h-[90vh] sm:max-h-[85vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assign Trip</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">{booking.bookingNo}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{booking.customer} · {booking.startDate}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700"><X size={15} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Select Driver</p>
            <div className="space-y-2">
              {driverAvail.map(d => {
                const canSelect = d.avail === 'available'; const isSel = driver === d.name
                return (
                  <button key={d.id} disabled={!canSelect} onClick={() => canSelect && setDriver(d.name)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${isSel?'border-navy-400 bg-navy-50 dark:bg-navy-800 ring-2 ring-navy-400/30':canSelect?'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 hover:bg-slate-50 dark:hover:bg-navy-800':'border-slate-100 dark:border-navy-800 bg-slate-50 dark:bg-navy-900 opacity-50 cursor-not-allowed'}`}>
                    <Avatar name={d.name} size={30} />
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-700 dark:text-slate-200">{d.name}</p><p className="text-[10px] text-slate-400">{d.vehicle}</p></div>
                    <AvailDot avail={d.avail} cfgMap={DRIVER_AVAIL_CFG} />
                    {isSel && <CheckCircle size={15} className="text-navy-600 dark:text-blue-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2.5">Select Vehicle</p>
            <div className="space-y-2">
              {vehicleAvail.map(v => {
                const canSelect = v.avail === 'available'; const isSel = vehicle === v.reg
                return (
                  <button key={v.id} disabled={!canSelect} onClick={() => canSelect && setVehicle(v.reg)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${isSel?'border-navy-400 bg-navy-50 dark:bg-navy-800 ring-2 ring-navy-400/30':canSelect?'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 hover:bg-slate-50 dark:hover:bg-navy-800':'border-slate-100 dark:border-navy-800 bg-slate-50 dark:bg-navy-900 opacity-50 cursor-not-allowed'}`}>
                    <div className="w-8 h-8 rounded-lg bg-navy-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0"><Car size={15} className="text-navy-700 dark:text-blue-400" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono">{v.reg}</p><p className="text-[10px] text-slate-400">{v.type} · {v.model}</p></div>
                    <AvailDot avail={v.avail} cfgMap={VEHICLE_AVAIL_CFG} />
                    {isSel && <CheckCircle size={15} className="text-navy-600 dark:text-blue-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">Cancel</button>
          <button onClick={() => onAssign({ driver, vehicle })} disabled={!canAssign}
            className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">
            Confirm Assignment
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── MODULE 1 & 2: Booking Timeline ───────────────────────────
function BookingTimeline({ bookingId }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    setLoading(true)
    loadTimeline(bookingId).then(evts => { setEvents(evts); setLoading(false) })
  }, [bookingId])
  if (loading) return <div className="flex items-center gap-2 text-xs text-slate-400 px-3 py-2"><div className="w-3 h-3 border border-slate-300 border-t-transparent rounded-full animate-spin" />Loading timeline…</div>
  if (events.length === 0) return <p className="text-xs text-slate-400 dark:text-slate-500 px-1 py-2">No timeline events yet.</p>
  return (
    <div className="relative pl-5">
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-slate-200 dark:bg-navy-700" />
      <div className="space-y-3">
        {events.map((ev, i) => (
          <div key={ev.id||i} className="relative flex items-start gap-3">
            <div className={`absolute -left-3.5 w-3 h-3 rounded-full flex-shrink-0 mt-0.5 border-2 border-white dark:border-navy-900 ${ev.color||'bg-slate-400'}`} />
            <div className="flex-1 min-w-0 ml-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm">{ev.icon}</span>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{ev.label}</p>
                <p className="text-[10px] text-slate-400">{fmtTimelineTime(ev.ts)}</p>
              </div>
              {ev.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 ml-5">{ev.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Approval History ──────────────────────────────────────────
function ApprovalHistory({ history }) {
  if (!history || history.length === 0) return <p className="text-xs text-slate-400">No approval history yet.</p>
  return (
    <div className="space-y-1.5">
      {history.map((h, i) => (
        <div key={i} className="flex items-start gap-2.5 text-[11px]">
          <span className="flex-shrink-0 mt-0.5">{h.action==='approved'?'✅':h.action==='rejected'?'❌':h.action==='submitted'?'📤':'📋'}</span>
          <div className="flex-1 min-w-0">
            <span className="font-bold text-slate-700 dark:text-slate-200 capitalize">{h.action}</span>
            {h.actor_name && <span className="text-slate-400 ml-1">by {h.actor_name}</span>}
            {h.remarks && <p className="text-slate-500 dark:text-slate-400 mt-0.5 italic">"{h.remarks}"</p>}
          </div>
          {h.created_at && <span className="text-slate-400 flex-shrink-0 whitespace-nowrap">{new Date(h.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>}
        </div>
      ))}
    </div>
  )
}

// ── MODULE 1: Workflow Actions ────────────────────────────────
const TRANS_STYLES = {
  blue:   'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-400 hover:bg-blue-100',
  violet: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/40 text-violet-700 dark:text-violet-400 hover:bg-violet-100',
  amber:  'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 hover:bg-amber-100',
  emerald:'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100',
  teal:   'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800/40 text-teal-700 dark:text-teal-400 hover:bg-teal-100',
  red:    'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/40 text-red-600 dark:text-red-400 hover:bg-red-100',
  slate:  'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-navy-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100',
}
function WorkflowActions({ booking, onStatusChange, currentUser, canEdit }) {
  const [showRemarks, setShowRemarks] = useState(false)
  const [pendingTrans, setPendingTrans] = useState(null)
  const [remarks, setRemarks] = useState('')
  const transitions = getWorkflowTransitions(booking.status)
  if (!canEdit || transitions.length === 0) return null
  const handleClick = trans => {
    if (['approved','cancelled','closed'].includes(trans.to)) { setPendingTrans(trans); setShowRemarks(true) }
    else onStatusChange(booking, trans.to, '', currentUser?.name)
  }
  const confirmTransition = () => {
    if (pendingTrans) { onStatusChange(booking, pendingTrans.to, remarks, currentUser?.name); setPendingTrans(null); setShowRemarks(false); setRemarks('') }
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Workflow Actions</p>
      <div className="flex gap-2 flex-wrap">
        {transitions.map(t => (
          <button key={t.to} onClick={() => handleClick(t)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${TRANS_STYLES[t.color]||TRANS_STYLES.slate}`}>
            {t.label}
          </button>
        ))}
      </div>
      {showRemarks && (
        <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-3 space-y-2.5 border border-slate-200 dark:border-navy-700">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{pendingTrans?.label} — Remarks (optional)</p>
          <textarea value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Reason, note, or instructions…" rows={2}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-navy-500/25 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => { setShowRemarks(false); setPendingTrans(null); setRemarks('') }}
              className="flex-1 py-2 rounded-lg border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">Cancel</button>
            <button onClick={confirmTransition}
              className="flex-1 py-2 rounded-lg bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all active:scale-95">Confirm</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── MODULE 2: Booking Detail Panel ───────────────────────────
function RouteHistoryModal({ booking, onClose }) {
  const points   = loadTripRoute(booking.id)
  const distance = calcRouteDistanceKm(booking.id)
  const histEntry= loadGPSHistory().find(h => h.tripId === booking.id)
  return (
    <ModalOverlay onClose={onClose} center>
      <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl shadow-2xl overflow-hidden animate-fade-up" onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-navy-800 border-b border-slate-200 dark:border-navy-700">
          <div><p className="font-display font-black text-slate-800 dark:text-white text-sm">Route History</p><p className="text-[10px] text-slate-400 font-mono">{booking.bookingNo||booking.id}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl border border-slate-200 dark:border-navy-600 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {points.length === 0 && !histEntry ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-navy-800/40 rounded-xl px-4 py-3">
              <AlertTriangle size={13} /> No GPS route data recorded for this trip yet.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3 text-center">
                <p className="text-lg font-display font-black text-navy-800 dark:text-blue-300">{histEntry?.distanceKm ?? distance} km</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Distance</p>
              </div>
              <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3 text-center">
                <p className="text-lg font-display font-black text-navy-800 dark:text-blue-300">{histEntry?.duration || '—'}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Duration</p>
              </div>
              <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3 text-center">
                <p className="text-lg font-display font-black text-navy-800 dark:text-blue-300">{histEntry?.routePoints??points.length}</p>
                <p className="text-[9px] text-slate-400 mt-0.5">GPS Points</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}

function BookingDetail({ booking, onEdit, onDelete, onAssign, onWhatsApp, canEdit, canDelete, canAssign, onStatusChange, currentUser }) {
  const typeCfg = TRIP_TYPE_CONFIG[booking.type]
  const [showRoute, setShowRoute] = useState(false)
  const [detailTab, setDetailTab] = useState('info')
  const approvalHistory = Array.isArray(booking.approval_history) ? booking.approval_history : []

  return (
    <div className="border-t border-slate-100 dark:border-navy-700 bg-slate-50/60 dark:bg-navy-800/30">
      {showRoute && <RouteHistoryModal booking={booking} onClose={() => setShowRoute(false)} />}

      {/* Sub-tabs */}
      <div className="flex gap-1 px-4 pt-3">
        {[['info','ℹ Info'],['timeline','📅 Timeline'],['history','📋 History']].map(([key,lbl]) => (
          <button key={key} onClick={() => setDetailTab(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
              detailTab===key
                ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow border border-slate-200 dark:border-navy-600'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {lbl}
            {key==='history' && approvalHistory.length>0 && (
              <span className="ml-1 text-[9px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{approvalHistory.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* Timeline tab */}
        {detailTab === 'timeline' && <BookingTimeline bookingId={booking.id} />}

        {/* History tab */}
        {detailTab === 'history' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {booking.createdBy    && <InfoChip label="Created by"      value={booking.createdBy}    />}
              {booking.approvedBy   && <InfoChip label="Approved by"     value={booking.approvedBy}   />}
              {booking.lastModifiedBy && <InfoChip label="Last modified" value={booking.lastModifiedBy}/>}
              {booking.createdAt    && <InfoChip label="Created at"      value={new Date(booking.createdAt).toLocaleDateString('en-IN')} />}
              {booking.remarks      && <InfoChip label="Remarks"         value={booking.remarks}      />}
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Approval History</p>
              <ApprovalHistory history={approvalHistory} />
            </div>
          </div>
        )}

        {/* Info tab */}
        {detailTab === 'info' && (
          <>
            {/* Route strip */}
            <div className="flex items-stretch gap-3 bg-white dark:bg-navy-800/60 rounded-xl p-3 border border-slate-100 dark:border-navy-700">
              <div className="flex flex-col items-center gap-1 pt-0.5">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <div className="flex-1 w-0.5 border-l border-dashed border-slate-300 dark:border-navy-600 min-h-[14px]" />
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div><p className="text-[9px] font-bold text-slate-400 uppercase">Pickup</p><p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{booking.pickup}</p></div>
                <div><p className="text-[9px] font-bold text-slate-400 uppercase">Drop</p><p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight">{booking.drop||'—'}</p></div>
              </div>
              <div className="text-right flex-shrink-0">
                {booking.fare > 0 && <p className="text-base font-black text-navy-800 dark:text-blue-300">Rs. {booking.fare.toLocaleString('en-IN')}</p>}
                {booking.km   && <p className="text-[10px] text-slate-400">{booking.km} km</p>}
              </div>
            </div>

            <button onClick={() => setShowRoute(true)}
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
              <Navigation size={13} /> View Route
            </button>

            {/* Detail grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label:'Booking No.',  value:booking.bookingNo, mono:true },
                { label:'Date',         value:booking.startDate },
                { label:'Time',         value:booking.startTime||'—' },
                { label:'Contact',      value:booking.contact },
                { label:'Driver',       value:booking.driver||'Not assigned' },
                { label:'Vehicle',      value:booking.vehicle||'Not assigned' },
                ...(booking.type==='round_trip'&&booking.returnDate?[{label:'Return',value:`${booking.returnDate} ${booking.returnTime||''}`.trim()}]:[]),
              ].map(d => (
                <div key={d.label} className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{d.label}</p>
                  <p className={`text-xs font-bold leading-tight ${d.mono?'font-mono':''} text-slate-700 dark:text-slate-200`}>{d.value}</p>
                </div>
              ))}
            </div>

            {booking.notes && (
              <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/15 rounded-lg px-3 py-2.5 border border-amber-100 dark:border-amber-800/30">
                <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-tight">{booking.notes}</p>
              </div>
            )}

            {/* Workflow actions */}
            <WorkflowActions booking={booking} onStatusChange={onStatusChange} currentUser={currentUser} canEdit={canEdit} />

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
              {canAssign && !['completed','cancelled','closed'].includes(booking.status) && (
                booking.driver ? (
                  <button onClick={() => onAssign(booking)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/15 text-blue-700 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/25 transition-colors"><UserCheck size={13} /> Change Driver</button>
                ) : ['approved','confirmed','assigned'].includes(booking.status) ? (
                  <button onClick={() => onAssign(booking)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all active:scale-95 shadow-md"><UserCheck size={13} /> Assign Driver</button>
                ) : null
              )}
              {canAssign && booking.driver && !['completed','cancelled','closed'].includes(booking.status) && (
                <button onClick={() => onWhatsApp && onWhatsApp(booking,'assigned')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md"><MessageCircle size={13} /> WhatsApp</button>
              )}
              {canEdit && !['completed','cancelled','closed'].includes(booking.status) && (
                <button onClick={() => onEdit(booking)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"><Edit2 size={13} /> Edit</button>
              )}
              {canDelete && (
                <button onClick={() => onDelete(booking.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/15 text-red-600 dark:text-red-400 text-xs font-bold hover:bg-red-100 dark:hover:bg-red-900/25 transition-colors"><Trash2 size={13} /> Delete</button>
              )}
              {booking.status === 'cancelled' && canAssign && (
                <button onClick={() => onWhatsApp && onWhatsApp(booking,'cancelled')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-500 dark:text-slate-400 text-xs font-bold hover:bg-slate-50 transition-colors"><MessageCircle size={13} /> Notify Customer</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function InfoChip({ label, value }) {
  return (
    <div className="bg-white dark:bg-navy-800/60 rounded-xl p-2.5 border border-slate-100 dark:border-navy-700">
      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">{value||'—'}</p>
    </div>
  )
}

// ── Calendar View ─────────────────────────────────────────────
function CalendarView({ bookings }) {
  const today     = new Date()
  const [yr, setYr]   = useState(today.getFullYear())
  const [mon, setMon] = useState(today.getMonth())
  const MONTH_NAMES   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const DOW           = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const firstDow      = new Date(yr, mon, 1).getDay()
  const daysInMon     = new Date(yr, mon+1, 0).getDate()
  const bookingMap    = useMemo(() => {
    const map = {}
    bookings.forEach(b => {
      if (!b.startDate) return
      const d = new Date(b.startDate+'T00:00:00')
      if (d.getFullYear()===yr && d.getMonth()===mon) { const day=d.getDate(); if(!map[day])map[day]=[]; map[day].push(b) }
    })
    return map
  }, [bookings,yr,mon])
  const prev = () => { if(mon===0){setMon(11);setYr(y=>y-1)}else setMon(m=>m-1) }
  const next = () => { if(mon===11){setMon(0);setYr(y=>y+1)}else setMon(m=>m+1) }
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
        <button onClick={prev} className="w-8 h-8 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors"><ChevronLeft size={15} /></button>
        <p className="font-display font-black text-slate-800 dark:text-white text-sm">{MONTH_NAMES[mon]} {yr}</p>
        <button onClick={next} className="w-8 h-8 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors"><ChevronRight size={15} /></button>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map(d => <div key={d} className={`text-center text-[10px] font-bold py-1 ${d==='Sun'?'text-red-500':d==='Sat'?'text-blue-500':'text-slate-400 dark:text-slate-500'}`}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({length:firstDow}).map((_,i) => <div key={`e${i}`} className="aspect-square" />)}
          {Array.from({length:daysInMon}).map((_,idx) => {
            const day=idx+1; const dateStr=`${yr}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const trips=bookingMap[day]||[]; const isToday=dateStr===todayStr; const hasCal=trips.length>0
            return (
              <div key={day} className={`aspect-square rounded-xl flex flex-col items-center justify-start pt-1 px-0.5 border transition-all cursor-default ${isToday?'bg-navy-900 dark:bg-blue-700 border-navy-700 dark:border-blue-500 shadow-lg':hasCal?'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40':'border-slate-100 dark:border-navy-800 bg-transparent'}`}>
                <span className={`text-[11px] font-bold leading-none ${isToday?'text-white':hasCal?'text-emerald-700 dark:text-emerald-400':'text-slate-500 dark:text-slate-500'}`}>{day}</span>
                {hasCal && !isToday && <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">{trips.slice(0,3).map((t,ti)=><span key={ti} className={`w-1.5 h-1.5 rounded-full ${getStatusCfg(t.status).dot.replace(' animate-pulse','')}`}/>)}</div>}
                {hasCal && isToday && <span className="text-[9px] text-blue-200 mt-0.5 font-bold">{trips.length}</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function Trips() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { user, can, isAdmin, isManager, isDriver } = useAuth()
  const prefill   = location.state?.prefill || null

  const canCreate = can('trips') && (isAdmin || isManager)
  const canEdit   = can('trips') && (isAdmin || isManager)
  const canDelete = isAdmin
  const canAssign = can('trips') && (isAdmin || isManager)

  const [bookings,      setBookings]      = useState([])
  const [drivers,       setDrivers]       = useState([])
  const [vehicles,      setVehicles]      = useState([])
  const [loadError,     setLoadError]     = useState(null)
  const [tab,           setTab]           = useState('list')
  const [search,        setSearch]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [typeFilter,    setTypeFilter]    = useState('all')
  const [expanded,      setExpanded]      = useState(null)
  const [showCreate,    setShowCreate]    = useState(() => !!prefill)
  const [editBooking,   setEditBooking]   = useState(null)
  const [assignBooking, setAssignBooking] = useState(null)

  const filtered = useMemo(() =>
    bookings.filter(b => {
      if (isDriver) return b.driver === user?.name
      const matchSearch = !search || [b.customer,b.bookingNo,b.pickup,b.drop,b.driver,b.vehicle].some(v => v?.toLowerCase().includes(search.toLowerCase()))
      const matchStatus = statusFilter === 'all' || b.status === statusFilter
      const matchType   = typeFilter   === 'all' || b.type   === typeFilter
      return matchSearch && matchStatus && matchType
    })
  , [bookings, search, statusFilter, typeFilter, isDriver, user])

  const reload = useCallback(async () => {
    const [b, d, v] = await Promise.allSettled([loadBookings(), loadDrivers(), loadVehicles()])
    setBookings(b.status==='fulfilled' && Array.isArray(b.value) ? b.value : [])
    setDrivers( d.status==='fulfilled' && Array.isArray(d.value) ? d.value : [])
    setVehicles(v.status==='fulfilled' && Array.isArray(v.value) ? v.value : [])
    setLoadError([b,d,v].some(r=>r.status==='rejected') ? 'Some data failed to load. Retry.' : null)
  }, [])
  useEffect(() => { reload() }, [reload])

  const handleSave = async booking => {
    try { await saveBooking(booking); await reload(); setShowCreate(false); setEditBooking(null) }
    catch (err) { console.error('[Trips] save failed:', err); window.alert('Could not save booking. Check connection and retry.') }
  }

  const handleAssign = async ({ driver, vehicle }) => {
    if (!assignBooking) return
    const updated = { ...assignBooking, driver, vehicle, status:'assigned', updatedAt:new Date().toISOString() }
    try {
      await saveBooking(updated)
      addAuditEvent('TRIP_ASSIGNED', { description:`${updated.customer} assigned to ${driver} (${vehicle})`, tripId:updated.id, driver })
      addTimelineEvent(updated.id, 'DRIVER_ASSIGNED', `Assigned to ${driver}`)
      notify.tripAssigned(`${updated.customer} (${updated.bookingNo}) → ${driver}`, user?.id, updated.id)
      await reload(); setAssignBooking(null)
    } catch (err) { console.error('[Trips] assign failed:', err); window.alert('Could not assign driver. Try again.') }
  }

  const handleDelete = async id => {
    if (!window.confirm('Delete this booking? This cannot be undone.')) return
    try { await deleteBooking(id); await reload(); setExpanded(null) }
    catch (err) { console.error('[Trips] delete failed:', err); window.alert('Could not delete booking. Try again.') }
  }

  const handleWhatsApp = (booking, msgType = 'assigned') => {
    window.open(buildWhatsAppUrl(booking, msgType), '_blank', 'noopener,noreferrer')
  }

  // ── MODULE 1: Full status change with approval history ────
  const handleStatusChange = async (booking, newStatus, remarks = '', actorName = '') => {
    const now    = new Date().toISOString()
    const actor  = actorName || user?.name || 'System'
    const history = Array.isArray(booking.approval_history) ? [...booking.approval_history] : []
    history.push({
      action:     newStatus==='pending'?'submitted':newStatus==='approved'?'approved':newStatus==='cancelled'?'cancelled':newStatus,
      from_status:booking.status, to_status:newStatus,
      actor_name: actor, actor_role:user?.role||'',
      remarks:    remarks||null, created_at:now,
    })
    const updates = {
      ...booking, status:newStatus, updatedAt:now, lastModifiedBy:actor,
      remarks:remarks||booking.remarks, approval_history:history,
      ...(newStatus==='approved' ? { approvedBy:actor, approvedAt:now } : {}),
    }
    await saveBooking(updates)

    // Audit
    const auditMap = { completed:'TRIP_COMPLETED', cancelled:'TRIP_CANCELLED', started:'TRIP_STARTED', approved:'TRIP_ASSIGNED', pending:'TRIP_CREATED' }
    if (auditMap[newStatus]) addAuditEvent(auditMap[newStatus], { description:`${booking.customer} — ${booking.pickup||''} → ${booking.drop||''}`, tripId:booking.id, driver:booking.driver })

    // Timeline
    const tlMap = { pending:'BOOKING_CREATED', approved:'DRIVER_ASSIGNED', assigned:'DRIVER_ASSIGNED', started:'TRIP_STARTED', completed:'TRIP_COMPLETED', cancelled:'TRIP_CANCELLED', closed:'NOTE_ADDED' }
    if (tlMap[newStatus]) addTimelineEvent(booking.id, tlMap[newStatus], remarks || `Status → ${newStatus}`)

    // Notifications
    const msg = `${booking.customer} (${booking.bookingNo}) — ${newStatus}`
    if (newStatus==='pending')   notify.bookingPending(msg, user?.id, booking.id)
    if (newStatus==='approved')  notify.bookingApproved(msg, user?.id, booking.id)
    if (newStatus==='cancelled') notify.bookingCancelled(msg, user?.id, booking.id)
    if (newStatus==='started')   notify.tripStarted(msg, user?.id, booking.id)
    if (newStatus==='completed') notify.tripCompleted(msg, user?.id, booking.id)

    reload()
  }

  // ── Summary counts ────────────────────────────────────────
  const counts = useMemo(() => ({
    total:     bookings.length,
    draft:     bookings.filter(b=>b.status==='draft').length,
    pending:   bookings.filter(b=>b.status==='pending').length,
    approved:  bookings.filter(b=>['approved','confirmed'].includes(b.status)).length,
    assigned:  bookings.filter(b=>b.status==='assigned').length,
    active:    bookings.filter(b=>b.status==='started').length,
    completed: bookings.filter(b=>b.status==='completed').length,
    cancelled: bookings.filter(b=>b.status==='cancelled').length,
  }), [bookings])

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title={isDriver ? 'My Assigned Trips' : 'Bookings & Trips'}
        subtitle={isDriver ? 'Trips assigned to you' : `${counts.total} total bookings · operational center`}
        action={canCreate && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
            <Plus size={15} /> New Booking
          </button>
        )}
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" /><p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p></div>
          <button onClick={reload} className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">Retry</button>
        </div>
      )}

      {/* Summary pills — full lifecycle */}
      {!isDriver && (
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {[
            { label:'Total',     value:counts.total,     color:'text-slate-700 dark:text-slate-200',     filter:'all'       },
            { label:'Draft',     value:counts.draft,     color:'text-slate-500 dark:text-slate-400',     filter:'draft'     },
            { label:'Pending',   value:counts.pending,   color:'text-yellow-600 dark:text-yellow-400',   filter:'pending'   },
            { label:'Approved',  value:counts.approved,  color:'text-violet-600 dark:text-violet-400',   filter:'approved'  },
            { label:'Assigned',  value:counts.assigned,  color:'text-blue-600 dark:text-blue-400',       filter:'assigned'  },
            { label:'Active',    value:counts.active,    color:'text-amber-600 dark:text-amber-400',     filter:'started'   },
            { label:'Completed', value:counts.completed, color:'text-emerald-600 dark:text-emerald-400', filter:'completed' },
            { label:'Cancelled', value:counts.cancelled, color:'text-red-500 dark:text-red-400',         filter:'cancelled' },
          ].map(s => (
            <div key={s.label} className="glass-card rounded-lg px-2 py-2 text-center cursor-pointer hover:shadow-md transition-all" onClick={() => setStatusFilter(s.filter)}>
              <p className={`text-xl font-display font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      {!isDriver && (
        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 w-fit">
          {[['list','≡ List'],['calendar','📅 Calendar']].map(([key,lbl]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${tab===key?'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow':'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {tab === 'calendar' && !isDriver && <CalendarView bookings={bookings} />}

      {(tab === 'list' || isDriver) && (
        <>
          {!isDriver && (
            <div className="flex flex-wrap gap-2.5 items-center">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[160px] max-w-xs">
                <Search size={14} className="text-slate-400 flex-shrink-0" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search bookings…"
                  className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 outline-none w-full font-body" />
              </div>
              <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 overflow-x-auto no-scrollbar">
                {['all','draft','pending','approved','assigned','started','completed','cancelled'].map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap capitalize ${statusFilter===s?'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow':'text-slate-500 dark:text-slate-400'}`}>
                    {s==='all'?'All':s==='started'?'Active':s.charAt(0).toUpperCase()+s.slice(1)}
                  </button>
                ))}
              </div>
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none font-body">
                <option value="all">All Types</option>
                {TRIP_TYPE_LIST.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Calendar size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No bookings found</p>
              {canCreate && (
                <button onClick={() => setShowCreate(true)} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 transition-all">
                  <Plus size={13} /> Create First Booking
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {filtered.map(booking => {
                const isOpen  = expanded === booking.id
                const typeCfg = TRIP_TYPE_CONFIG[booking.type]
                return (
                  <div key={booking.id} className="glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all duration-200">
                    <div className={`h-0.5 bg-gradient-to-r ${typeCfg?.gradient||'from-slate-400 to-slate-500'}`} />
                    <div className="flex items-center gap-3 p-4 cursor-pointer select-none" onClick={() => setExpanded(isOpen ? null : booking.id)}>
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${typeCfg?.gradient||'from-slate-400 to-slate-500'} flex items-center justify-center text-lg flex-shrink-0 shadow-sm`}>
                        {typeCfg?.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-bold text-slate-800 dark:text-white text-sm">{booking.customer}</p>
                          <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{booking.bookingNo}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                          <MapPin size={9} className="flex-shrink-0" />
                          <span className="truncate max-w-[160px]">{booking.pickup}</span>
                          {booking.drop && <><span>→</span><span className="truncate max-w-[120px]">{booking.drop}</span></>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                          <Calendar size={9} /><span>{booking.startDate}</span>
                          {booking.startTime && <span>{booking.startTime}</span>}
                          {booking.driver && <><User size={9} /><span>{booking.driver}</span></>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        <StatusBadge status={booking.status} />
                        {booking.fare > 0 && <p className="text-sm font-black text-navy-800 dark:text-blue-300">Rs. {booking.fare.toLocaleString('en-IN')}</p>}
                        {isOpen ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                      </div>
                    </div>
                    {isOpen && (
                      <BookingDetail
                        booking={booking}
                        onEdit={setEditBooking}
                        onDelete={handleDelete}
                        onAssign={setAssignBooking}
                        onWhatsApp={handleWhatsApp}
                        onStatusChange={handleStatusChange}
                        currentUser={user}
                        canEdit={canEdit}
                        canDelete={canDelete && booking.status !== 'completed'}
                        canAssign={canAssign}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {(showCreate || editBooking) && (
        <BookingModal
          booking={editBooking || (prefill ? { customer:prefill.customer, contact:prefill.contact } : null)}
          onClose={() => { setShowCreate(false); setEditBooking(null) }}
          onSave={handleSave}
          userName={user?.name}
        />
      )}
      {assignBooking && (
        <AssignModal booking={assignBooking} bookings={bookings} drivers={drivers} vehicles={vehicles}
          onClose={() => setAssignBooking(null)} onAssign={handleAssign} />
      )}
    </div>
  )
}
