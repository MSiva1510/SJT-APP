// Manager inbox helpers: grouping, urgency, coordinates and tap targets.

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/app_notification.dart';
import 'package:sri_jayam_travels_mobile/navigation/app_router.dart';
import 'package:sri_jayam_travels_mobile/screens/manager/manager_notifications_screen.dart';

AppNotification _n({
  String type = 'info',
  String? category,
  String? priority,
  String? relatedId,
  String message = '',
}) => AppNotification(
  id: 'n1',
  userId: 'u1',
  type: type,
  title: 'T',
  message: message,
  category: category,
  priority: priority,
  relatedId: relatedId,
  status: 'unread',
  isRead: false,
  createdAt: DateTime(2026, 10, 29, 9),
);

void main() {
  final now = DateTime(2026, 10, 29, 18);

  test('groups by day', () {
    expect(notificationGroup(DateTime(2026, 10, 29, 1), now: now), 'Today');
    expect(notificationGroup(DateTime(2026, 10, 28, 23), now: now), 'Yesterday');
    expect(notificationGroup(DateTime(2026, 10, 24), now: now), 'This week');
    expect(notificationGroup(DateTime(2026, 10, 1), now: now), 'Earlier');
  });

  test('urgent = error type or high/urgent priority', () {
    expect(isUrgentNotification(_n(type: 'error')), isTrue);
    expect(isUrgentNotification(_n(priority: 'urgent')), isTrue);
    expect(isUrgentNotification(_n(type: 'info')), isFalse);
  });

  test('reads coordinates from an SOS message', () {
    expect(
      notificationCoords('Location 11.93410, 79.82980'),
      (11.9341, 79.8298),
    );
    expect(notificationCoords('No location'), isNull);
  });

  test('tap targets', () {
    expect(
      managerNotificationTarget(
        _n(type: 'error', category: 'fleet', priority: 'urgent'),
      ),
      AppRoutes.managerHome,
    );
    expect(
      managerNotificationTarget(_n(category: 'fleet')),
      AppRoutes.managerFleet,
    );
    expect(
      managerNotificationTarget(_n(category: 'bookings', relatedId: 'b1')),
      AppRoutes.managerTripDetail('b1'),
    );
    expect(
      managerNotificationTarget(_n(category: 'expenses')),
      AppRoutes.managerExpenses,
    );
    expect(managerNotificationTarget(_n()), isNull);
  });
}
