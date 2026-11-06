// ─────────────────────────────────────────────────────────────────────────────
// booking.dart
// Models a row from the `bookings` table with enriched customer + vehicle
// data from JOINs. Used for the booking management view (list + details).
//
// Day 43 TripModel = execution/navigation view (today, route-focused)
// Day 44 BookingModel = booking management view (all dates, customer details)
// Both come from the same `bookings` table.
//
// SECURITY: base_fare, total_fare, approval_history, approved_by,
//           source_row_key are intentionally excluded — admin-only fields.
// ─────────────────────────────────────────────────────────────────────────────

class BookingStop {
  final String id;
  final int stopNumber;
  final String location;
  final String? notes;

  const BookingStop({
    required this.id,
    required this.stopNumber,
    required this.location,
    this.notes,
  });

  factory BookingStop.fromMap(Map<String, dynamic> m) => BookingStop(
    id: m['id'] as String? ?? '',
    stopNumber: m['stop_number'] as int? ?? 0,
    location: m['location'] as String? ?? '',
    notes: m['notes'] as String?,
  );
}

class VehicleInfo {
  final String id;
  final String? registration;
  final String? vehicleType;
  final String? make;
  final String? model;
  final String? color;
  final String? status;
  final String? photoUrl;

  const VehicleInfo({
    required this.id,
    this.registration,
    this.vehicleType,
    this.make,
    this.model,
    this.color,
    this.status,
    this.photoUrl,
  });

  factory VehicleInfo.fromMap(Map<String, dynamic> m) => VehicleInfo(
    id: m['id'] as String? ?? '',
    registration: m['registration'] as String?,
    vehicleType: m['vehicle_type'] as String?,
    make: m['make'] as String?,
    model: m['model'] as String?,
    color: m['color'] as String?,
    status: m['status'] as String?,
    photoUrl: m['photo_url'] as String?,
  );

  String get displayName {
    final parts = [make, model].where((p) => p != null).join(' ');
    return parts.isNotEmpty ? parts : registration ?? 'Vehicle';
  }
}

class BookingModel {
  // ── Identifiers ──────────────────────────────────────────────────────────
  final String id;
  final String? bookingNumber;
  final String? bookingId;

  // ── Classification ────────────────────────────────────────────────────────
  final String tripType;
  final String status;

  // ── Customer ──────────────────────────────────────────────────────────────
  final String? customerName;
  final String? customerContact;
  final String? customerId;

  // ── Driver ────────────────────────────────────────────────────────────────
  final String? driverName;
  final String? driverId;

  // ── Vehicle ───────────────────────────────────────────────────────────────
  final String? vehicleReg;
  final String? vehicleId;
  final VehicleInfo? vehicleInfo; // populated when fetched with JOIN

  // ── Route ─────────────────────────────────────────────────────────────────
  final String? pickupLocation;
  final String? dropLocation;

  // ── Schedule ──────────────────────────────────────────────────────────────
  final DateTime? startDate;
  final String? startTime;
  final DateTime? endDate;
  final String? endTime;

  // ── Distance ──────────────────────────────────────────────────────────────
  final double? totalKm;

  // ── Notes & metadata ──────────────────────────────────────────────────────
  final String? notes;
  final String? remarks;
  final Map<String, dynamic>? typeData;

  // ── Timestamps ────────────────────────────────────────────────────────────
  final DateTime? createdAt;
  final DateTime? updatedAt;

  // ── Stops (loaded separately) ─────────────────────────────────────────────
  final List<BookingStop> stops;

  const BookingModel({
    required this.id,
    required this.tripType,
    required this.status,
    this.bookingNumber,
    this.bookingId,
    this.customerName,
    this.customerContact,
    this.customerId,
    this.driverName,
    this.driverId,
    this.vehicleReg,
    this.vehicleId,
    this.vehicleInfo,
    this.pickupLocation,
    this.dropLocation,
    this.startDate,
    this.startTime,
    this.endDate,
    this.endTime,
    this.totalKm,
    this.notes,
    this.remarks,
    this.typeData,
    this.createdAt,
    this.updatedAt,
    this.stops = const [],
  });

  // ── Columns to request (never request financial/admin-only fields) ─────────
  static const String listColumns =
      'id, booking_number, booking_id, type, status, '
      'customer_name, customer_contact, customer_id, '
      'driver_name, driver_id, '
      'vehicle_reg, vehicle_id, '
      'pickup_location, drop_location, '
      'start_date, start_time, end_date, end_time, '
      'total_km, notes, created_at, updated_at';

  static const String detailColumns = '$listColumns, remarks, type_data';

  factory BookingModel.fromMap(
    Map<String, dynamic> m, {
    VehicleInfo? vehicleInfo,
    List<BookingStop> stops = const [],
  }) {
    return BookingModel(
      id: m['id'] as String? ?? '',
      bookingNumber: m['booking_number'] as String?,
      bookingId: m['booking_id'] as String?,
      tripType: m['type'] as String? ?? 'one_way',
      status: m['status'] as String? ?? 'draft',
      customerName: m['customer_name'] as String?,
      customerContact: m['customer_contact'] as String?,
      customerId: m['customer_id'] as String?,
      driverName: m['driver_name'] as String?,
      driverId: m['driver_id'] as String?,
      vehicleReg: m['vehicle_reg'] as String?,
      vehicleId: m['vehicle_id'] as String?,
      vehicleInfo: vehicleInfo,
      pickupLocation: m['pickup_location'] as String?,
      dropLocation: m['drop_location'] as String?,
      startDate: _parseDate(m['start_date']),
      startTime: _trimTime(m['start_time']),
      endDate: _parseDate(m['end_date']),
      endTime: _trimTime(m['end_time']),
      totalKm: _parseDouble(m['total_km']),
      notes: m['notes'] as String?,
      remarks: m['remarks'] as String?,
      typeData: m['type_data'] as Map<String, dynamic>?,
      createdAt: _parseDatetime(m['created_at']),
      updatedAt: _parseDatetime(m['updated_at']),
      stops: stops,
    );
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  bool get isAssigned => status == 'assigned';
  bool get isPreAssigned =>
      status == 'pending' || status == 'approved' || status == 'confirmed';
  bool get isStarted => status == 'started';
  bool get isCompleted => status == 'completed';
  bool get isClosed => status == 'closed';
  bool get isCancelled => status == 'cancelled';
  bool get isActive => isAssigned || isStarted;

  bool get isUpcoming {
    if (startDate == null) return false;
    final today = DateTime.now();
    return startDate!.isAfter(
      DateTime(
        today.year,
        today.month,
        today.day,
      ).subtract(const Duration(seconds: 1)),
    );
  }

  String get displayTime {
    if (startTime == null) return 'Time TBD';
    final p = startTime!.split(':');
    return p.length >= 2 ? '${p[0]}:${p[1]}' : startTime!;
  }

  String get tripTypeLabel => switch (tripType) {
    'one_way' => 'One Way',
    'round_trip' => 'Round Trip',
    'rental_with_driver' => 'Rental',
    'outstation' => 'Outstation',
    'self_drive' => 'Self Drive',
    _ => tripType,
  };

  String get statusLabel => switch (status) {
    'draft' => 'Draft',
    'pending' => 'Pending',
    'approved' => 'Approved',
    'confirmed' => 'Confirmed',
    'assigned' => 'Assigned',
    'started' => 'In Progress',
    'completed' => 'Completed',
    'closed' => 'Closed',
    'cancelled' => 'Cancelled',
    _ => status,
  };

  String get vehicleDisplay =>
      vehicleInfo?.displayName ?? vehicleReg ?? 'Vehicle TBD';

  // Extra stops from type_data JSONB
  List<String> get typeDataStops {
    final raw = typeData?['stops'];
    if (raw is List) return raw.whereType<String>().toList();
    return [];
  }

  // ── Parsers ───────────────────────────────────────────────────────────────
  static DateTime? _parseDate(dynamic v) =>
      v == null ? null : DateTime.tryParse(v.toString());

  static DateTime? _parseDatetime(dynamic v) =>
      v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

  static String? _trimTime(dynamic v) => v?.toString();

  static double? _parseDouble(dynamic v) =>
      v == null ? null : (v as num).toDouble();

  @override
  bool operator ==(Object other) => other is BookingModel && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'BookingModel(id: $id, ref: $bookingNumber, status: $status)';
}
