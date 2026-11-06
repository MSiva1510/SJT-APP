import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../models/manager_models.dart';
import '../../../providers/manager_provider.dart';
import '../../../widgets/manager/manager_ui.dart';
import '../../../../core/theme/home_tokens.dart';

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

List<ManagerBooking> attendanceTripsForDay(
  Iterable<ManagerBooking> trips,
  DateTime day,
) {
  final date = _dateOnly(day);
  return trips
      .where(
        (trip) =>
            trip.startDate != null &&
            _dateOnly(trip.startDate!) == date &&
            const {'started', 'completed', 'closed'}.contains(trip.status),
      )
      .toList(growable: false);
}

class AttendanceCalendarScreen extends ConsumerStatefulWidget {
  const AttendanceCalendarScreen({super.key, this.initialMonth});

  final DateTime? initialMonth;

  @override
  ConsumerState<AttendanceCalendarScreen> createState() =>
      _AttendanceCalendarScreenState();
}

class _AttendanceCalendarScreenState
    extends ConsumerState<AttendanceCalendarScreen> {
  late DateTime _month = _monthOnly(widget.initialMonth ?? DateTime.now());
  late DateTime _selectedDay = _dateOnly(DateTime.now());

  static DateTime _monthOnly(DateTime date) => DateTime(date.year, date.month);

  void _changeMonth(int offset) {
    setState(() {
      _month = DateTime(_month.year, _month.month + offset);
      _selectedDay = DateTime(
        _month.year,
        _month.month,
        _selectedDay.day.clamp(1, DateTime(_month.year, _month.month + 1, 0).day),
      );
    });
    ref.invalidate(managerAttendanceTripsProvider(_month));
  }

  Future<void> _showDay(
    DateTime day,
    List<ManagerBooking> trips,
    List<DriverOption> drivers,
  ) async {
    setState(() => _selectedDay = day);
    final dayTrips = attendanceTripsForDay(trips, day);
    final presentIds = dayTrips.map((trip) => trip.driverId).whereType<String>().toSet();
    final presentNames = dayTrips
        .where((trip) => trip.driverId == null && trip.driverName != null)
        .map((trip) => trip.driverName!.toLowerCase())
        .toSet();
    final activeDrivers = drivers.where((driver) => driver.status == 'active');
    final drivenIds = <String>{};
    final presentDrivers = <DriverOption>[];
    for (final driver in activeDrivers) {
      if (presentIds.contains(driver.id) ||
          presentNames.contains(driver.name.toLowerCase())) {
        presentDrivers.add(driver);
        drivenIds.add(driver.id);
      }
    }
    final absentDrivers = activeDrivers
        .where((driver) => !drivenIds.contains(driver.id))
        .toList(growable: false);
    final today = _dateOnly(DateTime.now());
    final future = _dateOnly(day).isAfter(today);

    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(context).height * 0.78,
          ),
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            children: [
              Text(
                DateFormat('EEEE, d MMMM yyyy').format(day),
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              _AttendanceLegend(
                color: future
                    ? Theme.of(context).colorScheme.outline
                    : presentDrivers.isEmpty
                    ? Theme.of(context).colorScheme.error
                    : Theme.of(context).colorScheme.primary,
                icon: future
                    ? Icons.event_available_outlined
                    : presentDrivers.isEmpty
                    ? Icons.event_busy_outlined
                    : Icons.check_circle_outline,
                label: future
                    ? 'Scheduled day'
                    : '${presentDrivers.length} driver${presentDrivers.length == 1 ? '' : 's'} drove',
              ),
              if (!future && dayTrips.isNotEmpty) ...[
                const SizedBox(height: 12),
                const MSectionLabel('Trips driven'),
                for (final trip in dayTrips)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.route_outlined),
                    title: Text(trip.driverName ?? 'Driver not assigned'),
                    subtitle: Text(
                      '${trip.bookingNumber ?? trip.label} · '
                      '${trip.pickup ?? '—'} → ${trip.drop ?? '—'}',
                    ),
                    trailing: Text(
                      trip.startTime == null
                          ? ''
                          : DateFormat('h:mm a').format(
                              DateTime(
                                2000,
                                1,
                                1,
                                int.tryParse(trip.startTime!.split(':').first) ?? 0,
                                int.tryParse(trip.startTime!.split(':').skip(1).firstOrNull ?? '0') ?? 0,
                              ),
                            ),
                    ),
                  ),
              ],
              if (!future) ...[
                const SizedBox(height: 8),
                MSectionLabel(
                  'No trip recorded · ${absentDrivers.length} driver${absentDrivers.length == 1 ? '' : 's'}',
                ),
                if (absentDrivers.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Text('All active drivers have a trip recorded.'),
                  )
                else
                  for (final driver in absentDrivers)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.person_off_outlined),
                      title: Text(driver.name),
                      subtitle: driver.phone == null ? null : Text(driver.phone!),
                    ),
              ],
              if (future && dayTrips.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Text('No completed or active trips recorded yet.'),
                ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final tripState = ref.watch(managerAttendanceTripsProvider(_month));
    final driverState = ref.watch(managerDriversProvider);
    final today = _dateOnly(DateTime.now());

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Attendance'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(managerAttendanceTripsProvider(_month));
          await ref.read(managerAttendanceTripsProvider(_month).future);
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            Row(
              children: [
                IconButton(
                  tooltip: 'Previous month',
                  onPressed: () => _changeMonth(-1),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Center(
                    child: Text(
                      DateFormat('MMMM yyyy').format(_month),
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Next month',
                  onPressed: _month.year == today.year &&
                          _month.month == today.month
                      ? null
                      : () => _changeMonth(1),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                for (final weekday in const ['M', 'T', 'W', 'T', 'F', 'S', 'S'])
                  Expanded(
                    child: Center(
                      child: Text(
                        weekday,
                        style: TextStyle(
                          color: t.textSecondary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            tripState.when(
              loading: () => const MLoading(height: 320),
              error: (error, _) => MError(
                error: error,
                onRetry: () =>
                    ref.invalidate(managerAttendanceTripsProvider(_month)),
              ),
              data: (trips) => driverState.when(
                loading: () => const MLoading(height: 320),
                error: (error, _) => MError(
                  error: error,
                  onRetry: () => ref.invalidate(managerDriversProvider),
                ),
                data: (drivers) => _buildCalendar(
                  context,
                  trips,
                  drivers,
                  today,
                ),
              ),
            ),
            const SizedBox(height: 14),
            const Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 8,
              children: [
                _AttendanceLegend(
                  color: Color(0xFF16834A),
                  icon: Icons.check_circle,
                  label: 'Trip · present',
                ),
                _AttendanceLegend(
                  color: Color(0xFFC62828),
                  icon: Icons.cancel_outlined,
                  label: 'No trip · absent',
                ),
                _AttendanceLegend(
                  color: Color(0xFF64748B),
                  icon: Icons.circle_outlined,
                  label: 'Upcoming',
                ),
              ],
            ),
            const SizedBox(height: 12),
            MCard(
              child: Row(
                children: [
                  Icon(Icons.touch_app_outlined, color: t.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Tap a date to see the drivers who drove and the active drivers with no trip.',
                      style: TextStyle(color: t.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCalendar(
    BuildContext context,
    List<ManagerBooking> trips,
    List<DriverOption> drivers,
    DateTime today,
  ) {
    final t = Theme.of(context).home;
    final count = DateTime(_month.year, _month.month + 1, 0).day;
    final leading = DateTime(_month.year, _month.month, 1).weekday - 1;
    final rows = ((leading + count + 6) ~/ 7);
    return Column(
      children: [
        for (var week = 0; week < rows; week++)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (var weekday = 0; weekday < 7; weekday++)
                Expanded(
                  child: Builder(
                    builder: (context) {
                      final dayNumber = week * 7 + weekday - leading + 1;
                      if (dayNumber < 1 || dayNumber > count) {
                        return const SizedBox(height: 62);
                      }
                      final day = DateTime(_month.year, _month.month, dayNumber);
                      final driven = attendanceTripsForDay(trips, day);
                      final isFuture = day.isAfter(today);
                      final hasTrips = driven.isNotEmpty;
                      final color = isFuture
                          ? t.textSecondary
                          : hasTrips
                          ? const Color(0xFF16834A)
                          : const Color(0xFFC62828);
                      final selected = _dateOnly(day) == _selectedDay;
                      return Padding(
                        padding: const EdgeInsets.all(2),
                        child: Material(
                          color: selected
                              ? color.withValues(alpha: 0.14)
                              : t.card,
                          borderRadius: BorderRadius.circular(12),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(12),
                            onTap: () => _showDay(day, trips, drivers),
                            child: Container(
                              height: 58,
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: day == today ? t.primary : t.cardBorder,
                                  width: day == today ? 2 : 1,
                                ),
                              ),
                              padding: const EdgeInsets.symmetric(vertical: 5),
                              child: Column(
                                children: [
                                  Text(
                                    '$dayNumber',
                                    style: TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: selected ? color : t.textPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 3),
                                  if (isFuture)
                                    Icon(Icons.circle_outlined, size: 12, color: color)
                                  else ...[
                                    Icon(
                                      hasTrips
                                          ? Icons.check_circle
                                          : Icons.cancel_outlined,
                                      size: 12,
                                      color: color,
                                    ),
                                    Text(
                                      '${driven.map((trip) => trip.driverId ?? trip.driverName).toSet().length}',
                                      style: TextStyle(
                                        fontSize: 9,
                                        height: 1.1,
                                        color: color,
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
      ],
    );
  }
}

class _AttendanceLegend extends StatelessWidget {
  const _AttendanceLegend({
    required this.color,
    required this.icon,
    required this.label,
  });

  final Color color;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 16, color: color),
      const SizedBox(width: 5),
      Text(label, style: TextStyle(color: color, fontSize: 12)),
    ],
  );
}
