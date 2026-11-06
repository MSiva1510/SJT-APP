// ─────────────────────────────────────────────────────────────────────────────
// manager_documents_screen.dart — document expiry list for the manager
// (web: /documents). Every dated driver licence and vehicle insurance / FC /
// PUC / RC (managerExpiringDocsProvider, earliest date per owner + type),
// soonest first, filtered by Expired · Due in 30 days · All. Tap a row →
// the vehicle or driver detail sheet.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/manager_directory.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/manager/manager_record_editor.dart';
import '../../../core/theme/home_tokens.dart';

enum DocFilter { attention, expired, soon, all }

extension DocFilterX on DocFilter {
  String get label => switch (this) {
    DocFilter.attention => 'Needs action',
    DocFilter.expired => 'Expired',
    DocFilter.soon => 'Due in $expirySoonDays days',
    DocFilter.all => 'All',
  };

  bool matches(ExpiryState s) => switch (this) {
    DocFilter.attention => s != ExpiryState.ok,
    DocFilter.expired => s == ExpiryState.expired,
    DocFilter.soon => s == ExpiryState.soon,
    DocFilter.all => true,
  };
}

class ManagerDocumentsScreen extends ConsumerStatefulWidget {
  const ManagerDocumentsScreen({super.key, this.now});

  /// Injected clock for tests.
  final DateTime? now;

  @override
  ConsumerState<ManagerDocumentsScreen> createState() =>
      _ManagerDocumentsScreenState();
}

class _ManagerDocumentsScreenState
    extends ConsumerState<ManagerDocumentsScreen> {
  DocFilter _filter = DocFilter.attention;
  bool _showRecords = false;

  Future<void> _editDocument([Map<String, dynamic>? document]) async {
    try {
      final results = await Future.wait([
        ref.read(managerDriverRecordsProvider.future),
        ref.read(managerVehicleRecordsProvider.future),
        ref.read(managerCustomerRecordsProvider.future),
      ]);
      if (!mounted) return;
      final drivers = results[0] as List<DriverRecord>;
      final vehicles = results[1] as List<VehicleRecord>;
      final customers = results[2] as List<CustomerRecord>;
      final owners = <String, String>{
        for (final d in drivers) 'driver:${d.id}': 'Driver · ${d.name}',
        for (final v in vehicles)
          'vehicle:${v.id}': 'Vehicle · ${v.registration}',
        for (final c in customers) 'customer:${c.id}': 'Customer · ${c.name}',
      };
      final savedOwner = document?['driver_id'] != null
          ? 'driver:${document!['driver_id']}'
          : document?['vehicle_id'] != null
          ? 'vehicle:${document!['vehicle_id']}'
          : document?['customer_id'] != null
          ? 'customer:${document!['customer_id']}'
          : null;
      final values = await showDirectoryRecordEditor(
        context,
        title: document == null ? 'Add document' : 'Edit document',
        fields: [
          DirectoryEditorField(
            'title',
            'Document title',
            initialValue: document?['title'] as String?,
            required: true,
          ),
          DirectoryEditorField(
            'category',
            'Category',
            initialValue: document?['category'] as String? ?? 'driver',
            required: true,
            options: const {
              'driver': 'Driver',
              'vehicle': 'Vehicle',
              'customer': 'Customer',
              'trip': 'Trip',
            },
          ),
          DirectoryEditorField(
            'doc_type',
            'Document type',
            initialValue: document?['doc_type'] as String? ?? 'other',
            required: true,
          ),
          DirectoryEditorField(
            'owner_id',
            'Linked driver / vehicle / customer',
            initialValue: savedOwner,
            options: owners,
          ),
          DirectoryEditorField(
            'expiry_date',
            'Expiry date',
            initialValue: document?['expiry_date'] as String?,
          ),
          DirectoryEditorField(
            'reminder_date',
            'Reminder date',
            initialValue: document?['reminder_date'] as String?,
          ),
          DirectoryEditorField(
            'file_name',
            'File name',
            initialValue: document?['file_name'] as String?,
          ),
          DirectoryEditorField(
            'file_url',
            'File URL',
            initialValue: document?['file_url'] as String?,
          ),
          DirectoryEditorField(
            'notes',
            'Notes',
            initialValue: document?['notes'] as String?,
          ),
        ],
      );
      if (values == null || !mounted) return;
      final owner = values.remove('owner_id') as String?;
      final ownerType = owner?.split(':').first;
      final ownerId = owner?.substring(owner.indexOf(':') + 1);
      values.addAll({
        'document_type': values['doc_type'] ?? 'other',
        'related_entity': values['category'],
        'status': _documentStatus(values['expiry_date'] as String?),
        'driver_id': ownerType == 'driver' ? ownerId : null,
        'vehicle_id': ownerType == 'vehicle' ? ownerId : null,
        'customer_id': ownerType == 'customer' ? ownerId : null,
      });
      if (document == null) {
        values['document_id'] = 'DOC-${DateTime.now().millisecondsSinceEpoch}';
      }
      await ref
          .read(managerRepositoryProvider)
          .saveDocument(id: document?['id'] as String?, values: values);
      ref.invalidate(managerDocumentRecordsProvider);
      ref.invalidate(managerExpiringDocsProvider);
      if (mounted) {
        showManagerSnack(
          context,
          document == null ? 'Document added' : 'Document saved',
        );
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  String _documentStatus(String? expiry) {
    final date = DateTime.tryParse(expiry ?? '');
    if (date == null) return 'active';
    final today = DateTime.now();
    final remaining = DateTime(
      date.year,
      date.month,
      date.day,
    ).difference(DateTime(today.year, today.month, today.day)).inDays;
    if (remaining < 0) return 'expired';
    return remaining <= expirySoonDays ? 'expiring_soon' : 'active';
  }

  Future<void> _deleteDocument(Map<String, dynamic> document) async {
    final confirmed = await confirmDirectoryDelete(
      context,
      title: 'Delete document?',
      message: 'Delete ${document['title'] ?? 'this document'}?',
    );
    if (!confirmed || !mounted) return;
    try {
      await ref
          .read(managerRepositoryProvider)
          .deleteDocument('${document['id']}');
      ref.invalidate(managerDocumentRecordsProvider);
      ref.invalidate(managerExpiringDocsProvider);
      if (mounted) showManagerSnack(context, 'Document deleted');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  Future<void> _open(ExpiryItem item) async {
    try {
      final records = await ref.read(managerDocumentRecordsProvider.future);
      if (!mounted) return;
      final record = records
          .where(
            (row) =>
                (item.owner == DocOwner.vehicle
                    ? row['vehicle_id']
                    : row['driver_id']) ==
                    item.ownerId &&
                _normalizedDocType(
                      '${row['doc_type'] ?? row['document_type'] ?? ''}',
                    ) ==
                    _normalizedDocType(item.docType),
          )
          .firstOrNull;
      await showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => _ExpiryDetailsSheet(
          item: item,
          record: record,
          onUpdate: (sheetContext) async {
            Navigator.of(sheetContext).pop();
            await _updateExpiry(item, record);
          },
        ),
      );
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  String _normalizedDocType(String type) {
    final value = type.toLowerCase().replaceAll('_', ' ').trim();
    if (value.contains('insurance')) return 'insurance';
    if (value.contains('licen')) return 'license';
    if (value.contains('fitness') || value == 'fc' || value.startsWith('fc ')) {
      return 'fitness';
    }
    if (value.contains('pollution') || value == 'puc' || value.startsWith('puc ')) {
      return 'pollution';
    }
    if (value == 'rc' || value.startsWith('rc ') || value.contains('registration')) {
      return 'registration';
    }
    return value;
  }

  Future<void> _updateExpiry(
    ExpiryItem item,
    Map<String, dynamic>? existing,
  ) async {
    final today = directoryToday();
    final initial = item.expiry.isBefore(today) ? today : item.expiry;
    final expiry = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: today,
      lastDate: DateTime(today.year + 20),
      helpText: 'Select the renewed document expiry',
    );
    if (expiry == null || !mounted) return;

    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take proof photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose proof photo'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;

    final XFile? proof;
    try {
      proof = await ImagePicker().pickImage(
        source: source,
        maxWidth: 2000,
        imageQuality: 90,
      );
    } catch (e) {
      if (mounted) {
        showManagerSnack(context, managerErrorText(e), error: true);
      }
      return;
    }
    if (proof == null || !mounted) return;

    try {
      final repo = ref.read(managerRepositoryProvider);
      final fileUrl = await repo.uploadDocumentProof(
        ownerId: item.ownerId,
        ownerType: item.owner.name,
        fileName: proof.name,
        bytes: await proof.readAsBytes(),
      );
      final expiryValue = DateFormat('yyyy-MM-dd').format(expiry);
      final type = _normalizedDocType(item.docType);
      final category = item.owner.name;
      final records = await ref.read(managerDocumentRecordsProvider.future);
      final matchingRecords = records
          .where(
            (row) =>
                (item.owner == DocOwner.vehicle
                    ? row['vehicle_id']
                    : row['driver_id']) ==
                    item.ownerId &&
                _normalizedDocType(
                      '${row['doc_type'] ?? row['document_type'] ?? ''}',
                    ) ==
                    type,
          )
          .toList();
      if (matchingRecords.isEmpty) {
        await repo.saveDocument(
          values: {
            'document_id': 'DOC-${DateTime.now().millisecondsSinceEpoch}',
            'title': '${item.label} · ${item.ownerName}',
            'category': category,
            'related_entity': category,
            'doc_type': item.docType,
            'document_type': item.docType,
            'expiry_date': expiryValue,
            'status': 'active',
            'file_name': proof.name,
            'file_url': fileUrl,
            'driver_id': item.owner == DocOwner.driver ? item.ownerId : null,
            'vehicle_id': item.owner == DocOwner.vehicle ? item.ownerId : null,
          },
        );
      } else {
        final primaryId = existing?['id']?.toString() ??
            matchingRecords.first['id']?.toString();
        for (final record in matchingRecords) {
          final isPrimary = record['id']?.toString() == primaryId;
          await repo.saveDocument(
            id: record['id']?.toString(),
            values: {
              'expiry_date': expiryValue,
              'status': 'active',
              if (isPrimary) 'file_name': proof.name,
              if (isPrimary) 'file_url': fileUrl,
            },
          );
        }
      }

      final ownerExpiryField = switch ((item.owner, type)) {
        (DocOwner.driver, 'license') => 'license_expiry',
        (DocOwner.vehicle, 'insurance') => 'insurance_expiry',
        (DocOwner.vehicle, 'fitness') => 'fitness_cert_expiry',
        (DocOwner.vehicle, 'pollution') => 'pollution_cert_expiry',
        (DocOwner.vehicle, 'registration') => 'registration_expiry',
        _ => null,
      };
      if (ownerExpiryField != null) {
        final values = <String, Object?>{ownerExpiryField: expiryValue};
        if (item.owner == DocOwner.driver) {
          await repo.saveDriver(id: item.ownerId, values: values);
        } else {
          await repo.saveVehicle(id: item.ownerId, values: values);
        }
      }

      ref.invalidate(managerDocumentRecordsProvider);
      ref.invalidate(managerExpiringDocsProvider);
      ref.invalidate(managerVehicleRecordsProvider);
      ref.invalidate(managerDriverRecordsProvider);
      if (mounted) {
        showManagerSnack(context, '${item.label} expiry and proof updated');
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final n = widget.now ?? DateTime.now();
    final today = DateTime(n.year, n.month, n.day);
    final async = ref.watch(managerExpiringDocsProvider);
    final all = async.valueOrNull ?? const <ExpiryItem>[];

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: Text(_showRecords ? 'Manage documents' : 'Document expiry'),
        actions: [
          IconButton(
            key: const Key('manager-documents-toggle'),
            tooltip: _showRecords ? 'Show expiry list' : 'Manage documents',
            onPressed: () => setState(() => _showRecords = !_showRecords),
            icon: Icon(
              _showRecords
                  ? Icons.event_busy_outlined
                  : Icons.folder_open_outlined,
            ),
          ),
          if (_showRecords)
            IconButton(
              key: const Key('manager-document-add'),
              tooltip: 'Add document',
              onPressed: () => _editDocument(),
              icon: const Icon(Icons.add),
            ),
        ],
      ),
      body: _showRecords
          ? _documentRecordsView()
          : RefreshIndicator(
              color: t.primary,
              onRefresh: () async {
                ref.invalidate(managerExpiringDocsProvider);
                await ref
                    .read(managerExpiringDocsProvider.future)
                    .then((_) {}, onError: (_) {});
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
                children: [
                  SizedBox(
                    height: 40,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: DocFilter.values.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) {
                        final f = DocFilter.values[i];
                        final count = all
                            .where((x) => f.matches(x.stateOn(today)))
                            .length;
                        return ChoiceChip(
                          key: Key('docs-filter-${f.name}'),
                          label: Text(
                            async.hasValue ? '${f.label} · $count' : f.label,
                          ),
                          selected: f == _filter,
                          showCheckmark: false,
                          onSelected: (_) => setState(() => _filter = f),
                        );
                      },
                    ),
                  ),
                  const SizedBox(height: 12),
                  ...async.when(
                    skipLoadingOnRefresh: true,
                    loading: () => const [MLoading(height: 240)],
                    error: (e, _) => [
                      MError(
                        error: e,
                        onRetry: () =>
                            ref.invalidate(managerExpiringDocsProvider),
                      ),
                    ],
                    data: (items) {
                      final list = items
                          .where((x) => _filter.matches(x.stateOn(today)))
                          .toList();
                      if (list.isEmpty) {
                        return [
                          MEmpty(
                            icon: Icons.verified_outlined,
                            title: _filter == DocFilter.all
                                ? 'No dated documents'
                                : 'All documents are valid',
                            message: _filter == DocFilter.all
                                ? 'Add expiry dates on the web app (Vehicles, Drivers or Documents).'
                                : 'Nothing expired or due in the next $expirySoonDays days.',
                          ),
                        ];
                      }
                      return [
                        for (final x in list) ...[
                          _DocTile(
                            item: x,
                            today: today,
                            onTap: () => _open(x),
                          ),
                          const SizedBox(height: 10),
                        ],
                      ];
                    },
                  ),
                ],
              ),
            ),
    );
  }

  Widget _documentRecordsView() {
    final async = ref.watch(managerDocumentRecordsProvider);
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(managerDocumentRecordsProvider);
        await ref
            .read(managerDocumentRecordsProvider.future)
            .then((_) {}, onError: (_) {});
      },
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: [
          ...async.when(
            skipLoadingOnRefresh: true,
            loading: () => const [MLoading(height: 180)],
            error: (e, _) => [
              MError(
                error: e,
                onRetry: () => ref.invalidate(managerDocumentRecordsProvider),
              ),
            ],
            data: (documents) => documents.isEmpty
                ? const [
                    MEmpty(
                      icon: Icons.folder_open_outlined,
                      title: 'No documents yet',
                      message:
                          'Add a document to manage its expiry and file link.',
                    ),
                  ]
                : [
                    for (final document in documents) ...[
                      MCard(
                        key: Key('manager-document-${document['id']}'),
                        child: Row(
                          children: [
                            const Icon(Icons.description_outlined),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${document['title'] ?? 'Document'}',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  Text(
                                    [
                                      document['category'],
                                      document['doc_type'],
                                      if (document['expiry_date'] != null)
                                        'Expires ${document['expiry_date']}',
                                    ].whereType<Object>().join(' · '),
                                  ),
                                ],
                              ),
                            ),
                            PopupMenuButton<String>(
                              tooltip: 'Document actions',
                              onSelected: (action) => action == 'edit'
                                  ? _editDocument(document)
                                  : _deleteDocument(document),
                              itemBuilder: (_) => const [
                                PopupMenuItem(
                                  value: 'edit',
                                  child: Text('Edit'),
                                ),
                                PopupMenuItem(
                                  value: 'delete',
                                  child: Text('Delete'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 10),
                    ],
                  ],
          ),
        ],
      ),
    );
  }
}

class _DocTile extends StatelessWidget {
  const _DocTile({
    required this.item,
    required this.today,
    required this.onTap,
  });
  final ExpiryItem item;
  final DateTime today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final state = item.stateOn(today);
    final c = expiryColor(state, t, Theme.of(context).brightness);
    return MCard(
      key: Key('doc-${item.ownerName}-${item.docType}'),
      onTap: onTap,
      borderColor: state == ExpiryState.ok ? null : c.withValues(alpha: 0.45),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: c.withValues(alpha: 0.13),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              item.owner == DocOwner.vehicle
                  ? Icons.directions_car_outlined
                  : Icons.badge_outlined,
              color: c,
              size: 21,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.label,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                Text(
                  item.ownerName,
                  style: TextStyle(fontSize: 13, color: t.textSecondary),
                ),
                const SizedBox(height: 3),
                Text(
                  '${expiryPhrase(item.expiry, today)} · ${directoryDate.format(item.expiry)}',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: state == ExpiryState.ok
                        ? FontWeight.w400
                        : FontWeight.w600,
                    color: state == ExpiryState.ok ? t.textSecondary : c,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: t.textSecondary),
        ],
      ),
    );
  }
}

class _ExpiryDetailsSheet extends StatelessWidget {
  const _ExpiryDetailsSheet({
    required this.item,
    required this.record,
    required this.onUpdate,
  });

  final ExpiryItem item;
  final Map<String, dynamic>? record;
  final Future<void> Function(BuildContext context) onUpdate;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fileUrl = record?['file_url']?.toString();
    final imageProof =
        fileUrl != null &&
        RegExp(r'\.(jpe?g|png)(\?.*)?$', caseSensitive: false).hasMatch(fileUrl);

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              '${item.label} details',
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            MCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.ownerName, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text('Owner type: ${item.owner.name}'),
                  Text('Expiry date: ${directoryDate.format(item.expiry)}'),
                  Text(expiryPhrase(item.expiry, directoryToday())),
                  if (record?['file_name'] != null)
                    Text('Proof: ${record!['file_name']}'),
                ],
              ),
            ),
            const SizedBox(height: 12),
            if (imageProof)
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Image.network(
                  fileUrl,
                  height: 200,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => const Padding(
                    padding: EdgeInsets.all(20),
                    child: Text('Could not load the saved proof image.'),
                  ),
                ),
              )
            else if (fileUrl != null && fileUrl.isNotEmpty)
              TextButton.icon(
                onPressed: () async {
                  final uri = Uri.tryParse(fileUrl);
                  if (uri == null ||
                      (uri.scheme != 'http' && uri.scheme != 'https')) {
                    return;
                  }
                  final opened = await launchUrl(uri);
                  if (!opened && context.mounted) {
                    showManagerSnack(
                      context,
                      'Could not open the saved proof.',
                      error: true,
                    );
                  }
                },
                icon: const Icon(Icons.open_in_new),
                label: const Text('Open saved proof'),
              )
            else
              const Text('No proof has been uploaded for this document yet.'),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () => onUpdate(context),
              icon: const Icon(Icons.upload_file_outlined),
              label: const Text('Update expiry and proof'),
            ),
          ],
        ),
      ),
    );
  }
}
