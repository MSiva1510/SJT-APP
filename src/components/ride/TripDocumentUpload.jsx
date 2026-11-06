// ─── Trip Document Upload Widget ──────────────────────────────
// Module 5 (Day 20.5): lets a driver attach receipt photos to a
// trip — Parking Ticket, Toll Receipt, Fuel Receipt, Misc Expense.
// Stored locally (compressed base64) keyed by tripId.

import { useState, useRef } from 'react'
import { Upload, X, Trash2, Image as ImageIcon } from 'lucide-react'
import {
  DOC_TYPES, loadTripDocuments, saveTripDocument,
  deleteTripDocument, compressImageFile, getDocTypeCfg,
} from '../../data/tripDocumentsData'

export default function TripDocumentUpload({ tripId, uploadedBy }) {
  const [docs, setDocs]       = useState(() => loadTripDocuments(tripId))
  const [docType, setDocType] = useState('parking_ticket')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [preview, setPreview] = useState(null) // dataUrl for lightbox
  const fileInputRef          = useRef(null)

  function reload() { setDocs(loadTripDocuments(tripId)) }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const dataUrl = await compressImageFile(file)
      const saved   = saveTripDocument({ tripId, docType, dataUrl, fileName: file.name, uploadedBy })
      if (!saved) {
        setError('Could not save — storage may be full. Try deleting an old receipt.')
      } else {
        reload()
      }
    } catch {
      setError('Could not process that image.')
    } finally {
      setBusy(false)
    }
  }

  function handleDelete(docId) {
    if (!window.confirm('Remove this document?')) return
    deleteTripDocument(tripId, docId)
    reload()
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Trip Documents</p>

      {/* Doc type selector + upload button */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={docType}
          onChange={e => setDocType(e.target.value)}
          className="px-2.5 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800/60 text-slate-700 dark:text-slate-200 focus:outline-none font-body flex-1 min-w-[140px]"
        >
          {Object.values(DOC_TYPES).map(d => (
            <option key={d.key} value={d.key}>{d.icon} {d.label}</option>
          ))}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
        >
          <Upload size={12} />
          {busy ? 'Uploading...' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {error && (
        <p className="text-[10px] text-red-500 dark:text-red-400 font-medium">{error}</p>
      )}

      {/* Uploaded docs grid */}
      {docs.length === 0 ? (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-navy-800/40 rounded-lg px-3 py-2.5">
          <ImageIcon size={12} />
          No documents uploaded yet
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {docs.map(d => {
            const cfg = getDocTypeCfg(d.docType)
            return (
              <div key={d.id} className="relative group">
                <button
                  onClick={() => setPreview(d)}
                  className="w-full aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-navy-700 bg-slate-100 dark:bg-navy-800"
                >
                  <img src={d.dataUrl} alt={cfg.label} className="w-full h-full object-cover" />
                </button>
                <span className="absolute top-1 left-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                  {cfg.icon}
                </span>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox preview */}
      {preview && (
        <div
          className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4"
          onClick={() => setPreview(null)}
        >
          <div className="max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">{getDocTypeCfg(preview.docType).label}</span>
              <button onClick={() => setPreview(null)} className="w-7 h-7 rounded-full bg-white/10 text-white flex items-center justify-center">
                <X size={14} />
              </button>
            </div>
            <img src={preview.dataUrl} alt="" className="w-full rounded-xl" />
          </div>
        </div>
      )}
    </div>
  )
}
