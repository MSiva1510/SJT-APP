import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Minus, ChevronRight,
  Calendar, Clock, User, Car, FileText,
  MapPin, RotateCcw, Navigation, Key,
  CheckCircle, AlertTriangle,
} from 'lucide-react'
import { TRIP_TYPE_LIST, TRIP_TYPE_CONFIG, saveBooking, generateBookingNumber } from '../data/tripTypes'
import { addAuditEvent }   from '../data/auditLogData'
import { addTimelineEvent } from '../data/tripTimelineData'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import PageHeader from '../components/ui/PageHeader'
import { validateField, sanitizeInput } from '../utils/formValidation'
import { useAuth } from '../context/AuthContext'

// ─────────────────────────────────────────────────────────────
//  Shared field primitives
// ─────────────────────────────────────────────────────────────
function Label({ children, required }) {
  return (
    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
      {children}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
  )
}

function Input({ id, type = 'text', value, onChange, placeholder, min, max, required, className = '', icon: Icon, field }) {
  const handleChange = (e) => {
    let v = e.target.value
    // Use centralized sanitization
    if (field) {
      v = sanitizeInput(v, field)
    } else {
      // Fallback to original inline logic for fields without validation rules
      if (field === 'customer')                           { v = v.slice(0, 60) }
      if (field === 'contact')                            { v = v.replace(/\D/g, '').slice(0, 10) }
      if (field === 'pickup' || field === 'drop'
          || field === 'destination' || field === 'baseLocation'
          || field === 'stop')                            { v = v.slice(0, 100) }
      if (field === 'numberOfDays' && Number(v) < 1)      { v = '1' }
      if (field === 'waitingTime')                        { v = v.slice(0, 40) }
      if (field === 'notes')                              { v = v.slice(0, 300) }
    }
    onChange({ target: { value: v } })
  }
  return (
    <div className="relative">
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
          <Icon size={14} />
        </div>
      )}
      <input
        id={id} type={type} value={value} onChange={handleChange}
        placeholder={placeholder} min={min} max={max} required={required}
        className={`
          w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700
          bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
          placeholder-slate-300 dark:placeholder-slate-600 text-sm
          focus:outline-none focus:ring-2 focus:ring-navy-500/25 focus:border-navy-400 dark:focus:border-blue-500
          transition-all font-body
          ${Icon ? 'pl-9' : ''}
          ${className}
        `}
      />
    </div>
  )
}

function Select({ id, value, onChange, children, required }) {
  return (
    <select
      id={id} value={value} onChange={onChange} required={required}
      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700
                 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
                 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25
                 focus:border-navy-400 dark:focus:border-blue-500 transition-all font-body
                 appearance-none"
    >
      {children}
    </select>
  )
}

function Textarea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700
                 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
                 placeholder-slate-300 dark:placeholder-slate-600 text-sm
                 focus:outline-none focus:ring-2 focus:ring-navy-500/25 focus:border-navy-400
                 dark:focus:border-blue-500 resize-none transition-all font-body"
    />
  )
}

function FieldGroup({ title, icon: Icon, children }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3 bg-slate-50/80 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
        {Icon && <Icon size={14} className="text-navy-700 dark:text-blue-400 flex-shrink-0" />}
        <p className="text-xs font-bold text-navy-800 dark:text-slate-200 uppercase tracking-wider">{title}</p>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function Grid2({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
}

// ─────────────────────────────────────────────────────────────
//  Type-specific field sections
// ─────────────────────────────────────────────────────────────

function OneWayFields({ data, set }) {
  return (
    <FieldGroup title="Route" icon={Navigation}>
      <div>
        <Label required>Pickup Location</Label>
        <Input icon={MapPin} value={data.pickup} onChange={e => set({ ...data, pickup: e.target.value })} placeholder="e.g. Hotel Atithi, Puducherry" required field="pickup" />
      </div>
      <div>
        <Label required>Drop Location</Label>
        <Input icon={MapPin} value={data.drop} onChange={e => set({ ...data, drop: e.target.value })} placeholder="e.g. Chennai International Airport" required field="drop" />
      </div>
    </FieldGroup>
  )
}

function RoundTripFields({ data, set }) {
  return (
    <FieldGroup title="Route & Return" icon={RotateCcw}>
      <Grid2>
        <div>
          <Label required>Pickup Location</Label>
          <Input icon={MapPin} value={data.pickup} onChange={e => set({ ...data, pickup: e.target.value })} placeholder="e.g. Puducherry Bus Stand" required field="pickup" />
        </div>
        <div>
          <Label required>Destination</Label>
          <Input icon={MapPin} value={data.destination} onChange={e => set({ ...data, destination: e.target.value })} placeholder="e.g. Bangalore" required field="destination" />
        </div>
      </Grid2>
      <Grid2>
        <div>
          <Label required>Return Date</Label>
          <Input type="date" value={data.returnDate} onChange={e => set({ ...data, returnDate: e.target.value })} required />
        </div>
        <div>
          <Label required>Return Time</Label>
          <Input type="time" value={data.returnTime} onChange={e => set({ ...data, returnTime: e.target.value })} required />
        </div>
      </Grid2>
    </FieldGroup>
  )
}

function LocalVisitFields({ data, set }) {
  const addStop    = () => set({ ...data, stops: [...(data.stops || ['']), ''] })
  const removeStop = (i) => set({ ...data, stops: data.stops.filter((_, idx) => idx !== i) })
  const updateStop = (i, v) => set({ ...data, stops: data.stops.map((s, idx) => idx === i ? v : s) })

  return (
    <FieldGroup title="Base Location & Stops" icon={MapPin}>
      <div>
        <Label required>Base Location</Label>
        <Input icon={MapPin} value={data.baseLocation} onChange={e => set({ ...data, baseLocation: e.target.value })} placeholder="e.g. Puducherry" required field="baseLocation" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Stops</Label>
          <button
            type="button"
            onClick={addStop}
            className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            <Plus size={13} /> Add Stop
          </button>
        </div>
        {(data.stops || []).length === 0 && (
          <div className="text-xs text-slate-400 dark:text-slate-500 italic py-2">
            No stops added. Click "Add Stop" to add pickup/drop points.
          </div>
        )}
        <div className="space-y-2">
          {(data.stops || []).map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[10px] font-black flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <input
                type="text"
                value={stop}
                onChange={e => updateStop(i, e.target.value.slice(0, 100))}
                placeholder={`Stop ${i + 1} — e.g. Auroville`}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/25 focus:border-violet-400 transition-all font-body placeholder-slate-300 dark:placeholder-slate-600"
              />
              <button
                type="button"
                onClick={() => removeStop(i)}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0"
              >
                <Minus size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Waiting Time (per stop)</Label>
        <Input
          value={data.waitingTime}
          onChange={e => set({ ...data, waitingTime: e.target.value })}
          placeholder="e.g. 30 minutes, 1 hour"
          icon={Clock}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5">
          Same pickup and drop allowed for local visits.
        </p>
      </div>
    </FieldGroup>
  )
}

function MultiDayFields({ data, set }) {
  const days = parseInt(data.numberOfDays) || 1
  return (
    <>
      <FieldGroup title="Route & Duration" icon={Calendar}>
        <Grid2>
          <div>
            <Label required>Pickup Location</Label>
            <Input icon={MapPin} value={data.pickup} onChange={e => set({ ...data, pickup: e.target.value })} placeholder="e.g. Puducherry" required field="pickup" />
          </div>
          <div>
            <Label required>Destination(s)</Label>
            <Input icon={MapPin} value={data.destination} onChange={e => set({ ...data, destination: e.target.value })} placeholder="e.g. Tirupati – Bangalore – Mysore" required field="destination" />
          </div>
        </Grid2>
        <div>
          <Label required>Number of Days</Label>
          <Input
            type="number" min="1"
            value={data.numberOfDays}
            onChange={e => set({ ...data, numberOfDays: e.target.value })}
            placeholder="e.g. 4"
            required
            field="numberOfDays"
          />
        </div>
      </FieldGroup>

      {/* Day timeline placeholder */}
      {days > 0 && (
        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Day Timeline (Placeholder)
          </p>
          <div className="space-y-2">
            {Array.from({ length: Math.min(days, 7) }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-navy-800/50 rounded-xl border border-slate-100 dark:border-navy-700">
                <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-black">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Day {i + 1}</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Route & stops to be configured</p>
                </div>
                <span className="text-[10px] text-slate-300 dark:text-navy-600 font-mono">TBD</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost placeholders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: 'Hotel Expense', sub: 'Per night accommodation placeholder', icon: '🏨' },
          { label: 'Driver Bata',   sub: 'Per day allowance placeholder',        icon: '💵' },
        ].map(p => (
          <div key={p.label} className="glass-card rounded-xl p-4 flex items-center gap-3">
            <span className="text-2xl flex-shrink-0">{p.icon}</span>
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{p.label}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{p.sub}</p>
              <span className="inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Coming soon
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function RentalWithDriverFields({ data, set }) {
  return (
    <FieldGroup title="Rental Period" icon={Clock}>
      <Grid2>
        <div>
          <Label required>Pickup Time</Label>
          <Input type="time" value={data.pickupTime} onChange={e => set({ ...data, pickupTime: e.target.value })} required />
        </div>
        <div>
          <Label required>Return Time</Label>
          <Input type="time" value={data.returnTime} onChange={e => set({ ...data, returnTime: e.target.value })} required />
        </div>
      </Grid2>
      <div className="flex items-start gap-2.5 bg-teal-50 dark:bg-teal-900/15 rounded-xl p-3 border border-teal-100 dark:border-teal-800/30">
        <CheckCircle size={14} className="text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-teal-700 dark:text-teal-300 font-medium leading-relaxed">
          Vehicle and driver are selected in the common fields above. Hourly rate applies for the duration between pickup and return time.
        </p>
      </div>
    </FieldGroup>
  )
}

function SelfDriveFields({ data, set }) {
  return (
    <FieldGroup title="Self Drive Details" icon={Key}>
      <Grid2>
        <div>
          <Label required>Pickup Time</Label>
          <Input type="time" value={data.pickupTime} onChange={e => set({ ...data, pickupTime: e.target.value })} required />
        </div>
        <div>
          <Label required>Return Time</Label>
          <Input type="time" value={data.returnTime} onChange={e => set({ ...data, returnTime: e.target.value })} required />
        </div>
      </Grid2>
      <div>
        <Label required>Security Deposit (Rs.)</Label>
        <Input
          type="number" min="0"
          value={data.securityDeposit}
          onChange={e => set({ ...data, securityDeposit: e.target.value })}
          placeholder="e.g. 5000"
          required
        />
      </div>
      <Grid2>
        <div>
          <Label>Start KM</Label>
          <Input
            type="number" min="0"
            value={data.startKm}
            onChange={e => set({ ...data, startKm: e.target.value })}
            placeholder="Odometer at handover"
          />
        </div>
        <div>
          <Label>End KM</Label>
          <div className="relative">
            <Input
              type="number" min="0"
              value={data.endKm}
              onChange={e => set({ ...data, endKm: e.target.value })}
              placeholder="Filled on return"
              className="bg-slate-50 dark:bg-navy-800/40"
            />
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Filled when vehicle is returned</p>
        </div>
      </Grid2>
      <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/15 rounded-xl p-3 border border-amber-100 dark:border-amber-800/30">
        <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium leading-relaxed">
          No driver is assigned for self-drive rentals. Verify customer's driving licence before handing over the vehicle.
        </p>
      </div>
    </FieldGroup>
  )
}

// ─────────────────────────────────────────────────────────────
//  Main CreateTrip page
// ─────────────────────────────────────────────────────────────
const EMPTY_COMMON = {
  customer: '', contact: '', vehicle: '', driver: '',
  startDate: '', startTime: '', notes: '',
}

const EMPTY_TYPE_DATA = {
  one_way:            { pickup: '', drop: '' },
  round_trip:         { pickup: '', destination: '', returnDate: '', returnTime: '' },
  local_visit:        { baseLocation: '', stops: [''], waitingTime: '' },
  multi_day:          { pickup: '', destination: '', numberOfDays: '' },
  rental_with_driver: { pickupTime: '', returnTime: '' },
  self_drive:         { pickupTime: '', returnTime: '', securityDeposit: '', startKm: '', endKm: '' },
}

export default function CreateTrip() {
  const navigate = useNavigate()
  const { user }  = useAuth()

  const [step,       setStep]       = useState(0)   // 0 = pick type, 1 = fill form
  const [tripType,   setTripType]   = useState(null)
  const [common,     setCommon]     = useState(EMPTY_COMMON)
  const [typeData,   setTypeData]   = useState({})
  const [submitted,  setSubmitted]  = useState(false)
  const [errors,     setErrors]     = useState({})
  const [drivers,    setDrivers]    = useState([])
  const [vehicles,   setVehicles]   = useState([])

  useEffect(() => {
    loadDrivers().then(d => setDrivers(Array.isArray(d) ? d : [])).catch(err => console.error('[CreateTrip] load drivers failed:', err))
    loadVehicles().then(v => setVehicles(Array.isArray(v) ? v : [])).catch(err => console.error('[CreateTrip] load vehicles failed:', err))
  }, [])

  const cfg = tripType ? TRIP_TYPE_CONFIG[tripType] : null

  const isSelfDrive = tripType === 'self_drive'

  const selectType = (type) => {
    setTripType(type)
    setTypeData(EMPTY_TYPE_DATA[type] || {})
    setStep(1)
    setErrors({})
  }

  const validate = () => {
    const e = {}
    const customerError = validateField('name', common.customer)
    if (!common.customer.trim()) {
      e.customer = 'Customer name is required'
    } else if (customerError) {
      e.customer = customerError
    }
    if (!common.vehicle)         e.vehicle  = 'Vehicle is required'
    if (!isSelfDrive && !common.driver) e.driver = 'Driver is required'
    if (!common.startDate)       e.startDate = 'Start date is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const bookingNo = generateBookingNumber()

    // Resolve human-readable display values from selected IDs
    const selectedDriver  = drivers.find(d => d.id === common.driver)
    const selectedVehicle = vehicles.find(v => v.id === common.vehicle)

    // Derive pickup/drop from type-specific data for display
    const pickup = typeData.pickup || typeData.baseLocation || common.customer
    const drop   = typeData.drop   || typeData.destination  || typeData.stops?.join(' · ') || '—'

    // Build payload with snake_case column names matching the Supabase schema
    const booking = {
      booking_number:   bookingNo,
      booking_id:       bookingNo,
      type:             tripType,
      status:           common.driver ? 'assigned' : 'draft',
      customer_name:    common.customer.trim(),
      customer_contact: common.contact.trim(),
      pickup_location:  pickup,
      drop_location:    drop,
      start_date:       common.startDate,
      start_time:       common.startTime || null,
      end_date:         typeData.returnDate  || null,
      end_time:         typeData.returnTime  || null,
      notes:            common.notes.trim(),
      driver_id:        selectedDriver?.id  || null,
      vehicle_id:       selectedVehicle?.id || null,
      total_fare:       null,
      total_km:         null,
      // Store display names + all type-specific fields in type_data JSONB
      type_data: {
        ...typeData,
        driver_name:          selectedDriver?.name          || null,
        vehicle_registration: selectedVehicle?.reg          || null,
        booking_ref:          bookingNo,
      },
      created_by: user?.id || null,
    }

    try {
      await saveBooking(booking)
    } catch (err) {
      console.error('[CreateTrip] saveBooking failed:', err)
      setErrors({ submit: 'Failed to save booking. Please check your connection and try again.' })
      return
    }

    addAuditEvent('TRIP_CREATED', {
      description: `${booking.customer_name} — ${pickup} → ${drop}`,
      tripId: bookingNo,
      driver: selectedDriver?.name || null,
    })
    if (selectedDriver) {
      addTimelineEvent(bookingNo, 'assigned', `Assigned to ${selectedDriver.name}`)
    }
    setSubmitted(true)
  }

  // ── Success screen ────────────────────────────────────────
  if (submitted && cfg) {
    return (
      <div className="max-w-lg mx-auto animate-fade-up">
        <div className="glass-card rounded-3xl p-8 text-center space-y-5">
          <div className={`w-20 h-20 rounded-3xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center mx-auto shadow-xl text-3xl`}>
            {cfg.icon}
          </div>
          <div>
            <h2 className="font-display font-black text-slate-800 dark:text-white text-2xl">Trip Created!</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {cfg.label} for <strong>{common.customer}</strong> has been saved.
            </p>
          </div>
          {/* Summary */}
          <div className="bg-slate-50 dark:bg-navy-800/60 rounded-2xl p-4 text-left space-y-2.5">
            {[
              { label: 'Trip Type',   value: cfg.label },
              { label: 'Customer',    value: common.customer },
              { label: 'Vehicle',     value: vehicles.find(v => v.id === common.vehicle)?.reg || common.vehicle },
              { label: 'Driver',      value: drivers.find(d => d.id === common.driver)?.name || (tripType === 'self_drive' ? 'Self Drive' : '—') },
              { label: 'Start Date',  value: common.startDate },
              { label: 'Start Time',  value: common.startTime || '—' },
            ].map(r => (
              <div key={r.label} className="flex justify-between text-sm gap-4">
                <span className="text-slate-500 dark:text-slate-400 font-medium">{r.label}</span>
                <span className="font-bold text-slate-800 dark:text-white text-right">{r.value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep(0); setTripType(null); setCommon(EMPTY_COMMON); setTypeData({}); setSubmitted(false) }}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-50 dark:hover:bg-navy-700 transition-all"
            >
              New Trip
            </button>
            <button
              onClick={() => navigate('/trips')}
              className="flex-1 py-3 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg"
            >
              View All Trips
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Step 0: Pick trip type ────────────────────────────────
  if (step === 0) {
    return (
      <div className="space-y-5 animate-fade-up max-w-2xl">
        <PageHeader
          title="Create Trip"
          subtitle="Select the type of trip to begin"
          action={
            <button onClick={() => navigate('/trips')}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
              <ArrowLeft size={15} /> Back
            </button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {TRIP_TYPE_LIST.map(type => (
            <button
              key={type.id}
              onClick={() => selectType(type.id)}
              className={`
                flex items-start gap-4 p-5 rounded-2xl border-2 text-left
                transition-all duration-200 group hover:shadow-lg hover:-translate-y-0.5 active:scale-98
                ${type.border} ${type.bg}
              `}
            >
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${type.gradient} flex items-center justify-center text-2xl flex-shrink-0 shadow-lg group-hover:scale-110 transition-transform`}>
                {type.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-black text-slate-800 dark:text-white text-base">{type.label}</p>
                  <ChevronRight size={16} className="text-slate-400 dark:text-slate-500 flex-shrink-0 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{type.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── Step 1: Fill form ─────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-up max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(0)}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${cfg.gradient} flex items-center justify-center text-xl flex-shrink-0 shadow-md`}>
            {cfg.icon}
          </div>
          <div>
            <h1 className="font-display font-black text-slate-800 dark:text-white text-xl leading-tight">{cfg.label}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{cfg.description}</p>
          </div>
        </div>
      </div>

      {/* Errors summary */}
      {Object.keys(errors).length > 0 && (
        <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-4 py-3">
          <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700 dark:text-red-400">Please fix the following:</p>
            <ul className="mt-1 space-y-0.5">
              {Object.values(errors).map((msg, i) => (
                <li key={i} className="text-xs text-red-600 dark:text-red-400">{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Common fields */}
        <FieldGroup title="Customer" icon={User}>
          <Grid2>
            <div>
              <Label required>Customer Name</Label>
              <Input
                value={common.customer}
                onChange={e => setCommon({ ...common, customer: e.target.value })}
                placeholder="Full name"
                required
                field="customer"
                className={errors.customer ? 'border-red-400 dark:border-red-600' : ''}
              />
              {errors.customer && <p className="text-xs text-red-500 mt-1">{errors.customer}</p>}
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input
                type="tel"
                value={common.contact}
                onChange={e => setCommon({ ...common, contact: e.target.value })}
                placeholder="10-digit mobile"
                field="contact"
              />
            </div>
          </Grid2>
        </FieldGroup>

        <FieldGroup title="Vehicle & Driver" icon={Car}>
          <Grid2>
            <div>
              <Label required>Vehicle</Label>
              <Select
                value={common.vehicle}
                onChange={e => setCommon({ ...common, vehicle: e.target.value })}
                required
              >
                <option value="">— Select vehicle —</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id} disabled={v.status !== 'active'}>
                    {v.reg} — {v.type} ({v.model}){v.status !== 'active' ? ' ⚠ Service' : ''}
                  </option>
                ))}
              </Select>
              {errors.vehicle && <p className="text-xs text-red-500 mt-1">{errors.vehicle}</p>}
            </div>
            <div>
              <Label required={!isSelfDrive}>
                Driver {isSelfDrive && <span className="text-slate-400 font-normal normal-case text-[10px] ml-1">(not required for self-drive)</span>}
              </Label>
              <Select
                value={common.driver}
                onChange={e => setCommon({ ...common, driver: e.target.value })}
                required={!isSelfDrive}
              >
                <option value="">— Select driver —</option>
                {!isSelfDrive && drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.vehicle}
                  </option>
                ))}
                {isSelfDrive && <option value="self_drive">Self Drive (no driver)</option>}
              </Select>
              {errors.driver && <p className="text-xs text-red-500 mt-1">{errors.driver}</p>}
            </div>
          </Grid2>
        </FieldGroup>

        <FieldGroup title="Schedule" icon={Calendar}>
          <Grid2>
            <div>
              <Label required>Start Date</Label>
              <Input
                type="date"
                value={common.startDate}
                onChange={e => setCommon({ ...common, startDate: e.target.value })}
                required
                className={errors.startDate ? 'border-red-400 dark:border-red-600' : ''}
              />
              {errors.startDate && <p className="text-xs text-red-500 mt-1">{errors.startDate}</p>}
            </div>
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={common.startTime}
                onChange={e => setCommon({ ...common, startTime: e.target.value })}
              />
            </div>
          </Grid2>
        </FieldGroup>

        {/* Type-specific fields */}
        {tripType === 'one_way'            && <OneWayFields            data={typeData} set={setTypeData} />}
        {tripType === 'round_trip'         && <RoundTripFields         data={typeData} set={setTypeData} />}
        {tripType === 'local_visit'        && <LocalVisitFields        data={typeData} set={setTypeData} />}
        {tripType === 'multi_day'          && <MultiDayFields          data={typeData} set={setTypeData} />}
        {tripType === 'rental_with_driver' && <RentalWithDriverFields  data={typeData} set={setTypeData} />}
        {tripType === 'self_drive'         && <SelfDriveFields         data={typeData} set={setTypeData} />}

        {/* Notes */}
        <FieldGroup title="Notes" icon={FileText}>
          <div>
            <Label>Additional Notes</Label>
            <Textarea
              value={common.notes}
              onChange={e => setCommon({ ...common, notes: e.target.value })}
              placeholder="Any special instructions, passenger count, luggage details…"
            />
          </div>
        </FieldGroup>

        {/* Submit */}
        <button
          type="submit"
          className={`
            w-full py-3.5 rounded-xl font-bold text-sm text-white
            bg-gradient-to-r ${cfg.gradient}
            hover:opacity-90 active:scale-[0.99] transition-all shadow-lg
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-navy-500/40
          `}
        >
          ✓ Create {cfg.label} Trip
        </button>
      </form>
    </div>
  )
}