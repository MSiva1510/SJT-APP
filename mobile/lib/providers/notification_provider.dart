// ─────────────────────────────────────────────────────────────────────────────
// notification_provider.dart
// Riverpod state for driver notifications.
//
// One keep-alive notifier serves BOTH the dashboard badge (unread count is
// derived from the list — no second query) and the notifications screen.
//
// Realtime: subscribed while authenticated; the channel is removed and state
// cleared on logout via [disposeSession] (called from the central auth hook
// in main.dart). If realtime is unavailable server-side, pull-to-refresh
// remains the fallback — nothing breaks.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/app_notification.dart';
import '../providers/auth_provider.dart';
import '../repositories/notification_repository.dart';
import '../services/notification_service.dart';

// ── Singleton providers ───────────────────────────────────────────────────────

final notificationRepositoryProvider = Provider<NotificationRepository>((ref) {
  return NotificationRepository(ref.watch(supabaseClientProvider));
});

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService(ref.watch(notificationRepositoryProvider));
});

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
      return NotificationsNotifier(ref.watch(notificationServiceProvider), ref);
    });

// ── Derived selector (no extra DB request) ────────────────────────────────────

final unreadCountProvider = Provider<int>((ref) {
  final s = ref.watch(notificationsProvider);
  if (s is! NotificationsLoaded) return 0;
  return s.notifications.where((n) => n.isUnread).length;
});

// ═════════════════════════════════════════════════════════════════════════════
// States
// ═════════════════════════════════════════════════════════════════════════════

sealed class NotificationsState {
  const NotificationsState();
}

class NotificationsInitial extends NotificationsState {
  const NotificationsInitial();
}

class NotificationsLoading extends NotificationsState {
  const NotificationsLoading();
}

class NotificationsRefreshing extends NotificationsState {
  final List<AppNotification> previous;
  const NotificationsRefreshing(this.previous);
}

class NotificationsLoaded extends NotificationsState {
  final List<AppNotification> notifications;
  const NotificationsLoaded(this.notifications);

  int get unreadCount => notifications.where((n) => n.isUnread).length;
}

class NotificationsEmpty extends NotificationsState {
  const NotificationsEmpty();
}

class NotificationsError extends NotificationsState {
  final String message;
  const NotificationsError(this.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// Notifier
// ═════════════════════════════════════════════════════════════════════════════

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  NotificationsNotifier(this._service, this._ref)
    : super(const NotificationsInitial());

  final NotificationService _service;
  final Ref _ref;

  Future<void> Function()? _unsubscribeRealtime;

  List<AppNotification> _currentList() {
    final s = state;
    if (s is NotificationsLoaded) return s.notifications;
    if (s is NotificationsRefreshing) return s.previous;
    return const [];
  }

  // ── Load ───────────────────────────────────────────────────────────────────

  /// Loads once when authenticated. Safe to call repeatedly — only the first
  /// call (or a retry after error) performs a network request.
  void loadIfAuthenticated() {
    if (!(state is NotificationsInitial || state is NotificationsError)) {
      return;
    }
    final profile = _ref.read(currentProfileProvider);
    if (profile == null) return;
    load();
  }

  Future<void> load({bool refreshing = false}) async {
    final userId = _ref.read(currentProfileProvider)?.id;
    if (userId == null) return;

    final prev = _currentList();
    state = (refreshing && prev.isNotEmpty)
        ? NotificationsRefreshing(prev)
        : (prev.isNotEmpty
              ? NotificationsRefreshing(prev)
              : const NotificationsLoading());

    try {
      final items = await _service.getNotifications(userId);
      state = items.isEmpty
          ? const NotificationsEmpty()
          : NotificationsLoaded(items);
      await _openRealtime(userId);
    } on NotificationException catch (e) {
      state = prev.isNotEmpty
          ? NotificationsLoaded(prev)
          : NotificationsError(e.message);
    } catch (_) {
      state = prev.isNotEmpty
          ? NotificationsLoaded(prev)
          : const NotificationsError('Could not load notifications.');
    }
  }

  Future<void> refresh() => load(refreshing: true);

  // ── Actions ────────────────────────────────────────────────────────────────

  /// Marks one notification read and updates the in-memory list optimistically
  /// with the server-returned row.
  Future<void> markRead(AppNotification n) async {
    if (n.isUnread) {
      try {
        final updated = await _service.markRead(n.id);
        _replace(updated);
      } on NotificationException {
        rethrow;
      }
    }
  }

  Future<void> markAllRead() async {
    final userId = _ref.read(currentProfileProvider)?.id;
    if (userId == null) return;

    try {
      await _service.markAllRead(userId);
      // Re-read from source of truth so statuses match the server exactly.
      await refresh();
    } on NotificationException {
      rethrow;
    }
  }

  Future<void> dismiss(AppNotification n) async {
    try {
      await _service.dismiss(n.id);
      final next = _currentList()
          .where((notification) => notification.id != n.id)
          .toList(growable: false);
      state = next.isEmpty
          ? const NotificationsEmpty()
          : NotificationsLoaded(next);
    } on NotificationException {
      rethrow;
    }
  }

  // ── Realtime wiring ────────────────────────────────────────────────────────

  Future<void> _openRealtime(String userId) async {
    // Never open twice for the same session.
    if (_unsubscribeRealtime != null) return;

    try {
      _unsubscribeRealtime = await _service.subscribe(
        userId: userId,
        onInsert: (row) {
          if (!mounted) return;
          final list = _currentList();
          if (list.any((x) => x.id == row.id)) {
            _replace(row);
          } else {
            final next = [row, ...list];
            state = next.isEmpty
                ? const NotificationsEmpty()
                : NotificationsLoaded(next);
          }
        },
        onUpdate: (row) {
          if (!mounted) return;
          _replace(row);
        },
      );
    } catch (_) {
      // Realtime unavailable — silent fallback to manual refresh.
      _unsubscribeRealtime = null;
    }
  }

  void _replace(AppNotification row) {
    final list = _currentList();
    final next = row.status == 'dismissed' || row.status == 'archived'
        ? list.where((x) => x.id != row.id).toList(growable: false)
        : list.map((x) => x.id == row.id ? row : x).toList(growable: false);
    state = next.isEmpty
        ? const NotificationsEmpty()
        : NotificationsLoaded(next);
  }

  // ── Teardown (logout / account switch) ─────────────────────────────────────

  /// Test-only: seeds a loaded list without touching the repository.
  @visibleForTesting
  void seedLoadedForTest(List<AppNotification> rows) {
    state = NotificationsLoaded(List.unmodifiable(rows));
  }

  /// Removes the realtime channel and clears all cached rows so no data can
  /// leak into another account after logout.
  Future<void> disposeSession() async {
    final close = _unsubscribeRealtime;
    _unsubscribeRealtime = null;
    if (close != null) {
      try {
        await close();
      } catch (_) {
        /* best-effort */
      }
    }
    if (mounted) state = const NotificationsInitial();
  }

  @override
  void dispose() {
    final close = _unsubscribeRealtime;
    _unsubscribeRealtime = null;
    if (close != null) {
      // Fire-and-forget: StateNotifier.dispose must not await.
      close().catchError((_) {});
    }
    super.dispose();
  }
}
