// Fleet GPS sync parsing, expense numbering / rows, trip route window.

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/driver_expense.dart';
import 'package:sri_jayam_travels_mobile/models/expense_numbering.dart';
import 'package:sri_jayam_travels_mobile/models/manager_models.dart';
import 'package:sri_jayam_travels_mobile/services/fleet_gps_sync.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_fleet_map_screen.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/fleet_map.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/trip_route_card.dart';

void main() {
  group('fleet GPS sync', () {
    test('provider list and per-vendor settings', () {
      expect(parseProviderNames('kingstrack + gpstrack'), ['kingstrack', 'gpstrack']);
      expect(parseProviderNames('GPSTRACK'), ['gpstrack']);
      final s = settingsForProvider(
        'gpstrack',
        {'api_url': 'shared', 'gpstrack_api_url': '', 'api_token': 'x'},
        multi: true,
      );
      expect(s['api_url'], ''); // own (empty → default) wins over shared
      expect(s['api_token'], 'x');
    });

    test('registration normalised', () {
      expect(normalizeRegistration('py01 vf-1255'), 'PY01VF1255');
    });

    test('vendor time: epoch, zoned ISO, zone-less = India time', () {
      expect(parseVendorTime(1793291940000),
          DateTime.fromMillisecondsSinceEpoch(1793291940000, isUtc: true));
      expect(parseVendorTime('2026-10-27T16:39:00Z'), DateTime.utc(2026, 10, 27, 16, 39));
      expect(parseVendorTime('2026-10-27 22:09:00'), DateTime.utc(2026, 10, 27, 16, 39));
      expect(parseVendorTime(''), isNull);
    });

    test('GPSTrack.in rows normalise', () {
      final now = DateTime.utc(2026, 10, 29, 10);
      final list = normalizeGpsTrack([
        {
          'latitude': 11.89,
          'longitude': 79.80,
          'speed': 32,
          'date': now.subtract(const Duration(minutes: 2)).millisecondsSinceEpoch,
          'ignitionStatus': 'ON',
          'vehicleStatus': 'MOVING',
          'regNo': 'PY01DF1255',
          'deviceId': '0869',
          'bearing': 12,
        },
        {'latitude': null, 'longitude': 79.8},
      ], now: now);
      expect(list, hasLength(1));
      final s = list.single;
      expect(s.registration, 'PY01DF1255');
      expect(s.ignition, isTrue);
      expect(s.gpsOnline, isTrue);
      expect(s.status, 'moving');
      expect(s.minute.second, 0);
    });

    test('KingsTrack rows normalise (lowercase keys)', () {
      final list = normalizeKingsTrack({
        'data': [
          {
            'latitude': '11.93',
            'longitude': '79.82',
            'plate_no': 'PY01CY1255',
            'imei_no': '3520',
            'ignition': 'OFF',
            'gps': 'A',
            'speed': '0',
            'timestamp': '2026-10-27 22:09:00',
          },
        ],
      });
      expect(list.single.registration, 'PY01CY1255');
      expect(list.single.imei, '3520');
      expect(list.single.ignition, isFalse);
      expect(list.single.gpsOnline, isTrue);
      expect(list.single.at, DateTime.utc(2026, 10, 27, 16, 39));
    });
  });

  group('expense numbering', () {
    final oct = DateTime(2026, 10, 29);

    test('type maps onto the CHECKed expense_type', () {
      expect(expenseTypeFor('Fuel'), 'fuel');
      expect(expenseTypeFor('bata'), 'other');
    });

    test('next staff number ignores driver numbers', () {
      expect(nextExpenseNo(oct, []), 'EXP-2610-0001');
      expect(
        nextExpenseNo(oct, ['EXP-2610-0009', 'EXP-2610-D9999', 'EXP-2609-0400', null]),
        'EXP-2610-0010',
      );
      expect(nextExpenseNo(oct, ['EXP-2610-0009'], bump: 2), 'EXP-2610-0012');
    });

    test('driver number has its own namespace', () {
      expect(driverExpenseNo(oct, Random(1)), matches(RegExp(r'^EXP-2610-D\d{4}$')));
    });

    test('driver insert now sends expense_type and a date-only date', () {
      final row = const DriverExpense(category: 'Parking', amount: 50)
          .toInsert(driverId: 'd', driverName: 'K');
      expect(row['expense_type'], 'parking');
      expect(row['expense_date'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    });

    test('office expense row is approved and numbered', () {
      final draft = NewExpenseDraft(
        type: 'toll',
        amount: 140,
        date: oct,
        description: '  Toll gate  ',
        vehicleReg: 'PY01VF1255',
      );
      expect(draft.problem, isNull);
      final row = draft.toRow(expenseNo: 'EXP-2610-0001', actorName: 'Siva');
      expect(row['expense_no'], 'EXP-2610-0001');
      expect(row['expense_type'], 'toll');
      expect(row['status'], 'approved');
      expect(row['approved_by'], 'Siva');
      expect(row['expense_date'], '2026-10-29');
      expect(row['description'], 'Toll gate');
    });

    test('office expense validation', () {
      expect(NewExpenseDraft(type: 'fuel', amount: 0, date: oct).problem, isNotNull);
      expect(NewExpenseDraft(type: 'food', amount: 10, date: oct).problem, isNotNull);
    });
  });

  group('trip route', () {
    ManagerBooking b({DateTime? start, DateTime? end}) => ManagerBooking(
          id: 'b1',
          status: 'completed',
          startDate: start,
          endDate: end,
        );

    test('trip window is the India-time days as UTC', () {
      final w = tripWindowUtc(b(start: DateTime(2026, 10, 30), end: DateTime(2026, 10, 31)))!;
      expect(w.$1, DateTime.utc(2026, 10, 29, 18, 30));
      expect(w.$2, DateTime.utc(2026, 10, 31, 18, 30));
      expect(tripWindowUtc(b()), isNull);
    });

    test('caption says where the route came from', () {
      final track = TripTrack(
        points: const [(lat: 11.9, lng: 79.8), (lat: 12.0, lng: 79.9)],
        source: TrackSource.vehicleGps,
      );
      expect(
        tripRouteCaption(track: track, hasPlanned: true, plannedLoading: false),
        contains('vehicle GPS · 2 GPS points'),
      );
      expect(
        tripRouteCaption(track: TripTrack.empty, hasPlanned: true, plannedLoading: false),
        startsWith('Planned route'),
      );
    });
  });

  group('fleet map', () {
    final now = DateTime(2026, 10, 30, 10);
    ManagerBooking bk(String id, String status, DateTime start, [DateTime? end]) =>
        ManagerBooking(id: id, status: status, startDate: start, endDate: end, vehicleId: 'v1');

    test('current trip: started first, then today, then next upcoming', () {
      final today = bk('t', 'assigned', DateTime(2026, 10, 29), DateTime(2026, 10, 31));
      final next = bk('n', 'approved', DateTime(2026, 11, 2));
      final later = bk('l', 'approved', DateTime(2026, 11, 9));
      expect(pickCurrentTrip([later, next, today], now)?.id, 't');
      expect(pickCurrentTrip([later, next], now)?.id, 'n');
      expect(pickCurrentTrip([next, bk('s', 'started', DateTime(2026, 10, 20))], now)?.id, 's');
      expect(pickCurrentTrip([bk('c', 'cancelled', DateTime(2026, 10, 30))], now), isNull);
    });

    test('OSRM nearest response parses to lat/lng', () {
      final p = parseOsrmNearest({
        'code': 'Ok',
        'waypoints': [
          {'location': [79.8301, 11.9302]},
        ],
      });
      expect(p?.latitude, 11.9302);
      expect(p?.longitude, 79.8301);
      expect(parseOsrmNearest({'code': 'NoSegment'}), isNull);
    });

    test('what the car is doing', () {
      const v = VehicleOption(id: 'v1', registration: 'PY01VF1255', status: 'active');
      final t = DateTime.now();
      expect(
        vehicleActivity(VehiclePosition(vehicle: v, latitude: 1, longitude: 1, speedKmh: 42, at: t), t),
        'Driving at 42 km/h',
      );
      expect(
        vehicleActivity(VehiclePosition(vehicle: v, latitude: 1, longitude: 1, speedKmh: 0, ignition: false, at: t), t),
        'Parked, engine off',
      );
      expect(vehicleActivity(const VehiclePosition(vehicle: v), t), contains('never'));
    });
  });
}
