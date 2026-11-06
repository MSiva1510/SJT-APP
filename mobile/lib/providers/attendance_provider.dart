// ─────────────────────────────────────────────────────────────────────────────
// attendance_provider.dart
// Riverpod state for driver attendance.
// Prevents duplicate submissions via submitting state.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/attendance.dart';
import '../providers/auth_provider.dart';
import '../repositories/attendance_repository.dart';
import '../services/attendance_service.dart';

// ── Singleton providers ───────────────────────────────────────────────────────

final attendanceRepositoryProvider = Provider<AttendanceRepository>((ref) {
  return AttendanceRepository(ref.watch(supabaseClientProvider));
});

final attendanceServiceProvider = Provider<AttendanceService>((ref) {
  return AttendanceService(ref.watch(attendanceRepositoryProvider));
});

// ── Today's attendance ────────────────────────────────────────────────────────

final todayAttendanceProvider =
    StateNotifierProvider<TodayAttendanceNotifier, AttendanceState>((ref) {
  return TodayAttendanceNotifier(ref.watch(attendanceServiceProvider), ref);
});

// ── Attendance history ────────────────────────────────────────────────────────

final attendanceHistoryProvider =
    StateNotifierProvider<AttendanceHistoryNotifier, AttendanceListState>(
        (ref) {
  return AttendanceHistoryNotifier(ref.watch(attendanceServiceProvider), ref);
});

// ═════════════════════════════════════════════════════════════════════════════
// State classes
// ═════════════════════════════════════════════════════════════════════════════

sealed class AttendanceState { const AttendanceState(); }
class AttendanceInitial    extends AttendanceState { const AttendanceInitial(); }
class AttendanceLoading    extends AttendanceState { const AttendanceLoading(); }
class AttendanceSubmitting extends AttendanceState {
  final AttendanceModel? current;
  const AttendanceSubmitting(this.current);
}
class AttendanceLoaded     extends AttendanceState {
  final AttendanceModel? record; // null = no attendance today yet
  const AttendanceLoaded(this.record);
}
class AttendanceError      extends AttendanceState {
  final String message;
  final AttendanceModel? record; // preserve current state on error
  const AttendanceError(this.message, {this.record});
}

sealed class AttendanceListState { const AttendanceListState(); }
class AttendanceListLoading    extends AttendanceListState { const AttendanceListLoading(); }
class AttendanceListLoaded     extends AttendanceListState {
  final List<AttendanceModel> records;
  const AttendanceListLoaded(this.records);
}
class AttendanceListEmpty      extends AttendanceListState { const AttendanceListEmpty(); }
class AttendanceListError      extends AttendanceListState {
  final String message;
  const AttendanceListError(this.message);
}
class AttendanceListRefreshing extends AttendanceListState {
  final List<AttendanceModel> previous;
  const AttendanceListRefreshing(this.previous);
}

// ═════════════════════════════════════════════════════════════════════════════
// Today's attendance notifier
// ═════════════════════════════════════════════════════════════════════════════

class TodayAttendanceNotifier extends StateNotifier<AttendanceState> {
  TodayAttendanceNotifier(this._service, this._ref)
      : super(const AttendanceInitial()) {
    load();
  }

  final AttendanceService _service;
  final Ref               _ref;

  AttendanceModel? get _current =>
      state is AttendanceLoaded ? (state as AttendanceLoaded).record : null;

  Future<void> load() async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) return;
    state = const AttendanceLoading();
    try {
      final record = await _service.getTodayAttendance(driver);
      state = AttendanceLoaded(record);
    } on AttendanceException catch (e) {
      state = AttendanceError(e.message);
    } catch (_) {
      state = const AttendanceError('Failed to load attendance.');
    }
  }

  Future<void> refresh() => load();

  Future<void> checkIn() async {
    final driver  = _ref.read(currentDriverProvider);
    final current = _current;

    // Guard: prevent duplicate submission
    if (state is AttendanceSubmitting) return;

    state = AttendanceSubmitting(current);
    try {
      final record = await _service.checkIn(driver, current);
      state = AttendanceLoaded(record);
    } on AttendanceException catch (e) {
      state = AttendanceError(e.message, record: current);
    } catch (_) {
      state = AttendanceError(
        'Check-in failed. Please try again.',
        record: current,
      );
    }
  }

  Future<void> checkOut() async {
    final driver  = _ref.read(currentDriverProvider);
    final current = _current;

    if (state is AttendanceSubmitting) return;

    state = AttendanceSubmitting(current);
    try {
      final record = await _service.checkOut(driver, current);
      state = AttendanceLoaded(record);
    } on AttendanceException catch (e) {
      state = AttendanceError(e.message, record: current);
    } catch (_) {
      state = AttendanceError(
        'Check-out failed. Please try again.',
        record: current,
      );
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// History notifier
// ═════════════════════════════════════════════════════════════════════════════

class AttendanceHistoryNotifier extends StateNotifier<AttendanceListState> {
  AttendanceHistoryNotifier(this._service, this._ref)
      : super(const AttendanceListLoading());

  final AttendanceService _service;
  final Ref               _ref;

  Future<void> load() async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) return;

    final isRefresh = state is AttendanceListLoaded;
    state = isRefresh
        ? AttendanceListRefreshing(
            (state as AttendanceListLoaded).records)
        : const AttendanceListLoading();

    try {
      final records = await _service.getHistory(driver);
      state = records.isEmpty
          ? const AttendanceListEmpty()
          : AttendanceListLoaded(records);
    } on AttendanceException catch (e) {
      state = AttendanceListError(e.message);
    } catch (_) {
      state = const AttendanceListError('Failed to load attendance history.');
    }
  }

  Future<void> refresh() => load();
}
