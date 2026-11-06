// ─────────────────────────────────────────────────────────────────────────────
// route_map_provider.dart
// Shared route data for the trip map (full screen + details preview card):
//   storedTripRouteProvider → recorded GPS fixes for the trip (history/live)
//   expectedRouteProvider   → planned pickup→drop path when there is no
//                             recorded track yet (upcoming/cancelled)
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../models/gps_position.dart';
import '../models/trip.dart';
import '../services/expected_route_service.dart';
import 'gps_provider.dart';
import 'trip_provider.dart';

/// Persisted GPS route for a trip, oldest first.
final storedTripRouteProvider = FutureProvider.autoDispose
    .family<List<GpsPosition>, String>(
      (ref, tripId) =>
          ref.watch(gpsRepositoryProvider).getTripLocations(tripId: tripId),
    );

final expectedRouteServiceProvider = Provider<ExpectedRouteService>(
  (ref) => ExpectedRouteService(),
);

/// Planned pickup→drop path for a trip. Recomputes when the trip detail
/// finishes loading; returns null while loading or when resolution fails.
/// Driver-corrected places (saved in `type_data`) take priority over the
/// free-text route names, so a fixed route stays fixed.
final expectedRouteProvider = FutureProvider.autoDispose
    .family<RouteResolution?, String>((ref, tripId) async {
      final detail = ref.watch(tripDetailProvider(tripId));
      if (detail is! TripDetailLoaded) return null;
      final trip = detail.trip;
      return ref
          .watch(expectedRouteServiceProvider)
          .resolveDetailed(
            pickup: trip.pickupPlaceFixed ?? trip.pickupLocation,
            drop: trip.dropPlaceFixed ?? trip.dropLocation,
            pickupPoint: _latLng(trip.pickupLat, trip.pickupLng),
            dropPoint: _latLng(trip.dropLat, trip.dropLng),
          );
    });

/// Route preview for a trip passed by value (used by the trips-list cards,
/// which do not load the full trip-detail provider). Keyed by trip id and
/// recomputed only when the trip's route identity changes.
final routePreviewProvider = FutureProvider.autoDispose
    .family<RouteResolution?, TripModel>((ref, trip) async {
      return ref
          .watch(expectedRouteServiceProvider)
          .resolveDetailed(
            pickup: trip.pickupPlaceFixed ?? trip.pickupLocation,
            drop: trip.dropPlaceFixed ?? trip.dropLocation,
            pickupPoint: _latLng(trip.pickupLat, trip.pickupLng),
            dropPoint: _latLng(trip.dropLat, trip.dropLng),
          );
    });

LatLng? _latLng(double? lat, double? lng) =>
    (lat == null || lng == null) ? null : LatLng(lat, lng);
