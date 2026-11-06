// ─────────────────────────────────────────────────────────────────────────────
// manager_directory.dart — read models for the manager's Documents, Vehicles,
// Drivers and Customers screens, plus the document-expiry rules.
//
// Expiry dates live in two places on the web ERP: the `documents` table
// (Documents page) and the dated columns on `vehicles` / `drivers` (Vehicles
// and Drivers pages). [buildExpiryList] merges both and keeps the EARLIEST
// date per owner + document type, so an alert is never hidden by a newer
// value typed on the other page.
// ─────────────────────────────────────────────────────────────────────────────

DateTime? _date(Object? v) {
  final d = v == null ? null : DateTime.tryParse('$v');
  return d == null ? null : DateTime(d.year, d.month, d.day);
}

String? _str(Object? v) {
  final s = v?.toString().trim();
  return (s == null || s.isEmpty || s == 'null') ? null : s;
}

int? _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}');

// ── Document expiry ──────────────────────────────────────────────────────────

/// Same window as the web Documents page ("Expiring (30 days)").
const expirySoonDays = 30;

enum ExpiryState { expired, soon, ok }

ExpiryState expiryStateOf(DateTime expiry, DateTime today) {
  final days = daysUntil(expiry, today);
  if (days < 0) return ExpiryState.expired;
  if (days <= expirySoonDays) return ExpiryState.soon;
  return ExpiryState.ok;
}

/// Whole calendar days from [today] to [expiry] (negative once past).
int daysUntil(DateTime expiry, DateTime today) {
  final a = DateTime.utc(today.year, today.month, today.day);
  final b = DateTime.utc(expiry.year, expiry.month, expiry.day);
  return b.difference(a).inDays;
}

/// "Expired 12 days ago" · "Expires today" · "Expires in 5 days" ·
/// "Valid for 22 months" · "Valid for 9 years".
String expiryPhrase(DateTime expiry, DateTime today) {
  final d = daysUntil(expiry, today);
  if (d < -1) return 'Expired ${-d} days ago';
  if (d == -1) return 'Expired yesterday';
  if (d == 0) return 'Expires today';
  if (d == 1) return 'Expires tomorrow';
  if (d <= 60) return 'Expires in $d days';
  if (d < 730) return 'Valid for ${d ~/ 30} months';
  return 'Valid for ${d ~/ 365} years';
}

enum DocOwner { vehicle, driver }

const _docLabels = {
  'insurance': 'Insurance',
  'fitness': 'Fitness certificate (FC)',
  'pollution': 'Pollution certificate (PUC)',
  'registration': 'Registration (RC)',
  'permit': 'Permit',
  'license': 'Driving licence',
  'licence': 'Driving licence',
  'badge': 'Driver badge',
};

String docTypeLabel(String type) {
  final known = _docLabels[_canonType(type)];
  if (known != null) return known;
  final s = type.replaceAll('_', ' ').trim();
  return s.isEmpty ? 'Document' : '${s[0].toUpperCase()}${s.substring(1)}';
}

class ExpiryItem {
  const ExpiryItem({
    required this.owner,
    required this.ownerId,
    required this.ownerName,
    required this.docType,
    required this.expiry,
  });

  final DocOwner owner;
  final String ownerId;
  final String ownerName; // registration or driver name
  final String docType; // insurance · fitness · pollution · license …
  final DateTime expiry;

  String get label => docTypeLabel(docType);
  ExpiryState stateOn(DateTime today) => expiryStateOf(expiry, today);
}

/// One list of every dated document: `documents` rows + vehicle / driver
/// columns, earliest date per (owner, type), soonest first.
List<ExpiryItem> buildExpiryList({
  required List<Map<String, dynamic>> documents,
  required List<VehicleRecord> vehicles,
  required List<DriverRecord> drivers,
}) {
  final byKey = <String, ExpiryItem>{};
  void add(ExpiryItem i) {
    final key = '${i.owner.name}|${i.ownerId}|${_canonType(i.docType)}';
    final had = byKey[key];
    if (had == null || i.expiry.isBefore(had.expiry)) byKey[key] = i;
  }

  for (final v in vehicles) {
    for (final e in {
      'insurance': v.insuranceExpiry,
      'fitness': v.fitnessExpiry,
      'pollution': v.pollutionExpiry,
      'registration': v.registrationExpiry,
    }.entries) {
      if (e.value == null) continue;
      add(ExpiryItem(
        owner: DocOwner.vehicle,
        ownerId: v.id,
        ownerName: v.registration,
        docType: e.key,
        expiry: e.value!,
      ));
    }
  }
  for (final d in drivers) {
    if (d.licenseExpiry == null) continue;
    add(ExpiryItem(
      owner: DocOwner.driver,
      ownerId: d.id,
      ownerName: d.name,
      docType: 'license',
      expiry: d.licenseExpiry!,
    ));
  }

  final vehicleById = {for (final v in vehicles) v.id: v};
  final driverById = {for (final d in drivers) d.id: d};
  for (final m in documents) {
    final expiry = _date(m['expiry_date']);
    if (expiry == null) continue;
    final type = _str(m['doc_type']) ?? _str(m['document_type']) ?? 'document';
    final vId = _str(m['vehicle_id']);
    final dId = _str(m['driver_id']);
    if (vId != null && vehicleById[vId] != null) {
      add(ExpiryItem(
        owner: DocOwner.vehicle,
        ownerId: vId,
        ownerName: vehicleById[vId]!.registration,
        docType: type,
        expiry: expiry,
      ));
    } else if (dId != null && driverById[dId] != null) {
      add(ExpiryItem(
        owner: DocOwner.driver,
        ownerId: dId,
        ownerName: driverById[dId]!.name,
        docType: type,
        expiry: expiry,
      ));
    }
  }

  return byKey.values.toList()..sort((a, b) => a.expiry.compareTo(b.expiry));
}

String _canonType(String t) {
  final s = t.toLowerCase().replaceAll('_', ' ').trim();
  if (s.contains('insurance')) return 'insurance';
  if (s.contains('licen')) return 'license';
  if (s.contains('fitness') || s == 'fc' || s.startsWith('fc ')) {
    return 'fitness';
  }
  if (s.contains('pollution') || s == 'puc' || s.startsWith('puc ')) {
    return 'pollution';
  }
  if (s == 'rc' || s.startsWith('rc ') || s.contains('registration')) {
    return 'registration';
  }
  return s;
}

/// Counts for the dashboard card.
typedef ExpirySummary = ({int expired, int soon});

ExpirySummary summarizeExpiry(List<ExpiryItem> items, DateTime today) {
  var expired = 0, soon = 0;
  for (final i in items) {
    switch (i.stateOn(today)) {
      case ExpiryState.expired:
        expired++;
      case ExpiryState.soon:
        soon++;
      case ExpiryState.ok:
        break;
    }
  }
  return (expired: expired, soon: soon);
}

// ── Vehicles ─────────────────────────────────────────────────────────────────

class VehicleRecord {
  const VehicleRecord({
    required this.id,
    required this.registration,
    required this.status,
    this.makeModel,
    this.vehicleType,
    this.year,
    this.color,
    this.capacity,
    this.fuelType,
    this.currentKm,
    this.lastServiceKm,
    this.insuranceExpiry,
    this.fitnessExpiry,
    this.pollutionExpiry,
    this.registrationExpiry,
    this.driverName,
  });

  static const columns =
      'id, registration, status, make, model, vehicle_type, year, color, '
      'capacity, fuel_type, current_km, last_service_km, insurance_expiry, '
      'fitness_cert_expiry, pollution_cert_expiry, registration_expiry';

  final String id;
  final String registration;
  final String status;
  final String? makeModel;
  final String? vehicleType;
  final int? year;
  final String? color;
  final int? capacity;
  final String? fuelType;
  final int? currentKm;
  final int? lastServiceKm; // 0 on the web means "never entered"
  final DateTime? insuranceExpiry;
  final DateTime? fitnessExpiry;
  final DateTime? pollutionExpiry;
  final DateTime? registrationExpiry;

  /// Newest `vehicle_assignments` row for this registration (same as the
  /// web Vehicles page).
  final String? driverName;

  factory VehicleRecord.fromMap(Map<String, dynamic> m, {String? driverName}) {
    final makeModel =
        [_str(m['make']), _str(m['model'])].whereType<String>().join(' ');
    return VehicleRecord(
      id: m['id'] as String,
      registration: _str(m['registration']) ?? '—',
      status: _str(m['status']) ?? 'active',
      makeModel: makeModel.isEmpty ? null : makeModel,
      vehicleType: _str(m['vehicle_type']),
      year: _int(m['year']),
      color: _str(m['color']),
      capacity: _int(m['capacity']),
      fuelType: _str(m['fuel_type']),
      currentKm: _int(m['current_km']),
      lastServiceKm: _int(m['last_service_km']),
      insuranceExpiry: _date(m['insurance_expiry']),
      fitnessExpiry: _date(m['fitness_cert_expiry']),
      pollutionExpiry: _date(m['pollution_cert_expiry']),
      registrationExpiry: _date(m['registration_expiry']),
      driverName: driverName,
    );
  }

  /// Km since the last service, or null when no service km was entered.
  int? get kmSinceService =>
      (currentKm == null || lastServiceKm == null || lastServiceKm! <= 0)
          ? null
          : currentKm! - lastServiceKm!;
}

/// Registration with spaces / dashes removed, upper case ("py01 vf-1255" →
/// "PY01VF1255").
String regKey(String reg) => reg.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');

/// Registration (as [regKey]) → driver of the newest assignment row (rows newest first).
Map<String, String> latestDriverByVehicle(List<Map<String, dynamic>> rowsNewestFirst) {
  final out = <String, String>{};
  for (final r in rowsNewestFirst) {
    final raw = _str(r['vehicle_reg']);
    final reg = raw == null ? null : regKey(raw);
    final name = _str(r['driver_name']);
    if (reg == null || name == null) continue;
    out.putIfAbsent(reg, () => name);
  }
  return out;
}

/// Driver id → registration of that driver's newest assignment row.
Map<String, String> latestVehicleByDriver(List<Map<String, dynamic>> rowsNewestFirst) {
  final out = <String, String>{};
  for (final r in rowsNewestFirst) {
    final id = _str(r['driver_id']);
    final reg = _str(r['vehicle_reg']);
    if (id == null || reg == null) continue;
    out.putIfAbsent(id, () => reg);
  }
  return out;
}

// ── Drivers ──────────────────────────────────────────────────────────────────

class DriverRecord {
  const DriverRecord({
    required this.id,
    required this.name,
    required this.status,
    this.phone,
    this.email,
    this.city,
    this.licenseNumber,
    this.licenseExpiry,
    this.joinedDate,
    this.emergencyContact,
    this.emergencyPhone,
    this.vehicleReg,
  });

  static const columns =
      'id, name, status, phone, email, city, license_number, license_expiry, '
      'joined_date, emergency_contact, emergency_phone';

  final String id;
  final String name;
  final String status; // active · inactive · suspended · on_leave
  final String? phone;
  final String? email;
  final String? city;
  final String? licenseNumber;
  final DateTime? licenseExpiry;
  final DateTime? joinedDate;
  final String? emergencyContact;
  final String? emergencyPhone;

  /// Vehicle of this driver's newest assignment row.
  final String? vehicleReg;

  factory DriverRecord.fromMap(Map<String, dynamic> m, {String? vehicleReg}) =>
      DriverRecord(
        id: m['id'] as String,
        name: _str(m['name']) ?? 'Driver',
        status: _str(m['status']) ?? 'active',
        phone: _str(m['phone']),
        email: _str(m['email']),
        city: _str(m['city']),
        licenseNumber: _str(m['license_number']),
        licenseExpiry: _date(m['license_expiry']),
        joinedDate: _date(m['joined_date']),
        emergencyContact: _str(m['emergency_contact']),
        emergencyPhone: _str(m['emergency_phone']),
        vehicleReg: vehicleReg,
      );
}

// ── Customers ────────────────────────────────────────────────────────────────

class CustomerRecord {
  const CustomerRecord({
    required this.id,
    required this.name,
    this.code,
    this.phone,
    this.altPhone,
    this.email,
    this.type = 'individual',
    this.city,
    this.address,
    this.company,
    this.gst,
    this.notes,
    this.trips = 0,
    this.completedTrips = 0,
    this.revenue = 0,
    this.lastTrip,
  });

  static const columns =
      'id, customer_id, name, phone, mobile, primary_mobile, alt_mobile, '
      'alternate_mobile, email, type, city, address, company, company_name, '
      'gst, gstin, notes';

  final String id;
  final String name;
  final String? code; // CUST-00024
  final String? phone;
  final String? altPhone;
  final String? email;
  final String type; // individual · corporate · agent
  final String? city;
  final String? address;
  final String? company;
  final String? gst;
  final String? notes;
  final int trips;
  final int completedTrips;
  final double revenue;
  final DateTime? lastTrip;

  /// Same fallbacks as the web `normalizeCustomer` (the table carries
  /// several generations of column names).
  factory CustomerRecord.fromMap(Map<String, dynamic> m) => CustomerRecord(
        id: m['id'] as String,
        name: _str(m['name']) ?? 'Customer',
        code: _str(m['customer_id']),
        phone: _str(m['phone']) ?? _str(m['mobile']) ?? _str(m['primary_mobile']),
        altPhone: _str(m['alt_mobile']) ?? _str(m['alternate_mobile']),
        email: _str(m['email']),
        type: _str(m['type']) ?? 'individual',
        city: _str(m['city']),
        address: _str(m['address']),
        company: _str(m['company_name']) ?? _str(m['company']),
        gst: _str(m['gstin']) ?? _str(m['gst']),
        notes: _str(m['notes']),
      );

  CustomerRecord withStats(CustomerStats s) => CustomerRecord(
        id: id,
        name: name,
        code: code,
        phone: phone,
        altPhone: altPhone,
        email: email,
        type: type,
        city: city,
        address: address,
        company: company,
        gst: gst,
        notes: notes,
        trips: s.trips,
        completedTrips: s.completed,
        revenue: s.revenue,
        lastTrip: s.lastTrip,
      );

  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    final digits = q.replaceAll(RegExp(r'\D'), '');
    return name.toLowerCase().contains(q) ||
        (company?.toLowerCase().contains(q) ?? false) ||
        (city?.toLowerCase().contains(q) ?? false) ||
        (code?.toLowerCase().contains(q) ?? false) ||
        (digits.length >= 3 &&
            [phone, altPhone].any((p) => p?.replaceAll(RegExp(r'\D'), '').contains(digits) ?? false));
  }
}

class CustomerStats {
  int trips = 0;
  int completed = 0;
  double revenue = 0;
  DateTime? lastTrip;
}

/// Booking rows (customer_id, customer_name, status, total_fare, start_date)
/// → stats per customer. A booking counts for the customer whose id it
/// carries, else for the customer with the same name (older web bookings
/// have no customer_id — same rule as the web `getCustomerStats`).
Map<String, CustomerStats> customerStats(
  List<CustomerRecord> customers,
  List<Map<String, dynamic>> bookings,
) {
  final ids = {for (final c in customers) c.id};
  final byName = <String, String>{};
  for (final c in customers) {
    byName.putIfAbsent(c.name.trim().toLowerCase(), () => c.id);
  }
  final out = <String, CustomerStats>{};
  for (final b in bookings) {
    final status = _str(b['status']) ?? '';
    if (status == 'cancelled' || status == 'draft') continue;
    final cid = _str(b['customer_id']);
    final id = (cid != null && ids.contains(cid))
        ? cid
        : byName[(_str(b['customer_name']) ?? '').toLowerCase()];
    if (id == null) continue;
    final s = out.putIfAbsent(id, CustomerStats.new);
    s.trips++;
    if (status == 'completed' || status == 'closed') {
      s.completed++;
      final fare = b['total_fare'];
      s.revenue += fare is num ? fare.toDouble() : double.tryParse('${fare ?? ''}') ?? 0;
    }
    final d = _date(b['start_date']);
    if (d != null && (s.lastTrip == null || d.isAfter(s.lastTrip!))) s.lastTrip = d;
  }
  return out;
}
