// ─────────────────────────────────────────────────────────────────────────────
// manager_models.dart — read models for the manager mode (admin / manager).
// Columns mirror the live tables (verified 2026-10-28): bookings, vehicles,
// drivers, gps_tracking, expenses, attendance, fleet_alerts. Staff RLS
// (`*_staff_all` = is_staff()) gives these roles full access to all of them.
// ─────────────────────────────────────────────────────────────────────────────

DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');
double? _num(Object? v) => v == null ? null : double.tryParse('$v');
String? _str(Object? v) {
  final s = v?.toString().trim();
  return (s == null || s.isEmpty) ? null : s;
}

/// bookings.status CHECK: draft · pending · approved · confirmed · assigned ·
/// started · completed · closed · cancelled.
class ManagerBooking {
  const ManagerBooking({
    required this.id,
    required this.status,
    this.bookingNumber,
    this.type,
    this.customerName,
    this.customerContact,
    this.driverId,
    this.driverName,
    this.vehicleId,
    this.vehicleReg,
    this.pickup,
    this.drop,
    this.startDate,
    this.startTime,
    this.endDate,
    this.totalKm,
    this.totalFare,
    this.notes,
    this.createdAt,
  });

  static const columns =
      'id, booking_number, type, status, customer_name, customer_contact, '
      'driver_id, driver_name, vehicle_id, vehicle_reg, pickup_location, '
      'drop_location, start_date, start_time, end_date, total_km, total_fare, '
      'notes, created_at';

  final String id;
  final String status;
  final String? bookingNumber;
  final String? type;
  final String? customerName;
  final String? customerContact;
  final String? driverId;
  final String? driverName;
  final String? vehicleId;
  final String? vehicleReg;
  final String? pickup;
  final String? drop;
  final DateTime? startDate;
  final String? startTime;
  final DateTime? endDate;
  final double? totalKm;
  final double? totalFare;
  final String? notes;
  final DateTime? createdAt;

  factory ManagerBooking.fromMap(Map<String, dynamic> m) => ManagerBooking(
    id: m['id'] as String,
    status: _str(m['status']) ?? 'pending',
    bookingNumber: _str(m['booking_number']),
    type: _str(m['type']),
    customerName: _str(m['customer_name']),
    customerContact: _str(m['customer_contact']),
    driverId: _str(m['driver_id']),
    driverName: _str(m['driver_name']),
    vehicleId: _str(m['vehicle_id']),
    vehicleReg: _str(m['vehicle_reg']),
    pickup: _str(m['pickup_location']),
    drop: _str(m['drop_location']),
    startDate: _date(m['start_date']),
    startTime: _str(m['start_time']),
    endDate: _date(m['end_date']),
    totalKm: _num(m['total_km']),
    totalFare: _num(m['total_fare']),
    notes: _str(m['notes']),
    createdAt: _date(m['created_at']),
  );

  String get label => bookingNumber ?? id.substring(0, 8);
  bool get isAssigned => driverId != null && vehicleId != null;
  bool get isActive => status == 'started';
  bool get isOpen =>
      !const {'completed', 'closed', 'cancelled'}.contains(status);
}

class FleetAlert {
  const FleetAlert({
    required this.id,
    required this.title,
    required this.priority,
    required this.status,
    this.alertType,
    this.description,
    this.bookingRef,
    this.latitude,
    this.longitude,
    this.photoUrl,
    this.detectedAt,
    this.managerCheckedAt,
    this.autoCloseAt,
  });

  static const columns =
      'id, alert_type, priority, status, title, description, booking_ref, '
      'location, photo_url, detected_at';

  final String id;
  final String title;
  final String priority; // critical · high · medium · low · information
  final String status; // open · acknowledged · in_progress · resolved · closed
  final String? alertType;
  final String? description;
  final String? bookingRef;
  final double? latitude;
  final double? longitude;
  final String? photoUrl;
  final DateTime? detectedAt;
  final DateTime? managerCheckedAt;
  final DateTime? autoCloseAt;

  factory FleetAlert.fromMap(Map<String, dynamic> m) {
    final loc = m['location'];
    return FleetAlert(
      id: '${m['id']}',
      title: _str(m['title']) ?? 'Fleet alert',
      priority: _str(m['priority']) ?? 'medium',
      status: _str(m['status']) ?? 'open',
      alertType: _str(m['alert_type']),
      description: _str(m['description']),
      bookingRef: _str(m['booking_ref']),
      latitude: loc is Map ? _num(loc['latitude']) : null,
      longitude: loc is Map ? _num(loc['longitude']) : null,
      photoUrl: _str(m['photo_url']),
      detectedAt: _date(m['detected_at']),
      managerCheckedAt: _date(m['manager_checked_at']),
      autoCloseAt: _date(m['auto_close_at']),
    );
  }

  bool get isCritical => priority == 'critical';
  bool get isSos => alertType == 'sos';
  bool get hasLocation => latitude != null && longitude != null;
}

class VehicleOption {
  const VehicleOption({
    required this.id,
    required this.registration,
    required this.status,
    this.vehicleType,
    this.makeModel,
  });

  static const columns = 'id, registration, status, vehicle_type, make, model';

  final String id;
  final String registration;
  final String status; // active · maintenance · inactive · decommissioned
  final String? vehicleType;
  final String? makeModel;

  factory VehicleOption.fromMap(Map<String, dynamic> m) {
    final makeModel = [
      _str(m['make']),
      _str(m['model']),
    ].whereType<String>().join(' ');
    return VehicleOption(
      id: m['id'] as String,
      registration: _str(m['registration']) ?? '—',
      status: _str(m['status']) ?? 'active',
      vehicleType: _str(m['vehicle_type']),
      makeModel: makeModel.isEmpty ? null : makeModel,
    );
  }
}

class DriverOption {
  const DriverOption({
    required this.id,
    required this.name,
    required this.status,
    this.phone,
  });

  static const columns = 'id, name, phone, status';

  final String id;
  final String name;
  final String status; // active · inactive · suspended · on_leave
  final String? phone;

  factory DriverOption.fromMap(Map<String, dynamic> m) => DriverOption(
    id: m['id'] as String,
    name: _str(m['name']) ?? 'Driver',
    status: _str(m['status']) ?? 'active',
    phone: _str(m['phone']),
  );
}

/// Latest known position of one vehicle (newest gps_tracking row).
class VehiclePosition {
  const VehiclePosition({
    required this.vehicle,
    this.latitude,
    this.longitude,
    this.speedKmh,
    this.ignition,
    this.address,
    this.at,
  });

  final VehicleOption vehicle;
  final double? latitude;
  final double? longitude;
  final double? speedKmh;
  final bool? ignition;
  final String? address;
  final DateTime? at;

  bool get hasFix => latitude != null && longitude != null;
  bool get isMoving => (speedKmh ?? 0) > 3;

  /// Fixes older than 10 minutes are shown as offline (same rule as the web).
  bool isStale(DateTime now) =>
      at == null || now.difference(at!) > const Duration(minutes: 10);
}

/// expenses.status CHECK: pending · approved · rejected · reimbursed. The web
/// ERP decides by `status`; approval_status mirrors it when set from mobile.
class PendingExpense {
  const PendingExpense({
    required this.id,
    required this.amount,
    required this.approvalStatus,
    this.expenseNo,
    this.expenseType,
    this.driverName,
    this.vehicleReg,
    this.description,
    this.receiptUrl,
    this.expenseDate,
    this.tripRef,
  });

  static const columns =
      'id, expense_no, expense_type, type, amount, approval_status, status, '
      'driver_name, vehicle_reg, description, receipt_url, expense_date, trip_ref';

  final String id;
  final double amount;
  final String approvalStatus;
  final String? expenseNo;
  final String? expenseType;
  final String? driverName;
  final String? vehicleReg;
  final String? description;
  final String? receiptUrl;
  final DateTime? expenseDate;
  final String? tripRef;

  factory PendingExpense.fromMap(Map<String, dynamic> m) => PendingExpense(
    id: m['id'] as String,
    amount: _num(m['amount']) ?? 0,
    approvalStatus:
        _str(m['status']) ?? _str(m['approval_status']) ?? 'pending',
    expenseNo: _str(m['expense_no']),
    expenseType: _str(m['expense_type']) ?? _str(m['type']),
    driverName: _str(m['driver_name']),
    vehicleReg: _str(m['vehicle_reg']),
    description: _str(m['description']),
    receiptUrl: _str(m['receipt_url']),
    expenseDate: _date(m['expense_date']),
    tripRef: _str(m['trip_ref']),
  );
}

/// attendance.status CHECK: present · absent · leave.
class AttendanceEntry {
  const AttendanceEntry({
    required this.driver,
    this.recordId,
    this.status,
    this.leaveType,
    this.checkIn,
    this.checkOut,
  });

  final DriverOption driver;
  final String? recordId;
  final String? status; // null = not marked yet today
  final String? leaveType;
  final String? checkIn;
  final String? checkOut;
}

class ManagerDashboard {
  const ManagerDashboard({
    required this.todayTrips,
    required this.activeTrips,
    required this.unassigned,
    required this.pendingApproval,
    required this.pendingExpenses,
    required this.presentDrivers,
    required this.totalDrivers,
    required this.todayRevenue,
    required this.upcoming,
  });

  final int todayTrips;
  final int activeTrips;
  final int unassigned;
  final int pendingApproval;
  final int pendingExpenses;
  final int presentDrivers;
  final int totalDrivers;
  final double todayRevenue;
  final List<ManagerBooking> upcoming;
}

/// Where a trip's recorded route came from.
enum TrackSource { driverApp, vehicleGps }

/// Recorded GPS route of one trip, oldest first.
class TripTrack {
  const TripTrack({required this.points, this.source, this.first, this.last});

  static const empty = TripTrack(points: []);

  final List<({double lat, double lng})> points;
  final TrackSource? source;
  final DateTime? first;
  final DateTime? last;

  bool get hasRoute => points.length >= 2;
}

/// Statuses whose vehicle GPS between the trip dates belongs to the trip.
const trackedStatuses = {'started', 'completed', 'closed'};

/// India-time day window of a trip as UTC instants: start-day 00:00 to
/// end-day 24:00 (end defaults to the start day).
(DateTime, DateTime)? tripWindowUtc(ManagerBooking b) {
  final s = b.startDate;
  if (s == null) return null;
  final e = b.endDate ?? s;
  const ist = Duration(hours: 5, minutes: 30);
  final from = DateTime.utc(s.year, s.month, s.day).subtract(ist);
  final to = DateTime.utc(
    e.year,
    e.month,
    e.day,
  ).add(const Duration(days: 1)).subtract(ist);
  return to.isAfter(from) ? (from, to) : null;
}
