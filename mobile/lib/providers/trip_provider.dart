// ─────────────────────────────────────────────────────────────────────────────
// trip_provider.dart
// Riverpod state for driver trips.
// Depends on authProvider — won't fetch if driver is not authenticated.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/auth/auth_state.dart' as app;
import '../models/trip.dart';
import '../providers/auth_provider.dart';
import '../repositories/trip_repository.dart';
import '../services/trip_service.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final tripRepositoryProvider = Provider<TripRepository>((ref) {
  return TripRepository(ref.watch(supabaseClientProvider));
});

final tripServiceProvider = Provider<TripService>((ref) {
  return TripService(ref.watch(tripRepositoryProvider));
});

// ── Today's trips ─────────────────────────────────────────────────────────────

final todayTripsProvider =
    StateNotifierProvider<TodayTripsNotifier, TripListState>((ref) {
      return TodayTripsNotifier(ref.watch(tripServiceProvider), ref);
    });

// ── All driver trips (for history) ───────────────────────────────────────────

final allDriverTripsProvider =
    StateNotifierProvider<AllTripsNotifier, TripListState>((ref) {
      return AllTripsNotifier(ref.watch(tripServiceProvider), ref);
    });

// ── Single trip detail ────────────────────────────────────────────────────────

final tripDetailProvider =
    StateNotifierProvider.family<TripDetailNotifier, TripDetailState, String>((
      ref,
      tripId,
    ) {
      return TripDetailNotifier(ref.watch(tripServiceProvider), ref, tripId);
    });

// ── Today trip count (for dashboard badge) ────────────────────────────────────

final todayTripCountProvider = FutureProvider<int>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return 0;
  return ref.watch(tripServiceProvider).getTodayTripCount(driver);
});

// ── Upcoming trips (for dashboard preview) ────────────────────────────────────

final upcomingTripsProvider = FutureProvider<List<TripModel>>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return [];
  return ref.watch(tripServiceProvider).getUpcomingTrips(driver);
});

// ═════════════════════════════════════════════════════════════════════════════
// State classes
// ═════════════════════════════════════════════════════════════════════════════

sealed class TripListState {
  const TripListState();
}

class TripListInitial extends TripListState {
  const TripListInitial();
}

class TripListLoading extends TripListState {
  const TripListLoading();
}

class TripListRefreshing extends TripListState {
  final List<TripModel> previous;
  const TripListRefreshing(this.previous);
}

class TripListLoaded extends TripListState {
  final List<TripModel> trips;
  const TripListLoaded(this.trips);
}

class TripListEmpty extends TripListState {
  const TripListEmpty();
}

class TripListError extends TripListState {
  final String message;
  const TripListError(this.message);
}

sealed class TripDetailState {
  const TripDetailState();
}

class TripDetailLoading extends TripDetailState {
  const TripDetailLoading();
}

class TripDetailLoaded extends TripDetailState {
  final TripModel trip;
  const TripDetailLoaded(this.trip);
}

class TripDetailError extends TripDetailState {
  final String message;
  const TripDetailError(this.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// Notifiers
// ═════════════════════════════════════════════════════════════════════════════

class TodayTripsNotifier extends StateNotifier<TripListState> {
  TodayTripsNotifier(this._service, this._ref)
    : super(const TripListInitial()) {
    _loadIfAuthenticated();
  }

  final TripService _service;
  final Ref _ref;

  void _loadIfAuthenticated() {
    final authState = _ref.read(authProvider);
    if (authState is app.AuthAuthenticated) load();
  }

  Future<void> load() async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) {
      state = const TripListError('Driver profile not available.');
      return;
    }

    final isRefresh = state is TripListLoaded;
    state = isRefresh
        ? TripListRefreshing((state as TripListLoaded).trips)
        : const TripListLoading();

    try {
      final trips = await _service.getTodayTrips(driver);
      state = trips.isEmpty ? const TripListEmpty() : TripListLoaded(trips);
    } on TripServiceException catch (e) {
      state = TripListError(e.message);
    } catch (e) {
      state = const TripListError('Failed to load trips. Please try again.');
    }
  }

  Future<void> refresh() => load();
}

class AllTripsNotifier extends StateNotifier<TripListState> {
  AllTripsNotifier(this._service, this._ref) : super(const TripListInitial());

  final TripService _service;
  final Ref _ref;
  bool _loading = false;

  Future<void> load() async {
    if (_loading) return;
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) return;

    _loading = true;
    final previous = state;
    state = previous is TripListLoaded
        ? TripListRefreshing(previous.trips)
        : const TripListLoading();
    try {
      final trips = await _service.getDriverTrips(driver);
      state = trips.isEmpty ? const TripListEmpty() : TripListLoaded(trips);
    } on TripServiceException catch (e) {
      state = TripListError(e.message);
    } catch (_) {
      state = const TripListError('Failed to load trips. Please try again.');
    } finally {
      _loading = false;
    }
  }

  Future<void> refresh() => load();
}

class TripDetailNotifier extends StateNotifier<TripDetailState> {
  TripDetailNotifier(this._service, this._ref, this._tripId)
    : super(const TripDetailLoading()) {
    _load();
  }

  final TripService _service;
  final Ref _ref;
  final String _tripId;

  Future<void> _load() async {
    final driver = _ref.read(currentDriverProvider);
    try {
      final trip = await _service.getTripById(_tripId, driver);
      state = trip != null
          ? TripDetailLoaded(trip)
          : const TripDetailError('Trip not found.');
    } on TripServiceException catch (e) {
      state = TripDetailError(e.message);
    }
  }

  Future<void> refresh() async {
    state = const TripDetailLoading();
    await _load();
  }

  /// assigned → started (Day 47). Throws [TripServiceException] on failure.
  Future<TripModel> startTrip() async {
    final driver = _ref.read(currentDriverProvider);
    try {
      final updated = await _service.startTrip(tripId: _tripId, driver: driver);
      state = TripDetailLoaded(updated);
      return updated;
    } on TripServiceException catch (e) {
      // Re-fetch so the UI reflects the server truth even after a failure.
      refresh();
      throw TripServiceException(
        message: e.message,
        code: e.code,
        detail: e.detail,
      );
    }
  }

  /// started → completed (Day 47). Throws [TripServiceException] on failure.
  Future<TripModel> completeTrip() async {
    final driver = _ref.read(currentDriverProvider);
    try {
      final updated = await _service.completeTrip(
        tripId: _tripId,
        driver: driver,
      );
      state = TripDetailLoaded(updated);
      return updated;
    } on TripServiceException catch (e) {
      refresh();
      throw TripServiceException(
        message: e.message,
        code: e.code,
        detail: e.detail,
      );
    }
  }

  Future<void> saveRoutePlaces({
    double? pickupLat,
    double? pickupLng,
    String? pickupPlace,
    double? dropLat,
    double? dropLng,
    String? dropPlace,
  }) async {
    final driver = _ref.read(currentDriverProvider);
    final updated = await _service.saveRoutePlaces(
      tripId: _tripId,
      driver: driver,
      pickupLat: pickupLat,
      pickupLng: pickupLng,
      pickupPlace: pickupPlace,
      dropLat: dropLat,
      dropLng: dropLng,
      dropPlace: dropPlace,
    );
    state = TripDetailLoaded(updated);
  }
}
