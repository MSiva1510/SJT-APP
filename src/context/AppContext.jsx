// ─── AppContext — sidebar state + dark mode (persisted) ───────
import { createContext, useContext, useState, useEffect } from 'react'

const THEME_KEY = 'sjt-theme'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  // ── Dark mode — read from localStorage on first render ──────
  const [darkMode, setDarkMode] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY)
      if (stored !== null) return stored === 'dark'
      // Fall back to OS preference if no stored value
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
    } catch { return false }
  })

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed,   setCollapsed]   = useState(false)

  // ── Sync dark class + persist on every change ────────────────
  useEffect(() => {
    const root = document.documentElement
    if (darkMode) { root.classList.add('dark') }
    else          { root.classList.remove('dark') }
    try { localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light') } catch {}
  }, [darkMode])

  // ── Close mobile sidebar on desktop resize ───────────────────
  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 1024) setSidebarOpen(false) }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      sidebarOpen, setSidebarOpen,
      collapsed,   setCollapsed,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
