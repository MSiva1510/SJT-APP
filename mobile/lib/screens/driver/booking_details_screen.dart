// ─────────────────────────────────────────────────────────────────────────────
// booking_details_screen.dart
// Full booking details for the driver.
// Loads vehicle info (JOIN) and booking stops.
// NEVER shows: base_fare, total_fare, approval_history, admin workflow fields.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/booking.dart';
import '../../providers/booking_provider.dart';

class BookingDetailsScreen extends ConsumerWidget {
  const BookingDetailsScreen({super.key, required this.bookingId});
  final String bookingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(bookingDetailProvider(bookingId));

    return Scaffold(
      appBar: AppBar(title: const Text('Booking Details')),
      body: switch (state) {
        BookingDetailLoading() => const Center(
          child: CircularProgressIndicator(),
        ),
        BookingDetailError(:final message) => _ErrorState(message: message),
        BookingDetailLoaded(:final booking) => _BookingDetail(booking: booking),
      },
    );
  }
}

// ── Full detail view ──────────────────────────────────────────────────────────

class _BookingDetail extends StatelessWidget {
  const _BookingDetail({required this.booking});
  final BookingModel booking;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Status banner ─────────────────────────────────────────────
          _StatusBanner(status: booking.status),
          const SizedBox(height: 16),

          // ── Booking reference ─────────────────────────────────────────
          _Section(
            icon: Icons.confirmation_number_outlined,
            title: 'Booking Reference',
            children: [
              _Row('Booking No.', booking.bookingNumber ?? '—'),
              _Row('Type', booking.tripTypeLabel),
              if (booking.startDate != null)
                _Row(
                  'Date',
                  DateFormat('EEEE, d MMMM yyyy').format(booking.startDate!),
                ),
              _Row('Time', booking.displayTime),
              if (booking.endDate != null)
                _Row(
                  'Return Date',
                  DateFormat('d MMM yyyy').format(booking.endDate!),
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
                value: booking.pickupLocation ?? '—',
              ),
              // Intermediate stops from booking_stops table
              if (booking.stops.isNotEmpty) ...[
                const SizedBox(height: 4),
                ...booking.stops.map((s) => _StopRow(stop: s)),
              ],
              // Also show stops from type_data JSONB if present
              if (booking.typeDataStops.isNotEmpty && booking.stops.isEmpty)
                ...booking.typeDataStops.asMap().entries.map(
                  (e) =>
                      _StopRow.fromText(number: e.key + 1, location: e.value),
                ),
              const SizedBox(height: 4),
              _LocationRow(
                icon: Icons.location_on,
                color: Theme.of(context).colorScheme.error,
                label: 'Drop-off',
                value: booking.dropLocation ?? '—',
              ),
              if (booking.totalKm != null) ...[
                const Divider(height: 20),
                _Row('Distance', '${booking.totalKm!.toStringAsFixed(1)} km'),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // ── Customer ──────────────────────────────────────────────────
          _Section(
            icon: Icons.person_outline,
            title: 'Customer',
            children: [
              _Row('Name', booking.customerName ?? '—'),
              if (booking.customerContact != null)
                _PhoneRow(phone: booking.customerContact!),
            ],
          ),
          const SizedBox(height: 12),

          // ── Vehicle ───────────────────────────────────────────────────
          _Section(
            icon: Icons.directions_car_outlined,
            title: 'Vehicle',
            children: [
              if (booking.vehicleInfo != null) ...[
                _Row('Registration', booking.vehicleInfo!.registration ?? '—'),
                _Row('Type', booking.vehicleInfo!.vehicleType ?? '—'),
                _Row(
                  'Details',
                  '${booking.vehicleInfo!.make ?? ''} '
                              '${booking.vehicleInfo!.model ?? ''}'
                          .trim()
                          .isEmpty
                      ? '—'
                      : '${booking.vehicleInfo!.make ?? ''} ${booking.vehicleInfo!.model ?? ''}',
                ),
                _Row('Color', booking.vehicleInfo!.color ?? '—'),
                _Row('Status', booking.vehicleInfo!.status ?? '—'),
              ] else ...[
                _Row('Registration', booking.vehicleReg ?? '—'),
              ],
            ],
          ),
          const SizedBox(height: 12),

          // ── Notes ─────────────────────────────────────────────────────
          if ((booking.notes != null && booking.notes!.isNotEmpty) ||
              (booking.remarks != null && booking.remarks!.isNotEmpty)) ...[
            _Section(
              icon: Icons.notes_outlined,
              title: 'Notes',
              children: [
                if (booking.notes != null && booking.notes!.isNotEmpty)
                  Text(booking.notes!),
                if (booking.remarks != null && booking.remarks!.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Remarks: ${booking.remarks!}',
                    style: const TextStyle(fontStyle: FontStyle.italic),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
          ],

          // ── Trip execution record ─────────────────────────────────────
          _Section(
            icon: Icons.play_circle_outline,
            title: 'Trip Execution',
            children: [
              Row(
                children: [
                  Icon(
                    Icons.info_outline,
                    size: 16,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Trip execution records are created when the trip '
                      'is started from the ERP dashboard.',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 32),
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

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);
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
            tooltip: 'Copy',
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
        const SizedBox(width: 10),
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

class _StopRow extends StatelessWidget {
  const _StopRow({required this.stop});
  final BookingStop stop;

  factory _StopRow.fromText({required int number, required String location}) {
    return _StopRow(
      stop: BookingStop(
        id: 'td_$number',
        stopNumber: number,
        location: location,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: theme.colorScheme.secondaryContainer,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                '${stop.stopNumber}',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  color: theme.colorScheme.onSecondaryContainer,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(stop.location, style: theme.textTheme.bodyMedium),
          ),
        ],
      ),
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
