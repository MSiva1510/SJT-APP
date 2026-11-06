// ─────────────────────────────────────────────────────────────────────────────
// driver_documents_screen.dart
// Day 48 — driver documents: list, camera/gallery capture, preview, upload,
// view, delete.
//
// States covered (spec Part J): loading, empty, loaded, uploading,
// refreshing, deleting, error, upload success/failure, delete
// confirmation/success/failure.
//
// Architecture: Screen ← documentProvider ← DocumentService ← Repository.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../models/driver_document.dart';
import '../../providers/document_provider.dart';
import '../../services/document_service.dart';

class DriverDocumentsScreen extends ConsumerStatefulWidget {
  const DriverDocumentsScreen({super.key});

  @override
  ConsumerState<DriverDocumentsScreen> createState() =>
      _DriverDocumentsScreenState();
}

class _DriverDocumentsScreenState extends ConsumerState<DriverDocumentsScreen> {
  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(documentsProvider.notifier).load();
    });
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(documentsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Documents')),
      floatingActionButton: FloatingActionButton.extended(
        heroTag: 'addDocument',
        onPressed: _startUploadFlow,
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('Add Document'),
      ),
      body: switch (state) {
        DocumentsInitial() ||
        DocumentsLoading() => const Center(child: CircularProgressIndicator()),
        DocumentsError(:final message) => _ErrorView(
          message: message,
          onRetry: () => ref.read(documentsProvider.notifier).load(),
        ),
        DocumentsEmpty() => _EmptyView(onAdd: _startUploadFlow),
        DocumentsLoaded(:final documents) ||
        DocumentsRefreshing(:final documents) ||
        DocumentsUploading(:final documents) ||
        DocumentsDeleting(:final documents) => _DocumentList(
          documents: documents,
          busy: state is! DocumentsLoaded,
          onRefresh: _safeRefresh,
          onView: _viewDocument,
          onDelete: _confirmDelete,
        ),
      },
    );
  }

  Future<void> _safeRefresh() async {
    try {
      await ref.read(documentsProvider.notifier).refresh();
    } on DocumentException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    }
  }

  // ── Upload flow ───────────────────────────────────────────────────────────

  Future<void> _startUploadFlow() async {
    final choice = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Add Document',
                style: Theme.of(
                  ctx,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              ListTile(
                leading: const Icon(Icons.photo_camera_outlined),
                title: const Text('Take Photo'),
                subtitle: const Text('Capture with the camera'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined),
                title: const Text('Choose from Gallery'),
                subtitle: const Text('Pick an existing image'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (choice == null || !mounted) return;
    await _pickAndPreview(choice);
  }

  Future<void> _pickAndPreview(ImageSource source) async {
    final messenger = ScaffoldMessenger.of(context);
    XFile? file;
    try {
      file = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 2048,
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text(
            'Could not open the camera or gallery. '
            'Please check the app permissions.',
          ),
        ),
      );
      return;
    }
    if (file == null || !mounted) return; // user cancelled

    Uint8List bytes;
    try {
      bytes = await File(file.path).readAsBytes();
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('The selected file could not be read.')),
      );
      return;
    }
    if (!mounted) return;

    try {
      await _showUploadSheet(file, bytes);
    } on DocumentException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Upload failed. Please try again.')),
      );
    }
  }

  Future<void> _showUploadSheet(XFile file, Uint8List bytes) async {
    var selectedType = DocumentService.docTypes.first; // license
    final titleCtrl = TextEditingController(text: selectedType.label);
    final notesCtrl = TextEditingController();
    DateTime? expiry;
    var uploading = false;
    final messenger = ScaffoldMessenger.of(context);

    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      isDismissible: false,
      enableDrag: false,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheet) {
          final theme = Theme.of(sheetCtx);
          return PopScope(
            canPop: !uploading,
            child: Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 12,
                bottom: MediaQuery.of(sheetCtx).viewInsets.bottom + 16,
              ),
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // ── Preview ────────────────────────────────────────────
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          maxHeight: MediaQuery.of(sheetCtx).size.height * 0.32,
                        ),
                        child: Image.file(
                          File(file.path),
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Container(
                            height: 120,
                            color: theme.colorScheme.surfaceContainerHighest,
                            alignment: Alignment.center,
                            child: const Icon(
                              Icons.broken_image_outlined,
                              size: 40,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'New Document',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Close',
                          onPressed: uploading
                              ? null
                              : () => Navigator.pop(sheetCtx, false),
                          icon: const Icon(Icons.close),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),

                    // ── Document type ──────────────────────────────────────
                    DropdownButtonFormField<String>(
                      initialValue: selectedType.key,
                      decoration: const InputDecoration(
                        labelText: 'Document Type',
                        prefixIcon: Icon(Icons.badge_outlined),
                      ),
                      items: DocumentService.docTypes
                          .map(
                            (t) => DropdownMenuItem(
                              value: t.key,
                              child: Text(t.label),
                            ),
                          )
                          .toList(),
                      onChanged: uploading
                          ? null
                          : (key) {
                              if (key == null) return;
                              setSheet(() {
                                selectedType = DocumentService.docTypeByKey(
                                  key,
                                )!;
                                titleCtrl.text = selectedType.label;
                                if (!selectedType.hasExpiry) expiry = null;
                              });
                            },
                    ),
                    const SizedBox(height: 12),

                    // ── Title ──────────────────────────────────────────────
                    TextField(
                      controller: titleCtrl,
                      enabled: !uploading,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Document Name',
                        prefixIcon: Icon(Icons.label_outline),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // ── Expiry (only for types that can expire) ────────────
                    if (selectedType.hasExpiry)
                      InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: uploading
                            ? null
                            : () async {
                                final now = DateTime.now();
                                final picked = await showDatePicker(
                                  context: sheetCtx,
                                  initialDate:
                                      expiry ??
                                      now.add(const Duration(days: 365)),
                                  firstDate: now,
                                  lastDate: now.add(const Duration(days: 3650)),
                                );
                                if (picked != null) {
                                  setSheet(() => expiry = picked);
                                }
                              },
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText:
                                'Expiry Date${expiry == null ? ' (optional)' : ''}',
                            prefixIcon: const Icon(Icons.event_outlined),
                            suffixIcon: expiry == null
                                ? const Icon(
                                    Icons.calendar_today_outlined,
                                    size: 18,
                                  )
                                : IconButton(
                                    icon: const Icon(Icons.close, size: 18),
                                    onPressed: () =>
                                        setSheet(() => expiry = null),
                                  ),
                          ),
                          child: Text(
                            expiry == null
                                ? 'Select date'
                                : DateFormat('dd MMM yyyy').format(expiry!),
                            style: TextStyle(
                              color: expiry == null
                                  ? theme.colorScheme.onSurfaceVariant
                                  : null,
                            ),
                          ),
                        ),
                      ),
                    if (selectedType.hasExpiry) const SizedBox(height: 12),

                    // ── Notes ──────────────────────────────────────────────
                    TextField(
                      controller: notesCtrl,
                      enabled: !uploading,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        labelText: 'Notes (optional)',
                        prefixIcon: Icon(Icons.notes_outlined),
                      ),
                    ),
                    const SizedBox(height: 16),

                    // ── Actions ────────────────────────────────────────────
                    Row(
                      children: [
                        Expanded(
                          child: FilledButton.icon(
                            onPressed: uploading
                                ? null
                                : () async {
                                    setSheet(() => uploading = true);
                                    try {
                                      await ref
                                          .read(documentsProvider.notifier)
                                          .upload(
                                            title: titleCtrl.text.trim(),
                                            docTypeKey: selectedType.key,
                                            bytes: bytes,
                                            fileName: file.name,
                                            expiryDate: expiry,
                                            notes: notesCtrl.text.trim().isEmpty
                                                ? null
                                                : notesCtrl.text.trim(),
                                          );
                                      if (sheetCtx.mounted) {
                                        setSheet(() => uploading = false);
                                        Navigator.pop(sheetCtx, true);
                                      }
                                      if (mounted) {
                                        messenger.showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Document uploaded successfully.',
                                            ),
                                            backgroundColor: Colors.green,
                                          ),
                                        );
                                      }
                                    } on DocumentException catch (e) {
                                      if (sheetCtx.mounted) {
                                        setSheet(() => uploading = false);
                                      }
                                      if (mounted) {
                                        messenger.showSnackBar(
                                          SnackBar(content: Text(e.message)),
                                        );
                                      }
                                    } catch (_) {
                                      if (sheetCtx.mounted) {
                                        setSheet(() => uploading = false);
                                      }
                                      if (mounted) {
                                        messenger.showSnackBar(
                                          const SnackBar(
                                            content: Text(
                                              'Upload failed. Please try again.',
                                            ),
                                          ),
                                        );
                                      }
                                    }
                                  },
                            icon: uploading
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.cloud_upload_outlined),
                            label: Text(uploading ? 'Uploading…' : 'Upload'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );

    if (!mounted) return;
    if (ok != true) {
      // Upload cancelled or failed — nothing to clean up locally.
    }
  }

  // ── View ──────────────────────────────────────────────────────────────────

  Future<void> _viewDocument(DriverDocument doc) async {
    final url = ref.read(documentServiceProvider).resolveViewUrl(doc);

    await showDialog<void>(
      context: context,
      builder: (ctx) => Dialog.fullscreen(
        child: Scaffold(
          appBar: AppBar(
            title: Text(doc.title),
            actions: [
              IconButton(
                icon: const Icon(Icons.copy),
                tooltip: 'Copy link',
                onPressed: () {
                  Clipboard.setData(ClipboardData(text: url));
                  Navigator.pop(ctx);
                  ScaffoldMessenger.of(
                    context,
                  ).showSnackBar(const SnackBar(content: Text('Link copied')));
                },
              ),
            ],
          ),
          body: doc.isImage && url.isNotEmpty
              ? InteractiveViewer(
                  maxScale: 4,
                  child: Center(
                    child: Image.network(
                      url,
                      fit: BoxFit.contain,
                      loadingBuilder: (_, child, progress) => progress == null
                          ? child
                          : const Center(child: CircularProgressIndicator()),
                      errorBuilder: (_, __, ___) => _CannotPreview(doc: doc),
                    ),
                  ),
                )
              : _CannotPreview(doc: doc),
        ),
      ),
    );
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  Future<void> _confirmDelete(DriverDocument doc) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.delete_outline),
        title: const Text('Delete document?'),
        content: Text('"${doc.title}" will be permanently removed.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(ctx).colorScheme.error,
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(documentsProvider.notifier).delete(doc);
      messenger.showSnackBar(
        const SnackBar(content: Text('Document deleted.')),
      );
    } on DocumentException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Could not delete the document. Please try again.'),
        ),
      );
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Sub-widgets
// ═════════════════════════════════════════════════════════════════════════════

class _DocumentList extends StatelessWidget {
  const _DocumentList({
    required this.documents,
    required this.busy,
    required this.onRefresh,
    required this.onView,
    required this.onDelete,
  });

  final List<DriverDocument> documents;
  final bool busy;
  final Future<void> Function() onRefresh;
  final void Function(DriverDocument) onView;
  final void Function(DriverDocument) onDelete;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (busy) const LinearProgressIndicator(minHeight: 2),
        Expanded(
          child: RefreshIndicator(
            onRefresh: onRefresh,
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              itemCount: documents.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (ctx, i) => _DocumentCard(
                doc: documents[i],
                onView: () => onView(documents[i]),
                onDelete: () => onDelete(documents[i]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    required this.doc,
    required this.onView,
    required this.onDelete,
  });

  final DriverDocument doc;
  final VoidCallback onView;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final typeLabel =
        DocumentService.docTypeByKey(doc.docType)?.label ?? doc.docType;

    final (
      chipColor,
      chipTextColor,
      statusLabel,
    ) = switch (doc.computedStatus) {
      'expired' => (
        theme.colorScheme.errorContainer,
        theme.colorScheme.onErrorContainer,
        'Expired',
      ),
      'expiring_soon' => (
        Colors.orange.shade100,
        Colors.orange.shade900,
        'Expiring Soon',
      ),
      _ => (Colors.green.shade100, Colors.green.shade900, 'Valid'),
    };

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: theme.colorScheme.primaryContainer,
              child: Icon(
                doc.isImage
                    ? Icons.image_outlined
                    : Icons.picture_as_pdf_outlined,
                size: 20,
                color: theme.colorScheme.onPrimaryContainer,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          doc.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: chipColor,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          statusLabel,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: chipTextColor,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    typeLabel,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.event_outlined,
                        size: 13,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          doc.expiryDate == null
                              ? 'No expiry'
                              : 'Expires ${DateFormat('dd MMM yyyy').format(doc.expiryDate!)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: doc.isExpired
                                ? theme.colorScheme.error
                                : theme.colorScheme.onSurfaceVariant,
                            fontWeight: doc.isExpiringSoon || doc.isExpired
                                ? FontWeight.w600
                                : null,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      TextButton.icon(
                        onPressed: onView,
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          minimumSize: const Size(0, 40),
                        ),
                        icon: const Icon(Icons.visibility_outlined, size: 16),
                        label: const Text('View'),
                      ),
                      const SizedBox(width: 4),
                      TextButton.icon(
                        onPressed: onDelete,
                        style: TextButton.styleFrom(
                          foregroundColor: theme.colorScheme.error,
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          minimumSize: const Size(0, 40),
                        ),
                        icon: const Icon(Icons.delete_outline, size: 16),
                        label: const Text('Delete'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.folder_off_outlined,
              size: 64,
              color: theme.colorScheme.outline,
            ),
            const SizedBox(height: 16),
            Text(
              'No documents yet',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Upload your driving licence and other\n'
              'documents so the office always has them.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add_a_photo_outlined),
              label: const Text('Add First Document'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 64, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton.tonalIcon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

class _CannotPreview extends StatelessWidget {
  const _CannotPreview({required this.doc});
  final DriverDocument doc;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.description_outlined,
            size: 56,
            color: theme.colorScheme.outline,
          ),
          const SizedBox(height: 12),
          Text(
            'Inline preview is not available for this file.',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 4),
          Text(
            doc.fileName ?? '',
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 16),
          SelectableText(doc.fileUrl ?? '', style: theme.textTheme.bodySmall),
        ],
      ),
    );
  }
}
