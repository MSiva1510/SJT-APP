// ─────────────────────────────────────────────────────────────────────────────
// expense_numbering.dart — expense_no and expense_type for new expense rows.
// expenses.expense_no is NOT NULL + UNIQUE and expense_type is NOT NULL with a
// CHECK (fuel · toll · parking · vehicle · supplies · other); no DB trigger
// fills either, so every insert must send both.
//   Staff (manager app): EXP-YYMM-####, next after the month's numeric max.
//   Driver app:          EXP-YYMM-D#### — drivers cannot read other rows
//                        (RLS), so they use their own namespace + retry.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:math';

const expenseTypes = ['fuel', 'toll', 'parking', 'vehicle', 'supplies', 'other'];

/// `type` (free text, e.g. bata/misc/food) → the CHECKed expense_type.
String expenseTypeFor(String type) {
  final t = type.trim().toLowerCase();
  return expenseTypes.contains(t) ? t : 'other';
}

/// 'EXP-2610-' for October 2026.
String expenseMonthPrefix(DateTime d) =>
    'EXP-${(d.year % 100).toString().padLeft(2, '0')}'
    '${d.month.toString().padLeft(2, '0')}-';

/// Next staff number after the highest all-digit suffix in [existing]
/// (+[bump] on a unique-violation retry). Driver numbers (D####) and odd
/// values are ignored.
String nextExpenseNo(DateTime d, Iterable<String?> existing, {int bump = 0}) {
  final prefix = expenseMonthPrefix(d);
  var max = 0;
  for (final no in existing) {
    if (no == null || !no.startsWith(prefix)) continue;
    final n = int.tryParse(no.substring(prefix.length));
    if (n != null && n > max) max = n;
  }
  return '$prefix${(max + 1 + bump).toString().padLeft(4, '0')}';
}

/// Driver-side number: EXP-YYMM-D + 4 random digits.
String driverExpenseNo(DateTime d, [Random? random]) =>
    '${expenseMonthPrefix(d)}D'
    '${(random ?? Random()).nextInt(10000).toString().padLeft(4, '0')}';

/// expense_date is a `date` column.
String expenseDateValue(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}'
    '-${d.day.toString().padLeft(2, '0')}';

/// An expense recorded by the office (manager app). Saved as approved —
/// the manager entering it is the approver — like a web-entered expense.
class NewExpenseDraft {
  const NewExpenseDraft({
    required this.type,
    required this.amount,
    required this.date,
    this.description = '',
    this.vehicleReg,
    this.driverId,
    this.driverName,
  });

  final String type; // one of expenseTypes
  final double amount;
  final DateTime date;
  final String description;
  final String? vehicleReg;
  final String? driverId;
  final String? driverName;

  /// Null when valid, else the message to show.
  String? get problem {
    if (!expenseTypes.contains(type)) return 'Pick an expense type.';
    if (!(amount > 0)) return 'Enter an amount above zero.';
    if (amount > 1000000) return 'Amount looks too large.';
    return null;
  }

  Map<String, dynamic> toRow({
    required String expenseNo,
    required String actorName,
    DateTime? now,
  }) {
    final at = (now ?? DateTime.now()).toUtc().toIso8601String();
    final note = description.trim();
    return {
      'expense_no': expenseNo,
      'expense_type': type,
      'type': type,
      'amount': amount,
      'expense_date': expenseDateValue(date),
      'description': note.isEmpty ? null : note,
      'vehicle_reg': vehicleReg,
      'driver_id': driverId,
      'driver_name': driverName,
      'status': 'approved',
      'approval_status': 'approved',
      'approved_by': actorName,
      'approved_at': at,
      'approved_amount': amount,
      'added_by': actorName,
      'created_by': actorName,
    };
  }
}
