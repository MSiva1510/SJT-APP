// ─────────────────────────────────────────────────────────────────────────────
// driver_earnings_screen.dart — Earnings (Today / Week / Month).
// Source of truth: trip_payslips rows for the signed-in driver.
// Empty/error states are first-class — never fabricate amounts.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/driver_payslip.dart';
import '../../providers/earnings_provider.dart';

final _inr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

enum _Range { today, week, month }

class DriverEarningsScreen extends ConsumerStatefulWidget {
  const DriverEarningsScreen({super.key});

  @override
  ConsumerState<DriverEarningsScreen> createState() =>
      _DriverEarningsScreenState();
}

class _DriverEarningsScreenState extends ConsumerState<DriverEarningsScreen> {
  _Range _range = _Range.today;

  List<DriverPayslip> _inRange(List<DriverPayslip> all) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final tomorrow = today.add(const Duration(days: 1));
    switch (_range) {
      case _Range.today:
        return all
            .where(
              (p) =>
                  p.effectiveDate != null &&
                  _day(p.effectiveDate!) == today,
            )
            .toList();
      case _Range.week:
        final cutoff = today.subtract(const Duration(days: 6));
        return all
            .where(
              (p) => p.effectiveDate != null &&
                  !_day(p.effectiveDate!).isBefore(cutoff) &&
                  _day(p.effectiveDate!).isBefore(tomorrow),
            )
            .toList();
      case _Range.month:
        final cutoff = today.subtract(const Duration(days: 29));
        return all
            .where(
              (p) => p.effectiveDate != null &&
                  !_day(p.effectiveDate!).isBefore(cutoff) &&
                  _day(p.effectiveDate!).isBefore(tomorrow),
            )
            .toList();
    }
  }

  DateTime _day(DateTime date) => DateTime(date.year, date.month, date.day);

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(driverPayslipsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Earnings')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorBody(
          message: 'Could not load earnings.',
          onRetry: () => ref.invalidate(driverPayslipsProvider),
        ),
        data: (all) {
          final rows = _inRange(all);
          final total = rows.fold<double>(0, (s, p) => s + p.amount);
          final label = switch (_range) {
            _Range.today => 'Total earned today',
            _Range.week => 'Total earned · last 7 days',
            _Range.month => 'Total earned · last 30 days',
          };
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(driverPayslipsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                SegmentedButton<_Range>(
                  segments: const [
                    ButtonSegment(value: _Range.today, label: Text('Today')),
                    ButtonSegment(value: _Range.week, label: Text('Week')),
                    ButtonSegment(value: _Range.month, label: Text('Month')),
                  ],
                  selected: {_range},
                  onSelectionChanged: (s) => setState(() => _range = s.first),
                ),
                const SizedBox(height: 12),
                // ── Hero ──
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        theme.colorScheme.primary,
                        theme.colorScheme.primaryContainer,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        label,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.white70,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _inr.format(total),
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${rows.length} payslip${rows.length == 1 ? '' : 's'}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.white70,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // ── Week bars ──
                if (_range != _Range.today) _WeekBars(all: all),
                // ── Rows ──
                if (rows.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 32),
                    child: Center(
                      child: Text(
                        'No earnings in this period yet.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  )
                else
                  Card(
                    margin: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < rows.length; i++) ...[
                          ListTile(
                            title: Text(
                              rows[i].tripRef.isEmpty
                                  ? 'Trip payout'
                                  : rows[i].tripRef,
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: rows[i].effectiveDate == null
                                ? null
                                : Text(
                                    DateFormat(
                                      'd MMM, h:mm a',
                                    ).format(rows[i].effectiveDate!.toLocal()),
                                  ),
                            trailing: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  _inr.format(rows[i].amount),
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Text(
                                  rows[i].earningsStatus,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: rows[i].isPaid
                                        ? Colors.green.shade700
                                        : theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (i != rows.length - 1) const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// 7-day bar strip (Mon..Sun), today highlighted.
class _WeekBars extends StatelessWidget {
  const _WeekBars({required this.all});

  final List<DriverPayslip> all;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    // Last 7 days ending today, labelled by weekday initial.
    final days = List.generate(7, (i) {
      final d = DateTime(
        now.year,
        now.month,
        now.day,
      ).subtract(Duration(days: 6 - i));
      final total = all
          .where(
            (p) =>
                p.effectiveDate != null &&
                DateTime(
                      p.effectiveDate!.year,
                      p.effectiveDate!.month,
                      p.effectiveDate!.day,
                    ) ==
                    d,
          )
          .fold<double>(0, (s, p) => s + p.amount);
      return (date: d, total: total, isToday: i == 6);
    });
    final max = days
        .map((d) => d.total)
        .fold<double>(0, (a, b) => a > b ? a : b);
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    final theme = Theme.of(context);

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            for (var i = 0; i < 7; i++)
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      height: 8 + (max > 0 ? (days[i].total / max) * 72 : 0),
                      decoration: BoxDecoration(
                        color: days[i].isToday
                            ? theme.colorScheme.primary
                            : theme.colorScheme.primary.withValues(alpha: 0.22),
                        borderRadius: BorderRadius.circular(6),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      labels[(days[i].date.weekday - 1) % 7],
                      style: theme.textTheme.bodySmall,
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

class _ErrorBody extends StatelessWidget {
  const _ErrorBody({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(message),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}
