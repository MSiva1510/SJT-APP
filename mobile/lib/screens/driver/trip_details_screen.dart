// ─────────────────────────────────────────────────────────────────────────────
// trip_details_screen.dart
// Full trip details for the driver. Shows only driver-appropriate fields.
// base_fare / total_fare are NOT fetched or displayed.
//
// Day 47: real GPS trip lifecycle.
//   START TRIP   → verify permission+GPS → bookings.status='started'
//                  → GpsTrackingService.startTracking
//   COMPLETE TRIP→ final fix saved → tracking stopped
//                  → bookings.status='completed'
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';

import '../../models/trip.dart';
import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/gps_provider.dart';
import '../../providers/trip_provider.dart';
import '../../services/gps_tracking_service.dart';
import '../../services/trip_service.dart';

class TripDetailsScreen extends ConsumerWidget {
  const TripDetailsScreen({super.key, required this.tripId});
  final String tripId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(tripDetailProvider(tripId));

    return Scaffold(
      appBar: AppBar(title: const Text('Trip Details')),
      body: switch (state) {
        TripDetailLoading() => const Center(child: CircularProgressIndicator()),
        TripDetailError(:final message) => _ErrorState(message: message),
        TripDetailLoaded(:final trip) => _TripDetail(
          trip: trip,
          tripId: tripId,
        ),
      },
    );
  }
}

// ── Full detail view ──────────────────────────────────────────────────────────

class _TripDetail extends ConsumerStatefulWidget {
  const _TripDetail({required this.trip, required this.tripId});
  final TripModel trip;
  final String tripId;

  @override
  ConsumerState<_TripDetail> createState() => _TripDetailState();
}

class _TripDetailState extends ConsumerState<_TripDetail> {
  bool _busy = false;

  TripModel get trip => widget.trip;
  String get tripId => widget.tripId;

  // ── START TRIP ────────────────────────────────────────────────────────────
  Future<void> _startTrip() async {
    if (_busy) return;
    final confirmed = await _confirm(
      title: 'Start this trip?',
      body: 'Location tracking will run while the trip is in progress.',
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      // 1. Pre-flight — permission + GPS must be usable BEFORE the DB write.
      final location = ref.read(locationServiceProvider);
      var status = await location.requestPermission();
      if (status.isPermanent) {
        await location.openSettings();
        status = await location.getStatus();
      }
      if (!status.isGranted) {
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              'Location is required to start the trip (${status.label}).',
            ),
            backgroundColor: Colors.red.shade700,
          ),
        );
        return;
      }

      // 2. Update trip using the existing workflow (RLS-protected).
      final updated = await ref
          .read(tripDetailProvider(tripId).notifier)
          .startTrip();
      ref.invalidate(allDriverTripsProvider);
      ref.invalidate(todayTripsProvider);
      ref.invalidate(upcomingTripsProvider);

      // 3. Begin GPS tracking for THIS driver's assigned vehicle/trip.
      final driver = ref.read(currentDriverProvider)!;
      try {
        await ref
            .read(gpsTrackingProvider.notifier)
            .startTracking(trip: updated, driver: driver);
      } on GpsTrackingException catch (e) {
        if (!e.fatal && mounted) {
          // Trip started; GPS will retry when user taps the retry button.
          messenger.showSnackBar(
            SnackBar(
              content: Text('GPS could not start: ${e.message}'),
              backgroundColor: Colors.orange.shade800,
            ),
          );
        } else if (mounted) {
          messenger.showSnackBar(
            SnackBar(
              content: Text(e.message),
              backgroundColor: Colors.orange.shade800,
            ),
          );
        }
      }

      if (mounted) {
        messenger.showSnackBar(
          const SnackBar(content: Text('Trip started — GPS tracking active.')),
        );
      }
    } on TripServiceException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red.shade700,
        ),
      );
    } catch (_) {
      messenger.showSnackBar(
        SnackBar(
          content: const Text('Could not start trip. Please try again.'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── COMPLETE TRIP (STOP) ──────────────────────────────────────────────────
  Future<void> _completeTrip() async {
    if (_busy) return;
    final confirmed = await _confirm(
      title: 'Complete this trip?',
      body: 'Your final location will be recorded and GPS tracking will stop.',
    );
    if (confirmed != true || !mounted) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      // 1. Final fix + stop listeners/sync FIRST (spec order).
      final gps = ref.read(gpsTrackingProvider.notifier);
      if (gps.isTracking) await gps.stopTracking(saveFinalLocation: true);

      // 2. Update trip via the existing workflow.
      await ref.read(tripDetailProvider(tripId).notifier).completeTrip();
      ref.invalidate(allDriverTripsProvider);
      ref.invalidate(todayTripsProvider);
      ref.invalidate(upcomingTripsProvider);

      messenger.showSnackBar(
        const SnackBar(content: Text('Trip completed. GPS tracking stopped.')),
      );
    } on TripServiceException catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(e.message),
          backgroundColor: Colors.red.shade700,
        ),
      );
    } catch (_) {
      messenger.showSnackBar(
        SnackBar(
          content: const Text('Could not complete trip. Please try again.'),
          backgroundColor: Colors.red.shade700,
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ── Retry GPS while a trip is already started ─────────────────────────────
  Future<void> _retryGps() async {
    if (_busy) return;
    final driver = ref.read(currentDriverProvider);
    if (driver == null) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(gpsTrackingProvider.notifier)
          .startTracking(trip: trip, driver: driver);
    } on GpsTrackingException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(e.message),
            backgroundColor: Colors.orange.shade800,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<bool?> _confirm({required String title, required String body}) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final track = ref.watch(gpsTrackingProvider);
    final gpsActiveForThisTrip =
        track.context?.tripId == tripId &&
        track.status == GpsTrackingStatus.active;

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Status banner ──────────────────────────────────────────────
          _StatusBanner(status: trip.status),
          const SizedBox(height: 16),

          // ── Trip reference ─────────────────────────────────────────────
          _Section(
            icon: Icons.confirmation_number_outlined,
            title: 'Booking Reference',
            children: [
              _DetailRow(
                'Booking No.',
                trip.bookingNumber ?? trip.bookingId ?? '—',
              ),
              _DetailRow('Trip Type', trip.tripTypeLabel),
              if (trip.startDate != null)
                _DetailRow(
                  'Date',
                  DateFormat('EEEE, d MMMM yyyy').format(trip.startDate!),
                ),
              if (trip.startTime != null)
                _DetailRow('Pickup Time', trip.displayTime),
              if (trip.endDate != null)
                _DetailRow(
                  'Return Date',
                  DateFormat('d MMM yyyy').format(trip.endDate!),
                ),
            ],
          ),
          const SizedBox(height: 12),

          // ── Route ─────────────────────────────────────────────────────
          _Section(
            icon: Icons.route_outlined,
            title: 'Route',
            children: [
              _LocationRow(
                icon: Icons.trip_origin,
                color: Theme.of(context).colorScheme.primary,
                label: 'Pickup',
                value: trip.pickupLocation ?? '—',
              ),
              const SizedBox(height: 8),
              _LocationRow(
                icon: Icons.location_on,
                color: Theme.of(context).colorScheme.error,
                label: 'Drop-off',
                value: trip.dropLocation ?? '—',
              ),
              if (trip.totalKm != null) ...[
                const Divider(height: 20),
                _DetailRow(
                  'Distance',
                  '${trip.totalKm!.toStringAsFixed(1)} km',
                ),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // ── Customer ──────────────────────────────────────────────────
          _Section(
            icon: Icons.person_outline,
            title: 'Customer',
            children: [
              _DetailRow('Name', trip.customerName ?? '—'),
              if (!trip.isCompleted &&
                  !trip.isClosed &&
                  !trip.isCancelled &&
                  trip.customerContact != null)
                _PhoneRow(phone: trip.customerContact!),
            ],
          ),
          const SizedBox(height: 12),

          // ── Vehicle ───────────────────────────────────────────────────
          if (trip.vehicleReg != null)
            _Section(
              icon: Icons.directions_car_outlined,
              title: 'Vehicle',
              children: [_DetailRow('Registration', trip.vehicleReg!)],
            ),

          // ── Extra stops from type_data ────────────────────────────────
          if (_hasStops(trip)) ...[
            const SizedBox(height: 12),
            _StopsSection(typeData: trip.typeData!),
          ],

          // ── Notes ─────────────────────────────────────────────────────
          if (trip.notes != null && trip.notes!.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            _Section(
              icon: Icons.notes_outlined,
              title: 'Notes',
              children: [
                Text(
                  trip.notes!,
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ],

          // ── GPS / lifecycle actions (Day 47) ──────────────────────────
          if (trip.isAssigned || trip.isStarted) ...[
            const SizedBox(height: 12),
            _TripActions(
              trip: trip,
              busy: _busy,
              gpsActiveForThisTrip: gpsActiveForThisTrip,
              onStart: _startTrip,
              onComplete: _completeTrip,
              onRetryGps: _retryGps,
            ),
          ],

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  bool _hasStops(TripModel t) =>
      t.typeData != null &&
      t.typeData!['stops'] is List &&
      (t.typeData!['stops'] as List).isNotEmpty;
}

// ── Action area: START / COMPLETE + live GPS banner ──────────────────────────

class _TripActions extends ConsumerWidget {
  const _TripActions({
    required this.trip,
    required this.busy,
    required this.gpsActiveForThisTrip,
    required this.onStart,
    required this.onComplete,
    required this.onRetryGps,
  });

  final TripModel trip;
  final bool busy;
  final bool gpsActiveForThisTrip;
  final VoidCallback onStart;
  final VoidCallback onComplete;
  final VoidCallback onRetryGps;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final track = ref.watch(gpsTrackingProvider);

    return Column(
      children: [
        // ── Live GPS banner while a tracked trip is running ───────────
        if (trip.isStarted && gpsActiveForThisTrip) ...[
          _LiveGpsBanner(track: track),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => context.push(AppRoutes.tripMap(trip.id)),
            icon: const Icon(Icons.map_outlined),
            label: const Text('View Live Map'),
          ),
          const SizedBox(height: 12),
        ],

        // ── GPS retry hint when the trip is started but tracking isn't ──
        if (trip.isStarted && !gpsActiveForThisTrip && !busy) ...[
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(Icons.gps_off, color: Colors.orange.shade800),
              title: const Text('GPS is not running'),
              subtitle: const Text(
                'Tracking stopped unexpectedly — tap to resume.',
              ),
              trailing: TextButton(
                onPressed: onRetryGps,
                child: const Text('Start'),
              ),
            ),
          ),
          const SizedBox(height: 12),
        ],

        // ── Primary lifecycle button ──────────────────────────────────
        SizedBox(
          width: double.infinity,
          height: 52,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: trip.isAssigned
                  ? Colors.green.shade700
                  : theme.colorScheme.errorContainer,
              foregroundColor: trip.isAssigned
                  ? Colors.white
                  : theme.colorScheme.onErrorContainer,
            ),
            onPressed: busy ? null : (trip.isAssigned ? onStart : onComplete),
            icon: busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Icon(
                    trip.isAssigned
                        ? Icons.play_arrow_rounded
                        : Icons.stop_rounded,
                  ),
            label: Text(
              busy
                  ? 'Working…'
                  : trip.isAssigned
                  ? 'START TRIP'
                  : 'STOP TRIP — Complete',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ],
    );
  }
}

// ── Live GPS status banner ────────────────────────────────────────────────────

class _LiveGpsBanner extends StatelessWidget {
  const _LiveGpsBanner({required this.track});
  final GpsTrackState track;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pos = track.lastPosition;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: track.temporarilyOffline
            ? Colors.orange.shade50
            : Colors.green.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: track.temporarilyOffline
              ? Colors.orange.shade300
              : Colors.green.shade200,
        ),
      ),
      child: Row(
        children: [
          Icon(
            track.temporarilyOffline ? Icons.cloud_off : Icons.gps_fixed,
            color: track.temporarilyOffline
                ? Colors.orange.shade800
                : Colors.green.shade700,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  track.temporarilyOffline
                      ? 'GPS temporarily offline'
                      : 'GPS Active',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: track.temporarilyOffline
                        ? Colors.orange.shade900
                        : Colors.green.shade800,
                  ),
                ),
                Text(
                  pos == null
                      ? 'Waiting for first fix…'
                      : '${track.routePoints.length} points recorded · '
                            '±${pos.accuracy.toStringAsFixed(0)} m · '
                            'updated ${TimeOfDay.fromDateTime(pos.timestamp).format(context)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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

// ── Section wrapper ───────────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  const _Section({
    required this.icon,
    required this.title,
    required this.children,
  });
  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            ...children,
          ],
        ),
      ),
    );
  }
}

// ── Row widgets ───────────────────────────────────────────────────────────────

class _DetailRow extends StatelessWidget {
  const _DetailRow(this.label, this.value);
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PhoneRow extends StatelessWidget {
  const _PhoneRow({required this.phone});
  final String phone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(
              'Contact',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              phone,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.copy, size: 16),
            tooltip: 'Copy number',
            onPressed: () {
              Clipboard.setData(ClipboardData(text: phone));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Phone number copied'),
                  duration: Duration(seconds: 2),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _LocationRow extends StatelessWidget {
  const _LocationRow({
    required this.icon,
    required this.color,
    required this.label,
    required this.value,
  });
  final IconData icon;
  final Color color;
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              Text(
                value,
                style: theme.textTheme.bodyLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StopsSection extends StatelessWidget {
  const _StopsSection({required this.typeData});
  final Map<String, dynamic> typeData;

  @override
  Widget build(BuildContext context) {
    final stops = (typeData['stops'] as List).cast<String>();
    return _Section(
      icon: Icons.stop_circle_outlined,
      title: 'Stops (${stops.length})',
      children: stops
          .asMap()
          .entries
          .map(
            (e) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 10,
                    backgroundColor: Theme.of(
                      context,
                    ).colorScheme.primaryContainer,
                    child: Text(
                      '${e.key + 1}',
                      style: TextStyle(
                        fontSize: 11,
                        color: Theme.of(context).colorScheme.onPrimaryContainer,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Text(e.value)),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

class _StatusBanner extends StatelessWidget {
  const _StatusBanner({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (bg, fg, icon, label) = switch (status) {
      'assigned' => (
        theme.colorScheme.primaryContainer,
        theme.colorScheme.onPrimaryContainer,
        Icons.assignment_ind_outlined,
        'Assigned',
      ),
      'started' => (
        const Color(0xFFE8F5E9),
        const Color(0xFF1B5E20),
        Icons.play_circle_outline,
        'In Progress',
      ),
      'completed' => (
        theme.colorScheme.surfaceContainerHighest,
        theme.colorScheme.onSurfaceVariant,
        Icons.check_circle_outline,
        'Completed',
      ),
      'cancelled' => (
        theme.colorScheme.errorContainer,
        theme.colorScheme.onErrorContainer,
        Icons.cancel_outlined,
        'Cancelled',
      ),
      _ => (
        theme.colorScheme.surfaceContainerHighest,
        theme.colorScheme.onSurfaceVariant,
        Icons.info_outline,
        status,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: fg, size: 20),
          const SizedBox(width: 10),
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontWeight: FontWeight.bold,
              fontSize: 15,
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
