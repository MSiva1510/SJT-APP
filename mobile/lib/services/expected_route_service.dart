// ─────────────────────────────────────────────────────────────────────────────
// expected_route_service.dart
// Planned pickup → drop path for trips that have no recorded GPS track yet
// (upcoming, cancelled, approved…). Uses keyless OpenStreetMap APIs:
//   geocoding → Nominatim,  driving path → OSRM (road geometry)
// Failures degrade gracefully to null (caller shows a plain fallback) so the
// map card never blocks a trip-details render. Demo mode resolves entirely
// from offline fixtures — no network.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../core/demo/demo_session.dart';

/// A planned pickup→drop path with its endpoints.
class ExpectedRoute {
  const ExpectedRoute({
    required this.points,
    required this.pickup,
    required this.drop,
    required this.viaRoads,
  });

  /// Polyline from pickup to drop (≥2 points when known).
  final List<LatLng> points;
  final LatLng pickup;
  final LatLng drop;

  /// true → OSRM road geometry; false → straight/approximated line.
  final bool viaRoads;
}

/// Why a planned route could not be fully resolved — identifies which free-text
/// endpoint failed so the driver can be asked to correct exactly that place.
enum RouteFailure { none, pickup, drop, both }

/// Detailed resolution result, including per-endpoint coordinates so the caller
/// can persist a corrected/confirmed place back to the booking.
class RouteResolution {
  const RouteResolution({
    this.route,
    required this.failure,
    this.pickupPoint,
    this.dropPoint,
  });

  final ExpectedRoute? route;
  final RouteFailure failure;
  final LatLng? pickupPoint;
  final LatLng? dropPoint;

  bool get ok => route != null;
}

class ExpectedRouteService {
  ExpectedRouteService({http.Client? client})
    : _client = client ?? http.Client();

  final http.Client _client;

  static const _ua = 'SriJayamTravelsDriverApp/1.0';
  static const _timeout = Duration(seconds: 8);

  /// Resolve the planned route between two free-text place names.
  /// Returns null when either end is empty/unknown or every lookup fails.
  Future<ExpectedRoute?> resolve({
    String? pickup,
    String? drop,
    LatLng? pickupPoint,
    LatLng? dropPoint,
  }) async {
    final res = await resolveDetailed(
      pickup: pickup,
      drop: drop,
      pickupPoint: pickupPoint,
      dropPoint: dropPoint,
    );
    return res.route;
  }

  /// Like [resolve], but reports which endpoint(s) failed and returns the
  /// resolved coordinates so the caller can save corrected places.
  Future<RouteResolution> resolveDetailed({
    String? pickup,
    String? drop,
    LatLng? pickupPoint,
    LatLng? dropPoint,
  }) async {
    final p = pickup?.trim() ?? '';
    final d = drop?.trim() ?? '';

    // Explicit coordinates win (corrected places / recorded start point).
    if (pickupPoint == null && p.isEmpty || dropPoint == null && d.isEmpty) {
      final fail = (pickupPoint != null || p.isNotEmpty)
          ? RouteFailure.drop
          : RouteFailure.pickup;
      return RouteResolution(
        failure:
            (pickupPoint == null && p.isEmpty && dropPoint == null && d.isEmpty)
            ? RouteFailure.both
            : fail,
      );
    }

    if (DemoSession.active) {
      final a = pickupPoint ?? _demoPoint(p);
      final b = dropPoint ?? _demoPoint(d);
      if (a == null || b == null) {
        return RouteResolution(
          failure: a == null && b == null
              ? RouteFailure.both
              : (a == null ? RouteFailure.pickup : RouteFailure.drop),
          pickupPoint: a,
          dropPoint: b,
        );
      }
      return RouteResolution(
        route: ExpectedRoute(
          points: [a, b],
          pickup: a,
          drop: b,
          viaRoads: false,
        ),
        failure: RouteFailure.none,
        pickupPoint: a,
        dropPoint: b,
      );
    }

    try {
      final a = pickupPoint ?? await geocode(p);
      final b = dropPoint ?? await geocode(d);
      if (a == null || b == null) {
        return RouteResolution(
          failure: a == null && b == null
              ? RouteFailure.both
              : (a == null ? RouteFailure.pickup : RouteFailure.drop),
          pickupPoint: a,
          dropPoint: b,
        );
      }

      final road = await _roadRoute(a, b);
      return RouteResolution(
        route: ExpectedRoute(
          points: road ?? [a, b],
          pickup: a,
          drop: b,
          viaRoads: road != null,
        ),
        failure: RouteFailure.none,
        pickupPoint: a,
        dropPoint: b,
      );
    } catch (_) {
      return const RouteResolution(failure: RouteFailure.both);
    }
  }

  LatLng? _demoPoint(String q) {
    if (q.isEmpty) return null;
    final a = DemoSession.place(q);
    return a == null ? null : LatLng(a.$1, a.$2);
  }

  /// Public single-place geocode — used by the "correct this place" flow.
  Future<LatLng?> geocode(String query) => _geocode(query);

  Future<LatLng?> _geocode(String query) async {
    if (DemoSession.active) return _demoPoint(query);
    final uri = Uri.https('nominatim.openstreetmap.org', '/search', {
      'q': query,
      'format': 'jsonv2',
      'limit': '1',
      'countrycodes': 'in',
    });
    final res = await _client
        .get(uri, headers: {'User-Agent': _ua, 'Accept': 'application/json'})
        .timeout(_timeout);
    if (res.statusCode == 200) {
      final list = jsonDecode(res.body) as List? ?? const [];
      if (list.isNotEmpty) {
        final first = list.first as Map<String, dynamic>;
        final lat = double.tryParse('${first['lat']}');
        final lon = double.tryParse('${first['lon']}');
        if (lat != null && lon != null) return LatLng(lat, lon);
      }
    }
    return _fuzzyGeocode(query);
  }

  /// Office base — biases the fuzzy search toward nearby places.
  static const _base = LatLng(11.93, 79.83);

  /// Photon tolerates the spelling variants typed into bookings
  /// ("Ariyakuppam" → Ariyankuppam) that Nominatim's exact search misses.
  /// India-only results; null on any failure.
  Future<LatLng?> _fuzzyGeocode(String query) async {
    try {
      final uri = Uri.https('photon.komoot.io', '/api/', {
        'q': query,
        'limit': '1',
        'lat': '${_base.latitude}',
        'lon': '${_base.longitude}',
      });
      final res = await _client
          .get(uri, headers: {'User-Agent': _ua, 'Accept': 'application/json'})
          .timeout(_timeout);
      if (res.statusCode != 200) return null;
      final features =
          (jsonDecode(res.body) as Map<String, dynamic>)['features'] as List? ??
          const [];
      if (features.isEmpty) return null;
      final f = features.first as Map<String, dynamic>;
      final props = f['properties'] as Map<String, dynamic>? ?? const {};
      if ('${props['countrycode'] ?? ''}'.toUpperCase() != 'IN') return null;
      final coords = (f['geometry'] as Map<String, dynamic>?)?['coordinates'] as List?;
      if (coords == null || coords.length < 2) return null;
      final lon = (coords[0] as num?)?.toDouble();
      final lat = (coords[1] as num?)?.toDouble();
      if (lat == null || lon == null) return null;
      return LatLng(lat, lon);
    } catch (_) {
      return null;
    }
  }

  Future<List<LatLng>?> _roadRoute(LatLng a, LatLng b) async {
    try {
      final uri = Uri.https(
        'router.project-osrm.org',
        '/route/v1/driving/${a.longitude},${a.latitude};${b.longitude},${b.latitude}',
        {'overview': 'full', 'geometries': 'geojson'},
      );
      final res = await _client
          .get(uri, headers: {'User-Agent': _ua})
          .timeout(_timeout);
      if (res.statusCode != 200) return null;

      final json = jsonDecode(res.body) as Map<String, dynamic>? ?? const {};
      final routes = json['routes'] as List? ?? const [];
      if (routes.isEmpty) return null;
      final geometry =
          (routes.first as Map<String, dynamic>)['geometry']
              as Map<String, dynamic>?;
      final coords = geometry?['coordinates'] as List? ?? const [];
      if (coords.length < 2) return null;
      return [
        for (final c in coords)
          LatLng((c[1] as num).toDouble(), (c[0] as num).toDouble()),
      ];
    } catch (_) {
      return null;
    }
  }
}
