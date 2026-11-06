// ─────────────────────────────────────────────────────────────────────────────
// booking_provider.dart
// Riverpod state for driver bookings.
// Will not fetch if driver is not authenticated.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/booking.dart';
import '../providers/auth_provider.dart';
import '../repositories/booking_repository.dart';
import '../services/booking_service.dart';

// ── Singleton providers ───────────────────────────────────────────────────────

final bookingRepositoryProvider = Provider<BookingRepository>((ref) {
  return BookingRepository(ref.watch(supabaseClientProvider));
});

final bookingServiceProvider = Provider<BookingService>((ref) {
  return BookingService(ref.watch(bookingRepositoryProvider));
});

// ── Bookings list ─────────────────────────────────────────────────────────────

final driverBookingsProvider =
    StateNotifierProvider<BookingsNotifier, BookingListState>((ref) {
  return BookingsNotifier(ref.watch(bookingServiceProvider), ref);
});

// ── Upcoming bookings for dashboard ──────────────────────────────────────────

final upcomingBookingsProvider = FutureProvider<List<BookingModel>>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return [];
  return ref.watch(bookingServiceProvider).getUpcomingBookings(driver);
});

// ── Active booking count for dashboard badge ──────────────────────────────────

final activeBookingCountProvider = FutureProvider<int>((ref) async {
  final driver = ref.watch(currentDriverProvider);
  if (driver == null) return 0;
  return ref.watch(bookingServiceProvider).getActiveBookingCount(driver);
});

// ── Single booking detail ─────────────────────────────────────────────────────

final bookingDetailProvider = StateNotifierProvider.family<
    BookingDetailNotifier, BookingDetailState, String>((ref, id) {
  return BookingDetailNotifier(ref.watch(bookingServiceProvider), ref, id);
});

// ═════════════════════════════════════════════════════════════════════════════
// State classes
// ═════════════════════════════════════════════════════════════════════════════

sealed class BookingListState { const BookingListState(); }
class BookingListInitial    extends BookingListState { const BookingListInitial(); }
class BookingListLoading    extends BookingListState { const BookingListLoading(); }
class BookingListRefreshing extends BookingListState {
  final List<BookingModel> previous;
  const BookingListRefreshing(this.previous);
}
class BookingListLoaded extends BookingListState {
  final List<BookingModel> bookings;
  const BookingListLoaded(this.bookings);
}
class BookingListEmpty  extends BookingListState { const BookingListEmpty(); }
class BookingListError  extends BookingListState {
  final String message;
  const BookingListError(this.message);
}

sealed class BookingDetailState { const BookingDetailState(); }
class BookingDetailLoading extends BookingDetailState { const BookingDetailLoading(); }
class BookingDetailLoaded  extends BookingDetailState {
  final BookingModel booking;
  const BookingDetailLoaded(this.booking);
}
class BookingDetailError   extends BookingDetailState {
  final String message;
  const BookingDetailError(this.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// Notifiers
// ═════════════════════════════════════════════════════════════════════════════

class BookingsNotifier extends StateNotifier<BookingListState> {
  BookingsNotifier(this._service, this._ref)
      : super(const BookingListInitial());

  final BookingService _service;
  final Ref _ref;

  Future<void> load() async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) {
      state = const BookingListError('Driver profile not available.');
      return;
    }
    final isRefresh = state is BookingListLoaded;
    state = isRefresh
        ? BookingListRefreshing((state as BookingListLoaded).bookings)
        : const BookingListLoading();

    try {
      final bookings = await _service.getDriverBookings(driver);
      state = bookings.isEmpty
          ? const BookingListEmpty()
          : BookingListLoaded(bookings);
    } on BookingServiceException catch (e) {
      state = BookingListError(e.message);
    } catch (_) {
      state = const BookingListError('Failed to load bookings.');
    }
  }

  Future<void> refresh() => load();
}

class BookingDetailNotifier extends StateNotifier<BookingDetailState> {
  BookingDetailNotifier(this._service, this._ref, this._id)
      : super(const BookingDetailLoading()) {
    _load();
  }

  final BookingService _service;
  final Ref            _ref;
  final String         _id;

  Future<void> _load() async {
    final driver = _ref.read(currentDriverProvider);
    try {
      final booking = await _service.getBookingById(_id, driver);
      state = BookingDetailLoaded(booking);
    } on BookingServiceException catch (e) {
      state = BookingDetailError(e.message);
    } catch (_) {
      state = const BookingDetailError('Failed to load booking details.');
    }
  }

  Future<void> refresh() async {
    state = const BookingDetailLoading();
    await _load();
  }
}
