// ─────────────────────────────────────────────────────────────────────────────
// expense_provider.dart — my expenses list + submit flow.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/driver_expense.dart';
import '../repositories/expense_repository.dart';
import 'auth_provider.dart';

final expenseRepositoryProvider = Provider<ExpenseRepository>((ref) {
  return ExpenseRepository(ref.watch(supabaseClientProvider));
});

/// Recent expenses for the signed-in driver.
final myExpensesProvider =
    FutureProvider<List<DriverExpense>>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return [];
  try {
    return await ref
        .watch(expenseRepositoryProvider)
        .getMyExpenses(driver.id);
  } catch (_) {
    return [];
  }
});
