// ─── Route Replay Page ────────────────────────────────────────
// Day 33: Loads GPS track, processes it, and plays it back on map.
// URL: /gps-history/replay?vehicleId=xxx&since=...&until=...
//
// Architecture:
//   Page → gpsHistoryRepository.getReplay() → gpsReplayService.processReplayData()
//   Playback: useRef(interval) advancing currentIndex on a ticker

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useSearchParams, Link }  from 'react-router-dom'
import { ArrowLeft, AlertCircle, Loader2, MapPin } from 'lucide-react'
import PageHeader            from '../components/ui/PageHeader'
import ReplayMap             from '../components/gps/ReplayMap'
import ReplayControls        from '../components/gps/ReplayControls'
import TripStats             from '../components/gps/TripStats'
import VehicleTimeline       from '../components/gps/VehicleTimeline'
import { gpsHistoryRepository }  from '../repositories/gpsHistoryRepository'
import { loadVehicles }          from '../data/vehicleData'
import { processReplayData, REPLAY_INTERVAL_MS } from '../services/gpsReplayService'
import { useApp } from '../context/AppContext'

export default function RouteReplay() {
  const [params]    = useSearchParams()
  const { darkMode } = useApp()

  const vehicleId = params.get('vehicleId') ?? ''
  const since     = params.get('since')     ?? ''
  const until     = params.get('until')     ?? ''

  // Data
  const [points,    setPoints]   = useState([])
  const [replayData, setReplayData] = useState(null)  // { segments, stops, stats, coloredPath }
  const [loading,   setLoading]  = useState(false)
  const [error,     setError]    = useState(null)
  const [regLabel,  setRegLabel] = useState(vehicleId)

  // Playback state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [playing,      setPlaying]      = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const intervalRef = useRef(null)

  // ── Load GPS track ─────────────────────────────────────────
  useEffect(() => {
    if (!vehicleId) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true); setError(null); setPlaying(false); setCurrentIndex(0)
        const [pts, vehicles] = await Promise.all([
          gpsHistoryRepository.getReplay(vehicleId, since || undefined, until || undefined),
          loadVehicles(),
        ])
        if (cancelled) return
        const label = vehicles?.find(v => v.id === vehicleId)?.registration ?? vehicleId
        setRegLabel(label)

        if (!pts?.length) {
          setPoints([]); setReplayData(null)
          setError('No GPS data found for this vehicle and date range. Try a different date or run a sync.')
          return
        }
        const processed = processReplayData(pts)
        setPoints(pts)
        setReplayData(processed)
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'Failed to load replay data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [vehicleId, since, until])

  // ── Playback ticker ───────────────────────────────────────
  const stopInterval = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
  }, [])

  const startInterval = useCallback(() => {
    stopInterval()
    if (!points.length) return
    intervalRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        const next = prev + 1
        if (next >= points.length) { stopInterval(); setPlaying(false); return points.length - 1 }
        return next
      })
    }, Math.round(REPLAY_INTERVAL_MS / speed))
  }, [points.length, speed, stopInterval])

  // Restart interval when speed changes while playing
  useEffect(() => {
    if (playing) startInterval()
  }, [speed])  // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up on unmount
  useEffect(() => () => stopInterval(), [stopInterval])

  const handlePlay = useCallback(() => {
    if (!points.length) return
    if (currentIndex >= points.length - 1) setCurrentIndex(0)
    setPlaying(true); startInterval()
  }, [points.length, currentIndex, startInterval])

  const handlePause = useCallback(() => { setPlaying(false); stopInterval() }, [stopInterval])

  const handleStop = useCallback(() => {
    setPlaying(false); stopInterval(); setCurrentIndex(0)
  }, [stopInterval])

  const handleSeek = useCallback((idx) => {
    const clamped = Math.max(0, Math.min(idx, points.length - 1))
    setCurrentIndex(clamped)
    if (playing) startInterval()   // restart from new position
  }, [points.length, playing, startInterval])

  const handleSpeedChange = useCallback((v) => setSpeed(v), [])

  // ── Derived ───────────────────────────────────────────────
  const currentPoint = points[currentIndex] ?? null

  const dateLabel = useMemo(() => {
    if (since) return new Date(since).toLocaleDateString('en-IN', { dateStyle: 'long' })
    return 'All time'
  }, [since])

  // ── Render ────────────────────────────────────────────────
  if (!vehicleId) return (
    <div className="space-y-5 animate-fade-up">
      <PageHeader title="Route Replay" subtitle="Select a vehicle and date from GPS History" />
      <div className="glass-card rounded-2xl p-10 text-center">
        <MapPin size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">No vehicle selected.</p>
        <Link to="/gps-history" className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          <ArrowLeft size={14} /> Go to GPS History
        </Link>
      </div>
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-up">
      <PageHeader
        title="Route Replay"
        subtitle={`${regLabel} · ${dateLabel}`}
        action={
          <Link to="/gps-history"
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-navy-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors">
            <ArrowLeft size={14} /> Back to History
          </Link>
        }
      />

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-2xl p-10 text-center">
          <Loader2 size={28} className="mx-auto text-blue-600 animate-spin mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading GPS track…</p>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="glass-card rounded-2xl p-5 border-l-4 border-red-500 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">No data</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{error}</p>
            <Link to="/gps-history" className="text-xs text-blue-600 hover:underline mt-1 inline-block">← GPS History</Link>
          </div>
        </div>
      )}

      {/* Main layout */}
      {!loading && !error && points.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Map */}
          <div className="xl:col-span-2">
            <ReplayMap
              points={points}
              currentIndex={currentIndex}
              coloredPath={replayData?.coloredPath ?? []}
              darkMode={darkMode}
            />
          </div>

          {/* Right sidebar: controls + stats + timeline */}
          <div className="space-y-4">
            <ReplayControls
              playing={playing}
              speed={speed}
              currentIndex={currentIndex}
              total={points.length}
              currentPoint={currentPoint}
              onPlay={handlePlay}
              onPause={handlePause}
              onStop={handleStop}
              onSeek={handleSeek}
              onSpeedChange={handleSpeedChange}
            />
            <TripStats stats={replayData?.stats} />
            <VehicleTimeline
              segments={replayData?.segments ?? []}
              stops={replayData?.stops ?? []}
              points={points}
              currentIndex={currentIndex}
              onSeek={handleSeek}
            />
          </div>
        </div>
      )}
    </div>
  )
}
