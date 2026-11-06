// ─── Documents Page — Module 3 ────────────────────────────
// Centralised document management with expiry tracking, per-entity
// categories and localStorage/Supabase dual-write.

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, Plus, Search, Calendar, AlertTriangle,
  CheckCircle, Clock, Download, Trash2, X, RefreshCw,
  Car, User, Users, Route, FolderOpen,
} from 'lucide-react'
import PageHeader   from '../components/ui/PageHeader'
import ModalOverlay from '../components/ui/ModalOverlay'
import { useAuth }  from '../context/AuthContext'
import supabase     from '../lib/supabase'
import { loadDrivers } from '../data/driverData'
import { loadVehicles } from '../data/vehicleData'
import { loadCustomers } from '../data/customerData'

// ── Document type catalogue per category ─────────────────────
const DOC_TYPES = {
  driver: [
    { key:'license',     label:"Driver's Licence",   hasExpiry:true  },
    { key:'badge',       label:'Badge / ID',          hasExpiry:true  },
    { key:'medical',     label:'Medical Certificate', hasExpiry:true  },
    { key:'police_cert', label:'Police Certificate',  hasExpiry:true  },
    { key:'aadhar',      label:'Aadhaar Card',        hasExpiry:false },
    { key:'bank',        label:'Bank Passbook',       hasExpiry:false },
    { key:'other',       label:'Other',               hasExpiry:false },
  ],
  vehicle: [
    { key:'rc_book',   label:'RC Book',             hasExpiry:false },
    { key:'insurance', label:'Insurance',           hasExpiry:true  },
    { key:'permit',    label:'Permit',              hasExpiry:true  },
    { key:'puc',       label:'Pollution (PUC)',     hasExpiry:true  },
    { key:'fitness',   label:'Fitness Certificate', hasExpiry:true  },
    { key:'tax_token', label:'Tax Token',           hasExpiry:true  },
    { key:'other',     label:'Other',               hasExpiry:false },
  ],
  customer: [
    { key:'aadhar',    label:'Aadhaar',    hasExpiry:false },
    { key:'pan',       label:'PAN Card',   hasExpiry:false },
    { key:'passport',  label:'Passport',   hasExpiry:true  },
    { key:'gst',       label:'GST Cert',   hasExpiry:false },
    { key:'agreement', label:'Agreement',  hasExpiry:true  },
    { key:'other',     label:'Other',      hasExpiry:false },
  ],
  trip: [
    { key:'permit',       label:'Trip Permit',        hasExpiry:true,   icon:'📋' },
    { key:'authorization',label:'Trip Authorization', hasExpiry:true,   icon:'📑' },
    { key:'itinerary',    label:'Trip Itinerary',     hasExpiry:false,  icon:'🗺' },
    { key:'manifest',     label:'Trip Manifest',      hasExpiry:false,  icon:'📄' },
    { key:'inspection',   label:'Vehicle Inspection', hasExpiry:true,   icon:'🔍' },
    { key:'other',        label:'Other',              hasExpiry:false,  icon:'📎' },
  ],
}

const CATEGORIES = [
  { key:'all',      label:'All Docs',  Icon:FolderOpen, color:'text-slate-500'  },
  { key:'driver',   label:'Drivers',   Icon:User,       color:'text-blue-500'   },
  { key:'vehicle',  label:'Vehicles',  Icon:Car,        color:'text-amber-500'  },
  { key:'customer', label:'Customers', Icon:Users,      color:'text-violet-500' },
  { key:'trip',     label:'Trips',     Icon:Route,      color:'text-emerald-500'},
]

const STATUS_CFG = {
  active:        { label:'Valid',          badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot:'bg-emerald-500'               },
  expiring_soon: { label:'Expiring Soon',  badge:'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',         dot:'bg-amber-500 animate-pulse'   },
  expired:       { label:'Expired',        badge:'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',                  dot:'bg-red-500'                   },
  pending:       { label:'Pending',        badge:'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',             dot:'bg-slate-400'                 },
}

// ── Helpers ───────────────────────────────────────────────────
function calcStatus(expiryDate) {
  if (!expiryDate) return 'active'
  const today  = new Date(); today.setHours(0,0,0,0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const diff   = Math.floor((expiry - today) / 86400000)
  if (diff < 0)   return 'expired'
  if (diff <= 30) return 'expiring_soon'
  return 'active'
}
function daysLeft(d) {
  if (!d) return null
  const today = new Date(); today.setHours(0,0,0,0)
  return Math.floor((new Date(d + 'T00:00:00') - today) / 86400000)
}

// ── Local store ───────────────────────────────────────────────
const LS_KEY = 'sjt_documents'
function readLocal()  { try { return JSON.parse(localStorage.getItem(LS_KEY)||'[]') } catch { return [] } }
function writeLocal(d){ try { localStorage.setItem(LS_KEY, JSON.stringify(d)) } catch {} }
let _local = readLocal()

async function fetchDocs() {
  if (supabase) {
    try {
      const { data, error } = await supabase.from('documents').select('*').order('created_at', { ascending:false })
      if (!error && data) return data
    } catch {}
  }
  return _local
}

async function upsertDoc(doc) {
  const payload = {
    document_type: doc.doc_type || 'other',
    related_entity: doc.category,
    title:          doc.title,
    category:       doc.category,
    doc_type:       doc.doc_type,
    status:         calcStatus(doc.expiry_date),
    expiry_date:    doc.expiry_date  || null,
    reminder_date:  doc.reminder_date|| null,
    notes:          doc.notes        || null,
    driver_id:      doc.driver_id    || null,
    vehicle_id:     doc.vehicle_id   || null,
    customer_id:    doc.customer_id  || null,
    file_name:      doc.file_name    || doc.fileName    || null,
    file_url:       doc.file_url     || doc.fileUrl     || null,
    document_id:    doc.id           || `DOC-${Date.now()}`,
  }
  if (supabase) {
    try {
      const { data, error } = await supabase.from('documents').insert(payload).select().single()
      if (!error && data) { _local = [data, ..._local]; writeLocal(_local); return data }
    } catch {}
  }
  const saved = { ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() }
  _local = [saved, ..._local]
  writeLocal(_local)
  return saved
}

async function removeDoc(id) {
  if (supabase && !String(id).startsWith('local-')) {
    try { await supabase.from('documents').delete().eq('id', id) } catch {}
  }
  _local = _local.filter(d => d.id !== id)
  writeLocal(_local)
}

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.active
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ── Add Document Modal ─────────────────────────────────────
function AddDocModal({ onClose, onSave, drivers, vehicles, customers }) {
  const [form, setForm] = useState({
    category:'driver', doc_type:'license', title:'',
    entity_id:'', expiry_date:'', reminder_date:'', notes:'',
    fileUrl: null, fileName: ''
  })
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  const [preview, setPreview] = useState(null)
  const fileInputRef = useRef(null)
  const upd = patch => setForm(f => ({ ...f, ...patch }))

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) {
      setPreview(null)
      return
    }

    // Validate file type (optional)
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, file: 'Only JPG, PNG, and PDF files are allowed' }))
      return
    }

    // Validate file size (optional - 5MB max)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      setErrors(prev => ({ ...prev, file: 'File size must be less than 5MB' }))
      return
    }

    // Clear file error
    setErrors(prev => ({ ...prev, file: '' }))

    // Create preview URL
    const reader = new FileReader()
    reader.onload = (ev) => {
      setPreview(ev.target.result)
      setForm(f => ({ ...f, fileUrl: ev.target.result, fileName: file.name }))
    }
    reader.onerror = (ev) => {
      setErrors(prev => ({ ...prev, file: 'Failed to read file' }))
    }
    reader.readAsDataURL(file)
  }

  const docTypes    = DOC_TYPES[form.category] || []
  const currentType = docTypes.find(t => t.key === form.doc_type)

  const entityOptions = useMemo(() => {
    if (form.category === 'driver')   return drivers.map(d   => ({ value: d.id, label: d.name }))
    if (form.category === 'vehicle')  return vehicles.map(v  => ({ value: v.id, label: `${v.reg || v.registration} · ${v.model || ''}` }))
    if (form.category === 'customer') return customers.map(c => ({ value: c.id, label: c.name }))
    return []
  }, [form.category, drivers, vehicles, customers])

  const validate = () => {
    const e = {}
    if (!form.title.trim())                        e.title     = 'Required'
    if (form.category !== 'trip' && !form.entity_id) e.entity_id = 'Select one'
    return e
  }

  const handleSave = async () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        title:       form.title.trim(),
        driver_id:   form.category === 'driver'   ? form.entity_id : null,
        vehicle_id:  form.category === 'vehicle'  ? form.entity_id : null,
        customer_id: form.category === 'customer' ? form.entity_id : null,
      }
      const saved = await upsertDoc(payload)
      onSave(saved)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const INP = 'w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500/25'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="relative w-full sm:w-[500px] max-h-[92vh] sm:max-h-[88vh] bg-white dark:bg-navy-900 rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col animate-fade-up">
        <div className="w-10 h-1 bg-slate-200 dark:bg-navy-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-navy-700 flex-shrink-0">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document</p>
            <h3 className="font-display font-black text-slate-800 dark:text-white text-base">Add Document</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.filter(c => c.key !== 'all').map(cat => {
                const { Icon } = cat
                return (
                  <button key={cat.key} type="button"
                    onClick={() => upd({ category:cat.key, doc_type:DOC_TYPES[cat.key]?.[0]?.key||'', entity_id:'' })}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                      form.category === cat.key
                        ? 'border-navy-400 bg-navy-50 dark:bg-navy-800 ring-2 ring-navy-400/30'
                        : 'border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/40 hover:bg-slate-50 dark:hover:bg-navy-800'
                    }`}>
                    <Icon size={15} className={cat.color} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{cat.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Entity */}
          {form.category !== 'trip' && (
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                {form.category === 'driver' ? 'Driver' : form.category === 'vehicle' ? 'Vehicle' : 'Customer'} <span className="text-red-500">*</span>
              </label>
              <select value={form.entity_id} onChange={e => upd({ entity_id:e.target.value })}
                className={`${INP} appearance-none`}>
                <option value="">— Select —</option>
                {entityOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {errors.entity_id && <p className="text-xs text-red-500 mt-1">{errors.entity_id}</p>}
            </div>
          )}

          {/* Doc type */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Document Type</label>
            <select value={form.doc_type} onChange={e => upd({ doc_type:e.target.value })}
              className={`${INP} appearance-none`}>
              {docTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              Title <span className="text-red-500">*</span>
            </label>
            <input value={form.title} onChange={e => upd({ title:e.target.value })}
              placeholder="e.g. Ramanan – Driving Licence 2026"
              className={INP} />
            {errors.title && <p className="text-xs text-red-500 mt-1">{errors.title}</p>}
          </div>

          {/* Dates */}
          {currentType?.hasExpiry && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={e => upd({ expiry_date:e.target.value })} className={INP} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Reminder Date</label>
                <input type="date" value={form.reminder_date} onChange={e => upd({ reminder_date:e.target.value })} className={INP} />
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Notes</label>
            <textarea value={form.notes} onChange={e => upd({ notes:e.target.value })}
              placeholder="Document number, remarks…" rows={2}
              className={`${INP} resize-none`} />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
              File <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-col items-start">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                onChange={handleFileChange}
                className={`${INP} ${errors.file ? 'border-red-400' : ''}`}
              />
              {errors.file && <p className="text-xs text-red-500 mt-1">{errors.file}</p>}
              {preview && (
                <div className="mt-2 flex items-center gap-3">
                  {(form.fileUrl || '').startsWith('data:image/') && (
                    <img src={preview} alt="Preview" className="w-16 h-16 object-cover rounded" />
                  )}
                  {(form.fileUrl || '').startsWith('data:application/pdf') && (
                    <div className="w-16 h-16 bg-blue-500/20 rounded flex items-center justify-center">
                      <div className="text-xs font-bold text-blue-600">PDF</div>
                    </div>
                  )}
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{form.fileName || 'No file selected'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreview(null)
                        setForm(f => ({ ...f, fileUrl: null, fileName: '' }))
                        if (fileInputRef.current) fileInputRef.current.value = ''
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 dark:border-navy-700 flex gap-2 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-md active:scale-95 disabled:opacity-50">
            {saving ? 'Saving…' : 'Add Document'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function Documents() {
  const { isAdmin, isManager } = useAuth()
  const canManage = isAdmin || isManager

  const [docs,      setDocs]      = useState([])
  const [drivers,   setDrivers]   = useState([])
  const [vehicles,  setVehicles]  = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [category,  setCategory]  = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [showAdd,   setShowAdd]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [d, dr, veh, cust] = await Promise.allSettled([
        fetchDocs(),
        loadDrivers(),
        loadVehicles(),
        loadCustomers(),
      ])
      setDocs(d.status === 'fulfilled' ? d.value : [])
      setDrivers(dr.status === 'fulfilled' ? dr.value : [])
      setVehicles(veh.status === 'fulfilled' ? veh.value : [])
      setCustomers(cust.status === 'fulfilled' ? cust.value.filter(c => !c._deleted) : [])
    } catch { setError('Failed to load documents') }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const enriched = useMemo(() =>
    docs.map(doc => ({
      ...doc,
      computedStatus: doc.expiry_date ? calcStatus(doc.expiry_date) : (doc.status || 'active'),
      daysLeft:       daysLeft(doc.expiry_date),
    }))
  , [docs])

  const filtered = useMemo(() =>
    enriched.filter(doc => {
      if (category !== 'all' && doc.category !== category) return false
      if (statusFilter !== 'all' && doc.computedStatus !== statusFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (![doc.title, doc.notes, doc.doc_type].some(v => v?.toLowerCase().includes(q))) return false
      }
      return true
    })
  , [enriched, category, statusFilter, search])

  const counts = useMemo(() => ({
    total:    enriched.length,
    valid:    enriched.filter(d => d.computedStatus === 'active').length,
    expiring: enriched.filter(d => d.computedStatus === 'expiring_soon').length,
    expired:  enriched.filter(d => d.computedStatus === 'expired').length,
  }), [enriched])

  const handleSave = doc => { setDocs(prev => [doc, ...prev.filter(d => d.id !== doc.id)]); setShowAdd(false) }
  const handleDelete = async id => {
    if (!window.confirm('Delete this document?')) return
    await removeDoc(id)
    setDocs(prev => prev.filter(d => d.id !== id))
  }

  const getCategoryIcon = cat => {
    const c = CATEGORIES.find(c => c.key === cat)
    if (!c) return null
    const { Icon } = c
    return <Icon size={13} className={c.color} />
  }

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Documents"
        subtitle={`${counts.total} total · ${counts.expired} expired · ${counts.expiring} expiring soon`}
        action={canManage && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-sm font-bold hover:bg-navy-800 dark:hover:bg-blue-600 transition-all shadow-lg active:scale-95">
            <Plus size={15} /> Add Document
          </button>
        )}
      />

      {error && (
        <div className="bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/30 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-red-600 flex-shrink-0" />
            <p className="text-sm font-bold text-red-700 dark:text-red-400">{error}</p>
          </div>
          <button onClick={load} className="px-3 py-1.5 rounded-xl bg-red-500 hover:bg-red-400 text-white text-xs font-bold flex items-center gap-1.5">
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label:'Total Docs',     value:counts.total,    color:'text-slate-700 dark:text-slate-200',     bg:'bg-slate-50 dark:bg-navy-800/60',      filter:'all'          },
          { label:'Valid',          value:counts.valid,    color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50 dark:bg-emerald-900/10', filter:'active'       },
          { label:'Expiring (30d)', value:counts.expiring, color:'text-amber-600 dark:text-amber-400',     bg:'bg-amber-50 dark:bg-amber-900/10',     filter:'expiring_soon'},
          { label:'Expired',        value:counts.expired,  color:'text-red-600 dark:text-red-400',         bg:'bg-red-50 dark:bg-red-900/10',         filter:'expired'      },
        ].map(s => (
          <div key={s.label} onClick={() => setStatusFilter(s.filter)}
            className={`${s.bg} glass-card rounded-xl p-3 text-center cursor-pointer hover:shadow-md transition-all`}>
            <p className={`text-2xl font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[160px] max-w-xs">
          <Search size={14} className="text-slate-400 flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents…"
            className={"bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none w-full"} />
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
          {CATEGORIES.map(cat => {
            const { Icon } = cat
            return (
              <button key={cat.key} onClick={() => setCategory(cat.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  category === cat.key
                    ? 'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow'
                    : 'text-slate-500 dark:text-slate-400'
                }`}>
                <Icon size={11} />
                <span className="hidden sm:inline">{cat.label}</span>
              </button>
            )
          })}
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
          <option value="all">All Status</option>
          {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2.5">
          {[1,2,3].map(i => (
            <div key={i} className="glass-card rounded-2xl p-4 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-navy-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-100 dark:bg-navy-800 rounded w-1/3 mb-2" />
              <div className="h-4 bg-slate-200 dark:bg-navy-700 rounded w-2/3" />
              <div className="h-3 bg-slate-100 dark:bg-navy-800 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <FileText size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">No documents found</p>
          {canManage && (
            <button onClick={() => setShowAdd(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy-900 dark:bg-blue-700 text-white text-xs font-bold hover:bg-navy-800 transition-all">
              <Plus size={13} /> Add First Document
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(doc => {
            const isExpired  = doc.computedStatus === 'expired'
            const isExpiring = doc.computedStatus === 'expiring_soon'
            return (
              <div key={doc.id}
                className={`glass-card rounded-2xl overflow-hidden hover:shadow-md transition-all ${
                  isExpired  ? 'border-l-4 border-red-500'   :
                  isExpiring ? 'border-l-4 border-amber-400' : ''
                }`}>
                <div className="flex items-center gap-3 p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    isExpired  ? 'bg-red-100 dark:bg-red-900/30'    :
                    isExpiring ? 'bg-amber-100 dark:bg-amber-900/30' :
                                 'bg-slate-100 dark:bg-navy-800'
                  }`}>
                    {isExpired  ? <AlertTriangle size={18} className="text-red-500"    /> :
                     isExpiring ? <Clock         size={18} className="text-amber-500"  /> :
                                  <FileText      size={18} className="text-slate-500 dark:text-slate-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <p className="font-bold text-slate-800 dark:text-white text-sm truncate">{doc.title}</p>
                      {getCategoryIcon(doc.category)}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap">
                      <span className="capitalize">{(doc.doc_type||'document').replace(/_/g,' ')}</span>
                      {doc.expiry_date && (
                        <>
                          <span>·</span>
                          <span className={isExpired ? 'text-red-500 font-bold' : isExpiring ? 'text-amber-600 font-bold' : ''}>
                            {isExpired ? `Expired ${Math.abs(doc.daysLeft)}d ago` :
                             doc.daysLeft === 0 ? 'Expires today' :
                             `Expires in ${doc.daysLeft}d`}
                          </span>
                        </>
                      )}
                      {doc.notes && <><span>·</span><span className="truncate max-w-[160px]">{doc.notes}</span></>}
                    </div>
                    {doc.reminder_date && (
                      <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                        <Calendar size={9} /> Reminder: {doc.reminder_date}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <StatusBadge status={doc.computedStatus} />
                    {canManage && (
                      <button onClick={() => handleDelete(doc.id)}
                        className="flex items-center gap-1 text-[10px] text-red-500 hover:text-red-700 font-bold transition-colors">
                        <Trash2 size={11} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <AddDocModal
          onClose={() => setShowAdd(false)}
          onSave={handleSave}
          drivers={drivers}
          vehicles={vehicles}
          customers={customers}
        />
      )}
    </div>
  )
}