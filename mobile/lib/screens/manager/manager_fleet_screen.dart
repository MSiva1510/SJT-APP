// ─────────────────────────────────────────────────────────────────────────────
// manager_fleet_screen.dart — live fleet map for the manager.
// OSM Humanitarian map (fleet_map.dart) fitted to every car, 🚗 markers coloured
// moving (green) / stopped (amber) / offline (grey, fix > 10 min), and the
// vehicle list below. Tap a car → showVehicleSheet (doing what, which trip);
// tap the map or "Open map" → ManagerFleetMapScreen (Fit cars, Snap to road).
//
// Data: managerFleetProvider — pulls the vendor GPS feeds (FleetGpsSync),
// then the newest gps_tracking row per vehicle; refreshed every 60 s.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../models/manager_models.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/fleet_map.dart';
import '../../widgets/manager/manager_ui.dart';
import 'manager_fleet_map_screen.dart';
import '../../../core/theme/home_tokens.dart';

enum FleetState { moving, stopped, offline, noFix }

FleetState fleetStateOf(VehiclePosition p, DateTime now) {
  if (!p.hasFix) return FleetState.noFix;
  if (p.isStale(now)) return FleetState.offline;
  return p.isMoving ? FleetState.moving : FleetState.stopped;
}

Color fleetColor(FleetState s, HomeTokens t) => switch (s) {
  FleetState.moving => t.success,
  FleetState.stopped => t.warning,
  FleetState.offline => t.textSecondary,
  FleetState.noFix => t.textSecondary.withValues(alpha: 0.6),
};

String fleetLabel(FleetState s, VehiclePosition p) => switch (s) {
  FleetState.moving => 'Moving · ${p.speedKmh!.round()} km/h',
  FleetState.stopped => p.ignition == true ? 'Idling' : 'Stopped',
  FleetState.offline => 'Offline',
  FleetState.noFix => 'No GPS fix',
};

/// Puducherry office — used when no vehicle has a fix yet.
const _fallbackCenter = LatLng(11.93, 79.83);

class ManagerFleetScreen extends ConsumerStatefulWidget {
  const ManagerFleetScreen({super.key});

  @override
  ConsumerState<ManagerFleetScreen> createState() => _ManagerFleetScreenState();
}

class _ManagerFleetScreenState extends ConsumerState<ManagerFleetScreen> {
  final _map = MapController();
  String? _selected;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    // Pull fresh vendor fixes every minute while the Fleet tab is open.
    _tick = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) ref.invalidate(managerFleetProvider);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(managerFleetProvider);
    try {
      await ref.read(managerFleetProvider.future);
    } catch (_) {
      /* error state renders */
    }
  }

  void _openFullMap() {
    // Root navigator: the full map covers the tab bar too.
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(builder: (_) => const ManagerFleetMapScreen()),
    );
  }

  void _focus(VehiclePosition p) {
    setState(() => _selected = p.vehicle.id);
    if (!p.hasFix) return;
    try {
      _map.move(LatLng(p.latitude!, p.longitude!), 14);
    } catch (_) {
      // Map not laid out yet — selection still highlights the row.
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerFleetProvider);
    final sync = ref.watch(fleetSyncResultProvider);
    final now = DateTime.now();
    final list = async.valueOrNull ?? const <VehiclePosition>[];
    final fixes = list.where((p) => p.hasFix).toList();

    final counts = <FleetState, int>{};
    for (final p in list) {
      final s = fleetStateOf(p, now);
      counts[s] = (counts[s] ?? 0) + 1;
    }

    return Scaffold(
      backgroundColor: t.canvas,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 12, 10),
              child: MScreenTitle(
                'Fleet',
                subtitle: async.hasValue
                    ? '${list.length} vehicles · ${counts[FleetState.moving] ?? 0} moving'
                    : 'Live vehicle positions',
                trailing: IconButton(
                  tooltip: 'Refresh',
                  onPressed: _refresh,
                  icon: const Icon(Icons.refresh),
                ),
              ),
            ),
            Expanded(
              flex: 5,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(t.cardRadius - 4),
                  child: Stack(
                    children: [
                      if (!async.hasValue)
                        Container(color: t.neutralSurface)
                      else
                        FlutterMap(
                          // Remount when the set of cars changes so the camera re-fits.
                          key: ValueKey(fixes.length),
                          mapController: _map,
                          options: MapOptions(
                            initialCenter: _fallbackCenter,
                            initialZoom: 11,
                            initialCameraFit: fixes.isEmpty
                                ? null
                                : fleetCameraFit(
                                    [
                                      for (final p in fixes)
                                        LatLng(p.latitude!, p.longitude!),
                                    ],
                                    padding: const EdgeInsets.fromLTRB(48, 48, 48, 40),
                                  ),
                            interactionOptions: const InteractionOptions(
                              flags:
                                  InteractiveFlag.all & ~InteractiveFlag.rotate,
                            ),
                            // Tapping the map opens the full-screen map.
                            onTap: (_, _) => _openFullMap(),
                          ),
                          children: [
                            fleetTileLayer(),
                            MarkerLayer(
                              markers: [
                                for (final p in fixes)
                                  Marker(
                                    point: LatLng(p.latitude!, p.longitude!),
                                    width: CarMarker.width,
                                    height: CarMarker.height,
                                    alignment: const Alignment(0, 0.2),
                                    child: CarMarker(
                                      color: fleetColor(
                                        fleetStateOf(p, now),
                                        t,
                                      ),
                                      selected: p.vehicle.id == _selected,
                                      onTap: () {
                                        _focus(p);
                                        showVehicleSheet(context, p);
                                      },
                                      label: p.vehicle.registration,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      if (async.hasValue && fixes.isNotEmpty)
                        Positioned(
                          right: 10,
                          top: 10,
                          child: Material(
                            color: Colors.white,
                            elevation: 2,
                            borderRadius: BorderRadius.circular(12),
                            child: InkWell(
                              key: const Key('fleet-open-map'),
                              borderRadius: BorderRadius.circular(12),
                              onTap: _openFullMap,
                              child: Padding(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 8,
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.open_in_full, size: 16, color: t.textPrimary),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Open map',
                                      style: TextStyle(
                                        fontSize: 12.5,
                                        fontWeight: FontWeight.w700,
                                        color: t.textPrimary,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ),
                      if (async.isLoading && !async.hasValue)
                        const Center(child: CircularProgressIndicator()),
                      if (async.hasValue && fixes.isEmpty)
                        Positioned(
                          left: 12,
                          right: 12,
                          top: 12,
                          child: MCard(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              'No vehicle has reported a GPS position yet.',
                              style: TextStyle(
                                fontSize: 13,
                                color: t.textPrimary,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 4),
              child: Wrap(
                spacing: 12,
                runSpacing: 4,
                children: [
                  for (final s in const [
                    FleetState.moving,
                    FleetState.stopped,
                    FleetState.offline,
                  ])
                    _Legend(
                      color: fleetColor(s, t),
                      label:
                          '${switch (s) {
                            FleetState.moving => 'Moving',
                            FleetState.stopped => 'Stopped',
                            _ => 'Offline',
                          }} ${counts[s] ?? 0}',
                    ),
                  Text(
                    fleetMapCredit,
                    style: TextStyle(fontSize: 9.5, color: t.textSecondary.withValues(alpha: 0.7)),
                  ),
                ],
              ),
            ),
            Expanded(
              flex: 4,
              child: RefreshIndicator(
                color: t.primary,
                onRefresh: _refresh,
                child: async.when(
                  skipLoadingOnRefresh: true,
                  loading: () =>
                      ListView(children: const [MLoading(height: 120)]),
                  error: (e, _) => ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(20),
                    children: [
                      MError(
                        error: e,
                        onRetry: () => ref.invalidate(managerFleetProvider),
                      ),
                    ],
                  ),
                  data: (all) {
                    if (all.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(20),
                        children: const [
                          MEmpty(
                            icon: Icons.directions_car_outlined,
                            title: 'No vehicles',
                            message: 'Vehicles added on the web show up here.',
                          ),
                        ],
                      );
                    }
                    final anyStale = all.any(
                      (p) => fleetStateOf(p, now) == FleetState.offline,
                    );
                    return ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 6, 20, 24),
                      children: [
                        if (sync != null && sync.errors.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: MInfoLine(
                              icon: Icons.portable_wifi_off,
                              maxLines: 3,
                              text: 'GPS vendor not reachable — ${sync.errors.join('; ')}',
                            ),
                          ),
                        if (anyStale)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: MInfoLine(
                              icon: Icons.info_outline,
                              maxLines: 3,
                              text:
                                  'Offline = the GPS device has sent no fix for 10+ minutes (ignition off, no signal or device unplugged). Refreshes every minute.',
                            ),
                          ),
                        for (final p in all) ...[
                          _VehicleRow(
                            position: p,
                            now: now,
                            selected: p.vehicle.id == _selected,
                            onTap: () => _focus(p),
                          ),
                          const SizedBox(height: 8),
                        ],
                      ],
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(fontSize: 12, color: t.textSecondary)),
      ],
    );
  }
}

class _VehicleRow extends StatelessWidget {
  const _VehicleRow({
    required this.position,
    required this.now,
    required this.selected,
    required this.onTap,
  });

  final VehiclePosition position;
  final DateTime now;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final p = position;
    final s = fleetStateOf(p, now);
    final color = fleetColor(s, t);
    return MCard(
      onTap: onTap,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      borderColor: selected ? t.primary : null,
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.directions_car_outlined, size: 20, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  p.vehicle.registration,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                Text(
                  p.address ??
                      p.vehicle.makeModel ??
                      titleCase(p.vehicle.vehicleType),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12.5, color: t.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              MTag(label: fleetLabel(s, p), color: color),
              const SizedBox(height: 4),
              Text(
                p.at == null ? '—' : managerAgo(p.at, now: now),
                style: TextStyle(fontSize: 11.5, color: t.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
