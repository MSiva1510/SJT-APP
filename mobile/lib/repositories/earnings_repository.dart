// ─────────────────────────────────────────────────────────────────────────────
// earnings_repository.dart — read-only driver earnings (trip_payslips).
// Mirrors the web payrollRepository.getPayslipsByDriver (driver_id filter).
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/demo/demo_session.dart';
import '../models/driver_payslip.dart';

class EarningsRepository {
  EarningsRepository(this._client);

  final SupabaseClient _client;

  /// Payslips for one driver, newest first. RLS scopes to the driver.
  Future<List<DriverPayslip>> getPayslips(
    String driverId, {
    int limit = 100,
  }) async {
    if (DemoSession.active) {
      return DemoSession.payslips.take(limit).toList();
    }
    final data = await _client
        .from('trip_payslips')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', ascending: false)
        .limit(limit);
    final rows = (data as List).whereType<Map<String, dynamic>>().toList();
    final tripIds = rows
        .map((row) => row['trip_id']?.toString())
        .whereType<String>()
        .where((id) => id.isNotEmpty)
        .toSet()
        .toList(growable: false);
    final bookingById = <String, Map<String, dynamic>>{};
    if (tripIds.isNotEmpty) {
      final bookings = await _client
          .from('bookings')
          .select('id, booking_number, start_date')
          .inFilter('id', tripIds);
      for (final booking in bookings) {
        bookingById['${booking['id']}'] = Map<String, dynamic>.from(booking);
      }
    }

    return rows
        .map((row) {
          final booking = bookingById[row['trip_id']?.toString()];
          return DriverPayslip.fromMap({
            ...row,
            if (booking != null) ...{
              'booking_number': booking['booking_number'],
              'trip_date': booking['start_date'],
            },
          });
        })
        .toList(growable: false);
  }
}
