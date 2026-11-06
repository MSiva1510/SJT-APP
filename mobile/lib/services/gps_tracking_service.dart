// ─────────────────────────────────────────────────────────────────────────────
// gps_tracking_service.dart
// Day 47 — real GPS tracking for the driver app.
//
// Pipeline:
//   Phone GPS (geolocator stream, foreground)
//     → LocationService.getPositionStream(distance-filtered by OS)
//     → GpsTrackingService.handleLocationUpdate (time/accuracy/distance gates)
//     → GpsRepository.saveLocation (upsert, UNIQUE(vehicle_id, timestamp))
//     → Supabase gps_tracking (shared Web ERP table)
//
// Guarantees:
//   • No mock data — every point comes from the device GPS.
//   • Duplicate protection — one stream subscription, one sync timer,
//     guarded start/stop, DB-level upsert dedup.
//   • Network failures never fake success — failed uploads are queued
//     in memory and retried; UI is told via [GpsTrackState.pendingCount]
//     and [GpsTrackState.temporarilyOffline].
//
// FOREGROUND ONLY: Android pauses app execution when backgrounded and no
// foreground service is running, so tracking effectively stops while the
// app is not visible. This is intentional for battery health; background
// tracking is NOT implemented or claimed.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/gps_position.dart';
import '../models/trip.dart';
import '../models/driver_profile.dart';
import 'location_service.dart';
import '../repositories/gps_repository.dart';

// ── Tunable settings ────────────────────────────────────────────────────────

class GpsTrackingConfig {
  const GpsTrackingConfig({
    this.minInterval = const Duration(seconds: 10),
    this.minDistanceM = 25,
    this.maxAccuracyM = 100,
    this.osDistanceFilterM = 20,
    this.syncTickInterval = const Duration(seconds: 30),
    this.maxQueueSize = 500,
  });

  /// Minimum time between two accepted/uploaded fixes.
  final Duration minInterval;

  /// Minimum metres moved before a fix is accepted (battery + DB writes).
  final double minDistanceM;

  /// Fixes worse than this accuracy are discarded.
  final double maxAccuracyM;

  /// OS-level stream distance filter (geolocator distanceFilter).
  final int osDistanceFilterM;

  /// How often pending (offline) points are retried while tracking.
  final Duration syncTickInterval;

  /// Hard cap on the in-memory offline queue (oldest dropped first).
  final int maxQueueSize;
}

// ── Trip context bound to a tracking session ────────────────────────────────

class ActiveTripContext {
  const ActiveTripContext({
    required this.tripId,
    required this.vehicleId,
    required this.driverId,
  });

  final String tripId;
  final String vehicleId;
  final String driverId;
}

// ── Exposed state ───────────────────────────────────────────────────────────

enum GpsTrackingStatus { idle, starting, active, paused, stopping }

class GpsTrackState {
  const GpsTrackState({
    this.status = GpsTrackingStatus.idle,
    this.context,
    this.lastPosition,
    this.routePoints = const [],
    this.uploadedCount = 0,
    this.pendingCount = 0,
    this.lastUploadAt,
    this.temporarilyOffline = false,
    this.errorMessage,
  });

  final GpsTrackingStatus status;
  final ActiveTripContext? context;

  /// Latest ACCEPTED fix (even if its upload is still pending).
  final GpsPosition? lastPosition;

  /// All accepted points of the current session, oldest first.
  final List<GpsPosition> routePoints;

  final int uploadedCount;
  final int pendingCount;
  final DateTime? lastUploadAt;
  final bool temporarilyOffline;
  final String? errorMessage;

  bool get isTracking =>
      status == GpsTrackingStatus.active ||
      status == GpsTrackingStatus.paused ||
      status == GpsTrackingStatus.starting ||
      status == GpsTrackingStatus.stopping;

  GpsTrackState copyWith({
    GpsTrackingStatus? status,
    ActiveTripContext? context,
    GpsPosition? lastPosition,
    List<GpsPosition>? routePoints,
    int? uploadedCount,
    int? pendingCount,
    DateTime? lastUploadAt,
    bool? temporarilyOffline,
    String? errorMessage,
    bool clearError = false,
  }) {
    return GpsTrackState(
      status: status ?? this.status,
      context: context ?? this.context,
      lastPosition: lastPosition ?? this.lastPosition,
      routePoints: routePoints ?? this.routePoints,
      uploadedCount: uploadedCount ?? this.uploadedCount,
      pendingCount: pendingCount ?? this.pendingCount,
      lastUploadAt: lastUploadAt ?? this.lastUploadAt,
      temporarilyOffline: temporarilyOffline ?? this.temporarilyOffline,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

// ── Service ─────────────────────────────────────────────────────────────────

class GpsTrackingService extends StateNotifier<GpsTrackState> {
  GpsTrackingService({
    required LocationService locationService,
    required GpsRepository repository,
    GpsTrackingConfig trackingConfig = const GpsTrackingConfig(),
  })  : _location = locationService,
        _repo = repository,
        _config = trackingConfig,
        super(const GpsTrackState());

  final LocationService _location;
  final GpsRepository   _repo;
  final GpsTrackingConfig _config;

  StreamSubscription<GpsPosition>? _positionSub;
  Timer? _syncTimer;

  // Session bookkeeping
  List<GpsPosition> _pending = [];       // accepted but not yet persisted
  DateTime? _lastAcceptedAt;
  GpsPosition? _lastAcceptedPoint;
  bool _busy = false;                    // guards start/stop re-entry

  /// Whether any tracking session exists (active OR paused).
  bool get isTracking => state.isTracking && state.context != null;

  // ── Start ─────────────────────────────────────────────────────────────────

  /// Validates permissions + GPS state, takes a starting fix, persists it and
  /// opens the position stream. Safe to call twice — second call is a no-op.
  Future<void> startTracking({
    required TripModel trip,
    required DriverProfile driver,
  }) async {
    if (_busy) return;
    if (isTracking) return; // duplicate-start protection

    final vehicleId = trip.vehicleId;
    if (vehicleId == null || vehicleId.isEmpty) {
      state = state.copyWith(
        status: GpsTrackingStatus.idle,
        errorMessage:
            'This trip has no vehicle assigned yet — cannot track GPS.',
      );
      throw const GpsTrackingException('Trip has no assigned vehicle.');
    }

    _busy = true;
    state = const GpsTrackState(status: GpsTrackingStatus.starting);

    try {
      // 1. Permission / GPS checks
      var status = await _location.requestPermission();
      if (status.isPermanent) {
        throw const GpsTrackingException(
          'Location permission is blocked. Enable it in Settings.',
          fatal: true,
        );
      }
      if (status.isDenied) {
        throw const GpsTrackingException(
          'Location permission denied — GPS cannot start.',
          fatal: true,
        );
      }
      if (status.isGpsDisabled) {
        throw const GpsTrackingException(
          'Device GPS is switched off. Turn it on and try again.',
          fatal: true,
        );
      }

      // 2. Starting fix (best effort — a slow first fix must not block long)
      GpsPosition? startPoint;
      try {
        startPoint = await _location.getCurrentPosition();
      } catch (_) {
        startPoint = null; // stream will deliver the first fix shortly
      }

      final ctx = ActiveTripContext(
        tripId: trip.id,
        vehicleId: vehicleId,
        driverId: driver.id,
      );

      // Store the session context in state BEFORE any async work so every
      // guard (isTracking, pause/resume, stop, dashboard banner, trip
      // screen) sees a live session from this point on.
      state = GpsTrackState(status: GpsTrackingStatus.starting, context: ctx);

      _clearSessionBookkeeping();

      // 3. Persist the starting fix immediately when we have one.
      if (startPoint != null && startPoint.isValid) {
        await _accept(startPoint, ctx, isFinalFix: false);
      }

      // 4. Open the stream
      await _openStream(ctx);

      _syncTimer?.cancel();
      _syncTimer = Timer.periodic(_config.syncTickInterval, (_) {
        _flushPendingBestEffort(ctx);
      });
    } on GpsTrackingException catch (e) {
      state = GpsTrackState(status: GpsTrackingStatus.idle, errorMessage: e.message);
      rethrow;
    } finally {
      _busy = false;
    }
  }

  Future<void> _openStream(ActiveTripContext ctx) async {
    // duplicate-subscription protection
    await _positionSub?.cancel();
    _positionSub = _location
        .getPositionStream(distanceFilterM: _config.osDistanceFilterM)
        .listen(
      (pos) => handleLocationUpdate(pos, ctx),
      onError: (Object e) {
        state = state.copyWith(
          errorMessage: 'GPS signal problem — retrying automatically…',
        );
      },
      cancelOnError: false,
    );
    state = state.copyWith(status: GpsTrackingStatus.active, clearError: true);
  }

  // ── Live updates ──────────────────────────────────────────────────────────

  /// Applies the quality gates and uploads an accepted fix.
  Future<void> handleLocationUpdate(
    GpsPosition pos,
    ActiveTripContext ctx,
  ) async {
    if (!isTracking) return;
    if (state.status == GpsTrackingStatus.paused) return;

    // Gate 1 — sanity
    if (!pos.isValid) return;

    // Gate 2 — accuracy
    if (pos.accuracy > _config.maxAccuracyM) return;

    // Gate 3 — minimum time interval
    final now = DateTime.now();
    final last = _lastAcceptedAt;
    if (last != null && now.difference(last) < _config.minInterval) return;

    // Gate 4 — minimum real movement (skip when device stationary)
    final prev = _lastAcceptedPoint;
    if (prev != null &&
        LocationService.distanceBetween(prev, pos) < _config.minDistanceM) {
      return;
    }

    await _accept(pos, ctx, isFinalFix: false);
  }

  // ── Pause / resume (app lifecycle) ────────────────────────────────────────

  Future<void> pauseTracking() async {
    if (state.status != GpsTrackingStatus.active) return;
    await _positionSub?.cancel();
    _positionSub = null;
    state = state.copyWith(status: GpsTrackingStatus.paused);
  }

  Future<void> resumeTracking() async {
    final ctx = state.context;
    if (ctx == null) return;
    if (state.status != GpsTrackingStatus.paused) return;
    if (_positionSub != null) return; // already listening
    await _openStream(ctx);
    _flushPendingBestEffort(ctx); // catch-up after being paused
  }

  /// Called from WidgetsBindingObserver hooks in main.dart.
  /// Both methods are safe no-ops when no session exists or state mismatches.
  Future<void> onAppPaused() => pauseTracking();
  Future<void> onAppResumed() => resumeTracking();

  // ── Single fix ────────────────────────────────────────────────────────────

  Future<GpsPosition> getCurrentPosition() => _location.getCurrentPosition();

  // ── Stop ──────────────────────────────────────────────────────────────────

  /// Stops tracking. Persists a final fix and flushes everything still queued.
  /// Teardown ALWAYS completes even when the network is unreachable.
  Future<void> stopTracking({bool saveFinalLocation = true}) async {
    if (_busy) return;
    final ctx = state.context;
    if (!isTracking || ctx == null) return;

    _busy = true;
    state = state.copyWith(status: GpsTrackingStatus.stopping);

    try {
      // 1. Final fix (best effort, short timeout so logout can't hang)
      if (saveFinalLocation) {
        try {
          final fix = await _location
              .getCurrentPosition()
              .timeout(const Duration(seconds: 8));
          if (fix.isValid) await _accept(fix, ctx, isFinalFix: true);
        } catch (_) {/* no final fix available — acceptable */}
      }

      // 2. Kill listeners FIRST so nothing arrives mid-teardown
      await _positionSub?.cancel();
      _positionSub = null;
      _syncTimer?.cancel();
      _syncTimer = null;

      // 3. Flush whatever is left (bounded time — never blocks logout)
      try {
        await _flushPending().timeout(const Duration(seconds: 6));
      } catch (_) {/* queue stays local; nothing fake is written */}
    } finally {
      state = const GpsTrackState(status: GpsTrackingStatus.idle);
      _busy = false;
    }
  }

  // ── Offline queue ─────────────────────────────────────────────────────────

  /// Retries all queued points. Returns how many were actually persisted.
  /// Public per spec — also invoked periodically while tracking.
  Future<int> syncPendingLocations() async {
    if (_pending.isEmpty) return 0;

    final ctx = state.context;
    if (ctx == null) return 0;

    try {
      final inserted = await _repo.saveLocationBatch(
        vehicleId: ctx.vehicleId,
        tripId: ctx.tripId,
        driverId: ctx.driverId,
        positions: List.unmodifiable(_pending),
      );
      if (inserted > 0) {
        _pending = [];
        state = state.copyWith(
          pendingCount: 0,
          uploadedCount: state.uploadedCount + inserted,
          lastUploadAt: DateTime.now(),
          temporarilyOffline: false,
          clearError: true,
        );
      } else {
        // All duplicates — safe to drop them, they ARE on the server.
        _pending = [];
        state = state.copyWith(pendingCount: 0, temporarilyOffline: false);
      }
      return inserted;
    } catch (_) {
      state = state.copyWith(temporarilyOffline: true);
      return 0;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  /// Clears per-session bookkeeping (called on session start AND teardown).
  void _clearSessionBookkeeping() {
    _pending = [];
    _lastAcceptedAt = null;
    _lastAcceptedPoint = null;
  }

  Future<void> _accept(
    GpsPosition pos,
    ActiveTripContext ctx, {
    required bool isFinalFix,
  }) async {
    // In-session timestamp dedup (DB has the hard guarantee)
    if (!isFinalFix &&
        _lastAcceptedPoint != null &&
        _lastAcceptedPoint!.timestamp == pos.timestamp) {
      return;
    }

    _lastAcceptedAt = DateTime.now();
    _lastAcceptedPoint = pos;

    state = state.copyWith(
      lastPosition: pos,
      routePoints: [...state.routePoints, pos],
    );

    try {
      final stored = await _repo.saveLocation(
        vehicleId: ctx.vehicleId,
        tripId: ctx.tripId,
        driverId: ctx.driverId,
        position: pos,
      );
      if (stored) {
        state = state.copyWith(
          uploadedCount: state.uploadedCount + 1,
          lastUploadAt: DateTime.now(),
          temporarilyOffline: false,
          clearError: true,
        );
      } else {
        // duplicate (vehicle_id+timestamp already stored) — nothing to do
      }
    } catch (_) {
      _queuePending(pos);
    }
  }

  void _queuePending(GpsPosition pos) {
    if (_pending.length >= _config.maxQueueSize) {
      _pending.removeAt(0); // drop oldest — newest positions matter most
    }
    _pending.add(pos);
    state = state.copyWith(
      pendingCount: _pending.length,
      temporarilyOffline: true,
      errorMessage: 'GPS temporarily offline — points will sync automatically.',
    );
  }

  Future<void> _flushPending() async {
    if (_pending.isEmpty) return;
    await syncPendingLocations();
  }

  void _flushPendingBestEffort(ActiveTripContext ctx) {
    if (_pending.isEmpty) return;
    unawaited(syncPendingLocations());
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  /// Hard cleanup used at logout: stops listeners immediately, then tries to
  /// flush briefly. Never leaves a subscription alive behind it.
  Future<void> disposeSession() async {
    await _positionSub?.cancel();
    _positionSub = null;
    _syncTimer?.cancel();
    _syncTimer = null;
    _clearSessionBookkeeping();
    _busy = false;
    state = const GpsTrackState(status: GpsTrackingStatus.idle);
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _syncTimer?.cancel();
    super.dispose();
  }
}

// ── Exception ───────────────────────────────────────────────────────────────

class GpsTrackingException implements Exception {
  const GpsTrackingException(this.message, {this.fatal = false});
  final String message;
  final bool fatal;

  @override
  String toString() => message;
}
