// ─────────────────────────────────────────────────────────────────────────────
// fleet_gps_sync.dart — pulls the vendor GPS feeds into gps_tracking from the
// manager app, so the Fleet map is live without the web dashboard open.
//
// Port of the web sync (sri-jayam-travels-dashboard src/services/gpsProvider):
//   settings (category 'gps') → provider "kingstrack + gpstrack" → one
//   request per vendor → normalised snapshots → upsert into gps_tracking on
//   (vehicle_id, timestamp) with duplicates ignored (idx_gps_tracking_dedup).
// `<vendor>_<key>` settings override plain keys; with several vendors the
// shared api_url is ignored and each uses its own default (same as the web).
// The phone calls the vendors directly (no CORS on mobile); staff RLS
// (settings_select / gps_tracking_staff_all) allows the read and the write.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

typedef FleetSyncResult = ({int written, List<String> errors});

/// One normalised vendor fix.
class GpsSnapshot {
  const GpsSnapshot({
    required this.lat,
    required this.lng,
    required this.at,
    this.imei = '',
    this.registration = '',
    this.address,
    this.speedKmh = 0,
    this.ignition,
    this.gpsOnline,
    this.status,
    this.odometer,
    this.bearing,
    this.raw = const {},
  });

  final double lat;
  final double lng;
  final DateTime at;
  final String imei;
  final String registration;
  final String? address;
  final double speedKmh;
  final bool? ignition;
  final bool? gpsOnline;
  final String? status;
  final double? odometer;
  final double? bearing;
  final Map<String, dynamic> raw;

  String get key => imei.isNotEmpty ? imei : registration;

  /// Minute-rounded UTC, the dedup key the web also writes.
  DateTime get minute =>
      DateTime.fromMillisecondsSinceEpoch(
        at.millisecondsSinceEpoch ~/ 60000 * 60000,
        isUtc: true,
      );
}

/// 'py01 vf-1255' → 'PY01VF1255'.
String normalizeRegistration(Object? reg) =>
    '${reg ?? ''}'.toUpperCase().replaceAll(RegExp('[^A-Z0-9]'), '');

/// "kingstrack + gpstrack" → [kingstrack, gpstrack].
List<String> parseProviderNames(Object? value) {
  final out = <String>[];
  for (final part in '${value ?? ''}'.split(RegExp(r'[,+|/\s]+'))) {
    final name = part.trim().toLowerCase();
    if (name.isNotEmpty && !out.contains(name)) out.add(name);
  }
  return out;
}

/// Settings as one vendor sees them.
Map<String, dynamic> settingsForProvider(
  String name,
  Map<String, dynamic> settings, {
  bool multi = false,
}) {
  final scoped = {...settings};
  if (multi) scoped.remove('api_url');
  final prefix = '${name}_';
  settings.forEach((k, v) {
    if (k.startsWith(prefix)) scoped[k.substring(prefix.length)] = v;
  });
  return scoped;
}

double? _num(Object? v) {
  if (v == null || v == '') return null;
  if (v is num) return v.toDouble();
  return double.tryParse('$v');
}

String? _text(Object? v) {
  final s = '${v ?? ''}'.trim();
  return s.isEmpty ? null : s;
}

bool? _flag(Object? v) {
  final t = '${v ?? ''}'.trim().toUpperCase();
  if (const ['1', 'TRUE', 'YES', 'ON', 'A', 'ACTIVE', 'VALID'].contains(t)) return true;
  if (const ['0', 'FALSE', 'NO', 'OFF', 'V', 'VOID', 'INACTIVE'].contains(t)) return false;
  return null;
}

Object? _pick(Map m, List<String> keys) {
  for (final k in keys) {
    final v = m[k];
    if (v != null && v != '') return v;
  }
  return null;
}

/// Vendor time → UTC. Epoch ms, ISO with zone, or a zone-less local time,
/// which is India time (the web parses it in an IST browser).
DateTime? parseVendorTime(Object? v) {
  if (v == null || v == '') return null;
  final ms = v is num ? v : num.tryParse('$v');
  if (ms != null) {
    return DateTime.fromMillisecondsSinceEpoch(ms.toInt(), isUtc: true);
  }
  final s = '$v'.trim();
  final hasZone = RegExp(r'(Z|[+-]\d{2}:?\d{2})$').hasMatch(s);
  final parsed = DateTime.tryParse(hasZone ? s : s.replaceFirst(' ', 'T'));
  if (parsed == null) return null;
  if (hasZone) return parsed.toUtc();
  return DateTime.utc(parsed.year, parsed.month, parsed.day, parsed.hour,
          parsed.minute, parsed.second)
      .subtract(const Duration(hours: 5, minutes: 30));
}

List _list(Object? raw) => raw is List
    ? raw
    : raw is Map && raw['data'] is List
        ? raw['data'] as List
        : raw is Map && raw['vehicles'] is List
            ? raw['vehicles'] as List
            : const [];

/// KingsTrack live JSON (keys vary by account version).
List<GpsSnapshot> normalizeKingsTrack(Object? raw, {DateTime? now}) => [
      for (final v in _list(raw).whereType<Map>())
        if ((_num(_pick(v, ['Latitude', 'latitude', 'lat'])),
                _num(_pick(v, ['Longitude', 'longitude', 'lng'])))
            case (final lat?, final lng?))
          GpsSnapshot(
            lat: lat,
            lng: lng,
            at: parseVendorTime(_pick(v, ['Timestamp', 'timestamp', 'ts', 'time'])) ??
                (now ?? DateTime.now()).toUtc(),
            imei: '${_pick(v, ['IMEI', 'imei', 'DeviceIMEI', 'imei_no']) ?? ''}'.trim(),
            registration: normalizeRegistration(
                _pick(v, ['Vehicle', 'registration', 'plate_no', 'plateNo', 'vehicle_no'])),
            address: _text(_pick(v, ['Address', 'address'])),
            speedKmh: _num(_pick(v, ['Speed', 'speed'])) ?? 0,
            ignition: _flag(_pick(v, ['Ignition', 'ignition'])) ?? false,
            gpsOnline: _flag(_pick(v, ['GPS', 'gps', 'Gps'])) ?? false,
            status: _text(_pick(v, ['Status', 'status']))?.toLowerCase(),
            odometer: _num(_pick(v, ['Odometer', 'odometer'])),
            raw: Map<String, dynamic>.from(v),
          ),
    ];

/// GPSTrack.in get_current_data (array; `date` is epoch ms).
List<GpsSnapshot> normalizeGpsTrack(Object? raw, {DateTime? now}) {
  final clock = (now ?? DateTime.now()).toUtc();
  return [
    for (final v in _list(raw).whereType<Map>())
      if ((_num(v['latitude']), _num(v['longitude'])) case (final lat?, final lng?))
        () {
          final at = parseVendorTime(v['date']) ?? parseVendorTime(v['isoDate']) ?? clock;
          final speed = _num(v['speed']) ?? 0;
          final vs = '${v['vehicleStatus'] ?? v['status'] ?? ''}'.trim().toLowerCase();
          return GpsSnapshot(
            lat: lat,
            lng: lng,
            at: at,
            imei: '${v['deviceId'] ?? ''}'.trim(),
            registration: normalizeRegistration(v['regNo']),
            address: _text(v['address']),
            speedKmh: speed,
            ignition: '${v['ignitionStatus'] ?? ''}'.toUpperCase() == 'ON',
            gpsOnline: clock.difference(at) < const Duration(minutes: 10),
            status: vs == 'moving' || speed > 2
                ? 'moving'
                : vs == 'idle'
                    ? 'idle'
                    : 'stopped',
            odometer: _num(v['odoDistance']),
            bearing: _num(v['bearing']),
            raw: Map<String, dynamic>.from(v),
          );
        }(),
  ];
}

class FleetGpsSync {
  FleetGpsSync(this._client, {http.Client? httpClient})
      : _http = httpClient ?? http.Client();

  final SupabaseClient _client;
  final http.Client _http;

  static const kingsTrackUrl =
      'https://mvt.apmkingstrack.com/fleettracking/api/live/json';
  static const gpsTrackUrl = 'https://app.gpstrack.in/api/get_current_data';

  /// KingsTrack rejects GET with 405 on some accounts; remembered per run.
  static String _kingsMethod = 'GET';
  static DateTime? _lastRun;

  /// Fetches every configured vendor and writes the fixes. Never throws:
  /// vendor or write failures come back in `errors`. Calls closer than
  /// [minGap] apart are skipped (KingsTrack allows 1 request / 30 s).
  Future<FleetSyncResult> syncOnce({
    Duration minGap = const Duration(seconds: 45),
  }) async {
    final now = DateTime.now();
    if (_lastRun != null && now.difference(_lastRun!) < minGap) {
      return (written: 0, errors: const <String>[]);
    }
    _lastRun = now;

    final errors = <String>[];
    try {
      final settings = await _settings();
      if (settings['enabled'] == false || '${settings['enabled']}' == 'false') {
        return (written: 0, errors: const <String>[]);
      }
      final names = parseProviderNames(settings['provider'] ?? 'kingstrack');
      final multi = names.length > 1;

      final results = await Future.wait([
        for (final name in names)
          _fetch(name, settingsForProvider(name, settings, multi: multi))
              .then<List<GpsSnapshot>>((s) => s, onError: (Object e) {
            errors.add('$name: ${_short(e)}');
            return const <GpsSnapshot>[];
          }),
      ]);

      // First vendor listed wins when two report the same device.
      final seen = <String>{};
      final snapshots = [
        for (final list in results)
          for (final s in list)
            if (s.key.isEmpty || seen.add(s.key)) s,
      ];
      if (snapshots.isEmpty) return (written: 0, errors: errors);

      final vehicles = await _client.from('vehicles').select('id, registration, imei');
      final byReg = <String, String>{};
      final byImei = <String, String>{};
      for (final v in vehicles) {
        final id = '${v['id']}';
        final reg = normalizeRegistration(v['registration']);
        if (reg.isNotEmpty) byReg[reg] = id;
        final imei = '${v['imei'] ?? ''}'.trim();
        if (imei.isNotEmpty) byImei[imei] = id;
      }

      final rows = <Map<String, dynamic>>[];
      final keys = <String>{};
      for (final s in snapshots) {
        final vehicleId = byImei[s.imei] ?? byReg[s.registration];
        if (vehicleId == null) continue;
        final ts = s.minute.toIso8601String();
        if (!keys.add('$vehicleId|$ts')) continue;
        rows.add({
          'vehicle_id': vehicleId,
          'latitude': s.lat,
          'longitude': s.lng,
          'speed_kmh': s.speedKmh,
          'bearing': s.bearing,
          'address': s.address,
          'ignition': s.ignition,
          'gps_online': s.gpsOnline,
          'status': s.status,
          'odometer': s.odometer,
          'timestamp': ts,
          'raw': s.raw,
        });
      }
      if (rows.isEmpty) return (written: 0, errors: errors);

      await _client
          .from('gps_tracking')
          .upsert(rows, onConflict: 'vehicle_id,timestamp', ignoreDuplicates: true);
      return (written: rows.length, errors: errors);
    } catch (e) {
      errors.add(_short(e));
      return (written: 0, errors: errors);
    }
  }

  Future<Map<String, dynamic>> _settings() async {
    final rows = await _client
        .from('settings')
        .select('setting_key, setting_value')
        .eq('category', 'gps');
    final out = <String, dynamic>{};
    for (final r in rows) {
      final key = r['setting_key'] as String?;
      if (key == null) continue;
      final value = r['setting_value'];
      if (value is String) {
        try {
          out[key] = jsonDecode(value);
        } catch (_) {
          out[key] = value;
        }
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  Future<List<GpsSnapshot>> _fetch(String name, Map<String, dynamic> s) async {
    final timeout = Duration(seconds: (_num(s['timeout']) ?? 30).clamp(10, 60).toInt());
    String url(String fallback) => _text(s['api_url']) ?? fallback;

    switch (name) {
      case 'gpstrack':
        final token = _text(s['api_token']);
        final email = _text(s['api_email']);
        if (token == null || email == null) {
          throw const FormatException('API token and email are not set');
        }
        final uri = Uri.parse(url(gpsTrackUrl)).replace(queryParameters: {
          ...Uri.parse(url(gpsTrackUrl)).queryParameters,
          'token': token,
          'email': email,
        });
        final res = await _http.get(uri).timeout(timeout);
        final body = _decode(res);
        if (body is! List) throw const FormatException('unexpected response');
        return normalizeGpsTrack(body);

      case 'kingstrack':
        final params = {
          'company_id': _text(s['company_id']) ?? '',
          'user_id': _text(s['user_id']) ?? '',
        }..removeWhere((_, v) => v.isEmpty);
        final base = Uri.parse(url(kingsTrackUrl));
        Future<http.Response> send(String method) => method == 'GET'
            ? _http.get(base.replace(queryParameters: {...base.queryParameters, ...params}))
            : _http.post(base, body: params);
        var res = await send(_kingsMethod).timeout(timeout);
        if (res.statusCode == 405 && _kingsMethod == 'GET') {
          // Next run uses POST straight away; retrying now breaks the 30 s rule.
          _kingsMethod = 'POST';
        }
        return normalizeKingsTrack(_decode(res));

      default:
        throw FormatException('unknown GPS provider "$name"');
    }
  }

  Object? _decode(http.Response res) {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw FormatException('HTTP ${res.statusCode}');
    }
    try {
      return jsonDecode(res.body);
    } catch (_) {
      throw const FormatException('invalid JSON');
    }
  }

  /// Never echoes a request URL: it carries the vendor token.
  static String _short(Object e) {
    final m = switch (e) {
      FormatException(:final message) => message,
      TimeoutException() => 'timed out',
      http.ClientException(:final message) => message.split(', uri=').first,
      PostgrestException(:final message) => message,
      _ => 'network error',
    };
    return m.length > 100 ? '${m.substring(0, 100)}…' : m;
  }
}
