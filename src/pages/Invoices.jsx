import { useState, useEffect, useCallback } from 'react'
import { Plus, Printer, Eye, AlertTriangle, FileText, X } from 'lucide-react'
import Avatar        from '../components/ui/Avatar'
import Button        from '../components/ui/Button'
import PageHeader    from '../components/ui/PageHeader'
import ModalOverlay  from '../components/ui/ModalOverlay'
import InvoiceModal  from '../components/invoice/InvoiceModal'
import { loadBookings, getStatusCfg } from '../data/tripTypes'

const FILTERS = [
  { key: 'all',       label: 'All'       },
  { key: 'completed', label: 'Done'      },
  { key: 'assigned',  label: 'Assigned'  },
  { key: 'started',   label: 'In Progress' },
  { key: 'cancelled', label: 'Cancelled' },
]

function StatusBadge({ status }) {
  const cfg = getStatusCfg(status)
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export default function Invoices() {
  const [bookings, setBookings] = useState([])
  const [loadError, setLoadError] = useState(null)
  const reloadBookings = useCallback(async () => {
    try {
      const b = await loadBookings()
      setBookings(Array.isArray(b) ? b : [])
      setLoadError(null)
    } catch (err) {
      console.error('[Invoices] load failed:', err)
      setLoadError('Could not load bookings. Try refreshing.')
    }
  }, [])
  useEffect(() => { reloadBookings() }, [reloadBookings])

  const [filter,   setFilter]   = useState('all')
  const [selected, setSelected] = useState(null)   // booking shown in InvoiceModal
  const [pickerOpen, setPickerOpen] = useState(false) // "New Invoice" booking picker

  // Only billable bookings can generate an invoice
  const invoiceable = bookings.filter(b => b.status === 'completed' || b.status === 'closed')

  const filtered = filter === 'all'
    ? bookings
    : bookings.filter(b => b.status === filter)

  const totalFare      = bookings.reduce((s, b) => s + (b.fare || 0), 0)
  const completedCount = bookings.filter(b => b.status === 'completed').length
  const pendingCount   = bookings.filter(b => ['draft','confirmed','assigned'].includes(b.status)).length

  return (
    <div className="space-y-5 animate-fade-up">

      {/* Invoice preview / print / share modal */}
      {selected && <InvoiceModal booking={selected} onClose={() => setSelected(null)} />}

      {/* New Invoice — pick a billable booking to invoice */}
      {pickerOpen && (
        <ModalOverlay onClose={() => setPickerOpen(false)} center>
          <div className="w-[92vw] max-w-md max-h-[70vh] flex flex-col rounded-2xl bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-navy-700">
              <div className="flex items-center gap-2">
                <FileText size={15} className="text-navy-700 dark:text-blue-400" />
                <p className="text-xs font-bold text-navy-800 dark:text-slate-100 uppercase tracking-wider">New Invoice — Select Booking</p>
              </div>
              <button onClick={() => setPickerOpen(false)}
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto p-3 space-y-1.5">
              {invoiceable.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                  No completed trips available to invoice yet.
                </p>
              ) : invoiceable.map(b => (
                <button key={b.id} onClick={() => { setSelected(b); setPickerOpen(false) }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-navy-800 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{b.customer}</p>
                    <p className="text-[10px] font-mono text-slate-400 truncate">{b.bookingNo || b.id} · {b.pickup} → {b.drop}</p>
                  </div>
                  <span className="text-xs font-bold text-navy-800 dark:text-blue-300 whitespace-nowrap">
                    {b.fare ? `Rs. ${b.fare.toLocaleString('en-IN')}` : '—'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </ModalOverlay>
      )}

      <PageHeader
        title="Invoices"
        subtitle="Trip bills, pay slips &amp; invoice management"
        action={<Button icon={Plus} variant="primary" onClick={() => setPickerOpen(true)}>New Invoice</Button>}
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{loadError}</p>
          </div>
          <button onClick={reloadBookings}
            className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold transition-all active:scale-95 shadow-md flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        {[
          { label: 'Total Fare',     value: `Rs. ${totalFare.toLocaleString('en-IN')}`, color: 'text-blue-600 dark:text-blue-400'       },
          { label: 'Invoices Done',  value: completedCount,                             color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Pending',        value: pendingCount,                               color: 'text-amber-600 dark:text-amber-400'     },
        ].map(c => (
          <div key={c.label} className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{c.label}</span>
            <span className={`text-sm font-black ${c.color}`}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 w-fit">
        {FILTERS.map(f => {
          const cnt = f.key === 'all' ? bookings.length : bookings.filter(b => b.status === f.key).length
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filter === f.key
                  ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 text-[10px] ${filter === f.key ? 'text-blue-500' : 'text-slate-400'}`}>
                {cnt}
              </span>
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/80 dark:bg-navy-800/50">
                {['Booking No.','Customer','Date','Route','Driver','Vehicle','KM','Fare','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
                    No bookings found
                  </td>
                </tr>
              ) : filtered.map(b => (
                <tr key={b.id} className="border-b border-slate-50 dark:border-navy-800 hover:bg-blue-50/40 dark:hover:bg-navy-800/40 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{b.bookingNo || b.id}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={b.customer} size={26} />
                      <div>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{b.customer}</p>
                        <p className="text-[10px] text-slate-400">{b.contact}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{b.startDate}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{b.pickup} → {b.drop}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{b.driver || '—'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400">{b.vehicle || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{b.km ? `${b.km} km` : '—'}</td>
                  <td className="px-4 py-3 text-xs font-bold text-navy-800 dark:text-blue-300 whitespace-nowrap">
                    {b.fare ? `Rs. ${b.fare.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setSelected(b)}
                        className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                        title="View Invoice"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => setSelected(b)}
                        className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-navy-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-navy-600 transition-colors"
                        title="Print Invoice"
                      >
                        <Printer size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}