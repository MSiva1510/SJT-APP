// ─── Communication Context ───────────────────────────────────
// React context providing communication engine state to all pages.

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useAuth }          from './AuthContext'
import { eventBus }         from '../communication/EventBus'
import { communicationEngine } from '../communication/CommunicationEngine'
import {
  getCommunicationLogs, getCommunicationStats,
  getNotificationPreferences, saveNotificationPreferences,
  getProviders, getEngineStats, getScheduledJobs,
} from '../services/communicationService'
import {
  loadNotifications, markRead, markAllRead,
  archiveNotification, dismissNotification,
} from '../services/notificationService'

const CommunicationContext = createContext(null)

export function CommunicationProvider({ children }) {
  const { user } = useAuth()

  // ── In-app notifications ──────────────────────────────────
  const [notifications,     setNotifications]     = useState([])
  const [unreadCount,        setUnreadCount]        = useState(0)
  const [notifLoading,       setNotifLoading]       = useState(false)

  // ── Communication logs ────────────────────────────────────
  const [commLogs,           setCommLogs]           = useState([])
  const [logsTotal,          setLogsTotal]           = useState(0)
  const [logsLoading,        setLogsLoading]         = useState(false)

  // ── Analytics / stats ─────────────────────────────────────
  const [analytics,          setAnalytics]           = useState([])
  const [engineStats,        setEngineStats]         = useState({})
  const [queueStats,         setQueueStats]          = useState({})

  // ── Preferences ───────────────────────────────────────────
  const [preferences,        setPreferences]         = useState(null)
  const [prefLoading,        setPrefLoading]         = useState(false)

  // ── Providers ─────────────────────────────────────────────
  const [providers,          setProviders]           = useState([])

  // ── Scheduled jobs ────────────────────────────────────────
  const [scheduledJobs,      setScheduledJobs]       = useState([])

  // ── Realtime subscription ref ─────────────────────────────
  const realtimeSub = useRef(null)

  // ── Load in-app notifications ─────────────────────────────
  const loadNotifs = useCallback(async () => {
    if (!user?.id) return
    setNotifLoading(true)
    try {
      const data = await loadNotifications(user.id, { limit: 60 })
      setNotifications(data)
      setUnreadCount(data.filter(n => n.status === 'unread').length)
    } catch {}
    setNotifLoading(false)
  }, [user?.id])

  // ── Load communication logs ───────────────────────────────
  const loadLogs = useCallback(async (filters = {}) => {
    setLogsLoading(true)
    try {
      const { data, count } = await getCommunicationLogs({ limit: 50, ...filters })
      setCommLogs(data)
      setLogsTotal(count)
    } catch {}
    setLogsLoading(false)
  }, [])

  // ── Load analytics ────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    try {
      const [stats, es] = await Promise.allSettled([
        getCommunicationStats(),
        Promise.resolve(getEngineStats()),
      ])
      setAnalytics(stats.status === 'fulfilled' ? stats.value : [])
      setEngineStats(es.status === 'fulfilled' ? es.value : {})
    } catch {}
  }, [])

  // ── Load preferences ──────────────────────────────────────
  const loadPreferences = useCallback(async () => {
    if (!user?.id) return
    setPrefLoading(true)
    try {
      const prefs = await getNotificationPreferences(user.id)
      setPreferences(prefs)
    } catch {}
    setPrefLoading(false)
  }, [user?.id])

  // ── Load providers ────────────────────────────────────────
  const loadProviders = useCallback(async () => {
    try {
      const data = await getProviders()
      setProviders(data)
    } catch {}
  }, [])

  // ── On mount / user change ────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    communicationEngine.loadPreferences(user.id)
    loadNotifs()
    loadPreferences()
    loadAnalytics()
    loadProviders()
    setScheduledJobs(getScheduledJobs())

    // Subscribe to EventBus for realtime unread count updates
    const unsub = eventBus.on('*', () => {
      // Refresh unread badge on any event
      loadNotifs()
    })

    return () => {
      unsub()
      if (realtimeSub.current?.unsubscribe) realtimeSub.current.unsubscribe()
    }
  }, [user?.id, loadNotifs, loadPreferences, loadAnalytics, loadProviders])

  // ── Notification actions ──────────────────────────────────
  const doMarkRead = useCallback(async (id) => {
    await markRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status:'read', is_read:true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }, [])

  const doMarkAllRead = useCallback(async () => {
    await markAllRead(user?.id)
    setNotifications(prev => prev.map(n => n.status === 'unread' ? { ...n, status:'read', is_read:true } : n))
    setUnreadCount(0)
  }, [user?.id])

  const doArchive = useCallback(async (id) => {
    await archiveNotification(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status:'archived' } : n))
  }, [])

  const doDismiss = useCallback(async (id) => {
    await dismissNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  // ── Preference save ───────────────────────────────────────
  const updatePreferences = useCallback(async (prefs) => {
    setPreferences(prev => ({ ...prev, ...prefs }))
    await saveNotificationPreferences(user?.id, prefs)
  }, [user?.id])

  const value = {
    // Notifications
    notifications,
    unreadCount,
    notifLoading,
    loadNotifs,
    markRead:    doMarkRead,
    markAllRead: doMarkAllRead,
    archive:     doArchive,
    dismiss:     doDismiss,
    // Logs
    commLogs, logsTotal, logsLoading, loadLogs,
    // Analytics
    analytics, engineStats, queueStats, loadAnalytics,
    // Preferences
    preferences, prefLoading, updatePreferences, loadPreferences,
    // Providers
    providers, loadProviders,
    // Schedule
    scheduledJobs, setScheduledJobs,
  }

  return (
    <CommunicationContext.Provider value={value}>
      {children}
    </CommunicationContext.Provider>
  )
}

export function useCommunication() {
  const ctx = useContext(CommunicationContext)
  if (!ctx) throw new Error('useCommunication must be used inside CommunicationProvider')
  return ctx
}

export default CommunicationContext
