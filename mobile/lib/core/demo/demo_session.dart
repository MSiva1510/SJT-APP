// ─────────────────────────────────────────────────────────────────────────────
// demo_session.dart — full-spec demo mode with fake data.
// Entered by internal demo tooling. While active, repositories and services
// short-circuit to these in-memory fixtures instead of the
// network, so every screen in the wireframe set is walkable offline:
// Home, My Trips, Trip Details, Pre-trip, Active Trip, End Trip,
// Attendance+Leave, Docs+Issue+SOS, Notifications, Profile, Earnings,
// Add Expense, Dispatch, Settings.
//
// NOTHING here touches production data. exit() clears it all.
// ─────────────────────────────────────────────────────────────────────────────

import '../../models/app_notification.dart';
import '../../models/attendance.dart';
import '../../models/driver_document.dart';
import '../../models/driver_expense.dart';
import '../../models/driver_payslip.dart';
import '../../models/driver_profile.dart';
import '../../models/gps_position.dart';
import '../../models/settlement.dart';
import '../../models/trip.dart';
import '../../models/user_profile.dart';

class DemoSession {
  DemoSession._();

  static bool active = false;

  static const driverId = 'demo-driver-001';
  static const userId = 'demo-user-001';

  static UserProfile get profile => const UserProfile(
    id: userId,
    email: 'kumar.d@srijayam.in',
    fullName: 'Kumar',
    role: 'driver',
  );

  static DriverProfile get driver => DriverProfile(
    id: driverId,
    name: 'Kumar',
    driverId: 'SJT-5429',
    email: 'kumar.d@srijayam.in',
    phone: '+91 98765 43210',
    address: '42, Velachery Main Rd, Chennai',
    status: 'active',
    salaryType: 'per_trip',
    dailyBata: 300,
    joinedDate: DateTime(2020, 3, 15),
    licenseNumber: 'TN0120260012345',
    licenseExpiry: DateTime.now().add(const Duration(days: 730)),
  );

  static void enter() {
    active = true;
    _reset();
  }

  static void exit() {
    active = false;
  }

  static (double, double)? place(String? query) {
    final q = query?.trim().toLowerCase() ?? '';
    if (q.isEmpty) return null;
    final known = <String, (double, double)>{
      'pondicherry rock beach': (11.9339, 79.8325),
      'chennai intl airport t4': (13.0067, 80.1646),
      'auroville': (12.0055, 79.8102),
      'auropville': (12.0055, 79.8102),
      'puducherry railway stn': (11.936, 79.831),
      'mahabalipuram': (12.6269, 80.1927),
      'pondicherry airport': (11.968, 79.812),
      'puducherry bus stand': (11.936, 79.831),
    };
    return known[q];
  }

  static void _reset() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    String d(int offset) {
      final dt = today.add(Duration(days: offset));
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    }

    _trips = [
      TripModel(
        id: 'demo-trip-1024',
        bookingNumber: 'TRP-1024',
        tripType: 'one_way',
        status: 'assigned',
        customerName: 'Arun Kumar',
        customerContact: '+91 98765 43210',
        pickupLocation: 'Pondicherry Rock Beach',
        dropLocation: 'Chennai Intl Airport T4',
        startDate: DateTime.parse('${d(0)}T00:00:00'),
        startTime: '10:30:00',
        vehicleReg: 'PY01 CY 1255',
        driverName: 'Kumar',
        driverId: driverId,
        totalKm: 155.0,
        notes: '3 passengers',
      ),
      TripModel(
        id: 'demo-trip-1025',
        bookingNumber: 'TRP-1025',
        tripType: 'one_way',
        status: 'assigned',
        customerName: 'Meera S',
        pickupLocation: 'Auroville',
        dropLocation: 'Puducherry Railway Stn',
        startDate: DateTime.parse('${d(0)}T00:00:00'),
        startTime: '15:15:00',
        vehicleReg: 'PY01 CY 1255',
        driverName: 'Kumar',
        driverId: driverId,
        totalKm: 12.0,
      ),
      TripModel(
        id: 'demo-trip-1031',
        bookingNumber: 'TRP-1031',
        tripType: 'one_way',
        status: 'assigned',
        customerName: 'Senthil M',
        pickupLocation: 'Puducherry Bus Stand',
        dropLocation: 'Mahabalipuram',
        startDate: DateTime.parse('${d(1)}T00:00:00'),
        startTime: '06:00:00',
        vehicleReg: 'PY01 CY 1255',
        driverName: 'Kumar',
        driverId: driverId,
        totalKm: 98.0,
      ),
      TripModel(
        id: 'demo-trip-1019',
        bookingNumber: 'TRP-1019',
        tripType: 'one_way',
        status: 'completed',
        customerName: 'Divya R',
        pickupLocation: 'Pondicherry Airport',
        dropLocation: 'Auroville',
        startDate: DateTime.parse('${d(-1)}T00:00:00'),
        startTime: '09:00:00',
        endTime: '10:15:00',
        vehicleReg: 'PY01 CY 1255',
        driverName: 'Kumar',
        driverId: driverId,
        totalKm: 22.0,
      ),
    ];

    _payslips = [
      DriverPayslip(
        id: 'demo-pay-1',
        amount: 4580,
        tripRef: 'TRP-1019',
        fare: 4580,
        status: 'paid',
        createdAt: today.add(const Duration(hours: 11)),
      ),
      DriverPayslip(
        id: 'demo-pay-2',
        amount: 300,
        tripRef: 'Bonus · on-time',
        status: 'paid',
        createdAt: today.add(const Duration(hours: 12)),
      ),
      DriverPayslip(
        id: 'demo-pay-3',
        amount: 3100,
        tripRef: 'Cash collected',
        status: 'pending',
        createdAt: today.add(const Duration(hours: 9)),
      ),
    ];

    _expenses = [
      DriverExpense(
        id: 'demo-exp-1',
        category: 'Toll',
        amount: 140,
        receiptNote: 'Koovathur',
        status: 'approved',
        expenseDate: today.add(const Duration(hours: 8)),
      ),
      DriverExpense(
        id: 'demo-exp-2',
        category: 'Fuel',
        amount: 2000,
        receiptNote: 'Puducherry',
        status: 'approved',
        expenseDate: today.add(const Duration(hours: 7)),
      ),
    ];

    _notifications = [
      AppNotification(
        id: 'demo-n-1',
        userId: userId,
        type: 'TRIP_ASSIGNED',
        title: 'New trip assigned',
        message: '#TRP-1024 · Puducherry → Chennai Airport, 10:30 AM pickup',
        status: 'unread',
        isRead: false,
        createdAt: now.subtract(const Duration(minutes: 18)),
      ),
      AppNotification(
        id: 'demo-n-2',
        userId: userId,
        type: 'MESSAGE',
        title: 'Message from dispatch',
        message: 'Customer Arun Kumar confirmed 3 passengers and 2 bags.',
        status: 'unread',
        isRead: false,
        createdAt: now.subtract(const Duration(hours: 1, minutes: 55)),
      ),
      AppNotification(
        id: 'demo-n-3',
        userId: userId,
        type: 'DOC_EXPIRING',
        title: 'Insurance expiring',
        message: 'Vehicle insurance expires in 12 days. Upload new document',
        status: 'unread',
        isRead: false,
        createdAt: now.subtract(const Duration(hours: 2, minutes: 45)),
      ),
      AppNotification(
        id: 'demo-n-4',
        userId: userId,
        type: 'PAYMENT',
        title: 'Payment settled',
        message: '₹4,580 for #TRP-1019 credited.',
        status: 'read',
        isRead: true,
        readAt: now.subtract(const Duration(days: 1)),
        createdAt: now.subtract(const Duration(days: 1, hours: 2)),
      ),
      AppNotification(
        id: 'demo-n-5',
        userId: userId,
        type: 'LEAVE',
        title: 'Leave approved',
        message: 'Weekly off confirmed.',
        status: 'read',
        isRead: true,
        readAt: now.subtract(const Duration(days: 2)),
        createdAt: now.subtract(const Duration(days: 2, hours: 3)),
      ),
    ];

    final inAt = today.add(const Duration(hours: 8));
    _attendance = AttendanceModel(
      id: 'demo-att-1',
      driverId: driverId,
      attendanceDate: today,
      status: 'working',
      checkIn: '08:00',
      workingHours: '04h 20m',
      vehicleAssigned: 'TN-01-AB-1234',
      createdAt: inAt,
    );
    _attendanceHistory = [
      _histRow('demo-att-0', -1, '08:15', '17:00', '8h 45m'),
      _histRow('demo-att--1', -2, '07:50', '17:00', '9h 10m'),
    ];

    final ins = today.add(const Duration(days: 12));
    final lic = today.add(const Duration(days: 730));
    final rc = today.add(const Duration(days: 1460));
    final permit = today.add(const Duration(days: 365));
    _documents = [
      DriverDocument(
        id: 'demo-doc-1',
        title: 'Driving Licence',
        docType: 'license',
        status: 'verified',
        expiryDate: lic,
        notes: 'DL-123456789',
        driverId: driverId,
      ),
      DriverDocument(
        id: 'demo-doc-2',
        title: 'Vehicle Insurance',
        docType: 'insurance',
        status: 'expiring_soon',
        expiryDate: ins,
        notes: 'Pol: INS-987654',
        driverId: driverId,
      ),
      DriverDocument(
        id: 'demo-doc-3',
        title: 'RC · Permit',
        docType: 'rc_book',
        status: 'verified',
        expiryDate: rc,
        notes: 'TN-01-AB-1234',
        driverId: driverId,
      ),
      DriverDocument(
        id: 'demo-doc-4',
        title: 'State Permit',
        docType: 'permit',
        status: 'verified',
        expiryDate: permit,
        driverId: driverId,
      ),
    ];
    _settlements = [
      Settlement(
        id: 'demo-settlement-paid',
        driverId: driverId,
        month: now.month == 1 ? 12 : now.month - 1,
        year: now.month == 1 ? now.year - 1 : now.year,
        status: 'paid',
        netAmount: 4580,
        paymentDate: now.subtract(const Duration(days: 3)),
        paymentMethod: 'Bank transfer',
        createdAt: now.subtract(const Duration(days: 5)),
      ),
      Settlement(
        id: 'demo-settlement-pending',
        driverId: driverId,
        month: now.month,
        year: now.year,
        status: 'pending',
        netAmount: 3100,
        createdAt: now,
      ),
    ];
  }

  static AttendanceModel _histRow(
    String id,
    int dayOffset,
    String cin,
    String cout,
    String hrs,
  ) {
    final now = DateTime.now();
    final day = DateTime(
      now.year,
      now.month,
      now.day,
    ).add(Duration(days: dayOffset));
    return AttendanceModel(
      id: id,
      driverId: driverId,
      attendanceDate: day,
      status: 'complete',
      checkIn: cin,
      checkOut: cout,
      workingHours: hrs,
      createdAt: day,
    );
  }

  // ── Mutable fixture stores (reset on enter) ──────────────────────
  static List<TripModel> _trips = [];
  static List<DriverPayslip> _payslips = [];
  static List<DriverExpense> _expenses = [];
  static List<AppNotification> _notifications = [];
  static AttendanceModel? _attendance;
  static List<AttendanceModel> _attendanceHistory = [];
  static List<DriverDocument> _documents = [];
  static List<Settlement> _settlements = [];

  static List<TripModel> get trips => List.unmodifiable(_trips);
  static List<DriverPayslip> get payslips => List.unmodifiable(_payslips);
  static List<DriverExpense> get expenses => List.unmodifiable(_expenses);
  static List<AppNotification> get notifications =>
      List.unmodifiable(_notifications);
  static AttendanceModel? get attendance => _attendance;
  static List<AttendanceModel> get attendanceHistory =>
      List.unmodifiable(_attendanceHistory);
  static List<DriverDocument> get documents => List.unmodifiable(_documents);
  static List<Settlement> get settlements => List.unmodifiable(_settlements);

  static List<GpsPosition> tripRoute(String id) {
    final trip = tripById(id);
    if (trip == null || !trip.isCompleted) return const [];
    final pickup = place(trip.pickupLocation);
    final drop = place(trip.dropLocation);
    if (pickup == null || drop == null) return const [];
    final start = trip.startDate ?? DateTime.now();
    return List.generate(40, (i) {
      final fraction = i / 39;
      return GpsPosition(
        latitude: pickup.$1 + (drop.$1 - pickup.$1) * fraction,
        longitude: pickup.$2 + (drop.$2 - pickup.$2) * fraction,
        accuracy: 8,
        timestamp: start.add(Duration(minutes: i * 2)),
      );
    });
  }

  static TripModel? tripById(String id) {
    for (final t in _trips) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Field-preserving copy for local status transitions.
  static TripModel copyTrip(
    TripModel t, {
    String? status,
    String? notes,
    Map<String, dynamic>? typeData,
  }) {
    return TripModel(
      id: t.id,
      bookingNumber: t.bookingNumber,
      bookingId: t.bookingId,
      tripType: t.tripType,
      status: status ?? t.status,
      customerName: t.customerName,
      customerContact: t.customerContact,
      pickupLocation: t.pickupLocation,
      dropLocation: t.dropLocation,
      startDate: t.startDate,
      startTime: t.startTime,
      endDate: t.endDate,
      endTime: t.endTime,
      vehicleReg: t.vehicleReg,
      vehicleId: t.vehicleId,
      driverName: t.driverName,
      driverId: t.driverId,
      totalKm: t.totalKm,
      notes: notes ?? t.notes,
      typeData: typeData ?? t.typeData,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    );
  }

  static void updateTrip(TripModel updated) {
    final i = _trips.indexWhere((t) => t.id == updated.id);
    if (i >= 0) _trips[i] = updated;
  }

  static void updateRoutePlaces(String id, Map<String, dynamic> typeData) {
    final trip = tripById(id);
    if (trip != null) updateTrip(copyTrip(trip, typeData: typeData));
  }

  static void addExpense(DriverExpense e) => _expenses.insert(0, e);

  static void markAllNotificationsRead() {
    _notifications = _notifications
        .map(
          (n) => n.isRead
              ? n
              : AppNotification(
                  id: n.id,
                  userId: n.userId,
                  type: n.type,
                  title: n.title,
                  message: n.message,
                  icon: n.icon,
                  category: n.category,
                  priority: n.priority,
                  relatedId: n.relatedId,
                  actionUrl: n.actionUrl,
                  status: 'read',
                  isRead: true,
                  readAt: DateTime.now(),
                  createdAt: n.createdAt,
                ),
        )
        .toList();
  }

  static void markNotificationRead(String id) {
    final i = _notifications.indexWhere((n) => n.id == id);
    if (i < 0 || _notifications[i].isRead) return;
    final n = _notifications[i];
    _notifications[i] = AppNotification(
      id: n.id,
      userId: n.userId,
      type: n.type,
      title: n.title,
      message: n.message,
      icon: n.icon,
      category: n.category,
      priority: n.priority,
      relatedId: n.relatedId,
      actionUrl: n.actionUrl,
      status: 'read',
      isRead: true,
      readAt: DateTime.now(),
      createdAt: n.createdAt,
    );
  }

  static void dismissNotification(String id) {
    _notifications.removeWhere((notification) => notification.id == id);
  }

  static void setAttendance(AttendanceModel? record) {
    _attendance = record;
  }

  static void addDocument(DriverDocument doc) => _documents.insert(0, doc);
}
