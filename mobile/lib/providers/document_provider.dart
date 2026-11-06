// ─────────────────────────────────────────────────────────────────────────────
// document_provider.dart
// Day 48 — Riverpod state for driver documents.
//
// States: initial → loading → loaded/empty/error, plus uploading/deleting/
// refreshing transitions. Depends on authProvider — never fetches when the
// driver profile is missing.
//
// Architecture (per spec):
//   Screen ← Provider ← Service ← Repository ← Supabase
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/driver_document.dart';
import '../repositories/document_repository.dart';
import '../services/document_service.dart';
import 'auth_provider.dart';

// ── Singleton providers ───────────────────────────────────────────────────────

final documentRepositoryProvider = Provider<DocumentRepository>((ref) {
  return DocumentRepository(ref.watch(supabaseClientProvider));
});

final documentServiceProvider = Provider<DocumentService>((ref) {
  return DocumentService(ref.watch(documentRepositoryProvider));
});

final documentsProvider =
    StateNotifierProvider<DocumentsNotifier, DocumentState>((ref) {
  return DocumentsNotifier(
    ref.watch(documentServiceProvider),
    ref,
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// States
// ═════════════════════════════════════════════════════════════════════════════

sealed class DocumentState {
  const DocumentState();
}

class DocumentsInitial extends DocumentState {
  const DocumentsInitial();
}

class DocumentsLoading extends DocumentState {
  const DocumentsLoading();
}

/// Refresh pull-to-refresh while old data stays visible.
class DocumentsRefreshing extends DocumentState {
  final List<DriverDocument> documents;
  const DocumentsRefreshing(this.documents);
}

/// Upload in progress — list stays visible behind a progress indicator.
class DocumentsUploading extends DocumentState {
  final List<DriverDocument> documents;
  const DocumentsUploading(this.documents);
}

/// Delete in progress.
class DocumentsDeleting extends DocumentState {
  final List<DriverDocument> documents;
  final String deletingId;
  const DocumentsDeleting(this.documents, this.deletingId);
}

class DocumentsLoaded extends DocumentState {
  final List<DriverDocument> documents;
  const DocumentsLoaded(this.documents);
}

class DocumentsEmpty extends DocumentState {
  const DocumentsEmpty();
}

class DocumentsError extends DocumentState {
  final String message;
  const DocumentsError(this.message);
}

// ═════════════════════════════════════════════════════════════════════════════
// Notifier
// ═════════════════════════════════════════════════════════════════════════════

class DocumentsNotifier extends StateNotifier<DocumentState> {
  DocumentsNotifier(this._service, this._ref) : super(const DocumentsInitial());

  final DocumentService _service;
  final Ref _ref;

  List<DriverDocument> _current() {
    final s = state;
    if (s is DocumentsLoaded) return s.documents;
    if (s is DocumentsRefreshing) return s.documents;
    if (s is DocumentsUploading) return s.documents;
    if (s is DocumentsDeleting) return s.documents;
    return const [];
  }

  // ── Load / refresh ────────────────────────────────────────────────────────

  Future<void> load({bool refreshing = false}) async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) {
      state = const DocumentsError('Driver profile not available.');
      return;
    }

    final prev = _current();
    state = (refreshing && prev.isNotEmpty)
        ? DocumentsRefreshing(prev)
        : (prev.isNotEmpty ? DocumentsRefreshing(prev) : const DocumentsLoading());

    try {
      final docs = await _service.getDocuments(driver);
      state = docs.isEmpty ? const DocumentsEmpty() : DocumentsLoaded(docs);
    } on DocumentException catch (e) {
      // Keep stale data visible when a refresh fails mid-session.
      if (prev.isNotEmpty) {
        state = DocumentsLoaded(prev);
        rethrow;
      }
      state = DocumentsError(e.message);
    } catch (_) {
      if (prev.isNotEmpty) {
        state = DocumentsLoaded(prev);
        return;
      }
      state = const DocumentsError('Could not load documents. Please retry.');
    }
  }

  /// Pull-to-refresh entry point. Errors are surfaced to the caller so the
  /// screen can show a snackbar without replacing the list.
  Future<void> refresh() async {
    try {
      await load(refreshing: true);
    } on DocumentException {
      rethrow;
    }
  }

  // ── Upload ────────────────────────────────────────────────────────────────

  /// Throws [DocumentException] on failure (screen shows friendly snackbar).
  Future<void> upload({
    required String title,
    required String docTypeKey,
    required Uint8List bytes,
    required String fileName,
    String? mimeType,
    DateTime? expiryDate,
    String? notes,
  }) async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) {
      throw const DocumentException(
        'Driver profile not available.',
        code: DocumentErrorCode.driverNotFound,
      );
    }

    final prev = _current();
    state = DocumentsUploading(prev);
    try {
      await _service.upload(
        driver: driver,
        title: title,
        docTypeKey: docTypeKey,
        fileName: fileName,
        bytes: bytes,
        mimeType: mimeType,
        expiryDate: expiryDate,
        notes: notes,
      );
      await load(); // reload from source of truth
    } on DocumentException catch (e) {
      // Restore the pre-upload list; the error is handled by the UI.
      state = prev.isNotEmpty ? DocumentsLoaded(prev) : DocumentsError(e.message);
      rethrow;
    } catch (_) {
      state = prev.isNotEmpty ? DocumentsLoaded(prev) : const DocumentsError('Upload failed.');
      throw const DocumentException(
        'Upload failed. Please try again.',
        code: DocumentErrorCode.unknown,
      );
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  /// Throws [DocumentException] on failure.
  Future<void> delete(DriverDocument document) async {
    final driver = _ref.read(currentDriverProvider);
    if (driver == null) {
      throw const DocumentException(
        'Driver profile not available.',
        code: DocumentErrorCode.driverNotFound,
      );
    }

    final prev = _current();
    state = DocumentsDeleting(prev, document.id);
    try {
      await _service.deleteDocument(document: document, driver: driver);
      final remaining =
          prev.where((d) => d.id != document.id).toList(growable: false);
      state =
          remaining.isEmpty ? const DocumentsEmpty() : DocumentsLoaded(remaining);
    } on DocumentException catch (e) {
      state = prev.isNotEmpty ? DocumentsLoaded(prev) : DocumentsError(e.message);
      rethrow;
    } catch (_) {
      state = prev.isNotEmpty ? DocumentsLoaded(prev) : const DocumentsError('Delete failed.');
      throw const DocumentException(
        'Could not delete the document. Please try again.',
        code: DocumentErrorCode.unknown,
      );
    }
  }
}
