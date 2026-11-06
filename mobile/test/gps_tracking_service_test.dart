// ─────────────────────────────────────────────────────────────────────────────
// gps_tracking_service_test.dart
// GPS lifecycle guarantees: guarded start (no duplicate tracking), quality
// gates, offline queueing that never fakes success, and hard teardown.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/driver_profile.dart';
import 'package:sri_jayam_travels_mobile/models/gps_position.dart';
import 'package:sri_jayam_travels_mobile/models/trip.dart';
import 'package:sri_jayam_travels_mobile/repositories/gps_repository.dart';
import 'package:sri_jayam_travels_mobile/services/gps_tracking_service.dart';
import 'package:sri_jayam_travels_mobile/services/location_service.dart';

class FakeLocationService implements LocationService {
  LocationStatus nextStatus = LocationStatus.granted;
  final controller = StreamController<GpsPosition>.broadcast();

  @override
  Future<LocationStatus> getStatus() async => nextStatus;

  @override
  Future<LocationStatus> requestPermission() async => nextStatus;

  @override
  Future<void> openSettings() async {}

  @override
  Future<GpsPosition> getCurrentPosition() async => _fix(11.0);

  @override
  Stream<GpsPosition> getPositionStream({int distanceFilterM = 25}) =>
      controller.stream;
}

class FakeGpsRepository implements GpsRepository {
  int inserts = 0;
  Object? insertError;

  @override
  Future<bool> saveLocation({
    required String vehicleId,
    String? tripId,
    String? driverId,
    required GpsPosition position,
  }) async {
    if (insertError != null) throw insertError!;
    inserts++;
    return true;
  }

  @override
  Future<int> saveLocationBatch({
    required String vehicleId,
    String? tripId,
    String? driverId,
    required List<GpsPosition> positions,
  }) async {
    if (insertError != null) throw insertError!;
    inserts += positions.length;
    return positions.length;
  }

  @override
  Future<GpsPosition?> getLatestLocation({required String vehicleId}) async =>
      null;

  @override
  Future<List<GpsPosition>> getTripLocations({
    required String tripId,
    int limit = 2000,
  }) async => [];
}

GpsPosition _fix(double lat, {double accuracy = 8, DateTime? timestamp}) =>
    GpsPosition(
      latitude: lat,
      longitude: 76.9 + lat / 1000,
      accuracy: accuracy,
      speed: 10,
      timestamp: timestamp ?? DateTime.now(),
    );

TripModel _tripWithVehicle() => const TripModel(
  id: 'trip-1',
  tripType: 'one_way',
  status: 'started',
  vehicleId: 'vehicle-1',
);

const driver = DriverProfile(id: 'driver-1', name: 'Kumar');

GpsTrackingService buildService(
  FakeLocationService location,
  FakeGpsRepository repo,
) {
  return GpsTrackingService(
    locationService: location,
    repository: repo,
    // Long sync tick so no periodic timer fires during tests.
    trackingConfig: const GpsTrackingConfig(
      syncTickInterval: Duration(hours: 1),
      minInterval: Duration.zero,
      minDistanceM: 0,
    ),
  );
}

void main() {
  late FakeLocationService location;
  late FakeGpsRepository repo;
  late GpsTrackingService service;

  setUp(() {
    location = FakeLocationService();
    repo = FakeGpsRepository();
    service = buildService(location, repo);
  });

  tearDown(() {
    service.dispose();
    location.controller.close();
  });

  group('start guards', () {
    test('trip without a vehicle is rejected before any GPS work', () async {
      const trip = TripModel(id: 't', tripType: 'one_way', status: 'started');
      await expectLater(
        service.startTracking(trip: trip, driver: driver),
        throwsA(isA<GpsTrackingException>()),
      );
      expect(service.isTracking, isFalse);
    });

    test('denied permission prevents start', () async {
      location.nextStatus = LocationStatus.denied;
      await expectLater(
        service.startTracking(trip: _tripWithVehicle(), driver: driver),
        throwsA(isA<GpsTrackingException>()),
      );
      expect(service.isTracking, isFalse);
    });

    test('disabled GPS prevents start', () async {
      location.nextStatus = LocationStatus.gpsDisabled;
      await expectLater(
        service.startTracking(trip: _tripWithVehicle(), driver: driver),
        throwsA(isA<GpsTrackingException>()),
      );
      expect(service.isTracking, isFalse);
    });

    test('successful start activates tracking', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      expect(service.isTracking, isTrue);
      expect(service.state.status, GpsTrackingStatus.active);
    });

    test('duplicate start is ignored', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      expect(service.state.status, GpsTrackingStatus.active);
    });
  });

  group('quality gates', () {
    test('inaccurate fixes are discarded', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      // Starting fix from startTracking is routePoints[0].
      expect(service.state.routePoints.length, 1);
      final ctx = service.state.context!;
      await service.handleLocationUpdate(_fix(11.01, accuracy: 999), ctx);
      expect(service.state.routePoints.length, 1); // unchanged
    });

    test('invalid coordinates are discarded', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      final ctx = service.state.context!;
      final bad = GpsPosition(
        latitude: 999,
        longitude: 999,
        accuracy: 5,
        timestamp: DateTime.now(),
      );
      expect(bad.isValid, isFalse);
      await service.handleLocationUpdate(bad, ctx);
      expect(service.state.routePoints.length, 1); // only the starting fix
    });

    test('valid fix is accepted and uploaded', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      final ctx = service.state.context!;
      await service.handleLocationUpdate(
        _fix(11.02, timestamp: DateTime.now().add(const Duration(seconds: 1))),
        ctx,
      );
      expect(service.state.routePoints.length, 2);
      expect(repo.inserts, greaterThanOrEqualTo(1));
    });
  });

  group('offline behaviour', () {
    test('failed upload is queued, never counted as uploaded', () async {
      repo.insertError = Exception('network down');
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      final ctx = service.state.context!;
      await service.handleLocationUpdate(_fix(11.03), ctx);
      expect(service.state.pendingCount, greaterThanOrEqualTo(1));
      expect(service.state.temporarilyOffline, isTrue);
      expect(service.state.uploadedCount, 0);
    });

    test('queue flushes when the network returns', () async {
      repo.insertError = Exception('network down');
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      final ctx = service.state.context!;
      await service.handleLocationUpdate(_fix(11.04), ctx);

      repo.insertError = null;
      final flushed = await service.syncPendingLocations();
      expect(flushed, greaterThanOrEqualTo(1));
      expect(service.state.pendingCount, 0);
      expect(service.state.temporarilyOffline, isFalse);
    });
  });

  group('teardown', () {
    test('stopTracking resets to idle', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      await service.stopTracking();
      expect(service.isTracking, isFalse);
      expect(service.state.status, GpsTrackingStatus.idle);
      expect(service.state.context, isNull);
    });

    test(
      'disposeSession hard-resets an active session (logout path)',
      () async {
        await service.startTracking(trip: _tripWithVehicle(), driver: driver);
        await service.disposeSession();
        expect(service.isTracking, isFalse);
        expect(service.state.routePoints, isEmpty);
        expect(service.state.pendingCount, 0);
      },
    );

    test('pause/resume via app lifecycle hooks', () async {
      await service.startTracking(trip: _tripWithVehicle(), driver: driver);
      await service.onAppPaused();
      expect(service.state.status, GpsTrackingStatus.paused);
      await service.onAppResumed();
      expect(service.state.status, GpsTrackingStatus.active);
    });
  });
}
