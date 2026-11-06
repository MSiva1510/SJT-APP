// ─────────────────────────────────────────────────────────────────────────────
// route_map_test.dart
// Demo fixtures that back the Trip Route Map:
//   · place()       → known demo place coordinates
//   · tripRoute()   → synthesized history track for completed trips
//   · ExpectedRouteService in demo mode resolves offline (no network)
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:sri_jayam_travels_mobile/core/demo/demo_session.dart';
import 'package:sri_jayam_travels_mobile/services/expected_route_service.dart';

void main() {
  group('DemoSession.place', () {
    setUp(DemoSession.enter);
    tearDown(DemoSession.exit);

    test('resolves known places case-insensitively', () {
      final a = DemoSession.place('Pondicherry Rock Beach');
      final b = DemoSession.place('CHENNAI INTL AIRPORT T4');
      expect(a, isNotNull);
      expect(b, isNotNull);
      expect(a!.$1, closeTo(11.9339, 0.01));
      expect(a.$2, closeTo(79.8325, 0.01));
    });

    test('returns null for unknown or empty names', () {
      expect(DemoSession.place('Atlantis'), isNull);
      expect(DemoSession.place(''), isNull);
      expect(DemoSession.place(null), isNull);
    });
  });

  group('DemoSession.tripRoute', () {
    setUp(DemoSession.enter);
    tearDown(DemoSession.exit);

    test('synthesizes a track for demo-trip-1019 (completed)', () {
      final pts = DemoSession.tripRoute('demo-trip-1019');
      expect(pts.length, 40);
      // Endpoints near the demo pickup/drop fixtures.
      final trip = DemoSession.tripById('demo-trip-1019')!;
      final a = DemoSession.place(trip.pickupLocation)!;
      final b = DemoSession.place(trip.dropLocation)!;
      expect(pts.first.latitude, closeTo(a.$1, 0.05));
      expect(pts.first.longitude, closeTo(a.$2, 0.05));
      expect(pts.last.latitude, closeTo(b.$1, 0.05));
      expect(pts.last.longitude, closeTo(b.$2, 0.05));
      // Timestamps strictly ascending (oldest first).
      for (var i = 1; i < pts.length; i++) {
        expect(pts[i].timestamp.isAfter(pts[i - 1].timestamp), isTrue);
      }
    });

    test('returns empty for unknown trip ids', () {
      expect(DemoSession.tripRoute('nope-123'), isEmpty);
    });

    test('keeps history empty for non-finished trips (expected route path)',
        () {
      expect(DemoSession.tripRoute('demo-trip-1024'), isEmpty); // assigned
      expect(DemoSession.tripRoute('demo-trip-1042'), isEmpty); // cancelled
    });
  });

  group('ExpectedRouteService (demo mode)', () {
    setUp(DemoSession.enter);
    tearDown(DemoSession.exit);

    test('resolves known endpoints offline as a straight path', () async {
      final service = ExpectedRouteService();
      final route = await service.resolve(
        pickup: 'Pondicherry Rock Beach',
        drop: 'Chennai Intl Airport T4',
      );
      expect(route, isNotNull);
      expect(route!.viaRoads, isFalse);
      expect(route.points.length, 2);
      expect(route.points.first, isA<LatLng>());
      expect(route.pickup.latitude, closeTo(11.9339, 0.01));
      expect(route.drop.longitude, closeTo(80.1646, 0.01));
    });

    test('returns null when an endpoint is unknown or missing', () async {
      final service = ExpectedRouteService();
      expect(
        await service.resolve(
          pickup: 'Pondicherry Rock Beach',
          drop: 'Nowhere Land',
        ),
        isNull,
      );
      expect(await service.resolve(pickup: '', drop: 'Auroville'), isNull);
      expect(await service.resolve(pickup: null, drop: null), isNull);
    });
  });

  group('ExpectedRouteService.resolveDetailed (demo mode)', () {
    setUp(DemoSession.enter);
    tearDown(DemoSession.exit);

    test('both endpoints known → ok, failure none', () async {
      final service = ExpectedRouteService();
      final r = await service.resolveDetailed(
        pickup: 'Pondicherry Rock Beach',
        drop: 'Chennai Intl Airport T4',
      );
      expect(r.ok, isTrue);
      expect(r.failure, RouteFailure.none);
      expect(r.route, isNotNull);
      expect(r.pickupPoint, isNotNull);
      expect(r.dropPoint, isNotNull);
    });

    test('unknown drop → failure drop, no route', () async {
      final service = ExpectedRouteService();
      final r = await service.resolveDetailed(
        pickup: 'Pondicherry Rock Beach',
        drop: 'Nowhere Land',
      );
      expect(r.ok, isFalse);
      expect(r.failure, RouteFailure.drop);
      expect(r.route, isNull);
      expect(r.pickupPoint, isNotNull);
      expect(r.dropPoint, isNull);
    });

    test('both unknown → failure both', () async {
      final service = ExpectedRouteService();
      final r = await service.resolveDetailed(
        pickup: 'Nowhere Land',
        drop: 'Atlantis',
      );
      expect(r.failure, RouteFailure.both);
      expect(r.route, isNull);
    });

    test('explicit corrected points override names', () async {
      final service = ExpectedRouteService();
      final r = await service.resolveDetailed(
        pickup: 'Nowhere Land',
        drop: 'Atlantis',
        pickupPoint: const LatLng(11.9339, 79.8325),
        dropPoint: const LatLng(13.0827, 80.2707),
      );
      expect(r.ok, isTrue);
      expect(r.route, isNotNull);
      expect(r.route!.points.length, 2);
    });

    test('one corrected point + one known name suffices', () async {
      final service = ExpectedRouteService();
      final r = await service.resolveDetailed(
        pickup: 'Nowhere Land',
        drop: 'Pondicherry Rock Beach',
        pickupPoint: const LatLng(13.0827, 80.2707),
      );
      expect(r.ok, isTrue);
      expect(r.failure, RouteFailure.none);
    });

    test('geocode resolves known demo places, else null', () async {
      final service = ExpectedRouteService();
      final p = await service.geocode('Pondicherry Rock Beach');
      expect(p, isNotNull);
      expect(p!.latitude, closeTo(11.9339, 0.01));
      expect(await service.geocode('Atlantis'), isNull);
      expect(await service.geocode(''), isNull);
    });
  });
}
