// ─────────────────────────────────────────────────────────────────────────────
// settlement.dart — read-only view of one driver settlement row.
// Table: public.settlements (driver-scoped via RLS). A settlement is the
// company-side payout for a driver's monthly earnings; `status` drives the
// Pending (draft/pending/approved) vs Payout (paid) split. Parsing is
// defensive — missing columns yield safe defaults, never a crash.
// ─────────────────────────────────────────────────────────────────────────────

class Settlement {
  const Settlement({
    required this.id,
    required this.driverId,
    this.month = 0,
    this.year = 0,
    this.status = 'draft',
    this.netAmount = 0,
    this.baseSalary = 0,
    this.paymentDate,
    this.paymentMethod = '',
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String driverId;

  /// 1-based month.
  final int month;
  final int year;

  /// draft | pending | approved | paid.
  final String status;
  final double netAmount;
  final double baseSalary;
  final DateTime? paymentDate;
  final String paymentMethod;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  static double _num(dynamic v) {
    if (v is num) return v.toDouble();
    return double.tryParse('$v') ?? 0;
  }

  static int _int(dynamic v) {
    if (v is num) return v.toInt();
    return int.tryParse('$v') ?? 0;
  }

  static DateTime? _date(dynamic v) {
    if (v == null) return null;
    try {
      return DateTime.parse('$v');
    } catch (_) {
      return null;
    }
  }

  static String _str(dynamic v) => v == null ? '' : '$v';

  factory Settlement.fromMap(Map<String, dynamic> m) {
    final rawStatus = _str(m['status']).toLowerCase();
    return Settlement(
      id: _str(m['id'] ?? m['settlement_id']),
      driverId: _str(m['driver_id']),
      month: _int(m['month']),
      year: _int(m['year']),
      status: rawStatus.isEmpty ? 'draft' : rawStatus,
      netAmount: _num(m['net_amount'] ?? m['netAmount']),
      baseSalary: _num(m['base_salary'] ?? m['baseSalary']),
      paymentDate: _date(m['payment_date'] ?? m['paymentDate']),
      paymentMethod: _str(m['payment_method'] ?? m['paymentMethod']),
      createdAt: _date(m['created_at'] ?? m['createdAt']),
      updatedAt: _date(m['updated_at'] ?? m['updatedAt']),
    );
  }

  bool get isPaid => status == 'paid';
  bool get isPending =>
      status == 'draft' || status == 'pending' || status == 'approved';

  /// Sort key for period display (most recent first when descending).
  DateTime get periodAnchor =>
      DateTime(year == 0 ? 1970 : year, month == 0 ? 1 : month, 1);
}
