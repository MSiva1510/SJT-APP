// ─── Global Search ────────────────────────────────────────────
// ⌘K / Ctrl+K shortcut. Searches across Customers, Bookings,
// Drivers, Vehicles. 30-second indexed cache, 200ms debounce.

import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, User, Car, Users, Route, FileText } from 'lucide-react'
import { loadBookings } from '../../data/tripTypes'
import { loadCustomers } from '../../data/customerData'
import { loadDrivers } from '../../data/driverData'
import { loadVehicles } from '../../data/vehicleData'

const ENTITY_CFG = {
  customer: { Icon:Users, color:'text-violet-500', bg:'bg-violet-100 dark:bg-violet-900/30', label:'Customer', path:'/customers' },
  booking:  { Icon:Route, color:'text-blue-500',   bg:'bg-blue-100 dark:bg-blue-900/30',     label:'Booking',  path:'/trips'     },
  driver:   { Icon:User,  color:'text-teal-500',   bg:'bg-teal-100 dark:bg-teal-900/30',     label:'Driver',   path:'/drivers'   },
  vehicle:  { Icon:Car,   color:'text-amber-500',  bg:'bg-amber-100 dark:bg-amber-900/30',   label:'Vehicle',  path:'/vehicles'  },
}

let _index = null, _indexTs = 0

async function buildIndex() {
  if (_index && Date.now() - _indexTs < 30000) return _index
  const [bookings, customers, drivers, vehicles] = await Promise.allSettled([
    loadBookings(), loadCustomers(),
    loadDrivers(), loadVehicles(),
  ])
  const items = []
  if (customers.status === 'fulfilled') {
    customers.value.filter(c => !c._deleted).forEach(c => items.push({
      id:c.id, type:'customer', title:c.name,
      subtitle:[c.mobile,c.city].filter(Boolean).join(' · '),
      tags:[c.name,c.mobile,c.email,c.city].filter(Boolean).map(v=>v.toLowerCase()),
    }))
  }
  if (bookings.status === 'fulfilled') {
    bookings.value.forEach(b => items.push({
      id:b.id, type:'booking', title:b.customer||b.bookingNo,
      subtitle:[b.bookingNo,b.pickup,b.drop].filter(Boolean).join(' · '),
      status:b.status,
      tags:[b.customer,b.bookingNo,b.pickup,b.drop,b.driver].filter(Boolean).map(v=>v.toLowerCase()),
    }))
  }
  if (drivers.status === 'fulfilled') {
    drivers.value.filter(d=>d.isActive!==false).forEach(d => items.push({
      id:d.id, type:'driver', title:d.name,
      subtitle:[d.mobile,d.vehicle].filter(Boolean).join(' · '),
      tags:[d.name,d.mobile,d.license,d.vehicle].filter(Boolean).map(v=>v.toLowerCase()),
    }))
  }
  if (vehicles.status === 'fulfilled') {
    vehicles.value.forEach(v => items.push({
      id:v.id, type:'vehicle', title:v.reg||v.registration,
      subtitle:[v.make,v.model,v.type].filter(Boolean).join(' · '),
      tags:[v.reg,v.registration,v.make,v.model].filter(Boolean).map(v=>v.toLowerCase()),
    }))
  }
  _index = items; _indexTs = Date.now()
  return items
}

function Highlight({ text, query }) {
  if (!query || !text) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-700/40 text-inherit rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function GlobalSearch() {
  const [open,    setOpen]    = useState(false)
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selIdx,  setSelIdx]  = useState(0)
  const wrapRef  = useRef()
  const inputRef = useRef()
  const navigate = useNavigate()

  // Click outside
  useEffect(() => {
    const fn = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  // ⌘K / Ctrl+K
  useEffect(() => {
    const fn = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [])

  const runSearch = useCallback(async q => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const index = await buildIndex()
      const lq = q.toLowerCase()
      setResults(index.filter(item => item.tags.some(t => t.includes(lq))).slice(0, 15))
      setSelIdx(0)
    } catch { setResults([]) }
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200)
    return () => clearTimeout(t)
  }, [query, runSearch])

  const handleSelect = item => { navigate(ENTITY_CFG[item.type]?.path || '/'); setOpen(false); setQuery(''); setResults([]) }
  const handleKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i+1, results.length-1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i-1, 0)) }
    if (e.key === 'Enter' && results[selIdx]) handleSelect(results[selIdx])
  }

  const grouped = results.reduce((acc, r) => { (acc[r.type] = acc[r.type]||[]).push(r); return acc }, {})

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-navy-600 bg-white/60 dark:bg-navy-800/60 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-navy-700 transition-all text-xs min-w-[140px] sm:min-w-[200px]">
        <Search size={13} />
        <span className="flex-1 text-left hidden sm:block">Search…</span>
        <kbd className="hidden sm:inline text-[9px] font-bold bg-slate-100 dark:bg-navy-700 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-navy-600">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/30 dark:bg-black/50 z-50 flex items-start justify-center pt-[10vh] px-4">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-navy-700 overflow-hidden animate-fade-up">
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-navy-700">
              <Search size={16} className="text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search customers, bookings, drivers, vehicles…"
                className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none"
                autoComplete="off"
              />
              {loading && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
              {query && !loading && (
                <button onClick={() => { setQuery(''); setResults([]) }} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X size={14} />
                </button>
              )}
              <kbd onClick={() => setOpen(false)}
                className="text-[10px] bg-slate-100 dark:bg-navy-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-navy-700 cursor-pointer">
                Esc
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-96 overflow-y-auto">
              {!query && (
                <div className="px-4 py-8 text-center">
                  <Search size={28} className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">Start typing to search all records</p>
                  <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                    {Object.entries(ENTITY_CFG).map(([key, cfg]) => {
                      const { Icon } = cfg
                      return (
                        <span key={key} className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded-lg ${cfg.bg} ${cfg.color}`}>
                          <Icon size={11} /> {cfg.label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {query && results.length === 0 && !loading && (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-slate-400 dark:text-slate-500">No results for "<strong>{query}</strong>"</p>
                </div>
              )}

              {Object.entries(grouped).map(([type, items]) => {
                const cfg = ENTITY_CFG[type]
                const { Icon } = cfg || { Icon: FileText }
                return (
                  <div key={type}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-navy-800/40 border-b border-slate-100 dark:border-navy-700">
                      <Icon size={11} className={cfg?.color} />
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{cfg?.label}s</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
                    </div>
                    {items.map(item => {
                      const gi = results.indexOf(item)
                      const isSel = gi === selIdx
                      return (
                        <button key={item.id} onClick={() => handleSelect(item)} onMouseEnter={() => setSelIdx(gi)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSel ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-navy-800/40'
                          }`}>
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg?.bg}`}>
                            <Icon size={13} className={cfg?.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate">
                              <Highlight text={item.title} query={query} />
                            </p>
                            {item.subtitle && (
                              <p className="text-[11px] text-slate-400 truncate">
                                <Highlight text={item.subtitle} query={query} />
                              </p>
                            )}
                          </div>
                          {item.status && <span className="text-[10px] text-slate-400 flex-shrink-0 capitalize">{item.status}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {results.length > 0 && (
              <div className="px-4 py-2 border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
                <span>↑↓ Navigate</span><span>↵ Open</span><span>Esc Close</span>
                <span className="ml-auto">{results.length} results</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
