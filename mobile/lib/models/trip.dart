// ─────────────────────────────────────────────────────────────────────────────
// trip.dart
// Mirrors the `bookings` table — the primary trip table used by the Web ERP.
//
// SECURITY: base_fare and total_fare are intentionally omitted.
//   Drivers must not see company financial data.
//   Those fields remain on the server and are never fetched in driver queries.
//
// Verified schema (2026-08-15):
//   bookings: id, booking_number, booking_id, type, status,
//             customer_name, customer_contact, driver_name, driver_id,
//             vehicle_reg, vehicle_id, pickup_location, drop_location,
//             start_date, start_time, end_date, end_time,
//             total_km, notes, type_data, created_at, updated_at
// ─────────────────────────────────────────────────────────────────────────────

class TripModel {
  // ── Identifiers ──────────────────────────────────────────────────────────
  final String id; // UUID primary key
  final String? bookingNumber; // e.g. "FY26-JUL-0034"
  final String? bookingId; // legacy text reference

  // ── Trip classification ───────────────────────────────────────────────────
  final String
  tripType; // one_way | round_trip | rental_with_driver | self_drive
  final String status; // draft | assigned | started | completed | cancelled

  // ── Customer (driver-visible only) ────────────────────────────────────────
  final String? customerName;
  final String? customerContact; // phone number — needed in case of emergency

  // ── Route ─────────────────────────────────────────────────────────────────
  final String? pickupLocation;
  final String? dropLocation;

  // ── Schedule ──────────────────────────────────────────────────────────────
  final DateTime? startDate;
  final String? startTime; // stored as HH:mm:ss in Supabase
  final DateTime? endDate;
  final String? endTime;

  // ── Vehicle ───────────────────────────────────────────────────────────────
  final String? vehicleReg; // registration plate e.g. "PY01DF1255"
  final String? vehicleId; // UUID FK to vehicles

  // ── Driver reference (for RLS double-check) ───────────────────────────────
  final String? driverName; // TEXT fallback
  final String? driverId; // UUID FK to drivers

  // ── Distance (visible — not financial) ───────────────────────────────────
  final double? totalKm;

  // ── Notes & extras ────────────────────────────────────────────────────────
  final String? notes;
  final Map<String, dynamic>? typeData; // JSONB — stops, return info etc.

  // ── Timestamps ────────────────────────────────────────────────────────────
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const TripModel({
    required this.id,
    required this.tripType,
    required this.status,
    this.bookingNumber,
    this.bookingId,
    this.customerName,
    this.customerContact,
    this.pickupLocation,
    this.dropLocation,
    this.startDate,
    this.startTime,
    this.endDate,
    this.endTime,
    this.vehicleReg,
    this.vehicleId,
    this.driverName,
    this.driverId,
    this.totalKm,
    this.notes,
    this.typeData,
    this.createdAt,
    this.updatedAt,
  });

  // ── Factory ───────────────────────────────────────────────────────────────

  /// Only select these columns from Supabase — never request base_fare / total_fare
  static const String selectColumns =
      'id, booking_number, booking_id, type, status, '
      'customer_name, customer_contact, '
      'driver_name, driver_id, '
      'vehicle_reg, vehicle_id, '
      'pickup_location, drop_location, '
      'start_date, start_time, end_date, end_time, '
      'total_km, notes, type_data, '
      'created_at, updated_at';

  factory TripModel.fromMap(Map<String, dynamic> m) {
    return TripModel(
      id: m['id'] as String? ?? '',
      bookingNumber: m['booking_number'] as String?,
      bookingId: m['booking_id'] as String?,
      tripType: m['type'] as String? ?? 'one_way',
      status: m['status'] as String? ?? 'draft',
      customerName: m['customer_name'] as String?,
      customerContact: m['customer_contact'] as String?,
      driverName: m['driver_name'] as String?,
      driverId: m['driver_id'] as String?,
      vehicleReg: m['vehicle_reg'] as String?,
      vehicleId: m['vehicle_id'] as String?,
      pickupLocation: m['pickup_location'] as String?,
      dropLocation: m['drop_location'] as String?,
      startDate: _parseDate(m['start_date']),
      startTime: _formatTime(m['start_time']),
      endDate: _parseDate(m['end_date']),
      endTime: _formatTime(m['end_time']),
      totalKm: _parseDouble(m['total_km']),
      notes: m['notes'] as String?,
      typeData: m['type_data'] as Map<String, dynamic>?,
      createdAt: _parseDatetime(m['created_at']),
      updatedAt: _parseDatetime(m['updated_at']),
    );
  }

  // ── Computed helpers ──────────────────────────────────────────────────────

  bool get isDraft => status == 'draft';
  bool get isPreAssigned =>
      status == 'pending' || status == 'approved' || status == 'confirmed';
  bool get isClosed => status == 'closed';
  bool get isAssigned => status == 'assigned';
  bool get isStarted => status == 'started';
  bool get isCompleted => status == 'completed';
  bool get isCancelled => status == 'cancelled';
  bool get isActive => isAssigned || isStarted;

  bool get isToday {
    if (startDate == null) return false;
    final today = DateTime.now();
    return startDate!.year == today.year &&
        startDate!.month == today.month &&
        startDate!.day == today.day;
  }

  /// Human-readable trip type label
  String get tripTypeLabel => switch (tripType) {
    'one_way' => 'One Way',
    'round_trip' => 'Round Trip',
    'rental_with_driver' => 'Rental',
    'self_drive' => 'Self Drive',
    'outstation' => 'Outstation',
    _ => tripType,
  };

  /// Status label
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

  /// Display time — trims seconds from "HH:mm:ss"
  String get displayTime {
    if (startTime == null) return 'Time TBD';
    final parts = startTime!.split(':');
    if (parts.length >= 2) return '${parts[0]}:${parts[1]}';
    return startTime!;
  }

  /// Route summary for card display
  String get routeSummary {
    final p = pickupLocation ?? '—';
    final d = dropLocation ?? '—';
    return '$p → $d';
  }

  // ── Private parsers ───────────────────────────────────────────────────────

  String? get pickupPlaceFixed {
    final td = typeData;
    if (td == null) return null;
    final v = td['pickup'] ?? td['baseLocation'];
    return (v is String && v.trim().isNotEmpty) ? v : null;
  }

  String? get dropPlaceFixed {
    final td = typeData;
    if (td == null) return null;
    final v = td['drop'] ?? td['destination'];
    return (v is String && v.trim().isNotEmpty) ? v : null;
  }

  double? get pickupLat => _numVal(typeData?['pickupLat'] ?? typeData?['lat']);
  double? get pickupLng => _numVal(typeData?['pickupLng'] ?? typeData?['lng']);
  double? get dropLat => _numVal(typeData?['dropLat'] ?? typeData?['lat']);
  double? get dropLng => _numVal(typeData?['dropLng'] ?? typeData?['lng']);

  static double? _numVal(dynamic v) {
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    return DateTime.tryParse(v.toString());
  }

  static DateTime? _parseDatetime(dynamic v) {
    if (v == null) return null;
    return DateTime.tryParse(v.toString())?.toLocal();
  }

  static String? _formatTime(dynamic v) {
    if (v == null) return null;
    return v.toString();
  }

  static double? _parseDouble(dynamic v) {
    if (v == null) return null;
    return (v as num).toDouble();
  }

  @override
  bool operator ==(Object other) => other is TripModel && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() =>
      'TripModel(id: $id, booking: $bookingNumber, status: $status)';
}
