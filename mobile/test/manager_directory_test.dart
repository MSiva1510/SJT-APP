// Document expiry merge, assignment lookup, customer stats, contact links.

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/manager_directory.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_customers_screen.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/directory_ui.dart';

void main() {
  final today = DateTime(2026, 10, 30);

  group('expiry', () {
    test('state and phrase', () {
      expect(expiryStateOf(DateTime(2026, 10, 18), today), ExpiryState.expired);
      expect(expiryStateOf(DateTime(2026, 10, 30), today), ExpiryState.soon);
      expect(expiryStateOf(DateTime(2026, 11, 29), today), ExpiryState.soon); // 30 days
      expect(expiryStateOf(DateTime(2026, 11, 30), today), ExpiryState.ok); // 31 days
      expect(expiryPhrase(DateTime(2026, 10, 18), today), 'Expired 12 days ago');
      expect(expiryPhrase(DateTime(2026, 10, 30), today), 'Expires today');
      expect(expiryPhrase(DateTime(2026, 11, 4), today), 'Expires in 5 days');
      expect(expiryPhrase(DateTime(2028, 9, 5), today), 'Valid for 22 months');
      expect(expiryPhrase(DateTime(2036, 9, 5), today), 'Valid for 9 years');
    });

    test('documents table and columns merge, earliest date wins', () {
      final v = VehicleRecord.fromMap({
        'id': 'v1',
        'registration': 'PY01VF1255',
        'insurance_expiry': '2026-11-30',
        'pollution_cert_expiry': '2026-10-18',
      });
      final d = DriverRecord.fromMap({'id': 'd1', 'name': 'Ramanan', 'license_expiry': '2030-08-02'});
      final list = buildExpiryList(
        documents: [
          // Same insurance, earlier date on the Documents page → wins.
          {'doc_type': 'insurance', 'expiry_date': '2026-11-10', 'vehicle_id': 'v1'},
          // Same licence, later date → ignored.
          {'doc_type': 'Driving licence', 'expiry_date': '2031-01-01', 'driver_id': 'd1'},
          {'doc_type': 'permit', 'expiry_date': '2027-02-01', 'vehicle_id': 'v1'},
          // Owner no longer exists → skipped.
          {'doc_type': 'insurance', 'expiry_date': '2026-01-01', 'vehicle_id': 'gone'},
        ],
        vehicles: [v],
        drivers: [d],
      );
      expect(
        list.map((i) => '${i.ownerName} ${i.docType} ${i.expiry.toIso8601String().substring(0, 10)}'),
        [
          'PY01VF1255 pollution 2026-10-18',
          'PY01VF1255 insurance 2026-11-10',
          'PY01VF1255 permit 2027-02-01',
          'Ramanan license 2030-08-02',
        ],
      );
      final s = summarizeExpiry(list, today);
      expect((s.expired, s.soon), (1, 1));
    });

    test('labels', () {
      expect(docTypeLabel('fitness'), 'Fitness certificate (FC)');
      expect(docTypeLabel('road_tax'), 'Road tax');
    });
  });

  test('newest assignment per vehicle and per driver (rows newest first)', () {
    final rows = [
      {'vehicle_reg': 'PY01CY1255', 'driver_id': 'raj', 'driver_name': 'Rajasekharan'},
      {'vehicle_reg': 'py01 vf-1255', 'driver_id': 'raj', 'driver_name': 'Rajasekharan'},
      {'vehicle_reg': 'PY01VF1255', 'driver_id': 'ram', 'driver_name': 'Ramanan'},
      {'vehicle_reg': 'PY01DF1255', 'driver_id': 'ram', 'driver_name': 'Ramanan'},
    ];
    expect(latestDriverByVehicle(rows), {
      'PY01CY1255': 'Rajasekharan',
      'PY01VF1255': 'Rajasekharan',
      'PY01DF1255': 'Ramanan',
    });
    expect(latestVehicleByDriver(rows), {'raj': 'PY01CY1255', 'ram': 'PY01VF1255'});
  });

  test('customer stats: by id, else by name; cancelled ignored', () {
    final customers = [
      CustomerRecord.fromMap({'id': 'c1', 'name': 'Mani', 'mobile': '7305581235'}),
      CustomerRecord.fromMap({'id': 'c2', 'name': 'Gopal'}),
    ];
    expect(customers.first.phone, '7305581235');
    final stats = customerStats(customers, [
      {'customer_id': 'c1', 'status': 'completed', 'total_fare': 3000, 'start_date': '2026-09-01'},
      {'customer_name': 'mani', 'status': 'closed', 'total_fare': '1500', 'start_date': '2026-10-02'},
      {'customer_id': 'c1', 'status': 'assigned', 'total_fare': 999, 'start_date': '2026-11-05'},
      {'customer_id': 'c1', 'status': 'cancelled', 'total_fare': 5000},
    ]);
    final m = stats['c1']!;
    expect((m.trips, m.completed, m.revenue), (3, 2, 4500.0));
    expect(m.lastTrip, DateTime(2026, 11, 5));
    expect(stats['c2'], isNull);

    final withStats =
        customers.map((c) => stats[c.id] == null ? c : c.withStats(stats[c.id]!)).toList();
    expect(sortCustomers(withStats).map((c) => c.name), ['Mani', 'Gopal']);
    expect(customerTripsLine(withStats.first), '3 trips · last 5 Nov 2026');
    expect(withStats.first.matches('5581'), isTrue);
    expect(withStats.first.matches('gop'), isFalse);
  });

  test('call and WhatsApp links', () {
    expect(whatsAppUri('+91 73055 81235').toString(), 'https://wa.me/917305581235');
    expect(phoneUri('73055 81235').toString(), 'tel:7305581235');
    expect(whatsAppUri('12'), isNull);
    expect(phoneUri(null), isNull);
  });
}
