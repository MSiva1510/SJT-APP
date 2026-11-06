// ─────────────────────────────────────────────────────────────────────────────
// expense_repository.dart — driver reads own expenses, submits new ones
// as status 'pending' for dispatch approval. Mirrors the web
// expenseRepository column set.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/demo/demo_session.dart';
import '../models/driver_expense.dart';

class ExpenseException implements Exception {
  const ExpenseException(this.message);
  final String message;
  @override
  String toString() => 'ExpenseException: $message';
}

class ExpenseRepository {
  ExpenseRepository(this._client);

  final SupabaseClient _client;

  /// Recent expenses for one driver, newest first.
  Future<List<DriverExpense>> getMyExpenses(
    String driverId, {
    int limit = 50,
  }) async {
    if (DemoSession.active) {
      return DemoSession.expenses.take(limit).toList();
    }
    final data = await _client
        .from('expenses')
        .select(
          'id, booking_id, driver_id, driver_name, amount, expense_date, description, status, type, expense_type, created_at',
        )
        .eq('driver_id', driverId)
        .order('expense_date', ascending: false)
        .limit(limit);
    return (data as List)
        .whereType<Map<String, dynamic>>()
        .map(DriverExpense.fromMap)
        .toList();
  }

  /// Submit a new expense as 'pending'. Throws [ExpenseException] with a
  /// user-readable message when the insert is rejected (e.g. RLS).
  Future<DriverExpense> submitExpense({
    required String driverId,
    required String driverName,
    required DriverExpense expense,
  }) async {
    if (DemoSession.active) {
      final saved = DriverExpense(
        id: 'demo-exp-${DateTime.now().millisecondsSinceEpoch}',
        tripId: expense.tripId,
        category: expense.category,
        amount: expense.amount,
        paidBy: expense.paidBy,
        receiptNote: expense.receiptNote,
        status: 'pending',
        expenseDate: expense.expenseDate ?? DateTime.now(),
      );
      DemoSession.addExpense(saved);
      return saved;
    }
    try {
      final Map<String, dynamic> data = await _client
          .from('expenses')
          .insert(expense.toInsert(driverId: driverId, driverName: driverName))
          .select(
            'id, booking_id, driver_id, driver_name, amount, expense_date, description, status, type, expense_type, created_at',
          )
          .single();
      return DriverExpense.fromMap(data);
    } catch (e) {
      final msg = '$e';
      throw ExpenseException(
        'Could not save the expense (${msg.length > 120 ? '${msg.substring(0, 120)}…' : msg}). It was NOT sent — try again on better network.',
      );
    }
  }

  /// Upload a receipt photo. Returns the public URL, or null when the
  /// `expense-receipts` bucket is unavailable — callers must proceed
  /// without a photo rather than fail the whole expense.
  Future<String?> uploadReceipt(String localPath) async {
    if (DemoSession.active) return null;
    try {
      final name = 'drv_${DateTime.now().millisecondsSinceEpoch}.jpg';
      await _client.storage
          .from('expense-receipts')
          .upload(name, File(localPath));
      return _client.storage.from('expense-receipts').getPublicUrl(name);
    } catch (_) {
      return null;
    }
  }
}
