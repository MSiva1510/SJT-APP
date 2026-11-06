// ─── Communication Analytics Widget ──────────────────────────
// Compact analytics panel for Dashboard or Reports page.

import { useEffect } from 'react'
import { Send, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useCommunicationCtx } from '../../hooks/useCommunication'

const CHANNEL_CFG = {
  in_app:   { label:'In-App',   icon:'🔔', color:'text-blue-500'    },
  whatsapp: { label:'WhatsApp', icon:'💬', color:'text-emerald-500' },
  sms:      { label:'SMS',      icon:'📱', color:'text-teal-500'    },
  push:     { label:'Push',     icon:'📲', color:'text-violet-500'  },
  webhook:  { label:'Webhook',  icon:'🌐', color:'text-amber-500'   },
}

export default function CommunicationAnalytics({ compact = false }) {
  const { analytics, loadAnalytics } = useCommunicationCtx()

  useEffect(() => { loadAnalytics() }, [])

  const total     = analytics.reduce((s,a) => s + (a.total||0),     0)
  const delivered = analytics.reduce((s,a) => s + (a.delivered||0), 0)
  const failed    = analytics.reduce((s,a) => s + (a.failed||0),    0)
  const pending   = analytics.reduce((s,a) => s + (a.pending||0),   0)
  const rate      = total > 0 ? Math.round((delivered / total) * 100) : 0

  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {[
          { label:'Sent',      value:total,     Icon:Send,         color:'text-slate-700 dark:text-slate-200' },
          { label:'Delivered', value:delivered, Icon:CheckCircle,  color:'text-emerald-600 dark:text-emerald-400' },
          { label:'Failed',    value:failed,    Icon:XCircle,      color:'text-red-500 dark:text-red-400'     },
          { label:'Rate',      value:`${rate}%`,Icon:Send,         color:'text-blue-600 dark:text-blue-400'   },
        ].map(s => {
          const { Icon } = s
          return (
            <div key={s.label} className="glass-card rounded-xl p-2.5 text-center">
              <p className={`text-lg font-display font-black ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label:'Total Sent',    value:total,      Icon:Send,        color:'text-slate-700 dark:text-slate-200',      bg:'bg-slate-50 dark:bg-navy-800/60'         },
          { label:'Delivered',     value:delivered,  Icon:CheckCircle, color:'text-emerald-600 dark:text-emerald-400', bg:'bg-emerald-50 dark:bg-emerald-900/10'    },
          { label:'Failed',        value:failed,     Icon:XCircle,     color:'text-red-600 dark:text-red-400',           bg:'bg-red-50 dark:bg-red-900/10'            },
          { label:'Delivery Rate', value:`${rate}%`, Icon:Clock,       color:'text-blue-600 dark:text-blue-400',         bg:'bg-blue-50 dark:bg-blue-900/10'          },
        ].map(s => {
          const { Icon } = s
          return (
            <div key={s.label} className={`${s.bg} glass-card rounded-xl p-3 text-center`}>
              <p className={`text-2xl font-display font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{s.label}</p>
            </div>
          )
        })}
      </div>

      {/* Channel breakdown */}
      {analytics.length > 0 && (
        <div className="glass-card rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">By Channel</p>
          {analytics.map(a => {
            const cfg = CHANNEL_CFG[a.channel] || { label:a.channel, icon:'📨', color:'text-slate-500' }
            const pct = a.total > 0 ? Math.round(((a.delivered||0) / a.total) * 100) : 0
            return (
              <div key={a.channel}>
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <span className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className="text-slate-400">{a.delivered||0}/{a.total} ({pct}%)</span>
                </div>
                <div className="h-1 bg-slate-100 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full" style={{width:`${pct}%`}}/>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
