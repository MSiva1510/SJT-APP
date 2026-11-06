// ─────────────────────────────────────────────────────────────────────────────
// attendance_history_screen.dart
// Driver's attendance history — last 30 records, newest first.
// Only this driver's records (RLS enforced).
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/attendance.dart';
import '../../providers/attendance_provider.dart';

class AttendanceHistoryScreen extends ConsumerStatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  ConsumerState<AttendanceHistoryScreen> createState() =>
      _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState
    extends ConsumerState<AttendanceHistoryScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(attendanceHistoryProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(attendanceHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Attendance History')),
      body: switch (state) {
        AttendanceListLoading() => const Center(
          child: CircularProgressIndicator(),
        ),

        AttendanceListRefreshing(:final previous) => Stack(
          children: [
            _HistoryList(records: previous),
            const Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: LinearProgressIndicator(),
            ),
          ],
        ),

        AttendanceListLoaded(:final records) => _HistoryList(records: records),

        AttendanceListEmpty() => const _EmptyState(),

        AttendanceListError(:final message) => _ErrorState(
          message: message,
          onRetry: () => ref.read(attendanceHistoryProvider.notifier).refresh(),
        ),
      },
    );
  }
}

// ── History list ──────────────────────────────────────────────────────────────

class _HistoryList extends StatelessWidget {
  const _HistoryList({required this.records});
  final List<AttendanceModel> records;

  @override
  Widget build(BuildContext context) {
    // Group by month
    final byMonth = <String, List<AttendanceModel>>{};
    for (final r in records) {
      final key = DateFormat('MMMM yyyy').format(r.attendanceDate);
      byMonth.putIfAbsent(key, () => []).add(r);
    }

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 24),
        itemCount: byMonth.length,
        itemBuilder: (ctx, i) {
          final month = byMonth.keys.elementAt(i);
          final entries = byMonth[month]!;
          final present = entries.where((e) => e.status == 'present').length;

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Month header
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Row(
                  children: [
                    Text(
                      month,
                      style: Theme.of(ctx).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(ctx).colorScheme.primary,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      '$present present',
                      style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                        color: Theme.of(ctx).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
              ...entries.map((r) => _AttendanceRow(record: r)),
            ],
          );
        },
      ),
    );
  }
}

// ── Attendance row ─────────────────────────────────────────────────────────────

class _AttendanceRow extends StatelessWidget {
  const _AttendanceRow({required this.record});
  final AttendanceModel record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (statusColor, statusLabel) = switch (record.status) {
      'present' => (Colors.green.shade600, 'Present'),
      'absent' => (theme.colorScheme.error, 'Absent'),
      'leave' => (Colors.orange.shade600, 'Leave'),
      _ => (theme.colorScheme.onSurfaceVariant, record.status),
    };

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            // ── Date box ────────────────────────────────────────────────
            Container(
              width: 48,
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                children: [
                  Text(
                    DateFormat('dd').format(record.attendanceDate),
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                  Text(
                    DateFormat('EEE').format(record.attendanceDate),
                    style: TextStyle(
                      fontSize: 11,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 14),

            // ── Times ───────────────────────────────────────────────────
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _TimeTag(
                          icon: Icons.login_outlined,
                          time: record.checkIn ?? '—',
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: _TimeTag(
                          icon: Icons.logout_outlined,
                          time: record.checkOut ?? '—',
                          color: record.isCheckedOut
                              ? theme.colorScheme.error
                              : theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                  if (record.workingHours != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      record.workingHours!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: Colors.green.shade700,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // ── Status badge ─────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: statusColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                statusLabel,
                style: TextStyle(
                  color: statusColor,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TimeTag extends StatelessWidget {
  const _TimeTag({required this.icon, required this.time, required this.color});
  final IconData icon;
  final String time;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: color),
        const SizedBox(width: 3),
        Flexible(
          child: Text(
            time,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ),
      ],
    );
  }
}

// ── States ────────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.event_note_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            'No attendance records yet.',
            style: theme.textTheme.titleMedium,
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_outlined,
              size: 56,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
