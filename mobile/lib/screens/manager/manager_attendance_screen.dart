// ─────────────────────────────────────────────────────────────────────────────
// manager_attendance_screen.dart — mark driver attendance for a day.
// Date selector (defaults to today, no future dates) · day summary · one card
// per driver with a Present / Absent / Leave segmented control. Each change
// writes immediately via ManagerRepository.markAttendance (update the day's
// row if it exists, else insert). Leave is recorded as leave_type 'casual'.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/manager_models.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../../core/theme/home_tokens.dart';

DateTime _dayOf(DateTime d) => DateTime(d.year, d.month, d.day);

class ManagerAttendanceScreen extends ConsumerStatefulWidget {
  const ManagerAttendanceScreen({super.key, this.initialDate});
  final DateTime? initialDate;

  @override
  ConsumerState<ManagerAttendanceScreen> createState() =>
      _ManagerAttendanceScreenState();
}

class _ManagerAttendanceScreenState
    extends ConsumerState<ManagerAttendanceScreen> {
  late DateTime _day = _dayOf(widget.initialDate ?? DateTime.now());

  /// Optimistic statuses while a write is in flight / until the reload lands.
  final _pending = <String, String>{};
  final _saving = <String>{};
  final _autoMarking = <String>{};

  bool get _isToday => _day == _dayOf(DateTime.now());

  void _setDay(DateTime d) => setState(() {
    _day = _dayOf(d);
    _pending.clear();
  });

  Future<void> _pickDay() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _day,
      firstDate: DateTime(2023),
      lastDate: _dayOf(DateTime.now()),
    );
    if (picked != null) _setDay(picked);
  }

  Future<void> _refresh() async {
    ref.invalidate(managerAttendanceProvider(_day));
    try {
      await ref.read(managerAttendanceProvider(_day).future);
    } catch (_) {
      /* error state renders */
    }
  }

  Future<void> _mark(AttendanceEntry entry, String status) async {
    final id = entry.driver.id;
    final day = _day;
    setState(() {
      _pending[id] = status;
      _saving.add(id);
    });
    try {
      await ref
          .read(managerRepositoryProvider)
          .markAttendance(entry: entry, date: day, status: status);
      ref.invalidate(managerAttendanceProvider(day));
      ref.invalidate(managerDashboardProvider);
      if (mounted) {
        showManagerSnack(context, '${entry.driver.name}: ${titleCase(status)}');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _pending.remove(id));
        showManagerSnack(context, managerErrorText(e), error: true);
      }
    } finally {
      if (mounted) setState(() => _saving.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerAttendanceProvider(_day));
    final bookings = ref.watch(managerBookingsProvider).valueOrNull ?? const [];

    // Drop optimistic values once the server agrees.
    final rows = async.valueOrNull;
    if (rows != null) {
      for (final r in rows) {
        if (_pending[r.driver.id] == r.status &&
            !_saving.contains(r.driver.id)) {
          _pending.remove(r.driver.id);
        }
        if (_isToday) {
          final attendedDriverIds = bookings
              .where(
                (booking) =>
                    const {
                      'started',
                      'completed',
                      'closed',
                    }.contains(booking.status) &&
                    booking.driverId != null &&
                    booking.startDate != null &&
                    _dayOf(booking.startDate!) == _day,
              )
              .map((booking) => booking.driverId!)
              .toSet();
          final entries = rows
              .where(
                (entry) =>
                    attendedDriverIds.contains(entry.driver.id) &&
                    entry.status != 'present' &&
                    _autoMarking.add(entry.driver.id),
              )
              .toList();
          if (entries.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (!mounted) return;
              for (final entry in entries) {
                _mark(entry, 'present');
              }
            });
          }
        }
      }
    }

    String? statusOf(AttendanceEntry e) => _pending[e.driver.id] ?? e.status;

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Attendance'),
        actions: [
          IconButton(
            tooltip: 'Attendance calendar',
            onPressed: () => context.push(AppRoutes.managerAttendanceCalendar),
            icon: const Icon(Icons.calendar_month_outlined),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Date selector ────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
            child: Row(
              children: [
                IconButton(
                  tooltip: 'Previous day',
                  onPressed: () =>
                      _setDay(_day.subtract(const Duration(days: 1))),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: MCard(
                    onTap: _pickDay,
                    padding: const EdgeInsets.symmetric(
                      vertical: 10,
                      horizontal: 12,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.calendar_today_outlined,
                          size: 16,
                          color: t.primary,
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            _isToday
                                ? 'Today · ${DateFormat('d MMM').format(_day)}'
                                : DateFormat('EEE, d MMM yyyy').format(_day),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: t.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Next day',
                  onPressed: _isToday
                      ? null
                      : () => _setDay(_day.add(const Duration(days: 1))),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              color: t.primary,
              onRefresh: _refresh,
              child: async.when(
                skipLoadingOnRefresh: true,
                loading: () =>
                    ListView(children: const [MLoading(height: 260)]),
                error: (e, _) => ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(20),
                  children: [
                    MError(
                      error: e,
                      onRetry: () =>
                          ref.invalidate(managerAttendanceProvider(_day)),
                    ),
                  ],
                ),
                data: (list) {
                  if (list.isEmpty) {
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(20),
                      children: const [
                        MEmpty(
                          icon: Icons.groups_outlined,
                          title: 'No drivers',
                          message:
                              'Active drivers added on the web show up here.',
                        ),
                      ],
                    );
                  }
                  int count(String? s) =>
                      list.where((e) => statusOf(e) == s).length;
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          MTag(
                            label: 'Present ${count('present')}',
                            color: t.success,
                          ),
                          MTag(
                            label: 'Absent ${count('absent')}',
                            color: Theme.of(context).colorScheme.error,
                          ),
                          MTag(
                            label: 'Leave ${count('leave')}',
                            color: t.warning,
                          ),
                          MTag(
                            label: 'Not marked ${count(null)}',
                            color: t.textSecondary,
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      for (final e in list) ...[
                        _DriverAttendanceCard(
                          entry: e,
                          status: statusOf(e),
                          saving: _saving.contains(e.driver.id),
                          onChanged: (s) => _mark(e, s),
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DriverAttendanceCard extends StatelessWidget {
  const _DriverAttendanceCard({
    required this.entry,
    required this.status,
    required this.saving,
    required this.onChanged,
  });

  final AttendanceEntry entry;
  final String? status;
  final bool saving;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final e = entry;
    final times = [
      if (e.checkIn != null) 'In ${managerClock(e.checkIn)}',
      if (e.checkOut != null) 'Out ${managerClock(e.checkOut)}',
    ].join(' · ');
    return MCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: t.primary.withValues(alpha: 0.12),
                child: Text(
                  e.driver.name.isNotEmpty
                      ? e.driver.name[0].toUpperCase()
                      : '?',
                  style: TextStyle(
                    color: t.primary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.driver.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: t.textPrimary,
                      ),
                    ),
                    Text(
                      [
                        if (times.isNotEmpty) times,
                        if (e.driver.status != 'active')
                          titleCase(e.driver.status),
                        if (times.isEmpty && e.driver.phone != null)
                          e.driver.phone!,
                      ].join(' · ').ifEmpty(status == null ? 'Not marked' : ''),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                    ),
                  ],
                ),
              ),
              if (saving)
                const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
            ],
          ),
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              emptySelectionAllowed: true,
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
              segments: const [
                ButtonSegment(value: 'present', label: Text('Present')),
                ButtonSegment(value: 'absent', label: Text('Absent')),
                ButtonSegment(value: 'leave', label: Text('Leave')),
              ],
              selected: {if (status != null) status!},
              onSelectionChanged: saving
                  ? null
                  : (s) {
                      if (s.isNotEmpty && s.first != status) onChanged(s.first);
                    },
            ),
          ),
        ],
      ),
    );
  }
}

extension on String {
  String ifEmpty(String fallback) => isEmpty ? fallback : this;
}
