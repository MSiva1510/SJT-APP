// ─────────────────────────────────────────────────────────────────────────────
// manager_expenses_screen.dart — pending driver expenses for approval.
// Approve or reject (optional reason) each claim; the receipt opens in the
// browser. Writes via ManagerRepository.decideExpense (guarded on
// status = pending, so a claim already decided on the web is left alone).
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters.dart';
import 'package:flutter_slidable/flutter_slidable.dart';
import '../../models/manager_models.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/manager_ui.dart';
import 'manager_add_expense_sheet.dart';
import '../../../core/theme/home_tokens.dart';

class ManagerExpensesScreen extends ConsumerStatefulWidget {
  const ManagerExpensesScreen({super.key});

  @override
  ConsumerState<ManagerExpensesScreen> createState() =>
      _ManagerExpensesScreenState();
}

class _ManagerExpensesScreenState extends ConsumerState<ManagerExpensesScreen> {
  final _busy = <String>{};

  Future<void> _refresh() async {
    ref.invalidate(managerPendingExpensesProvider);
    try {
      await ref.read(managerPendingExpensesProvider.future);
    } catch (_) {
      /* error state renders */
    }
  }

  Future<void> _decide(PendingExpense e, {required bool approve}) async {
    String? reason;
    if (!approve) {
      reason = await promptManagerText(
        context,
        title: 'Reject expense?',
        confirmLabel: 'Reject',
        hint: 'Reason (optional)',
        destructive: true,
      );
      if (reason == null || !mounted) return;
    }
    setState(() => _busy.add(e.id));
    try {
      await ref
          .read(managerRepositoryProvider)
          .decideExpense(
            expense: e,
            approve: approve,
            actorName: ref.read(managerActorProvider).name,
            reason: reason,
          );
      ref.invalidate(managerPendingExpensesProvider);
      ref.invalidate(managerDashboardProvider);
      if (mounted) {
        showManagerSnack(
          context,
          approve ? 'Expense approved' : 'Expense rejected',
        );
      }
    } catch (err) {
      if (mounted) {
        showManagerSnack(context, managerErrorText(err), error: true);
      }
    } finally {
      if (mounted) setState(() => _busy.remove(e.id));
    }
  }

  Future<void> _openReceipt(String url) async {
    try {
      final ok = await launchUrl(
        Uri.parse(url),
        mode: LaunchMode.externalApplication,
      );
      if (!ok && mounted) {
        showManagerSnack(context, 'Could not open the receipt', error: true);
      }
    } catch (_) {
      if (mounted) {
        showManagerSnack(context, 'Could not open the receipt', error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerPendingExpensesProvider);

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Expense approvals'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('expenses-add'),
        onPressed: () => showAddExpenseSheet(context, ref),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add expense'),
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: _refresh,
        child: async.when(
          skipLoadingOnRefresh: true,
          loading: () => ListView(children: const [MLoading(height: 260)]),
          error: (e, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: [
              MError(
                error: e,
                onRetry: () => ref.invalidate(managerPendingExpensesProvider),
              ),
            ],
          ),
          data: (list) {
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(20),
                children: const [
                  MEmpty(
                    icon: Icons.task_alt_outlined,
                    title: 'Nothing to approve',
                    message: 'New driver expense claims will appear here.',
                  ),
                ],
              );
            }
            final total = list.fold<double>(0, (s, e) => s + e.amount);
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 96),
              children: [
                Text(
                  '${list.length} pending · ${inr.format(total)}',
                  style: TextStyle(fontSize: 13.5, color: t.textSecondary),
                ),
                const SizedBox(height: 12),
                for (final e in list) ...[
                  Slidable(
                    key: ValueKey(e.id),
                    endActionPane: ActionPane(
                      motion: const StretchMotion(),
                      extentRatio: 0.5,
                      children: [
                        SlidableAction(
                          onPressed: (_) => _decide(e, approve: true),
                          backgroundColor: const Color(0xFF22C55E),
                          foregroundColor: Colors.white,
                          icon: Icons.check,
                          label: 'Approve',
                        ),
                        SlidableAction(
                          onPressed: (_) => _decide(e, approve: false),
                          backgroundColor: const Color(0xFFEF4444),
                          foregroundColor: Colors.white,
                          icon: Icons.close,
                          label: 'Reject',
                        ),
                      ],
                    ),
                    child: _ExpenseCard(
                      expense: e,
                      busy: _busy.contains(e.id),
                      onApprove: () => _decide(e, approve: true),
                      onReject: () => _decide(e, approve: false),
                      onReceipt: e.receiptUrl == null
                          ? null
                          : () => _openReceipt(e.receiptUrl!),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}

class _ExpenseCard extends StatelessWidget {
  const _ExpenseCard({
    required this.expense,
    required this.busy,
    required this.onApprove,
    required this.onReject,
    this.onReceipt,
  });

  final PendingExpense expense;
  final bool busy;
  final VoidCallback onApprove;
  final VoidCallback onReject;
  final VoidCallback? onReceipt;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final e = expense;
    final error = Theme.of(context).colorScheme.error;
    final who = [e.driverName, e.vehicleReg].whereType<String>().join(' · ');
    return MCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      e.expenseType == null
                          ? 'Expense'
                          : titleCase(e.expenseType),
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: t.textPrimary,
                      ),
                    ),
                    if (e.expenseNo != null)
                      Text(
                        e.expenseNo!,
                        style: TextStyle(fontSize: 12, color: t.textSecondary),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                inr.format(e.amount),
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: t.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (who.isNotEmpty) MInfoLine(icon: Icons.person_outline, text: who),
          if (e.expenseDate != null) ...[
            const SizedBox(height: 4),
            MInfoLine(
              icon: Icons.event_outlined,
              text: DateFormat('EEE, d MMM yyyy').format(e.expenseDate!),
            ),
          ],
          if (e.tripRef != null) ...[
            const SizedBox(height: 4),
            MInfoLine(icon: Icons.route_outlined, text: 'Trip ${e.tripRef}'),
          ],
          if (e.description != null) ...[
            const SizedBox(height: 8),
            Text(
              e.description!,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 13.5,
                color: t.textPrimary,
                height: 1.35,
              ),
            ),
          ],
          if (onReceipt != null)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: onReceipt,
                icon: const Icon(Icons.receipt_outlined, size: 18),
                label: const Text('View receipt'),
              ),
            )
          else
            const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: error,
                    side: BorderSide(color: error.withValues(alpha: 0.5)),
                  ),
                  onPressed: busy ? null : onReject,
                  child: const Text('Reject'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton(
                  onPressed: busy ? null : onApprove,
                  child: busy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Approve'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
