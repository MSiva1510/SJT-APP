// ─────────────────────────────────────────────────────────────────────────────
// new_booking.dart — the manager "New booking" flow: trip types, the draft
// a manager fills in, pure validation helpers, the FY booking-number rule and
// the date-overlap rule used for the "Booked" check.
//
// Live schema (public.bookings, verified 2026-10-29): type text NOT NULL,
// status CHECK (draft … cancelled), booking_number UNIQUE, booking_id text,
// created_by text, total_fare / base_fare numeric, type_data jsonb,
// customer_id uuid → customers. There is no advance column — advance and
// balance live in type_data, exactly like the imported rows.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:intl/intl.dart';

import 'manager_models.dart';

/// bookings.type values used by the web ERP (src/data/tripTypes.js).
enum TripType {
  oneWay('one_way', 'One way', 'Pickup to drop, single direction'),
  roundTrip('round_trip', 'Round trip', 'Out and back to the pickup point'),
  localVisit('local_visit', 'Local visit', 'Several stops in the same city'),
  multiDay('multi_day', 'Multi-day trip', 'Outstation trip over several days'),
  rentalWithDriver(
    'rental_with_driver',
    'Rental with driver',
    'Hourly or daily rental, chauffeur driven',
  ),
  selfDrive('self_drive', 'Self drive', 'Customer drives the vehicle');

  const TripType(this.value, this.label, this.description);

  final String value;
  final String label;
  final String description;

  bool get needsDriver => this != TripType.selfDrive;
  bool get isRental =>
      this == TripType.rentalWithDriver || this == TripType.selfDrive;

  static TripType? fromValue(String? v) {
    for (final t in values) {
      if (t.value == v) return t;
    }
    return null;
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

final _nameRe = RegExp(r"^[\p{L}\p{M}][\p{L}\p{M} .'\-]*$", unicode: true);

/// Web rule: required, letters / space / - ' . only, max 60.
String? customerNameError(String input) {
  final s = input.trim();
  if (s.isEmpty) return 'Customer name is required';
  if (s.length > 60) return 'Use at most 60 characters';
  if (!_nameRe.hasMatch(s)) return "Use letters, spaces and - ' . only";
  return null;
}

/// 10-digit Indian mobile (starts 6–9). Accepts "+91 98400 12345",
/// "098400 12345" etc. Returns the bare 10 digits, or null if invalid.
String? normalizeIndianMobile(String input) {
  var d = input.replaceAll(RegExp(r'[\s\-()]'), '');
  if (d.startsWith('+91')) {
    d = d.substring(3);
  } else if (d.length == 12 && d.startsWith('91')) {
    d = d.substring(2);
  } else if (d.length == 11 && d.startsWith('0')) {
    d = d.substring(1);
  }
  return RegExp(r'^[6-9]\d{9}$').hasMatch(d) ? d : null;
}

/// Optional field: empty is fine, otherwise it must be a valid mobile.
String? indianMobileError(String input) {
  if (input.trim().isEmpty) return null;
  return normalizeIndianMobile(input) == null
      ? 'Enter a valid 10-digit mobile number'
      : null;
}

// ── Booking number: FY{yy}-{MON}-{####} ──────────────────────────────────────

/// Indian financial year starts 1 April; the label is the last two digits of
/// the year the FY starts in (Apr 2026 – Mar 2027 → "FY26-").
String bookingFyPrefix(DateTime date) {
  final startYear = date.month >= 4 ? date.year : date.year - 1;
  return 'FY${(startYear % 100).toString().padLeft(2, '0')}-';
}

final _numberRe = RegExp(r'^FY(\d{2})-[A-Z]{3}-(\d+)$');

/// Next booking number for a trip starting on [date]. The sequence runs
/// across the whole FY (all months) — next = highest existing #### with the
/// same FY prefix + 1 (+ [bump] when retrying after a unique violation).
/// Compared numerically: text max("FY26-MAY-0023","FY26-JUL-0051") is MAY.
String nextBookingNumber(
  DateTime date,
  Iterable<String?> existing, {
  int bump = 0,
}) {
  final prefix = bookingFyPrefix(date);
  var max = 0;
  for (final n in existing) {
    if (n == null || !n.startsWith(prefix)) continue;
    final m = _numberRe.firstMatch(n.trim());
    if (m == null) continue;
    final seq = int.parse(m.group(2)!);
    if (seq > max) max = seq;
  }
  final month = DateFormat('MMM', 'en_US').format(date).toUpperCase();
  final seq = (max + 1 + bump).toString().padLeft(4, '0');
  return '$prefix$month-$seq';
}

// ── Availability ─────────────────────────────────────────────────────────────

DateTime _dayOf(DateTime d) => DateTime(d.year, d.month, d.day);

/// Inclusive day-range overlap; a missing end means a single-day trip.
bool bookingOverlaps({
  required DateTime start,
  DateTime? end,
  required DateTime otherStart,
  DateTime? otherEnd,
}) {
  final a0 = _dayOf(start);
  final a1 = _dayOf(end ?? start);
  final b0 = _dayOf(otherStart);
  final b1 = _dayOf(otherEnd ?? otherStart);
  return !a1.isBefore(b0) && !b1.isBefore(a0);
}

/// Statuses that do not hold a vehicle / driver.
const bookingFreeStatuses = {'cancelled', 'completed', 'closed'};

/// Vehicles and drivers already held by an open booking in a date range.
class BusyResources {
  const BusyResources({this.vehicleIds = const {}, this.driverIds = const {}});

  final Set<String> vehicleIds;
  final Set<String> driverIds;

  static const none = BusyResources();

  /// Pure filter over raw rows (vehicle_id, driver_id, status, start_date,
  /// end_date) — the repository narrows on the server, this re-checks.
  factory BusyResources.fromRows(
    Iterable<Map<String, dynamic>> rows, {
    required DateTime start,
    DateTime? end,
  }) {
    final v = <String>{};
    final d = <String>{};
    for (final r in rows) {
      if (bookingFreeStatuses.contains(r['status'])) continue;
      final s = DateTime.tryParse('${r['start_date']}');
      if (s == null) continue;
      final e = r['end_date'] == null
          ? null
          : DateTime.tryParse('${r['end_date']}');
      if (!bookingOverlaps(
        start: start,
        end: end,
        otherStart: s,
        otherEnd: e,
      )) {
        continue;
      }
      if (r['vehicle_id'] != null) v.add('${r['vehicle_id']}');
      if (r['driver_id'] != null) d.add('${r['driver_id']}');
    }
    return BusyResources(vehicleIds: v, driverIds: d);
  }
}

/// A previous customer (distinct name + contact from past bookings).
class CustomerOption {
  const CustomerOption({
    required this.name,
    this.contact,
    this.customerId,
    this.lastTrip,
  });

  final String name;
  final String? contact;
  final String? customerId;
  final DateTime? lastTrip;
}

/// What the repository returns after an insert.
typedef CreatedBooking = ({String id, String bookingNumber});

// ── Draft ────────────────────────────────────────────────────────────────────

final _ymd = DateFormat('yyyy-MM-dd');

String? _clean(String? s) {
  final v = s?.trim();
  return (v == null || v.isEmpty) ? null : v;
}

/// Everything the manager entered. [toRow] builds the bookings insert so it
/// matches the web's CreateTrip payload (type_data camelCase keys, display
/// names, booking_ref) and the imported rows (self_drive / advance / balance
/// / start_km keys) — and fixes the web's gaps (created_by, top-level
/// driver_name / vehicle_reg).
class NewBookingDraft {
  const NewBookingDraft({
    required this.type,
    required this.customerName,
    required this.startDate,
    required this.vehicle,
    this.customerContact,
    this.customerId,
    this.startTime,
    this.endDate,
    this.endTime,
    this.pickup,
    this.drop,
    this.stops = const [],
    this.waitingTime,
    this.numberOfDays,
    this.securityDeposit,
    this.startKm,
    this.driver,
    this.totalFare,
    this.advance,
    this.notes,
  });

  final TripType type;
  final String customerName;
  final String? customerContact; // 10 digits
  final String? customerId; // customers.id when picked from a past booking
  final DateTime startDate;
  final String? startTime; // HH:mm
  final DateTime? endDate; // return date (round trip / rentals)
  final String? endTime; // HH:mm
  final String? pickup; // pickup · baseLocation (local visit)
  final String? drop; // drop · destination
  final List<String> stops; // local visit
  final String? waitingTime; // local visit
  final int? numberOfDays; // multi-day
  final double? securityDeposit; // self drive
  final double? startKm; // self drive
  final VehicleOption vehicle;
  final DriverOption? driver; // always null for self drive
  final double? totalFare;
  final double? advance;
  final String? notes;

  DriverOption? get effectiveDriver => type.needsDriver ? driver : null;

  /// A driver chosen → assigned, otherwise draft. Self drive needs no driver
  /// (the vehicle is always chosen), so it is assigned straight away —
  /// the owner's call; the web saves it as draft.
  String get status =>
      effectiveDriver != null || type == TripType.selfDrive
          ? 'assigned'
          : 'draft';

  List<String> get cleanStops =>
      stops.map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

  /// Last day the vehicle is out (inclusive).
  DateTime get lastDay {
    if (type == TripType.multiDay && (numberOfDays ?? 0) > 1) {
      return _dayOf(startDate).add(Duration(days: numberOfDays! - 1));
    }
    if (endDate != null && endDate!.isAfter(startDate)) return _dayOf(endDate!);
    return _dayOf(startDate);
  }

  String? get pickupLocation => _clean(pickup);

  String? get dropLocation => switch (type) {
    TripType.localVisit => cleanStops.isEmpty ? null : cleanStops.join(' · '),
    _ => _clean(drop),
  };

  double? get balance => totalFare == null ? null : totalFare! - (advance ?? 0);

  Map<String, dynamic> typeData(String bookingNumber) {
    final details = <String, dynamic>{
      ...switch (type) {
        TripType.oneWay => {'pickup': pickupLocation, 'drop': _clean(drop)},
        TripType.roundTrip => {
          'pickup': pickupLocation,
          'destination': _clean(drop),
          'returnDate': endDate == null ? null : _ymd.format(endDate!),
          'returnTime': _clean(endTime),
        },
        TripType.localVisit => {
          'baseLocation': pickupLocation,
          'stops': cleanStops,
          'waitingTime': _clean(waitingTime),
        },
        TripType.multiDay => {
          'pickup': pickupLocation,
          'destination': _clean(drop),
          'numberOfDays': numberOfDays,
        },
        TripType.rentalWithDriver => {
          'pickupTime': _clean(startTime),
          'returnTime': _clean(endTime),
        },
        TripType.selfDrive => {
          'pickupTime': _clean(startTime),
          'returnTime': _clean(endTime),
          'securityDeposit': securityDeposit,
          'startKm': startKm,
        },
      },
    };
    return {
      ...details,
      // Rentals have no route fields on the web; keep where they go.
      if (type.isRental && pickupLocation != null) 'pickup': pickupLocation,
      if (type.isRental && _clean(drop) != null) 'destination': _clean(drop),
      'driver_name': effectiveDriver?.name,
      'vehicle_registration': vehicle.registration,
      'booking_ref': bookingNumber,
      // Same keys as the imported (sheet) rows.
      'self_drive': type == TripType.selfDrive,
      'advance': advance,
      'balance': balance,
      if (type == TripType.selfDrive) 'start_km': startKm,
      'source': 'manager_app',
    };
  }

  /// The bookings insert payload.
  Map<String, dynamic> toRow({
    required String bookingNumber,
    required String actorName,
    String? actorId,
    String actorRole = 'manager',
    DateTime? now,
  }) {
    final at = (now ?? DateTime.now()).toUtc().toIso8601String();
    final d = effectiveDriver;
    final end = lastDay;
    final hasEnd = end.isAfter(_dayOf(startDate));
    return {
      'booking_number': bookingNumber,
      'booking_id': bookingNumber,
      'type': type.value,
      'status': status,
      'customer_name': customerName.trim(),
      'customer_contact': _clean(customerContact),
      if (customerId != null) 'customer_id': customerId,
      'pickup_location': pickupLocation,
      'drop_location': dropLocation,
      'start_date': _ymd.format(startDate),
      'start_time': _clean(startTime),
      'end_date': hasEnd ? _ymd.format(end) : null,
      'end_time': _clean(endTime),
      'vehicle_id': vehicle.id,
      'vehicle_reg': vehicle.registration,
      'driver_id': d?.id,
      'driver_name': d?.name,
      'total_fare': totalFare,
      'notes': _clean(notes),
      'type_data': typeData(bookingNumber),
      'created_by': actorId ?? actorName,
      'last_modified_by': actorName,
      'approval_history': [
        {
          'action': 'created',
          'from_status': null,
          'to_status': status,
          'actor_name': actorName,
          'actor_role': actorRole,
          'remarks': null,
          'created_at': at,
        },
      ],
      'created_at': at,
      'updated_at': at,
    };
  }
}
