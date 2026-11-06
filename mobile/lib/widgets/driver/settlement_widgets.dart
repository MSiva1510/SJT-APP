// ─────────────────────────────────────────────────────────────────────────────
// settlement_widgets.dart — shared UI for Pending Earnings / Payouts.
// One place for the status chip, settlement card, states (skeleton/empty/
// error/offline) so the two screens stay visually consistent with the
// redesigned Earnings screen. All amounts come from real `settlements` rows.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';

import '../../core/formatters.dart';
import '../../core/theme/home_tokens.dart';
import '../../models/settlement.dart';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String settlementPeriodLabel(Settlement s) {
  if (s.month < 1 || s.month > 12 || s.year == 0) return 'Settlement';
  return '${_months[s.month - 1]} ${s.year}';
}

/// draft / pending / approved / paid → driver-facing label + tone.
({String label, Color bg, Color fg, IconData icon}) settlementStatusStyle(
  String status,
  HomeTokens t,
) {
  switch (status) {
    case 'paid':
      return (
        label: 'Paid',
        bg: const Color(0xFFE5F8EE),
        fg: const Color(0xFF07864B),
        icon: Icons.check_circle,
      );
    case 'approved':
      return (
        label: 'Approved',
        bg: const Color(0xFFEAF2FF),
        fg: const Color(0xFF1677FF),
        icon: Icons.verified,
      );
    case 'pending':
      return (
        label: 'Pending',
        bg: const Color(0xFFFEF3E2),
        fg: const Color(0xFFB45309),
        icon: Icons.schedule,
      );
    case 'draft':
    default:
      return (
        label: 'Draft',
        bg: t.neutralSurface,
        fg: t.textSecondary,
        icon: Icons.edit_note,
      );
  }
}

class SettlementStatusChip extends StatelessWidget {
  const SettlementStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final s = settlementStatusStyle(status, t);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: s.bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(s.icon, size: 11, color: s.fg),
          const SizedBox(width: 3),
          Text(
            s.label,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w700,
              color: s.fg,
            ),
          ),
        ],
      ),
    );
  }
}

/// One settlement row-card: period, status, amount, and (optionally) the
/// paid date + method.
class SettlementCard extends StatelessWidget {
  const SettlementCard({super.key, required this.settlement, this.onTap});

  final Settlement settlement;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final s = settlement;
    final period = settlementPeriodLabel(s);
    final paidLine = s.paymentDate != null
        ? 'Paid ${_d(s.paymentDate!)}${s.paymentMethod.isEmpty ? '' : ' · ${s.paymentMethod}'}'
        : (s.updatedAt != null ? 'Updated ${_d(s.updatedAt!)}' : '');

    return Semantics(
      button: onTap != null,
      label:
          '$period. ${settlementStatusStyle(s.status, t).label}. '
          '${inr.format(s.netAmount)}. $paidLine',
      child: Material(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: t.cardBorder),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        period,
                        style: TextStyle(
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                    SettlementStatusChip(status: s.status),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Net amount',
                            style: TextStyle(
                              fontSize: 12,
                              color: t.textSecondary,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            inr.format(s.netAmount),
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              color: t.textPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (onTap != null)
                      Icon(Icons.chevron_right, color: t.textSecondary),
                  ],
                ),
                if (paidLine.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Icon(
                        s.paymentDate != null
                            ? Icons.account_balance_wallet_outlined
                            : Icons.history,
                        size: 13,
                        color: t.textSecondary,
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          paidLine,
                          style: TextStyle(
                            fontSize: 12,
                            color: t.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _d(DateTime d) {
    final l = d.toLocal();
    return '${l.day} ${_months[l.month - 1]} ${l.year}';
  }
}

/// Loading skeleton matching [SettlementCard] height — avoids layout shift.
class SettlementSkeleton extends StatelessWidget {
  const SettlementSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    Widget bar(double h, double w) => Container(
      height: h,
      width: w,
      decoration: BoxDecoration(
        color: t.neutralSurface,
        borderRadius: BorderRadius.circular(8),
      ),
    );
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.cardBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [bar(16, 90), bar(20, 70)],
          ),
          const SizedBox(height: 14),
          bar(22, 130),
          const SizedBox(height: 12),
          bar(12, 150),
        ],
      ),
    );
  }
}

/// Shared error body — never treated as empty data.
class SettlementError extends StatelessWidget {
  const SettlementError({
    super.key,
    required this.title,
    required this.message,
    required this.onRetry,
  });

  final String title;
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off, size: 40, color: t.textSecondary),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: t.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: t.textSecondary),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

/// Shared empty body.
class SettlementEmpty extends StatelessWidget {
  const SettlementEmpty({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String description;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: t.neutralSurface,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 30, color: t.textSecondary),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: t.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              description,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: t.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

/// A small label/value summary strip (e.g. total pending / total paid).
class SettlementSummaryStrip extends StatelessWidget {
  const SettlementSummaryStrip({
    super.key,
    required this.label,
    required this.amount,
    required this.accent,
    required this.icon,
  });

  final String label;
  final double amount;
  final Color accent;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: t.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: t.cardBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 22, color: accent),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                ),
                const SizedBox(height: 2),
                Text(
                  inr.format(amount),
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
