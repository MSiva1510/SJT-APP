// ─────────────────────────────────────────────────────────────────────────────
// booking_card.dart
// Driver-facing booking card. No financial fields shown.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../models/booking.dart';

class BookingCard extends StatelessWidget {
  const BookingCard({
    super.key,
    required this.booking,
    this.onTap,
    this.compact = false,
  });

  final BookingModel  booking;
  final VoidCallback? onTap;
  final bool          compact;

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
              // ── Header: date + status ──────────────────────────────────
              Row(
                children: [
                  Expanded(child: _DateBadge(booking: booking)),
                  _StatusChip(status: booking.status),
                ],
              ),
              const SizedBox(height: 12),

              // ── Route ─────────────────────────────────────────────────
              _RouteRow(
                pickup: booking.pickupLocation ?? '—',
                drop:   booking.dropLocation   ?? '—',
              ),
              const SizedBox(height: 10),

              // ── Info row ──────────────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: _Chip(
                      icon:  Icons.person_outline,
                      label: booking.customerName ?? 'Customer',
                    ),
                  ),
                  if (booking.vehicleReg != null) ...[
                    const SizedBox(width: 8),
                    _Chip(
                      icon:  Icons.directions_car_outlined,
                      label: booking.vehicleReg!,
                    ),
                  ],
                ],
              ),

              if (!compact) ...[
                const SizedBox(height: 8),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color:        theme.colorScheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        booking.tripTypeLabel,
                        style: TextStyle(
                          fontSize:   11,
                          fontWeight: FontWeight.w600,
                          color: theme.colorScheme.onSecondaryContainer,
                        ),
                      ),
                    ),
                    if (booking.bookingNumber != null) ...[
                      const SizedBox(width: 8),
                      Text(
                        '#${booking.bookingNumber}',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color:      theme.colorScheme.onSurfaceVariant,
                          fontFamily: 'monospace',
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

class _DateBadge extends StatelessWidget {
  const _DateBadge({required this.booking});
  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final date  = booking.startDate;
    final time  = booking.displayTime;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.calendar_today_outlined,
            size: 14, color: theme.colorScheme.primary),
        const SizedBox(width: 4),
        Text(
          date != null
              ? '${DateFormat('d MMM').format(date)}  $time'
              : time,
          style: theme.textTheme.bodySmall?.copyWith(
            fontWeight: FontWeight.w600,
            color:      theme.colorScheme.primary,
          ),
        ),
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (bg, fg, label) = switch (status) {
      'assigned'  => (theme.colorScheme.primaryContainer,
                      theme.colorScheme.onPrimaryContainer, 'Assigned'),
      'started'   => (const Color(0xFFE8F5E9),
                      const Color(0xFF1B5E20), '● In Progress'),
      'completed' => (theme.colorScheme.surfaceContainerHighest,
                      theme.colorScheme.onSurfaceVariant, 'Done'),
      'cancelled' => (theme.colorScheme.errorContainer,
                      theme.colorScheme.onErrorContainer, 'Cancelled'),
      _           => (theme.colorScheme.surfaceContainerHighest,
                      theme.colorScheme.onSurfaceVariant, status),
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
  final String pickup, drop;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Column(
          children: [
            Icon(Icons.trip_origin, size: 14,
                color: theme.colorScheme.primary),
            Container(width: 1.5, height: 18,
                color: theme.colorScheme.outlineVariant),
            Icon(Icons.location_on, size: 14,
                color: theme.colorScheme.error),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(pickup,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              const SizedBox(height: 6),
              Text(drop,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.w500),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
            ],
          ),
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.icon, required this.label});
  final IconData icon;
  final String   label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            label,
            style: theme.textTheme.bodySmall
                ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
