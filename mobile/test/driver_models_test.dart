// ─────────────────────────────────────────────────────────────────────────────
// driver_models_test.dart — unit tests for the earnings/expense models.
// Run from VS Code: Testing sidebar (beaker icon) → Run Tests.
// Or terminal: flutter test test/driver_models_test.dart
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';
import 'package:sri_jayam_travels_mobile/models/driver_payslip.dart';
import 'package:sri_jayam_travels_mobile/models/driver_expense.dart';

void main() {
  group('DriverPayslip.fromMap', () {
    test('parses a full row', () {
      final p = DriverPayslip.fromMap({
        'id': 'pay-1',
        'driver_amount': 2450,
        'company_amount': 4580,
        'trip_id': 'trip-9',
        'status': 'paid',
        'created_at': '2026-10-14T10:30:00Z',
      });
      expect(p.id, 'pay-1');
      expect(p.amount, 2450);
      expect(p.fare, 4580);
      expect(p.tripRef, 'trip-9');
      expect(p.isPaid, isTrue);
      expect(p.createdAt?.year, 2026);
    });

    test('maps the live trip_payslips earnings schema', () {
      final p = DriverPayslip.fromMap({
        'id': 'pay-live',
        'driver_earnings': '2450.50',
        'net_amount': 4580,
        'trip_id': 'trip-9',
        'booking_number': 'BK-2026-009',
        'trip_date': '2026-10-14',
        'created_at': '2026-10-15T10:30:00Z',
      });

      expect(p.amount, 2450.5);
      expect(p.tripRef, 'BK-2026-009');
      expect(p.tripDate, DateTime(2026, 10, 14));
      expect(p.effectiveDate, DateTime(2026, 10, 14));
      expect(p.earningsStatus, 'Earned');
    });

    test('never crashes on garbage', () {
      final p = DriverPayslip.fromMap({
        'driver_amount': 'abc',
        'created_at': 'not-a-date',
      });
      expect(p.amount, 0);
      expect(p.createdAt, isNull);
      expect(p.isPaid, isFalse);
    });
  });

  group('DriverExpense', () {
    test('categories match the wireframe', () {
      expect(
        DriverExpense.categories,
        containsAll(['Fuel', 'Toll', 'Parking', 'Other']),
      );
    });

    test('toInsert builds a pending row', () {
      final e = DriverExpense(
        tripId: 'trip-9',
        category: 'Fuel',
        amount: 2000,
        paidBy: 'Driver cash',
        receiptNote: 'shell bunk',
      );
      final row = e.toInsert(driverId: 'drv-1', driverName: 'Kumar');
      expect(row['driver_id'], 'drv-1');
      expect(row['booking_id'], 'trip-9');
      expect(row['amount'], 2000);
      expect(row['type'], 'fuel');
      expect(row['status'], 'pending');
      expect(row['expense_date'], isNotNull);
    });

    test('fromMap round-trips an insert', () {
      final e = DriverExpense(category: 'Toll', amount: 140);
      final row = e.toInsert(driverId: 'drv-1', driverName: 'Kumar');
      final back = DriverExpense.fromMap({
        ...row,
        'id': 'exp-1',
        'created_at': '2026-10-14T10:30:00Z',
      });
      expect(back.amount, 140);
      expect(back.status, 'pending');
      expect(back.expenseDate?.year, 2026);
    });
  });
}
