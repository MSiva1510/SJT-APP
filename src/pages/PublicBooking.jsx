import { useState } from 'react'
import {
  Car, ChevronRight, CheckCircle, Plus, X,
  ArrowLeft, RotateCcw,
} from 'lucide-react'
import { generateBookingNumber, saveBooking } from '../data/tripTypes'
import { upsertCustomerFromBooking, findCustomerByMobile } from '../data/customerData'

const TRIP_TYPES = [
  { key:'one_way',     label:'One Way',           icon:'🚗', desc:'Single destination' },
  { key:'round_trip',  label:'Round Trip',        icon:'🔄', desc:'There and back' },
  { key:'multi_loc',   label:'Multi Location',    icon:'📍', desc:'Multiple stops' },
  { key:'local_visit', label:'Local Visit',       icon:'🏙️', desc:'City area visit' },
  { key:'multi_day',   label:'Multi Day',         icon:'📅', desc:'Multi-day tour' },
  { key:'self_drive',  label:'Self Drive Rental', icon:'🔑', desc:'Drive yourself' },
]

const VEHICLE_TYPES = [
  'Hatchback (4+1)', 'Sedan (4+1)', 'SUV (6+1)',
  'SUV (7+1)', 'Tempo Traveller (12+1)', 'Mini Bus (18+1)',
]

function genRef() {
  const d = new Date()
  return `SJT-${d.getFullYear()%100}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${Math.floor(1000+Math.random()*9000)}`
}

const Label = ({ children, required }) => (
  <label className="block text-xs font-bold text-slate-600 mb-1">
    {children}{required && <span className="text-red-500 ml-0.5">*</span>}
  </label>
)

const Inp = (props) => (
  <input {...props}
    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all" />
)

const Sel = ({ children, ...props }) => (
  <select {...props}
    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-400 transition-all">
    {children}
  </select>
)

function StopList({ stops, onChange, placeholder = 'Stop' }) {
  const update = (i, v) => { const s = [...stops]; s[i] = v; onChange(s) }
  const add    = ()     => onChange([...stops, ''])
  const remove = (i)    => onChange(stops.filter((_, j) => j !== i))
  return (
    <div className="space-y-2">
      {stops.map((s, i) => (
        <div key={i} className="flex gap-2">
          <input value={s} onChange={e => update(i, e.target.value)}
            placeholder={`${placeholder} ${i + 1}`}
            className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500/30 transition-all" />
          {stops.length > 1 && (
            <button type="button" onClick={() => remove(i)}
              className="w-10 rounded-xl bg-red-50 text-red-400 hover:bg-red-100 transition-colors flex items-center justify-center flex-shrink-0">
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1.5 text-xs text-teal-700 font-bold hover:underline">
        <Plus size={12} /> Add Stop
      </button>
    </div>
  )
}

export default function PublicBooking() {
  const [step,   setStep]   = useState('customer')
  const [errors, setErrors] = useState({})

  const [name,   setName]   = useState('')
  const [mobile, setMobile] = useState('')
  const [matched,setMatched]= useState(null)

  const [tripType,    setTripType]    = useState('')
  const [pickup,      setPickup]      = useState('')
  const [drop,        setDrop]        = useState('')
  const [returnDest,  setReturnDest]  = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [date,        setDate]        = useState('')
  const [time,        setTime]        = useState('')
  const [areaName,    setAreaName]    = useState('')
  const [numDays,     setNumDays]     = useState('')
  const [stops,       setStops]       = useState([''])
  const [dayLocs,     setDayLocs]     = useState([''])
  const [sdIdNum,     setSdIdNum]     = useState('')
  const [sdIdType,    setSdIdType]    = useState('')
  const [sdDLNum,     setSdDLNum]     = useState('')
  const [sdDLExpiry,  setSdDLExpiry]  = useState('')
  const [sdStartTime, setSdStartTime] = useState('')
  const [sdEndTime,   setSdEndTime]   = useState('')
  const [sdDelivery,  setSdDelivery]  = useState('')
  const [sdReturn,    setSdReturn]    = useState('')
  const [bookingRef,  setBookingRef]  = useState('')

  const handleMobileBlur = async () => {
    if (mobile.length === 10) {
      try {
        const found = await findCustomerByMobile(mobile)
        if (found) { setName(found.name); setMatched(found) }
        else setMatched(null)
      } catch (err) {
        console.error('[PublicBooking] customer lookup failed:', err)
        setMatched(null)
      }
    }
  }

  const goToType = () => {
    const e = {}
    if (!name.trim())       e.name   = 'Please enter your name'
    if (mobile.length < 10) e.mobile = 'Enter a valid 10-digit mobile number'
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setStep('type')
  }

  const goToDetails = (type) => { setTripType(type); setStep('details') }

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const handleSubmit = async () => {
    const e = {}
    if (!vehicleType) e.vehicleType = 'Select vehicle type'
    if (!date)        e.date        = 'Select travel date'
    if ((tripType === 'one_way' || tripType === 'round_trip') && !pickup.trim()) e.pickup = 'Enter pickup'
    if ((tripType === 'one_way' || tripType === 'round_trip') && !drop.trim())   e.drop   = 'Enter drop'
    if (tripType === 'local_visit' && !areaName.trim()) e.areaName = 'Enter area name'
    if (['multi_day','self_drive'].includes(tripType) && !numDays) e.numDays = 'Enter number of days'
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({})
    setSubmitError('')
    setSubmitting(true)

    const ref = genRef()
    const now = new Date().toISOString()
    const booking = {
      id:         generateBookingNumber(),
      bookingNo:  ref,
      status:     'draft',
      customer:   name,
      contact:    mobile,
      type:       tripType,
      pickup:     pickup || areaName || sdDelivery || '',
      drop:       drop   || sdReturn || dayLocs.filter(Boolean).join(' → ') || '',
      startDate:  date,
      startTime:  time || sdStartTime || '',
      vehicleType,
      returnDest,
      numDays:    Number(numDays) || 0,
      stops:      stops.filter(Boolean),
      dayLocs:    dayLocs.filter(Boolean),
      areaName,
      sdIdNum, sdIdType, sdDLNum, sdDLExpiry,
      sdStartTime, sdEndTime, sdDelivery, sdReturn,
      driver:     null, vehicle: null, fare: 0,
      notes:      `Public booking via portal. Customer: ${name} (${mobile})`,
      source:     'public_portal',
      createdAt:  now, updatedAt: now, createdBy: 'public',
    }

    try {
      await saveBooking(booking)
      // Customer upsert failure shouldn't block a confirmed booking
      try { await upsertCustomerFromBooking({ name, mobile }) }
      catch (err) { console.error('[PublicBooking] customer upsert failed:', err) }
      setBookingRef(ref)
      setStep('done')
    } catch (err) {
      console.error('[PublicBooking] booking save failed:', err)
      setSubmitError('Could not submit your booking. Please check your connection and try again, or call us directly.')
    } finally {
      setSubmitting(false)
    }
  }

  const reset = () => {
    setStep('customer'); setName(''); setMobile(''); setMatched(null)
    setTripType(''); setPickup(''); setDrop(''); setReturnDest('')
    setVehicleType(''); setDate(''); setTime(''); setAreaName('')
    setNumDays(''); setStops(['']); setDayLocs([''])
    setSdIdNum(''); setSdIdType(''); setSdDLNum(''); setSdDLExpiry('')
    setSdStartTime(''); setSdEndTime(''); setSdDelivery(''); setSdReturn('')
    setBookingRef(''); setErrors({})
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-blue-50 flex flex-col">

      {/* Header */}
      <div className="bg-white border-b border-slate-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
            <Car size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-black text-slate-800 text-base leading-tight">Sri Jayam Travels</h1>
            <p className="text-xs text-slate-500">Online Booking Portal · Puducherry</p>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-slate-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-2">
          {['customer','type','details','done'].map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`w-full h-1.5 rounded-full transition-colors ${
                step === s ? 'bg-teal-500'
                : ['customer','type','details','done'].indexOf(step) > i ? 'bg-teal-300'
                : 'bg-slate-100'
              }`} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center py-6 px-4">
        <div className="w-full max-w-lg">

          {/* Step 1: Customer */}
          {step === 'customer' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 bg-teal-600">
                <p className="text-teal-100 text-xs font-bold uppercase tracking-widest mb-0.5">Step 1 of 3</p>
                <h2 className="text-white font-black text-xl">Your Information</h2>
                <p className="text-teal-100 text-xs mt-1">We'll look up your previous trips automatically</p>
              </div>
              <div className="px-5 py-5 space-y-4">
                <div>
                  <Label required>Mobile Number</Label>
                  <Inp type="tel" value={mobile}
                    onChange={e => setMobile(e.target.value.replace(/\D/g,'').slice(0,10))}
                    onBlur={handleMobileBlur}
                    placeholder="10-digit mobile number" maxLength={10} />
                  {errors.mobile && <p className="text-xs text-red-500 mt-1">{errors.mobile}</p>}
                </div>
                <div>
                  <Label required>Full Name</Label>
                  <Inp value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
                  {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  {matched && (
                    <p className="text-xs text-teal-600 font-bold mt-1 flex items-center gap-1">
                      <CheckCircle size={11} /> Welcome back, {matched.name}!
                    </p>
                  )}
                </div>
              </div>
              <div className="px-5 pb-5">
                <button onClick={goToType}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95">
                  Continue <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Trip Type */}
          {step === 'type' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 bg-teal-600">
                <button onClick={() => setStep('customer')} className="text-teal-200 text-xs font-bold flex items-center gap-1 mb-2 hover:text-white">
                  <ArrowLeft size={11} /> Back
                </button>
                <p className="text-teal-100 text-xs font-bold uppercase tracking-widest mb-0.5">Step 2 of 3</p>
                <h2 className="text-white font-black text-xl">Select Trip Type</h2>
                <p className="text-teal-100 text-xs mt-1">Hello {name} — choose your journey type</p>
              </div>
              <div className="px-5 py-4 grid grid-cols-2 gap-3">
                {TRIP_TYPES.map(t => (
                  <button key={t.key} onClick={() => goToDetails(t.key)}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-100 hover:border-teal-400 hover:bg-teal-50 transition-all text-center group active:scale-95">
                    <span className="text-2xl">{t.icon}</span>
                    <div>
                      <p className="text-xs font-black text-slate-800 group-hover:text-teal-700">{t.label}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 'details' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-4 bg-teal-600">
                <button onClick={() => setStep('type')} className="text-teal-200 text-xs font-bold flex items-center gap-1 mb-2 hover:text-white">
                  <ArrowLeft size={11} /> Back
                </button>
                <p className="text-teal-100 text-xs font-bold uppercase tracking-widest mb-0.5">Step 3 of 3</p>
                <h2 className="text-white font-black text-xl">
                  {TRIP_TYPES.find(t => t.key === tripType)?.icon}{' '}
                  {TRIP_TYPES.find(t => t.key === tripType)?.label}
                </h2>
              </div>
              <div className="px-5 py-5 space-y-4">

                {tripType === 'one_way' && (
                  <>
                    <div>
                      <Label required>Pickup Location</Label>
                      <Inp value={pickup} onChange={e => setPickup(e.target.value)} placeholder="e.g. Puducherry Bus Stand" />
                      {errors.pickup && <p className="text-xs text-red-500 mt-1">{errors.pickup}</p>}
                    </div>
                    <div>
                      <Label required>Drop Location</Label>
                      <Inp value={drop} onChange={e => setDrop(e.target.value)} placeholder="e.g. Chennai Airport" />
                      {errors.drop && <p className="text-xs text-red-500 mt-1">{errors.drop}</p>}
                    </div>
                  </>
                )}

                {tripType === 'round_trip' && (
                  <>
                    <div>
                      <Label required>Pickup Location</Label>
                      <Inp value={pickup} onChange={e => setPickup(e.target.value)} placeholder="e.g. Puducherry" />
                      {errors.pickup && <p className="text-xs text-red-500 mt-1">{errors.pickup}</p>}
                    </div>
                    <div>
                      <Label required>Destination</Label>
                      <Inp value={drop} onChange={e => setDrop(e.target.value)} placeholder="e.g. Tirupati" />
                      {errors.drop && <p className="text-xs text-red-500 mt-1">{errors.drop}</p>}
                    </div>
                    <div>
                      <Label>Return Destination</Label>
                      <Inp value={returnDest} onChange={e => setReturnDest(e.target.value)} placeholder="Leave blank if same as pickup" />
                    </div>
                  </>
                )}

                {tripType === 'multi_loc' && (
                  <div>
                    <Label required>Stops</Label>
                    <StopList stops={stops} onChange={setStops} placeholder="Location" />
                  </div>
                )}

                {tripType === 'local_visit' && (
                  <div>
                    <Label required>Area Name</Label>
                    <Inp value={areaName} onChange={e => setAreaName(e.target.value)} placeholder="e.g. Auroville, White Town" />
                    {errors.areaName && <p className="text-xs text-red-500 mt-1">{errors.areaName}</p>}
                  </div>
                )}

                {tripType === 'multi_day' && (
                  <>
                    <div>
                      <Label required>Number of Days</Label>
                      <Inp type="number" min="1" value={numDays} onChange={e => setNumDays(e.target.value)} placeholder="e.g. 3" />
                      {errors.numDays && <p className="text-xs text-red-500 mt-1">{errors.numDays}</p>}
                    </div>
                    <div>
                      <Label>Destinations (one per day)</Label>
                      <StopList stops={dayLocs} onChange={setDayLocs} placeholder="Day" />
                    </div>
                  </>
                )}

                {tripType === 'self_drive' && (
                  <div className="space-y-3 p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider">Self Drive Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label required>Number of Days</Label>
                        <Inp type="number" min="1" value={numDays} onChange={e => setNumDays(e.target.value)} placeholder="e.g. 2" />
                        {errors.numDays && <p className="text-xs text-red-500 mt-1">{errors.numDays}</p>}
                      </div>
                      <div>
                        <Label>ID Type</Label>
                        <Sel value={sdIdType} onChange={e => setSdIdType(e.target.value)}>
                          <option value="">— Select —</option>
                          {['Aadhaar','PAN Card','Passport','Voter ID'].map(o => <option key={o}>{o}</option>)}
                        </Sel>
                      </div>
                      <div>
                        <Label>ID Number</Label>
                        <Inp value={sdIdNum} onChange={e => setSdIdNum(e.target.value)} placeholder="ID number" />
                      </div>
                      <div>
                        <Label>Driving Licence No.</Label>
                        <Inp value={sdDLNum} onChange={e => setSdDLNum(e.target.value)} placeholder="DL number" />
                      </div>
                      <div>
                        <Label>Licence Expiry</Label>
                        <Inp type="date" value={sdDLExpiry} onChange={e => setSdDLExpiry(e.target.value)} />
                      </div>
                      <div />
                      <div>
                        <Label>Start Time</Label>
                        <Inp type="time" value={sdStartTime} onChange={e => setSdStartTime(e.target.value)} />
                      </div>
                      <div>
                        <Label>End Time</Label>
                        <Inp type="time" value={sdEndTime} onChange={e => setSdEndTime(e.target.value)} />
                      </div>
                      <div>
                        <Label>Vehicle Pickup Location</Label>
                        <Inp value={sdDelivery} onChange={e => setSdDelivery(e.target.value)} placeholder="Where to collect vehicle" />
                      </div>
                      <div>
                        <Label>Vehicle Return Location</Label>
                        <Inp value={sdReturn} onChange={e => setSdReturn(e.target.value)} placeholder="Where to return vehicle" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Common fields */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Travel Date</Label>
                    <Inp type="date" min={today} value={date} onChange={e => setDate(e.target.value)} />
                    {errors.date && <p className="text-xs text-red-500 mt-1">{errors.date}</p>}
                  </div>
                  <div>
                    <Label>Pickup Time</Label>
                    <Inp type="time" value={time} onChange={e => setTime(e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label required>Vehicle Type</Label>
                  <Sel value={vehicleType} onChange={e => setVehicleType(e.target.value)}>
                    <option value="">— Select vehicle —</option>
                    {VEHICLE_TYPES.map(v => <option key={v}>{v}</option>)}
                  </Sel>
                  {errors.vehicleType && <p className="text-xs text-red-500 mt-1">{errors.vehicleType}</p>}
                </div>
              </div>

              <div className="px-5 pb-5 space-y-2">
                {submitError && (
                  <p className="text-xs text-red-600 font-semibold bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
                )}
                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm flex items-center justify-center gap-2 transition-all shadow-md active:scale-95">
                  {submitting ? 'Submitting…' : <>Submit Booking <ChevronRight size={15} /></>}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden text-center">
              <div className="px-5 py-8 space-y-4">
                <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto">
                  <CheckCircle size={32} className="text-teal-600" />
                </div>
                <div>
                  <h2 className="font-black text-slate-800 text-xl mb-1">Booking Received!</h2>
                  <p className="text-sm text-slate-500">We'll confirm your trip shortly</p>
                </div>
                <div className="bg-teal-50 border border-teal-100 rounded-xl px-5 py-4">
                  <p className="text-xs text-teal-600 font-bold uppercase tracking-wider mb-1">Booking Reference</p>
                  <p className="text-2xl font-black text-teal-700 tracking-widest">{bookingRef}</p>
                  <p className="text-xs text-teal-500 mt-1">Save this number for tracking</p>
                </div>
                <div className="text-left space-y-2 bg-slate-50 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Summary</p>
                  {[
                    { label:'Name',    value: name },
                    { label:'Mobile',  value: mobile },
                    { label:'Type',    value: TRIP_TYPES.find(t => t.key === tripType)?.label },
                    { label:'Date',    value: date },
                    { label:'Vehicle', value: vehicleType },
                    { label:'Status',  value: 'Pending — awaiting confirmation' },
                  ].map(r => (
                    <div key={r.label} className="flex justify-between text-xs">
                      <span className="text-slate-500 font-medium">{r.label}</span>
                      <span className="font-bold text-slate-700">{r.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Our team will contact you on <strong>{mobile}</strong> to confirm your booking.
                </p>
                <button onClick={reset}
                  className="w-full py-3 rounded-xl border-2 border-teal-200 text-teal-700 font-black text-sm flex items-center justify-center gap-2 hover:bg-teal-50 transition-colors">
                  <RotateCcw size={14} /> Book Another Trip
                </button>
              </div>
            </div>
          )}

          <p className="text-center text-xs text-slate-400 mt-6">
            Sri Jayam Travels · Puducherry
          </p>
        </div>
      </div>
    </div>
  )
}