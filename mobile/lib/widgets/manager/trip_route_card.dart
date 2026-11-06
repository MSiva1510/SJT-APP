// ─────────────────────────────────────────────────────────────────────────────
// trip_route_card.dart — route map on the manager trip detail.
// Recorded GPS route (driver app, else vehicle GPS between the trip dates) in
// the primary colour over the planned pickup → drop road route (grey).
// Pickup = green dot, drop = red pin, last recorded fix = car. Upcoming trips
// show only the planned route.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../core/theme/home_tokens.dart';
import '../../models/manager_models.dart';
import '../../providers/manager_provider.dart';
import 'fleet_map.dart';
import 'manager_ui.dart';

/// Caption under the map, e.g. "Recorded · 214 GPS points · 9:05 am – 6:40 pm".
String tripRouteCaption({
  required TripTrack track,
  required bool hasPlanned,
  required bool plannedLoading,
}) {
  if (track.hasRoute) {
    final from = track.source == TrackSource.driverApp
        ? 'driver app'
        : 'vehicle GPS';
    final clock = DateFormat('d MMM, h:mm a');
    final span = track.first != null && track.last != null
        ? ' · ${clock.format(track.first!.toLocal())} – ${clock.format(track.last!.toLocal())}'
        : '';
    return 'Recorded route from $from · ${track.points.length} GPS points$span';
  }
  if (hasPlanned) return 'Planned route · no GPS recorded for this trip yet';
  if (plannedLoading) return 'Finding the route…';
  return 'Route not available — pickup or drop place could not be found on the map.';
}

class TripRouteCard extends ConsumerWidget {
  const TripRouteCard({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    final trackAsync = ref.watch(managerTripTrackProvider(bookingId));
    final plannedAsync = ref.watch(managerPlannedRouteProvider(bookingId));
    final track = trackAsync.valueOrNull ?? TripTrack.empty;
    final planned = plannedAsync.valueOrNull;

    final recorded = [for (final p in track.points) LatLng(p.lat, p.lng)];
    final plan = planned?.points ?? const <LatLng>[];
    final all = [...recorded, ...plan];
    final loading = trackAsync.isLoading || plannedAsync.isLoading;

    Widget map;
    if (all.length < 2) {
      map = Container(
        color: t.neutralSurface,
        alignment: Alignment.center,
        child: loading
            ? const CircularProgressIndicator(strokeWidth: 2.4)
            : Icon(Icons.map_outlined, size: 40, color: t.textSecondary),
      );
    } else {
      final pickup = planned?.pickup ?? recorded.first;
      final drop = planned?.drop ?? recorded.last;
      map = FlutterMap(
        // Remount when the data changes so the camera re-fits.
        key: ValueKey('${recorded.length}-${plan.length}'),
        options: MapOptions(
          initialCameraFit: CameraFit.bounds(
            bounds: LatLngBounds.fromPoints(all),
            padding: const EdgeInsets.all(28),
            maxZoom: 15,
          ),
          interactionOptions: const InteractionOptions(
            flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
          ),
        ),
        children: [
          fleetTileLayer(),
          PolylineLayer(
            polylines: [
              if (plan.length >= 2)
                Polyline(
                  points: plan,
                  strokeWidth: 4,
                  color: const Color(0xFF94A3B8).withValues(alpha: 0.9),
                  pattern: recorded.length >= 2
                      ? StrokePattern.dashed(segments: const [10, 8])
                      : const StrokePattern.solid(),
                ),
              if (recorded.length >= 2)
                Polyline(
                  points: recorded,
                  strokeWidth: 4.5,
                  color: t.primary,
                  borderStrokeWidth: 1,
                  borderColor: Colors.white.withValues(alpha: 0.9),
                ),
            ],
          ),
          MarkerLayer(
            markers: [
              Marker(
                point: pickup,
                width: 22,
                height: 22,
                child: _Dot(color: t.success),
              ),
              Marker(
                point: drop,
                width: 36,
                height: 36,
                alignment: Alignment.topCenter,
                child: const Icon(
                  Icons.location_on,
                  color: Color(0xFFDC2626),
                  size: 36,
                ),
              ),
              if (recorded.length >= 2)
                Marker(
                  point: recorded.last,
                  width: 34,
                  height: 34,
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: t.primary, width: 2),
                    ),
                    child: Icon(
                      Icons.directions_car_rounded,
                      size: 20,
                      color: t.primary,
                    ),
                  ),
                ),
            ],
          ),
        ],
      );
    }

    return MCard(
      key: const Key('trip-route-card'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Route map',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: SizedBox(height: 230, child: map),
          ),
          const SizedBox(height: 10),
          if (trackAsync.hasError)
            MInfoLine(
              icon: Icons.error_outline,
              text: managerErrorText(trackAsync.error!),
              maxLines: 2,
            )
          else
            Text(
              tripRouteCaption(
                track: track,
                hasPlanned: plan.length >= 2,
                plannedLoading: plannedAsync.isLoading,
              ),
              style: TextStyle(fontSize: 12.5, color: t.textSecondary),
            ),
        ],
      ),
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: color,
      shape: BoxShape.circle,
      border: Border.all(color: Colors.white, width: 3),
      boxShadow: const [BoxShadow(blurRadius: 3, color: Color(0x33000000))],
    ),
  );
}
