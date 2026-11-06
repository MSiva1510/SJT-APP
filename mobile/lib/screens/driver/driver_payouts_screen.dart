// ─────────────────────────────────────────────────────────────────────────────
// driver_payouts_screen.dart — Payouts (paid settlement history).
// Lists settlements already paid to the signed-in driver, with a payout-detail
// sheet. Source of truth: public.settlements (`status == 'paid'`). Nothing is
// invented — no payout dates/amounts are shown unless present in the data.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/formatters.dart';
import '../../core/theme/home_tokens.dart';
import '../../models/settlement.dart';
import '../../providers/settlements_provider.dart';
import '../../widgets/driver/settlement_widgets.dart';

class DriverPayoutsScreen extends ConsumerWidget {
  const DriverPayoutsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(driverSettlementsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Payouts')),
      body: async.when(
        loading: () => const _LoadingBody(),
        error: (e, _) => SettlementError(
          title: "Couldn't load payouts",
          message: 'Check your connection and try again.',
          onRetry: () => ref.invalidate(driverSettlementsProvider),
        ),
        data: (_) {
          final paid = ref.watch(paidSettlementsProvider);
          final total = ref.watch(paidSettlementTotalProvider);

          if (paid.isEmpty) {
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(driverSettlementsProvider),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  SettlementEmpty(
                    icon: Icons.account_balance_wallet_outlined,
                    title: 'No payouts yet',
                    description:
                        'Paid settlements will be listed here with their payout details.',
                  ),
                ],
              ),
            );
          }

          final last = paid.first;
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(driverSettlementsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                _PayoutHero(total: total, count: paid.length, last: last),
                const SizedBox(height: 22),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Payout History',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Theme.of(context).home.textPrimary,
                        ),
                      ),
                    ),
                    Text(
                      '${paid.length}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Theme.of(context).home.textSecondary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                for (final s in paid) ...[
                  SettlementCard(
                    settlement: s,
                    onTap: () => _showDetail(context, s),
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          );
        },
      ),
    );
  }

  void _showDetail(BuildContext context, Settlement s) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (_) => _PayoutDetailSheet(settlement: s),
    );
  }
}

class _PayoutHero extends StatelessWidget {
  const _PayoutHero({
    required this.total,
    required this.count,
    required this.last,
  });

  final double total;
  final int count;
  final Settlement last;

  @override
  Widget build(BuildContext context) {
    final lastLine = last.paymentDate != null
        ? 'Last payout ${_d(last.paymentDate!)}'
        : 'Most recent period: ${settlementPeriodLabel(last)}';
    return Semantics(
      container: true,
      label:
          'Total paid. ${inr.format(total)}. '
          '$count payout${count == 1 ? '' : 's'}. $lastLine',
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF10B981), Color(0xFF07864B)],
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF07864B).withValues(alpha: 0.22),
              blurRadius: 22,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Total paid out',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              inr.format(total),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 36,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '$count payout${count == 1 ? '' : 's'} · $lastLine',
              style: const TextStyle(color: Colors.white70, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  static String _d(DateTime d) {
    final l = d.toLocal();
    return '${l.day} ${_months[l.month - 1]} ${l.year}';
  }
}

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

class _PayoutDetailSheet extends StatelessWidget {
  const _PayoutDetailSheet({required this.settlement});

  final Settlement settlement;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final s = settlement;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    settlementPeriodLabel(s),
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                SettlementStatusChip(status: s.status),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Net payout',
                        style: TextStyle(fontSize: 12, color: t.textSecondary),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        inr.format(s.netAmount),
                        style: const TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.w700,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            const Divider(height: 1),
            const SizedBox(height: 10),
            if (s.baseSalary > 0)
              _row(context, 'Base salary', inr.format(s.baseSalary)),
            if (s.paymentDate != null)
              _row(context, 'Paid on', _d(s.paymentDate!)),
            if (s.paymentMethod.isNotEmpty)
              _row(context, 'Method', s.paymentMethod),
            if (s.createdAt != null)
              _row(context, 'Generated', _d(s.createdAt!)),
            if (s.baseSalary == 0 && s.paymentDate == null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  'No further payout details available.',
                  style: TextStyle(fontSize: 13, color: t.textSecondary),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _row(BuildContext context, String label, String value) {
    final t = Theme.of(context).home;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(fontSize: 14, color: t.textSecondary),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: t.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  static String _d(DateTime d) {
    final l = d.toLocal();
    return '${l.day} ${_months[l.month - 1]} ${l.year}';
  }
}

class _LoadingBody extends StatelessWidget {
  const _LoadingBody();

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
      children: const [
        SettlementSkeleton(),
        SettlementSkeleton(),
        SettlementSkeleton(),
      ],
    );
  }
}
