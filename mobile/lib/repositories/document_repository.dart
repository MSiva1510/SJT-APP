// ─────────────────────────────────────────────────────────────────────────────
// document_repository.dart
// Day 48 — driver documents against the EXISTING Web ERP tables:
//
//   • Table : documents        (schema verified from src/pages/Documents.jsx)
//   • Bucket: documents        (the ONLY bucket the Web ERP uses — see
//                              driverRepository.uploadLicenseImage /
//                              uploadProfilePhoto; mobile config already
//                              declares it as documentsBucket)
//
// Path convention inside the bucket mirrors the web precedent of
// per-purpose prefixes + driver id + timestamp:
//     driver-documents/<driverId>/<epochMs>_<fileName>
//
// URL strategy follows the EXISTING architecture (getPublicUrl), which keeps
// rows readable by the Web ERP Documents page that renders file_url directly.
// If the org later switches the bucket to private, switch this single method
// to createSignedUrl() — nothing else changes.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:typed_data';

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../core/config/supabase_config.dart';
import '../models/driver_document.dart';

class DocumentRepository {
  DocumentRepository(this._client);

  final SupabaseClient _client;

  String get _table => SupabaseConfig.documentsTable;

  // ── Read ───────────────────────────────────────────────────────────────────

  /// All driver-category documents for one driver, newest first.
  Future<List<DriverDocument>> getDriverDocuments(String driverId) async {
    final data = await _client
        .from(_table)
        .select(DriverDocument.selectColumns)
        .eq('category', 'driver')
        .eq('driver_id', driverId)
        .order('created_at', ascending: false);

    return (data as List)
        .whereType<Map<String, dynamic>>()
        .map(DriverDocument.fromMap)
        .toList(growable: false);
  }

  Future<DriverDocument?> getDocument(String id) async {
    final data = await _client
        .from(_table)
        .select(DriverDocument.selectColumns)
        .eq('id', id)
        .maybeSingle();
    if (data == null) return null;
    return DriverDocument.fromMap(data);
  }

  // ── Write ──────────────────────────────────────────────────────────────────

  /// Uploads bytes to the existing 'documents' Storage bucket and inserts the
  /// matching row. Returns the created document.
  Future<DriverDocument> uploadDocument({
    required String driverId,
    required String title,
    required String docType,
    required String fileName,
    required Uint8List fileBytes,
    DateTime? expiryDate,
    String? notes,
    String? contentType,
    void Function(int sent, int total)? onProgress,
  }) async {
    // 1. Storage upload (existing bucket, deterministic path)
    final safeName = fileName.replaceAll(RegExp(r'[^\w.\-]'), '_');
    final objectPath =
        'driver-documents/$driverId/${DateTime.now().millisecondsSinceEpoch}_$safeName';

    await _client.storage.from(SupabaseConfig.documentsBucket).uploadBinary(
          objectPath,
          fileBytes,
          fileOptions: FileOptions(
            contentType: contentType ?? 'application/octet-stream',
            upsert: false,
          ),
        );

    // 2. Public URL — same strategy as the existing web code.
    final publicUrl = _client.storage
        .from(SupabaseConfig.documentsBucket)
        .getPublicUrl(objectPath);

    // 3. Row insert (legacy alias columns included for compatibility).
    final doc = DriverDocument(
      id: '',
      title: title,
      docType: docType,
      expiryDate: expiryDate,
      notes: notes,
      driverId: driverId,
      fileName: fileName,
      fileUrl: publicUrl,
    );

    final inserted = await _client
        .from(_table)
        .insert(doc.toInsertMap(fileUrl: publicUrl))
        .select(DriverDocument.selectColumns)
        .single();

    return DriverDocument.fromMap(inserted);
  }

  /// Deletes the storage object (best effort) and the table row.
  /// The row delete is authoritative; a failed object cleanup must not block
  /// removal (matches web behavior of deleting rows only).
  Future<void> deleteDocument(DriverDocument doc) async {
    final path = _extractObjectPath(doc.fileUrl);
    if (path != null) {
      try {
        await _client.storage.from(SupabaseConfig.documentsBucket).remove([path]);
      } catch (_) {/* orphaned object cleanup is non-critical here */}
    }
    await _client.from(_table).delete().eq('id', doc.id);
  }

  /// Updates editable metadata only — never file bytes or ownership columns.
  Future<DriverDocument> updateDocumentMetadata(
    DriverDocument doc, {
    String? title,
    String? notes,
    DateTime? expiryDate,
  }) {
    final payload = <String, dynamic>{
      if (title != null) 'title': title,
      if (notes != null) 'notes': notes,
      if (expiryDate != null)
        'expiry_date':
            '${expiryDate.year.toString().padLeft(4, '0')}-'
                '${expiryDate.month.toString().padLeft(2, '0')}-'
                '${expiryDate.day.toString().padLeft(2, '0')}',
    };
    if (payload.isEmpty) return Future.value(doc);

    return _client
        .from(_table)
        .update(payload)
        .eq('id', doc.id)
        .select(DriverDocument.selectColumns)
        .single()
        .then(DriverDocument.fromMap);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /// Extracts the object path from a public storage URL:
  ///   .../storage/v1/object/public/documents/driver-documents/x.jpg
  ///                                                └──── extracted ────┘
  static String? _extractObjectPath(String? url) {
    if (url == null) return null;
    final marker = '/object/public/${SupabaseConfig.documentsBucket}/';
    final i = url.indexOf(marker);
    if (i == -1) return null;
    final path = url.substring(i + marker.length).split('?').first;
    return path.isEmpty ? null : path;
  }
}
