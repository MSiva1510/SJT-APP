// ─────────────────────────────────────────────────────────────────────────────
// manager_trip_detail_screen.dart — one booking for the manager.
// Shows every field, the route map (TripRouteCard), calls the customer, assigns driver + vehicle (bottom
// sheet: active drivers, active vehicles) and moves the trip through the web
// workflow (ManagerRepository.transitions). Approve / cancel / close ask for
// optional remarks, like the web ERP.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/formatters.dart';
import '../../models/manager_models.dart';
import '../../providers/manager_provider.dart';
import '../../repositories/manager_repository.dart';
import '../../widgets/driver/status_chip.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/manager/trip_route_card.dart';
import '../../../core/theme/home_tokens.dart';

const _remarkStatuses = {'approved', 'cancelled', 'closed'};
const _assignableStatuses = {
  'draft',
  'pending',
  'approved',
  'confirmed',
  'assigned',
};

String transitionLabel(String to) => switch (to) {
  'pending' => 'Submit for approval',
  'approved' => 'Approve',
  'draft' => 'Back to draft',
  'assigned' => 'Mark assigned',
  'started' => 'Mark started',
  'completed' => 'Mark completed',
  'closed' => 'Close trip',
  'cancelled' => 'Cancel trip',
  _ => titleCase(to),
};

class ManagerTripDetailScreen extends ConsumerStatefulWidget {
  const ManagerTripDetailScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  ConsumerState<ManagerTripDetailScreen> createState() =>
      _ManagerTripDetailScreenState();
}

class _ManagerTripDetailScreenState
    extends ConsumerState<ManagerTripDetailScreen> {
  bool _busy = false;

  void _invalidateAll() {
    ref.invalidate(managerBookingProvider(widget.bookingId));
    ref.invalidate(managerBookingsProvider);
    ref.invalidate(managerDashboardProvider);
  }

  Future<void> _refresh() async {
    ref.invalidate(managerBookingProvider(widget.bookingId));
    try {
      await ref.read(managerBookingProvider(widget.bookingId).future);
    } catch (_) {
      /* error state renders */
    }
  }

  Future<void> _run(Future<void> Function() write, String done) async {
    setState(() => _busy = true);
    try {
      await write();
      _invalidateAll();
      if (mounted) showManagerSnack(context, done);
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _transition(ManagerBooking b, String to) async {
    // Moving to "assigned" without a driver/vehicle → pick them first.
    if (to == 'assigned' && !b.isAssigned) return _assign(b);

    String? remarks;
    if (_remarkStatuses.contains(to)) {
      remarks = await promptManagerText(
        context,
        title: '${transitionLabel(to)}?',
        confirmLabel: transitionLabel(to),
        destructive: to == 'cancelled',
      );
      if (remarks == null || !mounted) return;
    }
    final actor = ref.read(managerActorProvider);
    await _run(
      () => ref
          .read(managerRepositoryProvider)
          .changeStatus(
            booking: b,
            to: to,
            actorName: actor.name,
            actorRole: actor.role,
            remarks: remarks,
          ),
      'Trip moved to ${StatusChip.label(to).toLowerCase()}',
    );
  }

  Future<void> _assign(ManagerBooking b) async {
    final pick = await showModalBottomSheet<(DriverOption, VehicleOption)>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Theme.of(context).home.card,
      builder: (_) => AssignSheet(booking: b),
    );
    if (pick == null || !mounted) return;
    final actor = ref.read(managerActorProvider);
    await _run(
      () => ref
          .read(managerRepositoryProvider)
          .assign(
            booking: b,
            driver: pick.$1,
            vehicle: pick.$2,
            actorName: actor.name,
          ),
      'Assigned ${pick.$1.name} · ${pick.$2.registration}',
    );
  }

  Future<void> _call(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    try {
      if (!await launchUrl(uri) && mounted) {
        showManagerSnack(context, 'Could not start a call', error: true);
      }
    } catch (_) {
      if (mounted) {
        showManagerSnack(context, 'Could not start a call', error: true);
      }
    }
  }

  Future<void> _sendBookingMessage(
    ManagerBooking booking, {
    required bool confirmation,
  }) async {
    final phone = booking.customerContact?.trim();
    if (phone == null || phone.isEmpty) return;
    final date = booking.startDate == null
        ? 'To be confirmed'
        : DateFormat('d MMM yyyy').format(booking.startDate!);
    final time = managerClock(booking.startTime);
    final route = '${booking.pickup ?? '—'} to ${booking.drop ?? '—'}';
    final text = confirmation
        ? 'Your booking ${booking.label} is confirmed. '
              'Date: $date${time.isEmpty ? '' : ' at $time'}. Route: $route.'
        : 'Booking ${booking.label} update: ${titleCase(booking.status)}. '
              'Date: $date${time.isEmpty ? '' : ' at $time'}. Route: $route.';
    final action = confirmation
        ? 'booking_confirmation'
        : 'booking_notification';
    await _run(
      () => ref
          .read(managerRepositoryProvider)
          .sendManagerWhatsApp(action: action, phone: phone, text: text),
      confirmation ? 'Confirmation sent on WhatsApp' : 'Booking update sent',
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerBookingProvider(widget.bookingId));

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: Text(async.valueOrNull?.label ?? 'Trip'),
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: _refresh,
        child: async.when(
          skipLoadingOnRefresh: true,
          loading: () => ListView(children: const [MLoading(height: 300)]),
          error: (e, _) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(20),
            children: [
              MError(
                error: e,
                onRetry: () =>
                    ref.invalidate(managerBookingProvider(widget.bookingId)),
              ),
            ],
          ),
          data: (b) => _body(context, b),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, ManagerBooking b) {
    final t = Theme.of(context).home;
    final next = ManagerRepository.transitions[b.status] ?? const <String>[];
    final canAssign = _assignableStatuses.contains(b.status);
    final error = Theme.of(context).colorScheme.error;
    final day = DateFormat('EEE, d MMM yyyy');

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        // ── Summary ────────────────────────────────────────────────────────
        MCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  StatusChip(status: b.status),
                  const Spacer(),
                  if (b.type != null)
                    MTag(label: titleCase(b.type), color: t.primary),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                b.customerName ?? 'Customer not set',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.3,
                  color: t.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                managerWhen(b),
                style: TextStyle(fontSize: 13.5, color: t.textSecondary),
              ),
              if (b.totalFare != null) ...[
                const SizedBox(height: 12),
                Text(
                  inr.format(b.totalFare),
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: t.textPrimary,
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),

        // ── Customer ───────────────────────────────────────────────────────
        MCard(
          child: Row(
            children: [
              Expanded(
                child: _Field(
                  label: 'Customer contact',
                  value: b.customerContact ?? 'Not provided',
                ),
              ),
              if (b.customerContact != null)
                FilledButton.tonalIcon(
                  // Theme default is full-width; unbounded inside this Row.
                  style: FilledButton.styleFrom(minimumSize: const Size(0, 40)),
                  onPressed: () => _call(b.customerContact!),
                  icon: const Icon(Icons.call_outlined, size: 18),
                  label: const Text('Call'),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        if (b.customerContact?.trim().isNotEmpty == true) ...[
          MCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WhatsApp customer',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _sendBookingMessage(b, confirmation: false),
                    icon: const Icon(Icons.notifications_outlined),
                    label: const Text('Send booking update'),
                  ),
                ),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _sendBookingMessage(b, confirmation: true),
                    icon: const Icon(Icons.check_circle_outline),
                    label: const Text('Send confirmation'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],

        // ── Route & schedule ───────────────────────────────────────────────
        MCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Field(
                label: 'Pickup',
                value: b.pickup ?? '—',
                icon: Icons.trip_origin,
              ),
              const SizedBox(height: 12),
              _Field(
                label: 'Drop',
                value: b.drop ?? '—',
                icon: Icons.location_on_outlined,
              ),
              const Divider(height: 28),
              Row(
                children: [
                  Expanded(
                    child: _Field(
                      label: 'Start',
                      value: b.startDate == null
                          ? '—'
                          : [
                              day.format(b.startDate!),
                              managerClock(b.startTime),
                            ].where((s) => s.isNotEmpty).join('\n'),
                    ),
                  ),
                  Expanded(
                    child: _Field(
                      label: 'End',
                      value: b.endDate == null ? '—' : day.format(b.endDate!),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _Field(
                      label: 'Distance',
                      value: b.totalKm == null
                          ? '—'
                          : '${b.totalKm!.toStringAsFixed(b.totalKm! % 1 == 0 ? 0 : 1)} km',
                    ),
                  ),
                  Expanded(
                    child: _Field(
                      label: 'Booked',
                      value: b.createdAt == null
                          ? '—'
                          : DateFormat(
                              'd MMM, h:mm a',
                            ).format(b.createdAt!.toLocal()),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // ── Route map ──────────────────────────────────────────────────────
        TripRouteCard(bookingId: b.id),
        const SizedBox(height: 12),

        // ── Assignment ─────────────────────────────────────────────────────
        MCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: _Field(
                      label: 'Driver',
                      value: b.driverName ?? 'Not assigned',
                      icon: Icons.person_outline,
                    ),
                  ),
                  Expanded(
                    child: _Field(
                      label: 'Vehicle',
                      value: b.vehicleReg ?? 'Not assigned',
                      icon: Icons.directions_car_outlined,
                    ),
                  ),
                ],
              ),
              if (canAssign) ...[
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : () => _assign(b),
                    icon: const Icon(Icons.assignment_ind_outlined, size: 18),
                    label: Text(
                      b.isAssigned
                          ? 'Reassign driver & vehicle'
                          : 'Assign driver & vehicle',
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),

        if (b.notes != null) ...[
          const SizedBox(height: 12),
          MCard(
            child: _Field(label: 'Notes', value: b.notes!),
          ),
        ],

        // ── Workflow ───────────────────────────────────────────────────────
        if (next.isNotEmpty) ...[
          const SizedBox(height: 24),
          const MSectionLabel('Next step'),
          for (final to in next) ...[
            SizedBox(
              width: double.infinity,
              height: 48,
              child: to == 'cancelled'
                  ? OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: error,
                        side: BorderSide(color: error.withValues(alpha: 0.5)),
                      ),
                      onPressed: _busy ? null : () => _transition(b, to),
                      child: Text(transitionLabel(to)),
                    )
                  : FilledButton(
                      onPressed: _busy ? null : () => _transition(b, to),
                      child: Text(transitionLabel(to)),
                    ),
            ),
            const SizedBox(height: 10),
          ],
        ],
        if (_busy) const LinearProgressIndicator(),
      ],
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, this.icon});
  final String label;
  final String value;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (icon != null) ...[
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 18, color: t.textSecondary),
          ),
          const SizedBox(width: 8),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: t.textSecondary,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                style: TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w600,
                  color: t.textPrimary,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Assign sheet ─────────────────────────────────────────────────────────────

/// Pops `(driver, vehicle)` when confirmed. Lists only active drivers and
/// vehicles with status `active`.
class AssignSheet extends ConsumerStatefulWidget {
  const AssignSheet({super.key, required this.booking});
  final ManagerBooking booking;

  @override
  ConsumerState<AssignSheet> createState() => _AssignSheetState();
}

class _AssignSheetState extends ConsumerState<AssignSheet> {
  String? _driverId;
  String? _vehicleId;

  @override
  void initState() {
    super.initState();
    _driverId = widget.booking.driverId;
    _vehicleId = widget.booking.vehicleId;
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final driversAsync = ref.watch(managerDriversProvider);
    final vehiclesAsync = ref.watch(managerVehiclesProvider);
    final drivers = driversAsync.valueOrNull
        ?.where((d) => d.status == 'active')
        .toList();
    final vehicles = vehiclesAsync.valueOrNull
        ?.where((v) => v.status == 'active')
        .toList();

    final driver = drivers?.where((d) => d.id == _driverId).firstOrNull;
    final vehicle = vehicles?.where((v) => v.id == _vehicleId).firstOrNull;

    Widget section<T>({
      required String title,
      required AsyncValue<List<T>> async,
      required List<T>? items,
      required String emptyText,
      required Widget Function(T) chip,
      required VoidCallback retry,
    }) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          if (async.hasError)
            MError(error: async.error!, onRetry: retry)
          else if (items == null)
            const MLoading(height: 60)
          else if (items.isEmpty)
            Text(emptyText, style: TextStyle(color: t.textSecondary))
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [for (final i in items) chip(i)],
            ),
        ],
      );
    }

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.8,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Assign ${widget.booking.label}',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: t.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Only active drivers and vehicles are listed.',
                style: TextStyle(fontSize: 13, color: t.textSecondary),
              ),
              const SizedBox(height: 18),
              section<DriverOption>(
                title: 'Driver',
                async: driversAsync,
                items: drivers,
                emptyText: 'No active drivers.',
                retry: () => ref.invalidate(managerDriversProvider),
                chip: (d) => ChoiceChip(
                  label: Text(d.name),
                  selected: d.id == _driverId,
                  onSelected: (_) => setState(() => _driverId = d.id),
                ),
              ),
              const SizedBox(height: 18),
              section<VehicleOption>(
                title: 'Vehicle',
                async: vehiclesAsync,
                items: vehicles,
                emptyText: 'No active vehicles.',
                retry: () => ref.invalidate(managerVehiclesProvider),
                chip: (v) => ChoiceChip(
                  label: Text(
                    v.makeModel == null
                        ? v.registration
                        : '${v.registration} · ${v.makeModel}',
                  ),
                  selected: v.id == _vehicleId,
                  onSelected: (_) => setState(() => _vehicleId = v.id),
                ),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: driver == null || vehicle == null
                      ? null
                      : () => Navigator.pop(context, (driver, vehicle)),
                  child: const Text('Assign'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
