// ─────────────────────────────────────────────────────────────────────────────
// attendance_service_test.dart
// Business-rule guards: duplicate check-in, checkout without check-in,
// duplicate checkout. Uses a fake repository — no Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/attendance.dart';
import 'package:sri_jayam_travels_mobile/models/driver_profile.dart';
import 'package:sri_jayam_travels_mobile/repositories/attendance_repository.dart';
import 'package:sri_jayam_travels_mobile/services/attendance_service.dart';

class FakeAttendanceRepository implements AttendanceRepository {
  AttendanceModel? todayRow;
  Object? insertError;
  Object? updateError;

  @override
  Future<AttendanceModel?> getTodayAttendance() async => todayRow;

  @override
  Future<List<AttendanceModel>> getAttendanceHistory({int limit = 30}) async =>
      [];

  @override
  Future<AttendanceModel> checkIn({
    required String driverId,
    required String driverName,
  }) async {
    if (insertError != null) throw insertError!;
    final row = AttendanceModel(
      id: 'a1',
      driverId: driverId,
      attendanceDate: DateTime.now(),
      status: 'present',
      checkIn: '09:00',
    );
    todayRow = row;
    return row;
  }

  @override
  Future<AttendanceModel> checkOut({
    required String attendanceId,
    required String checkInTime,
  }) async {
    if (updateError != null) throw updateError!;
    final row = AttendanceModel(
      id: attendanceId,
      driverId: 'd1',
      attendanceDate: DateTime.now(),
      status: 'present',
      checkIn: checkInTime,
      checkOut: '18:00',
      workingHours: '9 hours',
    );
    todayRow = row;
    return row;
  }
}

const testDriver = DriverProfile(id: 'd1', name: 'Kumar');

void main() {
  late FakeAttendanceRepository repo;
  late AttendanceService service;

  setUp(() {
    repo = FakeAttendanceRepository();
    service = AttendanceService(repo);
  });

  group('check-in guards', () {
    test('first check-in succeeds', () async {
      final row = await service.checkIn(testDriver, null);
      expect(row.isCheckedIn, isTrue);
    });

    test('duplicate check-in is rejected', () async {
      await service.checkIn(testDriver, null);
      await expectLater(
        service.checkIn(testDriver, repo.todayRow),
        throwsA(isA<AttendanceException>()),
      );
    });

    test('re-check-in after completed day is rejected', () async {
      repo.todayRow = AttendanceModel(
        id: 'a0',
        driverId: 'd1',
        attendanceDate: DateTime.now(),
        status: 'present',
        checkIn: '08:00',
        checkOut: '17:00',
      );
      await expectLater(
        service.checkIn(testDriver, repo.todayRow),
        throwsA(isA<AttendanceException>()),
      );
    });

    test('null driver is rejected', () async {
      await expectLater(
        service.checkIn(null, null),
        throwsA(isA<AttendanceException>()),
      );
    });
  });

  group('check-out guards', () {
    test('checkout without check-in is rejected', () async {
      await expectLater(
        service.checkOut(testDriver, null),
        throwsA(isA<AttendanceException>()),
      );
    });

    test('duplicate checkout is rejected', () async {
      repo.todayRow = AttendanceModel(
        id: 'a2',
        driverId: 'd1',
        attendanceDate: DateTime.now(),
        status: 'present',
        checkIn: '08:00',
        checkOut: '17:00',
      );
      await expectLater(
        service.checkOut(testDriver, repo.todayRow),
        throwsA(isA<AttendanceException>()),
      );
    });

    test('valid checkout computes working hours', () async {
      await service.checkIn(testDriver, null);
      final row = await service.checkOut(testDriver, repo.todayRow);
      expect(row.isCheckedOut, isTrue);
      expect(row.workingHours, contains('hour'));
    });
  });
}
