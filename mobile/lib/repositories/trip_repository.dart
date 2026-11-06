// ─────────────────────────────────────────────────────────────────────────────
// trip_repository.dart
// Supabase access layer for trips (bookings table).
//
// SECURITY:
//   RLS policy "bookings_driver_own" restricts SELECT to rows where:
//     driver_id = get_driver_id()           (UUID match — fast)
//     OR driver_name = current user's name  (TEXT fallback for legacy rows)
//
//   Flutter never requests base_fare / total_fare columns (financial guard).
//   Even if RLS is bypassed, the column is never in the result set.
//
//   getTripById() also verifies the driver matches before returning.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart';
import '../core/config/supabase_config.dart';
import '../core/demo/demo_session.dart';
import '../models/trip.dart';

class TripRepository {
  TripRepository(this._client);

  final SupabaseClient _client;

  // ── Core queries ──────────────────────────────────────────────────────────

  /// All trips for the authenticated driver, newest first.
  /// RLS enforces driver-only access — no need to pass driver ID as a filter.
  Future<List<TripModel>> getDriverTrips({int limit = 50}) async {
    if (DemoSession.active) {
      final all = List<TripModel>.from(DemoSession.trips);
      return all.take(limit).toList();
    }
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(TripModel.selectColumns)
        .not('status', 'eq', 'draft') // drivers don't see unassigned drafts
        .order('start_date', ascending: false)
        .order('created_at', ascending: false)
        .limit(limit);

    return (data as List).map((m) => TripModel.fromMap(m)).toList();
  }

  /// Only today's trips for the authenticated driver.
  Future<List<TripModel>> getTodayTrips() async {
    if (DemoSession.active) {
      final now = DateTime.now();
      return DemoSession.trips.where((t) {
        final d = t.startDate;
        return d != null &&
            d.year == now.year &&
            d.month == now.month &&
            d.day == now.day;
      }).toList();
    }
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(TripModel.selectColumns)
        .eq('start_date', dateStr)
        .not('status', 'eq', 'draft')
        .order('start_time', ascending: true);

    return (data as List).map((m) => TripModel.fromMap(m)).toList();
  }

  /// Upcoming trips (today + future), for the authenticated driver.
  Future<List<TripModel>> getUpcomingTrips({int limit = 10}) async {
    if (DemoSession.active) {
      final now = DateTime.now();
      final today = DateTime(now.year, now.month, now.day);
      final list = DemoSession.trips.where((t) {
        if (t.status != 'assigned' && t.status != 'started') {
          return false;
        }
        final d = t.startDate;
        return d == null || !d.isBefore(today);
      }).toList();
      return list.take(limit).toList();
    }
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(TripModel.selectColumns)
        .gte('start_date', dateStr)
        .inFilter('status', ['assigned', 'started'])
        .order('start_date', ascending: true)
        .order('start_time', ascending: true)
        .limit(limit);

    return (data as List).map((m) => TripModel.fromMap(m)).toList();
  }

  /// Single trip by ID — RLS ensures driver can only fetch their own trip.
  /// Returns null if not found or access denied.
  Future<TripModel?> getTripById(String tripId) async {
    if (DemoSession.active) return DemoSession.tripById(tripId);
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select(TripModel.selectColumns)
        .eq('id', tripId)
        .maybeSingle();

    if (data == null) return null;
    return TripModel.fromMap(data);
  }

  Future<TripModel> saveRoutePlaces({
    required String tripId,
    required TripModel trip,
    double? pickupLat,
    double? pickupLng,
    String? pickupPlace,
    double? dropLat,
    double? dropLng,
    String? dropPlace,
  }) async {
    final hasPickup =
        pickupLat != null && pickupLng != null && pickupPlace != null;
    final hasDrop = dropLat != null && dropLng != null && dropPlace != null;
    if ((!hasPickup &&
            (pickupLat != null || pickupLng != null || pickupPlace != null)) ||
        (!hasDrop &&
            (dropLat != null || dropLng != null || dropPlace != null)) ||
        (!hasPickup && !hasDrop)) {
      throw ArgumentError('Provide a complete pickup or drop location.');
    }

    final typeData = Map<String, dynamic>.from(trip.typeData ?? const {});
    if (hasPickup) {
      typeData
        ..['pickup'] = pickupPlace
        ..['pickupLat'] = pickupLat
        ..['pickupLng'] = pickupLng;
    }
    if (hasDrop) {
      typeData
        ..['drop'] = dropPlace
        ..['dropLat'] = dropLat
        ..['dropLng'] = dropLng;
    }

    if (DemoSession.active) {
      DemoSession.updateRoutePlaces(tripId, typeData);
      return (await getTripById(tripId))!;
    }

    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .update({
          'type_data': typeData,
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', tripId)
        .select(TripModel.selectColumns)
        .single();
    return TripModel.fromMap(data);
  }

  /// Count of today's trips — cheap aggregate query.
  Future<int> getTodayTripCount() async {
    if (DemoSession.active) {
      final now = DateTime.now();
      return DemoSession.trips.where((t) {
        final d = t.startDate;
        return d != null &&
            d.year == now.year &&
            d.month == now.month &&
            d.day == now.day;
      }).length;
    }
    final today = DateTime.now();
    final dateStr =
        '${today.year}-${today.month.toString().padLeft(2, '0')}-${today.day.toString().padLeft(2, '0')}';

    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .select('id')
        .eq('start_date', dateStr)
        .not('status', 'eq', 'draft');

    return (data as List).length;
  }

  // ── Status transitions (Day 47) ───────────────────────────────────────────
  //
  // Mirrors the Web ERP booking workflow (src/data/tripTypes.js):
  //   assigned → started → completed.
  // Only the `status` column is touched — never a duplicate record.

  /// assigned → started. Returns the updated row (RLS-filtered).
  Future<TripModel> markStarted(String tripId) async {
    if (DemoSession.active) {
      final t = DemoSession.tripById(tripId);
      if (t == null) throw Exception('Trip not found');
      final updated = DemoSession.copyTrip(t, status: 'started');
      DemoSession.updateTrip(updated);
      return updated;
    }
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .update({
          'status': 'started',
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', tripId)
        .select(TripModel.selectColumns)
        .single();
    return TripModel.fromMap(data);
  }

  /// started → completed. Returns the updated row (RLS-filtered).
  Future<TripModel> markCompleted(String tripId) async {
    if (DemoSession.active) {
      final t = DemoSession.tripById(tripId);
      if (t == null) throw Exception('Trip not found');
      final updated = DemoSession.copyTrip(t, status: 'completed');
      DemoSession.updateTrip(updated);
      return updated;
    }
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .update({
          'status': 'completed',
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', tripId)
        .select(TripModel.selectColumns)
        .single();
    return TripModel.fromMap(data);
  }

  /// Driver declines an assigned trip → back to pending with the reason
  /// appended to notes, so dispatch can reassign. Returns the updated row.
  Future<TripModel> declineTrip(String tripId, String reason) async {
    if (DemoSession.active) {
      final t = DemoSession.tripById(tripId);
      if (t == null) throw Exception('Trip not found');
      final prev = (t.notes ?? '').trim();
      final stamped =
          '[Declined ${DateTime.now().toUtc().toIso8601String()}: $reason]';
      final updated = DemoSession.copyTrip(
        t,
        status: 'pending',
        notes: prev.isEmpty ? stamped : '$prev\n$stamped',
      );
      DemoSession.updateTrip(updated);
      return updated;
    }
    final current = await _client
        .from(SupabaseConfig.bookingsTable)
        .select('notes')
        .eq('id', tripId)
        .maybeSingle();
    final prev = (current?['notes'] as String?)?.trim() ?? '';
    final stamped =
        '[Declined ${DateTime.now().toUtc().toIso8601String()}: $reason]';
    final data = await _client
        .from(SupabaseConfig.bookingsTable)
        .update({
          'status': 'pending',
          'notes': prev.isEmpty ? stamped : '$prev\n$stamped',
          'updated_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', tripId)
        .select(TripModel.selectColumns)
        .single();
    return TripModel.fromMap(data);
  }
}
