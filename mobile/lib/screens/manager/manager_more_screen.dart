// ─────────────────────────────────────────────────────────────────────────────
// manager_more_screen.dart — "More" tab for the manager: profile header,
// links to expense approvals, attendance, notifications, document expiry,
// vehicles, drivers and customers.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/wireframe_theme.dart';
import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/manager_provider.dart';
import '../../providers/notification_provider.dart';
import '../../models/manager_directory.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/app_logout_action.dart';
import '../../../core/theme/home_tokens.dart';

class ManagerMoreScreen extends ConsumerWidget {
  const ManagerMoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    final profile = ref.watch(currentProfileProvider);
    final actor = ref.watch(managerActorProvider);
    final unread = ref.watch(unreadCountProvider);
    final pendingExpenses =
        ref.watch(managerDashboardProvider).valueOrNull?.pendingExpenses ?? 0;
    final docs = ref.watch(managerExpiringDocsProvider).valueOrNull;
    final docsDue = docs == null
        ? 0
        : (() {
            final s = summarizeExpiry(docs, directoryToday());
            return s.expired + s.soon;
          })();

    return Scaffold(
      backgroundColor: t.canvas,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          children: [
            const MScreenTitle('More'),
            const SizedBox(height: 16),

            // ── Profile ──────────────────────────────────────────────────
            MCard(
              child: Row(
                children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      gradient: kHeroGradient,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      profile?.initials ?? 'M',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
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
                          actor.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                        if (profile?.email.isNotEmpty == true)
                          Text(
                            profile!.email,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 13,
                              color: t.textSecondary,
                            ),
                          ),
                        const SizedBox(height: 6),
                        MTag(
                          label: profile?.isAdmin == true ? 'Admin' : 'Manager',
                          color: t.primary,
                          icon: Icons.shield_outlined,
                        ),
                      ],
                    ),
                  ),
                  const AppLogoutAction(compact: true),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // ── Manage ───────────────────────────────────────────────────
            const MSectionLabel('Manage'),
            MCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _LinkTile(
                    icon: Icons.receipt_long_outlined,
                    title: 'Expense approvals',
                    badge: pendingExpenses,
                    onTap: () => context.push(AppRoutes.managerExpenses),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    icon: Icons.fact_check_outlined,
                    title: 'Driver attendance',
                    onTap: () => context.push(AppRoutes.managerAttendance),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    key: const Key('more-invoices'),
                    icon: Icons.request_quote_outlined,
                    title: 'Invoices',
                    onTap: () => context.push(AppRoutes.managerInvoices),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    key: const Key('more-reports'),
                    icon: Icons.analytics_outlined,
                    title: 'Reports & analytics',
                    onTap: () => context.push(AppRoutes.managerReports),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    icon: Icons.notifications_outlined,
                    title: 'Notifications',
                    badge: unread,
                    onTap: () => context.push(AppRoutes.managerNotifications),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // ── Directory (read-only views of the web ERP lists) ────────
            const MSectionLabel('Fleet & people'),
            MCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  _LinkTile(
                    key: const Key('more-documents'),
                    icon: Icons.event_busy_outlined,
                    title: 'Document expiry',
                    badge: docsDue,
                    onTap: () => context.push(AppRoutes.managerDocuments),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    key: const Key('more-vehicles'),
                    icon: Icons.directions_car_outlined,
                    title: 'Vehicles',
                    onTap: () => context.push(AppRoutes.managerVehicles),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    key: const Key('more-drivers'),
                    icon: Icons.badge_outlined,
                    title: 'Drivers',
                    onTap: () => context.push(AppRoutes.managerDrivers),
                  ),
                  Divider(height: 1, color: t.cardBorder),
                  _LinkTile(
                    key: const Key('more-customers'),
                    icon: Icons.people_outline,
                    title: 'Customers',
                    onTap: () => context.push(AppRoutes.managerCustomers),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.badge = 0,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final int badge;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return ListTile(
      onTap: onTap,
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: t.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 19, color: t.primary),
      ),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w600,
          color: t.textPrimary,
        ),
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (badge > 0) Badge(label: Text(badge > 99 ? '99+' : '$badge')),
          const SizedBox(width: 6),
          Icon(Icons.chevron_right, color: t.textSecondary),
        ],
      ),
    );
  }
}
