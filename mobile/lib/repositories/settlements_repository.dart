// ─────────────────────────────────────────────────────────────────────────────
// settlements_repository.dart — read-only driver settlements.
// A settlement is the company-side monthly payout for a driver. It is the
// authoritative source for payment status (draft/pending/approved/paid) —
// trip_payslips itself carries no payment state. Driver-scoped via RLS,
// mirroring the web payrollRepository.getSettlementsByDriver.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config/supabase_config.dart';
import '../core/demo/demo_session.dart';
import '../models/settlement.dart';

class SettlementsRepository {
  SettlementsRepository(this._client);

  final SupabaseClient _client;

  /// Settlements for one driver, newest period first. RLS scopes to the driver.
  Future<List<Settlement>> getSettlements(
    String driverId, {
    int limit = 100,
  }) async {
    if (DemoSession.active) {
      return DemoSession.settlements.take(limit).toList();
    }
    // Only the columns that actually exist on the live `settlements` table.
    const columns =
        'id, driver_id, month, year, status, net_amount, '
        'base_salary, payment_date, payment_method, created_at, updated_at';
    final data = await _client
        .from(SupabaseConfig.settlementsTable)
        .select(columns)
        .eq('driver_id', driverId)
        .order('year', ascending: false)
        .order('month', ascending: false)
        .limit(limit);

    return (data as List)
        .whereType<Map<String, dynamic>>()
        .map(Settlement.fromMap)
        .toList();
  }
}
