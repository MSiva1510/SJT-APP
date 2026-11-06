// ─────────────────────────────────────────────────────────────────────────────
// manager_mode_test.dart — manager mode (admin / manager accounts).
// Unit: role redirect + trip filters. Widget: Home KPIs + resolve alert,
// Trips filter chips, trip detail assign + status change, expense approval,
// More → WhatsApp inbox → chat (24 h reply window),
// and a 360-wide render audit of every manager route — all against an
// in-memory FakeManagerRepository injected via ProviderScope overrides.
// App boot: a staff session lands on /manager, a demo driver on /driver.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/models/expense_numbering.dart';
import 'package:sri_jayam_travels_mobile/core/auth/auth_state.dart';
import 'package:sri_jayam_travels_mobile/core/demo/demo_session.dart';
import 'package:sri_jayam_travels_mobile/core/formatters.dart';
import 'package:sri_jayam_travels_mobile/core/theme/wireframe_theme.dart';
import 'package:sri_jayam_travels_mobile/main.dart';
import 'package:sri_jayam_travels_mobile/models/manager_directory.dart';
import 'package:sri_jayam_travels_mobile/models/manager_invoice.dart';
import 'package:sri_jayam_travels_mobile/models/manager_models.dart';
import 'package:sri_jayam_travels_mobile/models/manager_report.dart';
import 'package:sri_jayam_travels_mobile/models/manager_whatsapp.dart';
import 'package:sri_jayam_travels_mobile/models/new_booking.dart';
import 'package:sri_jayam_travels_mobile/models/user_profile.dart';
import 'package:sri_jayam_travels_mobile/navigation/app_router.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';
import 'package:sri_jayam_travels_mobile/providers/manager_provider.dart';
import 'package:sri_jayam_travels_mobile/providers/notification_provider.dart';
import 'package:sri_jayam_travels_mobile/repositories/auth_repository.dart';
import 'package:sri_jayam_travels_mobile/repositories/manager_repository.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_attendance_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_customers_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_documents_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_drivers_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_vehicles_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_expenses_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_fleet_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_home_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_invoices_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/invoices/manager_invoice_editor_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_more_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_trip_detail_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_trips_screen.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_whatsapp_screen.dart';
import 'package:sri_jayam_travels_mobile/services/auth_service.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/manager_scaffold.dart';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const _staff = UserProfile(
  id: 'mgr-1',
  email: 'ops@example.com',
  fullName: 'Priya Raman',
  role: 'manager',
);

final _today = DateTime.now();
final _tomorrow = _today.add(const Duration(days: 1));

ManagerBooking _b(
  String id,
  String status, {
  DateTime? date,
  String? driverId,
  String? driverName,
  String? vehicleId,
  String? vehicleReg,
  String customer = 'Customer',
  double? fare,
}) => ManagerBooking(
  id: id,
  status: status,
  bookingNumber: 'BK-$id',
  customerName: customer,
  customerContact: '+91 98400 00000',
  pickup: 'Chennai Airport',
  drop: 'Mahabalipuram',
  startDate: date ?? _today,
  startTime: '09:30:00',
  driverId: driverId,
  driverName: driverName,
  vehicleId: vehicleId,
  vehicleReg: vehicleReg,
  totalFare: fare,
  type: 'local',
);

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

const _vehicles = [
  VehicleOption(
    id: 'v1',
    registration: 'TN01AB1234',
    status: 'active',
    makeModel: 'Toyota Innova',
  ),
  VehicleOption(id: 'v2', registration: 'TN02CD5678', status: 'maintenance'),
];

class FakeManagerRepository implements ManagerRepository {
  FakeManagerRepository({
    List<ManagerBooking>? bookings,
    List<FleetAlert>? alerts,
    List<PendingExpense>? expenses,
  }) : bookingsList = bookings ?? [],
       alertsList = alerts ?? [],
       expensesList = expenses ?? [];

  List<ManagerBooking> bookingsList;
  List<FleetAlert> alertsList;
  List<PendingExpense> expensesList;
  @override
  bool nonTripInvoicesAvailable = true;
  final resolved = <String>[];
  final acknowledged = <String>[];
  final whatsappSends = <({String action, String phone, String text})>[];
  final assignCalls =
      <({String booking, String driver, String vehicle, String actor})>[];
  final statusCalls =
      <
        ({
          String booking,
          String to,
          String actor,
          String role,
          String? remarks,
        })
      >[];
  final expenseCalls = <({String id, bool approve, String? reason})>[];
  final attendanceCalls = <({String driver, String status})>[];

  ManagerDashboard dashboardValue = const ManagerDashboard(
    todayTrips: 4,
    activeTrips: 1,
    unassigned: 2,
    pendingApproval: 3,
    pendingExpenses: 5,
    presentDrivers: 2,
    totalDrivers: 3,
    todayRevenue: 12500,
    upcoming: [],
  );

  ManagerBooking _with(
    ManagerBooking b, {
    String? status,
    DriverOption? d,
    VehicleOption? v,
  }) => ManagerBooking(
    id: b.id,
    status: status ?? b.status,
    bookingNumber: b.bookingNumber,
    customerName: b.customerName,
    customerContact: b.customerContact,
    pickup: b.pickup,
    drop: b.drop,
    startDate: b.startDate,
    startTime: b.startTime,
    driverId: d?.id ?? b.driverId,
    driverName: d?.name ?? b.driverName,
    vehicleId: v?.id ?? b.vehicleId,
    vehicleReg: v?.registration ?? b.vehicleReg,
    totalFare: b.totalFare,
    type: b.type,
  );

  @override
  Future<ManagerDashboard> dashboard({DateTime? now}) async => dashboardValue;

  @override
  Future<ManagerReport> reportForPeriod(ManagerReportPeriod period) async =>
      ManagerReport.fromBookings(const []);

  @override
  Future<List<FleetAlert>> activeAlerts() async =>
      alertsList.where((a) => !resolved.contains(a.id)).toList();

  @override
  Future<List<ManagerBooking>> bookings({int limit = 200}) async =>
      bookingsList;

  @override
  Future<ManagerBooking> booking(String id) async =>
      bookingsList.firstWhere((b) => b.id == id);

  @override
  Future<List<DriverOption>> drivers() async => _drivers;

  @override
  Future<List<VehicleOption>> vehicles() async => _vehicles;

  final addedExpenses = <NewExpenseDraft>[];

  @override
  Future<String> addExpense(
    NewExpenseDraft draft, {
    required String actorName,
  }) async {
    addedExpenses.add(draft);
    return 'EXP-2610-0001';
  }

  @override
  Future<List<ManagerBooking>> vehicleBookings(String vehicleId) async =>
      bookingsList.where((b) => b.vehicleId == vehicleId).toList();

  @override
  Future<TripTrack> tripTrack(ManagerBooking b, {int limit = 3000}) async =>
      TripTrack.empty;

  @override
  Future<List<VehiclePosition>> fleetPositions() async => [
    VehiclePosition(
      vehicle: _vehicles[0],
      latitude: 13.08,
      longitude: 80.27,
      speedKmh: 42,
      address: 'Anna Salai, Chennai',
      at: DateTime.now().subtract(const Duration(minutes: 2)),
    ),
    VehiclePosition(vehicle: _vehicles[1]),
  ];

  @override
  Future<List<PendingExpense>> expenses({String status = 'pending'}) async =>
      expensesList;

  @override
  Future<List<AttendanceEntry>> attendanceFor(DateTime date) async => [
    AttendanceEntry(
      driver: _drivers[0],
      recordId: 'a1',
      status: 'present',
      checkIn: '08:05:00',
    ),
    AttendanceEntry(driver: _drivers[1]),
  ];

  @override
  Future<void> changeStatus({
    required ManagerBooking booking,
    required String to,
    required String actorName,
    required String actorRole,
    String? remarks,
  }) async {
    statusCalls.add((
      booking: booking.id,
      to: to,
      actor: actorName,
      role: actorRole,
      remarks: remarks,
    ));
    bookingsList = [
      for (final b in bookingsList)
        b.id == booking.id ? _with(b, status: to) : b,
    ];
  }

  @override
  Future<void> assign({
    required ManagerBooking booking,
    required DriverOption driver,
    required VehicleOption vehicle,
    required String actorName,
  }) async {
    assignCalls.add((
      booking: booking.id,
      driver: driver.id,
      vehicle: vehicle.id,
      actor: actorName,
    ));
    bookingsList = [
      for (final b in bookingsList)
        b.id == booking.id
            ? _with(b, status: 'assigned', d: driver, v: vehicle)
            : b,
    ];
  }

  @override
  Future<void> decideExpense({
    required PendingExpense expense,
    required bool approve,
    required String actorName,
    String? reason,
  }) async {
    expenseCalls.add((id: expense.id, approve: approve, reason: reason));
    expensesList = expensesList.where((e) => e.id != expense.id).toList();
  }

  @override
  Future<void> markAttendance({
    required AttendanceEntry entry,
    required DateTime date,
    required String status,
    String? leaveType,
  }) async {
    attendanceCalls.add((driver: entry.driver.id, status: status));
  }

  @override
  Future<void> resolveAlert(FleetAlert alert) async => resolved.add(alert.id);

  @override
  Future<void> acknowledgeSosAlert(FleetAlert alert) async {
    acknowledged.add(alert.id);
    final index = alertsList.indexWhere((item) => item.id == alert.id);
    if (index >= 0) {
      final current = alertsList[index];
      alertsList[index] = FleetAlert(
        id: current.id,
        title: current.title,
        priority: current.priority,
        status: 'acknowledged',
        alertType: current.alertType,
        description: current.description,
        bookingRef: current.bookingRef,
        latitude: current.latitude,
        longitude: current.longitude,
        photoUrl: current.photoUrl,
        detectedAt: current.detectedAt,
        managerCheckedAt: DateTime.now(),
        autoCloseAt: DateTime.now().add(const Duration(days: 2)),
      );
    }
  }

  @override
  Future<void> sendManagerWhatsApp({
    required String action,
    required String phone,
    required String text,
  }) async {
    whatsappSends.add((action: action, phone: phone, text: text));
  }

  // ── Directory (Documents · Vehicles · Drivers · Customers) ──────────────
  List<VehicleRecord> vehicleRecordList = [
    VehicleRecord(
      id: 'v1',
      registration: 'TN01AB1234',
      status: 'active',
      makeModel: 'Toyota Innova',
      currentKm: 68420,
      driverName: 'Arun Kumar',
      insuranceExpiry: DateTime.now().add(const Duration(days: 10)),
      pollutionExpiry: DateTime.now().subtract(const Duration(days: 12)),
      fitnessExpiry: DateTime(2029, 6, 10),
    ),
    const VehicleRecord(
      id: 'v2',
      registration: 'TN02CD5678',
      status: 'maintenance',
    ),
  ];
  List<DriverRecord> driverRecordList = [
    DriverRecord(
      id: 'd1',
      name: 'Arun Kumar',
      status: 'active',
      phone: '9876543210',
      vehicleReg: 'TN01AB1234',
      licenseExpiry: DateTime(2030, 8, 2),
    ),
    const DriverRecord(id: 'd2', name: 'Bala', status: 'inactive'),
  ];
  List<CustomerRecord> customerRecordList = [
    CustomerRecord(
      id: 'c1',
      name: 'Mani',
      phone: '7305581235',
      trips: 3,
      completedTrips: 2,
      revenue: 8400,
      lastTrip: DateTime(2026, 10, 20),
    ),
    const CustomerRecord(id: 'c2', name: 'Gopal', phone: '9500387595'),
  ];
  List<Map<String, dynamic>> documentRecordList = [];

  @override
  Future<List<VehicleRecord>> vehicleRecords() async => vehicleRecordList;

  @override
  Future<List<DriverRecord>> driverRecords() async => driverRecordList;

  @override
  Future<List<CustomerRecord>> customerRecords() async => customerRecordList;

  List<InvoiceRecord> invoiceList = [
    InvoiceRecord.fromMap(const {
      'id': 'b9',
      'booking_number': 'BK-2610-0042',
      'status': 'completed',
      'customer_name': 'Mani Kumar',
      'customer_contact': '7305581235',
      'pickup_location': 'Puducherry',
      'drop_location': 'Chennai',
      'start_date': '2026-10-20',
      'total_km': 320,
      'total_fare': 5400,
      'toll': 300,
      'vehicle_reg': 'TN01AB1234',
    }),
    InvoiceRecord.fromMap(const {
      'id': 'b8',
      'booking_number': 'BK-2609-0007',
      'status': 'closed',
      'customer_name': 'Gopal',
      'pickup_location': 'Villupuram',
      'drop_location': 'Tindivanam',
      'start_date': '2026-09-02',
      'total_fare': 1600,
    }),
  ];

  @override
  Future<List<InvoiceRecord>> invoices() async => invoiceList;

  @override
  Future<InvoiceRecord> saveInvoice(InvoiceRecord invoice) async {
    invoiceList = [
      for (final existing in invoiceList)
        if (existing.id == invoice.id) invoice else existing,
    ];
    return invoice;
  }

  @override
  Future<InvoiceBusiness> invoiceBusiness() async => const InvoiceBusiness();

  @override
  Future<List<ExpiryItem>> expiringDocuments() async => buildExpiryList(
    documents: const [],
    vehicles: vehicleRecordList,
    drivers: driverRecordList,
  );

  @override
  Future<List<Map<String, dynamic>>> documentRecords() async =>
      documentRecordList;

  @override
  Future<List<ManagerBooking>> recentTrips({
    String? driverId,
    String? vehicleId,
    String? customerId,
    String? customerName,
    int limit = 10,
  }) async => bookingsList
      .where(
        (b) =>
            (driverId == null || b.driverId == driverId) &&
            (vehicleId == null || b.vehicleId == vehicleId) &&
            (customerName == null || b.customerName == customerName),
      )
      .toList();

  // New-booking flow is covered in manager_new_booking_test.dart.
  @override
  Future<List<CustomerOption>> recentCustomers({int limit = 500}) async =>
      const [];

  @override
  Future<BusyResources> busyResources(DateTime start, DateTime end) async =>
      BusyResources.none;

  // ── WhatsApp ──
  // Ravi wrote 2 days ago (reply window closed); Meena wrote 10 min ago.
  List<WhatsAppConversation> whatsAppList = [
    WhatsAppConversation(
      phone: '917305581235',
      contactName: 'Ravi Kumar',
      needsStaff: true,
      unread: 2,
      botPausedUntil: _today.add(const Duration(hours: 3)),
      lastInboundAt: _today.subtract(const Duration(days: 2)),
      lastMessageAt: _today.subtract(const Duration(days: 2)),
    ),
    WhatsAppConversation(
      phone: '919500387595',
      contactName: 'Meena',
      unread: 1,
      lastInboundAt: _today.subtract(const Duration(minutes: 10)),
      lastMessageAt: _today.subtract(const Duration(minutes: 10)),
    ),
  ];
  final markedRead = <String>[];
  final replies = <({String phone, String text})>[];
  final resumed = <String>[];

  @override
  Future<List<WhatsAppConversation>> whatsAppConversations({
    int limit = 500,
  }) async => sortConversations(whatsAppList);

  @override
  Future<WhatsAppThread> whatsAppThread(String phone, {int limit = 200}) async {
    final conv = whatsAppList.where((c) => c.phone == phone).firstOrNull;
    final at = conv?.lastInboundAt ?? _today;
    return WhatsAppThread(
      conversation: conv,
      messages: mergeWhatsAppMessages(
        [
          WhatsAppMessage.fromInbound({
            'id': 1,
            'from_phone': phone,
            'message_type': 'text',
            'text_body': 'Need a cab to the airport',
            'received_at': at
                .subtract(const Duration(minutes: 5))
                .toUtc()
                .toIso8601String(),
          }),
          WhatsAppMessage.fromInbound({
            'id': 2,
            'from_phone': phone,
            'message_type': 'image',
            'received_at': at.toUtc().toIso8601String(),
          }),
        ],
        [
          WhatsAppMessage.fromOutbound({
            'id': 9,
            'to_phone': phone,
            'kind': 'bot',
            'body': 'Sure! When do you want to travel?',
            'status': 'read',
            'created_at': at
                .subtract(const Duration(minutes: 4))
                .toUtc()
                .toIso8601String(),
          }),
        ],
      ),
    );
  }

  @override
  Future<void> markWhatsAppRead(String phone) async {
    markedRead.add(phone);
    whatsAppList = [
      for (final c in whatsAppList)
        c.phone == phone ? c.copyWith(unread: 0) : c,
    ];
  }

  @override
  Future<WhatsAppMessage?> sendWhatsAppReply(String phone, String text) async {
    replies.add((phone: phone, text: text));
    return null;
  }

  @override
  Future<void> resumeWhatsAppBot(String phone) async => resumed.add(phone);

  @override
  Future<Future<void> Function()> subscribeWhatsApp({
    String? phone,
    required void Function() onChange,
  }) async => () async {};

  @override
  Future<CreatedBooking> createBooking(
    NewBookingDraft draft, {
    required String actorName,
    String? actorId,
    String actorRole = 'manager',
  }) async => throw UnimplementedError();

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// ── Harness ──────────────────────────────────────────────────────────────────

GoRouter _testRouter(String initial) => GoRouter(
  initialLocation: initial,
  routes: [
    ShellRoute(
      builder: (_, state, child) =>
          ManagerTabScaffold(location: state.matchedLocation, child: child),
      routes: [
        GoRoute(
          path: AppRoutes.managerHome,
          builder: (_, __) => const ManagerHomeScreen(),
        ),
        GoRoute(
          path: AppRoutes.managerTrips,
          builder: (_, __) => const ManagerTripsScreen(),
        ),
        GoRoute(
          path: AppRoutes.managerFleet,
          builder: (_, __) => const ManagerFleetScreen(),
        ),
        GoRoute(
          path: AppRoutes.managerMore,
          builder: (_, __) => const ManagerMoreScreen(),
        ),
      ],
    ),
    // Before /manager/trips/:id so "new" is not read as an id.
    GoRoute(
      path: AppRoutes.managerNewBooking,
      builder: (_, s) => Scaffold(
        body: Text('new booking for ${(s.extra as CustomerOption?)?.name}'),
      ),
    ),
    GoRoute(
      path: '/manager/trips/:id',
      builder: (_, s) =>
          ManagerTripDetailScreen(bookingId: s.pathParameters['id']!),
    ),
    GoRoute(
      path: AppRoutes.managerExpenses,
      builder: (_, __) => const ManagerExpensesScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerAttendance,
      builder: (_, __) => const ManagerAttendanceScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerNotifications,
      builder: (_, __) => const Scaffold(body: Text('notifications')),
    ),
    GoRoute(
      path: AppRoutes.managerDocuments,
      builder: (_, __) => const ManagerDocumentsScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerVehicles,
      builder: (_, __) => const ManagerVehiclesScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerDrivers,
      builder: (_, __) => const ManagerDriversScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerCustomers,
      builder: (_, __) => const ManagerCustomersScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerInvoices,
      builder: (_, __) => ManagerInvoicesScreen(now: DateTime(2026, 10, 30)),
    ),
    GoRoute(
      path: AppRoutes.managerInvoice,
      builder: (_, s) =>
          ManagerInvoiceScreen(invoice: s.extra! as InvoiceRecord),
    ),
    GoRoute(
      path: AppRoutes.managerInvoiceEditor,
      builder: (_, s) => ManagerInvoiceEditorScreen(
        invoice: s.extra! as InvoiceRecord,
        create: s.uri.queryParameters['create'] == 'true',
      ),
    ),
    GoRoute(
      path: AppRoutes.managerWhatsApp,
      builder: (_, __) => const ManagerWhatsAppScreen(),
    ),
    GoRoute(
      path: AppRoutes.managerWhatsAppChat,
      builder: (_, s) => ManagerWhatsAppChatScreen(
        conversation: s.extra! as WhatsAppConversation,
      ),
    ),
  ],
);

Future<GoRouter> _pump(
  WidgetTester tester,
  FakeManagerRepository repo, {
  String initial = AppRoutes.managerHome,
}) async {
  tester.view.physicalSize = const Size(1080, 2340); // 360 × 780 logical
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);
  final router = _testRouter(initial);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        managerRepositoryProvider.overrideWithValue(repo),
        currentProfileProvider.overrideWithValue(_staff),
        unreadCountProvider.overrideWithValue(3),
      ],
      child: MaterialApp.router(
        theme: buildWireframeLightTheme(),
        routerConfig: router,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(super.repo, this.result);
  final AuthState result;
  @override
  Future<AuthState> restoreSession() async => result;
}

String _location(GoRouter r) => r.routerDelegate.currentConfiguration.uri.path;

Future<void> _pumpFor(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 100);
  for (var t = Duration.zero; t < total; t += step) {
    await tester.pump(step);
  }
}

/// Lists build lazily, so an item below the 780-px fold does not exist until
/// scrolled to. Scrolls the screen's main (RefreshIndicator) list until [f]
/// is built and visible; a negative [delta] scrolls back up.
Future<void> _reveal(
  WidgetTester tester,
  Finder f, {
  double delta = 250,
}) async {
  await tester.scrollUntilVisible(
    f,
    delta,
    scrollable: find
        .descendant(
          of: find.byType(RefreshIndicator),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

/// [_reveal] for screens without pull-to-refresh (More tab).
Future<void> _revealIn(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(
    f,
    250,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.pumpAndSettle();
}

/// Same for the horizontal filter-chip row on the Trips tab.
Future<void> _revealChip(WidgetTester tester, Finder f) async {
  await tester.scrollUntilVisible(
    f,
    120,
    scrollable: find
        .ancestor(
          of: find.byType(ChoiceChip).first,
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

// ── Tests ────────────────────────────────────────────────────────────────────

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
      authOptions: const FlutterAuthClientOptions(autoRefreshToken: false),
    );
  });

  group('roleRedirect', () {
    const driver = UserProfile(
      id: 'd',
      email: 'd@x',
      fullName: 'D',
      role: 'driver',
    );
    const admin = UserProfile(
      id: 'a',
      email: 'a@x',
      fullName: 'A',
      role: 'admin',
    );
    const other = UserProfile(
      id: 'o',
      email: 'o@x',
      fullName: 'O',
      role: 'customer',
    );

    test('public routes go to the role home', () {
      expect(
        roleRedirect(_staff, AppRoutes.login, isPublic: true),
        AppRoutes.managerHome,
      );
      expect(
        roleRedirect(admin, AppRoutes.login, isPublic: true),
        AppRoutes.managerHome,
      );
      expect(
        roleRedirect(driver, AppRoutes.login, isPublic: true),
        AppRoutes.driverHome,
      );
    });

    test('each role is kept in its own area', () {
      expect(
        roleRedirect(_staff, '/driver', isPublic: false),
        AppRoutes.managerHome,
      );
      expect(
        roleRedirect(_staff, '/driver/trips/1', isPublic: false),
        AppRoutes.managerHome,
      );
      expect(roleRedirect(_staff, '/manager/trips/1', isPublic: false), isNull);
      expect(
        roleRedirect(driver, '/manager', isPublic: false),
        AppRoutes.driverHome,
      );
      expect(
        roleRedirect(driver, '/manager/fleet', isPublic: false),
        AppRoutes.driverHome,
      );
      expect(roleRedirect(driver, '/driver/trips', isPublic: false), isNull);
    });

    test('unknown roles are unauthorized', () {
      expect(
        roleRedirect(other, '/driver', isPublic: false),
        AppRoutes.unauthorized,
      );
      expect(
        roleRedirect(other, AppRoutes.login, isPublic: true),
        AppRoutes.unauthorized,
      );
      expect(
        roleRedirect(other, AppRoutes.unauthorized, isPublic: false),
        isNull,
      );
    });
  });

  group('trip filters', () {
    final trips = [
      _b('1', 'pending'),
      _b(
        '2',
        'assigned',
        driverId: 'd1',
        driverName: 'Arun',
        vehicleId: 'v1',
        vehicleReg: 'TN01',
      ),
      _b('3', 'started', driverId: 'd1', vehicleId: 'v1'),
      _b('4', 'completed', date: _today.subtract(const Duration(days: 2))),
      _b('5', 'approved', date: _tomorrow, customer: 'Meena Travels'),
    ];

    test('chips', () {
      List<String> ids(ManagerTripFilter f) =>
          filterManagerTrips(trips, f, '').map((b) => b.id).toList();
      expect(ids(ManagerTripFilter.all), ['1', '2', '3', '4', '5']);
      expect(ids(ManagerTripFilter.today), ['1', '2', '3']);
      expect(ids(ManagerTripFilter.upcoming), ['1', '2', '3', '5']);
      expect(ids(ManagerTripFilter.unassigned), ['1', '5']);
      expect(ids(ManagerTripFilter.pending), ['1']);
      expect(ids(ManagerTripFilter.active), ['3']);
      expect(ids(ManagerTripFilter.completed), ['4']);
    });

    test('search', () {
      expect(
        filterManagerTrips(trips, ManagerTripFilter.all, 'meena').single.id,
        '5',
      );
      expect(
        filterManagerTrips(trips, ManagerTripFilter.all, 'bk-3').single.id,
        '3',
      );
    });
  });

  testWidgets('a driver who starts a trip is marked present for that day', (
    tester,
  ) async {
    final repo = FakeManagerRepository(
      bookings: [
        _b('started-today', 'started', driverId: 'd2', driverName: 'Bala'),
      ],
    );
    await _pump(tester, repo, initial: AppRoutes.managerAttendance);
    await tester.pumpAndSettle();

    expect(repo.attendanceCalls, contains((driver: 'd2', status: 'present')));
  });

  testWidgets('manager acknowledges SOS and schedules its automatic close', (
    tester,
  ) async {
    final repo = FakeManagerRepository(
      alerts: [
        const FleetAlert(
          id: 'al-1',
          title: 'SOS from Arun Kumar',
          priority: 'critical',
          status: 'open',
          alertType: 'sos',
          latitude: 13.0,
          longitude: 80.2,
        ),
      ],
    );
    await _pump(tester, repo);

    expect(find.text('Priya Raman'), findsOneWidget);
    expect(find.text('Manager'), findsOneWidget);
    expect(find.text(inr.format(12500)), findsOneWidget);
    expect(find.text('2/3'), findsOneWidget); // drivers present
    expect(find.text('Pending expenses'), findsOneWidget);
    await _reveal(tester, find.text('SOS from Arun Kumar'));
    expect(find.text('SOS from Arun Kumar'), findsOneWidget);
    expect(find.text('Map'), findsOneWidget);

    await _reveal(tester, find.text('Check'));
    await tester.tap(find.text('Check'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('I have checked'),
      ),
    );
    await tester.pumpAndSettle();

    expect(repo.acknowledged, ['al-1']);
    expect(repo.resolved, isEmpty);
    expect(find.text('SOS from Arun Kumar'), findsOneWidget);
    expect(find.text('Auto-close scheduled'), findsOneWidget);
  });

  testWidgets('trips filter chips narrow the list', (tester) async {
    final repo = FakeManagerRepository(
      bookings: [
        _b('1', 'pending', customer: 'Pending Pat'),
        _b(
          '2',
          'assigned',
          driverId: 'd1',
          driverName: 'Arun',
          vehicleId: 'v1',
          vehicleReg: 'TN01',
          customer: 'Assigned Ann',
        ),
        _b(
          '3',
          'completed',
          customer: 'Done Dan',
          driverId: 'd1',
          vehicleId: 'v1',
        ),
      ],
    );
    await _pump(tester, repo, initial: AppRoutes.managerTrips);

    expect(find.text('Pending Pat'), findsOneWidget);
    expect(find.text('Assigned Ann'), findsOneWidget);
    expect(find.text('Done Dan'), findsOneWidget);

    await _revealChip(tester, find.text('Unassigned · 1'));
    final unassignedChip = find.ancestor(
      of: find.text('Unassigned · 1'),
      matching: find.byType(ChoiceChip),
    );
    await tester.tap(unassignedChip);
    await tester.pumpAndSettle();
    expect(find.text('Pending Pat'), findsOneWidget);
    expect(find.text('Assigned Ann'), findsNothing);
    expect(find.text('Done Dan'), findsNothing);

    await _revealChip(tester, find.text('Completed · 1'));
    final completedChip = find.ancestor(
      of: find.text('Completed · 1'),
      matching: find.byType(ChoiceChip),
    );
    await tester.tap(completedChip);
    await tester.pumpAndSettle();
    expect(find.text('Done Dan'), findsOneWidget);
    expect(find.text('Pending Pat'), findsNothing);

    await tester.enterText(find.byType(TextField), 'zzz');
    await tester.pumpAndSettle();
    expect(find.textContaining('No trips match'), findsOneWidget);
  });

  testWidgets('trip detail: assign driver + vehicle, then start the trip', (
    tester,
  ) async {
    final repo = FakeManagerRepository(
      bookings: [_b('7', 'approved', customer: 'Kavya')],
    );
    await _pump(tester, repo, initial: AppRoutes.managerTripDetail('7'));

    expect(find.text('Kavya'), findsOneWidget);
    final assignBtn = find.text('Assign driver & vehicle');
    await _reveal(tester, assignBtn);
    await tester.tap(assignBtn);
    await tester.pumpAndSettle();

    // Only active drivers / vehicles are offered.
    expect(find.text('Arun Kumar'), findsOneWidget);
    expect(find.text('Inactive Ivan'), findsNothing);
    expect(find.text('TN01AB1234 · Toyota Innova'), findsOneWidget);
    expect(find.textContaining('TN02CD5678'), findsNothing);

    await tester.tap(find.text('Arun Kumar'));
    await tester.tap(find.text('TN01AB1234 · Toyota Innova'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Assign'));
    await tester.pumpAndSettle();

    expect(repo.assignCalls.single, (
      booking: '7',
      driver: 'd1',
      vehicle: 'v1',
      actor: 'Priya Raman',
    ));
    await _reveal(tester, find.text('ASSIGNED'), delta: -250);
    expect(find.text('ASSIGNED'), findsOneWidget);
    // The route map card sits between the status and the assignment card.
    await _reveal(tester, find.text('Arun Kumar'));
    expect(find.text('Arun Kumar'), findsOneWidget);

    final start = find.text('Mark started');
    await _reveal(tester, start);
    await tester.tap(start);
    await tester.pumpAndSettle();
    expect(repo.statusCalls.single.to, 'started');
    expect(repo.statusCalls.single.role, 'manager');
    await _reveal(tester, find.text('IN PROGRESS'), delta: -250);
    expect(find.text('IN PROGRESS'), findsOneWidget);
  });

  testWidgets('trip detail: approve asks for remarks', (tester) async {
    final repo = FakeManagerRepository(bookings: [_b('8', 'pending')]);
    await _pump(tester, repo, initial: AppRoutes.managerTripDetail('8'));

    await _reveal(tester, find.text('Approve'));
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.byType(TextField),
      ),
      'Advance received',
    );
    await tester.tap(
      find.descendant(
        of: find.byType(AlertDialog),
        matching: find.text('Approve'),
      ),
    );
    await tester.pumpAndSettle();

    final call = repo.statusCalls.single;
    expect(call.to, 'approved');
    expect(call.remarks, 'Advance received');
    expect(call.actor, 'Priya Raman');
    await _reveal(tester, find.text('APPROVED'), delta: -250);
    expect(find.text('APPROVED'), findsOneWidget);
  });

  testWidgets('manager sends booking and confirmation WhatsApp templates', (
    tester,
  ) async {
    final repo = FakeManagerRepository(
      bookings: [_b('wa-1', 'confirmed', customer: 'Kavya')],
    );
    await _pump(tester, repo, initial: AppRoutes.managerTripDetail('wa-1'));

    final update = find.text('Send booking update');
    await _reveal(tester, update);
    await tester.tap(update);
    await tester.pumpAndSettle();
    expect(repo.whatsappSends.single.action, 'booking_notification');
    expect(repo.whatsappSends.single.phone, '+91 98400 00000');

    final confirmation = find.text('Send confirmation');
    await _reveal(tester, confirmation);
    await tester.tap(confirmation);
    await tester.pumpAndSettle();
    expect(repo.whatsappSends.map((send) => send.action), [
      'booking_notification',
      'booking_confirmation',
    ]);
  });

  testWidgets('expenses: approve removes the claim', (tester) async {
    final repo = FakeManagerRepository(
      expenses: [
        PendingExpense(
          id: 'e1',
          amount: 850,
          approvalStatus: 'pending',
          expenseType: 'fuel',
          driverName: 'Arun Kumar',
          vehicleReg: 'TN01AB1234',
          expenseDate: _today,
        ),
      ],
    );
    await _pump(tester, repo, initial: AppRoutes.managerExpenses);

    expect(find.text('Fuel'), findsOneWidget);
    expect(find.text(inr.format(850)), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Approve'));
    await tester.pumpAndSettle();

    expect(repo.expenseCalls.single, (id: 'e1', approve: true, reason: null));
    expect(find.text('Nothing to approve'), findsOneWidget);
  });

  testWidgets('document expiry opens details without trip history', (
    tester,
  ) async {
    final repo = FakeManagerRepository()
      ..documentRecordList = [
        {
          'id': 'doc-puc',
          'vehicle_id': 'v1',
          'doc_type': 'pollution',
          'expiry_date': DateTime.now()
              .subtract(const Duration(days: 12))
              .toIso8601String(),
        },
      ];
    await _pump(tester, repo);
    final card = find.byKey(const Key('home-docs-due'));
    await _reveal(tester, card);
    expect(card, findsOneWidget);
    expect(find.text('1 document expired · 1 due in 30 days'), findsOneWidget);

    await tester.tap(card);
    await tester.pumpAndSettle();
    expect(find.text('Document expiry'), findsOneWidget);
    // Needs action: the expired PUC, then insurance due in 10 days.
    expect(find.text('Pollution certificate (PUC)'), findsOneWidget);
    expect(find.text('Insurance'), findsOneWidget);
    expect(find.textContaining('Fitness'), findsNothing);

    await _revealChip(tester, find.byKey(const Key('docs-filter-all')));
    await tester.tap(find.byKey(const Key('docs-filter-all')));
    await tester.pumpAndSettle();
    expect(find.text('Fitness certificate (FC)'), findsOneWidget);
    expect(find.text('Driving licence'), findsOneWidget);

    await tester.tap(find.text('Pollution certificate (PUC)'));
    await tester.pumpAndSettle();
    expect(find.text('Pollution certificate (PUC) details'), findsOneWidget);
    expect(find.text('TN01AB1234'), findsWidgets);
    expect(find.byKey(const Key('vehicle-sheet')), findsNothing);
    expect(find.textContaining('Expired 12 days ago'), findsWidgets);
  });

  testWidgets('More links open Vehicles and Drivers', (tester) async {
    final router = await _pump(
      tester,
      FakeManagerRepository(),
      initial: AppRoutes.managerMore,
    );

    await _revealIn(tester, find.byKey(const Key('more-vehicles')));
    await tester.tap(find.byKey(const Key('more-vehicles')));
    await tester.pumpAndSettle();
    expect(find.text('Vehicles'), findsOneWidget);
    expect(find.text('Arun Kumar · 68,420 km'), findsOneWidget);
    expect(find.text('Document expired'), findsOneWidget);
    router.pop();
    await tester.pumpAndSettle();

    await _revealIn(tester, find.byKey(const Key('more-drivers')));
    await tester.tap(find.byKey(const Key('more-drivers')));
    await tester.pumpAndSettle();
    expect(find.text('Drivers'), findsWidgets);
    expect(find.text('Bala'), findsOneWidget);
    await tester.tap(find.text('Active · 1'));
    await tester.pumpAndSettle();
    expect(find.text('Bala'), findsNothing);
    await tester.tap(find.text('Arun Kumar'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('driver-call')), findsOneWidget);
    expect(find.byKey(const Key('driver-whatsapp')), findsOneWidget);
  });

  testWidgets('customer sheet starts a booking with the customer filled in', (
    tester,
  ) async {
    await _pump(
      tester,
      FakeManagerRepository(),
      initial: AppRoutes.managerCustomers,
    );
    expect(find.text('Customers · 2'), findsOneWidget);
    expect(find.text('3 trips · last 20 Oct 2026'), findsOneWidget);
    expect(find.text('No trips yet'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '9500');
    await tester.pumpAndSettle();
    expect(find.text('Mani'), findsNothing);
    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('customer-c1')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('customer-sheet')), findsOneWidget);
    expect(find.text(inr.format(8400)), findsOneWidget);
    await tester.tap(find.byKey(const Key('customer-new-booking')));
    await tester.pumpAndSettle();
    await tester.pumpAndSettle();
    // Pushed with the customer as `extra`.
    expect(find.text('new booking for Mani'), findsOneWidget);
  });

  testWidgets('More → Invoices: totals, search, open an invoice', (
    tester,
  ) async {
    final repo = FakeManagerRepository();
    await _pump(tester, repo, initial: AppRoutes.managerMore);
    await _revealIn(tester, find.byKey(const Key('more-invoices')));
    await tester.tap(find.byKey(const Key('more-invoices')));
    await tester.pumpAndSettle();

    expect(find.text(inr.format(7000)), findsOneWidget); // total fare
    expect(find.text(inr.format(5400)), findsWidgets); // this month + row
    expect(find.text(inr.format(3500)), findsOneWidget); // avg bill
    expect(find.text('BK-2610-0042 · 20 Oct 2026'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'tindivanam');
    await tester.pumpAndSettle();
    expect(find.text('Mani Kumar'), findsNothing);
    expect(find.text('Gopal'), findsOneWidget);
    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('invoice-b9')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invoice-view')), findsOneWidget);
    expect(
      find.text('Trip fare — Puducherry to Chennai (320 km)'),
      findsOneWidget,
    );
    expect(find.text('Toll charges'), findsOneWidget);
    expect(find.text('Rs. 5,400'), findsWidgets);
    expect(find.text('Send to Mani'), findsOneWidget);
    expect(find.byKey(const Key('invoice-call')), findsNothing);
    await tester.tap(find.byKey(const Key('invoice-whatsapp')));
    await tester.pumpAndSettle();
    expect(repo.whatsappSends.single.action, 'invoice');
    expect(repo.whatsappSends.single.phone, '7305581235');
    expect(repo.whatsappSends.single.text, contains('BK-2610-0042'));
    await _revealIn(tester, find.textContaining('In words:'));
    expect(
      find.text('In words: Five Thousand Four Hundred Rupees Only'),
      findsOneWidget,
    );
  });

  testWidgets('manager can create and edit a saved invoice', (tester) async {
    final repo = FakeManagerRepository();
    await _pump(tester, repo, initial: AppRoutes.managerInvoices);

    await tester.tap(find.byKey(const Key('create-invoice')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('invoice-create-b9')));
    await tester.pumpAndSettle();
    expect(find.text('Create invoice'), findsWidgets);

    await tester.enterText(find.byKey(const Key('invoice-fare')), '6000');
    await tester.enterText(find.byKey(const Key('invoice-toll')), '350');
    await _revealIn(tester, find.byKey(const Key('invoice-editor-save')));
    await tester.tap(find.byKey(const Key('invoice-editor-save')));
    await tester.pumpAndSettle();
    expect(repo.invoiceList.singleWhere((i) => i.id == 'b9').fare, 6000);
    expect(repo.invoiceList.singleWhere((i) => i.id == 'b9').toll, 350);

    await tester.tap(find.byKey(const Key('invoice-b9')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invoice-view')), findsOneWidget);
    await tester.tap(find.byKey(const Key('invoice-edit')));
    await tester.pumpAndSettle();
    expect(find.text('Edit invoice'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('invoice-fare')), '6100');
    await _revealIn(tester, find.byKey(const Key('invoice-editor-save')));
    await tester.tap(find.byKey(const Key('invoice-editor-save')));
    await tester.pumpAndSettle();
    expect(repo.invoiceList.singleWhere((i) => i.id == 'b9').fare, 6100);
    expect(find.text('Rs. 6,100'), findsWidgets);
    expect(find.byKey(const Key('invoice-view')), findsOneWidget);
  });

  testWidgets('invoice list paginates at the mobile page size', (tester) async {
    final repo = FakeManagerRepository()
      ..invoiceList = [
        for (var index = 1; index <= 7; index++)
          InvoiceRecord.fromMap({
            'id': 'page-$index',
            'booking_number': 'BK-PAGE-$index',
            'status': 'completed',
            'customer_name': 'Customer $index',
            'start_date': '2026-11-05',
            'total_fare': index * 100,
          }),
      ];
    await _pump(tester, repo, initial: AppRoutes.managerInvoices);
    tester.view.physicalSize = const Size(1080, 6000);
    await tester.pumpAndSettle();

    expect(find.text('Showing 1–5 of 7'), findsOneWidget);
    expect(find.byKey(const Key('invoice-page-1')), findsOneWidget);
    expect(find.byKey(const Key('invoice-page-5')), findsOneWidget);
    expect(find.byKey(const Key('invoice-page-6')), findsNothing);

    await tester.tap(find.byTooltip('Next page'));
    await tester.pumpAndSettle();
    expect(find.text('Showing 6–7 of 7'), findsOneWidget);
    expect(find.byKey(const Key('invoice-page-6')), findsOneWidget);
    expect(find.byKey(const Key('invoice-page-7')), findsOneWidget);
  });

  testWidgets('non-trip invoice entry remains visible before migration', (
    tester,
  ) async {
    final repo = FakeManagerRepository()..nonTripInvoicesAvailable = false;
    await _pump(tester, repo, initial: AppRoutes.managerInvoices);

    await tester.tap(find.byKey(const Key('create-invoice')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invoice-create-non-trip')), findsOneWidget);
    expect(find.textContaining('database setup required'), findsOneWidget);

    await tester.tap(find.byKey(const Key('invoice-create-non-trip')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('invoice-editor-save')), findsOneWidget);
  });

  testWidgets('More does not expose a WhatsApp inbox module', (tester) async {
    final repo = FakeManagerRepository();
    await _pump(tester, repo, initial: AppRoutes.managerMore);
    expect(find.byKey(const Key('more-whatsapp')), findsNothing);
    expect(find.text('WhatsApp'), findsNothing);
  });

  testWidgets('render audit: manager routes at 360×780 have no errors', (
    tester,
  ) async {
    final repo = FakeManagerRepository(
      bookings: [
        _b(
          '1',
          'pending',
          customer: 'A very long customer name that keeps going on',
          fare: 125000,
        ),
        _b(
          '2',
          'started',
          driverId: 'd1',
          driverName: 'Arun Kumar',
          vehicleId: 'v1',
          vehicleReg: 'TN01AB1234',
        ),
      ],
      alerts: [
        const FleetAlert(
          id: 'x',
          title: 'Harsh braking detected on the highway near Chengalpattu toll',
          priority: 'high',
          status: 'acknowledged',
          description: 'Vehicle TN01AB1234 braked sharply at 72 km/h.',
          bookingRef: 'BK-2',
        ),
      ],
      expenses: [
        PendingExpense(
          id: 'e',
          amount: 1200,
          approvalStatus: 'pending',
          description: 'Toll',
          receiptUrl: 'https://example.com/r.jpg',
        ),
      ],
    );
    final router = await _pump(tester, repo);
    final errors = <String>[];
    for (final r in [
      AppRoutes.managerHome,
      AppRoutes.managerTrips,
      AppRoutes.managerTripDetail('1'),
      AppRoutes.managerTripDetail('2'),
      AppRoutes.managerFleet,
      AppRoutes.managerMore,
      AppRoutes.managerExpenses,
      AppRoutes.managerAttendance,
      AppRoutes.managerDocuments,
      AppRoutes.managerVehicles,
      AppRoutes.managerDrivers,
      AppRoutes.managerCustomers,
      AppRoutes.managerInvoices,
      AppRoutes.managerWhatsApp,
    ]) {
      router.go(r);
      for (var i = 0; i < 10; i++) {
        await tester.pump(const Duration(milliseconds: 100));
        for (
          Object? ex = tester.takeException();
          ex != null;
          ex = tester.takeException()
        ) {
          // Overflow messages carry no widget location, so name the culprit:
          // any horizontal flex whose children are wider than itself.
          final culprits = <String>[];
          void visit(Element e) {
            final ro = e.renderObject;
            if (e is RenderObjectElement &&
                ro is RenderFlex &&
                ro.hasSize &&
                ro.direction == Axis.horizontal) {
              var w = 0.0;
              ro.visitChildren((c) => w += (c as RenderBox).size.width);
              if (w > ro.size.width + 0.5) {
                culprits.add(e.debugGetCreatorChain(8));
              }
            }
            e.visitChildren(visit);
          }

          tester.binding.rootElement!.visitChildren(visit);
          errors.add('[$r] ${'$ex'.split('\n').first} ${culprits.join(' | ')}');
        }
      }
    }
    expect(errors, isEmpty, reason: errors.join('\n'));
  });

  testWidgets('app boot: a staff session lands on /manager', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);
    final repo = FakeManagerRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          managerRepositoryProvider.overrideWithValue(repo),
          authServiceProvider.overrideWith(
            (ref) => _FakeAuthService(
              AuthRepository(ref.watch(supabaseClientProvider)),
              const AuthAuthenticated(profile: _staff),
            ),
          ),
        ],
        child: const SriJayamApp(),
      ),
    );
    await _pumpFor(tester, const Duration(seconds: 2));

    final container = ProviderScope.containerOf(
      tester.element(find.byType(MaterialApp)),
    );
    final router = container.read(routerProvider);
    expect(_location(router), AppRoutes.managerHome);
    expect(find.text('Priya Raman'), findsOneWidget);

    router.go(AppRoutes.managerReports);
    await _pumpFor(tester, const Duration(seconds: 1));
    expect(_location(router), AppRoutes.managerReports);
    expect(find.text('Reports & Analytics'), findsOneWidget);
    expect(find.textContaining('Page not found'), findsNothing);

    router.go(AppRoutes.managerHome);
    await _pumpFor(tester, const Duration(seconds: 1));
    router.go(AppRoutes.driverTrips);
    await _pumpFor(tester, const Duration(seconds: 1));
    expect(_location(router), AppRoutes.managerHome);
  });

  testWidgets('app boot: the demo driver lands on /driver', (tester) async {
    tester.view.physicalSize = const Size(1080, 2340);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);
    // Leave demo mode afterwards. Not via authProvider.logout(): that awaits a
    // real Supabase sign-out request, which never completes in a widget test.
    addTearDown(DemoSession.exit);

    await tester.pumpWidget(const ProviderScope(child: SriJayamApp()));
    await _pumpFor(tester, const Duration(seconds: 2));
    final container = ProviderScope.containerOf(
      tester.element(find.byType(MaterialApp)),
    );
    final demoLogin = container.read(authProvider.notifier).loginDemo();
    await _pumpFor(tester, const Duration(milliseconds: 600));
    await demoLogin;
    await _pumpFor(tester, const Duration(seconds: 3));

    final router = container.read(routerProvider);
    expect(_location(router), AppRoutes.driverHome);

    router.go(AppRoutes.managerFleet);
    await _pumpFor(tester, const Duration(seconds: 1));
    expect(_location(router), AppRoutes.driverHome);
  });
}
