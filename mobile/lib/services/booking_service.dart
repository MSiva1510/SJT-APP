// ─────────────────────────────────────────────────────────────────────────────
// booking_service.dart
// Business logic layer between BookingProvider and BookingRepository.
// No UI code. No Supabase imports.
// ─────────────────────────────────────────────────────────────────────────────

import '../repositories/booking_repository.dart';
import '../models/booking.dart';
import '../models/driver_profile.dart';

class BookingService {
  BookingService(this._repo);

  final BookingRepository _repo;

  // ── Guard ─────────────────────────────────────────────────────────────────
  void _requireDriver(DriverProfile? driver) {
    if (driver == null) {
      throw const BookingServiceException(
        message: 'Driver profile not loaded. Please log in again.',
        code:    BookingErrorCode.driverNotFound,
      );
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  Future<List<BookingModel>> getDriverBookings(DriverProfile? driver) async {
    _requireDriver(driver);
    try {
      return await _repo.getDriverBookings();
    } catch (e) {
      throw _map(e);
    }
  }

  Future<List<BookingModel>> getUpcomingBookings(DriverProfile? driver) async {
    _requireDriver(driver);
    try {
      return await _repo.getUpcomingBookings();
    } catch (e) {
      throw _map(e);
    }
  }

  Future<int> getActiveBookingCount(DriverProfile? driver) async {
    if (driver == null) return 0;
    try {
      return await _repo.getActiveBookingCount();
    } catch (_) {
      return 0;
    }
  }

  Future<BookingModel> getBookingById(
    String id,
    DriverProfile? driver,
  ) async {
    _requireDriver(driver);
    try {
      final booking = await _repo.getBookingById(id);
      if (booking == null) {
        throw const BookingServiceException(
          message: 'Booking not found.',
          code:    BookingErrorCode.notFound,
        );
      }

      // Defence-in-depth: verify driver access even if RLS passed
      final idMatch   = booking.driverId   != null && booking.driverId   == driver!.id;
      final nameMatch = booking.driverName != null &&
          booking.driverName!.toLowerCase() == driver!.name.toLowerCase();

      if (!idMatch && !nameMatch) {
        throw const BookingServiceException(
          message: 'You do not have access to this booking.',
          code:    BookingErrorCode.unauthorized,
        );
      }

      return booking;
    } on BookingServiceException {
      rethrow;
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Error mapping ─────────────────────────────────────────────────────────
  BookingServiceException _map(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('network') || msg.contains('socket') || msg.contains('connection')) {
      return const BookingServiceException(
        message: 'No internet connection. Pull down to retry.',
        code:    BookingErrorCode.network,
      );
    }
    if (msg.contains('permission') || msg.contains('rls')) {
      return const BookingServiceException(
        message: 'Access denied. Contact your administrator.',
        code:    BookingErrorCode.unauthorized,
      );
    }
    if (msg.contains('jwt') || msg.contains('expired')) {
      return const BookingServiceException(
        message: 'Session expired. Please log in again.',
        code:    BookingErrorCode.sessionExpired,
      );
    }
    return const BookingServiceException(
      message: 'Failed to load bookings. Please try again.',
      code:    BookingErrorCode.unknown,
    );
  }
}

// ── Exception ─────────────────────────────────────────────────────────────────

class BookingServiceException implements Exception {
  final String message;
  final BookingErrorCode code;

  const BookingServiceException({
    required this.message,
    this.code = BookingErrorCode.unknown,
  });
}

enum BookingErrorCode {
  driverNotFound,
  notFound,
  unauthorized,
  network,
  sessionExpired,
  unknown,
}
