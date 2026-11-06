import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, Car, Star, Calendar, Shield, MapPin, Clock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import Avatar from '../../components/ui/Avatar'
import { loadBookings } from '../../data/tripTypes'
import { loadSettlements, monthLabel, getSettlementStatusCfg } from '../../data/settlementData'

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-navy-700 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-navy-700 flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-slate-500 dark:text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold leading-tight text-slate-700 dark:text-slate-200">{value || '—'}</p>
      </div>
    </div>
  )
}

export default function DriverProfile() {
  const { user }  = useAuth()
  const navigate  = useNavigate()

  const [bookings,    setBookings]    = useState([])
  const [settlements, setSettlements] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    Promise.all([loadBookings(), loadSettlements()]).then(([bks, stls]) => {
      const myName = user?.name || ''
      setBookings(Array.isArray(bks)  ? bks.filter(b  => b.driver_name === myName || b.driver === myName)  : [])
      setSettlements(Array.isArray(stls) ? stls.filter(s => s.driver     === myName)                          : [])
      setLoading(false)
    })
  }, [user?.name])

  const totalKm       = bookings.reduce((s, t) => s + (Number(t.total_km)   || 0), 0)
  const totalFare     = bookings.reduce((s, t) => s + (Number(t.total_fare) || 0), 0)
  const totalEarnings = totalFare * 0.15   // bata estimate

  // Payroll strip data
  const latest  = settlements[0]
  const now     = new Date()
  const current = settlements.find(s => s.month === now.getMonth()+1 && s.year === now.getFullYear())
  const lastPaid = settlements.find(s => s.status === 'paid')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto animate-fade-up pb-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/driver')}
          className="w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="font-display font-black text-slate-800 dark:text-white text-xl">My Profile</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Driver account details</p>
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-2xl overflow-hidden shadow-xl"
           style={{ background: 'linear-gradient(135deg,#0d1b4b 0%,#1e3a8a 60%,#152a7a 100%)' }}>
        <div className="relative p-5">
          <div className="flex items-start gap-4 mb-5">
            <div className="relative flex-shrink-0">
              <Avatar name={user?.name || ''} size={64} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-navy-900" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-black text-white text-xl leading-tight">{user?.name}</h2>
              <p className="text-white/60 text-sm mt-0.5">Driver · Sri Jayam Travels</p>
              {user?.phone && (
                <p className="text-white/40 text-xs mt-0.5 flex items-center gap-1">
                  <Phone size={10} />{user.phone}
                </p>
              )}
              {user?.email && (
                <p className="text-white/40 text-xs flex items-center gap-1">
                  <Mail size={10} />{user.email}
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label:'Trips',    value: bookings.length },
              { label:'Total KM', value: totalKm.toLocaleString('en-IN') },
              { label:'Revenue',  value: `Rs.${Math.round(totalFare/1000)}k` },
            ].map(s => (
              <div key={s.label} className="bg-white/8 rounded-xl px-2 py-2 text-center">
                <p className="text-white font-display font-black text-sm leading-tight">{s.value}</p>
                <p className="text-white/40 text-[9px] font-bold uppercase mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="glass-card rounded-2xl p-4">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Personal Details</p>
        <InfoRow icon={Phone}    label="Mobile"       value={user?.phone}  />
        <InfoRow icon={Mail}     label="Email"        value={user?.email}  />
        <InfoRow icon={MapPin}   label="Base"         value="Puducherry, India" />
        <InfoRow icon={Car}      label="Role"         value="Driver"       />
      </div>

      {/* Recent trips */}
      <div className="glass-card rounded-2xl p-4">
        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Recent Trips</p>
        {bookings.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No trips found</p>
        ) : (
          <div className="space-y-2">
            {bookings.slice(0, 5).map(b => (
              <div key={b.id} className="flex items-center gap-3 bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{b.customer_name || b.customer}</p>
                  <p className="text-[10px] text-slate-400 truncate">{b.pickup_location || b.pickup} → {b.drop_location || b.drop}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Rs.{(Number(b.total_fare || b.fare) || 0).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-400">{b.start_date || b.startDate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payroll strip */}
      {latest && (
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Payroll</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center col-span-2">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">
                {current ? 'Current Month' : 'Latest Settlement'}
              </p>
              <p className="text-lg font-display font-black text-emerald-600 dark:text-emerald-400">
                Rs. {((current || latest).net_amount || (current || latest).netAmount || 0).toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {monthLabel((current||latest).month, (current||latest).year)}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-navy-800/60 rounded-xl p-2.5 text-center">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1">Status</p>
              {(() => { const cfg = getSettlementStatusCfg(latest.status); return (
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
              )})()}
              {lastPaid && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Last paid<br/>{monthLabel(lastPaid.month, lastPaid.year)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}