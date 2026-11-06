enum ManagerReportRange {
  today,
  yesterday,
  lastWeek,
  lastMonth,
  lastYear,
  custom,
}

extension ManagerReportRangeLabel on ManagerReportRange {
  String get label => switch (this) {
    ManagerReportRange.today => 'Today',
    ManagerReportRange.yesterday => 'Yesterday',
    ManagerReportRange.lastWeek => 'Last week',
    ManagerReportRange.lastMonth => 'Last month',
    ManagerReportRange.lastYear => 'Last year',
    ManagerReportRange.custom => 'Custom date',
  };
}

typedef ManagerReportPeriod = ({DateTime start, DateTime end});

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

ManagerReportPeriod managerReportPeriod(
  ManagerReportRange range, {
  required DateTime now,
  DateTime? customStart,
  DateTime? customEnd,
}) {
  final today = _dateOnly(now);
  switch (range) {
    case ManagerReportRange.today:
      return (start: today, end: today);
    case ManagerReportRange.yesterday:
      final yesterday = today.subtract(const Duration(days: 1));
      return (start: yesterday, end: yesterday);
    case ManagerReportRange.lastWeek:
      final thisMonday = today.subtract(Duration(days: today.weekday - 1));
      final end = thisMonday.subtract(const Duration(days: 1));
      return (start: end.subtract(const Duration(days: 6)), end: end);
    case ManagerReportRange.lastMonth:
      final start = DateTime(today.year, today.month - 1);
      return (start: start, end: DateTime(today.year, today.month, 0));
    case ManagerReportRange.lastYear:
      return (
        start: DateTime(today.year - 1),
        end: DateTime(today.year - 1, 12, 31),
      );
    case ManagerReportRange.custom:
      final start = _dateOnly(customStart ?? today);
      final end = _dateOnly(customEnd ?? customStart ?? today);
      return start.isAfter(end)
          ? (start: end, end: start)
          : (start: start, end: end);
  }
}

class ManagerReport {
  const ManagerReport({
    required this.tripCount,
    required this.completedTrips,
    required this.activeTrips,
    required this.scheduledTrips,
    required this.cancelledTrips,
    required this.revenue,
    required this.bookedFare,
  });

  /// Trips excluding cancelled bookings.
  final int tripCount;
  final int completedTrips;
  final int activeTrips;
  final int scheduledTrips;
  final int cancelledTrips;
  /// Fare earned on completed or closed trips.
  final double revenue;
  /// Fare booked on every non-cancelled trip, including scheduled trips.
  final double bookedFare;

  factory ManagerReport.fromBookings(Iterable<Map<String, dynamic>> rows) {
    var trips = 0;
    var completed = 0;
    var active = 0;
    var scheduled = 0;
    var cancelled = 0;
    var revenue = 0.0;
    var bookedFare = 0.0;
    for (final row in rows) {
      final status = '${row['status'] ?? ''}';
      final fareRaw = row['total_fare'];
      final fare = fareRaw is num
          ? fareRaw.toDouble()
          : double.tryParse('$fareRaw') ?? 0;
      if (status == 'cancelled') {
        cancelled++;
        continue;
      }
      trips++;
      bookedFare += fare;
      if (status == 'completed' || status == 'closed') {
        completed++;
        revenue += fare;
      } else if (status == 'started') {
        active++;
      } else {
        scheduled++;
      }
    }
    return ManagerReport(
      tripCount: trips,
      completedTrips: completed,
      activeTrips: active,
      scheduledTrips: scheduled,
      cancelledTrips: cancelled,
      revenue: revenue,
      bookedFare: bookedFare,
    );
  }
}
