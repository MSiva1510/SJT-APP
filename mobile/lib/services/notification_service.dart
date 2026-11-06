// ─────────────────────────────────────────────────────────────────────────────
// notification_service.dart
// Business logic between NotificationProvider and NotificationRepository.
// No UI code, no Supabase imports. Validates the user context before every
// query and maps low-level errors to friendly messages.
// ─────────────────────────────────────────────────────────────────────────────

import '../core/demo/demo_session.dart';
import '../models/app_notification.dart';
import '../repositories/notification_repository.dart';

class NotificationService {
  NotificationService(this._repo);

  final NotificationRepository _repo;

  // ── Queries ────────────────────────────────────────────────────────────────

  Future<List<AppNotification>> getNotifications(String? userId) async {
    _requireUser(userId);
    if (DemoSession.active) return DemoSession.notifications;
    try {
      return await _repo.getNotifications(userId: userId!);
    } catch (e) {
      throw _map(e);
    }
  }

  Future<int> getUnreadCount(String? userId) async {
    _requireUser(userId);
    if (DemoSession.active) {
      return DemoSession.notifications.where((n) => n.isUnread).length;
    }
    try {
      return await _repo.getUnreadCount(userId: userId!);
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<AppNotification> markRead(String id) async {
    if (DemoSession.active) {
      DemoSession.markNotificationRead(id);
      final updated = DemoSession.notifications.where((n) => n.id == id).single;
      return updated;
    }
    try {
      return await _repo.markRead(id);
    } catch (e) {
      throw _map(e);
    }
  }

  Future<void> dismiss(String id) async {
    if (DemoSession.active) {
      DemoSession.dismissNotification(id);
      return;
    }
    try {
      await _repo.dismiss(id);
    } catch (e) {
      throw _map(e);
    }
  }

  Future<void> markAllRead(String? userId) async {
    _requireUser(userId);
    if (DemoSession.active) {
      DemoSession.markAllNotificationsRead();
      return;
    }
    try {
      await _repo.markAllRead(userId: userId!);
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  /// Opens the realtime channel for [userId]. Returns a cancel function.
  Future<Future<void> Function()> subscribe({
    required String? userId,
    required void Function(AppNotification row) onInsert,
    required void Function(AppNotification row) onUpdate,
  }) async {
    _requireUser(userId);
    if (DemoSession.active) return () async {};
    return _repo.subscribeToChanges(
      userId: userId!,
      onInsert: onInsert,
      onUpdate: onUpdate,
    );
  }

  // ── Guards & error mapping ─────────────────────────────────────────────────

  void _requireUser(String? userId) {
    if (userId == null || userId.isEmpty) {
      throw const NotificationException(
        'Session not ready. Please log in again.',
        code: NotificationErrorCode.unauthenticated,
      );
    }
  }

  NotificationException _map(Object e) {
    if (e is NotificationException) return e;
    final msg = e.toString().toLowerCase();

    if (msg.contains('network') ||
        msg.contains('socket') ||
        msg.contains('connection') ||
        msg.contains('timeout')) {
      return const NotificationException(
        'No internet connection. Pull down to retry.',
        code: NotificationErrorCode.network,
      );
    }
    if (msg.contains('jwt') ||
        msg.contains('expired') ||
        msg.contains('session')) {
      return const NotificationException(
        'Your session has expired. Please log in again.',
        code: NotificationErrorCode.sessionExpired,
      );
    }
    if (msg.contains('permission') ||
        msg.contains('rls') ||
        msg.contains('policy')) {
      return const NotificationException(
        'Access denied. Contact your administrator.',
        code: NotificationErrorCode.unauthorized,
      );
    }
    return const NotificationException(
      'Could not load notifications. Please try again.',
      code: NotificationErrorCode.unknown,
    );
  }
}

// ── Exception ─────────────────────────────────────────────────────────────────

class NotificationException implements Exception {
  const NotificationException(this.message, {this.code});
  final String message;
  final NotificationErrorCode? code;

  @override
  String toString() => message;
}

enum NotificationErrorCode {
  unauthenticated,
  network,
  sessionExpired,
  unauthorized,
  unknown,
}
