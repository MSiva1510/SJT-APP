// ─── Notification Center ──────────────────────────────────────
// 4-tab bell panel — reads from CommunicationContext.
// Falls back gracefully when context is unavailable.

import { useState, useRef, useEffect } from 'react'
import {
  Bell, X, Check, CheckCircle, AlertTriangle,
  Clock, Archive, Trash2, BookOpen, BellOff,
} from 'lucide-react'
import { useCommunicationCtx } from '../../hooks/useCommunication'
import { getBusinessAlerts } from '../../data/reportData'
import { loadRecentActivity, fmtAuditTime } from '../../data/auditLogData'
import { NOTIFICATION_TYPES } from '../../services/notificationService'

// ── Helpers ───────────────────────────────────────────────────
function useClickOutside(ref, handler) {
  useEffect(() => {
    const fn = e => { if (!ref.current || ref.current.contains(e.target)) return; handler() }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [ref, handler])
}

function fmtTime(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString('en-IN', { day:'numeric', month:'short' })
}

const PRIORITY_BORDER = {
  urgent:'border-l-2 border-red-500',
  high:  'border-l-2 border-amber-500',
  normal:'',
  low:   '',
}

const CAT_COLOR = {
  booking:   'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  trip:      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  expense:   'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  payroll:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  document:  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  vehicle:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  attendance:'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  general:   'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
}

// ── Sub-components ────────────────────────────────────────────
function EmptyState({ icon, text }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2">
      {icon}
      <p className="text-xs text-slate-400 dark:text-slate-500">{text}</p>
    </div>
  )
}

function NotifRow({ n, onRead, onArchive, onDismiss, archived = false }) {
  const isUnread    = n.status === 'unread'
  const borderClass = PRIORITY_BORDER[n.priority] || ''
  const catClass    = CAT_COLOR[n.category] || CAT_COLOR.general
  const icon        = n.icon || NOTIFICATION_TYPES[n.type]?.icon || '🔔'

  return (
    <div className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-navy-800/40 ${isUnread ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''} ${borderClass}`}>
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-navy-800 flex items-center justify-center flex-shrink-0 mt-0.5 text-sm">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`text-xs font-bold truncate ${isUnread ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
            {n.title}
          </p>
          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
        </div>
        {n.message && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2">{n.message}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${catClass}`}>
            {n.category || 'general'}
          </span>
          <span className="text-[10px] text-slate-400">{fmtTime(n.created_at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {!archived && isUnread && onRead && (
          <button onClick={e => { e.stopPropagation(); onRead() }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            title="Mark read">
            <BookOpen size={11} />
          </button>
        )}
        {!archived && onArchive && (
          <button onClick={e => { e.stopPropagation(); onArchive() }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors"
            title="Archive">
            <Archive size={11} />
          </button>
        )}
        {onDismiss && (
          <button onClick={e => { e.stopPropagation(); onDismiss() }}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            title="Dismiss">
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

function AlertRow({ alert: a }) {
  const isExpired = a.status?.key === 'expired'
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${a.priority === 'high' ? 'bg-red-50/40 dark:bg-red-900/5' : ''}`}>
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isExpired ? 'bg-red-100 dark:bg-red-900/40' : 'bg-amber-100 dark:bg-amber-900/40'
      }`}>
        <AlertTriangle size={13} className={isExpired ? 'text-red-500' : 'text-amber-500'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{a.label}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.status?.badge || ''}`}>
            {a.status?.label || ''}
          </span>
          {a.days != null && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {a.days < 0 ? `${Math.abs(a.days)}d overdue` : a.days === 0 ? 'Today' : `${a.days}d left`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────
export default function NotificationCenter() {
  const {
    notifications, unreadCount, notifLoading,
    loadNotifs, markRead, markAllRead, archive, dismiss,
  } = useCommunicationCtx()

  const [open,     setOpen]    = useState(false)
  const [tab,      setTab]     = useState('inbox')
  const [alerts,   setAlerts]  = useState([])
  const [activity, setActivity]= useState([])
  const wrapRef = useRef()
  useClickOutside(wrapRef, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    loadNotifs()
    getBusinessAlerts().then(setAlerts).catch(()=>{})
    setActivity(loadRecentActivity(12))
  }, [open, loadNotifs])

  const inbox    = notifications.filter(n => ['unread','read'].includes(n.status))
  const archived = notifications.filter(n => n.status === 'archived')
  const unread   = notifications.filter(n => n.status === 'unread')
  const badgeNum = unreadCount + alerts.filter(a => a.priority === 'high').length

  const doMarkRead = (id) => markRead(id)
  const doMarkAll  = ()    => markAllRead()
  const doArchive  = (id)  => archive(id)
  const doDismiss  = (id)  => dismiss(id)

  const TABS = [
    { key:'inbox',    label:'Inbox',    badge: unread.length,                                    count: inbox.length    },
    { key:'alerts',   label:'Alerts',   badge: alerts.filter(a=>a.priority==='high').length,     count: alerts.length   },
    { key:'activity', label:'Activity', badge: 0,                                                count: activity.length },
    { key:'archived', label:'Archived', badge: 0,                                                count: archived.length },
  ]

  return (
    <div ref={wrapRef} className="relative">
      {/* Bell */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-600 bg-white/60 dark:bg-navy-800/60 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-navy-700 transition-all"
        title="Notifications">
        <Bell size={16} />
        {badgeNum > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center border-2 border-white dark:border-navy-900 leading-none">
            {badgeNum > 9 ? '9+' : badgeNum}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute right-0 top-11 w-96 bg-white dark:bg-navy-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-navy-700 overflow-hidden z-50 animate-fade-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-navy-700">
            <h3 className="font-display font-black text-slate-800 dark:text-white text-sm">Notifications</h3>
            <div className="flex items-center gap-1.5">
              {unread.length > 0 && (
                <button onClick={doMarkAll}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                  <Check size={11} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors">
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-100 dark:border-navy-700 overflow-x-auto no-scrollbar">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-shrink-0 py-2.5 px-3 text-[11px] font-bold transition-colors relative ${
                  tab === t.key ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                }`}>
                {t.label}
                {(t.badge > 0 || t.count > 0) && (
                  <span className={`ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full ${
                    t.badge > 0
                      ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'
                      : tab === t.key
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-navy-700 text-slate-400'
                  }`}>
                    {t.badge > 0 ? t.badge : t.count}
                  </span>
                )}
                {tab === t.key && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t" />}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {notifLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {tab === 'inbox' && (
                  inbox.length === 0
                    ? <EmptyState icon={<BellOff size={24} className="text-slate-300 dark:text-slate-600" />} text="No notifications" />
                    : <div className="divide-y divide-slate-50 dark:divide-navy-800">
                        {inbox.map(n => (
                          <NotifRow key={n.id} n={n}
                            onRead={n.status==='unread' ? () => doMarkRead(n.id) : null}
                            onArchive={() => doArchive(n.id)}
                            onDismiss={() => doDismiss(n.id)} />
                        ))}
                      </div>
                )}

                {tab === 'alerts' && (
                  alerts.length === 0
                    ? <EmptyState icon={<CheckCircle size={24} className="text-emerald-400" />} text="All documents up to date" />
                    : <div className="divide-y divide-slate-50 dark:divide-navy-800">
                        {alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
                      </div>
                )}

                {tab === 'activity' && (
                  activity.length === 0
                    ? <EmptyState icon={<Clock size={24} className="text-slate-300 dark:text-slate-600" />} text="No recent activity" />
                    : <div className="divide-y divide-slate-50 dark:divide-navy-800">
                        {activity.map(ev => (
                          <div key={ev.id} className="flex items-center gap-3 px-4 py-2.5">
                            <span className="text-base flex-shrink-0">{ev.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{ev.label}</p>
                              {ev.description && <p className="text-[10px] text-slate-400 truncate">{ev.description}</p>}
                            </div>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">{fmtAuditTime(ev.timestamp)}</span>
                          </div>
                        ))}
                      </div>
                )}

                {tab === 'archived' && (
                  archived.length === 0
                    ? <EmptyState icon={<Archive size={24} className="text-slate-300 dark:text-slate-600" />} text="Nothing archived" />
                    : <div className="divide-y divide-slate-50 dark:divide-navy-800">
                        {archived.map(n => (
                          <NotifRow key={n.id} n={n} archived onDismiss={() => doDismiss(n.id)} />
                        ))}
                      </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-slate-100 dark:border-navy-700 bg-slate-50/50 dark:bg-navy-800/30 flex items-center justify-between">
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              {unread.length > 0 ? `${unread.length} unread` : 'All caught up'}
            </p>
            {tab === 'alerts' && alerts.length > 0 && (
              <p className="text-[10px] text-slate-400">→ Go to Vehicles to renew</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
