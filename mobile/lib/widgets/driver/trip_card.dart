// ─────────────────────────────────────────────────────────────────────────────
// trip_card.dart
// Driver-facing trip card. Shows only fields appropriate for the driver.
// Does NOT display: fares, profit, other drivers' data.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import '../../models/trip.dart';

class TripCard extends StatelessWidget {
  const TripCard({
    super.key,
    required this.trip,
    this.onTap,
    this.compact = false,
  });

  final TripModel trip;
  final VoidCallback? onTap;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header row: time + status ──────────────────────────────
              Row(
                children: [
                  _TimeChip(time: trip.displayTime),
                  const Spacer(),
                  _StatusBadge(status: trip.status),
                ],
              ),
              const SizedBox(height: 12),

              // ── Route ──────────────────────────────────────────────────
              _RouteRow(
                pickup: trip.pickupLocation ?? 'TBD',
                drop:   trip.dropLocation   ?? 'TBD',
              ),
              const SizedBox(height: 10),

              // ── Customer + Vehicle ─────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: _InfoChip(
                      icon: Icons.person_outline,
                      label: trip.customerName ?? 'Customer',
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (trip.vehicleReg != null)
                    _InfoChip(
                      icon: Icons.directions_car_outlined,
                      label: trip.vehicleReg!,
                    ),
                ],
              ),

              // ── Type label + distance ─────────────────────────────────
              if (!compact) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        trip.tripTypeLabel,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSecondaryContainer,
                        ),
                      ),
                    ),
                    if (trip.totalKm != null) ...[
                      const SizedBox(width: 8),
                      Icon(Icons.straighten,
                          size: 14,
                          color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 2),
                      Text(
                        '${trip.totalKm!.toStringAsFixed(0)} km',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    const Spacer(),
                    if (onTap != null)
                      Icon(Icons.chevron_right,
                          color: theme.colorScheme.onSurfaceVariant),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.time});
  final String time;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.access_time_outlined,
            size: 16, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 4),
        Text(
          time,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
              ),
        ),
      ],
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (bg, fg, label) = switch (status) {
      'assigned'  => (theme.colorScheme.primaryContainer,
                      theme.colorScheme.onPrimaryContainer,
                      'Assigned'),
      'started'   => (const Color(0xFFE8F5E9),
                      const Color(0xFF1B5E20),
                      '● In Progress'),
      'completed' => (theme.colorScheme.surfaceContainerHighest,
                      theme.colorScheme.onSurfaceVariant,
                      'Done'),
      'cancelled' => (theme.colorScheme.errorContainer,
                      theme.colorScheme.onErrorContainer,
                      'Cancelled'),
      _           => (theme.colorScheme.surfaceContainerHighest,
                      theme.colorScheme.onSurfaceVariant,
                      status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg, borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11, fontWeight: FontWeight.w700, color: fg,
        ),
      ),
    );
  }
}

class _RouteRow extends StatelessWidget {
  const _RouteRow({required this.pickup, required this.drop});
  final String pickup;
  final String drop;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Column(
          children: [
            Icon(Icons.trip_origin, size: 16,
                color: theme.colorScheme.primary),
            Container(
              width: 1.5, height: 20,
              color: theme.colorScheme.outlineVariant,
            ),
            Icon(Icons.location_on, size: 16,
                color: theme.colorScheme.error),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(pickup,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 8),
              Text(drop,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ],
    );
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}