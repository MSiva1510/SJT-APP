import React, { lazy, Suspense, useEffect } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppProvider }           from './context/AppContext'
import { AuthProvider }          from './context/AuthContext'
import { RideLifecycleProvider } from './context/RideLifecycleContext'
import { CommunicationProvider } from './context/CommunicationContext'
import { AdminProvider }         from './context/AdminContext'
import { GpsHistoryProvider }    from './context/GpsHistoryContext'
import { loadAllVehicleStatuses } from './data/vehicleStatusData'
import AppShell                  from './components/layout/AppShell'
import ProtectedRoute            from './components/auth/ProtectedRoute'

// Public
const Login             = lazy(() => import('./pages/Login'))
const Unauthorized      = lazy(() => import('./pages/Unauthorized'))
const PublicBooking     = lazy(() => import('./pages/PublicBooking'))

// Admin + Manager pages
const Dashboard         = lazy(() => import('./pages/Dashboard'))
const Invoices          = lazy(() => import('./pages/Invoices'))
const Trips             = lazy(() => import('./pages/Trips'))
const CreateTrip        = lazy(() => import('./pages/CreateTrip'))
const Customers         = lazy(() => import('./pages/Customers'))
const Expenses          = lazy(() => import('./pages/Expenses'))
const Drivers           = lazy(() => import('./pages/Drivers'))
const Vehicles          = lazy(() => import('./pages/Vehicles'))
const Settings          = lazy(() => import('./pages/Settings'))
const UserManagement    = lazy(() => import('./pages/admin/UserManagement'))
const RoleManager       = lazy(() => import('./pages/admin/RoleManager'))
const SystemHealth      = lazy(() => import('./pages/admin/SystemHealth'))
const BackupManager     = lazy(() => import('./pages/admin/BackupManager'))
const SecuritySettings  = lazy(() => import('./pages/admin/SecuritySettings'))
const DatabaseStatus    = lazy(() => import('./pages/admin/DatabaseStatus'))
const Attendance        = lazy(() => import('./pages/Attendance'))
const Profile           = lazy(() => import('./pages/Profile'))
const Payroll           = lazy(() => import('./pages/Payroll'))
const Reports           = lazy(() => import('./pages/Reports'))
const Documents         = lazy(() => import('./pages/Documents'))
const AuditLog          = lazy(() => import('./pages/AuditLog'))
const Communications    = lazy(() => import('./pages/Communications'))
const CommunicationSettings = lazy(() => import('./pages/CommunicationSettings'))
const Fleet             = lazy(() => import('./pages/Fleet'))
const FleetSettings     = lazy(() => import('./pages/FleetSettings'))
const GpsHistory        = lazy(() => import('./pages/GpsHistory'))
const RouteReplay       = lazy(() => import('./pages/RouteReplay'))
const FleetAnalytics    = lazy(() => import('./pages/FleetAnalytics'))
import { FleetAnalyticsProvider } from './context/FleetAnalyticsContext'

// Driver pages
const DriverDashboard   = lazy(() => import('./pages/driver/DriverDashboard'))
const AssignedTrips     = lazy(() => import('./pages/driver/AssignedTrips'))
const RideHistory       = lazy(() => import('./pages/driver/RideHistory'))
const DriverProfile     = lazy(() => import('./pages/driver/DriverProfile'))
const LiveLocation      = lazy(() => import('./pages/driver/LiveLocation'))

// Layout route: one RideLifecycleProvider shared across ALL driver pages.
// Previously each route mounted its own provider, resetting the timer on navigation.
function DriverLayout() {
  return (
    <ProtectedRoute allowedRoles={['driver']}>
      <RideLifecycleProvider>
        <Outlet />
      </RideLifecycleProvider>
    </ProtectedRoute>
  )
}

export default function App() {
  // Load vehicle statuses on app startup to populate the cache
  useEffect(() => {
    loadAllVehicleStatuses().catch(err => {
      console.warn('Failed to load vehicle statuses:', err);
    });
  }, []);

  return (
    <ErrorBoundary>
    <AppProvider>
      <AuthProvider>
        {/* CommunicationProvider and AdminProvider are only needed by admin/manager.
            Wrap them inside Routes so drivers don’t pay the loading cost. */}
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading…</div>}>
          <Routes>
            {/* Public */}
            <Route path="/login"        element={<Login />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/book"         element={<PublicBooking />} />

            {/* Protected shell */}
            <Route element={<ProtectedRoute><CommunicationProvider><AdminProvider><GpsHistoryProvider><AppShell /></GpsHistoryProvider></AdminProvider></CommunicationProvider></ProtectedRoute>}>
              {/* Admin + Manager */}
              <Route path="/"            element={<ProtectedRoute allowedRoles={['admin','manager']}><Dashboard /></ProtectedRoute>} />
              <Route path="/invoices"    element={<ProtectedRoute allowedRoles={['admin']}><Invoices /></ProtectedRoute>} />
              <Route path="/trips"       element={<ProtectedRoute allowedRoles={['admin','manager']}><Trips /></ProtectedRoute>} />
              <Route path="/create-trip" element={<ProtectedRoute allowedRoles={['admin','manager']}><CreateTrip /></ProtectedRoute>} />
              <Route path="/customers"   element={<ProtectedRoute allowedRoles={['admin','manager']}><Customers /></ProtectedRoute>} />
              <Route path="/expenses"    element={<ProtectedRoute allowedRoles={['admin','manager']}><Expenses /></ProtectedRoute>} />
              <Route path="/drivers"     element={<ProtectedRoute allowedRoles={['admin','manager']}><Drivers /></ProtectedRoute>} />
              <Route path="/vehicles"    element={<ProtectedRoute allowedRoles={['admin','manager']}><Vehicles /></ProtectedRoute>} />
              <Route path="/settings"    element={<ProtectedRoute allowedRoles={['admin']}><Settings /></ProtectedRoute>} />
              {/* Fix 2: /attendance locked to admin + manager only */}
              <Route path="/attendance"  element={<ProtectedRoute allowedRoles={['admin','manager']}><Attendance /></ProtectedRoute>} />
              <Route path="/profile"     element={<ProtectedRoute allowedRoles={['admin','manager']}><Profile /></ProtectedRoute>} />
              <Route path="/documents"              element={<ProtectedRoute allowedRoles={['admin','manager']}><Documents /></ProtectedRoute>} />
              <Route path="/communications"          element={<ProtectedRoute allowedRoles={['admin','manager']}><Communications /></ProtectedRoute>} />
              <Route path="/communications-settings" element={<ProtectedRoute allowedRoles={['admin','manager']}><CommunicationSettings /></ProtectedRoute>} />
              <Route path="/payroll"                 element={<ProtectedRoute allowedRoles={['admin','manager']}><Payroll /></ProtectedRoute>} />
              <Route path="/reports"                 element={<ProtectedRoute allowedRoles={['admin']}><Reports /></ProtectedRoute>} />
              <Route path="/audit-log"               element={<ProtectedRoute allowedRoles={['admin']}><AuditLog /></ProtectedRoute>} />
              {/* Day 32: GPS / Live Fleet */}
              <Route path="/fleet"                   element={<ProtectedRoute allowedRoles={['admin','manager']}><Fleet /></ProtectedRoute>} />
              <Route path="/fleet/settings"          element={<ProtectedRoute allowedRoles={['admin']}><FleetSettings /></ProtectedRoute>} />
              {/* Day 33: GPS History + Route Replay */}
              <Route path="/gps-history"        element={<ProtectedRoute allowedRoles={['admin','manager']}><GpsHistory /></ProtectedRoute>} />
              <Route path="/gps-history/replay" element={<ProtectedRoute allowedRoles={['admin','manager']}><RouteReplay /></ProtectedRoute>} />
              {/* Day 36: Fleet Analytics */}
              <Route path="/fleet-analytics"    element={<ProtectedRoute allowedRoles={['admin','manager']}><FleetAnalyticsProvider><FleetAnalytics /></FleetAnalyticsProvider></ProtectedRoute>} />
              <Route path="/admin/database-status" element={<ProtectedRoute allowedRoles={['admin']}><DatabaseStatus /></ProtectedRoute>} />
              <Route path="/admin/users"           element={<ProtectedRoute allowedRoles={['admin','manager']}><UserManagement /></ProtectedRoute>} />
              <Route path="/admin/roles"           element={<ProtectedRoute allowedRoles={['admin']}><RoleManager /></ProtectedRoute>} />
              <Route path="/admin/health"          element={<ProtectedRoute allowedRoles={['admin']}><SystemHealth /></ProtectedRoute>} />
              <Route path="/admin/backup"          element={<ProtectedRoute allowedRoles={['admin']}><BackupManager /></ProtectedRoute>} />
              <Route path="/admin/security"        element={<ProtectedRoute allowedRoles={['admin']}><SecuritySettings /></ProtectedRoute>} />

              {/* Driver — single RideLifecycleProvider via DriverLayout */}
              <Route element={<DriverLayout />}>
                <Route path="/driver"         element={<DriverDashboard />} />
                <Route path="/assigned-trips" element={<AssignedTrips />}   />
                <Route path="/ride-history"   element={<RideHistory />}     />
                <Route path="/driver-profile" element={<DriverProfile />}   />
                <Route path="/live-location"  element={<LiveLocation />}    />
                <Route path="/payslips"       element={<Payroll />}         />
              </Route>

              {/* Legacy */}
              <Route path="/my-trips" element={<Navigate to="/driver" replace />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </AppProvider>
    </ErrorBoundary>
  )
}