// ─────────────────────────────────────────────────────────────────────────────
// settlements_provider.dart — driver settlements + pending/paid splits.
// The authoritative payout source is `settlements` (not trip_payslips, which
// has no payment state). Pending = draft/pending/approved; Paid = paid.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/settlement.dart';
import '../repositories/settlements_repository.dart';
import 'auth_provider.dart';

final settlementsRepositoryProvider = Provider<SettlementsRepository>((ref) {
  return SettlementsRepository(ref.watch(supabaseClientProvider));
});

/// All settlements for the signed-in driver, newest period first.
final driverSettlementsProvider = FutureProvider<List<Settlement>>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return [];
  return ref.watch(settlementsRepositoryProvider).getSettlements(driver.id);
});

/// Awaiting payment (draft / pending / approved).
final pendingSettlementsProvider = Provider<List<Settlement>>((ref) {
  final all = ref.watch(driverSettlementsProvider).value ?? [];
  return all.where((s) => s.isPending).toList();
});

/// Already paid out.
final paidSettlementsProvider = Provider<List<Settlement>>((ref) {
  final all = ref.watch(driverSettlementsProvider).value ?? [];
  return all.where((s) => s.isPaid).toList();
});

/// Total amount still awaiting payment.
final pendingSettlementTotalProvider = Provider<double>((ref) {
  return ref
      .watch(pendingSettlementsProvider)
      .fold<double>(0, (s, e) => s + e.netAmount);
});

/// Total amount already paid out.
final paidSettlementTotalProvider = Provider<double>((ref) {
  return ref
      .watch(paidSettlementsProvider)
      .fold<double>(0, (s, e) => s + e.netAmount);
});
