// ─────────────────────────────────────────────────────────────────────────────
// notification_module_test.dart
// Notification service guards + unread-count selector derivation.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/app_notification.dart';
import 'package:sri_jayam_travels_mobile/providers/notification_provider.dart';
import 'package:sri_jayam_travels_mobile/repositories/notification_repository.dart';
import 'package:sri_jayam_travels_mobile/services/notification_service.dart';

AppNotification _row(String id, {bool unread = true}) => AppNotification(
  id: id,
  userId: 'u1',
  type: 'TRIP_ASSIGNED',
  title: 'Trip Assigned',
  message: 'You have a new trip',
  status: unread ? 'unread' : 'read',
  isRead: !unread,
  createdAt: DateTime.now(),
);

class FakeNotificationRepository implements NotificationRepository {
  List<AppNotification> rows = [];
  bool allMarked = false;

  @override
  Future<List<AppNotification>> getNotifications({
    required String userId,
    int limit = 50,
  }) async => rows;

  @override
  Future<int> getUnreadCount({required String userId}) async =>
      rows.where((r) => r.isUnread).length;

  @override
  Future<AppNotification> markRead(String id) async {
    rows = rows.map((r) => r.id == id ? _row(id, unread: false) : r).toList();
    return rows.firstWhere((r) => r.id == id);
  }

  @override
  Future<void> dismiss(String id) async {
    rows = rows.where((r) => r.id != id).toList();
  }

  @override
  Future<void> markAllRead({required String userId}) async {
    allMarked = true;
    rows = rows.map((r) => _row(r.id, unread: false)).toList();
  }

  @override
  Future<Future<void> Function()> subscribeToChanges({
    required String userId,
    required void Function(AppNotification row) onInsert,
    required void Function(AppNotification row) onUpdate,
  }) async {
    return () async {};
  }

  @override
  Future<void> unsubscribe() async {}
}

void main() {
  group('service guards', () {
    test('null user is rejected', () async {
      final service = NotificationService(FakeNotificationRepository());
      await expectLater(
        service.getNotifications(null),
        throwsA(isA<NotificationException>()),
      );
    });

    test('markAllRead requires user', () async {
      final service = NotificationService(FakeNotificationRepository());
      await expectLater(
        service.markAllRead(null),
        throwsA(isA<NotificationException>()),
      );
    });
  });

  group('unread derivation (no extra query)', () {
    test('unreadCountProvider derives from loaded list', () {
      final repo = FakeNotificationRepository()
        ..rows = [_row('a'), _row('b'), _row('c', unread: false)];
      final container = ProviderContainer(
        overrides: [
          notificationServiceProvider.overrideWith(
            (ref) => NotificationService(repo),
          ),
        ],
      );
      addTearDown(container.dispose);

      // Simulate the loaded state through the notifier's public API path:
      // the selector reads whatever list state holds.
      container
          .read(notificationsProvider.notifier)
          .seedLoadedForTest(repo.rows);
      expect(container.read(unreadCountProvider), 2);
    });

    test(
      'dismissing a notification removes it from the loaded inbox',
      () async {
        final repo = FakeNotificationRepository()
          ..rows = [_row('a'), _row('b')];
        final container = ProviderContainer(
          overrides: [
            notificationServiceProvider.overrideWith(
              (ref) => NotificationService(repo),
            ),
          ],
        );
        addTearDown(container.dispose);

        container
            .read(notificationsProvider.notifier)
            .seedLoadedForTest(repo.rows);
        await container.read(notificationsProvider.notifier).dismiss(_row('a'));

        final state = container.read(notificationsProvider);
        expect(state, isA<NotificationsLoaded>());
        expect((state as NotificationsLoaded).notifications.map((n) => n.id), [
          'b',
        ]);
      },
    );
  });

  group('model helpers', () {
    test('typeLabel and flags', () {
      final trip = _row('x');
      expect(trip.isUnread, isTrue);
      expect(trip.typeLabel, 'Trip Assigned');
      expect(trip.isTripRelated, isTrue);
    });
  });
}
