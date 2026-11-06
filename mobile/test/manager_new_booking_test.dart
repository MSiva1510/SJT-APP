// ─────────────────────────────────────────────────────────────────────────────
// manager_new_booking_test.dart — manager "New booking" flow.
// Unit: FY booking-number rule, mobile / name validation, availability
// overlap, NewBookingDraft.toRow payload. Widget: the 5-step flow against an
// in-memory fake repository (assigned one-way trip; self-drive draft with a
// previous customer; busy vehicle shown disabled). Nothing touches Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:sri_jayam_travels_mobile/core/theme/wireframe_theme.dart';
import 'package:sri_jayam_travels_mobile/models/manager_models.dart';
import 'package:sri_jayam_travels_mobile/models/new_booking.dart';
import 'package:sri_jayam_travels_mobile/models/user_profile.dart';
import 'package:sri_jayam_travels_mobile/navigation/app_router.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';
import 'package:sri_jayam_travels_mobile/providers/manager_provider.dart';
import 'package:sri_jayam_travels_mobile/repositories/manager_repository.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_new_booking_screen.dart';

const _staff = UserProfile(
  id: 'mgr-1',
  email: 'ops@example.com',
  fullName: 'Priya Raman',
  role: 'manager',
);

const _vehicles = [
  VehicleOption(
    id: 'v1',
    registration: 'PY01AB1234',
    status: 'active',
    makeModel: 'Toyota Innova',
  ),
  VehicleOption(
    id: 'v2',
    registration: 'PY01CD5678',
    status: 'active',
    makeModel: 'Swift Dzire',
  ),
  VehicleOption(id: 'v3', registration: 'PY01EF0000', status: 'maintenance'),
];

const _drivers = [
  DriverOption(
    id: 'd1',
    name: 'Arun Kumar',
    status: 'active',
    phone: '9000000001',
  ),
  DriverOption(id: 'd2', name: 'Bala Murugan', status: 'active'),
  DriverOption(id: 'd3', name: 'Inactive Ivan', status: 'inactive'),
];

const _existingNumbers = ['FY26-APR-0001', 'FY26-JUL-0051', 'FY26-MAY-0023'];

class _FakeRepo implements ManagerRepository {
  _FakeRepo({this.busy = BusyResources.none});

  final BusyResources busy;
  final created = <({NewBookingDraft draft, String actor, String? actorId})>[];

  @override
  Future<List<VehicleOption>> vehicles() async => _vehicles;

  @override
  Future<List<DriverOption>> drivers() async => _drivers;

  @override
  Future<BusyResources> busyResources(DateTime start, DateTime end) async =>
      busy;

  @override
  Future<List<CustomerOption>> recentCustomers({int limit = 500}) async => [
    CustomerOption(
      name: 'Sujitha',
      contact: '9150030007',
      customerId: 'c-1',
      lastTrip: DateTime(2026, 7, 22),
    ),
    const CustomerOption(name: 'Manoj', contact: '9629094745'),
  ];

  @override
  Future<CreatedBooking> createBooking(
    NewBookingDraft draft, {
    required String actorName,
    String? actorId,
    String actorRole = 'manager',
  }) async {
    created.add((draft: draft, actor: actorName, actorId: actorId));
    return (
      id: 'new-id',
      bookingNumber: nextBookingNumber(draft.startDate, _existingNumbers),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

Future<void> _pump(WidgetTester tester, _FakeRepo repo) async {
  tester.view.physicalSize = const Size(1080, 2340); // 360 × 780 logical
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: AppRoutes.managerTrips,
    routes: [
      GoRoute(
        path: AppRoutes.managerTrips,
        builder: (context, __) => Scaffold(
          body: TextButton(
            onPressed: () => context.push(AppRoutes.managerNewBooking),
            child: const Text('open'),
          ),
        ),
      ),
      // Same order as the app router: the static route before :id.
      GoRoute(
        path: AppRoutes.managerNewBooking,
        builder: (_, __) => const ManagerNewBookingScreen(),
      ),
      GoRoute(
        path: '/manager/trips/:id',
        builder: (_, s) =>
            Scaffold(body: Text('detail ${s.pathParameters['id']}')),
      ),
    ],
  );
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        managerRepositoryProvider.overrideWithValue(repo),
        currentProfileProvider.overrideWithValue(_staff),
      ],
      child: MaterialApp.router(
        theme: buildWireframeLightTheme(),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

Future<void> _reveal(WidgetTester tester, Finder f) async {
  final list = find
      .descendant(
        of: find.byType(AnimatedSwitcher),
        matching: find.byType(ListView),
      )
      .first;
  await tester.scrollUntilVisible(
    f,
    200,
    scrollable: find
        .descendant(of: list, matching: find.byType(Scrollable))
        .first,
  );
  await tester.pumpAndSettle();
}

/// Scrolls the current step's list until [f] is built, then taps it.
Future<void> _tap(WidgetTester tester, Finder f) async {
  final list = find
      .descendant(
        of: find.byType(AnimatedSwitcher),
        matching: find.byType(ListView),
      )
      .first;
  await tester.scrollUntilVisible(
    f,
    200,
    scrollable: find
        .descendant(of: list, matching: find.byType(Scrollable))
        .first,
  );
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Future<void> _enter(WidgetTester tester, String key, String text) async {
  final f = find.byKey(Key(key));
  final list = find
      .descendant(
        of: find.byType(AnimatedSwitcher),
        matching: find.byType(ListView),
      )
      .first;
  await tester.scrollUntilVisible(
    f,
    200,
    scrollable: find
        .descendant(of: list, matching: find.byType(Scrollable))
        .first,
  );
  await tester.enterText(f, text);
  await tester.pump();
}

Future<void> _next(WidgetTester tester) async {
  await tester.tap(find.byKey(const Key('nb-next')));
  await tester.pumpAndSettle();
}

Future<void> _pickToday(WidgetTester tester) async {
  await _tap(tester, find.byKey(const Key('nb-start-date')));
  await tester.tap(find.text('OK'));
  await tester.pumpAndSettle();
}

void main() {
  group('booking number', () {
    test(
      'FY boundary: 31 Mar belongs to the FY that started the April before',
      () {
        expect(bookingFyPrefix(DateTime(2027, 3, 31)), 'FY26-');
        expect(
          nextBookingNumber(DateTime(2027, 3, 31), const []),
          'FY26-MAR-0001',
        );
        expect(
          nextBookingNumber(DateTime(2027, 1, 5), const []),
          'FY26-JAN-0001',
        );
      },
    );

    test('1 Apr starts a new FY sequence at 0001', () {
      expect(
        nextBookingNumber(DateTime(2027, 4, 1), _existingNumbers),
        'FY27-APR-0001',
      );
      expect(
        nextBookingNumber(DateTime(2026, 4, 1), const ['FY25-MAR-0412']),
        'FY26-APR-0001',
      );
    });

    test('increments from the numeric max across all months of the FY', () {
      // Text max would be FY26-MAY-0023; the real max is 0051.
      expect(
        nextBookingNumber(DateTime(2026, 10, 29), _existingNumbers),
        'FY26-OCT-0052',
      );
      expect(
        nextBookingNumber(DateTime(2027, 3, 31), [
          ..._existingNumbers,
          'FY25-MAR-0999',
          'BK-123456',
          null,
        ]),
        'FY26-MAR-0052',
      );
      expect(
        nextBookingNumber(DateTime(2026, 10, 29), _existingNumbers, bump: 2),
        'FY26-OCT-0054',
      );
    });
  });

  group('validation', () {
    test('Indian mobile', () {
      for (final ok in [
        '9840012345',
        '+91 98400 12345',
        '09840012345',
        '919840012345',
        '6000000000',
      ]) {
        expect(normalizeIndianMobile(ok), isNotNull, reason: ok);
        expect(indianMobileError(ok), isNull, reason: ok);
      }
      expect(normalizeIndianMobile('+91 98400 12345'), '9840012345');
      for (final bad in ['12345', '5840012345', '98400123456', 'abcdefghij']) {
        expect(normalizeIndianMobile(bad), isNull, reason: bad);
        expect(indianMobileError(bad), isNotNull, reason: bad);
      }
      expect(indianMobileError('   '), isNull, reason: 'optional');
    });

    test('customer name', () {
      expect(customerNameError(''), isNotNull);
      expect(customerNameError("R. O'Neil-Kumar"), isNull);
      expect(customerNameError('சுஜிதா'), isNull);
      expect(customerNameError('Ravi 123'), isNotNull);
      expect(customerNameError('a' * 61), isNotNull);
    });

    test('busy resources: overlapping open bookings only', () {
      final busy = BusyResources.fromRows(
        [
          {
            'vehicle_id': 'v1',
            'driver_id': 'd1',
            'status': 'assigned',
            'start_date': '2026-11-01',
            'end_date': '2026-11-03',
          },
          {
            'vehicle_id': 'v2',
            'driver_id': 'd2',
            'status': 'cancelled',
            'start_date': '2026-11-02',
            'end_date': null,
          },
          {
            'vehicle_id': 'v3',
            'driver_id': null,
            'status': 'draft',
            'start_date': '2026-11-05',
            'end_date': null,
          },
          {
            'vehicle_id': 'v4',
            'driver_id': 'd4',
            'status': 'pending',
            'start_date': '2026-11-02',
            'end_date': null,
          },
        ],
        start: DateTime(2026, 11, 3),
        end: DateTime(2026, 11, 4),
      );
      expect(busy.vehicleIds, {'v1'});
      expect(busy.driverIds, {'d1'});
      expect(
        bookingOverlaps(
          start: DateTime(2026, 11, 2),
          otherStart: DateTime(2026, 11, 2),
        ),
        isTrue,
      );
    });

    test('draft row: multi-day end date, top-level names, type_data shape', () {
      final draft = NewBookingDraft(
        type: TripType.multiDay,
        customerName: ' Sujitha ',
        customerContact: '9150030007',
        startDate: DateTime(2026, 11, 10),
        startTime: '06:30',
        pickup: 'Pondy',
        drop: 'Ooty',
        numberOfDays: 3,
        vehicle: _vehicles[0],
        driver: _drivers[0],
        totalFare: 9000,
        advance: 2000,
      );
      final row = draft.toRow(
        bookingNumber: 'FY26-NOV-0052',
        actorName: 'Priya',
        actorId: 'mgr-1',
      );
      expect(row['status'], 'assigned');
      expect(row['booking_id'], 'FY26-NOV-0052');
      expect(row['end_date'], '2026-11-12');
      expect(row['driver_name'], 'Arun Kumar');
      expect(row['vehicle_reg'], 'PY01AB1234');
      expect(row['created_by'], 'mgr-1');
      expect(row['customer_name'], 'Sujitha');
      final td = row['type_data'] as Map<String, dynamic>;
      expect(td['numberOfDays'], 3);
      expect(td['destination'], 'Ooty');
      expect(td['advance'], 2000);
      expect(td['balance'], 7000);
      expect(td['self_drive'], false);
      expect(td['booking_ref'], 'FY26-NOV-0052');
      expect(td['vehicle_registration'], 'PY01AB1234');
    });
  });

  testWidgets(
    'one-way with a driver: validates, skips booked vehicle, creates assigned',
    (tester) async {
      final repo = _FakeRepo(
        busy: const BusyResources(vehicleIds: {'v2'}, driverIds: {'d2'}),
      );
      await _pump(tester, repo);
      expect(find.text('What kind of trip?'), findsOneWidget);

      // Step 1 — type is required.
      await _next(tester);
      expect(find.text('Choose a trip type'), findsOneWidget);
      await _tap(tester, find.byKey(const Key('nb-type-one_way')));
      await _next(tester);

      // Step 2 — name required, phone must be valid if given.
      await _enter(tester, 'nb-phone', '12345');
      await _next(tester);
      expect(find.text('Customer name is required'), findsOneWidget);
      expect(find.text('Enter a valid 10-digit mobile number'), findsOneWidget);
      await _enter(tester, 'nb-name', 'Lakshmi Narayanan');
      await _enter(tester, 'nb-phone', '9840012345');
      await _next(tester);

      // Step 3 — date + route required.
      await _next(tester);
      expect(find.text('Pick the trip date'), findsOneWidget);
      expect(find.text('Enter the pickup location'), findsOneWidget);
      await _pickToday(tester);
      await _enter(tester, 'nb-pickup', 'Pondy Bus Stand');
      await _enter(tester, 'nb-drop', 'Chennai Airport');
      await _next(tester);

      // Step 4 — active vehicles only; the busy one is disabled + "Booked".
      expect(find.text('PY01EF0000'), findsNothing);
      expect(find.text('Inactive Ivan'), findsNothing);
      final busyTile = find.byKey(const Key('nb-vehicle-v2'));
      expect(
        find.descendant(of: busyTile, matching: find.text('Booked')),
        findsOneWidget,
      );
      await _tap(tester, busyTile);
      await _next(tester);
      expect(find.text('Choose a vehicle'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byKey(const Key('nb-driver-d2')),
          matching: find.text('Booked'),
        ),
        findsOneWidget,
      );
      await _tap(tester, find.byKey(const Key('nb-vehicle-v1')));
      await _tap(tester, find.byKey(const Key('nb-driver-d1')));
      await _next(tester);

      // Step 5 — fare, review, create.
      await _enter(tester, 'nb-fare', '4500');
      await _enter(tester, 'nb-advance', '5000');
      await tester.tap(find.byKey(const Key('nb-create')));
      await tester.pumpAndSettle();
      expect(
        find.text('Advance cannot be more than the total fare'),
        findsOneWidget,
      );
      expect(repo.created, isEmpty);
      await _enter(tester, 'nb-advance', '1000');
      await tester.tap(find.byKey(const Key('nb-create')));
      await tester.pumpAndSettle();

      expect(repo.created, hasLength(1));
      final c = repo.created.single;
      expect(c.actor, 'Priya Raman');
      expect(c.actorId, 'mgr-1');
      final d = c.draft;
      expect(d.type, TripType.oneWay);
      expect(d.status, 'assigned');
      expect(d.customerContact, '9840012345');
      expect(d.vehicle.id, 'v1');
      expect(d.effectiveDriver?.id, 'd1');
      expect(d.totalFare, 4500);
      expect(d.advance, 1000);
      final row = d.toRow(
        bookingNumber: 'X',
        actorName: c.actor,
        actorId: c.actorId,
      );
      expect(row['pickup_location'], 'Pondy Bus Stand');
      expect(row['drop_location'], 'Chennai Airport');
      expect(row['driver_id'], 'd1');
      expect(
        (row['type_data'] as Map).keys,
        containsAll([
          'pickup',
          'drop',
          'driver_name',
          'vehicle_registration',
          'booking_ref',
        ]),
      );

      // Replaced by the trip detail, with the snack.
      final number = nextBookingNumber(DateTime.now(), _existingNumbers);
      expect(find.text('detail new-id'), findsOneWidget);
      expect(find.text('Booking $number created'), findsOneWidget);
    },
  );

  testWidgets('self drive: previous customer, no driver step, saved as assigned', (
    tester,
  ) async {
    final repo = _FakeRepo();
    await _pump(tester, repo);
    await _tap(tester, find.byKey(const Key('nb-type-self_drive')));
    await _next(tester);

    await _tap(tester, find.byKey(const Key('nb-pick-customer')));
    await tester.enterText(find.byKey(const Key('nb-customer-search')), 'suji');
    await tester.pumpAndSettle();
    expect(find.text('Manoj'), findsNothing);
    await tester.tap(find.text('Sujitha'));
    await tester.pumpAndSettle();
    expect(find.text('Linked to an existing customer'), findsOneWidget);
    await _next(tester);

    await _pickToday(tester);
    await _enter(tester, 'nb-deposit', '5000');
    await _enter(tester, 'nb-start-km', '36986');
    await _next(tester);

    expect(find.byKey(const Key('nb-driver-none')), findsNothing);
    expect(find.byKey(const Key('nb-driver-d1')), findsNothing);
    expect(find.textContaining('Self drive — no driver'), findsOneWidget);
    await _tap(tester, find.byKey(const Key('nb-vehicle-v2')));
    await _next(tester);
    await _reveal(tester, find.textContaining('vehicle is reserved'));
    expect(find.textContaining('vehicle is reserved'), findsOneWidget);
    await tester.tap(find.byKey(const Key('nb-create')));
    await tester.pumpAndSettle();

    final d = repo.created.single.draft;
    expect(d.type, TripType.selfDrive);
    expect(d.status, 'assigned');
    expect(d.effectiveDriver, isNull);
    expect(d.customerName, 'Sujitha');
    expect(d.customerId, 'c-1');
    final row = d.toRow(bookingNumber: 'X', actorName: 'Priya Raman');
    expect(row['driver_id'], isNull);
    expect(row['driver_name'], isNull);
    expect(row['customer_id'], 'c-1');
    expect(row['vehicle_reg'], 'PY01CD5678');
    final td = row['type_data'] as Map<String, dynamic>;
    expect(td['self_drive'], true);
    expect(td['securityDeposit'], 5000);
    expect(td['startKm'], 36986);
    expect(td['start_km'], 36986);
    expect(td.keys, containsAll(['pickupTime', 'returnTime']));
    expect(find.text('detail new-id'), findsOneWidget);
  });
}
