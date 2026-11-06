// ─────────────────────────────────────────────────────────────────────────────
// manager_trips_screen.dart — every booking for the manager: search box +
// filter chips (All · Today · Upcoming · Unassigned · Pending · Active ·
// Completed). Tap a card → manager trip detail.
//
// Data: managerBookingsProvider (newest 200 by start date). Filtering and
// search run client-side over that list.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/manager_models.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/manager_ui.dart';
import 'manager_home_screen.dart' show ManagerTripTile;
import '../../../core/theme/home_tokens.dart';

/// Pure filter + search (exposed for tests).
List<ManagerBooking> filterManagerTrips(
  List<ManagerBooking> all,
  ManagerTripFilter filter,
  String query, {
  DateTime? now,
}) {
  final n = now ?? DateTime.now();
  final q = query.trim().toLowerCase();
  return all.where((b) {
    if (!filter.matches(b, n)) return false;
    if (q.isEmpty) return true;
    return [
      b.bookingNumber,
      b.customerName,
      b.customerContact,
      b.driverName,
      b.vehicleReg,
      b.pickup,
      b.drop,
    ].any((f) => f != null && f.toLowerCase().contains(q));
  }).toList();
}

class ManagerTripsScreen extends ConsumerStatefulWidget {
  const ManagerTripsScreen({super.key});

  @override
  ConsumerState<ManagerTripsScreen> createState() => _ManagerTripsScreenState();
}

class _ManagerTripsScreenState extends ConsumerState<ManagerTripsScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(managerBookingsProvider);
    try {
      await ref.read(managerBookingsProvider.future);
    } catch (_) {
      /* error state renders */
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final filter = ref.watch(managerTripFilterProvider);
    final trips = ref.watch(managerBookingsProvider);

    return Scaffold(
      backgroundColor: t.canvas,
      floatingActionButton: FloatingActionButton.extended(
        heroTag: null,
        onPressed: () => context.push(AppRoutes.managerNewBooking),
        icon: const Icon(Icons.add_rounded),
        label: const Text('New booking'),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: Column(
                children: [
                  MScreenTitle(
                    'Trips',
                    subtitle: trips.hasValue
                        ? '${trips.value!.length} bookings'
                        : 'Bookings & dispatch',
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _search,
                    onChanged: (v) => setState(() => _query = v),
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      hintText: 'Search booking, customer, driver, vehicle',
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
                      fillColor: t.card,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: t.cardBorder),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide(color: t.cardBorder),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                itemCount: ManagerTripFilter.values.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final f = ManagerTripFilter.values[i];
                  final count = trips.valueOrNull == null
                      ? null
                      : filterManagerTrips(trips.value!, f, '').length;
                  return ChoiceChip(
                    label: Text(
                      count == null ? f.label : '${f.label} · $count',
                    ),
                    selected: f == filter,
                    showCheckmark: false,
                    onSelected: (_) =>
                        ref.read(managerTripFilterProvider.notifier).state = f,
                  );
                },
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: RefreshIndicator(
                color: t.primary,
                onRefresh: _refresh,
                child: trips.when(
                  skipLoadingOnRefresh: true,
                  loading: () => ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [MLoading(height: 240)],
                  ),
                  error: (e, _) => ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(20),
                    children: [
                      MError(
                        error: e,
                        onRetry: () => ref.invalidate(managerBookingsProvider),
                      ),
                    ],
                  ),
                  data: (all) {
                    final list = filterManagerTrips(all, filter, _query);
                    if (list.isEmpty) {
                      return ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(20),
                        children: [
                          MEmpty(
                            icon: Icons.search_off_outlined,
                            title: _query.isEmpty
                                ? 'No ${filter.label.toLowerCase()} trips'
                                : 'No trips match “$_query”',
                            message: 'Pull down to refresh.',
                          ),
                        ],
                      );
                    }
                    return ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 96), // clear the FAB
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => ManagerTripTile(
                        booking: list[i],
                        onTap: () => context.push(
                          AppRoutes.managerTripDetail(list[i].id),
                        ),
                      ),
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
