// ─────────────────────────────────────────────────────────────────────────────
// status_parity_test.dart — booking/trip lifecycle labels match the web
// BOOKING_STATUSES (src/data/tripTypes.js): all 9 statuses have a proper
// label, and pre-assignment states are classifiable for list bucketing.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/booking.dart';
import 'package:sri_jayam_travels_mobile/models/trip.dart';

TripModel _trip(String status) =>
    TripModel(id: 't-1', tripType: 'one_way', status: status);

BookingModel _booking(String status) =>
    BookingModel(id: 'b-1', tripType: 'one_way', status: status);

void main() {
  const labels = {
    'draft': 'Draft',
    'pending': 'Pending',
    'approved': 'Approved',
    'confirmed': 'Confirmed',
    'assigned': 'Assigned',
    'started': 'In Progress',
    'completed': 'Completed',
    'closed': 'Closed',
    'cancelled': 'Cancelled',
  };

  group('TripModel status parity', () {
    for (final entry in labels.entries) {
      test('label for "${entry.key}"', () {
        expect(_trip(entry.key).statusLabel, entry.value);
      });
    }

    test('pre-assignment states are classified', () {
      expect(_trip('pending').isPreAssigned, isTrue);
      expect(_trip('approved').isPreAssigned, isTrue);
      expect(_trip('confirmed').isPreAssigned, isTrue);
      expect(_trip('assigned').isPreAssigned, isFalse);
      expect(_trip('draft').isPreAssigned, isFalse);
    });

    test('closed is its own bucket, not completed/cancelled', () {
      expect(_trip('closed').isClosed, isTrue);
      expect(_trip('closed').isCompleted, isFalse);
      expect(_trip('closed').isCancelled, isFalse);
      expect(_trip('completed').isClosed, isFalse);
    });
  });

  group('BookingModel status parity', () {
    for (final entry in labels.entries) {
      test('label for "${entry.key}"', () {
        expect(_booking(entry.key).statusLabel, entry.value);
      });
    }

    test('pre-assignment + closed classification', () {
      expect(_booking('pending').isPreAssigned, isTrue);
      expect(_booking('confirmed').isPreAssigned, isTrue);
      expect(_booking('closed').isClosed, isTrue);
      expect(_booking('closed').isPreAssigned, isFalse);
    });
  });
}
