// ─────────────────────────────────────────────────────────────────────────────
// attendance_screen.dart
// Driver attendance: check-in, working, check-out, completed states.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/attendance.dart';
import '../../providers/attendance_provider.dart';
import '../../navigation/app_router.dart';

class AttendanceScreen extends ConsumerWidget {
  const AttendanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(todayAttendanceProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'History',
            onPressed: () => context.push(AppRoutes.attendanceHistory),
          ),
        ],
      ),
      body: switch (state) {
        AttendanceInitial() || AttendanceLoading() => const _Loading(),

        AttendanceSubmitting(:final current) => _Body(
          record: current,
          isSubmitting: true,
          ref: ref,
        ),

        AttendanceLoaded(:final record) => _Body(
          record: record,
          isSubmitting: false,
          ref: ref,
        ),

        AttendanceError(:final message, :final record) => _Body(
          record: record,
          isSubmitting: false,
          ref: ref,
          error: message,
        ),
      },
    );
  }
}

// ── Main body ─────────────────────────────────────────────────────────────────

class _Body extends ConsumerWidget {
  const _Body({
    required this.record,
    required this.isSubmitting,
    required this.ref,
    this.error,
  });
  final AttendanceModel? record;
  final bool isSubmitting;
  final WidgetRef ref;
  final String? error;

  @override
  Widget build(BuildContext context, WidgetRef widgetRef) {
    final theme = Theme.of(context);
    final today = DateTime.now();

    return RefreshIndicator(
      onRefresh: () => ref.read(todayAttendanceProvider.notifier).refresh(),
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Date header ────────────────────────────────────────────────
          Text(
            DateFormat('EEEE, d MMMM yyyy').format(today),
            style: theme.textTheme.titleMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),

          // ── Status card ────────────────────────────────────────────────
          _StatusCard(record: record),
          const SizedBox(height: 24),

          // ── Error banner ───────────────────────────────────────────────
          if (error != null) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.error_outline,
                    color: theme.colorScheme.onErrorContainer,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      error!,
                      style: TextStyle(
                        color: theme.colorScheme.onErrorContainer,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],

          // ── Time display ───────────────────────────────────────────────
          if (record != null) ...[
            _TimeRow(
              label: 'Check-in',
              time: record!.checkIn ?? '—',
              icon: Icons.login_outlined,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(height: 12),
            _TimeRow(
              label: 'Check-out',
              time: record!.checkOut ?? '—',
              icon: Icons.logout_outlined,
              color: record!.isCheckedOut
                  ? theme.colorScheme.error
                  : theme.colorScheme.onSurfaceVariant,
            ),
            if (record!.workingHours != null) ...[
              const SizedBox(height: 12),
              _TimeRow(
                label: 'Hours worked',
                time: record!.workingHours!,
                icon: Icons.timer_outlined,
                color: Colors.green.shade700,
              ),
            ],
            const SizedBox(height: 32),
          ] else
            const SizedBox(height: 12),

          // ── Action button ──────────────────────────────────────────────
          _ActionButton(
            record: record,
            isSubmitting: isSubmitting,
            onCheckIn: () =>
                ref.read(todayAttendanceProvider.notifier).checkIn(),
            onCheckOut: () =>
                ref.read(todayAttendanceProvider.notifier).checkOut(),
          ),

          const SizedBox(height: 16),

          // ── History link ───────────────────────────────────────────────
          TextButton.icon(
            onPressed: () => context.push(AppRoutes.attendanceHistory),
            icon: const Icon(Icons.history),
            label: const Text('View Attendance History'),
          ),
        ],
      ),
    );
  }
}

// ── Status card ───────────────────────────────────────────────────────────────

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.record});
  final AttendanceModel? record;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (record == null) {
      return _card(
        context,
        icon: Icons.login_outlined,
        bg: theme.colorScheme.surfaceContainerHighest,
        fg: theme.colorScheme.onSurfaceVariant,
        title: 'Not Checked In',
        subtitle: 'Tap Check In to start your day',
      );
    }

    if (record!.isComplete) {
      return _card(
        context,
        icon: Icons.check_circle_outline,
        bg: const Color(0xFFE8F5E9),
        fg: const Color(0xFF1B5E20),
        title: 'Day Complete',
        subtitle: 'Worked ${record!.workingHours ?? 'N/A'} today',
      );
    }

    if (record!.isWorking) {
      return _card(
        context,
        icon: Icons.access_time_outlined,
        bg: theme.colorScheme.primaryContainer,
        fg: theme.colorScheme.onPrimaryContainer,
        title: 'Checked In — Working',
        subtitle: 'Since ${record!.checkIn}',
      );
    }

    return _card(
      context,
      icon: Icons.info_outline,
      bg: theme.colorScheme.surfaceContainerHighest,
      fg: theme.colorScheme.onSurfaceVariant,
      title: record!.statusLabel,
      subtitle: '',
    );
  }

  Widget _card(
    BuildContext context, {
    required IconData icon,
    required Color bg,
    required Color fg,
    required String title,
    required String subtitle,
  }) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, size: 48, color: fg),
          const SizedBox(height: 12),
          Text(
            title,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: fg,
            ),
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(subtitle, style: TextStyle(color: fg.withValues(alpha: 0.8))),
          ],
        ],
      ),
    );
  }
}

// ── Time row ──────────────────────────────────────────────────────────────────

class _TimeRow extends StatelessWidget {
  const _TimeRow({
    required this.label,
    required this.time,
    required this.icon,
    required this.color,
  });
  final String label;
  final String time;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 14),
            Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const Spacer(),
            Text(
              time,
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Action button ─────────────────────────────────────────────────────────────

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.record,
    required this.isSubmitting,
    required this.onCheckIn,
    required this.onCheckOut,
  });
  final AttendanceModel? record;
  final bool isSubmitting;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    if (isSubmitting) {
      return FilledButton(
        onPressed: null,
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        child: const SizedBox(
          height: 22,
          width: 22,
          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
        ),
      );
    }

    // Already complete — no action
    if (record != null && record!.isComplete) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          'Attendance Complete for Today',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: theme.colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    // Working — show check-out
    if (record != null && record!.isWorking) {
      return SizedBox(
        width: double.infinity,
        child: FilledButton.icon(
          onPressed: onCheckOut,
          icon: const Icon(Icons.logout_outlined),
          label: const Text('Check Out', style: TextStyle(fontSize: 16)),
          style: FilledButton.styleFrom(
            backgroundColor: theme.colorScheme.error,
            foregroundColor: theme.colorScheme.onError,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      );
    }

    // Not checked in — show check-in
    return SizedBox(
      width: double.infinity,
      child: FilledButton.icon(
        onPressed: onCheckIn,
        icon: const Icon(Icons.login_outlined),
        label: const Text('Check In', style: TextStyle(fontSize: 16)),
        style: FilledButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}
