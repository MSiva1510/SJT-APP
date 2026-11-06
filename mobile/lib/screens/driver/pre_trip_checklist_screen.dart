// ─────────────────────────────────────────────────────────────────────────────
// pre_trip_checklist_screen.dart — "Pre-Trip Inspection" per the wireframe.
// Five vehicle checks (Tyres · Brakes · Lights · Fuel · Documents), each with
// an OK / Issue segmented control. Returning `true` from this route lets the
// caller proceed with START TRIP; issues trigger a confirmation first.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../providers/trip_provider.dart';
import '../../navigation/app_router.dart';

class _Check {
  const _Check(this.title, this.subtitle, this.icon);
  final String title;
  final String subtitle;
  final IconData icon;
}

const _checks = <_Check>[
  _Check('Tyres', 'Tread depth & pressure', Icons.tire_repair),
  _Check('Brakes', 'Pad wear & fluid levels', Icons.car_crash_outlined),
  _Check('Lights', 'Headlights & indicators', Icons.lightbulb_outline),
  _Check(
    'Fuel',
    'Sufficient for planned route',
    Icons.local_gas_station_outlined,
  ),
  _Check(
    'Documents',
    'RC, Insurance, Permit valid',
    Icons.description_outlined,
  ),
];

class PreTripChecklistScreen extends ConsumerStatefulWidget {
  const PreTripChecklistScreen({super.key, required this.tripId});
  final String tripId;

  @override
  ConsumerState<PreTripChecklistScreen> createState() =>
      _PreTripChecklistScreenState();
}

class _PreTripChecklistScreenState
    extends ConsumerState<PreTripChecklistScreen> {
  /// title → true (OK) / false (Issue). Absent = unanswered.
  final Map<String, bool> _answers = {};

  bool get _allAnswered => _answers.length == _checks.length;
  int get _issueCount => _answers.values.where((v) => !v).length;

  String? get _vehicleReg {
    final state = ref.read(tripDetailProvider(widget.tripId));
    return switch (state) {
      TripDetailLoaded(:final trip) => trip.vehicleReg,
      _ => null,
    };
  }

  Future<void> _continue() async {
    if (!_allAnswered) return;

    if (_issueCount > 0) {
      final proceed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Issues reported'),
          content: Text(
            '$_issueCount item${_issueCount == 1 ? '' : 's'} marked as an '
            'issue. Continue to the trip anyway?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Go back'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Continue'),
            ),
          ],
        ),
      );
      if (proceed != true || !mounted) return;
    }

    context.pop(true);
  }

  Future<void> _reportIssue() async {
    await context.push(
      AppRoutes.reportIssueFor(tripId: widget.tripId, vehicleReg: _vehicleReg),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final reg = _vehicleReg;

    return Scaffold(
      appBar: AppBar(title: const Text('Pre-Trip Inspection')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            'Vehicle Ready? Ensure all items pass.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 6),
          if (reg != null)
            Row(
              children: [
                Icon(
                  Icons.directions_car_outlined,
                  size: 18,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    'Vehicle · $reg',
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 16),
          for (final c in _checks)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _CheckRow(
                check: c,
                value: _answers[c.title],
                onChanged: (v) => setState(() => _answers[c.title] = v),
              ),
            ),
        ],
      ),
      bottomNavigationBar: _ActionBar(
        enabled: _allAnswered,
        remaining: _checks.length - _answers.length,
        onContinue: _continue,
        onReport: _reportIssue,
      ),
    );
  }
}

// ── Checklist row ─────────────────────────────────────────────────────────────

class _CheckRow extends StatelessWidget {
  const _CheckRow({
    required this.check,
    required this.value,
    required this.onChanged,
  });

  final _Check check;
  final bool? value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainerLow,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    check.icon,
                    size: 22,
                    color: theme.colorScheme.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        check.title,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        check.subtitle,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            _OkIssue(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}

// ── OK / Issue segmented control ──────────────────────────────────────────────

class _OkIssue extends StatelessWidget {
  const _OkIssue({required this.value, required this.onChanged});

  final bool? value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _segment(
            context,
            label: 'OK',
            selected: value == true,
            color: const Color(0xFF166534),
            onTap: () => onChanged(true),
          ),
          _segment(
            context,
            label: 'Issue',
            selected: value == false,
            color: theme.colorScheme.error,
            onTap: () => onChanged(false),
          ),
        ],
      ),
    );
  }

  Widget _segment(
    BuildContext context, {
    required String label,
    required bool selected,
    required Color color,
    required VoidCallback onTap,
  }) {
    final theme = Theme.of(context);
    return Expanded(
      child: Semantics(
        button: true,
        selected: selected,
        label: label,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? color : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                color: selected
                    ? Colors.white
                    : theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Sticky action bar ─────────────────────────────────────────────────────────

class _ActionBar extends StatelessWidget {
  const _ActionBar({
    required this.enabled,
    required this.remaining,
    required this.onContinue,
    required this.onReport,
  });

  final bool enabled;
  final int remaining;
  final VoidCallback onContinue;
  final VoidCallback onReport;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant, width: 0.5),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: enabled ? onContinue : null,
                  child: Text(
                    enabled ? 'CONTINUE TO TRIP' : 'CONTINUE · $remaining LEFT',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: OutlinedButton(
                  onPressed: onReport,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.primary,
                    side: BorderSide(color: theme.colorScheme.primary),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: const Text(
                    'REPORT ISSUE',
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
