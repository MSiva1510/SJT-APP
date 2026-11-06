// ─────────────────────────────────────────────────────────────────────────────
// driver_bookings_screen.dart
// All bookings assigned to the authenticated driver.
// Grouped: Active (assigned/started) → Upcoming → Past
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/booking.dart';
import '../../providers/booking_provider.dart';
import '../../navigation/app_router.dart';
import '../../widgets/driver/booking_card.dart';

class DriverBookingsScreen extends ConsumerStatefulWidget {
  const DriverBookingsScreen({super.key});

  @override
  ConsumerState<DriverBookingsScreen> createState() =>
      _DriverBookingsScreenState();
}

class _DriverBookingsScreenState extends ConsumerState<DriverBookingsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 3, vsync: this);
    Future.microtask(() => ref.read(driverBookingsProvider.notifier).load());
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(driverBookingsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Bookings'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Active'),
            Tab(text: 'Upcoming'),
            Tab(text: 'Past'),
          ],
        ),
      ),
      body: switch (state) {
        BookingListInitial() || BookingListLoading() => const _LoadingState(),

        BookingListRefreshing(:final previous) => _buildTabs(
          context,
          previous,
          isRefreshing: true,
        ),

        BookingListLoaded(:final bookings) => _buildTabs(context, bookings),

        BookingListEmpty() => _EmptyState(
          onRefresh: () => ref.read(driverBookingsProvider.notifier).refresh(),
        ),

        BookingListError(:final message) => _ErrorState(
          message: message,
          onRetry: () => ref.read(driverBookingsProvider.notifier).refresh(),
        ),
      },
    );
  }

  Widget _buildTabs(
    BuildContext context,
    List<BookingModel> all, {
    bool isRefreshing = false,
  }) {
    final active = all.where((b) => b.isActive).toList();
    final upcoming = all
        .where((b) => b.isAssigned && b.isUpcoming && !b.isActive)
        .toList();
    final past = all.where((b) => b.isCompleted || b.isCancelled).toList();

    return Stack(
      children: [
        TabBarView(
          controller: _tabs,
          children: [
            _BookingList(
              bookings: active,
              emptyText: 'No active bookings right now.',
              onTap: (id) => context.push(AppRoutes.bookingDetail(id)),
            ),
            _BookingList(
              bookings: upcoming,
              emptyText: 'No upcoming bookings.',
              onTap: (id) => context.push(AppRoutes.bookingDetail(id)),
            ),
            _BookingList(
              bookings: past,
              emptyText: 'No past bookings.',
              onTap: (id) => context.push(AppRoutes.bookingDetail(id)),
            ),
          ],
        ),
        if (isRefreshing)
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: LinearProgressIndicator(),
          ),
      ],
    );
  }
}

// ── Booking list ──────────────────────────────────────────────────────────────

class _BookingList extends StatelessWidget {
  const _BookingList({
    required this.bookings,
    required this.emptyText,
    required this.onTap,
  });

  final List<BookingModel> bookings;
  final String emptyText;
  final void Function(String id) onTap;

  @override
  Widget build(BuildContext context) {
    if (bookings.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.event_note_outlined,
              size: 48,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: 12),
            Text(
              emptyText,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: bookings.length,
        itemBuilder: (ctx, i) => BookingCard(
          booking: bookings[i],
          onTap: () => onTap(bookings[i].id),
        ),
      ),
    );
  }
}

// ── States ────────────────────────────────────────────────────────────────────

class _LoadingState extends StatelessWidget {
  const _LoadingState();

  @override
  Widget build(BuildContext context) => const Center(
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircularProgressIndicator(),
        SizedBox(height: 16),
        Text('Loading your bookings…'),
      ],
    ),
  );
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.event_busy_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            'No bookings assigned yet.',
            style: theme.textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Pull down to check for updates.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: onRefresh,
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh'),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_outlined,
              size: 64,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }
}
