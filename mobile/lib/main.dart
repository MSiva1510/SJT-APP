// ─────────────────────────────────────────────────────────────────────────────
// main.dart
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'core/config/supabase_config.dart';
import 'core/auth/auth_state.dart';
import 'core/theme/wireframe_theme.dart';
import 'navigation/app_router.dart';
import 'providers/auth_provider.dart';
import 'providers/gps_provider.dart';
import 'providers/notification_provider.dart';
import 'providers/attendance_provider.dart';
import 'providers/booking_provider.dart';
import 'providers/document_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/trip_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url:            SupabaseConfig.url,
    publishableKey: SupabaseConfig.anonKey,
  );

  runApp(const ProviderScope(child: SriJayamApp()));
}

class SriJayamApp extends ConsumerWidget {
  const SriJayamApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeControllerProvider);
    return MaterialApp.router(
      title:                      'Sri Jayam Travels',
      debugShowCheckedModeBanner: false,
      theme:                      buildWireframeLightTheme(),
      darkTheme:                  buildWireframeDarkTheme(),
      themeMode:                  themeMode.materialThemeMode,
      routerConfig:               router,
      builder: (context, child) =>
          _AuthGuard(child: child ?? const SizedBox()),
    );
  }

}

/// Watches auth + app lifecycle:
///   • GPS tracking is force-stopped the moment the user is no longer
///     authenticated (logout, remote revoke, session expiry) — no GPS
///     request can outlive its session.
///   • Tracking pauses when the app goes to background and resumes on
///     return (foreground-only support — documented in Day 47 report).
class _AuthGuard extends ConsumerStatefulWidget {
  const _AuthGuard({required this.child});
  final Widget child;

  @override
  ConsumerState<_AuthGuard> createState() => _AuthGuardState();
}

class _AuthGuardState extends ConsumerState<_AuthGuard>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final gps = ref.read(gpsTrackingProvider.notifier);
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.hidden:
        gps.onAppPaused();
      case AppLifecycleState.resumed:
        gps.onAppResumed();
      default:
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Central logout hook — covers manual logout, remote sign-out and
    // session-expiry transitions alike.
    ref.listen<AuthState>(authProvider, (prev, next) {
      final wasIn = prev is AuthAuthenticated;
      final isIn = next is AuthAuthenticated;
      if (wasIn && !isIn) {
        _teardownSession(ref);
      }
    });

    final authState = ref.watch(authProvider);
    if (authState is AuthInitializing) {
      return const _SplashScreen();
    }
    return widget.child;
  }

  /// Full session teardown. Runs when the auth state leaves
  /// [AuthAuthenticated] for ANY reason (logout, remote revoke, expiry):
  ///   1. GPS: listeners + sync timer die immediately (bounded flush).
  ///   2. Notifications realtime channel removed, cached rows cleared.
  ///   3. All module providers invalidated so no trip/booking/attendance/
  ///      document state can leak into the next account — and no stale
  ///      screen can render another driver's data.
  void _teardownSession(WidgetRef ref) {
    ref.read(gpsTrackingProvider.notifier).disposeSession();
    ref.read(notificationsProvider.notifier).disposeSession();

    ref.invalidate(todayTripsProvider);
    ref.invalidate(allDriverTripsProvider);
    ref.invalidate(tripDetailProvider);
    ref.invalidate(upcomingTripsProvider);
    ref.invalidate(todayTripCountProvider);

    ref.invalidate(driverBookingsProvider);
    ref.invalidate(bookingDetailProvider);
    ref.invalidate(upcomingBookingsProvider);
    ref.invalidate(activeBookingCountProvider);

    ref.invalidate(todayAttendanceProvider);
    ref.invalidate(attendanceHistoryProvider);

    ref.invalidate(documentsProvider);
  }
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.directions_car_rounded,
              size: 72,
            ),
            const SizedBox(height: 24),
            const Text(
              'Sri Jayam Travels',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 32),
            const CircularProgressIndicator(),
            const SizedBox(height: 12),
            Text(
              'Checking session...',
              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}