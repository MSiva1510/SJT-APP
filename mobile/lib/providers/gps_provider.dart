// ─────────────────────────────────────────────────────────────────────────────
// gps_provider.dart
// Day 47 — Riverpod wiring for the GPS tracking service.
//
// The service is kept ALIVE for the whole app lifetime (logout included)
// so the auth listener in main.dart can always reach it to stop tracking.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/gps_repository.dart';
import '../services/gps_tracking_service.dart';
import '../services/location_service.dart';
import 'auth_provider.dart';

final locationServiceProvider = Provider<LocationService>((ref) {
  return LocationService();
});

final gpsRepositoryProvider = Provider<GpsRepository>((ref) {
  return GpsRepository(ref.watch(supabaseClientProvider));
});

/// App-lifetime notifier — default Riverpod providers are keep-alive, so
/// this survives route changes and stays reachable for logout cleanup.
final gpsTrackingProvider =
    StateNotifierProvider<GpsTrackingService, GpsTrackState>(
  (ref) => GpsTrackingService(
    locationService: ref.watch(locationServiceProvider),
    repository: ref.watch(gpsRepositoryProvider),
  ),
);
