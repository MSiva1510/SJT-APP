// ─── Communications Page ─────────────────────────────────────
// Full notification center + communication logs + analytics.
// Accessible to Admin and Manager.

import { useState, useMemo, useEffect } from 'react'
import {
  Bell, MessageSquare, BarChart2, Settings, Search,
  Filter, RefreshCw, CheckCheck, Archive, Trash2,
  AlertTriangle, CheckCircle, Clock, ChevronDown,
  Smartphone, Phone, Globe, BookOpen, Zap, Send,
  Download,
} from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'
import { useCommunicationCtx } from '../hooks/useCommunication'
import { exportToCSV } from '../data/reportData'
import { fmtAuditTime } from '../data/auditLogData'

// ── Constants ─────────────────────────────────────────────────
const TABS = [
  { key:'notifications', label:'Notifications', Icon:Bell         },
  { key:'logs',          label:'Comm Logs',     Icon:MessageSquare},
  { key:'analytics',     label:'Analytics',     Icon:BarChart2    },
  { key:'schedule',      label:'Scheduled',     Icon:Clock        },
]

const CHANNEL_CFG = {
  in_app:   { label:'In-App',   icon:'🔔', color:'text-blue-500',    bg:'bg-blue-100 dark:bg-blue-900/30'    },
  whatsapp: { label:'WhatsApp', icon:'💬', color:'text-emerald-500', bg:'bg-emerald-100 dark:bg-emerald-900/30'},
  sms:      { label:'SMS',      icon:'📱', color:'text-teal-500',    bg:'bg-teal-100 dark:bg-teal-900/30'    },
  push:     { label:'Push',     icon:'📲', color:'text-violet-500',  bg:'bg-violet-100 dark:bg-violet-900/30'},
  webhook:  { label:'Webhook',  icon:'🌐', color:'text-amber-500',   bg:'bg-amber-100 dark:bg-amber-900/30'  },
  email:    { label:'Email',    icon:'📧', color:'text-rose-500',    bg:'bg-rose-100 dark:bg-rose-900/30'    },
}

const STATUS_CFG = {
  pending:    { label:'Pending',    badge:'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  processing: { label:'Processing', badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'         },
  delivered:  { label:'Delivered',  badge:'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'},
  failed:     { label:'Failed',     badge:'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'             },
  retrying:   { label:'Retrying',   badge:'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  cancelled:  { label:'Cancelled',  badge:'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'        },
  unread:     { label:'Unread',     badge:'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'         },
  read:       { label:'Read',       badge:'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'        },
  archived:   { label:'Archived',   badge:'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'        },
}

const CAT_COLORS = {
  booking:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  trip:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  expense:    'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  payroll:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  driver:     'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  vehicle:    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  customer:   'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  document:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  attendance: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  finance:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  system:     'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  general:    'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.pending
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
}

function ChannelChip({ channel }) {
  const cfg = CHANNEL_CFG[channel] || { label:channel, icon:'📨', bg:'bg-slate-100 dark:bg-slate-800', color:'text-slate-500' }
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

// ── Notifications Tab ─────────────────────────────────────────
function NotificationsTab() {
  const { notifications, notifLoading, loadNotifs, markRead, markAllRead, archive, dismiss, unreadCount } = useCommunicationCtx()
  const [filter, setFilter]   = useState('all')
  const [search, setSearch]   = useState('')
  const [catFilter, setCat]   = useState('all')

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filter === 'unread'   && n.status !== 'unread')   return false
      if (filter === 'archived' && n.status !== 'archived') return false
      if (filter === 'read'     && n.status !== 'read')     return false
      if (catFilter !== 'all'   && n.category !== catFilter) return false
      if (search) {
        const q = search.toLowerCase()
        return [n.title, n.message, n.category].some(v => v?.toLowerCase().includes(q))
      }
      return true
    })
  }, [notifications, filter, search, catFilter])

  const categories = [...new Set(notifications.map(n => n.category).filter(Boolean))]

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="text-slate-400" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search notifications…"
            className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none w-full" />
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
          {[['all','All'],['unread','Unread'],['read','Read'],['archived','Archived']].map(([k,l]) => (
            <button key={k} onClick={()=>setFilter(k)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filter===k?'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow':'text-slate-500 dark:text-slate-400'}`}>
              {l}
              {k==='unread'&&unreadCount>0&&<span className="ml-1 text-[9px] bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">{unreadCount}</span>}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <select value={catFilter} onChange={e=>setCat(e.target.value)}
            className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
            <option value="all">All Categories</option>
            {categories.map(c=><option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
        )}

        <div className="flex gap-2 ml-auto">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
              <CheckCheck size={13}/> Mark All Read
            </button>
          )}
          <button onClick={loadNotifs}
            className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
            <RefreshCw size={13}/>
          </button>
        </div>
      </div>

      {/* List */}
      {notifLoading ? (
        <div className="space-y-2">
          {[1,2,3].map(i=><div key={i} className="h-16 glass-card rounded-xl animate-pulse"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <Bell size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3"/>
          <p className="text-slate-400 text-sm">No notifications found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(n => {
            const isUnread = n.status === 'unread'
            const catColor = CAT_COLORS[n.category] || CAT_COLORS.general
            return (
              <div key={n.id}
                className={`glass-card rounded-xl overflow-hidden border-l-4 ${isUnread?'border-blue-500':'border-transparent'}`}>
                <div className="flex items-start gap-3 p-3.5">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0 text-base">
                    {n.icon||'🔔'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className={`text-sm font-bold ${isUnread?'text-slate-800 dark:text-white':'text-slate-600 dark:text-slate-300'}`}>
                        {n.title}
                      </p>
                      {isUnread&&<span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"/>}
                    </div>
                    {n.message&&<p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{n.message}</p>}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${catColor}`}>{n.category||'general'}</span>
                      <StatusBadge status={n.status}/>
                      <span className="text-[10px] text-slate-400">{fmtAuditTime(n.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isUnread&&<button onClick={()=>markRead(n.id)} title="Mark read"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"><BookOpen size={12}/></button>}
                    <button onClick={()=>archive(n.id)} title="Archive"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors"><Archive size={12}/></button>
                    <button onClick={()=>dismiss(n.id)} title="Dismiss"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={12}/></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Comm Logs Tab ─────────────────────────────────────────────
function CommLogsTab() {
  const { commLogs, logsTotal, logsLoading, loadLogs } = useCommunicationCtx()
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { loadLogs() }, [])

  const filtered = useMemo(() =>
    commLogs.filter(l => {
      if (channelFilter !== 'all' && l.channel !== channelFilter) return false
      if (statusFilter  !== 'all' && l.status  !== statusFilter)  return false
      if (search) {
        const q = search.toLowerCase()
        return [l.subject,l.body,l.recipient_name,l.event_type,l.category].some(v=>v?.toLowerCase().includes(q))
      }
      return true
    })
  , [commLogs, channelFilter, statusFilter, search])

  const handleExport = () => exportToCSV(filtered, [
    {label:'Time',      key:'created_at'},
    {label:'Channel',   key:'channel'},
    {label:'Category',  key:'category'},
    {label:'Event',     key:'event_type'},
    {label:'Recipient', key:'recipient_name'},
    {label:'Subject',   key:'subject'},
    {label:'Status',    key:'status'},
    {label:'Priority',  key:'priority'},
  ], 'comm_logs')

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/60 flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="text-slate-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search logs…"
            className="bg-transparent text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none w-full"/>
        </div>
        <select value={channelFilter} onChange={e=>setChannelFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
          <option value="all">All Channels</option>
          {Object.entries(CHANNEL_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-700 dark:text-slate-200 focus:outline-none">
          <option value="all">All Status</option>
          {Object.entries(STATUS_CFG).filter(([k])=>!['unread','read','archived'].includes(k)).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <p className="text-xs text-slate-400">{filtered.length} / {logsTotal}</p>
        <div className="flex gap-2 ml-auto">
          <button onClick={()=>loadLogs()} className="w-8 h-8 rounded-lg border border-slate-200 dark:border-navy-700 flex items-center justify-center text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"><RefreshCw size={13}/></button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors"><Download size={13}/> CSV</button>
        </div>
      </div>

      {/* Table */}
      {logsLoading ? (
        <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="h-12 glass-card rounded-xl animate-pulse"/>)}</div>
      ) : filtered.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center">
          <MessageSquare size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3"/>
          <p className="text-slate-400 text-sm">No communication logs found</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-navy-800/60 border-b border-slate-100 dark:border-navy-700">
                  {['Time','Channel','Category','Event','Recipient','Subject','Status','Priority'].map(h=>(
                    <th key={h} className="px-3 py-2.5 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-navy-800">
                {filtered.map((l,i)=>(
                  <tr key={l.id||i} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/20 transition-colors">
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-400 dark:text-slate-500 font-mono">{fmtAuditTime(l.created_at)}</td>
                    <td className="px-3 py-2.5"><ChannelChip channel={l.channel}/></td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${CAT_COLORS[l.category]||CAT_COLORS.general}`}>{l.category||'—'}</span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">{l.event_type?.replace(/_/g,' ')||'—'}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300 max-w-[100px] truncate">{l.recipient_name||'—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-[180px] truncate">{l.subject||l.body?.slice(0,40)||'—'}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={l.status}/></td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[9px] font-bold capitalize ${l.priority==='critical'?'text-red-500':l.priority==='high'?'text-amber-500':l.priority==='low'?'text-slate-400':'text-slate-500 dark:text-slate-400'}`}>{l.priority||'medium'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Analytics Tab ─────────────────────────────────────────────
function AnalyticsTab() {
  const { analytics, engineStats, loadAnalytics } = useCommunicationCtx()

  useEffect(() => { loadAnalytics() }, [])

  const totalSent      = analytics.reduce((s,a)=>s+(a.total||0),0)
  const totalDelivered = analytics.reduce((s,a)=>s+(a.delivered||0),0)
  const totalFailed    = analytics.reduce((s,a)=>s+(a.failed||0),0)
  const totalPending   = analytics.reduce((s,a)=>s+(a.pending||0),0)
  const deliveryRate   = totalSent > 0 ? Math.round((totalDelivered/totalSent)*100) : 0

  return (
    <div className="space-y-5">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label:'Total Sent',    value:totalSent,      color:'text-slate-700 dark:text-slate-200',      bg:'bg-slate-50 dark:bg-navy-800/60'                  },
          { label:'Delivered',     value:totalDelivered, color:'text-emerald-600 dark:text-emerald-400',  bg:'bg-emerald-50 dark:bg-emerald-900/10'              },
          { label:'Failed',        value:totalFailed,    color:'text-red-600 dark:text-red-400',           bg:'bg-red-50 dark:bg-red-900/10'                     },
          { label:'Delivery Rate', value:`${deliveryRate}%`, color:'text-blue-600 dark:text-blue-400',   bg:'bg-blue-50 dark:bg-blue-900/10'                   },
        ].map(s=>(
          <div key={s.label} className={`${s.bg} glass-card rounded-xl p-3 text-center`}>
            <p className={`text-2xl font-display font-black ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Per-channel breakdown */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">By Channel</p>
        {analytics.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No data yet. Send some communications first.</p>
        ) : (
          analytics.map(a=>{
            const cfg = CHANNEL_CFG[a.channel] || { label:a.channel, icon:'📨', bg:'bg-slate-100 dark:bg-slate-800', color:'text-slate-500' }
            const pct = a.total > 0 ? Math.round(((a.delivered||0)/a.total)*100) : 0
            return (
              <div key={a.channel} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center ${cfg.bg} text-sm`}>{cfg.icon}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{cfg.label}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-400">
                    <span>{a.total} total</span>
                    <span className="text-emerald-500">{a.delivered||0} ok</span>
                    <span className="text-red-500">{a.failed||0} fail</span>
                    <span className="font-bold text-slate-600 dark:text-slate-300">{pct}%</span>
                  </div>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{width:`${pct}%`}}/>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Provider status */}
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Adapter Status</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { name:'WhatsApp',  status:'Ready (deep-link)', ready:true,  note:'API provider not configured' },
            { name:'SMS',       status:'Not Configured',    ready:false, note:'Connect MSG91 / Twilio'      },
            { name:'Push',      status:'Not Configured',    ready:false, note:'Connect FCM / APNs'          },
            { name:'Webhook',   status:'Not Configured',    ready:false, note:'Register endpoint URL'       },
          ].map(a=>(
            <div key={a.name} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${a.ready?'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10':'border-slate-200 dark:border-navy-700 bg-slate-50 dark:bg-navy-800/40'}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.ready?'bg-emerald-500':'bg-slate-400'}`}/>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{a.name}</p>
                <p className="text-[10px] text-slate-400">{a.note}</p>
              </div>
              <span className={`text-[10px] font-bold ${a.ready?'text-emerald-600 dark:text-emerald-400':'text-slate-400'}`}>{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Scheduled Tab ─────────────────────────────────────────────
function ScheduledTab() {
  const { scheduledJobs } = useCommunicationCtx()
  if (scheduledJobs.length === 0) return (
    <div className="glass-card rounded-2xl p-12 text-center">
      <Clock size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3"/>
      <p className="text-slate-400 text-sm">No scheduled notifications</p>
      <p className="text-[11px] text-slate-400 mt-1">Schedules are created automatically when bookings, documents, or trips are added.</p>
    </div>
  )
  return (
    <div className="space-y-2">
      {scheduledJobs.map(job=>(
        <div key={job.id} className="glass-card rounded-xl p-3.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Clock size={14} className="text-amber-600 dark:text-amber-400"/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{job.type.replace(/_/g,' ')}</p>
            {job.runAt&&<p className="text-[10px] text-slate-400">Runs at: {new Date(job.runAt).toLocaleString('en-IN')}</p>}
            {job.recurring&&<p className="text-[10px] text-slate-400">Every {Math.round(job.intervalMs/3600000)}h</p>}
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
            {job.recurring?'Recurring':'Once'}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────
export default function Communications() {
  const [tab, setTab] = useState('notifications')
  const { unreadCount } = useCommunicationCtx()

  return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader
        title="Communications"
        subtitle="Notification center, delivery logs, and channel analytics"
        action={
          <a href="/communications-settings"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 font-bold text-sm hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors">
            <Settings size={15}/> Settings
          </a>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-navy-800 rounded-xl p-1 overflow-x-auto no-scrollbar w-fit">
        {TABS.map(t=>{
          const { Icon } = t
          return (
            <button key={t.key} onClick={()=>setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                tab===t.key?'bg-white dark:bg-navy-700 text-navy-900 dark:text-white shadow':'text-slate-500 dark:text-slate-400'
              }`}>
              <Icon size={12}/>
              {t.label}
              {t.key==='notifications'&&unreadCount>0&&(
                <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {tab==='notifications' && <NotificationsTab/>}
      {tab==='logs'          && <CommLogsTab/>}
      {tab==='analytics'     && <AnalyticsTab/>}
      {tab==='schedule'      && <ScheduledTab/>}
    </div>
  )
}
