// ─────────────────────────────────────────────────────────────────────────────
// manager_home_screen.dart — manager dashboard (admin / manager accounts).
// Sections: header (greeting · name · role · notifications bell) · KPI grid
// (today's trips, active, unassigned, pending approval, pending expenses,
// drivers present, today's revenue) · New booking / Add expense · documents
// expired / due (only when any) · active fleet / SOS alerts with
// Resolve + Map · upcoming trips.
//
// Data: managerDashboardProvider + managerAlertsProvider (live Supabase via
// staff RLS). Pull-to-refresh re-reads both.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters.dart';
import '../../core/theme/wireframe_theme.dart';
import '../../models/manager_directory.dart';
import '../../models/manager_models.dart';
import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/manager_provider.dart';
import '../../providers/notification_provider.dart';
import '../../widgets/driver/status_chip.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/app_logout_action.dart';
import '../../widgets/app_theme_toggle.dart';
import 'manager_add_expense_sheet.dart';
import '../../core/theme/home_tokens.dart';

String _greeting() {
  final h = DateTime.now().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/// Priority → accent colour (critical red … information grey).
Color alertColor(String priority, HomeTokens t, Brightness b) {
  final dark = b == Brightness.dark;
  return switch (priority) {
    'critical' => dark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
    'high' => dark ? const Color(0xFFFB923C) : const Color(0xFFEA580C),
    'medium' => t.warning,
    'low' => t.primary,
    _ => t.textSecondary,
  };
}

class ManagerHomeScreen extends ConsumerWidget {
  const ManagerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    final profile = ref.watch(currentProfileProvider);
    final actor = ref.watch(managerActorProvider);
    final unread = ref.watch(unreadCountProvider);
    final dashboard = ref.watch(managerDashboardProvider);
    final alerts = ref.watch(managerAlertsProvider);
    final docs = ref.watch(managerExpiringDocsProvider).valueOrNull;

    Future<void> refresh() async {
      ref.invalidate(managerDashboardProvider);
      ref.invalidate(managerAlertsProvider);
      ref.invalidate(managerExpiringDocsProvider);
      await Future.wait([
        ref.read(managerDashboardProvider.future).then((_) {}, onError: (_) {}),
        ref.read(managerAlertsProvider.future).then((_) {}, onError: (_) {}),
      ]);
    }

    void openTrips(ManagerTripFilter f) {
      ref.read(managerTripFilterProvider.notifier).state = f;
      context.go(AppRoutes.managerTrips);
    }

    return Scaffold(
      backgroundColor: t.canvas,
      body: SafeArea(
        child: RefreshIndicator(
          color: t.primary,
          onRefresh: refresh,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
            children: [
              _Header(
                greeting: _greeting(),
                name: actor.name,
                role: profile?.isAdmin == true ? 'Admin' : 'Manager',
                unread: unread,
                onNotifications: () =>
                    context.push(AppRoutes.managerNotifications),
              ),
              const SizedBox(height: 20),

              // ── Action Center ───────────────────────────────────────
              dashboard.when(
                skipLoadingOnRefresh: true,
                loading: () => const SizedBox.shrink(),
                error: (_, __) => const SizedBox.shrink(),
                data: (d) {
                  final actions = <_ActionItem>[];
                  if (d.unassigned > 0) {
                    actions.add(
                      _ActionItem(
                        icon: Icons.person_off_outlined,
                        label:
                            '${d.unassigned} unassigned trip${d.unassigned == 1 ? '' : 's'}',
                        color: alertColor(
                          'high',
                          t,
                          Theme.of(context).brightness,
                        ),
                        onTap: () => openTrips(ManagerTripFilter.unassigned),
                      ),
                    );
                  }
                  if (d.pendingApproval > 0) {
                    actions.add(
                      _ActionItem(
                        icon: Icons.hourglass_top_outlined,
                        label:
                            '${d.pendingApproval} pending approval${d.pendingApproval == 1 ? '' : 's'}',
                        color: t.warning,
                        onTap: () => openTrips(ManagerTripFilter.pending),
                      ),
                    );
                  }
                  if (d.pendingExpenses > 0) {
                    actions.add(
                      _ActionItem(
                        icon: Icons.receipt_long_outlined,
                        label:
                            '${d.pendingExpenses} expense${d.pendingExpenses == 1 ? '' : 's'} to approve',
                        color: t.warning,
                        onTap: () => context.push(AppRoutes.managerExpenses),
                      ),
                    );
                  }
                  if (docs != null) {
                    final s = summarizeExpiry(docs, directoryToday());
                    if (s.expired + s.soon > 0) {
                      actions.add(
                        _ActionItem(
                          icon: Icons.event_busy_outlined,
                          label: s.expired > 0
                              ? '${s.expired} document${s.expired == 1 ? '' : 's'} expired'
                              : '${s.soon} document${s.soon == 1 ? '' : 's'} expiring soon',
                          color: s.expired > 0
                              ? alertColor(
                                  'high',
                                  t,
                                  Theme.of(context).brightness,
                                )
                              : t.warning,
                          onTap: () => context.push(AppRoutes.managerDocuments),
                        ),
                      );
                    }
                  }
                  if (actions.isEmpty) return const SizedBox.shrink();
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      MSectionLabel('Needs action'),
                      const SizedBox(height: 10),
                      for (final a in actions) ...[
                        _ActionCenterTile(item: a),
                        const SizedBox(height: 10),
                      ],
                      const SizedBox(height: 14),
                    ],
                  );
                },
              ),

              // ── KPIs ─────────────────────────────────────────────────
              dashboard.when(
                skipLoadingOnRefresh: true,
                loading: () => const MLoading(height: 260),
                error: (e, _) => MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerDashboardProvider),
                ),
                data: (d) => _KpiGrid(
                  dashboard: d,
                  onTrips: openTrips,
                  onExpenses: () => context.push(AppRoutes.managerExpenses),
                  onAttendance: () => context.push(AppRoutes.managerAttendance),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('home-new-booking'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () =>
                          context.push(AppRoutes.managerNewBooking),
                      icon: const Icon(Icons.add_rounded, size: 20),
                      label: const Text('New booking'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const Key('home-add-expense'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      onPressed: () => showAddExpenseSheet(context, ref),
                      icon: const Icon(Icons.receipt_long_outlined, size: 20),
                      label: const Text('Add expense'),
                    ),
                  ),
                ],
              ),
              if (docs != null) ...[
                Builder(
                  builder: (context) {
                    final summary = summarizeExpiry(docs, directoryToday());
                    if (summary.expired + summary.soon == 0) {
                      return const SizedBox.shrink();
                    }
                    return _DocsDueCard(summary: summary);
                  },
                ),
                const SizedBox(height: 12),
              ],
              const SizedBox(height: 12),

              // ── Alerts ───────────────────────────────────────────────
              MSectionLabel(
                'Active alerts',
                trailing: alerts.valueOrNull?.isNotEmpty == true
                    ? MTag(
                        label: '${alerts.value!.length}',
                        color: alertColor(
                          'critical',
                          t,
                          Theme.of(context).brightness,
                        ),
                      )
                    : null,
              ),
              alerts.when(
                skipLoadingOnRefresh: true,
                loading: () => const MLoading(height: 100),
                error: (e, _) => MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerAlertsProvider),
                ),
                data: (list) => list.isEmpty
                    ? const MEmpty(
                        icon: Icons.verified_user_outlined,
                        title: 'All clear',
                        message: 'No open SOS or fleet alerts.',
                      )
                    : Column(
                        children: [
                          for (final a in list) ...[
                            _AlertCard(alert: a),
                            const SizedBox(height: 10),
                          ],
                        ],
                      ),
              ),
              const SizedBox(height: 24),

              // ── Upcoming trips ───────────────────────────────────────
              MSectionLabel(
                'Upcoming trips',
                trailing: TextButton(
                  onPressed: () => openTrips(ManagerTripFilter.upcoming),
                  child: const Text('See all'),
                ),
              ),
              dashboard.when(
                skipLoadingOnRefresh: true,
                loading: () => const MLoading(height: 100),
                error: (_, __) => const SizedBox.shrink(),
                data: (d) => d.upcoming.isEmpty
                    ? const MEmpty(
                        icon: Icons.event_available_outlined,
                        title: 'No upcoming trips',
                        message: 'New bookings will show up here.',
                      )
                    : Column(
                        children: [
                          for (final b in d.upcoming) ...[
                            ManagerTripTile(
                              booking: b,
                              onTap: () => context.push(
                                AppRoutes.managerTripDetail(b.id),
                              ),
                            ),
                            const SizedBox(height: 10),
                          ],
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Action Center ───────────────────────────────────────────────────────────

class _ActionItem {
  const _ActionItem({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
}

class _ActionCenterTile extends StatelessWidget {
  const _ActionCenterTile({required this.item});
  final _ActionItem item;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return MCard(
      onTap: item.onTap,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: item.color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(item.icon, color: item.color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              item.label,
              style: TextStyle(
                fontSize: 14.5,
                fontWeight: FontWeight.w600,
                color: t.textPrimary,
              ),
            ),
          ),
          Icon(Icons.chevron_right, color: t.textSecondary, size: 20),
        ],
      ),
    );
  }
}

// ── Documents due ────────────────────────────────────────────────────────────

/// "1 document expired · 2 due in 30 days" → Document expiry screen.
/// Hidden when nothing needs action.
class _DocsDueCard extends StatelessWidget {
  const _DocsDueCard({required this.summary});
  final ExpirySummary summary;

  @override
  Widget build(BuildContext context) {
    if (summary.expired + summary.soon == 0) return const SizedBox.shrink();
    final t = Theme.of(context).home;
    final c = expiryColor(
      summary.expired > 0 ? ExpiryState.expired : ExpiryState.soon,
      t,
      Theme.of(context).brightness,
    );
    final parts = [
      if (summary.expired > 0)
        '${summary.expired} ${summary.expired == 1 ? 'document' : 'documents'} expired',
      if (summary.soon > 0) '${summary.soon} due in $expirySoonDays days',
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: MCard(
        key: const Key('home-docs-due'),
        onTap: () => context.push(AppRoutes.managerDocuments),
        borderColor: c.withValues(alpha: 0.5),
        color: c.withValues(alpha: 0.07),
        child: Row(
          children: [
            Icon(Icons.event_busy_outlined, color: c),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    parts.join(' · '),
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: c,
                    ),
                  ),
                  Text(
                    'Insurance, FC, PUC or licence — tap to review',
                    style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: t.textSecondary),
          ],
        ),
      ),
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({
    required this.greeting,
    required this.name,
    required this.role,
    required this.unread,
    required this.onNotifications,
  });

  final String greeting;
  final String name;
  final String role;
  final int unread;
  final VoidCallback onNotifications;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      children: [
        Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            gradient: kHeroGradient,
            shape: BoxShape.circle,
          ),
          child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : 'M',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                greeting,
                style: TextStyle(
                  fontSize: 14,
                  color: t.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.3,
                  color: t.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              MTag(label: role, color: t.primary, icon: Icons.shield_outlined),
            ],
          ),
        ),
        const SizedBox(width: 8),
        const AppThemeToggle(),
        Semantics(
          button: true,
          label: unread > 0 ? 'Notifications, $unread unread' : 'Notifications',
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: onNotifications,
            child: Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: t.card,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: t.cardBorder),
              ),
              child: Badge(
                isLabelVisible: unread > 0,
                label: Text(unread > 99 ? '99+' : '$unread'),
                child: Icon(
                  Icons.notifications_outlined,
                  color: t.textPrimary,
                  size: 22,
                ),
              ),
            ),
          ),
        ),
        const AppLogoutAction(compact: true),
      ],
    );
  }
}

// ── KPI grid ─────────────────────────────────────────────────────────────────

class _Kpi {
  const _Kpi(this.label, this.value, this.icon, this.color, this.onTap);
  final String label;
  final String value;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({
    required this.dashboard,
    required this.onTrips,
    required this.onExpenses,
    required this.onAttendance,
  });

  final ManagerDashboard dashboard;
  final void Function(ManagerTripFilter) onTrips;
  final VoidCallback onExpenses;
  final VoidCallback onAttendance;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final d = dashboard;
    final danger = alertColor('high', t, Theme.of(context).brightness);
    final kpis = [
      _Kpi(
        "Today's trips",
        '${d.todayTrips}',
        Icons.today_outlined,
        t.primary,
        () => onTrips(ManagerTripFilter.today),
      ),
      _Kpi(
        'Active now',
        '${d.activeTrips}',
        Icons.near_me_outlined,
        t.success,
        () => onTrips(ManagerTripFilter.active),
      ),
      _Kpi(
        'Unassigned',
        '${d.unassigned}',
        Icons.person_off_outlined,
        d.unassigned > 0 ? danger : t.textSecondary,
        () => onTrips(ManagerTripFilter.unassigned),
      ),
      _Kpi(
        'Pending approval',
        '${d.pendingApproval}',
        Icons.hourglass_top_outlined,
        t.warning,
        () => onTrips(ManagerTripFilter.pending),
      ),
      _Kpi(
        'Pending expenses',
        '${d.pendingExpenses}',
        Icons.receipt_long_outlined,
        t.warning,
        onExpenses,
      ),
      _Kpi(
        'Drivers present',
        '${d.presentDrivers}/${d.totalDrivers}',
        Icons.badge_outlined,
        t.success,
        onAttendance,
      ),
    ];

    return Column(
      children: [
        _RevenueCard(amount: d.todayRevenue, trips: d.todayTrips),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, c) {
            const gap = 12.0;
            final w = (c.maxWidth - gap) / 2;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final k in kpis)
                  SizedBox(
                    width: w,
                    child: _KpiTile(kpi: k),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({required this.kpi});
  final _Kpi kpi;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Semantics(
      button: true,
      label: '${kpi.label}: ${kpi.value}',
      excludeSemantics: true,
      child: MCard(
        onTap: kpi.onTap,
        padding: const EdgeInsets.fromLTRB(14, 14, 12, 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: kpi.color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(kpi.icon, size: 19, color: kpi.color),
            ),
            const SizedBox(height: 12),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                kpi.value,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.5,
                  color: t.textPrimary,
                ),
              ),
            ),
            const SizedBox(height: 2),
            Text(
              kpi.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: t.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevenueCard extends StatelessWidget {
  const _RevenueCard({required this.amount, required this.trips});
  final double amount;
  final int trips;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
      decoration: BoxDecoration(
        gradient: kHeroGradient,
        borderRadius: BorderRadius.circular(t.cardRadius),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Today's revenue",
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    inr.format(amount),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Booked fare across $trips trip${trips == 1 ? '' : 's'}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.currency_rupee, color: Colors.white),
          ),
        ],
      ),
    );
  }
}

// ── Alert card ───────────────────────────────────────────────────────────────

class _AlertCard extends ConsumerStatefulWidget {
  const _AlertCard({required this.alert});
  final FleetAlert alert;

  @override
  ConsumerState<_AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends ConsumerState<_AlertCard> {
  bool _busy = false;

  Future<void> _resolve() async {
    final a = widget.alert;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Resolve alert?'),
        content: Text('“${a.title}” will be marked resolved for everyone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Resolve'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(managerRepositoryProvider).resolveAlert(a);
      ref.invalidate(managerAlertsProvider);
      if (mounted) showManagerSnack(context, 'Alert resolved');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _acknowledgeSos() async {
    final a = widget.alert;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Acknowledge SOS?'),
        content: const Text(
          'This marks the request as checked. It will close automatically '
          'at midnight IST after tomorrow.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Back'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('I have checked'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(managerRepositoryProvider).acknowledgeSosAlert(a);
      ref.invalidate(managerAlertsProvider);
      if (mounted) {
        showManagerSnack(context, 'SOS checked; it will close after tomorrow');
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openMap() async {
    final a = widget.alert;
    final uri = Uri.parse(
      'https://www.google.com/maps?q=${a.latitude},${a.longitude}',
    );
    try {
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok && mounted) {
        showManagerSnack(context, 'Could not open maps', error: true);
      }
    } catch (_) {
      if (mounted) {
        showManagerSnack(context, 'Could not open maps', error: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final a = widget.alert;
    final color = alertColor(a.priority, t, Theme.of(context).brightness);
    return MCard(
      padding: EdgeInsets.zero,
      borderColor: a.isCritical ? color.withValues(alpha: 0.5) : null,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: color),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 12, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          a.isSos ? Icons.sos : Icons.warning_amber_rounded,
                          size: 18,
                          color: color,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            a.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight: FontWeight.w700,
                              color: t.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 6),
                        MTag(label: a.priority.toUpperCase(), color: color),
                      ],
                    ),
                    if (a.description != null) ...[
                      const SizedBox(height: 6),
                      Text(
                        a.description!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 13,
                          color: t.textSecondary,
                          height: 1.3,
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text(
                      [
                        managerAgo(a.detectedAt),
                        a.isSos && a.status == 'acknowledged'
                            ? 'Checked · auto-closes after tomorrow'
                            : titleCase(a.status),
                        if (a.bookingRef != null) a.bookingRef!,
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: t.textSecondary),
                    ),
                    Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 4,
                      children: [
                        if (a.hasLocation)
                          TextButton.icon(
                            onPressed: _openMap,
                            icon: const Icon(Icons.map_outlined, size: 18),
                            label: const Text('Map'),
                          ),
                        if (a.isSos && a.status == 'acknowledged')
                          TextButton.icon(
                            onPressed: null,
                            icon: const Icon(Icons.schedule, size: 18),
                            label: const Text('Auto-close scheduled'),
                          )
                        else
                          FilledButton.tonal(
                            // Theme default is full-width (Size.fromHeight),
                            // which is unbounded inside a Row.
                            style: FilledButton.styleFrom(
                              minimumSize: const Size(0, 40),
                            ),
                            onPressed: _busy
                                ? null
                                : a.isSos
                                ? _acknowledgeSos
                                : _resolve,
                            child: _busy
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(a.isSos ? 'Check' : 'Resolve'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Trip tile (shared with the Trips tab) ────────────────────────────────────

class ManagerTripTile extends StatelessWidget {
  const ManagerTripTile({
    super.key,
    required this.booking,
    required this.onTap,
  });
  final ManagerBooking booking;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final b = booking;
    final danger = alertColor('high', t, Theme.of(context).brightness);
    return MCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  b.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: t.textSecondary,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              StatusChip(status: b.status),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            b.customerName ?? 'Customer not set',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
          const SizedBox(height: 6),
          MInfoLine(
            icon: Icons.route_outlined,
            text: '${b.pickup ?? '—'}  →  ${b.drop ?? '—'}',
          ),
          const SizedBox(height: 4),
          MInfoLine(icon: Icons.schedule_outlined, text: managerWhen(b)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: b.driverName != null || b.vehicleReg != null
                    ? MInfoLine(
                        icon: Icons.person_outline,
                        text: [
                          b.driverName,
                          b.vehicleReg,
                        ].whereType<String>().join(' · '),
                      )
                    : Align(
                        alignment: Alignment.centerLeft,
                        child: MTag(
                          label: 'Unassigned',
                          color: danger,
                          icon: Icons.person_off_outlined,
                        ),
                      ),
              ),
              if (b.totalFare != null) ...[
                const SizedBox(width: 8),
                Text(
                  inr.format(b.totalFare),
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: t.textPrimary,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
