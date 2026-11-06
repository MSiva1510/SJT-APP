import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../models/manager_report.dart';
import '../../../providers/manager_provider.dart';
import '../../../widgets/manager/manager_ui.dart';
import '../../../../core/theme/home_tokens.dart';

class ManagerReportsScreen extends ConsumerStatefulWidget {
  const ManagerReportsScreen({super.key, this.now});

  final DateTime? now;

  @override
  ConsumerState<ManagerReportsScreen> createState() =>
      _ManagerReportsScreenState();
}

class _ManagerReportsScreenState extends ConsumerState<ManagerReportsScreen> {
  ManagerReportRange _range = ManagerReportRange.today;
  DateTime? _customStart;
  DateTime? _customEnd;

  DateTime get _now => widget.now ?? DateTime.now();

  ManagerReportPeriod get _period => managerReportPeriod(
    _range,
    now: _now,
    customStart: _customStart,
    customEnd: _customEnd,
  );

  Future<void> _selectRange(ManagerReportRange? range) async {
    if (range == null) return;
    if (range == ManagerReportRange.custom) {
      final today = DateTime(_now.year, _now.month, _now.day);
      final picked = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2000),
        lastDate: DateTime(2100),
        initialDateRange: DateTimeRange(
          start: _customStart ?? today,
          end: _customEnd ?? today,
        ),
      );
      if (picked == null || !mounted) return;
      setState(() {
        _range = range;
        _customStart = picked.start;
        _customEnd = picked.end;
      });
      return;
    }
    setState(() => _range = range);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final period = _period;
    final report = ref.watch(managerReportProvider(period));
    final dateLabel = period.start == period.end
        ? DateFormat.yMMMd().format(period.start)
        : '${DateFormat.yMMMd().format(period.start)} – ${DateFormat.yMMMd().format(period.end)}';

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Reports & Analytics'),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(managerReportProvider(period));
          await ref
              .read(managerReportProvider(period).future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            DropdownButtonFormField<ManagerReportRange>(
              key: const Key('manager-report-range'),
              initialValue: _range,
              decoration: const InputDecoration(
                labelText: 'Report period',
                border: OutlineInputBorder(),
              ),
              items: [
                for (final option in ManagerReportRange.values)
                  DropdownMenuItem(value: option, child: Text(option.label)),
              ],
              onChanged: _selectRange,
            ),
            const SizedBox(height: 8),
            Text(
              dateLabel,
              style: TextStyle(color: t.textSecondary, fontSize: 13),
            ),
            const SizedBox(height: 14),
            report.when(
              loading: () => const MLoading(height: 240),
              error: (e, _) => MError(
                error: e,
                onRetry: () => ref.invalidate(managerReportProvider(period)),
              ),
              data: (data) => Column(
                children: [
                  MCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${_range.label} Overview',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _Stat(label: 'Trips', value: '${data.tripCount}'),
                            _Stat(
                              label: 'Completed',
                              value: '${data.completedTrips}',
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _Stat(
                              label: 'Active',
                              value: '${data.activeTrips}',
                            ),
                            _Stat(
                              label: 'Scheduled',
                              value: '${data.scheduledTrips}',
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            _Stat(
                              label: 'Cancelled',
                              value: '${data.cancelledTrips}',
                            ),
                            _Stat(
                              label: 'Average completed',
                              value: data.completedTrips == 0
                                  ? '—'
                                  : '₹${NumberFormat.decimalPattern('en_IN').format((data.revenue / data.completedTrips).round())}',
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  MCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Completed trip revenue',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '₹${NumberFormat.decimalPattern('en_IN').format(data.revenue.round())}',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: t.textPrimary,
                          ),
                        ),
                        Text(
                          'Earned on completed and closed trips only',
                          style: TextStyle(color: t.textSecondary),
                        ),
                        const Divider(height: 24),
                        Text(
                          'Booked fare',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '₹${NumberFormat.decimalPattern('en_IN').format(data.bookedFare.round())}',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                        Text(
                          'Includes scheduled, active and completed trips; excludes cancelled bookings.',
                          style: TextStyle(color: t.textSecondary),
                        ),
                      ],
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
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Expanded(
      child: Column(
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: t.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: t.textSecondary),
          ),
        ],
      ),
    );
  }
}
