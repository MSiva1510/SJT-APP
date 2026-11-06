// ─── Trip Document Data — Supabase trip_documents table ────────
// Columns: id, trip_id (UUID), document_type, file_url, file_name,
//          file_size, uploaded_by, uploaded_at, notes, created_at
//
// Note: file_url stores a base64 data URL for receipt photos.
// For production, replace with Supabase Storage + signed URLs.

import supabase from '../lib/supabase'

export const DOC_TYPES = [
  { key: 'parking_ticket', label: 'Parking Ticket', icon: '🅿' },
  { key: 'toll_receipt',   label: 'Toll Receipt',   icon: '🛣' },
  { key: 'fuel_receipt',   label: 'Fuel Receipt',   icon: '⛽' },
  { key: 'misc_receipt',   label: 'Misc Receipt',   icon: '📄' },
]

export function getDocTypeCfg(key) {
  return DOC_TYPES.find(d => d.key === key) || DOC_TYPES[DOC_TYPES.length - 1]
}

export async function loadTripDocuments(tripId) {
  if (!supabase || !tripId) return []
  const { data, error } = await supabase
    .from('trip_documents')
    .select('id, document_type, file_url, file_name, file_size, uploaded_by, uploaded_at, notes')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true })
  if (error) return []
  return (data || []).map(d => ({
    id:           d.id,
    tripId,
    docType:      d.document_type,
    fileUrl:      d.file_url,
    fileName:     d.file_name,
    fileSize:     d.file_size,
    uploadedBy:   d.uploaded_by,
    uploadedAt:   d.uploaded_at,
    notes:        d.notes,
  }))
}

export async function saveTripDocument(tripId, doc) {
  if (!supabase || !tripId) return null
  const payload = {
    trip_id:       tripId,
    document_type: doc.docType     || doc.document_type || 'misc_receipt',
    file_url:      doc.fileUrl     || doc.file_url     || doc.dataUrl     || doc.data_url     || null,
    file_name:     doc.fileName    || doc.file_name     || null,
    file_size:     doc.fileSize    || doc.file_size     || null,
    uploaded_by:   doc.uploadedBy  || doc.uploaded_by   || null,
    notes:         doc.notes       || null,
    uploaded_at:   new Date().toISOString(),
  }
  if (doc.id) {
    const { data } = await supabase.from('trip_documents').update(payload).eq('id', doc.id).select().single()
    return data
  }
  const { data } = await supabase.from('trip_documents').insert([payload]).select().single()
  return data
}

export async function deleteTripDocument(tripId, docId) {
  if (!supabase || !docId) return
  await supabase.from('trip_documents').delete().eq('id', docId)
}

// Compress image file to base64 data URL
export async function compressImageFile(file) {
  if (!file) return null
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
