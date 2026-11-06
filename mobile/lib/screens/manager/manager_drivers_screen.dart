// ─────────────────────────────────────────────────────────────────────────────
// manager_drivers_screen.dart — read-only Drivers list for the manager
// (web: /drivers). Status chips (All · Active · Inactive), search, a call
// button per row. Tap → detail sheet: Call / WhatsApp, licence + expiry,
// vehicle of the newest assignment, emergency contact, recent trips.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/manager_directory.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/manager/manager_record_editor.dart';
import '../../../core/theme/home_tokens.dart';

class ManagerDriversScreen extends ConsumerStatefulWidget {
  const ManagerDriversScreen({super.key});

  @override
  ConsumerState<ManagerDriversScreen> createState() =>
      _ManagerDriversScreenState();
}

class _ManagerDriversScreenState extends ConsumerState<ManagerDriversScreen> {
  String _query = '';
  bool? _active; // null = all

  String? _dateValue(DateTime? date) =>
      date?.toIso8601String().substring(0, 10);

  Future<void> _editDriver([DriverRecord? driver]) async {
    final values = await showDirectoryRecordEditor(
      context,
      title: driver == null ? 'Add driver' : 'Edit driver',
      fields: [
        DirectoryEditorField(
          'name',
          'Name',
          initialValue: driver?.name,
          required: true,
        ),
        DirectoryEditorField(
          'phone',
          'Phone',
          initialValue: driver?.phone,
          keyboardType: TextInputType.phone,
        ),
        DirectoryEditorField(
          'email',
          'Email',
          initialValue: driver?.email,
          keyboardType: TextInputType.emailAddress,
        ),
        DirectoryEditorField('city', 'City', initialValue: driver?.city),
        DirectoryEditorField(
          'license_number',
          'Licence number',
          initialValue: driver?.licenseNumber,
        ),
        DirectoryEditorField(
          'license_expiry',
          'Licence expiry',
          initialValue: _dateValue(driver?.licenseExpiry),
        ),
        DirectoryEditorField(
          'joined_date',
          'Joined date',
          initialValue: _dateValue(driver?.joinedDate),
        ),
        DirectoryEditorField(
          'status',
          'Status',
          initialValue: driver?.status ?? 'active',
          required: true,
          options: const {
            'active': 'Active',
            'inactive': 'Inactive',
            'suspended': 'Suspended',
            'on_leave': 'On leave',
          },
        ),
        DirectoryEditorField(
          'emergency_contact',
          'Emergency contact',
          initialValue: driver?.emergencyContact,
        ),
        DirectoryEditorField(
          'emergency_phone',
          'Emergency phone',
          initialValue: driver?.emergencyPhone,
          keyboardType: TextInputType.phone,
        ),
      ],
    );
    if (values == null || !mounted) return;
    try {
      await ref
          .read(managerRepositoryProvider)
          .saveDriver(id: driver?.id, values: values);
      ref.invalidate(managerDriverRecordsProvider);
      ref.invalidate(managerDriversProvider);
      if (mounted) {
        showManagerSnack(
          context,
          driver == null ? 'Driver added' : 'Driver saved',
        );
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  Future<void> _deleteDriver(DriverRecord driver) async {
    final confirmed = await confirmDirectoryDelete(
      context,
      title: 'Delete driver?',
      message:
          'Delete ${driver.name}? Existing trip history may prevent deletion.',
    );
    if (!confirmed || !mounted) return;
    try {
      await ref.read(managerRepositoryProvider).deleteDriver(driver.id);
      ref.invalidate(managerDriverRecordsProvider);
      ref.invalidate(managerDriversProvider);
      if (mounted) showManagerSnack(context, 'Driver deleted');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerDriverRecordsProvider);
    final today = directoryToday();
    final all = async.valueOrNull ?? const <DriverRecord>[];
    int count(bool? active) => all
        .where((d) => active == null || (d.status == 'active') == active)
        .length;

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Drivers'),
        actions: [
          IconButton(
            key: const Key('manager-driver-add'),
            tooltip: 'Add driver',
            onPressed: () => _editDriver(),
            icon: const Icon(Icons.person_add_alt_1_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () async {
          ref.invalidate(managerDriverRecordsProvider);
          await ref
              .read(managerDriverRecordsProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            DirectorySearchField(
              hint: 'Search name, phone or vehicle',
              onChanged: (q) => setState(() => _query = q.trim().toLowerCase()),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              children: [
                for (final (label, value) in [
                  ('All', null),
                  ('Active', true),
                  ('Inactive', false),
                ])
                  ChoiceChip(
                    label: Text(
                      async.hasValue ? '$label · ${count(value)}' : label,
                    ),
                    selected: _active == value,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _active = value),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            ...async.when(
              skipLoadingOnRefresh: true,
              loading: () => const [MLoading(height: 240)],
              error: (e, _) => [
                MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerDriverRecordsProvider),
                ),
              ],
              data: (all) {
                final digits = _query.replaceAll(RegExp(r'\D'), '');
                final list = all.where((d) {
                  if (_active != null && (d.status == 'active') != _active) {
                    return false;
                  }
                  if (_query.isEmpty) {
                    return true;
                  }
                  return '${d.name} ${d.vehicleReg ?? ''} ${d.city ?? ''}'
                          .toLowerCase()
                          .contains(_query) ||
                      (digits.length >= 3 &&
                          (d.phone ?? '')
                              .replaceAll(RegExp(r'\D'), '')
                              .contains(digits));
                }).toList();
                if (list.isEmpty) {
                  return [
                    MEmpty(
                      icon: Icons.badge_outlined,
                      title: all.isEmpty ? 'No drivers yet' : 'No match',
                      message: all.isEmpty
                          ? 'Drivers added on the web app show up here.'
                          : 'Try another name or number.',
                    ),
                  ];
                }
                return [
                  for (final d in list) ...[
                    _DriverTile(
                      driver: d,
                      today: today,
                      onEdit: () => _editDriver(d),
                      onDelete: () => _deleteDriver(d),
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
}

class _DriverTile extends StatelessWidget {
  const _DriverTile({
    required this.driver,
    required this.today,
    required this.onEdit,
    required this.onDelete,
  });
  final DriverRecord driver;
  final DateTime today;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final d = driver;
    final warn = worstExpiryTag(context, [d.licenseExpiry], today);
    return MCard(
      key: Key('driver-${d.id}'),
      onTap: () => showDriverRecordSheet(context, d),
      child: Row(
        children: [
          InitialsAvatar(d.name),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        d.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    statusTag(context, d.status),
                  ],
                ),
                const SizedBox(height: 4),
                MInfoLine(
                  icon: Icons.directions_car_outlined,
                  text: [
                    d.vehicleReg ?? 'No vehicle',
                    if (d.phone != null) d.phone!,
                  ].join(' · '),
                ),
                if (warn != null) ...[const SizedBox(height: 6), warn],
              ],
            ),
          ),
          CallIconButton(phone: d.phone),
          PopupMenuButton<String>(
            tooltip: 'Driver actions',
            onSelected: (action) => action == 'edit' ? onEdit() : onDelete(),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'edit', child: Text('Edit')),
              PopupMenuItem(value: 'delete', child: Text('Delete')),
            ],
          ),
        ],
      ),
    );
  }
}

Future<void> showDriverRecordSheet(BuildContext context, DriverRecord d) {
  return showDirectorySheet(context, (ctx) => DriverRecordSheet(driver: d));
}

class DriverRecordSheet extends StatelessWidget {
  const DriverRecordSheet({super.key, required this.driver});
  final DriverRecord driver;

  @override
  Widget build(BuildContext context) {
    final d = driver;
    final today = directoryToday();
    return Column(
      key: const Key('driver-sheet'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SheetHeader(
          leading: InitialsAvatar(d.name, size: 52),
          title: d.name,
          subtitle: d.phone,
          tags: [statusTag(context, d.status)],
        ),
        const SizedBox(height: 16),
        ContactButtons(phone: d.phone, keyPrefix: 'driver'),
        const SizedBox(height: 18),
        const MSectionLabel('Details'),
        MCard(
          child: Column(
            children: [
              DetailRow('Vehicle', d.vehicleReg ?? 'Not assigned'),
              DetailRow('Licence no.', d.licenseNumber ?? 'Not entered'),
              ExpiryRow(
                label: 'Licence expiry',
                expiry: d.licenseExpiry,
                today: today,
              ),
              if (d.city != null) DetailRow('City', d.city!),
              if (d.joinedDate != null)
                DetailRow('Joined', directoryDate.format(d.joinedDate!)),
              if (d.email != null) DetailRow('Email', d.email!),
            ],
          ),
        ),
        if (d.emergencyContact != null || d.emergencyPhone != null) ...[
          const SizedBox(height: 18),
          const MSectionLabel('Emergency contact'),
          MCard(
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    [
                      d.emergencyContact,
                      d.emergencyPhone,
                    ].whereType<String>().join(' · '),
                    style: TextStyle(
                      fontSize: 14,
                      color: Theme.of(context).home.textPrimary,
                    ),
                  ),
                ),
                CallIconButton(phone: d.emergencyPhone),
              ],
            ),
          ),
        ],
        const SizedBox(height: 18),
        OwnerTripsSection(owner: (kind: 'driver', id: d.id, name: d.name)),
      ],
    );
  }
}
