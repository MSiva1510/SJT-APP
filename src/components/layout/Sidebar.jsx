import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users, Receipt,
  User, Car, Settings, ChevronLeft, ChevronRight,
  MapPin, Phone, Globe, LogOut, Navigation,
  History, List, Route, Signal, CalendarCheck, IndianRupee, BarChart2, Database, UserCog, TrendingUp,
  FolderOpen, ClipboardList, MessageSquare,
  Shield, HardDrive, Activity, Lock,
} from 'lucide-react'
import { useApp }  from '../../context/AppContext'
import { useAuth, ROLE_LABELS, ROLE_COLORS } from '../../context/AuthContext'
import { BIZ }     from '../../config/business'
import Avatar      from '../ui/Avatar'

// Fix 3: Nav items with granular role + permission guards
const NAV_ITEMS = [
  // Admin + Manager
  { to: '/',               label: 'Dashboard',    icon: LayoutDashboard, roles: ['admin','manager'] },
  { to: '/invoices',       label: 'Invoices',      icon: FileText,        roles: ['admin'],           perm: 'invoices' },
  { to: '/trips',          label: 'Trips',         icon: Route,           roles: ['admin','manager'], perm: 'trips'    },
  { to: '/customers',      label: 'Customers',     icon: Users,           roles: ['admin','manager'], perm: 'customers'},
  { to: '/expenses',       label: 'Expenses',      icon: Receipt,         roles: ['admin','manager'], perm: 'expenses' },
  { to: '/drivers',        label: 'Drivers',       icon: User,            roles: ['admin','manager'], perm: 'drivers'  },
  { to: '/vehicles',       label: 'Vehicles',      icon: Car,             roles: ['admin','manager'], perm: 'vehicles' },
  { to: '/attendance',     label: 'Attendance',    icon: CalendarCheck,   roles: ['admin','manager'], perm: 'attendance'},
  { to: '/documents',      label: 'Documents',     icon: FolderOpen,      roles: ['admin','manager'], perm: 'reports'   },
  { to: '/payroll',        label: 'Payroll',       icon: IndianRupee,     roles: ['admin','manager'], perm: 'payroll'   },
  { to: '/communications', label: 'Communications', icon: MessageSquare,  roles: ['admin','manager'], perm: 'reports'   },
  { to: '/reports',        label: 'Reports',        icon: BarChart2,       roles: ['admin'], perm: 'reports'   },
  { to: '/audit-log',      label: 'Audit Log',      icon: ClipboardList,   roles: ['admin'], perm: 'reports'   },
  // Day 32: Live Fleet Dashboard
  { to: '/fleet',          label: 'Live Fleet',     icon: Navigation,      roles: ['admin','manager'], perm: 'view_fleet' },
  // Day 33: GPS History + Route Replay
  { to: '/gps-history',      label: 'GPS History',    icon: History,      roles: ['admin','manager'], perm: 'view_fleet' },
  // Day 36: Fleet Analytics
  { to: '/fleet-analytics',  label: 'Fleet Analytics',icon: TrendingUp,   roles: ['admin','manager'], perm: 'view_fleet' },
  // Driver
  { to: '/driver',         label: 'Home',          icon: LayoutDashboard, roles: ['driver'] },
  { to: '/assigned-trips', label: 'Trips Today',   icon: List,            roles: ['driver'] },
  { to: '/live-location',  label: 'Live Location', icon: Signal,          roles: ['driver'] },
  { to: '/ride-history',   label: 'Ride History',  icon: History,         roles: ['driver'] },
  { to: '/payslips',       label: 'My Payslips',   icon: IndianRupee,     roles: ['driver'] },
  { to: '/driver-profile', label: 'My Profile',    icon: User,            roles: ['driver'] },
]

const BOTTOM_ITEMS = [
  { to: '/admin/users',           label: 'User Accounts',   icon: UserCog,  roles: ['admin','manager'] },
  { to: '/admin/roles',           label: 'Roles & Perms',   icon: Shield,   roles: ['admin'] },
  { to: '/admin/security',        label: 'Security',         icon: Lock,     roles: ['admin'] },
  { to: '/admin/health',          label: 'System Health',    icon: Activity, roles: ['admin'] },
  { to: '/admin/backup',          label: 'Backup Manager',   icon: HardDrive,roles: ['admin'] },
  { to: '/admin/database-status', label: 'Database Status',  icon: Database, roles: ['admin'] },
  // Day 32: GPS provider configuration
  { to: '/fleet/settings',        label: 'GPS Settings',     icon: Navigation, roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
]

function NavItem({ to, label, icon: Icon, collapsed }) {
  const location = useLocation()
  const isActive = to === '/'
    ? location.pathname === '/'
    : location.pathname === to || location.pathname.startsWith(to + '/')

  return (
    <NavLink to={to} title={collapsed ? label : undefined}
      className={`nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}>
      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-blue-400 rounded-r-full" />}
      <Icon size={18} className={`flex-shrink-0 transition-colors ${isActive ? 'text-white' : 'text-white/50 group-hover:text-white'}`} />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />}
    </NavLink>
  )
}

function SidebarInner({ collapsed }) {
  const { setCollapsed }           = useApp()
  const { user, logout, isDriver, can } = useAuth()
  const navigate                   = useNavigate()
  const roleColors                 = user ? ROLE_COLORS[user.role] : null

  const handleLogout = () => { logout(); navigate('/login', { replace: true }) }

  // Filter nav: role match + optional permission check
  const visibleNav    = NAV_ITEMS.filter(i => {
    if (!i.roles.includes(user?.role)) return false
    if (i.perm) return can(i.perm)
    return true
  })
  const visibleBottom = BOTTOM_ITEMS.filter(i => i.roles.includes(user?.role))

  return (
    <div className="flex flex-col h-full relative">
      {/* Brand */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/20">
          <img src={BIZ.logo} alt="SJT" className="w-full h-full object-contain p-0.5"
            onError={e => { e.target.style.display='none'; e.target.parentNode.innerHTML='<span class="text-white font-black text-xs">SJT</span>' }} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-white font-display font-black text-sm leading-tight tracking-wide truncate">SRI JAYAM</p>
            <p className="text-white/40 text-xs truncate tracking-widest">TRAVELS</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
        {!collapsed && (
          <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest px-3 mb-2">
            {isDriver ? 'My Work' : 'Main Menu'}
          </p>
        )}
        {visibleNav.map(item => (
          <NavItem key={item.to + item.label} {...item} collapsed={collapsed} />
        ))}
        {visibleBottom.length > 0 && (
          <>
            {!collapsed && <p className="text-white/25 text-[10px] font-bold uppercase tracking-widest px-3 mt-5 mb-2">System</p>}
            {collapsed && <div className="my-3 border-t border-white/10" />}
            {visibleBottom.map(item => <NavItem key={item.to} {...item} collapsed={collapsed} />)}
          </>
        )}
      </nav>

      {/* Business info footer */}
      {!collapsed && !isDriver && (
        <div className="px-4 py-3 border-t border-white/10 flex-shrink-0">
          <div className="bg-white/6 rounded-xl p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-white/50 text-[11px]"><Phone size={10} className="flex-shrink-0" /><span className="truncate">{BIZ.phone}</span></div>
            <div className="flex items-center gap-2 text-white/50 text-[11px]"><MapPin size={10} className="flex-shrink-0" /><span className="truncate">Puducherry, India</span></div>
            <div className="flex items-center gap-2 text-white/50 text-[11px]"><Globe size={10} className="flex-shrink-0" /><span className="truncate">{BIZ.website}</span></div>
          </div>
        </div>
      )}

      {/* User card + logout */}
      {user && (
        <div className={`px-3 py-3 border-t border-white/10 flex-shrink-0 ${collapsed ? 'flex flex-col items-center gap-2' : ''}`}>
          {!collapsed ? (
            <div className="bg-white/6 rounded-xl p-2.5">
              <div className="flex items-center gap-2.5 mb-2.5">
                <Avatar name={user.name} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold truncate leading-tight">{user.name}</p>
                  <p className="text-white/40 text-[10px] truncate">{user.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${roleColors?.bg} ${roleColors?.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${roleColors?.dot}`} />
                  {ROLE_LABELS[user.role]}
                </span>
                <button onClick={handleLogout}
                  className="flex items-center gap-1.5 text-white/40 hover:text-red-400 text-[11px] font-semibold transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10">
                  <LogOut size={12} /><span>Sign out</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div title={user.name}><Avatar name={user.name} size={32} /></div>
              <button onClick={handleLogout} className="w-8 h-8 rounded-xl flex items-center justify-center text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Sign out">
                <LogOut size={15} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Collapse toggle */}
      <button onClick={() => setCollapsed(c => !c)}
        className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-navy-800 border border-white/20 items-center justify-center text-white/70 hover:text-white hover:bg-navy-700 transition-all z-10 shadow-lg">
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </div>
  )
}

export default function Sidebar() {
  const { collapsed, sidebarOpen, setSidebarOpen } = useApp()
  return (
    <>
      <aside className={`hidden lg:flex flex-col glass-sidebar flex-shrink-0 transition-all duration-300 ease-in-out relative ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}>
        <SidebarInner collapsed={collapsed} />
      </aside>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[260px] glass-sidebar flex flex-col lg:hidden transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarInner collapsed={false} />
      </aside>
    </>
  )
}
