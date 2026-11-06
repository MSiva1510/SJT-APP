// ─────────────────────────────────────────────────────────────────────────────
// driver_payslip.dart — read-only view of one trip payslip row.
// Table: public.trip_payslips (driver-scoped via RLS, like the web payroll
// repository). All parsing is defensive — unknown/missing columns yield
// safe defaults, never a crash.
// ─────────────────────────────────────────────────────────────────────────────

class DriverPayslip {
  const DriverPayslip({
    required this.id,
    required this.amount,
    this.tripRef = '',
    this.fare,
    this.status = '',
    this.paidAt,
    this.createdAt,
    this.tripDate,
  });

  final String id;
  final double amount;
  final String tripRef;
  final double? fare;
  final String status;
  final DateTime? paidAt;
  final DateTime? createdAt;
  final DateTime? tripDate;

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

  factory DriverPayslip.fromMap(Map<String, dynamic> m) {
    final fareRaw = m['net_amount'] ?? m['company_amount'] ?? m['fare'];
    return DriverPayslip(
      id: '${m['id'] ?? ''}',
      amount: _num(
        m['driver_earnings'] ?? m['driver_amount'] ?? m['net_amount'],
      ),
      tripRef:
          '${m['trip_ref'] ?? m['booking_number'] ?? m['trip_id'] ?? m['booking_id'] ?? ''}',
      fare: fareRaw != null ? _num(fareRaw) : null,
      status: '${m['status'] ?? ''}',
      paidAt: _date(m['paid_at']),
      createdAt: _date(m['created_at']),
      tripDate: _date(m['trip_date'] ?? m['start_date']),
    );
  }

  bool get isPaid => status.toLowerCase() == 'paid';
  String get earningsStatus => status.trim().isEmpty ? 'Earned' : status;
  DateTime? get effectiveDate => tripDate ?? createdAt ?? paidAt;
}
