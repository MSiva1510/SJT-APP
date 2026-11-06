// ─────────────────────────────────────────────────────────────────────────────
// attendance_service.dart
// Business logic layer. Validates state before every action.
// No UI code. No Supabase imports.
// ─────────────────────────────────────────────────────────────────────────────

import '../core/demo/demo_session.dart';
import '../repositories/attendance_repository.dart';
import '../models/attendance.dart';
import '../models/driver_profile.dart';

class AttendanceService {
  AttendanceService(this._repo);

  final AttendanceRepository _repo;

  // ── Guard ─────────────────────────────────────────────────────────────────
  void _requireDriver(DriverProfile? driver) {
    if (driver == null) {
      throw const AttendanceException(
        message: 'Driver profile not loaded. Please log in again.',
        code:    AttendanceErrorCode.driverNotFound,
      );
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  Future<AttendanceModel?> getTodayAttendance(DriverProfile? driver) async {
    _requireDriver(driver);
    if (DemoSession.active) return DemoSession.attendance;
    try {
      return await _repo.getTodayAttendance();
    } catch (e) {
      throw _map(e);
    }
  }

  Future<List<AttendanceModel>> getHistory(DriverProfile? driver,
      {int limit = 30}) async {
    _requireDriver(driver);
    if (DemoSession.active) {
      return DemoSession.attendanceHistory.take(limit).toList();
    }
    try {
      return await _repo.getAttendanceHistory(limit: limit);
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  Future<AttendanceModel> checkIn(
    DriverProfile? driver,
    AttendanceModel? todayRecord,
  ) async {
    _requireDriver(driver);

    // Business rule: cannot check in if already checked in today
    if (todayRecord != null && todayRecord.isCheckedIn) {
      if (todayRecord.isComplete) {
        throw const AttendanceException(
          message:
              'Attendance already complete for today. Cannot check in again.',
          code: AttendanceErrorCode.alreadyCheckedOut,
        );
      }
      throw const AttendanceException(
        message: 'You are already checked in for today.',
        code:    AttendanceErrorCode.alreadyCheckedIn,
      );
    }

    if (DemoSession.active) {
      final now = DateTime.now();
      final rec = AttendanceModel(
        id: 'demo-att-today',
        driverId: driver!.id,
        attendanceDate: DateTime(now.year, now.month, now.day),
        status: 'working',
        checkIn:
            '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
        createdAt: now,
      );
      DemoSession.setAttendance(rec);
      return rec;
    }

    try {
      return await _repo.checkIn(
        driverId:   driver!.id,
        driverName: driver.name,
      );
    } catch (e) {
      // Supabase unique violation → duplicate for same day
      if (e.toString().toLowerCase().contains('duplicate') ||
          e.toString().contains('23505')) {
        throw const AttendanceException(
          message: 'Attendance already recorded for today.',
          code:    AttendanceErrorCode.alreadyCheckedIn,
        );
      }
      throw _map(e);
    }
  }

  // ── Check-out ─────────────────────────────────────────────────────────────

  Future<AttendanceModel> checkOut(
    DriverProfile? driver,
    AttendanceModel? todayRecord,
  ) async {
    _requireDriver(driver);

    if (todayRecord == null || !todayRecord.isCheckedIn) {
      throw const AttendanceException(
        message: 'You have not checked in yet today.',
        code:    AttendanceErrorCode.notCheckedIn,
      );
    }
    if (todayRecord.isCheckedOut) {
      throw const AttendanceException(
        message: 'You have already checked out for today.',
        code:    AttendanceErrorCode.alreadyCheckedOut,
      );
    }

    if (DemoSession.active) {
      final now = DateTime.now();
      final h = now.difference(DateTime(
        now.year,
        now.month,
        now.day,
        int.tryParse(todayRecord.checkIn?.split(':').first ?? '') ?? 8,
        int.tryParse(todayRecord.checkIn?.split(':').last ?? '') ?? 0,
      ));
      final hrs =
          '${h.inHours}h ${h.inMinutes.remainder(60).toString().padLeft(2, '0')}m';
      final rec = AttendanceModel(
        id: todayRecord.id,
        driverId: todayRecord.driverId,
        attendanceDate: todayRecord.attendanceDate,
        status: 'complete',
        checkIn: todayRecord.checkIn,
        checkOut:
            '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}',
        workingHours: hrs,
        vehicleAssigned: todayRecord.vehicleAssigned,
        createdAt: todayRecord.createdAt,
      );
      DemoSession.setAttendance(rec);
      return rec;
    }

    try {
      return await _repo.checkOut(
        attendanceId: todayRecord.id,
        checkInTime:  todayRecord.checkIn!,
      );
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Error mapping ─────────────────────────────────────────────────────────
  AttendanceException _map(Object e) {
    if (e is AttendanceException) return e;
    final msg = e.toString().toLowerCase();
    if (msg.contains('network') || msg.contains('socket')) {
      return const AttendanceException(
        message: 'Internet connection required for attendance.',
        code:    AttendanceErrorCode.network,
      );
    }
    if (msg.contains('rls') || msg.contains('permission')) {
      return const AttendanceException(
        message: 'Access denied. Contact your administrator.',
        code:    AttendanceErrorCode.unauthorized,
      );
    }
    if (msg.contains('jwt') || msg.contains('expired')) {
      return const AttendanceException(
        message: 'Session expired. Please log in again.',
        code:    AttendanceErrorCode.sessionExpired,
      );
    }
    return const AttendanceException(
      message: 'Attendance action failed. Please try again.',
      code:    AttendanceErrorCode.unknown,
    );
  }
}

// ── Exception ─────────────────────────────────────────────────────────────────

class AttendanceException implements Exception {
  final String           message;
  final AttendanceErrorCode code;
  const AttendanceException({
    required this.message,
    this.code = AttendanceErrorCode.unknown,
  });
}

enum AttendanceErrorCode {
  driverNotFound,
  alreadyCheckedIn,
  alreadyCheckedOut,
  notCheckedIn,
  network,
  unauthorized,
  sessionExpired,
  unknown,
}
