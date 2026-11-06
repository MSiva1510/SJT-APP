// ─────────────────────────────────────────────────────────────────────────────
// document_service.dart
// Day 48 — business logic between DocumentProvider and DocumentRepository.
//
// Responsibilities: load / upload / delete documents, validate files,
// resolve view URLs, map low-level errors to friendly messages.
// No UI logic, no widget imports.
//
// Validation rules mirror the Web ERP Documents page exactly
// (src/pages/Documents.jsx): JPEG / PNG / PDF only, max 5 MB.
// Magic-byte checks guard against mislabeled or dangerous files.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:typed_data';

import '../core/demo/demo_session.dart';
import '../models/driver_document.dart';
import '../models/driver_profile.dart';
import '../repositories/document_repository.dart';

class DocumentService {
  DocumentService(this._repo);

  final DocumentRepository _repo;

  static const int maxFileSizeBytes = 5 * 1024 * 1024; // 5 MB (web parity)

  /// Driver document types — mirrors web DOC_TYPES['driver'].
  /// [hasExpiry] documents should prompt for an expiry date on upload.
  static const List<SjtDocType> docTypes = [
    SjtDocType('license', 'Driving License', hasExpiry: true),
    SjtDocType('badge', 'Badge', hasExpiry: true),
    SjtDocType('medical', 'Medical Certificate', hasExpiry: true),
    SjtDocType('police_cert', 'Police Verification', hasExpiry: true),
    SjtDocType('aadhar', 'Aadhaar Card'),
    SjtDocType('bank', 'Bank Document'),
    SjtDocType('other', 'Other'),
  ];

  static SjtDocType? docTypeByKey(String key) {
    for (final t in docTypes) {
      if (t.key == key) return t;
    }
    return null;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  Future<List<DriverDocument>> getDocuments(DriverProfile? driver) async {
    _requireDriver(driver);
    if (DemoSession.active) return DemoSession.documents;
    try {
      return await _repo.getDriverDocuments(driver!.id);
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  Future<DriverDocument> upload({
    required DriverProfile? driver,
    required String title,
    required String docTypeKey,
    required String fileName,
    required Uint8List bytes,
    String? mimeType,
    DateTime? expiryDate,
    String? notes,
  }) async {
    _requireDriver(driver);

    if (title.trim().isEmpty) {
      throw const DocumentException(
        'Please give the document a name.',
        code: DocumentErrorCode.invalidFile,
      );
    }
    if (docTypeByKey(docTypeKey) == null) {
      throw const DocumentException(
        'Unknown document type.',
        code: DocumentErrorCode.invalidFile,
      );
    }

    if (DemoSession.active) {
      final doc = DriverDocument(
        id: 'demo-doc-${DateTime.now().millisecondsSinceEpoch}',
        title: title.trim(),
        docType: docTypeKey,
        status: 'pending',
        expiryDate: expiryDate,
        notes: notes?.trim().isEmpty == true ? null : notes?.trim(),
        driverId: driver!.id,
        fileName: fileName,
        createdAt: DateTime.now(),
      );
      DemoSession.addDocument(doc);
      return doc;
    }

    final type = _validateFile(fileName, bytes, mimeType);

    try {
      return await _repo.uploadDocument(
        driverId: driver!.id,
        title: title.trim(),
        docType: docTypeKey,
        fileName: fileName,
        fileBytes: bytes,
        expiryDate: expiryDate,
        notes: notes?.trim().isEmpty == true ? null : notes?.trim(),
        contentType: type.mimeType,
      );
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  Future<void> deleteDocument({
    required DriverDocument document,
    required DriverProfile? driver,
  }) async {
    _requireDriver(driver);
    // Ownership check — defence in depth on top of RLS.
    if (document.driverId != driver!.id) {
      throw const DocumentException(
        "You can only delete your own documents.",
        code: DocumentErrorCode.unauthorized,
      );
    }
    try {
      await _repo.deleteDocument(document);
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Metadata ──────────────────────────────────────────────────────────────

  Future<DriverDocument> updateMetadata(
    DriverDocument document, {
    required DriverProfile? driver,
    String? title,
    String? notes,
    DateTime? expiryDate,
  }) async {
    _requireDriver(driver);
    if (document.driverId != driver!.id) {
      throw const DocumentException(
        "You can only edit your own documents.",
        code: DocumentErrorCode.unauthorized,
      );
    }
    try {
      return await _repo.updateDocumentMetadata(
        document,
        title: title,
        notes: notes,
        expiryDate: expiryDate,
      );
    } catch (e) {
      throw _map(e);
    }
  }

  // ── Viewing ───────────────────────────────────────────────────────────────

  /// URL used to display/download the stored file.
  ///
  /// The existing architecture stores a public storage URL in `file_url`
  /// (same as the Web ERP). If the bucket is ever switched to private,
  /// replace this with `createSignedUrl()` in one place — here.
  String resolveViewUrl(DriverDocument document) =>
      document.fileUrl ?? '';

  // ── Validation ────────────────────────────────────────────────────────────

  ValidatedFileType _validateFile(String fileName, Uint8List bytes, String? mime) {
    if (bytes.isEmpty) {
      throw const DocumentException(
        'The selected file is empty.',
        code: DocumentErrorCode.emptyFile,
      );
    }
    if (bytes.length > maxFileSizeBytes) {
      throw const DocumentException(
        'File is too large. Maximum size is 5 MB.',
        code: DocumentErrorCode.tooLarge,
      );
    }

    final ext = fileName.contains('.')
        ? fileName.split('.').last.toLowerCase()
        : '';
    final type = ValidatedFileType.detect(ext: ext, mime: mime, head: bytes);

    if (type == null) {
      throw const DocumentException(
        'Only JPG, PNG or PDF files are allowed.',
        code: DocumentErrorCode.invalidType,
      );
    }
    return type;
  }

  // ── Guards & error mapping ────────────────────────────────────────────────

  void _requireDriver(DriverProfile? driver) {
    if (driver == null || driver.id.isEmpty) {
      throw const DocumentException(
        'Driver profile not loaded. Please log in again.',
        code: DocumentErrorCode.driverNotFound,
      );
    }
  }

  DocumentException _map(Object e) {
    final msg = e.toString().toLowerCase();

    if (msg.contains('payload too large') || msg.contains('file size')) {
      return const DocumentException(
        'File is too large. Maximum size is 5 MB.',
        code: DocumentErrorCode.tooLarge,
      );
    }
    if (msg.contains('network') ||
        msg.contains('socket') ||
        msg.contains('connection')) {
      return const DocumentException(
        'No internet connection. Please try again.',
        code: DocumentErrorCode.network,
      );
    }
    if (msg.contains('jwt') || msg.contains('session') || msg.contains('expired')) {
      return const DocumentException(
        'Your session has expired. Please log in again.',
        code: DocumentErrorCode.sessionExpired,
      );
    }
    if (msg.contains('permission') ||
        msg.contains('rls') ||
        msg.contains('policy') ||
        msg.contains('row-level')) {
      return const DocumentException(
        'Access denied. Contact your administrator.',
        code: DocumentErrorCode.unauthorized,
      );
    }
    if (msg.contains('storage') || msg.contains('bucket') || msg.contains('upload')) {
      return const DocumentException(
        'Could not save the file to storage. Please try again.',
        code: DocumentErrorCode.storage,
      );
    }
    return DocumentException(
      'Something went wrong. Please try again.',
      code: DocumentErrorCode.unknown,
      detail: e.toString(),
    );
  }
}

// ── File-type detection ───────────────────────────────────────────────────────

class ValidatedFileType {
  const ValidatedFileType(this.key, this.mimeType);
  final String key; // jpg | png | pdf
  final String mimeType;

  static ValidatedFileType? detect({
    required String ext,
    String? mime,
    List<int>? head,
  }) {
    bool magic(List<int> magic) {
      if (head == null || head.length < magic.length) return false;
      for (var i = 0; i < magic.length; i++) {
        if (head[i] != magic[i]) return false;
      }
      return true;
    }

    final isJpeg = magic([0xFF, 0xD8, 0xFF]);
    final isPng = magic([0x89, 0x50, 0x4E, 0x47]);
    final isPdf = head != null && head.length >= 4 &&
        head[0] == 0x25 && head[1] == 0x50 && head[2] == 0x44 && head[3] == 0x46;

    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return isJpeg ? ValidatedFileType('jpg', 'image/jpeg') : null;
      case 'png':
        return isPng ? ValidatedFileType('png', 'image/png') : null;
      case 'pdf':
        return isPdf ? ValidatedFileType('pdf', 'application/pdf') : null;
      default:
        // No/unknown extension → trust content sniffing with declared mime.
        if (isJpeg) return ValidatedFileType('jpg', 'image/jpeg');
        if (isPng) return ValidatedFileType('png', 'image/png');
        if (mime == 'image/jpeg' && isJpeg) {
          return ValidatedFileType('jpg', 'image/jpeg');
        }
        return null;
    }
  }
}

// ── Doc-type metadata ─────────────────────────────────────────────────────────

class SjtDocType {
  const SjtDocType(this.key, this.label, {this.hasExpiry = false});
  final String key;
  final String label;
  final bool hasExpiry;
}

// ── Exception ─────────────────────────────────────────────────────────────────

class DocumentException implements Exception {
  const DocumentException(this.message, {this.code, this.detail});
  final String message;
  final DocumentErrorCode? code;
  final String? detail;

  @override
  String toString() => message;
}

enum DocumentErrorCode {
  driverNotFound,
  emptyFile,
  tooLarge,
  invalidType,
  invalidFile,
  unauthorized,
  network,
  sessionExpired,
  storage,
  notFound,
  unknown,
}
