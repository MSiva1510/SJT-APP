// ─── RideLifecycleContext ─────────────────────────────────────
// Wraps useRideLifecycle in React context so the active ride state
// is shared across all driver pages without prop-drilling.
//
// Usage:
//   const { activeRide, startRide, pauseRide, resumeRide, endRide, elapsedFmt, ... } = useRideLifecycleContext()

import { createContext, useContext } from 'react'
import { useRideLifecycle } from '../hooks/useRideLifecycle'

const RideLifecycleContext = createContext(null)

export function RideLifecycleProvider({ children }) {
  const lifecycle = useRideLifecycle()
  return (
    <RideLifecycleContext.Provider value={lifecycle}>
      {children}
    </RideLifecycleContext.Provider>
  )
}

export function useRideLifecycleContext() {
  const ctx = useContext(RideLifecycleContext)
  if (!ctx) throw new Error('useRideLifecycleContext must be used within RideLifecycleProvider')
  return ctx
}
