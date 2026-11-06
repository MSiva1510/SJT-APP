// ─────────────────────────────────────────────────────────────────────────────
// booking_repository.dart
// Supabase data layer for bookings.
// RLS policy "bookings_driver_own" enforces driver-only access server-side.
// Financial columns (base_fare, total_fare) are never requested.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../core/config/supabase_config.dart';
import '../models/booking.dart';

class BookingRepository {
  BookingRepository(this._client);

  final SupabaseClient _client;

  // ── Driver bookings list ──────────────────────────────────────────────────

  /// All bookings for the authenticated driver (RLS enforced).
  /// Sorted: upcoming first, then by start_time.
  Future<List<BookingModel>> getDriverBookings({int limit = 100}) async {
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(BookingModel.listColumns)
        .not('status', 'eq', 'draft')
        .order('start_date', ascending: false)
        .order('start_time', ascending: true)
        .limit(limit);

    return (data as List)
        .map((m) => BookingModel.fromMap(m))
        .toList();
  }

  /// Upcoming bookings only (today + future) for the dashboard preview.
  Future<List<BookingModel>> getUpcomingBookings({int limit = 5}) async {
    final today = _todayString();
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(BookingModel.listColumns)
        .gte('start_date', today)
        .inFilter('status', ['assigned', 'started'])
        .order('start_date', ascending: true)
        .order('start_time', ascending: true)
        .limit(limit);

    return (data as List)
        .map((m) => BookingModel.fromMap(m))
        .toList();
  }

  /// Count of all active (assigned+started) bookings for the driver.
  Future<int> getActiveBookingCount() async {
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select('id')
        .inFilter('status', ['assigned', 'started']);
    return (data as List).length;
  }

  // ── Single booking detail ─────────────────────────────────────────────────

  /// Fetch one booking with vehicle details via JOIN.
  /// RLS ensures driver can only get their own bookings.
  Future<BookingModel?> getBookingById(String bookingId) async {
    // Main booking row
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(BookingModel.detailColumns)
        .eq('id', bookingId)
        .maybeSingle();

    if (data == null) return null;

    // Vehicle details JOIN (non-financial fields only)
    VehicleInfo? vehicle;
    final vehicleId = data['vehicle_id'] as String?;
    if (vehicleId != null) {
      vehicle = await _getVehicleInfo(vehicleId);
    }

    // Booking stops
    final stops = await _getBookingStops(bookingId);

    return BookingModel.fromMap(
      data,
      vehicleInfo: vehicle,
      stops:       stops,
    );
  }

  // ── Booking stops ─────────────────────────────────────────────────────────

  Future<List<BookingStop>> _getBookingStops(String bookingId) async {
    try {
      final data = await _client
          .from('booking_stops')
          .select('id, stop_number, location, notes')
          .eq('booking_id', bookingId)
          .order('stop_number', ascending: true);

      return (data as List)
          .map((m) => BookingStop.fromMap(m))
          .toList();
    } catch (_) {
      return [];
    }
  }

  // ── Vehicle info ──────────────────────────────────────────────────────────

  /// Fetch driver-visible vehicle fields only — no purchase_price.
  Future<VehicleInfo?> _getVehicleInfo(String vehicleId) async {
    try {
      final data = await _client
          .from('vehicles')
          .select('id, registration, vehicle_type, make, model, color, status, photo_url')
          .eq('id', vehicleId)
          .maybeSingle();

      if (data == null) return null;
      return VehicleInfo.fromMap(data);
    } catch (_) {
      return null;
    }
  }

  // ── Related trip record ───────────────────────────────────────────────────

  /// Check if the `trips` table has an execution record linked to this booking.
  /// The trips table links via booking_number text reference.
  /// Currently empty (0 rows) — returns null gracefully.
  Future<Map<String, dynamic>?> getLinkedTrip(String bookingNumber) async {
    try {
      final data = await _client
          .from('trips')
          .select('id, status, pickup_date, pickup_time, distance_km, payment_status')
          .eq('booking_no', bookingNumber)
          .maybeSingle();
      return data;
    } catch (_) {
      return null;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  String _todayString() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }
}
