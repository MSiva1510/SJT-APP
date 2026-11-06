// ─────────────────────────────────────────────────────────────────────────────
// fleet_map.dart — shared pieces of the manager fleet maps (Fleet tab card +
// full-screen FleetMapScreen):
//   fleetTileLayer  OSM Humanitarian tiles (free, no key; lighter than the
//                   default OSM style). Credit is shown as one small line
//                   under the map (fleetMapCredit), not an overlay button.
//   CarMarker       🚗 emoji in a ring coloured by moving/stopped/offline.
//   fleetCameraFit  bounds that fit every car (zoom capped for one car).
//   RoadSnapper     OSRM `nearest` → the closest point on a drivable road.
//   pickCurrentTrip which booking a vehicle is attending now.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

import '../../models/manager_models.dart';

const fleetMapCredit = '© OpenStreetMap contributors · tiles OSM France';

/// OSM "Humanitarian" style (openstreetmap.fr): light and readable, free, no
/// key. (CARTO now answers keyless requests with an "API key required" tile.)
TileLayer fleetTileLayer() => TileLayer(
      urlTemplate: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      subdomains: const ['a', 'b', 'c'],
      maxZoom: 19,
      userAgentPackageName: 'com.srijayam.sri_jayam_travels',
    );

/// Fits every point; a single car gets a street-level zoom instead of the max.
CameraFit fleetCameraFit(List<LatLng> points, {EdgeInsets? padding}) =>
    points.length == 1
        ? CameraFit.coordinates(
            coordinates: points,
            maxZoom: 15,
            padding: padding ?? const EdgeInsets.all(48),
          )
        : CameraFit.bounds(
            bounds: LatLngBounds.fromPoints(points),
            maxZoom: 16,
            padding: padding ?? const EdgeInsets.all(48),
          );

class CarMarker extends StatelessWidget {
  const CarMarker({
    super.key,
    required this.color,
    required this.label,
    required this.onTap,
    this.selected = false,
    this.showLabel = true,
  });

  final Color color;
  final String label;
  final VoidCallback onTap;
  final bool selected;
  final bool showLabel;

  static const width = 96.0;
  static const height = 66.0;

  @override
  Widget build(BuildContext context) {
    final size = selected ? 46.0 : 40.0;
    return Semantics(
      button: true,
      label: label,
      child: GestureDetector(
        onTap: onTap,
        behavior: HitTestBehavior.opaque,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: color, width: selected ? 4 : 3),
                boxShadow: const [
                  BoxShadow(color: Colors.black26, blurRadius: 6, offset: Offset(0, 2)),
                ],
              ),
              child: Text('🚗', style: TextStyle(fontSize: selected ? 24 : 21, height: 1.1)),
            ),
            if (showLabel)
              Container(
                margin: const EdgeInsets.only(top: 2),
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  label,
                  maxLines: 1,
                  style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Moves a GPS fix onto the nearest drivable road (public OSRM `nearest`).
/// Results are cached per rounded position; failures fall back to the fix.
class RoadSnapper {
  RoadSnapper({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  final _cache = <String, LatLng>{};

  static String _key(LatLng p) =>
      '${p.latitude.toStringAsFixed(5)},${p.longitude.toStringAsFixed(5)}';

  Future<LatLng> snap(LatLng p) async {
    final key = _key(p);
    final hit = _cache[key];
    if (hit != null) return hit;
    try {
      final uri = Uri.https(
        'router.project-osrm.org',
        '/nearest/v1/driving/${p.longitude},${p.latitude}',
        {'number': '1'},
      );
      final res = await _client
          .get(uri, headers: {'User-Agent': 'SriJayamTravelsDriverApp/1.0'})
          .timeout(const Duration(seconds: 6));
      if (res.statusCode != 200) return p;
      final snapped = parseOsrmNearest(jsonDecode(res.body));
      // A "road" more than 300 m away is not where the car is.
      if (snapped == null ||
          const Distance().as(LengthUnit.Meter, p, snapped) > 300) {
        return p;
      }
      return _cache[key] = snapped;
    } catch (_) {
      return p;
    }
  }
}

/// `{"code":"Ok","waypoints":[{"location":[lng,lat]}]}` → LatLng.
LatLng? parseOsrmNearest(Object? body) {
  if (body is! Map || body['code'] != 'Ok') return null;
  final wps = body['waypoints'];
  if (wps is! List || wps.isEmpty) return null;
  final loc = (wps.first as Map)['location'];
  if (loc is! List || loc.length < 2) return null;
  final lng = (loc[0] as num?)?.toDouble();
  final lat = (loc[1] as num?)?.toDouble();
  return lat == null || lng == null ? null : LatLng(lat, lng);
}

/// The booking a vehicle is attending: an in-progress trip first, then an
/// open trip whose dates include today, then the next upcoming one.
ManagerBooking? pickCurrentTrip(List<ManagerBooking> bookings, DateTime now) {
  final today = DateTime(now.year, now.month, now.day);
  final open = bookings
      .where((b) => !const {'completed', 'closed', 'cancelled', 'draft'}.contains(b.status))
      .toList();
  final started = open.where((b) => b.status == 'started');
  if (started.isNotEmpty) return started.first;
  for (final b in open) {
    final s = b.startDate;
    if (s == null) continue;
    final e = b.endDate ?? s;
    final sd = DateTime(s.year, s.month, s.day);
    final ed = DateTime(e.year, e.month, e.day);
    if (!today.isBefore(sd) && !today.isAfter(ed)) return b;
  }
  final upcoming = open
      .where((b) => b.startDate != null && b.startDate!.isAfter(today))
      .toList()
    ..sort((a, b) => a.startDate!.compareTo(b.startDate!));
  return upcoming.firstOrNull;
}
