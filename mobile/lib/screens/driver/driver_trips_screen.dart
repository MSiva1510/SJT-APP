import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/trip.dart';
import '../../navigation/app_router.dart';
import '../../providers/trip_provider.dart';
import '../../widgets/driver/trip_card.dart';

enum _TripRange { today, upcoming, all }

class DriverTripsScreen extends ConsumerStatefulWidget {
  const DriverTripsScreen({super.key});

  @override
  ConsumerState<DriverTripsScreen> createState() => _DriverTripsScreenState();
}

class _DriverTripsScreenState extends ConsumerState<DriverTripsScreen> {
  _TripRange _range = _TripRange.all;
  final _search = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(allDriverTripsProvider.notifier).load());
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<TripModel> _filtered(
    List<TripModel> trips, {
    _TripRange? range,
    String? queryText,
  }) {
    final today = DateTime.now();
    final startOfToday = DateTime(today.year, today.month, today.day);
    final tomorrow = startOfToday.add(const Duration(days: 1));
    final selectedRange = range ?? _range;
    final query = (queryText ?? _query).trim().toLowerCase();
    return trips.where((trip) {
      final date = trip.startDate;
      final matchesRange = switch (selectedRange) {
        _TripRange.today => date != null && _dateOnly(date) == startOfToday,
        _TripRange.upcoming =>
          date != null &&
              !_dateOnly(date).isBefore(tomorrow) &&
              !trip.isCompleted &&
              !trip.isClosed &&
              !trip.isCancelled,
        _TripRange.all => true,
      };
      final matchesQuery =
          query.isEmpty ||
          [
            trip.bookingNumber,
            trip.customerName,
            trip.pickupLocation,
            trip.dropLocation,
            trip.vehicleReg,
            trip.status,
          ].any((value) => value?.toLowerCase().contains(query) ?? false);
      return matchesRange && matchesQuery;
    }).toList()..sort((a, b) {
      final aDate = a.startDate ?? DateTime(9999);
      final bDate = b.startDate ?? DateTime(9999);
      return selectedRange == _TripRange.all
          ? bDate.compareTo(aDate)
          : aDate.compareTo(bDate);
    });
  }

  Future<void> _refresh() =>
      ref.read(allDriverTripsProvider.notifier).refresh();

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(allDriverTripsProvider);
    final theme = Theme.of(context);
    final trips = switch (state) {
      TripListLoaded(:final trips) => _filtered(trips),
      TripListRefreshing(:final previous) => _filtered(previous),
      _ => const <TripModel>[],
    };

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('My trips'),
            Text(
              '${DateFormat('EEE, d MMM').format(DateTime.now())} · ${trips.length} shown',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              controller: _search,
              onChanged: (value) => setState(() => _query = value),
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search booking, customer, route or vehicle',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _query.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear search',
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          setState(() => _query = '');
                        },
                      ),
                filled: true,
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
            ),
          ),
          SizedBox(
            height: 40,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: [
                for (final range in _TripRange.values) ...[
                  ChoiceChip(
                    label: Text(
                      '${switch (range) {
                        _TripRange.today => 'Today',
                        _TripRange.upcoming => 'Upcoming',
                        _TripRange.all => 'All',
                      }} · ${_filteredForRange(state, range)}',
                    ),
                    selected: _range == range,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _range = range),
                  ),
                  const SizedBox(width: 8),
                ],
              ],
            ),
          ),
          Expanded(
            child: switch (state) {
              TripListInitial() || TripListLoading() => const Center(
                child: CircularProgressIndicator(),
              ),
              TripListError(:final message) => _ErrorState(
                message: message,
                onRetry: _refresh,
              ),
              TripListLoaded() || TripListRefreshing() =>
                trips.isEmpty
                    ? _EmptyState(range: _range, onRefresh: _refresh)
                    : RefreshIndicator(
                        onRefresh: _refresh,
                        child: ListView.builder(
                          padding: const EdgeInsets.fromLTRB(8, 8, 8, 24),
                          itemCount: trips.length,
                          itemBuilder: (context, index) => TripCard(
                            trip: trips[index],
                            onTap: () => context.push(
                              AppRoutes.tripDetail(trips[index].id),
                            ),
                          ),
                        ),
                      ),
              TripListEmpty() => _EmptyState(
                range: _range,
                onRefresh: _refresh,
              ),
            },
          ),
        ],
      ),
    );
  }

  int _filteredForRange(TripListState state, _TripRange range) {
    final rows = switch (state) {
      TripListLoaded(:final trips) => trips,
      TripListRefreshing(:final previous) => previous,
      _ => const <TripModel>[],
    };
    return _filtered(rows, range: range).length;
  }
}

DateTime _dateOnly(DateTime value) =>
    DateTime(value.year, value.month, value.day);

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.range, required this.onRefresh});

  final _TripRange range;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final label = switch (range) {
      _TripRange.today => 'No trips today',
      _TripRange.upcoming => 'No upcoming trips',
      _TripRange.all => 'No trips yet',
    };
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.55,
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.route_outlined,
                    size: 64,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                  const SizedBox(height: 12),
                  Text(label, style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 6),
                  const Text('Pull down to check for updates.'),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.cloud_off_outlined,
            size: 56,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Try again'),
          ),
        ],
      ),
    ),
  );
}
