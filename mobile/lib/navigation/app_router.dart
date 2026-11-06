// ─────────────────────────────────────────────────────────────────────────────
// app_router.dart — Day 46
// Added: no-connection route (session valid but offline on startup)
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/auth_state.dart';
import '../models/manager_invoice.dart';
import '../providers/auth_provider.dart';
import '../models/user_profile.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/forgot_password_screen.dart';
import '../screens/auth/unauthorized_screen.dart';
import '../screens/auth/no_connection_screen.dart';
import '../screens/driver/driver_home_screen.dart';
import '../screens/driver/driver_profile_screen.dart';
import '../screens/driver/driver_trips_screen.dart';
import '../screens/driver/trip_details_screen.dart';
import '../screens/driver/trip_map_screen.dart';
import '../screens/driver/driver_documents_screen.dart';
import '../screens/driver/driver_bookings_screen.dart';
import '../screens/driver/booking_details_screen.dart';
import '../screens/driver/notifications_screen.dart';
import '../screens/driver/driver_earnings_screen.dart';
import '../screens/driver/driver_expense_screen.dart';
import '../screens/driver/pre_trip_checklist_screen.dart';
import '../screens/driver/report_vehicle_issue_screen.dart';
import '../screens/driver/sos_emergency_screen.dart';
import '../screens/manager/manager_home_screen.dart';
import '../screens/manager/manager_trips_screen.dart';
import '../screens/manager/manager_fleet_screen.dart';
import '../screens/manager/manager_expenses_screen.dart';
import '../screens/manager/attendance/attendance_calendar_screen.dart';
import '../screens/manager/manager_notifications_screen.dart';
import '../screens/manager/manager_documents_screen.dart';
import '../screens/manager/manager_vehicles_screen.dart';
import '../screens/manager/manager_drivers_screen.dart';
import '../screens/manager/manager_customers_screen.dart';
import '../screens/manager/manager_invoices_screen.dart';
import '../screens/manager/invoices/manager_invoice_editor_screen.dart';
import '../screens/manager/manager_new_booking_screen.dart';
import '../screens/manager/manager_trip_detail_screen.dart';
import '../screens/manager/reports/manager_reports_screen.dart';
import '../screens/manager/manager_more_screen.dart';
import '../widgets/driver/driver_scaffold.dart';
import '../widgets/manager/manager_scaffold.dart';

class AppRoutes {
  AppRoutes._();

  static const login = '/login';
  static const forgotPassword = '/forgot-password';
  static const unauthorized = '/unauthorized';
  static const noConnection = '/no-connection';
  static const driverHome = '/driver';
  static const driverProfile = '/driver/profile';
  static const driverDocuments = '/driver/documents';
  static const driverTrips = '/driver/trips';
  static const driverBookings = '/driver/bookings';
  static const attendance = '/driver/attendance';
  static const attendanceHistory = '/driver/attendance/history';
  static const driverNotifications = '/driver/notifications';
  static const driverCommunication = '/driver/messages';
  static const driverSettings = '/driver/settings';
  static const driverEarnings = '/driver/earnings';
  static const driverExpenses = '/driver/expenses';
  static const reportIssue = '/driver/report-issue';
  static const sosEmergency = '/driver/sos';
  static const managerHome = '/manager';
  static const managerTrips = '/manager/trips';
  static const managerFleet = '/manager/fleet';
  static const managerMore = '/manager/more';
  static const managerNewBooking = '/manager/bookings/new';
  static const managerExpenses = '/manager/expenses';
  static const managerAttendance = '/manager/attendance';
  static const managerAttendanceCalendar = '/manager/attendance/calendar';
  static const managerNotifications = '/manager/notifications';
  static const managerDocuments = '/manager/documents';
  static const managerVehicles = '/manager/vehicles';
  static const managerDrivers = '/manager/drivers';
  static const managerCustomers = '/manager/customers';
  static const managerInvoices = '/manager/invoices';
  static const managerInvoice = '/manager/invoices/:id';
  static const managerInvoiceEditor = '/manager/invoices/:id/edit';
  static const managerWhatsApp = '/manager/whatsapp';
  static const managerWhatsAppChat = '/manager/whatsapp/:driverId';
  static const managerReports = '/manager/reports';

  static String tripDetail(String id) => '/driver/trips/$id';
  static String tripMap(String id) => '/driver/trips/$id/map';
  static String bookingDetail(String id) => '/driver/bookings/$id';
  static String managerTripDetail(String id) => '/manager/trips/$id';
  static String managerInvoiceFor(String id) => '/manager/invoices/$id';
  static String managerInvoiceEditorFor(String id, {bool create = false}) =>
      Uri(
        path: '/manager/invoices/$id/edit',
        queryParameters: {if (create) 'create': 'true'},
      ).toString();
  static String reportIssueFor({String? tripId, String? vehicleReg}) {
    final params = <String, String>{
      if (tripId != null) 'tripId': tripId,
      if (vehicleReg != null) 'vehicleReg': vehicleReg,
    };
    return Uri(path: reportIssue, queryParameters: params).toString();
  }

  static String preTripChecklist(String id) => '/driver/trips/$id/pre-trip';
}

String? roleRedirect(
  UserProfile profile,
  String location, {
  required bool isPublic,
}) {
  if (!profile.isDriver && !profile.isStaff) {
    return location == AppRoutes.unauthorized ? null : AppRoutes.unauthorized;
  }

  final home = profile.isDriver ? AppRoutes.driverHome : AppRoutes.managerHome;
  if (isPublic || location == AppRoutes.unauthorized) return home;

  if (profile.isDriver && location.startsWith('/manager')) return home;
  if (profile.isStaff && location.startsWith('/driver')) return home;
  return null;
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.driverHome,
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final goingTo = state.matchedLocation;
      final isPublic =
          goingTo == AppRoutes.login || goingTo == AppRoutes.forgotPassword;

      return switch (auth) {
        // Still loading — stay put
        AuthInitializing() || AuthLoadingProfile() => null,

        // Authenticated successfully
        AuthAuthenticated(:final profile) => roleRedirect(
          profile,
          goingTo,
          isPublic: isPublic,
        ),

        // No session
        AuthUnauthenticated() ||
        AuthAuthenticating() => isPublic ? null : AppRoutes.login,

        // Error states
        AuthError(:final code) => switch (code) {
          // Session valid but no network — show retry screen, NOT login
          AuthErrorCode.networkUnavailable =>
            goingTo == AppRoutes.noConnection ? null : AppRoutes.noConnection,
          // Wrong role
          AuthErrorCode.unauthorizedRole => AppRoutes.unauthorized,
          // Everything else → login
          _ => isPublic ? null : AppRoutes.login,
        },
      };
    },
    routes: [
      // ── Public ──────────────────────────────────────────────────────────
      GoRoute(
        path: AppRoutes.login,
        name: 'login',
        pageBuilder: (_, __) => const NoTransitionPage(child: LoginScreen()),
      ),
      GoRoute(
        path: AppRoutes.forgotPassword,
        name: 'forgotPassword',
        pageBuilder: (_, __) =>
            const NoTransitionPage(child: ForgotPasswordScreen()),
      ),
      GoRoute(
        path: AppRoutes.unauthorized,
        name: 'unauthorized',
        pageBuilder: (_, __) =>
            const NoTransitionPage(child: UnauthorizedScreen()),
      ),
      GoRoute(
        path: AppRoutes.noConnection,
        name: 'noConnection',
        pageBuilder: (_, __) =>
            const NoTransitionPage(child: NoConnectionScreen()),
      ),

      // ── Driver tabs (bottom nav shell) ──────────────────────────────
      ShellRoute(
        builder: (context, state, child) =>
            DriverTabScaffold(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(
            path: AppRoutes.driverHome,
            name: 'driverHome',
            pageBuilder: (_, __) =>
                const NoTransitionPage(child: DriverHomeScreen()),
          ),
          GoRoute(
            path: AppRoutes.driverTrips,
            name: 'driverTrips',
            pageBuilder: (_, __) =>
                const MaterialPage(child: DriverTripsScreen()),
          ),
          GoRoute(
            path: AppRoutes.driverDocuments,
            name: 'driverDocuments',
            pageBuilder: (_, __) =>
                const MaterialPage(child: DriverDocumentsScreen()),
          ),
          GoRoute(
            path: AppRoutes.driverProfile,
            name: 'driverProfile',
            pageBuilder: (_, __) =>
                const MaterialPage(child: DriverProfileScreen()),
          ),
        ],
      ),
      GoRoute(
        path: '/driver/trips/:id',
        name: 'tripDetail',
        pageBuilder: (_, state) {
          final id = state.pathParameters['id']!;
          return MaterialPage(child: TripDetailsScreen(tripId: id));
        },
        routes: [
          GoRoute(
            path: 'map',
            name: 'tripMap',
            pageBuilder: (_, state) {
              final id = state.pathParameters['id']!;
              return MaterialPage(child: TripMapScreen(tripId: id));
            },
          ),
          GoRoute(
            path: 'pre-trip',
            name: 'preTripChecklist',
            pageBuilder: (_, state) => MaterialPage(
              child: PreTripChecklistScreen(
                tripId: state.pathParameters['id']!,
              ),
            ),
          ),
        ],
      ),

      // ── Driver — Bookings ──────────────────────────────────────────
      GoRoute(
        path: AppRoutes.driverBookings,
        name: 'driverBookings',
        pageBuilder: (_, __) =>
            const MaterialPage(child: DriverBookingsScreen()),
      ),
      GoRoute(
        path: '/driver/bookings/:id',
        name: 'bookingDetail',
        pageBuilder: (_, state) {
          final id = state.pathParameters['id']!;
          return MaterialPage(child: BookingDetailsScreen(bookingId: id));
        },
      ),

      // ── Driver — Notifications ──────────────────────────────────────
      GoRoute(
        path: AppRoutes.driverNotifications,
        name: 'driverNotifications',
        pageBuilder: (_, __) =>
            const MaterialPage(child: NotificationsScreen()),
      ),

      GoRoute(
        path: AppRoutes.driverEarnings,
        name: 'driverEarnings',
        pageBuilder: (_, __) =>
            const MaterialPage(child: DriverEarningsScreen()),
      ),
      GoRoute(
        path: AppRoutes.driverExpenses,
        name: 'driverExpenses',
        pageBuilder: (_, __) =>
            const MaterialPage(child: DriverExpenseScreen()),
      ),
      GoRoute(
        path: AppRoutes.reportIssue,
        name: 'reportIssue',
        pageBuilder: (_, state) => MaterialPage(
          child: ReportVehicleIssueScreen(
            tripId: state.uri.queryParameters['tripId'],
            vehicleReg: state.uri.queryParameters['vehicleReg'],
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.sosEmergency,
        name: 'sosEmergency',
        pageBuilder: (_, __) => const MaterialPage(child: SOSEmergencyScreen()),
      ),

      // ── Manager ────────────────────────────────────────────────────────
      ShellRoute(
        builder: (context, state, child) =>
            ManagerTabScaffold(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(
            path: AppRoutes.managerHome,
            name: 'managerHome',
            pageBuilder: (_, __) => MaterialPage(child: ManagerHomeScreen()),
          ),
          GoRoute(
            path: AppRoutes.managerTrips,
            name: 'managerTrips',
            pageBuilder: (_, __) => MaterialPage(child: ManagerTripsScreen()),
          ),
          GoRoute(
            path: AppRoutes.managerFleet,
            name: 'managerFleet',
            pageBuilder: (_, __) => MaterialPage(child: ManagerFleetScreen()),
          ),
          GoRoute(
            path: AppRoutes.managerMore,
            name: 'managerMore',
            pageBuilder: (_, __) => MaterialPage(child: ManagerMoreScreen()),
          ),
        ],
      ),
      // Keep the static new-booking path ahead of the trip detail pattern.
      GoRoute(
        path: AppRoutes.managerNewBooking,
        name: 'managerNewBooking',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerNewBookingScreen()),
      ),
      GoRoute(
        path: '/manager/trips/:id',
        name: 'managerTripDetail',
        pageBuilder: (_, state) => MaterialPage(
          child: ManagerTripDetailScreen(
            bookingId: state.pathParameters['id']!,
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.managerExpenses,
        name: 'managerExpenses',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerExpensesScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerAttendance,
        name: 'managerAttendance',
        pageBuilder: (_, __) =>
            const MaterialPage(child: AttendanceCalendarScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerAttendanceCalendar,
        name: 'managerAttendanceCalendar',
        pageBuilder: (_, __) =>
            const MaterialPage(child: AttendanceCalendarScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerNotifications,
        name: 'managerNotifications',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerNotificationsScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerDocuments,
        name: 'managerDocuments',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerDocumentsScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerVehicles,
        name: 'managerVehicles',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerVehiclesScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerDrivers,
        name: 'managerDrivers',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerDriversScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerCustomers,
        name: 'managerCustomers',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerCustomersScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerInvoices,
        name: 'managerInvoices',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerInvoicesScreen()),
      ),
      GoRoute(
        path: AppRoutes.managerInvoice,
        name: 'managerInvoice',
        pageBuilder: (_, state) => MaterialPage(
          child: ManagerInvoiceScreen(invoice: state.extra! as InvoiceRecord),
        ),
      ),
      GoRoute(
        path: AppRoutes.managerInvoiceEditor,
        name: 'managerInvoiceEditor',
        pageBuilder: (_, state) => MaterialPage(
          child: ManagerInvoiceEditorScreen(
            invoice: state.extra! as InvoiceRecord,
            create: state.uri.queryParameters['create'] == 'true',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.managerReports,
        name: 'managerReports',
        pageBuilder: (_, __) =>
            const MaterialPage(child: ManagerReportsScreen()),
      ),
    ],
    errorBuilder: (context, state) =>
        Scaffold(body: Center(child: Text('Page not found: ${state.error}'))),
  );
});

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen(authProvider, (_, __) => notifyListeners());
  }
}
