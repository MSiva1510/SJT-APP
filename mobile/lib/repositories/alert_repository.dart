// ─────────────────────────────────────────────────────────────────────────────
// alert_repository.dart — delivers SOS / vehicle-issue reports to the office.
//
// Write path: RPC public.driver_raise_alert (SECURITY DEFINER, see
// supabase/migrations/20261027_driver_alerts.sql). Drivers have no direct
// INSERT on fleet_alerts. A successful call means the alert row exists and
// admins/managers were notified — failures throw, never fake success.
//
// Photos go to the existing 'documents' bucket under
// driver-documents/<auth uid>/ (same prefix document uploads already use, so
// existing storage policies apply). A failed photo upload never blocks the
// alert itself.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/config/supabase_config.dart';
import '../core/demo/demo_session.dart';
import '../models/driver_alert.dart';

class AlertException implements Exception {
  const AlertException(this.message);
  final String message;
  @override
  String toString() => 'AlertException: $message';
}

class AlertRepository {
  AlertRepository(this._client);

  final SupabaseClient _client;

  /// Raises the alert and returns the fleet_alerts id.
  Future<String> raiseAlert(DriverAlertRequest request) async {
    if (DemoSession.active) {
      return 'demo-alert-${DateTime.now().millisecondsSinceEpoch}';
    }
    try {
      final id = await _client.rpc(
        'driver_raise_alert',
        params: request.toRpcParams(),
      );
      if (id == null || '$id'.isEmpty) {
        throw const AlertException('The office did not confirm the alert.');
      }
      return '$id';
    } on AlertException {
      rethrow;
    } catch (e) {
      final msg = '$e';
      throw AlertException(
        'Could not reach the office (${msg.length > 120 ? '${msg.substring(0, 120)}…' : msg}). '
        'The alert was NOT sent.',
      );
    }
  }

  /// Uploads an issue photo and returns its public URL, or null on failure
  /// (callers send the report without the photo).
  Future<String?> uploadIssuePhoto(String localPath) async {
    if (DemoSession.active) return null;
    final uid = _client.auth.currentUser?.id;
    if (uid == null) return null;
    try {
      final path =
          'driver-documents/$uid/issue_${DateTime.now().millisecondsSinceEpoch}.jpg';
      await _client.storage.from(SupabaseConfig.documentsBucket).upload(
            path,
            File(localPath),
            fileOptions: const FileOptions(contentType: 'image/jpeg'),
          );
      return _client.storage
          .from(SupabaseConfig.documentsBucket)
          .getPublicUrl(path);
    } catch (_) {
      return null;
    }
  }
}
