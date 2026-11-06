// ─── Notification Feed ────────────────────────────────────────
// Compact inline feed widget used on Dashboard and driver pages.
// Reads from CommunicationContext.

import { useState } from 'react'
import { Bell, CheckCheck, ChevronRight, Archive } from 'lucide-react'
import { useCommunicationCtx } from '../../hooks/useCommunication'
import { fmtAuditTime } from '../../data/auditLogData'

const CAT_COLORS = {
  booking:    'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  trip:       'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  expense:    'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  payroll:    'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  driver:     'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  vehicle:    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
  document:   'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
  attendance: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300',
  system:     'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
  general:    'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
}

/**
 * Compact feed — renders up to `limit` recent notifications.
 * Props:
 *   limit        — max items to show (default 5)
 *   showHeader   — show "Recent Notifications" header (default true)
 *   onViewAll    — callback for "View All" button
 */
export default function NotificationFeed({ limit = 5, showHeader = true, onViewAll }) {
  const { notifications, unreadCount, markRead, markAllRead, archive, notifLoading } = useCommunicationCtx()
  const [showAll, setShowAll] = useState(false)

  const inbox = notifications.filter(n => ['unread','read'].includes(n.status))
  const visible = showAll ? inbox.slice(0, 20) : inbox.slice(0, limit)

  if (notifLoading) {
    return (
      <div className="space-y-2">
        {showHeader && <div className="h-5 bg-slate-200 dark:bg-navy-700 rounded w-40 animate-pulse"/>}
        {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-200 dark:bg-navy-700 rounded-xl animate-pulse"/>)}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {showHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-slate-500 dark:text-slate-400"/>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Notifications
            </p>
            {unreadCount > 0 && (
              <span className="text-[9px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline transition-colors">
                <CheckCheck size={10}/> Mark all read
              </button>
            )}
            {onViewAll && (
              <button onClick={onViewAll}
                className="flex items-center gap-0.5 text-[10px] font-bold text-slate-500 dark:text-slate-400 hover:text-navy-700 dark:hover:text-white transition-colors">
                View all <ChevronRight size={10}/>
              </button>
            )}
          </div>
        </div>
      )}

      {inbox.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <Bell size={22} className="text-slate-300 dark:text-slate-600"/>
          <p className="text-xs text-slate-400 dark:text-slate-500">You're all caught up</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {visible.map(n => {
              const isUnread = n.status === 'unread'
              const catColor = CAT_COLORS[n.category] || CAT_COLORS.general
              return (
                <div key={n.id}
                  onClick={() => isUnread && markRead(n.id)}
                  className={`group flex items-start gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                    isUnread
                      ? 'bg-blue-50/60 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/15 border border-blue-100 dark:border-blue-800/20'
                      : 'hover:bg-slate-50 dark:hover:bg-navy-800/40'
                  }`}>
                  {/* Icon */}
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-navy-800 border border-slate-100 dark:border-navy-700 flex items-center justify-center flex-shrink-0 mt-0.5 text-sm shadow-sm">
                    {n.icon || '🔔'}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={`text-xs font-bold truncate ${isUnread ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {n.title}
                      </p>
                      {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0"/>}
                    </div>
                    {n.message && (
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-relaxed">
                        {n.message}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize ${catColor}`}>
                        {n.category || 'general'}
                      </span>
                      <span className="text-[10px] text-slate-400">{fmtAuditTime(n.created_at)}</span>
                    </div>
                  </div>

                  {/* Archive button — visible on hover */}
                  <button
                    onClick={e => { e.stopPropagation(); archive(n.id) }}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5 transition-all"
                    title="Archive">
                    <Archive size={11}/>
                  </button>
                </div>
              )
            })}
          </div>

          {inbox.length > limit && (
            <button onClick={() => setShowAll(s => !s)}
              className="w-full text-center text-[11px] font-bold text-slate-400 dark:text-slate-500 hover:text-navy-700 dark:hover:text-white py-2 transition-colors">
              {showAll ? 'Show less' : `+${inbox.length - limit} more notifications`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
