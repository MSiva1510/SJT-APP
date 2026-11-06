// ─────────────────────────────────────────────────────────────────────────────
// manager_repository.dart — Supabase access for the manager mode.
//
// Access: admin / manager sessions pass the live `*_staff_all` RLS policies
// (is_staff()) on bookings, vehicles, drivers, gps_tracking, expenses,
// attendance and fleet_alerts — every query here relies on that, never on a
// client-side role check alone.
//
// Writes mirror the web ERP's own writes (src/repositories/*) so a booking or
// expense changed on the phone looks identical to one changed on the web.
//
// WhatsApp inbox: reads the whatsapp_* tables directly (staff SELECT; UPDATE
// on conversations only, for `unread`). Replies and "Resume bot" go through
// the web's POST /api/whatsapp/send with the session's access token — the
// server holds the Meta credentials and enforces the 24-hour window.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config/app_config.dart';
import '../core/config/supabase_config.dart';
import '../models/expense_numbering.dart';
import '../models/manager_directory.dart';
import '../models/manager_invoice.dart';
import '../models/manager_models.dart';
import '../models/manager_report.dart';
import '../models/manager_whatsapp.dart';
import '../models/new_booking.dart';

class ManagerException implements Exception {
  const ManagerException(this.message);
  final String message;
  @override
  String toString() => 'ManagerException: $message';
}

class ManagerRepository {
  ManagerRepository(this._client, {http.Client? httpClient})
    : _http = httpClient ?? http.Client();

  final SupabaseClient _client;
  final http.Client _http;
  bool nonTripInvoicesAvailable = true;
  static int _channelSeq = 0;

  static final _day = DateFormat('yyyy-MM-dd');

  Never _fail(String action, Object e) {
    final msg = '$e';
    throw ManagerException(
      'Could not $action (${msg.length > 120 ? '${msg.substring(0, 120)}…' : msg}).',
    );
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  Future<ManagerDashboard> dashboard({DateTime? now}) async {
    final today = _day.format(now ?? DateTime.now());
    try {
      final results = await Future.wait([
        _client
            .from('bookings')
            .select(ManagerBooking.columns)
            .eq('start_date', today),
        _client
            .from('bookings')
            .select(ManagerBooking.columns)
            .gte('start_date', today)
            .not('status', 'in', '(completed,closed,cancelled)')
            .order('start_date')
            .order('start_time')
            .limit(30),
        _client.from('bookings').select('id').eq('status', 'pending'),
        _client.from('bookings').select('id').eq('status', 'started'),
        _client.from('expenses').select('id').eq('status', 'pending'),
        _client
            .from('attendance')
            .select('status')
            .eq('attendance_date', today),
        _client.from('drivers').select('id').eq('status', 'active'),
      ]);

      final todays = (results[0] as List)
          .map((m) => ManagerBooking.fromMap(m))
          .toList();
      final upcoming = (results[1] as List)
          .map((m) => ManagerBooking.fromMap(m))
          .toList();
      final attendance = results[5] as List;

      return ManagerDashboard(
        todayTrips: todays.where((b) => b.status != 'cancelled').length,
        activeTrips: (results[3] as List).length,
        unassigned: upcoming.where((b) => !b.isAssigned).length,
        pendingApproval: (results[2] as List).length,
        pendingExpenses: (results[4] as List).length,
        presentDrivers: attendance
            .where((a) => a['status'] == 'present')
            .length,
        totalDrivers: (results[6] as List).length,
        todayRevenue: todays
            .where((b) => b.status != 'cancelled')
            .fold(0.0, (sum, b) => sum + (b.totalFare ?? 0)),
        upcoming: upcoming.take(5).toList(),
      );
    } catch (e) {
      _fail('load the dashboard', e);
    }
  }

  Future<List<FleetAlert>> activeAlerts() async {
    try {
      final rows = await _client
          .from('fleet_alerts')
          .select(FleetAlert.columns)
          .inFilter('status', ['open', 'acknowledged', 'in_progress'])
          .order('detected_at', ascending: false)
          .limit(20);
      return rows.map((m) => FleetAlert.fromMap(m)).toList();
    } catch (e) {
      _fail('load alerts', e);
    }
  }

  // ── Trips / bookings ───────────────────────────────────────────────────────

  Future<List<ManagerBooking>> bookings({int limit = 200}) async {
    try {
      final rows = await _client
          .from('bookings')
          .select(ManagerBooking.columns)
          .order('start_date', ascending: false)
          .order('start_time', ascending: false)
          .limit(limit);
      return rows.map((m) => ManagerBooking.fromMap(m)).toList();
    } catch (e) {
      _fail('load trips', e);
    }
  }

  Future<List<ManagerBooking>> attendanceTripsForMonth(DateTime month) async {
    final start = DateTime(month.year, month.month);
    final end = DateTime(month.year, month.month + 1);
    try {
      final rows = await _client
          .from('bookings')
          .select(ManagerBooking.columns)
          .gte('start_date', _day.format(start))
          .lt('start_date', _day.format(end))
          .inFilter('status', ['started', 'completed', 'closed'])
          .order('start_date')
          .order('start_time')
          .limit(3000);
      return rows.map((row) => ManagerBooking.fromMap(row)).toList();
    } catch (e) {
      _fail('load attendance trips', e);
    }
  }

  Future<ManagerReport> reportForPeriod(ManagerReportPeriod period) async {
    try {
      final rows = await _client
          .from('bookings')
          .select('status, total_fare')
          .gte('start_date', _day.format(period.start))
          .lt(
            'start_date',
            _day.format(DateTime(period.end.year, period.end.month, period.end.day + 1)),
          );
      return ManagerReport.fromBookings(List<Map<String, dynamic>>.from(rows));
    } catch (e) {
      _fail('load the report', e);
    }
  }

  Future<ManagerBooking> booking(String id) async {
    try {
      final row = await _client
          .from('bookings')
          .select(ManagerBooking.columns)
          .eq('id', id)
          .single();
      return ManagerBooking.fromMap(row);
    } catch (e) {
      _fail('load the trip', e);
    }
  }

  Future<List<DriverOption>> drivers() async {
    try {
      final rows = await _client
          .from('drivers')
          .select(DriverOption.columns)
          .order('name');
      return rows.map((m) => DriverOption.fromMap(m)).toList();
    } catch (e) {
      _fail('load drivers', e);
    }
  }

  Future<List<VehicleOption>> vehicles() async {
    try {
      final rows = await _client
          .from('vehicles')
          .select(VehicleOption.columns)
          .order('registration');
      return rows.map((m) => VehicleOption.fromMap(m)).toList();
    } catch (e) {
      _fail('load vehicles', e);
    }
  }

  // ── Directory: vehicles, drivers, customers, documents (read only) ────────

  Future<List<Map<String, dynamic>>> _assignmentsNewestFirst() async {
    final rows = await _client
        .from('vehicle_assignments')
        .select('vehicle_reg, driver_id, driver_name, assigned_at')
        .order('assigned_at', ascending: false)
        .limit(500);
    return List<Map<String, dynamic>>.from(rows);
  }

  Future<List<VehicleRecord>> vehicleRecords() async {
    try {
      final results = await Future.wait([
        _client
            .from('vehicles')
            .select(VehicleRecord.columns)
            .order('registration'),
        _assignmentsNewestFirst(),
      ]);
      final drivers = latestDriverByVehicle(results[1]);
      return results[0]
          .map(
            (m) => VehicleRecord.fromMap(
              m,
              driverName: drivers[regKey('${m['registration'] ?? ''}')],
            ),
          )
          .toList();
    } catch (e) {
      _fail('load vehicles', e);
    }
  }

  Future<List<DriverRecord>> driverRecords() async {
    try {
      final results = await Future.wait([
        _client.from('drivers').select(DriverRecord.columns).order('name'),
        _assignmentsNewestFirst(),
      ]);
      final vehicles = latestVehicleByDriver(results[1]);
      return results[0]
          .map(
            (m) => DriverRecord.fromMap(m, vehicleReg: vehicles['${m['id']}']),
          )
          .toList();
    } catch (e) {
      _fail('load drivers', e);
    }
  }

  /// Every dated driver / vehicle document, soonest expiry first.
  Future<List<ExpiryItem>> expiringDocuments() async {
    try {
      final results = await Future.wait<Object>([
        _client
            .from('documents')
            .select(
              'doc_type, document_type, expiry_date, vehicle_id, driver_id',
            )
            .not('expiry_date', 'is', null),
        vehicleRecords(),
        driverRecords(),
      ]);
      return buildExpiryList(
        documents: List<Map<String, dynamic>>.from(results[0] as List),
        vehicles: results[1] as List<VehicleRecord>,
        drivers: results[2] as List<DriverRecord>,
      );
    } on ManagerException {
      rethrow;
    } catch (e) {
      _fail('load documents', e);
    }
  }

  /// Customers with trip count, completed revenue and last trip date.
  Future<List<CustomerRecord>> customerRecords() async {
    try {
      final results = await Future.wait([
        _client.from('customers').select(CustomerRecord.columns).order('name'),
        _client
            .from('bookings')
            .select(
              'customer_id, customer_name, status, total_fare, start_date',
            )
            .order('start_date', ascending: false)
            .limit(3000),
      ]);
      final customers = results[0].map(CustomerRecord.fromMap).toList();
      final stats = customerStats(customers, results[1]);
      return [
        for (final c in customers)
          stats[c.id] == null ? c : c.withStats(stats[c.id]!),
      ];
    } catch (e) {
      _fail('load customers', e);
    }
  }

  Future<void> saveDriver({String? id, required Map<String, Object?> values}) =>
      _saveDirectoryRecord(
        table: 'drivers',
        id: id,
        values: values,
        label: 'driver',
      );

  Future<void> deleteDriver(String id) =>
      _deleteDirectoryRecord('drivers', id, 'driver');

  Future<void> saveVehicle({
    String? id,
    required Map<String, Object?> values,
  }) => _saveDirectoryRecord(
    table: 'vehicles',
    id: id,
    values: values,
    label: 'vehicle',
  );

  Future<void> deleteVehicle(String id) =>
      _deleteDirectoryRecord('vehicles', id, 'vehicle');

  Future<void> saveCustomer({
    String? id,
    required Map<String, Object?> values,
  }) => _saveDirectoryRecord(
    table: 'customers',
    id: id,
    values: values,
    label: 'customer',
  );

  Future<void> deleteCustomer(String id) =>
      _deleteDirectoryRecord('customers', id, 'customer');

  Future<void> _saveDirectoryRecord({
    required String table,
    required String? id,
    required Map<String, Object?> values,
    required String label,
  }) async {
    try {
      if (id == null) {
        await _client.from(table).insert(values);
      } else {
        await _client.from(table).update(values).eq('id', id);
      }
    } catch (e) {
      _fail(id == null ? 'add the $label' : 'save the $label', e);
    }
  }

  Future<void> _deleteDirectoryRecord(
    String table,
    String id,
    String label,
  ) async {
    try {
      await _client.from(table).delete().eq('id', id);
    } catch (e) {
      _fail('delete the $label', e);
    }
  }

  Future<List<Map<String, dynamic>>> documentRecords() async {
    try {
      final rows = await _client
          .from('documents')
          .select()
          .order('created_at', ascending: false)
          .limit(1000);
      return List<Map<String, dynamic>>.from(rows);
    } catch (e) {
      _fail('load documents', e);
    }
  }

  Future<void> saveDocument({
    String? id,
    required Map<String, Object?> values,
  }) => _saveDirectoryRecord(
    table: 'documents',
    id: id,
    values: values,
    label: 'document',
  );

  Future<String> uploadDocumentProof({
    required String ownerId,
    required String ownerType,
    required String fileName,
    required Uint8List bytes,
  }) async {
    if (bytes.isEmpty || bytes.length > 5 * 1024 * 1024) {
      throw const ManagerException('Proof image must be smaller than 5 MB.');
    }
    final isJpeg = bytes.length >= 3 &&
        bytes[0] == 0xff &&
        bytes[1] == 0xd8 &&
        bytes[2] == 0xff;
    final isPng = bytes.length >= 4 &&
        bytes[0] == 0x89 &&
        bytes[1] == 0x50 &&
        bytes[2] == 0x4e &&
        bytes[3] == 0x47;
    if (!isJpeg && !isPng) {
      throw const ManagerException('Choose a valid JPG or PNG proof image.');
    }
    final extension = isPng ? 'png' : 'jpg';
    final contentType = isPng ? 'image/png' : 'image/jpeg';
    final safeName = fileName.replaceAll(RegExp(r'[^\w.\-]'), '_');
    final path =
        'manager-document-proofs/$ownerType/$ownerId/${DateTime.now().millisecondsSinceEpoch}_$safeName.$extension';
    try {
      await _client.storage.from(SupabaseConfig.documentsBucket).uploadBinary(
        path,
        bytes,
        fileOptions: FileOptions(contentType: contentType, upsert: false),
      );
      return _client.storage
          .from(SupabaseConfig.documentsBucket)
          .getPublicUrl(path);
    } catch (e) {
      _fail('upload document proof', e);
    }
  }

  Future<void> deleteDocument(String id) =>
      _deleteDirectoryRecord('documents', id, 'document');

  /// Completed / closed bookings and standalone non-trip invoices, newest first.
  Future<List<InvoiceRecord>> invoices() async {
    try {
      final tripRows = await _client
          .from('bookings')
          .select()
          .inFilter('status', invoiceStatuses)
          .order('start_date', ascending: false)
          .limit(2000);
      List standaloneRows = [];
      try {
        standaloneRows = await _client
            .from('manager_non_trip_invoices')
            .select()
            .order('invoice_date', ascending: false)
            .limit(2000);
        nonTripInvoicesAvailable = true;
      } on PostgrestException catch (e) {
        if (e.code == '42P01' || e.code == 'PGRST205') {
          nonTripInvoicesAvailable = false;
        } else {
          rethrow;
        }
      }
      final invoices = <InvoiceRecord>[
        ...tripRows.map((m) => InvoiceRecord.fromMap(m)),
        ...standaloneRows.map((m) => InvoiceRecord.fromStandaloneMap(m)),
      ];
      invoices.sort((a, b) {
        final x = a.tripDate ?? DateTime.fromMillisecondsSinceEpoch(0);
        final y = b.tripDate ?? DateTime.fromMillisecondsSinceEpoch(0);
        return y.compareTo(x);
      });
      return invoices;
    } catch (e) {
      _fail('load invoices', e);
    }
  }

  /// Save a bill for a completed trip. Fare remains on the booking's
  /// `total_fare`; invoice-only charges live in `type_data` so this works with
  /// deployments that do not have optional charge columns.
  Future<InvoiceRecord> saveInvoice(InvoiceRecord invoice) async {
    if (invoice.id.isEmpty && !invoice.isStandalone) {
      throw const ManagerException('Choose a completed trip for this invoice.');
    }
    final amounts = [
      invoice.fare,
      invoice.toll,
      invoice.bata,
      invoice.fuel,
      invoice.parking,
      invoice.extras,
    ];
    if (amounts.any((amount) => !amount.isFinite || amount < 0)) {
      throw const ManagerException(
        'Invoice amounts must be valid and non-negative.',
      );
    }
    if (invoice.isStandalone) {
      if (invoice.customer.trim().isEmpty ||
          (invoice.description?.trim().isEmpty ?? true)) {
        throw const ManagerException(
          'Enter the customer and service description.',
        );
      }
      try {
        final values = {
          'customer_name': invoice.customer.trim(),
          'customer_contact': invoice.contact?.trim(),
          'invoice_date': _day.format(invoice.tripDate ?? DateTime.now()),
          'description': invoice.description!.trim(),
          'total_fare': invoice.fare,
          'invoice_toll': invoice.toll,
          'invoice_bata': invoice.bata,
          'invoice_fuel': invoice.fuel,
          'invoice_parking': invoice.parking,
          'invoice_extras': invoice.extras,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        };
        final rawId = invoice.id.startsWith('nontrip:')
            ? invoice.id.substring('nontrip:'.length)
            : null;
        final Map<String, dynamic> row;
        if (rawId == null) {
          row = await _client
              .from('manager_non_trip_invoices')
              .insert(values)
              .select()
              .single();
        } else {
          row = await _client
              .from('manager_non_trip_invoices')
              .update(values)
              .eq('id', rawId)
              .select()
              .single();
        }
        return InvoiceRecord.fromStandaloneMap(row);
      } catch (e) {
        _fail('save the non-trip invoice', e);
      }
    }
    try {
      final row = await _client
          .from('bookings')
          .select('status, type_data')
          .eq('id', invoice.id)
          .single();
      if (!invoiceStatuses.contains(row['status'])) {
        throw const ManagerException(
          'Invoices can only be created for completed trips.',
        );
      }
      final typeData = row['type_data'] is Map
          ? Map<String, dynamic>.from(row['type_data'] as Map)
          : <String, dynamic>{};
      typeData.addAll({
        'invoice_toll': invoice.toll,
        'invoice_bata': invoice.bata,
        'invoice_fuel': invoice.fuel,
        'invoice_parking': invoice.parking,
        'invoice_extras': invoice.extras,
        'invoice_created_at':
            typeData['invoice_created_at'] ??
            DateTime.now().toUtc().toIso8601String(),
      });
      await _client
          .from('bookings')
          .update({
            'total_fare': invoice.fare,
            'type_data': typeData,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', invoice.id);
      return invoice;
    } on ManagerException {
      rethrow;
    } catch (e) {
      _fail('save the invoice', e);
    }
  }

  /// Business details for the invoice; the web defaults when the settings
  /// row is missing or unreadable.
  Future<InvoiceBusiness> invoiceBusiness() async {
    try {
      final row = await _client
          .from('settings')
          .select('value')
          .eq('key', 'company_settings')
          .maybeSingle();
      final value = row?['value'];
      return InvoiceBusiness.fromSettings(
        value is Map ? Map<String, dynamic>.from(value) : null,
      );
    } catch (_) {
      return const InvoiceBusiness();
    }
  }

  /// Newest trips of one driver, vehicle or customer (customer: by id, or
  /// by name for older bookings without customer_id).
  Future<List<ManagerBooking>> recentTrips({
    String? driverId,
    String? vehicleId,
    String? customerId,
    String? customerName,
    int limit = 10,
  }) async {
    try {
      var q = _client.from('bookings').select(ManagerBooking.columns);
      if (driverId != null) q = q.eq('driver_id', driverId);
      if (vehicleId != null) q = q.eq('vehicle_id', vehicleId);
      if (customerId != null) {
        final name = (customerName ?? '').replaceAll('"', '');
        q = name.isEmpty
            ? q.eq('customer_id', customerId)
            : q.or('customer_id.eq.$customerId,customer_name.eq."$name"');
      }
      final rows = await q
          .order('start_date', ascending: false)
          .order('start_time', ascending: false)
          .limit(limit);
      return rows.map((m) => ManagerBooking.fromMap(m)).toList();
    } catch (e) {
      _fail('load trips', e);
    }
  }

  // ── New booking ────────────────────────────────────────────────────────────

  /// Distinct name + contact from past bookings, newest first.
  Future<List<CustomerOption>> recentCustomers({int limit = 500}) async {
    try {
      final rows = await _client
          .from('bookings')
          .select('customer_name, customer_contact, customer_id, start_date')
          .not('customer_name', 'is', null)
          .order('start_date', ascending: false)
          .limit(limit);
      final seen = <String>{};
      final out = <CustomerOption>[];
      for (final r in rows) {
        final name = '${r['customer_name'] ?? ''}'.trim();
        if (name.isEmpty) continue;
        final contact = normalizeIndianMobile('${r['customer_contact'] ?? ''}');
        if (!seen.add('${name.toLowerCase()}|${contact ?? ''}')) continue;
        out.add(
          CustomerOption(
            name: name,
            contact: contact,
            customerId: r['customer_id'] as String?,
            lastTrip: DateTime.tryParse('${r['start_date']}'),
          ),
        );
      }
      // Then saved customers who have no booking yet (web Customers page).
      final saved = await _client
          .from('customers')
          .select(CustomerRecord.columns)
          .order('name');
      for (final c in saved.map(CustomerRecord.fromMap)) {
        final contact = normalizeIndianMobile(c.phone ?? '');
        if (!seen.add('${c.name.toLowerCase()}|${contact ?? ''}')) continue;
        out.add(
          CustomerOption(name: c.name, contact: contact, customerId: c.id),
        );
      }
      return out;
    } catch (e) {
      _fail('load customers', e);
    }
  }

  /// Vehicles / drivers held by an open booking overlapping [start]..[end]
  /// (inclusive days; status not cancelled / completed / closed).
  Future<BusyResources> busyResources(DateTime start, DateTime end) async {
    final s = _day.format(start);
    final e = _day.format(end);
    try {
      final rows = await _client
          .from('bookings')
          .select('vehicle_id, driver_id, status, start_date, end_date')
          .lte('start_date', e)
          .or('end_date.gte.$s,and(end_date.is.null,start_date.gte.$s)')
          .not('status', 'in', '(${bookingFreeStatuses.join(',')})');
      return BusyResources.fromRows(
        rows.cast<Map<String, dynamic>>(),
        start: start,
        end: end,
      );
    } catch (e) {
      _fail('check availability', e);
    }
  }

  /// Inserts a booking numbered FY{yy}-{MON}-{####} (see nextBookingNumber).
  /// Re-checks availability first, and retries with the next number (up to 3
  /// times) when another insert took the number (unique violation 23505).
  Future<CreatedBooking> createBooking(
    NewBookingDraft draft, {
    required String actorName,
    String? actorId,
    String actorRole = 'manager',
  }) async {
    final busy = await busyResources(draft.startDate, draft.lastDay);
    if (busy.vehicleIds.contains(draft.vehicle.id)) {
      throw ManagerException(
        '${draft.vehicle.registration} is already booked for these dates.',
      );
    }
    final driver = draft.effectiveDriver;
    if (driver != null && busy.driverIds.contains(driver.id)) {
      throw ManagerException(
        '${driver.name} is already booked for these dates.',
      );
    }

    final List<String?> existing;
    try {
      final rows = await _client
          .from('bookings')
          .select('booking_number')
          .like('booking_number', '${bookingFyPrefix(draft.startDate)}%');
      existing = [for (final r in rows) r['booking_number'] as String?];
    } catch (e) {
      _fail('number the booking', e);
    }

    for (var attempt = 0; attempt <= 3; attempt++) {
      final number = nextBookingNumber(
        draft.startDate,
        existing,
        bump: attempt,
      );
      try {
        final row = await _client
            .from('bookings')
            .insert(
              draft.toRow(
                bookingNumber: number,
                actorName: actorName,
                actorId: actorId,
                actorRole: actorRole,
              ),
            )
            .select('id')
            .single();
        return (id: row['id'] as String, bookingNumber: number);
      } on PostgrestException catch (e) {
        if (e.code == '23505' && attempt < 3) continue;
        _fail('create the booking', e.message);
      } catch (e) {
        _fail('create the booking', e);
      }
    }
    throw const ManagerException(
      'Could not create the booking (number clash).',
    );
  }

  // ── Fleet ──────────────────────────────────────────────────────────────────

  /// Newest gps_tracking row per vehicle. The vendor GPS sync (web, or
  /// FleetGpsSync here) writes these rows (driver_id null); the driver app
  /// adds trip points (driver_id set).
  Future<List<VehiclePosition>> fleetPositions() async {
    try {
      final vehicles = await this.vehicles();
      if (vehicles.isEmpty) return const [];
      // One newest row per vehicle: a shared LIMIT let one busy vehicle's
      // trip points crowd the others out and show them as offline.
      final newest = await Future.wait([
        for (final v in vehicles)
          _client
              .from('gps_tracking')
              .select(
                'vehicle_id, latitude, longitude, speed_kmh, ignition, address, timestamp',
              )
              .eq('vehicle_id', v.id)
              .order('timestamp', ascending: false)
              .limit(1),
      ]);
      final latest = <String, Map<String, dynamic>>{
        for (final rows in newest)
          if (rows.isNotEmpty) '${rows.first['vehicle_id']}': rows.first,
      };
      return [
        for (final v in vehicles)
          if (latest[v.id] case final r?)
            VehiclePosition(
              vehicle: v,
              latitude: double.tryParse('${r['latitude']}'),
              longitude: double.tryParse('${r['longitude']}'),
              speedKmh: double.tryParse('${r['speed_kmh']}'),
              ignition: r['ignition'] as bool?,
              address: r['address'] as String?,
              at: DateTime.tryParse('${r['timestamp']}'),
            )
          else
            VehiclePosition(vehicle: v),
      ];
    } catch (e) {
      if (e is ManagerException) rethrow;
      _fail('load fleet positions', e);
    }
  }

  /// Recorded route of a trip: the driver app's points (trip_id) first;
  /// otherwise, once the trip has started, the vehicle's GPS within the trip
  /// dates (vendor rows carry no trip_id).
  Future<TripTrack> tripTrack(ManagerBooking b, {int limit = 3000}) async {
    const cols = 'latitude, longitude, timestamp';
    try {
      var rows = await _client
          .from('gps_tracking')
          .select(cols)
          .eq('trip_id', b.id)
          .order('timestamp', ascending: true)
          .limit(limit);
      var source = TrackSource.driverApp;
      final window = tripWindowUtc(b);
      if (rows.length < 2 &&
          b.vehicleId != null &&
          window != null &&
          trackedStatuses.contains(b.status)) {
        rows = await _client
            .from('gps_tracking')
            .select(cols)
            .eq('vehicle_id', b.vehicleId!)
            .gte('timestamp', window.$1.toIso8601String())
            .lt('timestamp', window.$2.toIso8601String())
            .order('timestamp', ascending: true)
            .limit(limit);
        source = TrackSource.vehicleGps;
      }
      final points = <({double lat, double lng})>[];
      DateTime? first, last;
      for (final r in rows) {
        final lat = double.tryParse('${r['latitude']}');
        final lng = double.tryParse('${r['longitude']}');
        if (lat == null || lng == null || (lat == 0 && lng == 0)) continue;
        points.add((lat: lat, lng: lng));
        final at = DateTime.tryParse('${r['timestamp']}');
        first ??= at;
        last = at ?? last;
      }
      if (points.isEmpty) return TripTrack.empty;
      return TripTrack(
        points: points,
        source: source,
        first: first,
        last: last,
      );
    } catch (e) {
      _fail('load the trip route', e);
    }
  }

  /// Open bookings of one vehicle (for "what trip is it attending").
  Future<List<ManagerBooking>> vehicleBookings(String vehicleId) async {
    try {
      final rows = await _client
          .from('bookings')
          .select(ManagerBooking.columns)
          .eq('vehicle_id', vehicleId)
          .inFilter('status', [
            'started',
            'assigned',
            'approved',
            'confirmed',
            'pending',
          ])
          .order('start_date', ascending: true)
          .limit(30);
      return [for (final r in rows) ManagerBooking.fromMap(r)];
    } catch (e) {
      _fail('load the vehicle trips', e);
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  /// The web ERP approves by `status` only (approval_status is never set
  /// there), so `status` is the source of truth for listing.
  Future<List<PendingExpense>> expenses({String status = 'pending'}) async {
    try {
      final rows = await _client
          .from('expenses')
          .select(PendingExpense.columns)
          .eq('status', status)
          .order('expense_date', ascending: false)
          .limit(100);
      return rows.map((m) => PendingExpense.fromMap(m)).toList();
    } catch (e) {
      _fail('load expenses', e);
    }
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  Future<List<AttendanceEntry>> attendanceFor(DateTime date) async {
    try {
      final day = _day.format(date);
      final results = await Future.wait([
        _client
            .from('drivers')
            .select(DriverOption.columns)
            .neq('status', 'inactive')
            .order('name'),
        _client
            .from('attendance')
            .select('id, driver_id, status, leave_type, check_in, check_out')
            .eq('attendance_date', day),
      ]);
      final records = {
        for (final r in results[1] as List)
          '${r['driver_id']}': r as Map<String, dynamic>,
      };
      return [
        for (final d in (results[0] as List).map(
          (m) => DriverOption.fromMap(m),
        ))
          AttendanceEntry(
            driver: d,
            recordId: records[d.id]?['id'] as String?,
            status: records[d.id]?['status'] as String?,
            leaveType: records[d.id]?['leave_type'] as String?,
            checkIn: records[d.id]?['check_in'] as String?,
            checkOut: records[d.id]?['check_out'] as String?,
          ),
      ];
    } catch (e) {
      _fail('load attendance', e);
    }
  }

  // ── Writes (mirror the web ERP) ────────────────────────────────────────────

  /// Web: WORKFLOW_TRANSITIONS in src/data/tripTypes.js.
  static const transitions = <String, List<String>>{
    'draft': ['pending', 'cancelled'],
    'pending': ['approved', 'draft', 'cancelled'],
    'approved': ['assigned', 'cancelled'],
    'confirmed': ['assigned', 'cancelled'],
    'assigned': ['started', 'cancelled'],
    'started': ['completed'],
    'completed': ['closed'],
  };

  /// Web Trips.jsx handleStatusChange: status, last_modified_by (actor
  /// name), remarks, approval_history append, approved_by/at on approval.
  Future<void> changeStatus({
    required ManagerBooking booking,
    required String to,
    required String actorName,
    required String actorRole,
    String? remarks,
  }) async {
    if (!(transitions[booking.status] ?? const []).contains(to)) {
      throw ManagerException('A ${booking.status} trip cannot move to $to.');
    }
    final note = (remarks == null || remarks.trim().isEmpty)
        ? null
        : remarks.trim();
    final now = DateTime.now().toUtc().toIso8601String();
    try {
      final row = await _client
          .from('bookings')
          .select('approval_history')
          .eq('id', booking.id)
          .single();
      final history = [
        ...((row['approval_history'] as List?) ?? const []),
        {
          'action': switch (to) {
            'pending' => 'submitted',
            'approved' => 'approved',
            'cancelled' => 'cancelled',
            _ => to,
          },
          'from_status': booking.status,
          'to_status': to,
          'actor_name': actorName,
          'actor_role': actorRole,
          'remarks': note,
          'created_at': now,
        },
      ];
      await _client
          .from('bookings')
          .update({
            'status': to,
            'last_modified_by': actorName,
            'approval_history': history,
            'updated_at': now,
            if (note != null) 'remarks': note,
            if (to == 'approved') ...{
              'approved_by': actorName,
              'approved_at': now,
            },
          })
          .eq('id', booking.id);
    } catch (e) {
      _fail('update the trip', e);
    }
  }

  /// Web Trips.jsx handleAssign sets driver_name / vehicle_reg / status
  /// 'assigned' but leaves driver_id / vehicle_id stale — we set them, so the
  /// driver app (which filters on driver_id) sees the trip.
  Future<void> assign({
    required ManagerBooking booking,
    required DriverOption driver,
    required VehicleOption vehicle,
    required String actorName,
  }) async {
    if (!const {
      'draft',
      'pending',
      'approved',
      'confirmed',
      'assigned',
    }.contains(booking.status)) {
      throw ManagerException('A ${booking.status} trip cannot be reassigned.');
    }
    try {
      await _client
          .from('bookings')
          .update({
            'driver_id': driver.id,
            'driver_name': driver.name,
            'vehicle_id': vehicle.id,
            'vehicle_reg': vehicle.registration,
            'status': 'assigned',
            'last_modified_by': actorName,
            'updated_at': DateTime.now().toUtc().toIso8601String(),
          })
          .eq('id', booking.id);
    } catch (e) {
      _fail('assign the trip', e);
    }
  }

  /// Inserts an office expense numbered EXP-YYMM-#### (next after the
  /// month's highest staff number); retries with the next number when
  /// another insert took it (unique violation 23505). Returns the number.
  Future<String> addExpense(
    NewExpenseDraft draft, {
    required String actorName,
  }) async {
    final problem = draft.problem;
    if (problem != null) throw ManagerException(problem);
    final now = DateTime.now();
    final List<String?> existing;
    try {
      final rows = await _client
          .from('expenses')
          .select('expense_no')
          .like('expense_no', '${expenseMonthPrefix(now)}%');
      existing = [for (final r in rows) r['expense_no'] as String?];
    } catch (e) {
      _fail('number the expense', e);
    }
    for (var attempt = 0; attempt <= 3; attempt++) {
      final number = nextExpenseNo(now, existing, bump: attempt);
      try {
        await _client
            .from('expenses')
            .insert(draft.toRow(expenseNo: number, actorName: actorName));
        return number;
      } on PostgrestException catch (e) {
        if (e.code == '23505' && attempt < 3) continue;
        _fail('save the expense', e.message);
      } catch (e) {
        _fail('save the expense', e);
      }
    }
    throw const ManagerException('Could not save the expense (number clash).');
  }

  /// Web sets `status` only; we also keep approval_status / approved_* /
  /// rejection_reason consistent (all live columns).
  Future<void> decideExpense({
    required PendingExpense expense,
    required bool approve,
    required String actorName,
    String? reason,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final why = (reason == null || reason.trim().isEmpty)
        ? null
        : reason.trim();
    try {
      await _client
          .from('expenses')
          .update({
            'status': approve ? 'approved' : 'rejected',
            'approval_status': approve ? 'approved' : 'rejected',
            'approved_by': actorName,
            'approved_at': now,
            if (approve) 'approved_amount': expense.amount,
            if (!approve && why != null) 'rejection_reason': why,
            'updated_at': now,
          })
          .eq('id', expense.id)
          .eq('status', 'pending');
    } catch (e) {
      _fail(approve ? 'approve the expense' : 'reject the expense', e);
    }
  }

  /// One row per driver per day: update the existing record, else insert.
  Future<void> markAttendance({
    required AttendanceEntry entry,
    required DateTime date,
    required String status, // present · absent · leave
    String? leaveType,
  }) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final values = {
      'status': status,
      'leave_type': status == 'leave' ? (leaveType ?? 'casual') : null,
      'driver_name': entry.driver.name,
      'updated_at': now,
    };
    try {
      if (entry.recordId != null) {
        await _client
            .from('attendance')
            .update(values)
            .eq('id', entry.recordId!);
      } else {
        await _client.from('attendance').insert({
          ...values,
          'driver_id': entry.driver.id,
          'attendance_date': _day.format(date),
          'created_at': now,
        });
      }
    } catch (e) {
      _fail('mark attendance', e);
    }
  }

  Future<void> resolveAlert(FleetAlert alert) async {
    final now = DateTime.now().toUtc().toIso8601String();
    try {
      await _client
          .from('fleet_alerts')
          .update({'status': 'resolved', 'resolved_at': now, 'updated_at': now})
          .eq('id', alert.id);
    } catch (e) {
      _fail('resolve the alert', e);
    }
  }

  Future<void> acknowledgeSosAlert(FleetAlert alert) async {
    try {
      await _client.rpc(
        'manager_acknowledge_sos_alert',
        params: {'p_alert_id': alert.id},
      );
    } catch (e) {
      _fail('acknowledge the SOS alert', e);
    }
  }

  // ── WhatsApp inbox ─────────────────────────────────────────────────────────

  Future<List<WhatsAppConversation>> whatsAppConversations({
    int limit = 500,
  }) async {
    try {
      final rows = await _client
          .from('whatsapp_conversations')
          .select(WhatsAppConversation.columns)
          .order('last_message_at', ascending: false, nullsFirst: false)
          .limit(limit);
      return sortConversations(rows.map(WhatsAppConversation.fromMap).toList());
    } catch (e) {
      _fail('load WhatsApp chats', e);
    }
  }

  /// The conversation row + the newest [limit] messages of each table,
  /// merged oldest first.
  Future<WhatsAppThread> whatsAppThread(String phone, {int limit = 200}) async {
    try {
      final results = await Future.wait<dynamic>([
        _client
            .from('whatsapp_conversations')
            .select(WhatsAppConversation.columns)
            .eq('phone', phone)
            .maybeSingle(),
        _client
            .from('whatsapp_inbound_messages')
            .select(WhatsAppMessage.inboundColumns)
            .eq('from_phone', phone)
            .order('received_at', ascending: false)
            .limit(limit),
        _client
            .from('whatsapp_outbound_messages')
            .select(WhatsAppMessage.outboundColumns)
            .eq('to_phone', phone)
            .order('created_at', ascending: false)
            .limit(limit),
      ]);
      final conv = results[0] as Map<String, dynamic>?;
      return WhatsAppThread(
        conversation: conv == null ? null : WhatsAppConversation.fromMap(conv),
        messages: mergeWhatsAppMessages(
          (results[1] as List).map((m) => WhatsAppMessage.fromInbound(m)),
          (results[2] as List).map((m) => WhatsAppMessage.fromOutbound(m)),
        ),
      );
    } catch (e) {
      _fail('load the chat', e);
    }
  }

  Future<void> markWhatsAppRead(String phone) async {
    try {
      await _client
          .from('whatsapp_conversations')
          .update({'unread': 0})
          .eq('phone', phone);
    } catch (e) {
      _fail('mark the chat read', e);
    }
  }

  /// Sends [text] as staff (the server also pauses the bot). Returns the
  /// outbound row when the server sends it back.
  Future<WhatsAppMessage?> sendWhatsAppReply(String phone, String text) async {
    final body = text.trim();
    if (body.isEmpty) throw const ManagerException('Type a message first.');
    final res = await _whatsAppSend({
      'action': 'reply',
      'phone': phone,
      'text': body,
    });
    final message = res['message'];
    return message is Map
        ? WhatsAppMessage.fromOutbound(Map<String, dynamic>.from(message))
        : null;
  }

  Future<void> resumeWhatsAppBot(String phone) async {
    await _whatsAppSend({'action': 'resume_bot', 'phone': phone});
  }

  Future<void> sendManagerWhatsApp({
    required String action,
    required String phone,
    required String text,
  }) async {
    final body = text.trim();
    if (body.isEmpty) throw const ManagerException('Message content is empty.');
    await _whatsAppSend({'action': action, 'phone': phone, 'text': body});
  }

  Future<Map<String, dynamic>> _whatsAppSend(
    Map<String, String> payload,
  ) async {
    final token = _client.auth.currentSession?.accessToken;
    if (token == null) {
      throw const ManagerException(
        'You are signed out. Sign in again to send WhatsApp messages.',
      );
    }
    final http.Response res;
    try {
      res = await _http
          .post(
            AppConfig.webApi('/api/whatsapp/send'),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode(payload),
          )
          .timeout(const Duration(seconds: 25));
    } on TimeoutException {
      throw const ManagerException(
        'The WhatsApp server did not answer. Check the network and try again.',
      );
    } catch (e) {
      final actionName = switch (payload['action']) {
        'reply' => 'send the message',
        'resume_bot' => 'resume the bot',
        'invoice' => 'send the invoice',
        'booking_notification' => 'send the booking notification',
        'booking_confirmation' => 'send the booking confirmation',
        _ => 'send the WhatsApp message',
      };
      _fail(actionName, e);
    }
    var json = const <String, dynamic>{};
    try {
      final decoded = jsonDecode(res.body);
      if (decoded is Map) json = Map<String, dynamic>.from(decoded);
    } catch (_) {}
    if (res.statusCode >= 200 && res.statusCode < 300) return json;
    final serverError = _waText(json['error']);
    throw ManagerException(switch (res.statusCode) {
      401 => 'Your session has expired. Sign in again.',
      403 => 'Only admin and manager accounts can use the WhatsApp inbox.',
      409 =>
        serverError ??
            'More than 24 hours since the customer wrote — WhatsApp allows only template messages now.',
      _ =>
        serverError ??
            'WhatsApp did not accept the message (HTTP ${res.statusCode}).',
    });
  }

  static String? _waText(Object? v) {
    final s = v?.toString().trim();
    return (s == null || s.isEmpty) ? null : s;
  }

  /// Realtime: calls [onChange] on any change to the conversations (all of
  /// them, or only [phone]'s) and, with [phone], to its messages. Returns
  /// the unsubscribe. If realtime is off server-side the callback never
  /// fires; the screens also refresh on their own.
  Future<Future<void> Function()> subscribeWhatsApp({
    String? phone,
    required void Function() onChange,
  }) async {
    final channel = _client.channel(
      'manager-whatsapp-${phone ?? 'all'}-${_channelSeq++}',
    );
    PostgresChangeFilter? by(String column) => phone == null
        ? null
        : PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: column,
            value: phone,
          );
    channel.onPostgresChanges(
      event: PostgresChangeEvent.all,
      schema: 'public',
      table: 'whatsapp_conversations',
      filter: by('phone'),
      callback: (_) => onChange(),
    );
    if (phone != null) {
      channel
        ..onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'whatsapp_inbound_messages',
          filter: by('from_phone'),
          callback: (_) => onChange(),
        )
        ..onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'whatsapp_outbound_messages',
          filter: by('to_phone'),
          callback: (_) => onChange(),
        );
    }
    channel.subscribe();
    return () async {
      try {
        await _client.removeChannel(channel);
      } catch (_) {}
    };
  }
}
