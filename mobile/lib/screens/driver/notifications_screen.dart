// ─────────────────────────────────────────────────────────────────────────────
// notifications_screen.dart
// Driver notification feed backed by the shared Web ERP `notifications` table.
//
// States: loading / empty / error / loaded, pull-to-refresh, mark-one-read,
// mark-all-read. Realtime updates arrive via NotificationsNotifier.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/app_notification.dart';
import '../../providers/notification_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(notificationsProvider.notifier).loadIfAuthenticated();
    });
  }

  Future<void> _markAll() async {
    try {
      await ref.read(notificationsProvider.notifier).markAllRead();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsProvider);
    final unread = ref.watch(unreadCountProvider);
    final messenger = ScaffoldMessenger.of(context);

    Future<void> tapNotification(AppNotification n) async {
      try {
        await ref.read(notificationsProvider.notifier).markRead(n);
      } catch (e) {
        messenger.showSnackBar(SnackBar(content: Text(e.toString())));
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton.icon(
              onPressed: _markAll,
              icon: const Icon(Icons.done_all, size: 18),
              label: const Text('Mark all read'),
            ),
        ],
      ),
      body: switch (state) {
        NotificationsInitial() ||
        NotificationsLoading() =>
          const Center(child: CircularProgressIndicator()),
        NotificationsError(:final message) => _ErrorView(
            message: message,
            onRetry: () => ref.read(notificationsProvider.notifier).load(),
          ),
        NotificationsEmpty() => _EmptyView(
            onRetry: () => ref.read(notificationsProvider.notifier).load(),
          ),
        NotificationsLoaded(:final notifications) => _NotificationList(
            notifications: notifications,
            onTap: tapNotification,
            onRefresh: () =>
                ref.read(notificationsProvider.notifier).refresh(),
          ),
        NotificationsRefreshing(:final previous) => _NotificationList(
            notifications: previous,
            refreshing: true,
            onTap: tapNotification,
            onRefresh: () =>
                ref.read(notificationsProvider.notifier).refresh(),
          ),
      },
    );
  }
}

// ── List ───────────────────────────────────────────────────────────────────────

class _NotificationList extends StatelessWidget {
  const _NotificationList({
    required this.notifications,
    required this.onTap,
    required this.onRefresh,
    this.refreshing = false,
  });

  final List<AppNotification> notifications;
  final void Function(AppNotification) onTap;
  final Future<void> Function() onRefresh;
  final bool refreshing;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: Stack(
        children: [
          ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: notifications.length,
            itemBuilder: (ctx, i) => _NotificationTile(
              notification: notifications[i],
              onTap: () => onTap(notifications[i]),
            ),
          ),
          if (refreshing)
            const Positioned(
              top: 0, left: 0, right: 0,
              child: LinearProgressIndicator(),
            ),
        ],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
  });

  final AppNotification notification;
  final VoidCallback onTap;

  static (IconData, String) _resolveIcon(AppNotification n) => (
        switch (n) {
          _ when n.isAlertLike => Icons.warning_amber_outlined,
          _ when n.isTripRelated => Icons.directions_car_outlined,
          _ when n.isBookingRelated => Icons.book_online_outlined,
          _ => Icons.info_outline,
        },
        switch (n) {
          _ when n.isAlertLike => 'alert',
          _ when n.isTripRelated => 'trip',
          _ when n.isBookingRelated => 'booking',
          _ => 'info',
        },
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = notification.isUnread;
    final (iconData, iconRoleKey) = _resolveIcon(notification);

    final accent = switch (iconRoleKey) {
      'trip' => theme.colorScheme.primary,
      'booking' => Colors.teal.shade600,
      'alert' => theme.colorScheme.error,
      _ => theme.colorScheme.secondary,
    };

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  CircleAvatar(
                    radius: 20,
                    backgroundColor:
                        accent.withValues(alpha: 0.15),
                    child: Icon(iconData, size: 20, color: accent),
                  ),
                  if (unread)
                    Positioned(
                      top: -2,
                      right: -2,
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: theme.colorScheme.surface,
                            width: 1.5,
                          ),
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
                      children: [
                        Expanded(
                          child: Text(
                            notification.title.isNotEmpty
                                ? notification.title
                                : notification.typeLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleSmall?.copyWith(
                              fontWeight:
                                  unread ? FontWeight.bold : FontWeight.w600,
                            ),
                          ),
                        ),
                        Text(
                          _timeAgo(notification.createdAt),
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    if (notification.message.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        notification.message,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _Tag(label: notification.typeLabel, color: accent),
                        if (notification.isHighPriority) ...[
                          const SizedBox(width: 6),
                          _Tag(
                            label: 'High priority',
                            color: theme.colorScheme.error,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return 'now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    if (diff.inDays < 7) return '${diff.inDays}d';
    return DateFormat('d MMM').format(dt);
  }
}

// ── Tag chip ──────────────────────────────────────────────────────────────────

class _Tag extends StatelessWidget {
  const _Tag({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return RefreshIndicator(
      onRefresh: () async => onRetry(),
      child: ListView(
        children: [
          SizedBox(
            height: MediaQuery.of(context).size.height * 0.6,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.notifications_none_rounded,
                  size: 72,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
                const SizedBox(height: 16),
                Text(
                  'No notifications yet',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Trip and booking updates will appear here.\n'
                  'Pull down to check for new ones.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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

// ── Error state ───────────────────────────────────────────────────────────────

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined,
                size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
