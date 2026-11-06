// ─────────────────────────────────────────────────────────────────────────────
// driver_expense.dart — one driver-submitted expense.
// Table: public.expenses (columns mirror the web expenseRepository
// EXPENSE_SELECT). status 'pending' until dispatch approves.
// ─────────────────────────────────────────────────────────────────────────────

import 'expense_numbering.dart';

class DriverExpense {
  const DriverExpense({
    this.id = '',
    this.tripId,
    required this.category,
    required this.amount,
    this.paidBy = 'Driver cash',
    this.receiptNote = '',
    this.status = 'pending',
    this.expenseDate,
  });

  /// Wireframe categories → web expense types (driver-allowed set).
  static const categories = ['Fuel', 'Toll', 'Parking', 'Other'];

  final String id;
  final String? tripId;
  final String category;
  final double amount;
  final String paidBy;
  final String receiptNote;
  final String status;
  final DateTime? expenseDate;

  static double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  static DateTime? _date(dynamic v) {
    if (v == null) return null;
    try {
      return DateTime.parse('$v');
    } catch (_) {
      return null;
    }
  }

  factory DriverExpense.fromMap(Map<String, dynamic> m) {
    return DriverExpense(
      id: '${m['id'] ?? ''}',
      tripId: m['booking_id']?.toString(),
      category: '${m['expense_type'] ?? m['type'] ?? 'Other'}',
      amount: _num(m['amount']),
      receiptNote: '${m['description'] ?? ''}',
      status: '${m['status'] ?? ''}',
      expenseDate: _date(m['expense_date'] ?? m['created_at']),
    );
  }

  Map<String, dynamic> toInsert({
    required String driverId,
    required String driverName,
  }) {
    final date = expenseDate ?? DateTime.now();
    return {
      'booking_id': tripId,
      'driver_id': driverId,
      'driver_name': driverName,
      'expense_no': driverExpenseNo(date),
      'expense_type': expenseTypeFor(category),
      'amount': amount,
      'type': category.toLowerCase(),
      'expense_date': expenseDateValue(date),
      'description': receiptNote.isEmpty
          ? 'Paid by $paidBy'
          : '$receiptNote (Paid by $paidBy)',
      'status': 'pending',
    };
  }
}
