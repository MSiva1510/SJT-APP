// ─────────────────────────────────────────────────────────────────────────────
// notification_repository.dart
// Supabase data layer for notifications against the EXISTING Web ERP
// `notifications` table. No new tables.
//
// Access rule: every query filters user_id == auth.uid() — the same key the
// web ERP uses (src/services/notificationService.js). RLS is enforced
// server-side; this repository never queries other users' rows.
//
// Realtime: single channel subscribed to public.notifications filtered by
// user_id. The Flutter app is the first realtime consumer of this table —
// the web ERP polls via an in-memory event bus instead.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import '../core/config/supabase_config.dart';
import '../models/app_notification.dart';

class NotificationRepository {
  NotificationRepository(this._client);

  final SupabaseClient _client;

  static const String _table = SupabaseConfig.notificationsTable;
  RealtimeChannel? _channel;

  // ── Read ───────────────────────────────────────────────────────────────────

  /// Newest notifications for [userId], excluding archived/dismissed rows.
  Future<List<AppNotification>> getNotifications({
    required String userId,
    int limit = 50,
  }) async {
    final data = await _client
        .from(_table)
        .select(AppNotification.selectColumns)
        .eq('user_id', userId)
        .inFilter('status', ['unread', 'read'])
        .order('created_at', ascending: false)
        .limit(limit);

    return (data as List)
        .whereType<Map<String, dynamic>>()
        .map(AppNotification.fromMap)
        .toList(growable: false);
  }

  /// Cheap unread count (no payload) for badges.
  Future<int> getUnreadCount({required String userId}) async {
    final data = await _client
        .from(_table)
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'unread');
    return (data as List).length;
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /// Marks one row read: status + is_read + read_at, exactly like the web.
  Future<AppNotification> markRead(String id) async {
    final data = await _client
        .from(_table)
        .update({
          'is_read': true,
          'status': 'read',
          'read_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', id)
        .select(AppNotification.selectColumns)
        .single();
    return AppNotification.fromMap(data);
  }

  /// Dismisses one notification from the inbox without deleting its record.
  Future<void> dismiss(String id) async {
    await _client
        .from(_table)
        .update({
          'is_read': true,
          'status': 'dismissed',
          'dismissed_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('id', id);
  }

  /// Marks every unread row of [userId] read.
  Future<void> markAllRead({required String userId}) async {
    await _client
        .from(_table)
        .update({
          'is_read': true,
          'status': 'read',
          'read_at': DateTime.now().toUtc().toIso8601String(),
        })
        .eq('user_id', userId)
        .eq('status', 'unread');
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  /// Subscribes to INSERT/UPDATE events for this user's rows.
  /// Returns the cancel function used at logout/dispose.
  ///
  /// If realtime is not enabled for the table server-side the subscription
  /// simply never fires — pull-to-refresh remains the fallback path.
  Future<Future<void> Function()> subscribeToChanges({
    required String userId,
    required void Function(AppNotification row) onInsert,
    required void Function(AppNotification row) onUpdate,
  }) async {
    await unsubscribe();

    final channel = _client.channel('driver-notifications-$userId');

    channel.onPostgresChanges(
      event: PostgresChangeEvent.insert,
      schema: 'public',
      table: _table,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: userId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        if (row.isNotEmpty) onInsert(AppNotification.fromMap(row));
      },
    );

    channel.onPostgresChanges(
      event: PostgresChangeEvent.update,
      schema: 'public',
      table: _table,
      filter: PostgresChangeFilter(
        type: PostgresChangeFilterType.eq,
        column: 'user_id',
        value: userId,
      ),
      callback: (payload) {
        final row = payload.newRecord;
        if (row.isNotEmpty) onUpdate(AppNotification.fromMap(row));
      },
    );

    channel.subscribe();
    _channel = channel;

    return unsubscribe;
  }

  /// Removes the realtime channel (idempotent).
  Future<void> unsubscribe() async {
    final ch = _channel;
    _channel = null;
    if (ch != null) {
      try {
        await _client.removeChannel(ch);
      } catch (_) {
        // Channel cleanup is best-effort; never blocks logout.
      }
    }
  }
}
