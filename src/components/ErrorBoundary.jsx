// ─── Global Error Boundary ────────────────────────────────────
// Catches runtime crashes and shows a friendly screen.
// Wrap in App.jsx around the Router.

import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Log to console in development only
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-navy-950 p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={28} className="text-red-600 dark:text-red-400" />
            </div>
            <h2 className="font-display font-black text-slate-800 dark:text-white text-xl mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              {import.meta.env.DEV
                ? this.state.error?.message || 'Unknown error'
                : 'An unexpected error occurred. Please reload and try again.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy-900 dark:bg-blue-700 text-white font-bold text-sm hover:opacity-90 transition-opacity"
            >
              <RefreshCw size={14} /> Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}