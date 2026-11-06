// ─────────────────────────────────────────────────────────────────────────────
// sos_emergency_screen.dart — "SOS Emergency" per the driver wireframe.
// Full-screen emergency page: driver/vehicle/trip context, live location,
// hold-to-activate (3 s), confirmation dialog, CALL OPS / SEND SOS / CANCEL.
// SEND SOS raises a critical fleet alert via AlertRepository (office
// dashboard + admin/manager notifications); on failure CALL OPS is offered.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/demo/demo_session.dart';
import '../../models/attendance.dart';
import '../../models/driver_alert.dart';
import '../../models/gps_position.dart';
import '../../providers/alert_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/attendance_provider.dart';
import '../../providers/gps_provider.dart';
import '../../providers/trip_provider.dart';
import '../../repositories/alert_repository.dart';
import '../../services/location_service.dart';

const _kOpsPhone = '+919442337470';
const _holdDuration = Duration(seconds: 3);

class SOSEmergencyScreen extends ConsumerStatefulWidget {
  const SOSEmergencyScreen({super.key});

  @override
  ConsumerState<SOSEmergencyScreen> createState() => _SOSEmergencyScreenState();
}

class _SOSEmergencyScreenState extends ConsumerState<SOSEmergencyScreen> {
  final LocationService _loc = LocationService();

  double _hold = 0; // 0..1
  Timer? _timer;
  bool _sending = false;
  GpsPosition? _location;
  String? _locationError;

  String? _driverName;
  String? _vehicleReg;
  String? _tripId;

  @override
  void initState() {
    super.initState();
    _loadContext();
    _fetchLocation();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadContext() async {
    final driver = ref.read(currentDriverProvider);
    final track = ref.read(gpsTrackingProvider);
    final attendanceState = ref.read(todayAttendanceProvider);
    AttendanceModel? attendance;
    if (attendanceState is AttendanceLoaded) attendance = attendanceState.record;

    String? trip;
    String? vehicleReg;
    final activeTripId = track.context?.tripId;
    if (activeTripId != null) {
      final tripState = ref.read(tripDetailProvider(activeTripId));
      if (tripState is TripDetailLoaded) {
        trip = tripState.trip.bookingNumber;
        vehicleReg = tripState.trip.vehicleReg;
      }
    }

    if (mounted) {
      setState(() {
        _driverName = driver?.name;
        _vehicleReg = vehicleReg ?? attendance?.vehicleAssigned;
        _tripId = trip;
      });
    }
  }

  Future<void> _fetchLocation() async {
    try {
      final status = await _loc.getStatus();
      if (!status.isGranted) {
        final requested = await _loc.requestPermission();
        if (!requested.isGranted) {
          if (mounted) setState(() => _locationError = requested.label);
          return;
        }
      }
      final pos = await _loc.getCurrentPosition();
      if (mounted) setState(() => _location = pos);
    } catch (_) {
      if (mounted) setState(() => _locationError = 'Location unavailable');
    }
  }

  void _startHold() {
    _timer?.cancel();
    const step = Duration(milliseconds: 50);
    _timer = Timer.periodic(step, (t) {
      setState(() => _hold += 50 / _holdDuration.inMilliseconds);
      if (_hold >= 1) {
        t.cancel();
        _showConfirm();
      }
    });
  }

  void _cancelHold() {
    _timer?.cancel();
    if (!_sending) setState(() => _hold = 0);
  }

  void _showConfirm() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.warning_amber_rounded, color: Colors.red, size: 40),
        title: const Text('Confirm Emergency'),
        content: const Text(
          'Are you sure you need emergency assistance? '
          'This will alert operations immediately.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('CANCEL'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () {
              Navigator.pop(ctx);
              _sendSos();
            },
            child: const Text('SEND SOS'),
          ),
        ],
      ),
    );
  }

  Future<void> _sendSos() async {
    if (_sending) return;
    setState(() {
      _sending = true;
    });

    try {
      await ref.read(alertRepositoryProvider).raiseAlert(
            DriverAlertRequest(
              type: DriverAlertType.sos,
              bookingId: ref.read(gpsTrackingProvider).context?.tripId,
              location: _location,
            ),
          );
      if (!mounted) return;
      setState(() => _sending = false);
      _showSuccessToast();
    } on AlertException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _showSendFailed(e.message);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _showSuccessToast() {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(DemoSession.active
              ? 'Demo mode — SOS not actually sent.'
              : 'Emergency alert sent to operations.'),
          backgroundColor: Colors.green,
          duration: const Duration(seconds: 4),
        ),
      );
  }

  /// Delivery failed — keep the driver one tap away from a phone call.
  void _showSendFailed(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text('$message Call operations now.'),
          backgroundColor: Theme.of(context).colorScheme.error,
          duration: const Duration(seconds: 12),
          action: SnackBarAction(
            label: 'CALL OPS',
            textColor: Colors.white,
            onPressed: _callOps,
          ),
        ),
      );
  }

  Future<void> _callOps() async {
    final uri = Uri(scheme: 'tel', path: _kOpsPhone);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else if (mounted) {
      _snack('Could not place the call. Dial ops: $_kOpsPhone');
    }
  }

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final red = theme.colorScheme.error;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.pop(),
        ),
        title: const Text('SOS Emergency'),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
          children: [
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
          // ── Emergency header ────────────────────────────────────────────
          Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: red.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(Icons.warning_amber_rounded,
                    size: 26, color: Colors.red),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'EMERGENCY',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: Colors.red,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Hold 3 s · sends driver, vehicle, trip and location to ops',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),

          // ── Context cards ───────────────────────────────────────────────
          _InfoTile(
            icon: Icons.person_outline,
            label: 'Driver',
            value: _driverName ?? '—',
          ),
          const SizedBox(height: 10),
          _InfoTile(
            icon: Icons.directions_car_outlined,
            label: 'Vehicle',
            value: _vehicleReg ?? '—',
          ),
          const SizedBox(height: 10),
          _InfoTile(
            icon: Icons.confirmation_number_outlined,
            label: 'Trip ID',
            value: _tripId ?? '—',
          ),
          const SizedBox(height: 10),
          _InfoTile(
            icon: Icons.location_on_outlined,
            label: 'Location',
            value: _location != null
                ? '${_location!.latitude.toStringAsFixed(4)}° N, '
                    '${_location!.longitude.toStringAsFixed(4)}° E'
                : (_locationError ?? 'Acquiring…'),
            valueColor: _location != null ? null : theme.colorScheme.error,
          ),
          const SizedBox(height: 28),

          // ── Hold button ─────────────────────────────────────────────────
          GestureDetector(
            onLongPressStart: (_) => _startHold(),
            onLongPressEnd: (_) => _cancelHold(),
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: double.infinity,
                  height: 64,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(16),
                    child: LinearProgressIndicator(
                      value: _hold.clamp(0.0, 1.0),
                      backgroundColor: red,
                      valueColor: const AlwaysStoppedAnimation(Colors.white24),
                      minHeight: 64,
                    ),
                  ),
                ),
                Text(
                  _sending
                      ? 'SENDING…'
                      : (_hold >= 1 ? 'RELEASING…' : 'Hold 3s'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Text(
              'Press and hold the button for 3 seconds to activate emergency protocols.',
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Semantics(
            button: true,
            label: 'Send emergency alert',
            hint: 'Opens confirmation dialog before sending SOS to operations',
            child: SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton.icon(
                onPressed: _sending ? null : _showConfirm,
                icon: const Icon(Icons.emergency_outlined, size: 18),
                label: const Text(
                  'TAP TO SEND (ACCESSIBLE)',
                  style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.4,
                  ),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: red.withValues(alpha: 0.12),
                  foregroundColor: red,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                    side: BorderSide(color: red.withValues(alpha: 0.3)),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // ── Action row ──────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _sending ? null : _callOps,
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('CALL OPERATIONS'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    side: BorderSide(color: theme.colorScheme.primary),
                    foregroundColor: theme.colorScheme.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _sending ? null : _showConfirm,
                  icon: const Icon(Icons.sos_outlined, size: 18),
                  label: const Text('SEND SOS'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    backgroundColor: red,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _sending ? null : () => context.pop(),
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            child: Text(
              'CANCEL',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    ),
  ],
),
    ));
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLowest,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 20, color: theme.colorScheme.primary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: valueColor ?? theme.colorScheme.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}