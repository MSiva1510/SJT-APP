import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/manager_report.dart';

void main() {
  final now = DateTime(2026, 11, 5, 18);

  test('report presets resolve to calendar-date ranges', () {
    expect(managerReportPeriod(ManagerReportRange.today, now: now), (
      start: DateTime(2026, 11, 5),
      end: DateTime(2026, 11, 5),
    ));
    expect(managerReportPeriod(ManagerReportRange.yesterday, now: now), (
      start: DateTime(2026, 11, 4),
      end: DateTime(2026, 11, 4),
    ));
    expect(managerReportPeriod(ManagerReportRange.lastWeek, now: now), (
      start: DateTime(2026, 10, 26),
      end: DateTime(2026, 11, 1),
    ));
    expect(managerReportPeriod(ManagerReportRange.lastMonth, now: now), (
      start: DateTime(2026, 10, 1),
      end: DateTime(2026, 10, 31),
    ));
    expect(managerReportPeriod(ManagerReportRange.lastYear, now: now), (
      start: DateTime(2025, 1, 1),
      end: DateTime(2025, 12, 31),
    ));
  });

  test('custom dates are date-only and normalized when reversed', () {
    expect(
      managerReportPeriod(
        ManagerReportRange.custom,
        now: now,
        customStart: DateTime(2026, 2, 5, 14),
        customEnd: DateTime(2026, 2, 1, 9),
      ),
      (start: DateTime(2026, 2, 1), end: DateTime(2026, 2, 5)),
    );
  });

  test('report counts trips and excludes cancelled fares from revenue', () {
    final report = ManagerReport.fromBookings([
      {'status': 'completed', 'total_fare': 1200},
      {'status': 'started', 'total_fare': '300'},
      {'status': 'cancelled', 'total_fare': 9999},
      {'status': 'closed', 'total_fare': null},
    ]);

    expect(
      (
        report.tripCount,
        report.completedTrips,
        report.activeTrips,
        report.scheduledTrips,
        report.cancelledTrips,
        report.revenue,
        report.bookedFare,
      ),
      (3, 2, 1, 0, 1, 1200.0, 1500.0),
    );
  });
}
