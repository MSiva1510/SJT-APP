import { useState, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { Eye, EyeOff, LogIn, AlertCircle, Lock, Mail, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useApp }  from '../context/AppContext'
import { BIZ }     from '../config/business'

export default function Login() {
  const { login, authLoading, loginError, setLoginError, user, sendPasswordReset } = useAuth()
  const { darkMode, setDarkMode } = useApp()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname || '/'

  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [forgotMode,  setForgotMode]  = useState(false)
  const [resetSent,   setResetSent]   = useState(false)
  const [resetLoading,setResetLoading]= useState(false)

  // Redirect already-logged-in users
  useEffect(() => {
    if (user) {
      const dest = user.role === 'driver' ? '/driver' : (from === '/login' ? '/' : from)
      navigate(dest, { replace: true })
    }
  }, [user, navigate, from])

  // ── Login submit ──────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    const loggedInUser = await login({ email: email.trim().toLowerCase(), password })
    if (loggedInUser) {
      const dest = loggedInUser.role === 'driver' ? '/driver' : (from === '/login' ? '/' : from)
      navigate(dest, { replace: true })
    }
  }

  // ── Forgot password submit ─────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    if (!email.trim()) { setLoginError('Enter your email address first.'); return }
    setResetLoading(true)
    setLoginError('')
    try {
      await sendPasswordReset(email.trim().toLowerCase())
      setResetSent(true)
    } catch (err) {
      setLoginError('Could not send reset email. Check the address and try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const inputCls = `
    w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-navy-700
    bg-white dark:bg-navy-800/60 text-slate-800 dark:text-slate-100
    placeholder-slate-300 dark:placeholder-slate-600 text-sm
    focus:outline-none focus:ring-2 focus:ring-navy-500/30 focus:border-navy-400
    dark:focus:border-blue-500 transition-all`

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-navy-950 overflow-hidden">

      {/* ── Left branding panel (desktop only) ─────────────── */}
      <div
        className="hidden lg:flex lg:w-[46%] xl:w-[52%] relative flex-col justify-between p-10 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #080f2a 0%, #0d1b4b 50%, #152a7a 100%)' }}
      >
        {/* Decorative orbs */}
        <div className="absolute top-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-20"
             style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
        <div className="absolute bottom-[-60px] right-[-60px] w-64 h-64 rounded-full opacity-15"
             style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }} />
        <div className="absolute inset-0 opacity-[0.03]"
             style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden p-1.5">
            <img src={BIZ.logo} alt="SJT" className="w-full h-full object-contain"
              onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML='<span class="text-white font-black text-sm">SJT</span>' }} />
          </div>
          <div>
            <p className="text-white font-display font-black text-base tracking-wide leading-tight">SRI JAYAM TRAVELS</p>
            <p className="text-white/40 text-xs tracking-widest">PUDUCHERRY</p>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-1.5 text-xs text-white/70 font-semibold mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            Fleet Management System
          </div>
          <h1 className="text-4xl xl:text-5xl font-display font-black text-white leading-[1.1] mb-4">
            Your Fleet,<br />
            <span className="text-gradient">Managed Smart.</span>
          </h1>
          <p className="text-white/50 text-base leading-relaxed max-w-sm">
            Invoices, trip tracking, driver pay slips and expense reports — all in one place for Sri Jayam Travels.
          </p>
        </div>

        {/* Stats */}
        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { label: 'Active vehicles', value: '3' },
            { label: 'Active drivers',  value: '3' },
            { label: 'Trips this FY',   value: '38+' },
          ].map(s => (
            <div key={s.label} className="bg-white/6 border border-white/10 rounded-2xl p-4">
              <p className="text-2xl font-display font-black text-white">{s.value}</p>
              <p className="text-white/40 text-xs mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right login panel ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-center items-center px-5 sm:px-10 py-10 relative">

        {/* Dark mode toggle */}
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="absolute top-5 right-5 w-9 h-9 rounded-xl border border-slate-200 dark:border-navy-700 bg-white/70 dark:bg-navy-800/70 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-700 transition-all"
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode
            ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          }
        </button>

        <div className="w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-navy-900 flex items-center justify-center overflow-hidden p-1">
              <img src={BIZ.logo} alt="SJT" className="w-full h-full object-contain"
                onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML='<span class="text-white font-black text-xs">SJT</span>' }} />
            </div>
            <div>
              <p className="font-display font-black text-slate-800 dark:text-white text-sm leading-tight">SRI JAYAM TRAVELS</p>
              <p className="text-slate-400 dark:text-slate-500 text-[10px] tracking-widest">PUDUCHERRY</p>
            </div>
          </div>

          {/* ── Forgot password mode ──────────────────────────── */}
          {forgotMode ? (
            <>
              <div className="mb-7">
                <h2 className="text-2xl font-display font-black text-slate-800 dark:text-white">Reset Password</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
                  Enter your account email. We'll send a reset link.
                </p>
              </div>

              {resetSent ? (
                <div className="flex flex-col items-center gap-4 py-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="text-emerald-600 dark:text-emerald-400" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white">Reset link sent</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Check your inbox at <strong>{email}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => { setForgotMode(false); setResetSent(false); setLoginError('') }}
                    className="text-sm text-navy-600 dark:text-blue-400 font-semibold hover:underline"
                  >
                    ← Back to login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  {loginError && (
                    <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-800/60 rounded-xl px-4 py-3">
                      <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-red-700 dark:text-red-400 text-sm font-medium">{loginError}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Email</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        placeholder="your@email.com" required autoFocus
                        className={inputCls} />
                    </div>
                  </div>
                  <button type="submit" disabled={resetLoading}
                    className="w-full py-3.5 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-blue-700 dark:hover:bg-blue-600 text-white font-bold text-sm transition-all shadow-lg disabled:opacity-60">
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                  <button type="button" onClick={() => { setForgotMode(false); setLoginError('') }}
                    className="w-full text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 py-1 transition-colors">
                    ← Back to login
                  </button>
                </form>
              )}
            </>
          ) : (
            /* ── Normal login mode ──────────────────────────────── */
            <>
              <div className="mb-7">
                <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-800 dark:text-white">
                  Welcome back
                </h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1.5">
                  Sign in to your Sri Jayam Travels account
                </p>
              </div>

              {loginError && (
                <div className="flex items-start gap-2.5 bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-800/60 rounded-xl px-4 py-3 mb-5">
                  <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-700 dark:text-red-400 text-sm font-medium">{loginError}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setLoginError('') }}
                      placeholder="you@jayamtravels.in"
                      autoComplete="email"
                      required
                      className={inputCls}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Password
                  </label>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setLoginError('') }}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className={`${inputCls} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Forgot password link */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setLoginError('') }}
                    className="text-xs text-navy-600 dark:text-blue-400 font-semibold hover:underline transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl
                             bg-navy-900 hover:bg-navy-800 dark:bg-blue-700 dark:hover:bg-blue-600
                             text-white font-bold text-sm transition-all duration-200
                             shadow-lg hover:shadow-xl active:scale-[0.98]
                             disabled:opacity-60 disabled:cursor-not-allowed
                             focus:outline-none focus:ring-2 focus:ring-navy-500/40"
                >
                  {authLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z"/>
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    <>
                      <LogIn size={16} />
                      Sign In
                      <ChevronRight size={14} className="opacity-60" />
                    </>
                  )}
                </button>
              </form>

              <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
                Contact your Administrator if you need access.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
