// ─────────────────────────────────────────────────────────────────────────────
// status_chip.dart — single source of truth for trip/booking status pills.
// Every status chip in the app renders through this widget so colors, labels,
// and contrast stay consistent across light and dark themes.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status, this.showDot = true});

  final String status;
  final bool showDot;

  static String label(String status) => switch (status) {
    'draft' => 'DRAFT',
    'pending' => 'PENDING',
    'approved' => 'APPROVED',
    'confirmed' => 'CONFIRMED',
    'assigned' => 'ASSIGNED',
    'started' => 'IN PROGRESS',
    'completed' => 'COMPLETED',
    'closed' => 'CLOSED',
    'cancelled' => 'CANCELLED',
    _ => status.toUpperCase(),
  };

  (Color, Color) _colors(ColorScheme scheme) {
    final dark = scheme.brightness == Brightness.dark;
    return switch (status) {
      'draft' => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      'pending' =>
        dark
            ? (
                Colors.orange.shade900.withValues(alpha: 0.35),
                Colors.orange.shade200,
              )
            : (const Color(0xFFFFF4CE), const Color(0xFF8A6D00)),
      'approved' || 'confirmed' =>
        dark
            ? (
                Colors.deepPurple.shade900.withValues(alpha: 0.35),
                Colors.deepPurple.shade200,
              )
            : (const Color(0xFFEDE7F6), const Color(0xFF5E35B1)),
      'assigned' =>
        dark
            ? (scheme.primary.withValues(alpha: 0.22), scheme.primary)
            : (scheme.primary.withValues(alpha: 0.10), scheme.primary),
      'started' =>
        dark
            ? (
                Colors.green.shade900.withValues(alpha: 0.35),
                Colors.green.shade200,
              )
            : (Colors.green.shade50, Colors.green.shade800),
      'completed' => (scheme.surfaceContainerLow, scheme.onSurfaceVariant),
      'closed' =>
        dark
            ? (
                Colors.teal.shade900.withValues(alpha: 0.35),
                Colors.teal.shade200,
              )
            : (const Color(0xFFE0F2F1), const Color(0xFF00695C)),
      'cancelled' => (scheme.errorContainer, scheme.onErrorContainer),
      _ => (scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
    };
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final (bg, fg) = _colors(scheme);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(color: fg, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
          ],
          Text(
            label(status),
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.6,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
