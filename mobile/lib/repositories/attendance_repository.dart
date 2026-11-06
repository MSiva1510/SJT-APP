// ─────────────────────────────────────────────────────────────────────────────
// attendance_repository.dart
// Supabase data layer for attendance.
//
// IMPORTANT — matching Web ERP data format:
//   check_in / check_out stored as TEXT "HH:MM" (IST local time)
//   working_hours stored as TEXT "X hours Y minutes"
//   attendance_date stored as DATE "YYYY-MM-DD" (local date)
//
// RLS policies enforced server-side:
//   attendance_driver_own_read   → SELECT
//   attendance_driver_own_insert → INSERT
//   attendance_driver_own_update → UPDATE (added Day 45)
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../core/config/supabase_config.dart';
import '../models/attendance.dart';

class AttendanceRepository {
  AttendanceRepository(this._client);

  final SupabaseClient _client;

  // ── Today ──────────────────────────────────────────────────────────────────

  /// Returns today's attendance record for the authenticated driver.
  /// Returns null if no record exists yet.
  /// RLS ensures driver can only get their own record.
  Future<AttendanceModel?> getTodayAttendance() async {
    final today = _todayString();
    final data = await _client
        .from(SupabaseConfig.attendanceTable)
        .select(AttendanceModel.selectColumns)
        .eq('attendance_date', today)
        .maybeSingle();

    if (data == null) return null;
    return AttendanceModel.fromMap(data);
  }

  // ── History ────────────────────────────────────────────────────────────────

  /// Last [limit] attendance records for the driver, newest first.
  Future<List<AttendanceModel>> getAttendanceHistory({int limit = 30}) async {
    final data = await _client
        .from(SupabaseConfig.attendanceTable)
        .select(AttendanceModel.selectColumns)
        .order('attendance_date', ascending: false)
        .limit(limit);

    return (data as List).map((m) => AttendanceModel.fromMap(m)).toList();
  }

  // ── Check-in ───────────────────────────────────────────────────────────────

  /// Creates a new attendance record for today.
  /// Throws if a record already exists (duplicate check enforced by caller).
  Future<AttendanceModel> checkIn({
    required String driverId,
    required String driverName,
  }) async {
    final now   = DateTime.now();
    final today = _todayString();
    final time  = _timeString(now);    // "HH:MM"

    final data = await _client
        .from(SupabaseConfig.attendanceTable)
        .insert({
          'driver_id':       driverId,
          'driver_name':     driverName,
          'attendance_date': today,
          'status':          'present',
          'check_in':        time,
          'notes':           'Checked in from mobile app',
        })
        .select(AttendanceModel.selectColumns)
        .single();

    return AttendanceModel.fromMap(data);
  }

  // ── Check-out ──────────────────────────────────────────────────────────────

  /// Updates existing attendance record with check-out time and worked hours.
  Future<AttendanceModel> checkOut({
    required String attendanceId,
    required String checkInTime,   // "HH:MM" from the existing record
  }) async {
    final now      = DateTime.now();
    final checkOut = _timeString(now);
    final hours    = _calcWorkingHours(checkInTime, checkOut);

    final data = await _client
        .from(SupabaseConfig.attendanceTable)
        .update({
          'check_out':     checkOut,
          'working_hours': hours,
          'updated_at':    now.toUtc().toIso8601String(),
        })
        .eq('id', attendanceId)
        .select(AttendanceModel.selectColumns)
        .single();

    return AttendanceModel.fromMap(data);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /// Today's date as "YYYY-MM-DD" in local time.
  String _todayString() {
    final d = DateTime.now();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')}';
  }

  /// Format DateTime as "HH:MM" local time — matches Web ERP format.
  String _timeString(DateTime dt) =>
      '${dt.hour.toString().padLeft(2, '0')}:'
      '${dt.minute.toString().padLeft(2, '0')}';

  /// Calculate working hours as TEXT string matching Web ERP format.
  /// e.g. "9 hours" or "8 hours 30 minutes"
  String _calcWorkingHours(String checkIn, String checkOut) {
    try {
      final inParts  = checkIn.split(':');
      final outParts = checkOut.split(':');

      final inMin  = int.parse(inParts[0])  * 60 + int.parse(inParts[1]);
      final outMin = int.parse(outParts[0]) * 60 + int.parse(outParts[1]);

      final diff    = outMin - inMin;
      if (diff <= 0) return '0 hours';

      final hours   = diff ~/ 60;
      final minutes = diff % 60;

      if (minutes == 0) return '$hours ${hours == 1 ? 'hour' : 'hours'}';
      return '$hours ${hours == 1 ? 'hour' : 'hours'} $minutes minutes';
    } catch (_) {
      return 'N/A';
    }
  }
}
