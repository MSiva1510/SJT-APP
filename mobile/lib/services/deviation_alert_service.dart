import 'dart:math' as math_lib;

import 'package:latlong2/latlong.dart';

double _haversineMeters(LatLng a, LatLng b) {
  const R = 6371000.0;
  final dLat = (b.latitude - a.latitude) * math_lib.pi / 180;
  final dLon = (b.longitude - a.longitude) * math_lib.pi / 180;
  final s = math_lib.sin(dLat / 2) * math_lib.sin(dLat / 2) +
      math_lib.cos(a.latitude * math_lib.pi / 180) * math_lib.cos(b.latitude * math_lib.pi / 180) *
          math_lib.sin(dLon / 2) * math_lib.sin(dLon / 2);
  final h = math_lib.sqrt(s);
  return 2 * R * h;
}

double _pointToSegmentDistanceMeters(LatLng point, LatLng a, LatLng b) {
  final dx = b.longitude - a.longitude;
  final dy = b.latitude - a.latitude;
  final lenSq = dx * dx + dy * dy;
  double t = 0;
  if (lenSq > 0) {
    t = ((point.longitude - a.longitude) * dx + (point.latitude - a.latitude) * dy) / lenSq;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
  }
  final nearest = LatLng(a.latitude + t * dy, a.longitude + t * dx);
  return _haversineMeters(point, nearest);
}

double _routeDeviationMeters(LatLng point, List<LatLng> polyline) {
  if (polyline.length < 2) return 0;
  double maxDist = 0;
  for (var i = 0; i < polyline.length - 1; i++) {
    final d = _pointToSegmentDistanceMeters(point, polyline[i], polyline[i + 1]);
    if (d > maxDist) maxDist = d;
  }
  return maxDist;
}

Future<Map<String, dynamic>?> checkRouteDeviation({
  required LatLng currentPos,
  required List<LatLng> routePolyline,
  required double thresholdMeters,
}) async {
  if (routePolyline.length < 2) return null;
  final dist = _routeDeviationMeters(currentPos, routePolyline);
  if (dist <= thresholdMeters) return null;
  return {
    'deviated': true,
    'distance_m': dist,
    'threshold_m': thresholdMeters,
    'timestamp': DateTime.now().toIso8601String(),
  };
}

Future<List<Map<String, dynamic>>> checkDeviations(
  List<Map<String, dynamic>> positions,
  List<LatLng> routePolyline, {
  double thresholdMeters = 500,
}) async {
  final out = <Map<String, dynamic>>[];
  for (final p in positions) {
    final lat = (p['latitude'] as num?)?.toDouble();
    final lng = (p['longitude'] as num?)?.toDouble();
    if (lat == null || lng == null) continue;
    final res = await checkRouteDeviation(
      currentPos: LatLng(lat, lng),
      routePolyline: routePolyline,
      thresholdMeters: thresholdMeters,
    );
    if (res != null) out.add(res);
  }
  return out;
}
