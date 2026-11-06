// ─────────────────────────────────────────────────────────────────────────────
// manager_notifications_screen.dart — the manager's inbox.
// Same data as the driver screen (notificationsProvider: the signed-in user's
// own rows, realtime + pull-to-refresh), laid out for the office: a summary
// strip, All / Unread / Urgent filters, Today / Yesterday / This week /
// Earlier groups, tone by type (error · warning · success · info) and a
// one-tap route to whatever the notification is about.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/app_notification.dart';
import '../../navigation/app_router.dart';
import '../../providers/notification_provider.dart';
import '../../repositories/manager_repository.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../../core/theme/home_tokens.dart';

enum _Filter { all, unread, urgent }

/// Urgent = flagged urgent/high, or an error-type row (SOS, breakdown…).
bool isUrgentNotification(AppNotification n) =>
    n.isHighPriority || n.type.toLowerCase() == 'error';

bool isSosNotification(AppNotification n) =>
    '${n.type} ${n.title} ${n.message}'.toLowerCase().contains('sos');

/// "Location 12.34567, 79.12345" inside a message → (lat, lng).
(double, double)? notificationCoords(String message) {
  final m = RegExp(
    r'(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)',
  ).firstMatch(message);
  if (m == null) return null;
  final lat = double.tryParse(m.group(1)!);
  final lng = double.tryParse(m.group(2)!);
  if (lat == null || lng == null) return null;
  return (lat, lng);
}

/// Bucket label for the list sections.
String notificationGroup(DateTime at, {DateTime? now}) {
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(at.year, at.month, at.day);
  final diff = today.difference(day).inDays;
  if (diff <= 0) return 'Today';
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
}

/// Where tapping a notification should take the manager, or null to stay.
String? managerNotificationTarget(AppNotification n) {
  final cat = (n.category ?? '').toLowerCase();
  final type = n.type.toLowerCase();
  if (cat == 'fleet' || type.contains('alert') || type.contains('sos')) {
    // Open alerts (with Resolve) live on Home; plain fleet info → map.
    return isUrgentNotification(n)
        ? AppRoutes.managerHome
        : AppRoutes.managerFleet;
  }
  if ((cat == 'bookings' ||
          cat == 'trips' ||
          n.isBookingRelated ||
          n.isTripRelated) &&
      (n.relatedId ?? '').isNotEmpty) {
    return AppRoutes.managerTripDetail(n.relatedId!);
  }
  if (cat.contains('expense') || type.contains('expense')) {
    return AppRoutes.managerExpenses;
  }
  if (cat.contains('attendance') || type.contains('attendance')) {
    return AppRoutes.managerAttendance;
  }
  return null;
}

class ManagerNotificationsScreen extends ConsumerStatefulWidget {
  const ManagerNotificationsScreen({super.key});

  @override
  ConsumerState<ManagerNotificationsScreen> createState() =>
      _ManagerNotificationsScreenState();
}

class _ManagerNotificationsScreenState
    extends ConsumerState<ManagerNotificationsScreen> {
  _Filter _filter = _Filter.all;
  bool _markingAll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        ref.read(notificationsProvider.notifier).loadIfAuthenticated();
      }
    });
  }

  Future<void> _markAll() async {
    setState(() => _markingAll = true);
    try {
      await ref.read(notificationsProvider.notifier).markAllRead();
      if (mounted) showManagerSnack(context, 'All caught up');
    } catch (_) {
      if (mounted) {
        showManagerSnack(context, 'Could not mark as read', error: true);
      }
    } finally {
      if (mounted) setState(() => _markingAll = false);
    }
  }

  Future<void> _dismissSos(AppNotification n) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Dismiss SOS notification?'),
        content: const Text(
          'This removes the SOS notification from the inbox for your account.',
        ),
        actions: [
          OutlinedButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(dialogContext).colorScheme.error,
              foregroundColor: Theme.of(dialogContext).colorScheme.onError,
            ),
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await ref.read(notificationsProvider.notifier).dismiss(n);
      if (mounted) showManagerSnack(context, 'SOS notification dismissed');
    } catch (_) {
      if (mounted) {
        showManagerSnack(
          context,
          'Could not dismiss SOS notification',
          error: true,
        );
      }
    }
  }

  Future<void> _open(AppNotification n) async {
    // Mark read first (best-effort), then follow the link.
    try {
      await ref.read(notificationsProvider.notifier).markRead(n);
    } catch (_) {
      /* stays unread; navigation still useful */
    }
    if (!mounted) return;
    final target = managerNotificationTarget(n);
    if (target == null) return;
    if (target == AppRoutes.managerHome || target == AppRoutes.managerFleet) {
      context.go(target);
    } else {
      context.push(target);
    }
  }

  Future<void> _openMap((double, double) c) async {
    final uri = Uri.parse(
      'https://www.google.com/maps/search/?api=1&query=${c.$1},${c.$2}',
    );
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && mounted) {
      showManagerSnack(context, 'Could not open maps', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final state = ref.watch(notificationsProvider);
    final all = switch (state) {
      NotificationsLoaded(:final notifications) => notifications,
      NotificationsRefreshing(:final previous) => previous,
      _ => const <AppNotification>[],
    };
    final unread = all.where((n) => n.isUnread).length;
    final urgent = all.where((n) => n.isUnread && isUrgentNotification(n));

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton.icon(
              onPressed: _markingAll ? null : _markAll,
              icon: _markingAll
                  ? const SizedBox(
                      width: 14,
                      height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.done_all_rounded, size: 18),
              label: const Text('Mark all read'),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () => ref.read(notificationsProvider.notifier).refresh(),
        child: switch (state) {
          NotificationsInitial() || NotificationsLoading() => ListView(
            children: const [MLoading(height: 260)],
          ),
          NotificationsError(:final message) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: [
              MError(
                error: ManagerException(message),
                onRetry: () =>
                    ref.read(notificationsProvider.notifier).refresh(),
              ),
            ],
          ),
          _ => _buildList(context, all, unread, urgent.length),
        },
      ),
    );
  }

  Widget _buildList(
    BuildContext context,
    List<AppNotification> all,
    int unread,
    int urgentUnread,
  ) {
    final urgentCount = all.where(isUrgentNotification).length;
    final shown = switch (_filter) {
      _Filter.all => all,
      _Filter.unread => all.where((n) => n.isUnread).toList(),
      _Filter.urgent => all.where(isUrgentNotification).toList(),
    }..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    // Keep newest-first order while grouping.
    final groups = <String, List<AppNotification>>{};
    for (final n in shown) {
      groups.putIfAbsent(notificationGroup(n.createdAt), () => []).add(n);
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
      children: [
        _SummaryStrip(unread: unread, urgentUnread: urgentUnread),
        const SizedBox(height: 14),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              _chip('All', all.length, _Filter.all),
              const SizedBox(width: 8),
              _chip('Unread', unread, _Filter.unread),
              const SizedBox(width: 8),
              _chip('Urgent', urgentCount, _Filter.urgent),
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (shown.isEmpty)
          MEmpty(
            icon: Icons.notifications_none_rounded,
            title: switch (_filter) {
              _Filter.all => 'No notifications yet',
              _Filter.unread => "You're all caught up",
              _Filter.urgent => 'No urgent alerts',
            },
            message: 'SOS alerts, trip and expense updates will show here.',
          )
        else
          for (final entry in groups.entries) ...[
            MSectionLabel(
              entry.key,
              trailing: Text(
                '${entry.value.length}',
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: Theme.of(context).home.textSecondary,
                ),
              ),
            ),
            for (final n in entry.value) ...[
              _NotificationCard(
                n: n,
                onTap: () => _open(n),
                onDismiss: isSosNotification(n) ? () => _dismissSos(n) : null,
                onMap: notificationCoords(n.message) == null
                    ? null
                    : () => _openMap(notificationCoords(n.message)!),
              ),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Widget _chip(String label, int count, _Filter f) {
    return ChoiceChip(
      label: Text('$label · $count'),
      selected: _filter == f,
      showCheckmark: false,
      onSelected: (_) => setState(() => _filter = f),
    );
  }
}

// ── Summary strip ────────────────────────────────────────────────────────────

class _SummaryStrip extends StatelessWidget {
  const _SummaryStrip({required this.unread, required this.urgentUnread});
  final int unread;
  final int urgentUnread;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final danger = Theme.of(context).colorScheme.error;
    final (
      Color tone,
      IconData icon,
      String title,
      String sub,
    ) = urgentUnread > 0
        ? (
            danger,
            Icons.sos_rounded,
            '$urgentUnread urgent alert${urgentUnread == 1 ? '' : 's'}',
            'Needs attention now — tap to open',
          )
        : unread > 0
        ? (
            t.primary,
            Icons.mark_email_unread_outlined,
            '$unread unread',
            'Tap a notification to open it',
          )
        : (
            t.success,
            Icons.check_circle_outline_rounded,
            "You're all caught up",
            'New alerts arrive here instantly',
          );

    return MCard(
      color: tone.withValues(alpha: 0.07),
      borderColor: tone.withValues(alpha: 0.25),
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: tone, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  sub,
                  style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Card ─────────────────────────────────────────────────────────────────────

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.n,
    required this.onTap,
    this.onMap,
    this.onDismiss,
  });

  final AppNotification n;
  final VoidCallback onTap;
  final VoidCallback? onMap;
  final VoidCallback? onDismiss;

  (Color, IconData) _look(BuildContext context) {
    final t = Theme.of(context).home;
    final cat = (n.category ?? '').toLowerCase();
    final tone = switch (n.type.toLowerCase()) {
      'error' => Theme.of(context).colorScheme.error,
      'warning' => t.warning,
      'success' => t.success,
      _ => t.primary,
    };
    final icon = switch (cat) {
      'fleet' when isUrgentNotification(n) => Icons.sos_rounded,
      'fleet' => Icons.local_shipping_outlined,
      'bookings' => Icons.event_note_outlined,
      'trips' => Icons.route_outlined,
      'expenses' => Icons.receipt_long_outlined,
      'attendance' => Icons.badge_outlined,
      _ => Icons.notifications_none_rounded,
    };
    return (tone, icon);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final (tone, icon) = _look(context);
    final unread = n.isUnread;
    final urgent = isUrgentNotification(n);
    final hasLink = managerNotificationTarget(n) != null;

    return MCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
      color: unread ? tone.withValues(alpha: 0.05) : null,
      borderColor: unread ? tone.withValues(alpha: 0.35) : null,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: tone.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: tone, size: 22),
              ),
              if (unread)
                Positioned(
                  right: -2,
                  top: -2,
                  child: Container(
                    width: 11,
                    height: 11,
                    decoration: BoxDecoration(
                      color: tone,
                      shape: BoxShape.circle,
                      border: Border.all(color: t.card, width: 2),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        n.title.isEmpty ? n.typeLabel : n.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 14.5,
                          fontWeight: unread
                              ? FontWeight.w800
                              : FontWeight.w600,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      _when(n.createdAt),
                      style: TextStyle(fontSize: 11.5, color: t.textSecondary),
                    ),
                    if (onDismiss != null)
                      IconButton(
                        tooltip: 'Dismiss SOS notification',
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints.tightFor(
                          width: 32,
                          height: 32,
                        ),
                        onPressed: onDismiss,
                        icon: const Icon(Icons.delete_outline, size: 19),
                      ),
                  ],
                ),
                if (n.message.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    n.message,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: t.textSecondary,
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  children: [
                    if (urgent) ...[
                      MTag(
                        label: 'Urgent',
                        color: Theme.of(context).colorScheme.error,
                        icon: Icons.priority_high_rounded,
                      ),
                      const SizedBox(width: 6),
                    ],
                    if ((n.category ?? '').isNotEmpty)
                      Flexible(
                        child: MTag(
                          label: titleCase(n.category),
                          color: t.textSecondary,
                        ),
                      ),
                    const Spacer(),
                    if (onMap != null)
                      _LinkButton(
                        icon: Icons.map_outlined,
                        label: 'Map',
                        onTap: onMap!,
                      ),
                    if (hasLink) ...[
                      const SizedBox(width: 4),
                      _LinkButton(
                        icon: Icons.arrow_forward_rounded,
                        label: 'Open',
                        onTap: onTap,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _when(DateTime at) {
    final d = DateTime.now().difference(at);
    if (d.inHours < 24) return managerAgo(at);
    return DateFormat('d MMM, h:mm a').format(at);
  }
}

class _LinkButton extends StatelessWidget {
  const _LinkButton({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: t.primary),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: t.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
