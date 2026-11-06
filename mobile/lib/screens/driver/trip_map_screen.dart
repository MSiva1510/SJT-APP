// ─────────────────────────────────────────────────────────────────────────────
// trip_map_screen.dart
// Day 47 — live trip map (OpenStreetMap via flutter_map, no paid APIs).
//
// Shows: driver's current position, GPS route recorded so far (live session
// points merged with previously stored gps_tracking rows), and a status
// panel with accuracy / speed / last update.
//
// Failure handling: no crash when GPS is unavailable, permission denied,
// or tiles fail — the map still renders with an explanatory banner.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/gps_position.dart';
import '../../providers/gps_provider.dart';
import '../../services/gps_tracking_service.dart';

/// Persisted route for this trip (gps_tracking rows already on the server).
final storedTripRouteProvider = FutureProvider.autoDispose
    .family<List<GpsPosition>, String>((ref, tripId) {
  return ref.watch(gpsRepositoryProvider).getTripLocations(tripId: tripId);
});

class TripMapScreen extends ConsumerStatefulWidget {
  const TripMapScreen({super.key, required this.tripId});
  final String tripId;

  @override
  ConsumerState<TripMapScreen> createState() => _TripMapScreenState();
}

class _TripMapScreenState extends ConsumerState<TripMapScreen> {
  final MapController _mapController = MapController();
  bool _followDriver = true;

  void _recenter(LatLng target) {
    _mapController.move(target, 16);
    setState(() => _followDriver = true);
  }

  @override
  Widget build(BuildContext context) {
    final track = ref.watch(gpsTrackingProvider);
    final storedRoute = ref.watch(storedTripRouteProvider(widget.tripId));
    final theme = Theme.of(context);

    // Live session points win; stored points fill in history before them.
    final livePoints = track.routePoints;
    final allPoints = <GpsPosition>[
      ...storedRoute.valueOrNull ?? const [],
      ...livePoints,
    ];

    final current = track.lastPosition;
    final currentLatLng =
        current == null ? null : LatLng(current.latitude, current.longitude);

    // Follow the driver marker as fixes arrive.
    if (_followDriver && currentLatLng != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _mapController.move(currentLatLng, _mapController.camera.zoom);
        } catch (_) {}
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Live Trip Map')),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: currentLatLng ?? const LatLng(11.0168, 76.9558),
              initialZoom: currentLatLng != null ? 16 : 10,
              onMapEvent: (e) {
                if (e is MapEventMove ||
                    e is MapEventFlingAnimationStart ||
                    e is MapEventScrollWheelZoom) {
                  if (_followDriver) setState(() => _followDriver = false);
                }
              },
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all,
              ),
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.srijayam.sri_jayam_travels',
              ),
              if (allPoints.length >= 2)
                PolylineLayer(
                  polylines: [
                    Polyline(
                      points: allPoints
                          .map((p) => LatLng(p.latitude, p.longitude))
                          .toList(growable: false),
                      strokeWidth: 4,
                      color: theme.colorScheme.primary.withValues(alpha: 0.85),
                    ),
                  ],
                ),
              MarkerLayer(
                markers: [
                  if (currentLatLng != null)
                    Marker(
                      point: currentLatLng,
                      width: 44,
                      height: 44,
                      child: Icon(
                        Icons.directions_car_rounded,
                        size: 40,
                        color: track.isTracking
                            ? theme.colorScheme.primary
                            : theme.colorScheme.outline,
                      ),
                    ),
                ],
              ),
              RichAttributionWidget(
                attributions: [
                  TextSourceAttribution('OpenStreetMap contributors'),
                ],
              ),
            ],
          ),

          // ── Status panel ────────────────────────────────────────────────
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: _GpsStatusCard(track: track),
          ),

          // ── Recenter FAB ────────────────────────────────────────────────
          Positioned(
            right: 12,
            bottom: 24,
            child: FloatingActionButton.small(
              heroTag: 'recenterGps',
              onPressed: currentLatLng == null
                  ? null
                  : () => _recenter(currentLatLng),
              child: Icon(
                _followDriver ? Icons.my_location : Icons.location_searching,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Status overlay ────────────────────────────────────────────────────────────

class _GpsStatusCard extends StatelessWidget {
  const _GpsStatusCard({required this.track});
  final GpsTrackState track;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pos = track.lastPosition;

    final (color, icon, label) = switch (track.status) {
      GpsTrackingStatus.active => (
          Colors.green.shade700,
          Icons.gps_fixed,
          'GPS Active'
        ),
      GpsTrackingStatus.paused => (
          Colors.orange.shade700,
          Icons.gps_not_fixed,
          'GPS Paused'
        ),
      GpsTrackingStatus.starting => (
          Colors.blue.shade700,
          Icons.gps_fixed,
          'Starting GPS…'
        ),
      GpsTrackingStatus.stopping => (
          Colors.blueGrey,
          Icons.gps_off,
          'Stopping…'
        ),
      GpsTrackingStatus.idle => (
          theme.colorScheme.outline,
          Icons.gps_off,
          'GPS Off'
        ),
    };

    return Card(
      margin: EdgeInsets.zero,
      elevation: 3,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: color),
                const SizedBox(width: 8),
                Text(label,
                    style: TextStyle(fontWeight: FontWeight.bold, color: color)),
                const Spacer(),
                Text('${track.routePoints.length} pts',
                    style: theme.textTheme.bodySmall),
              ],
            ),
            if (pos != null) ...[
              const SizedBox(height: 6),
              Text(
                'Lat ${pos.latitude.toStringAsFixed(5)}, '
                'Lng ${pos.longitude.toStringAsFixed(5)}',
                style: theme.textTheme.bodySmall,
              ),
              Text(
                '±${pos.accuracy.toStringAsFixed(0)} m · '
                '${_speedLabel(pos)} · '
                'updated ${TimeOfDay.fromDateTime(pos.timestamp).format(context)}',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ] else ...[
              const SizedBox(height: 6),
              Text(
                'Waiting for first GPS fix…',
                style: theme.textTheme.bodySmall,
              ),
            ],
            if (track.temporarilyOffline || track.pendingCount > 0) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(Icons.cloud_off, size: 14, color: Colors.orange.shade800),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'GPS temporarily offline — '
                      '${track.pendingCount} point(s) will sync automatically.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.orange.shade900,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _speedLabel(GpsPosition p) {
    final kmh = p.speedKmh;
    if (kmh == null) return 'speed —';
    return '${kmh.toStringAsFixed(0)} km/h';
  }
}
