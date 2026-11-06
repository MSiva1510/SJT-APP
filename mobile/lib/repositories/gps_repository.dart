// ─────────────────────────────────────────────────────────────────────────────
// gps_repository.dart
// Persistence layer for GPS positions against the EXISTING Web ERP
// `gps_tracking` table. No new tables, no duplicate tracking system.
//
// Schema verified from Web ERP source (src/repositories/gpsHistoryRepository.js):
//   gps_tracking:
//     id            UUID PK
//     vehicle_id    UUID      (required — FK vehicles.id)
//     trip_id       TEXT/UUID (nullable)
//     driver_id     UUID      (nullable — drivers.id)
//     latitude      DOUBLE PRECISION
//     longitude     DOUBLE PRECISION
//     accuracy      DOUBLE PRECISION (metres)
//     speed_kmh     DOUBLE PRECISION
//     bearing       DOUBLE PRECISION (degrees)
//     altitude      DOUBLE PRECISION
//     address       TEXT
//     ignition      BOOLEAN
//     gps_online    BOOLEAN
//     status        TEXT
//     odometer      DOUBLE PRECISION
//     timestamp     TIMESTAMPTZ  ← UNIQUE INDEX together with vehicle_id
//     raw           JSONB
//
// Dedup: UNIQUE(vehicle_id, timestamp). We upsert with ignoreDuplicates so a
// retry after an ambiguous network failure can never create duplicates.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../core/config/supabase_config.dart';
import '../models/gps_position.dart';

class GpsRepository {
  GpsRepository(this._client);

  final SupabaseClient _client;

  /// Columns read back for trip route display.
  static const String _selectColumns =
      'vehicle_id, trip_id, driver_id, latitude, longitude, '
      'accuracy, speed_kmh, bearing, timestamp';

  // ── Write ──────────────────────────────────────────────────────────────────

  /// Uploads one position. Returns true when a NEW row was stored.
  /// Returns false when the row was a duplicate (same vehicle+timestamp) or
  /// when the insert failed — callers must treat false as "not persisted".
  Future<bool> saveLocation({
    required String vehicleId,
    String? tripId,
    String? driverId,
    required GpsPosition position,
  }) async {
    final row = _toRow(
      vehicleId: vehicleId,
      tripId: tripId,
      driverId: driverId,
      position: position,
    );

    try {
      final data = await _client
          .from(SupabaseConfig.gpsTrackingTable)
          .upsert([row],
              onConflict: 'vehicle_id,timestamp', ignoreDuplicates: true)
          .select('vehicle_id');
      return (data as List).isNotEmpty;
    } catch (_) {
      rethrow; // caller (tracking service) decides offline handling
    }
  }

  /// Uploads a batch (offline queue flush). Returns the number of rows that
  /// were actually inserted — duplicates and failures are not counted.
  Future<int> saveLocationBatch({
    required String vehicleId,
    String? tripId,
    String? driverId,
    required List<GpsPosition> positions,
  }) async {
    if (positions.isEmpty) return 0;

    final rows = positions
        .map((p) => _toRow(
              vehicleId: vehicleId,
              tripId: tripId,
              driverId: driverId,
              position: p,
            ))
        .toList();

    try {
      final data = await _client
          .from(SupabaseConfig.gpsTrackingTable)
          .upsert(rows,
              onConflict: 'vehicle_id,timestamp', ignoreDuplicates: true)
          .select('vehicle_id');
      return (data as List).length;
    } catch (_) {
      rethrow;
    }
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  /// Latest stored position for a vehicle (or null).
  Future<GpsPosition?> getLatestLocation({required String vehicleId}) async {
    final data = await _client
        .from(SupabaseConfig.gpsTrackingTable)
        .select(_selectColumns)
        .eq('vehicle_id', vehicleId)
        .order('timestamp', ascending: false)
        .limit(1)
        .maybeSingle();

    if (data == null) return null;
    return _fromRow(data);
  }

  /// All stored points for a trip, oldest first — used by the trip map.
  Future<List<GpsPosition>> getTripLocations({
    required String tripId,
    int limit = 2000,
  }) async {
    final data = await _client
        .from(SupabaseConfig.gpsTrackingTable)
        .select(_selectColumns)
        .eq('trip_id', tripId)
        .order('timestamp', ascending: true)
        .limit(limit);

    return (data as List)
        .whereType<Map<String, dynamic>>()
        .map(_fromRow)
        .whereType<GpsPosition>()
        .toList(growable: false);
  }

  // ── Mappers ────────────────────────────────────────────────────────────────

  Map<String, dynamic> _toRow({
    required String vehicleId,
    String? tripId,
    String? driverId,
    required GpsPosition position,
  }) {
    return {
      'vehicle_id': vehicleId,
      'trip_id': tripId,
      'driver_id': driverId,
      'latitude': position.latitude,
      'longitude': position.longitude,
      'accuracy': position.accuracy,
      'speed_kmh': position.speedKmh,
      'bearing': position.heading,
      // gps_online: true → live phone fix (vs. external IMEI tracker feed)
      'gps_online': true,
      'timestamp': position.timestamp.toUtc().toIso8601String(),
      'raw': {
        'source': 'flutter_driver_app',
      },
    };
  }

  GpsPosition? _fromRow(Map<String, dynamic> m) {
    final lat = (m['latitude'] as num?)?.toDouble();
    final lng = (m['longitude'] as num?)?.toDouble();
    final ts = DateTime.tryParse(m['timestamp']?.toString() ?? '');
    // Guard against impossible / corrupt coordinates.
    if (lat == null || lng == null || ts == null) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (lat == 0 && lng == 0) return null;

    return GpsPosition(
      latitude: lat,
      longitude: lng,
      accuracy: (m['accuracy'] as num?)?.toDouble() ?? 0,
      speed: _kmhToMs((m['speed_kmh'] as num?)?.toDouble()),
      heading: (m['bearing'] as num?)?.toDouble(),
      timestamp: ts.toLocal(),
    );
  }

  static double? _kmhToMs(double? kmh) => kmh == null ? null : kmh / 3.6;
}
