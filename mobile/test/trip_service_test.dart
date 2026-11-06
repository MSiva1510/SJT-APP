// ─────────────────────────────────────────────────────────────────────────────
// trip_service_test.dart
// Trip lifecycle guards: start only when assigned, complete only when
// started, and a driver can never touch another driver's trip.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/driver_profile.dart';
import 'package:sri_jayam_travels_mobile/models/trip.dart';
import 'package:sri_jayam_travels_mobile/repositories/trip_repository.dart';
import 'package:sri_jayam_travels_mobile/services/trip_service.dart';

TripModel _trip({
  required String id,
  required String status,
  String? driverId,
  String? driverName,
  String? vehicleId,
}) => TripModel(
  id: id,
  tripType: 'one_way',
  status: status,
  driverId: driverId,
  driverName: driverName,
  vehicleId: vehicleId,
  vehicleReg: vehicleId != null ? 'PY01AB1234' : null,
);

class FakeTripRepository implements TripRepository {
  final Map<String, TripModel> rows;

  FakeTripRepository(this.rows);

  @override
  Future<List<TripModel>> getDriverTrips({int limit = 50}) async =>
      rows.values.toList();

  @override
  Future<List<TripModel>> getTodayTrips() async => rows.values.toList();

  @override
  Future<List<TripModel>> getUpcomingTrips({int limit = 10}) async => [];

  @override
  Future<TripModel?> getTripById(String tripId) async => rows[tripId];

  @override
  Future<int> getTodayTripCount() async => rows.length;

  @override
  Future<TripModel> markStarted(String tripId) async {
    final t = rows[tripId]!;
    final updated = _trip(
      id: t.id,
      status: 'started',
      driverId: t.driverId,
      driverName: t.driverName,
      vehicleId: t.vehicleId,
    );
    rows[tripId] = updated;
    return updated;
  }

  @override
  Future<TripModel> markCompleted(String tripId) async {
    final t = rows[tripId]!;
    final updated = _trip(
      id: t.id,
      status: 'completed',
      driverId: t.driverId,
      driverName: t.driverName,
      vehicleId: t.vehicleId,
    );
    rows[tripId] = updated;
    return updated;
  }

  @override
  Future<TripModel> declineTrip(String tripId, String reason) async {
    final t = rows[tripId]!;
    final updated = _trip(
      id: t.id,
      status: 'pending',
      driverId: t.driverId,
      driverName: t.driverName,
      vehicleId: t.vehicleId,
    );
    rows[tripId] = updated;
    return updated;
  }

  @override
  Future<TripModel> saveRoutePlaces({
    required String tripId,
    required TripModel trip,
    double? pickupLat,
    double? pickupLng,
    String? pickupPlace,
    double? dropLat,
    double? dropLng,
    String? dropPlace,
  }) async => rows[tripId]!;
}

const me = DriverProfile(id: 'driver-1', name: 'Kumar');
const otherDriver = DriverProfile(id: 'driver-2', name: 'Ravi');

void main() {
  late Map<String, TripModel> db;
  late TripService service;

  setUp(() {
    db = {
      't1': _trip(
        id: 't1',
        status: 'assigned',
        driverId: 'driver-1',
        vehicleId: 'v1',
      ),
      't2': _trip(id: 't2', status: 'started', driverId: 'driver-1'),
      't3': _trip(id: 't3', status: 'completed', driverId: 'driver-1'),
      // Another driver's trip — RLS would hide it, but the service must
      // also block it if it ever leaks through.
      't4': _trip(id: 't4', status: 'assigned', driverId: 'driver-2'),
    };
    service = TripService(FakeTripRepository(db));
  });

  group('access control', () {
    test('driver can fetch own trip by id or name match', () async {
      final t = await service.getTripById('t1', me);
      expect(t, isNotNull);
    });

    test('other driver\'s trip is rejected even if visible', () async {
      await expectLater(
        service.getTripById('t4', me),
        throwsA(
          predicate(
            (e) =>
                e is TripServiceException &&
                e.code == TripErrorCode.unauthorized,
          ),
        ),
      );
    });

    test('null driver is rejected', () async {
      await expectLater(
        service.getTripById('t1', null),
        throwsA(isA<TripServiceException>()),
      );
    });
  });

  group('lifecycle transitions', () {
    test(
      'assigned → started succeeds and requires vehicle for GPS later',
      () async {
        final updated = await service.startTrip(tripId: 't1', driver: me);
        expect(updated.isStarted, isTrue);
      },
    );

    test('starting an already-started trip is rejected', () async {
      await expectLater(
        service.startTrip(tripId: 't2', driver: me),
        throwsA(
          predicate(
            (e) =>
                e is TripServiceException &&
                e.code == TripErrorCode.invalidTransition,
          ),
        ),
      );
    });

    test('completing an assigned (not started) trip is rejected', () async {
      await expectLater(
        service.completeTrip(tripId: 't1', driver: me),
        throwsA(
          predicate(
            (e) =>
                e is TripServiceException &&
                e.code == TripErrorCode.invalidTransition,
          ),
        ),
      );
    });

    test('started → completed succeeds', () async {
      final updated = await service.completeTrip(tripId: 't2', driver: me);
      expect(updated.isCompleted, isTrue);
    });

    test('cannot start another driver\'s assigned trip', () async {
      await expectLater(
        service.startTrip(tripId: 't4', driver: me),
        throwsA(
          predicate(
            (e) =>
                e is TripServiceException &&
                e.code == TripErrorCode.unauthorized,
          ),
        ),
      );
    });
  });
}
