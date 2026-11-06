// ─────────────────────────────────────────────────────────────────────────────
// driver_document.dart
// Mirrors the EXISTING Web ERP `documents` table (schema verified from
// src/pages/Documents.jsx). No new tables created.
//
// Verified columns:
//   id             UUID PK (server generated)
//   document_type  TEXT  legacy alias of doc_type (web writes both)
//   related_entity TEXT  legacy alias of category (web writes both)
//   title          TEXT  display name
//   category       TEXT  'driver' | 'vehicle' | 'customer' | 'trip'
//   doc_type       TEXT  license | badge | medical | police_cert | aadhar |
//                        bank | other
//   status         TEXT  snapshot stored at insert ('active'|'expiring_soon'|
//                        'expired'); ALWAYS recomputed from expiry_date for
//                        display (same rule as web calcStatus)
//   expiry_date    TEXT  'YYYY-MM-DD' or null
//   reminder_date  TEXT  or null
//   notes          TEXT  or null
//   driver_id      TEXT  set when category='driver'
//   file_name      TEXT  original file name
//   file_url       TEXT  storage URL (Flutter uploads to bucket 'documents')
//   document_id    TEXT  human reference e.g. DOC-1729...
//   created_at     TIMESTAMPTZ (server)
// ─────────────────────────────────────────────────────────────────────────────

class DriverDocument {
  final String id;
  final String title;
  final String docType;
  final String? status; // stored snapshot — prefer computedStatus
  final DateTime? expiryDate; // parsed from 'YYYY-MM-DD'
  final String? notes;
  final String? driverId;
  final String? fileName;
  final String? fileUrl;
  final String? documentId; // human reference
  final DateTime? createdAt;

  const DriverDocument({
    required this.id,
    required this.title,
    required this.docType,
    this.status,
    this.expiryDate,
    this.notes,
    this.driverId,
    this.fileName,
    this.fileUrl,
    this.documentId,
    this.createdAt,
  });

  /// Column list used in selects (mirrors web usage).
  static const String selectColumns =
      'id, title, category, doc_type, status, expiry_date, notes, driver_id, '
      'file_name, file_url, created_at';

  factory DriverDocument.fromMap(Map<String, dynamic> m) {
    return DriverDocument(
      id: m['id']?.toString() ?? '',
      title: m['title']?.toString() ?? '',
      docType: (m['doc_type'] ?? m['document_type'])?.toString() ?? 'other',
      status: m['status'] as String?,
      expiryDate: _parseDay(m['expiry_date']),
      notes: m['notes'] as String?,
      driverId: m['driver_id'] as String?,
      fileName: m['file_name'] as String?,
      fileUrl: m['file_url'] as String?,
      documentId: m['document_id'] as String?,
      createdAt: DateTime.tryParse(m['created_at']?.toString() ?? ''),
    );
  }

  /// Insert payload — writes BOTH modern and legacy columns exactly like the
  /// Web ERP does, so rows stay compatible with every consumer.
  Map<String, dynamic> toInsertMap({required String fileUrl}) {
    return {
      'document_type': docType,
      'related_entity': 'driver',
      'category': 'driver',
      'doc_type': docType,
      'title': title,
      // status is a snapshot at insert time; viewers recompute from expiry.
      'status': computedStatus,
      'expiry_date': expiryDate == null
          ? null
          : '${expiryDate!.year.toString().padLeft(4, '0')}-'
                '${expiryDate!.month.toString().padLeft(2, '0')}-'
                '${expiryDate!.day.toString().padLeft(2, '0')}',
      'notes': notes,
      'driver_id': driverId,
      'file_name': fileName,
      'file_url': fileUrl,
      'document_id':
          documentId ?? 'DOC-${DateTime.now().millisecondsSinceEpoch}',
    };
  }

  // ── Status logic (identical rule to web calcStatus) ───────────────────────

  String get computedStatus {
    if (expiryDate == null) return status ?? 'active';
    final today = DateTime.now();
    final todayMid = DateTime(today.year, today.month, today.day);
    final diffDays = expiryDate!.difference(todayMid).inDays;
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'expiring_soon';
    return 'active';
  }

  bool get isExpired => computedStatus == 'expired';
  bool get isExpiringSoon => computedStatus == 'expiring_soon';

  bool get isImage {
    final name = (fileName ?? fileUrl ?? '').toLowerCase();
    return name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png');
  }

  // ── Private ───────────────────────────────────────────────────────────────

  static DateTime? _parseDay(dynamic v) {
    if (v == null) return null;
    final s = v.toString();
    // 'YYYY-MM-DD' → parse as local date (avoid TZ shifting the day)
    if (s.length >= 10) return DateTime.tryParse(s.substring(0, 10));
    return null;
  }

  @override
  String toString() => 'DriverDocument($id, $docType, $computedStatus)';
}
