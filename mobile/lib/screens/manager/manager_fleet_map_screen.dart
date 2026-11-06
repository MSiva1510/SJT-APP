// ─────────────────────────────────────────────────────────────────────────────
// manager_fleet_map_screen.dart — full-screen live fleet map, opened by
// tapping the Fleet tab's map. Buttons: Fit cars (every car in view), Snap to
// road (moves each marker onto the nearest road, OSRM), Refresh. Tapping a car
// opens showVehicleSheet: what it is doing + which trip it is attending.
// Same data and 60 s refresh as the Fleet tab (managerFleetProvider).
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../models/manager_models.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/driver/status_chip.dart';
import '../../widgets/manager/fleet_map.dart';
import '../../widgets/manager/manager_ui.dart';
import 'manager_fleet_screen.dart' show FleetState, fleetColor, fleetLabel, fleetStateOf;
import '../../../core/theme/home_tokens.dart';

class ManagerFleetMapScreen extends ConsumerStatefulWidget {
  const ManagerFleetMapScreen({super.key});

  @override
  ConsumerState<ManagerFleetMapScreen> createState() => _ManagerFleetMapScreenState();
}

class _ManagerFleetMapScreenState extends ConsumerState<ManagerFleetMapScreen> {
  final _map = MapController();
  final _snapper = RoadSnapper();
  Timer? _tick;
  bool _snap = false;
  bool _snapping = false;
  Map<String, LatLng> _snapped = const {};
  String? _selected;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 60), (_) {
      if (mounted) ref.invalidate(managerFleetProvider);
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  LatLng _raw(VehiclePosition p) => LatLng(p.latitude!, p.longitude!);

  LatLng _pointOf(VehiclePosition p) =>
      _snap ? (_snapped[p.vehicle.id] ?? _raw(p)) : _raw(p);

  void _fit(List<VehiclePosition> fixes) {
    if (fixes.isEmpty) return;
    try {
      _map.fitCamera(fleetCameraFit(
        [for (final p in fixes) _pointOf(p)],
        padding: const EdgeInsets.fromLTRB(56, 190, 96, 110),
      ));
    } catch (_) {
      // Map not laid out yet.
    }
  }

  Future<void> _toggleSnap(List<VehiclePosition> fixes) async {
    if (_snap) {
      setState(() => _snap = false);
      return;
    }
    setState(() => _snapping = true);
    final points = await Future.wait([for (final p in fixes) _snapper.snap(_raw(p))]);
    if (!mounted) return;
    setState(() {
      _snapped = {for (var i = 0; i < fixes.length; i++) fixes[i].vehicle.id: points[i]};
      _snap = true;
      _snapping = false;
    });
    showManagerSnack(context, 'Cars snapped to the nearest road');
  }

  Future<void> _open(VehiclePosition p) async {
    setState(() => _selected = p.vehicle.id);
    if (p.hasFix) {
      try {
        _map.move(_pointOf(p), _map.camera.zoom < 14 ? 14 : _map.camera.zoom);
      } catch (_) {}
    }
    await showVehicleSheet(context, p);
    if (mounted) setState(() => _selected = null);
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerFleetProvider);
    final now = DateTime.now();
    final list = async.valueOrNull ?? const <VehiclePosition>[];
    final fixes = list.where((p) => p.hasFix).toList();

    // Re-snap fresh positions while snapping is on.
    ref.listen(managerFleetProvider, (_, next) {
      if (_snap && next.hasValue) {
        final f = next.value!.where((p) => p.hasFix).toList();
        Future.wait([for (final p in f) _snapper.snap(_raw(p))]).then((pts) {
          if (mounted && _snap) {
            setState(() => _snapped = {for (var i = 0; i < f.length; i++) f[i].vehicle.id: pts[i]});
          }
        });
      }
    });

    return Scaffold(
      backgroundColor: t.canvas,
      body: Stack(
        children: [
          if (fixes.isEmpty)
            Container(
              color: t.neutralSurface,
              alignment: Alignment.center,
              child: async.isLoading
                  ? const CircularProgressIndicator()
                  : Text('No vehicle has reported a GPS position yet.',
                      style: TextStyle(color: t.textSecondary)),
            )
          else
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCameraFit: fleetCameraFit(
                  [for (final p in fixes) _pointOf(p)],
                  padding: const EdgeInsets.fromLTRB(56, 190, 96, 110),
                ),
                interactionOptions: const InteractionOptions(
                  flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
                ),
              ),
              children: [
                fleetTileLayer(),
                MarkerLayer(
                  markers: [
                    for (final p in fixes)
                      Marker(
                        key: Key('fleet-car-${p.vehicle.id}'),
                        point: _pointOf(p),
                        width: CarMarker.width,
                        height: CarMarker.height,
                        alignment: const Alignment(0, 0.2),
                        child: CarMarker(
                          color: fleetColor(fleetStateOf(p, now), t),
                          label: p.vehicle.registration,
                          selected: p.vehicle.id == _selected,
                          onTap: () => _open(p),
                        ),
                      ),
                  ],
                ),
              ],
            ),

          // ── Top bar ────────────────────────────────────────────────────
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Row(
                children: [
                  _RoundButton(
                    tooltip: 'Back',
                    icon: Icons.arrow_back,
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: MCard(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      child: Text(
                        '${list.length} cars · ${list.where((p) => fleetStateOf(p, now) == FleetState.moving).length} moving'
                        '${_snap ? ' · snapped to road' : ''}',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // ── Map buttons ────────────────────────────────────────────────
          Positioned(
            right: 12,
            top: 0,
            bottom: 0,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _RoundButton(
                    key: const Key('fleet-fit'),
                    tooltip: 'Fit cars',
                    icon: Icons.fit_screen_outlined,
                    label: 'Fit',
                    onPressed: fixes.isEmpty ? null : () => _fit(fixes),
                  ),
                  const SizedBox(height: 12),
                  _RoundButton(
                    key: const Key('fleet-snap'),
                    tooltip: _snap ? 'Show raw GPS' : 'Snap to road',
                    icon: Icons.alt_route,
                    label: 'Road',
                    active: _snap,
                    busy: _snapping,
                    onPressed: fixes.isEmpty || _snapping ? null : () => _toggleSnap(fixes),
                  ),
                  const SizedBox(height: 12),
                  _RoundButton(
                    tooltip: 'Refresh',
                    icon: Icons.refresh,
                    label: 'Live',
                    busy: async.isLoading,
                    onPressed: () => ref.invalidate(managerFleetProvider),
                  ),
                ],
              ),
            ),
          ),

          // ── Credit ─────────────────────────────────────────────────────
          Positioned(
            left: 10,
            bottom: 6,
            child: SafeArea(
              child: Text(
                fleetMapCredit,
                style: TextStyle(fontSize: 9, color: Colors.black.withValues(alpha: 0.45)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.onPressed,
    this.label,
    this.active = false,
    this.busy = false,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback? onPressed;
  final String? label;
  final bool active;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final fg = active ? Colors.white : t.textPrimary;
    return Tooltip(
      message: tooltip,
      child: Material(
        color: active ? t.primary : Colors.white,
        elevation: 3,
        shadowColor: Colors.black26,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onPressed,
          child: SizedBox(
            width: 56,
            height: label == null ? 48 : 58,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                busy
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2.2, color: fg),
                      )
                    : Icon(icon, size: 22, color: onPressed == null ? fg.withValues(alpha: 0.4) : fg),
                if (label != null) ...[
                  const SizedBox(height: 3),
                  Text(label!,
                      style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: fg)),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Vehicle sheet ────────────────────────────────────────────────────────────

/// "What is this car doing": live state, speed, ignition, place, last update,
/// and the trip it is attending (pickCurrentTrip) with a link to the trip.
Future<void> showVehicleSheet(BuildContext context, VehiclePosition p) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    isScrollControlled: true,
    builder: (_) => VehicleSheet(position: p),
  );
}

String vehicleActivity(VehiclePosition p, DateTime now) {
  final s = fleetStateOf(p, now);
  return switch (s) {
    FleetState.moving => 'Driving at ${p.speedKmh!.round()} km/h',
    FleetState.stopped => p.ignition == true ? 'Stopped, engine on (idling)' : 'Parked, engine off',
    FleetState.offline => 'No GPS update for ${managerAgo(p.at, now: now).replaceAll(' ago', '')}',
    FleetState.noFix => 'GPS has never reported a position',
  };
}

class VehicleSheet extends ConsumerWidget {
  const VehicleSheet({super.key, required this.position});
  final VehiclePosition position;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    final p = position;
    final now = DateTime.now();
    final state = fleetStateOf(p, now);
    final color = fleetColor(state, t);
    final trips = ref.watch(managerVehicleBookingsProvider(p.vehicle.id));

    Widget fact(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 96,
                child: Text(label, style: TextStyle(fontSize: 13, color: t.textSecondary)),
              ),
              Expanded(
                child: Text(value,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: t.textPrimary)),
              ),
            ],
          ),
        );

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.14),
                    shape: BoxShape.circle,
                  ),
                  child: const Text('🚗', style: TextStyle(fontSize: 28)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.vehicle.registration,
                          style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: t.textPrimary)),
                      if (p.vehicle.makeModel != null)
                        Text(p.vehicle.makeModel!,
                            style: TextStyle(fontSize: 13, color: t.textSecondary)),
                    ],
                  ),
                ),
                MTag(label: fleetLabel(state, p), color: color),
              ],
            ),
            const SizedBox(height: 16),
            Text('Now',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.textPrimary)),
            const SizedBox(height: 8),
            fact('Doing', vehicleActivity(p, now)),
            if (p.ignition != null) fact('Engine', p.ignition! ? 'On' : 'Off'),
            fact('Where', p.address ?? (p.hasFix ? '${p.latitude!.toStringAsFixed(5)}, ${p.longitude!.toStringAsFixed(5)}' : '—')),
            fact('Updated', p.at == null ? 'never' : managerAgo(p.at, now: now)),
            const SizedBox(height: 6),
            Text('Trip',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: t.textPrimary)),
            const SizedBox(height: 8),
            trips.when(
              loading: () => const MLoading(height: 70),
              error: (e, _) => MError(
                error: e,
                onRetry: () => ref.invalidate(managerVehicleBookingsProvider(p.vehicle.id)),
              ),
              data: (list) {
                final b = pickCurrentTrip(list, now);
                if (b == null) {
                  return Text('Not attending any trip — free for booking.',
                      style: TextStyle(fontSize: 14, color: t.textSecondary));
                }
                final heading = b.status == 'started'
                    ? 'On trip now'
                    : (b.startDate != null && b.startDate!.isAfter(DateTime(now.year, now.month, now.day)))
                        ? 'Next trip'
                        : 'Today\'s trip';
                return MCard(
                  key: const Key('vehicle-sheet-trip'),
                  padding: const EdgeInsets.all(14),
                  onTap: () {
                    Navigator.pop(context);
                    context.push(AppRoutes.managerTripDetail(b.id));
                  },
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(heading,
                              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: t.primary)),
                          const Spacer(),
                          StatusChip(status: b.status),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('${b.label} · ${b.customerName ?? 'Customer'}',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: t.textPrimary)),
                      const SizedBox(height: 4),
                      Text('${b.pickup ?? '—'} → ${b.drop ?? '—'}',
                          style: TextStyle(fontSize: 13.5, color: t.textSecondary)),
                      Text(
                        [managerWhen(b, now: now), if (b.driverName != null) 'Driver ${b.driverName}']
                            .join(' · '),
                        style: TextStyle(fontSize: 13, color: t.textSecondary),
                      ),
                      const SizedBox(height: 6),
                      Text('Open trip ›',
                          style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: t.primary)),
                    ],
                  ),
                );
              },
            ),
            if (titleCase(p.vehicle.vehicleType).isNotEmpty && p.vehicle.makeModel == null) ...[
              const SizedBox(height: 8),
              Text(titleCase(p.vehicle.vehicleType),
                  style: TextStyle(fontSize: 12.5, color: t.textSecondary)),
            ],
          ],
        ),
      ),
    );
  }
}
