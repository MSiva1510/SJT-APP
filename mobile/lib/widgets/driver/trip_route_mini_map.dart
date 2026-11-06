// ─────────────────────────────────────────────────────────────────────────────
// trip_route_mini_map.dart
// Reusable non-interactive route preview: draws a pickup→drop polyline (or a
// recorded GPS track) on an OpenStreetMap tile. Used by the trip details card
// and every trip card in the trips list.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class TripRouteMiniMap extends StatelessWidget {
  const TripRouteMiniMap({
    super.key,
    required this.points,
    this.pickup,
    this.drop,
    this.showEndpoints = true,
    this.showAttribution = true,
  });

  final List<LatLng> points;
  final LatLng? pickup;
  final LatLng? drop;
  final bool showEndpoints;
  final bool showAttribution;

  static LatLng _center(List<LatLng> pts) {
    var minLat = pts.first.latitude, maxLat = pts.first.latitude;
    var minLng = pts.first.longitude, maxLng = pts.first.longitude;
    for (final p in pts) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    return LatLng((minLat + maxLat) / 2, (minLng + maxLng) / 2);
  }

  static double _zoomFor(List<LatLng> pts) {
    var minLat = pts.first.latitude, maxLat = pts.first.latitude;
    var minLng = pts.first.longitude, maxLng = pts.first.longitude;
    for (final p in pts) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    final span = (maxLat - minLat).abs() > (maxLng - minLng).abs()
        ? (maxLat - minLat)
        : (maxLng - minLng);
    if (span > 10) return 6;
    if (span > 4) return 7;
    if (span > 1) return 8;
    if (span > 0.3) return 9;
    if (span > 0.1) return 10;
    return 12;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FlutterMap(
      options: MapOptions(
        initialCenter: _center(points),
        initialZoom: _zoomFor(points),
        interactionOptions: const InteractionOptions(
          flags: InteractiveFlag.none,
        ),
      ),
      children: [
        TileLayer(
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.srijayam.sri_jayam_travels',
        ),
        PolylineLayer(
          polylines: [
            Polyline(
              points: points,
              strokeWidth: 4,
              color: theme.colorScheme.primary.withValues(alpha: 0.85),
            ),
          ],
        ),
        if (showEndpoints)
          MarkerLayer(
            markers: [
              if (pickup != null)
                Marker(
                  point: pickup!,
                  width: 28,
                  height: 28,
                  child: Icon(
                    Icons.trip_origin,
                    size: 24,
                    color: Colors.green.shade700,
                  ),
                ),
              if (drop != null)
                Marker(
                  point: drop!,
                  width: 28,
                  height: 28,
                  child: Icon(
                    Icons.location_on,
                    size: 28,
                    color: Colors.red.shade700,
                  ),
                ),
            ],
          ),
        if (showAttribution)
          RichAttributionWidget(
            attributions: [TextSourceAttribution('OpenStreetMap contributors')],
          ),
      ],
    );
  }
}
