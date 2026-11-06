// ─────────────────────────────────────────────────────────────────────────────
// driver_pending_earnings_screen.dart — Pending Earnings.
// Shows settlements awaiting payout (draft / pending / approved) for the signed
// -in driver. Source of truth: public.settlements (the authoritative payment
// state — trip_payslips carries none). Nothing is fabricated; when the driver
// has no pending settlements, a first-class empty state is shown.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/home_tokens.dart';
import '../../providers/settlements_provider.dart';
import '../../widgets/driver/settlement_widgets.dart';

class DriverPendingEarningsScreen extends ConsumerWidget {
  const DriverPendingEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(driverSettlementsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Pending Earnings')),
      body: async.when(
        loading: () => const _LoadingBody(),
        error: (e, _) => SettlementError(
          title: "Couldn't load pending earnings",
          message: 'Check your connection and try again.',
          onRetry: () => ref.invalidate(driverSettlementsProvider),
        ),
        data: (_) {
          final pending = ref.watch(pendingSettlementsProvider);
          final total = ref.watch(pendingSettlementTotalProvider);
          final approved = pending
              .where((s) => s.status == 'approved')
              .toList();
          final notApproved = pending
              .where((s) => s.status != 'approved')
              .toList();

          if (pending.isEmpty) {
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(driverSettlementsProvider),
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [
                  SizedBox(height: 120),
                  SettlementEmpty(
                    icon: Icons.schedule,
                    title: 'Nothing pending',
                    description:
                        'Settlements awaiting approval or payment will appear here.',
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(driverSettlementsProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
              children: [
                SettlementSummaryStrip(
                  label: 'Total awaiting payment',
                  amount: total,
                  accent: const Color(0xFFF59E0B),
                  icon: Icons.schedule,
                ),
                const SizedBox(height: 20),
                if (approved.isNotEmpty) ...[
                  _SectionHeader(
                    title: 'Approved — ready to pay',
                    count: approved.length,
                  ),
                  const SizedBox(height: 10),
                  for (final s in approved) ...[
                    SettlementCard(settlement: s),
                    const SizedBox(height: 12),
                  ],
                  const SizedBox(height: 8),
                ],
                if (notApproved.isNotEmpty) ...[
                  _SectionHeader(
                    title: 'Awaiting approval',
                    count: notApproved.length,
                  ),
                  const SizedBox(height: 10),
                  for (final s in notApproved) ...[
                    SettlementCard(settlement: s),
                    const SizedBox(height: 12),
                  ],
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count});

  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
        ),
        Text(
          '$count',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: t.textSecondary,
          ),
        ),
      ],
    );
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
