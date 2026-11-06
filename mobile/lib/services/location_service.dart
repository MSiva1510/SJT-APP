// ─────────────────────────────────────────────────────────────────────────────
// location_service.dart
// Handles location permissions, GPS state, and single-position queries.
// Day 46: foreground single-fix only. Continuous tracking is Day 47.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:geolocator/geolocator.dart';
import '../models/gps_position.dart';

class LocationService {
  // ── Permission + GPS check ─────────────────────────────────────────────────

  /// Returns the current location status without requesting anything.
  Future<LocationStatus> getStatus() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return LocationStatus.gpsDisabled;

    final permission = await Geolocator.checkPermission();
    return _permToStatus(permission);
  }

  /// Requests permission if not already granted.
  /// Returns the resulting status.
  Future<LocationStatus> requestPermission() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return LocationStatus.gpsDisabled;

    var permission = await Geolocator.checkPermission();

    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    return _permToStatus(permission);
  }

  /// Opens the device's location settings (for permanently-denied case).
  Future<void> openSettings() => Geolocator.openLocationSettings();

  // ── Position fix ───────────────────────────────────────────────────────────

  /// Gets the current device position.
  /// Caller should check [getStatus()] or [requestPermission()] first.
  Future<GpsPosition> getCurrentPosition() async {
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy:     LocationAccuracy.high,
        timeLimit:    Duration(seconds: 15),
      ),
    );
    return GpsPosition(
      latitude:  pos.latitude,
      longitude: pos.longitude,
      accuracy:  pos.accuracy,
      speed:     pos.speed,
      heading:   pos.heading,
      timestamp: pos.timestamp,
    );
  }

  // ── Continuous stream (Day 47) ─────────────────────────────────────────────

  /// Foreground position stream, filtered by device movement.
  ///
  /// [distanceFilterM] — OS only wakes the callback after moving this far,
  /// which protects battery. The service layer applies an additional minimum
  /// time interval on top of this.
  Stream<GpsPosition> getPositionStream({int distanceFilterM = 25}) {
    return Geolocator.getPositionStream(
      locationSettings: LocationSettings(
        accuracy:       LocationAccuracy.high,
        distanceFilter: distanceFilterM,
      ),
    ).map((pos) => GpsPosition(
          latitude:  pos.latitude,
          longitude: pos.longitude,
          accuracy:  pos.accuracy,
          speed:     pos.speed,
          heading:   pos.heading,
          timestamp: pos.timestamp,
        ));
  }

  /// Haversine distance in metres between two positions.
  static double distanceBetween(GpsPosition a, GpsPosition b) =>
      Geolocator.distanceBetween(
        a.latitude, a.longitude, b.latitude, b.longitude,
      );

  // ── Helper ─────────────────────────────────────────────────────────────────

  LocationStatus _permToStatus(LocationPermission p) {
    return switch (p) {
      LocationPermission.always           => LocationStatus.granted,
      LocationPermission.whileInUse       => LocationStatus.granted,
      LocationPermission.denied           => LocationStatus.denied,
      LocationPermission.deniedForever    => LocationStatus.permanentlyDenied,
      LocationPermission.unableToDetermine => LocationStatus.unknown,
    };
  }
}

// ── Status enum ───────────────────────────────────────────────────────────────

enum LocationStatus {
  granted,
  denied,
  permanentlyDenied,
  gpsDisabled,
  unknown;

  bool get isGranted       => this == LocationStatus.granted;
  bool get isDenied        => this == LocationStatus.denied;
  bool get isPermanent     => this == LocationStatus.permanentlyDenied;
  bool get isGpsDisabled   => this == LocationStatus.gpsDisabled;

  String get label => switch (this) {
        LocationStatus.granted           => 'Location Enabled',
        LocationStatus.denied            => 'Permission Denied',
        LocationStatus.permanentlyDenied => 'Permission Blocked',
        LocationStatus.gpsDisabled       => 'GPS Disabled',
        LocationStatus.unknown           => 'Unknown',
      };
}
