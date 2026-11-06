// ─── Invoice Modal ────────────────────────────────────────────
// Printable, WhatsApp-shareable trip invoice.
// Reads business config from settingsData (persisted in localStorage).

import { useRef, useState, useEffect } from 'react'
import { X, Printer, Share2, MapPin, Phone, Mail, Globe } from 'lucide-react'
import ModalOverlay from '../ui/ModalOverlay'
import { getBizInfo, getInvoiceSettings, DEFAULT_SETTINGS } from '../../data/settingsData'

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}

function fmtMoney(amount, cur) {
  return `${cur} ${Number(amount || 0).toLocaleString('en-IN')}`
}

export default function InvoiceModal({ booking, onClose }) {
  const printRef    = useRef()
  const [biz,         setBiz]         = useState(DEFAULT_SETTINGS.biz)
  const [invSettings, setInvSettings] = useState(DEFAULT_SETTINGS.invoice)
  useEffect(() => {
    getBizInfo().then(setBiz).catch(err => console.error('[InvoiceModal] load biz info failed:', err))
    getInvoiceSettings().then(setInvSettings).catch(err => console.error('[InvoiceModal] load invoice settings failed:', err))
  }, [])
  const cur         = invSettings.currency

  // Expense items
  const toll    = booking.toll    || 0
  const bata    = booking.bata    || 0
  const petrol  = booking.petrol  || 0
  const parking = booking.parking || 0
  const extras  = booking.extras  || 0

  const lineItems = [
    { desc: 'Trip Fare',     km: booking.km ? `${booking.km} km` : '—', amt: booking.fare || 0, show: true       },
    { desc: 'Toll Charges',  km: '—',                                    amt: toll,              show: toll > 0   },
    { desc: 'Driver Bata',   km: '—',                                    amt: bata,              show: bata > 0   },
    { desc: 'Fuel / Petrol', km: '—',                                    amt: petrol,            show: petrol > 0 },
    { desc: 'Parking',       km: '—',                                    amt: parking,           show: parking > 0},
    { desc: 'Other',         km: '—',                                    amt: extras,            show: extras > 0 },
  ].filter(r => r.show)

  // WhatsApp message
  const waText = encodeURIComponent(
    `🚗 *${biz.name}*\n` +
    `📋 Invoice: ${booking.bookingNo || booking.id}\n` +
    `👤 Customer: ${booking.customer}\n` +
    `📅 Date: ${fmtDate(booking.startDate)}\n` +
    `📍 ${booking.pickup || '—'} → ${booking.drop || '—'}\n` +
    `🛣 Distance: ${booking.km || '—'} km\n` +
    `💰 Fare: ${cur} ${(booking.fare || 0).toLocaleString('en-IN')}\n\n` +
    `${invSettings.footerText}\n` +
    `📞 ${biz.phone}`
  )

  function handlePrint() {
    const win  = window.open('', '_blank')
    const html = printRef.current?.innerHTML || ''
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>Invoice — ${booking.bookingNo || booking.id}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;padding:32px;color:#1e293b;font-size:13px}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
        .biz-name{font-size:20px;font-weight:900;color:#0d1b4b}
        .biz-sub{font-size:11px;color:#64748b;margin-top:3px}
        .inv-right{text-align:right}
        .inv-no{font-size:16px;font-weight:800;color:#0d1b4b;font-family:monospace}
        .section{margin-bottom:20px}
        .sec-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:8px}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .box{background:#f8fafc;border-radius:8px;padding:12px}
        .field-lbl{font-size:10px;color:#64748b}
        .field-val{font-size:13px;font-weight:600;color:#1e293b;margin-top:2px}
        .table{width:100%;border-collapse:collapse;margin-top:8px}
        .table th{background:#f1f5f9;font-size:10px;font-weight:700;text-transform:uppercase;padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0}
        .table td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px}
        .table td.right{text-align:right;font-weight:700}
        .total{font-weight:900;font-size:14px;border-top:2px solid #e2e8f0}
        .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
        @media print{body{padding:12px}}
      </style>
    </head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 400)
  }

  return (
    <ModalOverlay onClose={onClose} center>
      <div
        className="w-full max-w-xl bg-white dark:bg-navy-900 rounded-3xl shadow-2xl overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 dark:bg-navy-800 border-b border-slate-200 dark:border-navy-700">
          <div>
            <p className="font-display font-black text-slate-800 dark:text-white text-sm">Invoice</p>
            <p className="text-[10px] text-slate-400 font-mono">{booking.bookingNo || booking.id}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <a href={`https://wa.me/?text=${waText}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors">
              <Share2 size={12} /> WhatsApp
            </a>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors">
              <Printer size={12} /> Print
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl border border-slate-200 dark:border-navy-600 flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Scrollable invoice body */}
        <div className="overflow-y-auto max-h-[80vh]">
          <div ref={printRef} className="p-6 space-y-5">

            {/* Header */}
            <div className="header flex items-start justify-between gap-4">
              <div>
                {biz.logo && (
                  <img src={biz.logo} alt={biz.name} className="h-10 object-contain mb-2"
                    onError={e => { e.target.style.display = 'none' }} />
                )}
                <p className="biz-name font-display font-black text-navy-900 dark:text-white text-lg leading-tight">{biz.name}</p>
                <div className="mt-1 space-y-0.5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><MapPin size={9} />{biz.address}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><Phone size={9} />{biz.phone}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><Mail size={9} />{biz.email}</p>
                  {biz.website && <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1"><Globe size={9} />{biz.website}</p>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">INVOICE</p>
                <p className="font-display font-black text-navy-900 dark:text-white text-base font-mono">{booking.bookingNo || booking.id}</p>
                <div className="mt-2 space-y-0.5">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Date: <span className="font-semibold text-slate-700 dark:text-slate-200">{fmtDate(booking.startDate)}</span></p>
                  {booking.startTime && <p className="text-[10px] text-slate-500 dark:text-slate-400">Time: <span className="font-semibold">{booking.startTime}</span></p>}
                </div>
                <div className="mt-2">
                  <span className={`inline-flex text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    booking.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                    booking.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {(booking.status || 'pending').toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Bill To / Trip Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bill To</p>
                <p className="font-bold text-slate-800 dark:text-white text-sm">{booking.customer}</p>
                {booking.contact && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1"><Phone size={9}/>{booking.contact}</p>}
              </div>
              <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Trip Info</p>
                <div className="space-y-1">
                  {[
                    { l: 'Driver',   v: booking.driver  || '—' },
                    { l: 'Vehicle',  v: booking.vehicle || '—' },
                    { l: 'Type',     v: booking.type    || '—' },
                    { l: 'Distance', v: booking.km ? `${booking.km} km` : '—' },
                  ].map(d => (
                    <div key={d.l} className="flex gap-2">
                      <span className="text-[9px] text-slate-400 w-14 flex-shrink-0">{d.l}</span>
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200">{d.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Route */}
            {(booking.pickup || booking.drop) && (
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Route</p>
                <div className="bg-slate-50 dark:bg-navy-800/50 rounded-xl p-3 flex items-stretch gap-3">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    <div className="flex-1 w-0.5 border-l border-dashed border-slate-300 dark:border-navy-600 min-h-[20px]" />
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Pickup</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{booking.pickup || '—'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase">Drop</p>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{booking.drop || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fare breakdown */}
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Fare Breakdown</p>
              <div className="border border-slate-100 dark:border-navy-700 rounded-xl overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 dark:bg-navy-800/60 grid grid-cols-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <span>Description</span><span className="text-center">QTY/KM</span><span className="text-right">Amount</span>
                </div>
                {lineItems.map(r => (
                  <div key={r.desc} className="px-4 py-2 grid grid-cols-3 text-xs border-b border-slate-100 dark:border-navy-800/60 last:border-0">
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{r.desc}</span>
                    <span className="text-center text-slate-400">{r.km}</span>
                    <span className="text-right font-bold text-slate-700 dark:text-slate-200">{fmtMoney(r.amt, cur)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 grid grid-cols-3 border-t-2 border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/50">
                  <span className="font-black text-slate-800 dark:text-white text-sm col-span-2">Total Amount</span>
                  <span className="text-right font-black text-navy-800 dark:text-blue-300 text-sm">{fmtMoney(booking.fare, cur)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {booking.notes && (
              <div className="bg-amber-50 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-3">
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">{booking.notes}</p>
              </div>
            )}

            {/* Terms */}
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms & Conditions</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">{invSettings.termsText}</p>
            </div>

            {/* Footer */}
            <div className="text-center pt-3 border-t border-slate-100 dark:border-navy-700">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">{invSettings.footerText}</p>
              <p className="text-[10px] text-slate-400 mt-1">{biz.phone} · {biz.email}</p>
              {biz.gstin && invSettings.showGSTIN && (
                <p className="text-[10px] text-slate-400 mt-0.5">GSTIN: {biz.gstin}</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}