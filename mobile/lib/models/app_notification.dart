// ─────────────────────────────────────────────────────────────────────────────
// app_notification.dart
// Mirrors the EXISTING Web ERP `notifications` table (schema verified from
// src/services/notificationService.js). No new tables created.
//
// Verified columns (from live web usage):
//   id          UUID PK
//   user_id     UUID → profiles.id / auth.users.id   ← ONLY targeting key
//               (no driver_id / audience column exists)
//   type        TEXT  e.g. TRIP_ASSIGNED | BOOKING_CREATED | ...
//   title       TEXT
//   message     TEXT
//   icon        TEXT (nullable)
//   category    TEXT (nullable) e.g. bookings | trips
//   priority    TEXT (nullable) e.g. normal | high
//   related_id  TEXT (nullable) — generic reference (booking/trip id)
//   action_url  TEXT (nullable) — web deep link; not used by mobile routing
//   status      TEXT  'unread' | 'read' | 'archived' | 'dismissed'
//   is_read     BOOL
//   read_at     TIMESTAMPTZ (nullable)
//   archived_at TIMESTAMPTZ (nullable)
//   dismissed_at TIMESTAMPTZ (nullable)
//   created_at  TIMESTAMPTZ
//
// The driver app reads/writes ONLY rows where user_id == auth.uid().
// ─────────────────────────────────────────────────────────────────────────────

class AppNotification {
  final String id;
  final String userId;
  final String type;
  final String title;
  final String message;
  final String? icon;
  final String? category;
  final String? priority;
  final String? relatedId;
  final String? actionUrl;

  /// 'unread' | 'read' | 'archived' | 'dismissed'
  final String status;
  final bool isRead;
  final DateTime? readAt;
  final DateTime createdAt;

  const AppNotification({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.message,
    this.icon,
    this.category,
    this.priority,
    this.relatedId,
    this.actionUrl,
    required this.status,
    required this.isRead,
    this.readAt,
    required this.createdAt,
  });

  /// Columns requested from Supabase.
  static const String selectColumns =
      'id, user_id, type, title, message, icon, category, priority, '
      'related_id, action_url, status, is_read, read_at, created_at';

  factory AppNotification.fromMap(Map<String, dynamic> m) {
    return AppNotification(
      id: m['id']?.toString() ?? '',
      userId: m['user_id']?.toString() ?? '',
      type: m['type']?.toString() ?? '',
      title: m['title']?.toString() ?? '',
      message: m['message']?.toString() ?? '',
      icon: m['icon']?.toString(),
      category: m['category']?.toString(),
      priority: m['priority']?.toString(),
      relatedId: m['related_id']?.toString(),
      actionUrl: m['action_url']?.toString(),
      status: m['status']?.toString() ?? 'unread',
      isRead: m['is_read'] == true ||
          m['status']?.toString() == 'read',
      readAt: _dt(m['read_at']),
      createdAt:
          _dt(m['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  // ── Computed helpers ──────────────────────────────────────────────────────

  bool get isUnread => !isRead && status == 'unread';

  bool get isHighPriority => priority == 'high' || priority == 'urgent';

  /// Human-readable label for the notification type.
  String get typeLabel => switch (type.toUpperCase()) {
        'TRIP_ASSIGNED' => 'Trip Assigned',
        'TRIP_STARTED' => 'Trip Started',
        'TRIP_COMPLETED' => 'Trip Completed',
        'BOOKING_CREATED' => 'New Booking',
        'BOOKING_APPROVED' => 'Booking Approved',
        'BOOKING_CANCELLED' => 'Booking Cancelled',
        'EXPENSE_ADDED' => 'Expense Added',
        _ => type
            .toLowerCase()
            .split('_')
            .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
            .join(' '),
      };

  bool get isTripRelated => type.toLowerCase().contains('trip');
  bool get isBookingRelated => type.toLowerCase().contains('booking');
  bool get isAlertLike {
    final t = type.toLowerCase();
    return t.contains('alert') || t.contains('warning') || t.contains('urgent');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  static DateTime? _dt(dynamic v) =>
      v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

  @override
  bool operator ==(Object other) =>
      other is AppNotification && other.id == id;

  @override
  int get hashCode => id.hashCode;

  @override
  String toString() => 'AppNotification($id, $type, $status)';
}
