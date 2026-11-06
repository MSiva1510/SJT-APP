// ─────────────────────────────────────────────────────────────────────────────
// manager_vehicles_screen.dart — read-only Vehicles list for the manager
// (web: /vehicles). Each row: registration, make/model, type, driver of the
// newest assignment, current km, a tag when a document is expired / due.
// Tap → detail sheet: details, km since service, every expiry date, recent
// trips. Editing stays on the web app.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/manager_directory.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/manager/manager_record_editor.dart';
import '../../../core/theme/home_tokens.dart';

final _km = NumberFormat.decimalPattern('en_IN');

String vehicleSubtitle(VehicleRecord v) => [
  v.makeModel,
  if (v.vehicleType != null)
    v.vehicleType!.length <= 3
        ? v.vehicleType!.toUpperCase()
        : titleCase(v.vehicleType),
  if (v.year != null) '${v.year}',
].whereType<String>().join(' · ');

class ManagerVehiclesScreen extends ConsumerStatefulWidget {
  const ManagerVehiclesScreen({super.key});

  @override
  ConsumerState<ManagerVehiclesScreen> createState() =>
      _ManagerVehiclesScreenState();
}

class _ManagerVehiclesScreenState extends ConsumerState<ManagerVehiclesScreen> {
  String _query = '';

  String? _dateValue(DateTime? date) =>
      date?.toIso8601String().substring(0, 10);

  Map<String, String> _optionsWithCurrent(
    Map<String, String> options,
    String? current,
  ) {
    if (current == null ||
        options.keys.any((key) => key.toLowerCase() == current.toLowerCase())) {
      return options;
    }
    return {...options, current: titleCase(current)};
  }

  Future<void> _editVehicle([VehicleRecord? vehicle]) async {
    final parts = (vehicle?.makeModel ?? '').split(' ');
    const typeOptions = {
      '4+1 Sedan': '4+1 Sedan',
      '7+1 SUV': '7+1 SUV',
      'Tempo Traveller': 'Tempo Traveller',
      'Mini Van': 'Mini Van',
    };
    const fuelOptions = {
      'Petrol': 'Petrol',
      'Diesel': 'Diesel',
      'CNG': 'CNG',
      'Electric': 'Electric',
    };
    final selectedType = typeOptions.keys.firstWhere(
      (key) => key.toLowerCase() == vehicle?.vehicleType?.toLowerCase(),
      orElse: () => vehicle?.vehicleType ?? '4+1 Sedan',
    );
    final selectedFuel = fuelOptions.keys.firstWhere(
      (key) => key.toLowerCase() == vehicle?.fuelType?.toLowerCase(),
      orElse: () => vehicle?.fuelType ?? 'Diesel',
    );
    final values = await showDirectoryRecordEditor(
      context,
      title: vehicle == null ? 'Add vehicle' : 'Edit vehicle',
      fields: [
        DirectoryEditorField(
          'registration',
          'Registration',
          initialValue: vehicle?.registration,
          required: true,
        ),
        DirectoryEditorField(
          'make',
          'Make',
          initialValue: parts.isEmpty || parts.first.isEmpty
              ? null
              : parts.first,
        ),
        DirectoryEditorField(
          'model',
          'Model',
          initialValue: parts.length > 1 ? parts.skip(1).join(' ') : null,
        ),
        DirectoryEditorField(
          'vehicle_type',
          'Vehicle type',
          initialValue: selectedType,
          required: true,
          options: _optionsWithCurrent(typeOptions, vehicle?.vehicleType),
        ),
        DirectoryEditorField(
          'year',
          'Year',
          initialValue: vehicle?.year?.toString() ??
              (vehicle == null ? DateTime.now().year.toString() : null),
          keyboardType: TextInputType.number,
        ),
        DirectoryEditorField('color', 'Colour', initialValue: vehicle?.color),
        DirectoryEditorField(
          'capacity',
          'Seats',
          initialValue: vehicle?.capacity?.toString() ??
              (vehicle == null ? '4' : null),
          keyboardType: TextInputType.number,
        ),
        DirectoryEditorField(
          'fuel_type',
          'Fuel type',
          initialValue: selectedFuel,
          required: true,
          options: _optionsWithCurrent(fuelOptions, vehicle?.fuelType),
        ),
        DirectoryEditorField(
          'current_km',
          'Current km',
          initialValue: vehicle?.currentKm?.toString() ??
              (vehicle == null ? '0' : null),
          keyboardType: TextInputType.number,
        ),
        DirectoryEditorField(
          'last_service_km',
          'Last service km',
          initialValue: vehicle?.lastServiceKm?.toString(),
          keyboardType: TextInputType.number,
        ),
        DirectoryEditorField(
          'insurance_expiry',
          'Insurance expiry',
          initialValue: _dateValue(vehicle?.insuranceExpiry),
        ),
        DirectoryEditorField(
          'fitness_cert_expiry',
          'Fitness expiry',
          initialValue: _dateValue(vehicle?.fitnessExpiry),
        ),
        DirectoryEditorField(
          'pollution_cert_expiry',
          'PUC expiry',
          initialValue: _dateValue(vehicle?.pollutionExpiry),
        ),
        DirectoryEditorField(
          'registration_expiry',
          'Registration expiry',
          initialValue: _dateValue(vehicle?.registrationExpiry),
        ),
        DirectoryEditorField(
          'status',
          'Status',
          initialValue: vehicle?.status ?? 'active',
          required: true,
          options: const {
            'active': 'Active',
            'maintenance': 'Maintenance',
            'inactive': 'Inactive',
            'decommissioned': 'Decommissioned',
          },
        ),
      ],
    );
    if (values == null || !mounted) return;
    try {
      await ref
          .read(managerRepositoryProvider)
          .saveVehicle(id: vehicle?.id, values: values);
      ref.invalidate(managerVehicleRecordsProvider);
      ref.invalidate(managerVehiclesProvider);
      ref.invalidate(managerFleetProvider);
      if (mounted) {
        showManagerSnack(
          context,
          vehicle == null ? 'Vehicle added' : 'Vehicle saved',
        );
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  Future<void> _deleteVehicle(VehicleRecord vehicle) async {
    final confirmed = await confirmDirectoryDelete(
      context,
      title: 'Delete vehicle?',
      message:
          'Delete ${vehicle.registration}? Existing trip history may prevent deletion.',
    );
    if (!confirmed || !mounted) return;
    try {
      await ref.read(managerRepositoryProvider).deleteVehicle(vehicle.id);
      ref.invalidate(managerVehicleRecordsProvider);
      ref.invalidate(managerVehiclesProvider);
      ref.invalidate(managerFleetProvider);
      if (mounted) showManagerSnack(context, 'Vehicle deleted');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerVehicleRecordsProvider);
    final today = directoryToday();

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Vehicles'),
        actions: [
          IconButton(
            key: const Key('manager-vehicle-add'),
            tooltip: 'Add vehicle',
            onPressed: () => _editVehicle(),
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () async {
          ref.invalidate(managerVehicleRecordsProvider);
          await ref
              .read(managerVehicleRecordsProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            DirectorySearchField(
              hint: 'Search registration, model or driver',
              onChanged: (q) => setState(() => _query = q.trim().toLowerCase()),
            ),
            const SizedBox(height: 14),
            ...async.when(
              skipLoadingOnRefresh: true,
              loading: () => const [MLoading(height: 240)],
              error: (e, _) => [
                MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerVehicleRecordsProvider),
                ),
              ],
              data: (all) {
                final list = all
                    .where(
                      (v) =>
                          _query.isEmpty ||
                          '${v.registration} ${v.makeModel ?? ''} ${v.driverName ?? ''}'
                              .toLowerCase()
                              .contains(_query),
                    )
                    .toList();
                if (list.isEmpty) {
                  return [
                    MEmpty(
                      icon: Icons.directions_car_outlined,
                      title: all.isEmpty ? 'No vehicles yet' : 'No match',
                      message: all.isEmpty
                          ? 'Vehicles added on the web app show up here.'
                          : 'Try another registration or name.',
                    ),
                  ];
                }
                return [
                  for (final v in list) ...[
                    _VehicleTile(
                      vehicle: v,
                      today: today,
                      onEdit: () => _editVehicle(v),
                      onDelete: () => _deleteVehicle(v),
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

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({
    required this.vehicle,
    required this.today,
    required this.onEdit,
    required this.onDelete,
  });
  final VehicleRecord vehicle;
  final DateTime today;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final v = vehicle;
    final warn = worstExpiryTag(context, [
      v.insuranceExpiry,
      v.fitnessExpiry,
      v.pollutionExpiry,
      v.registrationExpiry,
    ], today);
    return MCard(
      key: Key('vehicle-${v.registration}'),
      onTap: () => showVehicleRecordSheet(context, v),
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: t.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text('🚗', style: TextStyle(fontSize: 22)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        v.registration,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    statusTag(context, v.status),
                  ],
                ),
                if (vehicleSubtitle(v).isNotEmpty)
                  Text(
                    vehicleSubtitle(v),
                    style: TextStyle(fontSize: 13, color: t.textSecondary),
                  ),
                const SizedBox(height: 6),
                MInfoLine(
                  icon: Icons.person_outline,
                  text: [
                    v.driverName ?? 'No driver assigned',
                    if (v.currentKm != null) '${_km.format(v.currentKm)} km',
                  ].join(' · '),
                ),
                if (warn != null) ...[const SizedBox(height: 6), warn],
              ],
            ),
          ),
          PopupMenuButton<String>(
            tooltip: 'Vehicle actions',
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

Future<void> showVehicleRecordSheet(BuildContext context, VehicleRecord v) {
  return showDirectorySheet(context, (ctx) => VehicleRecordSheet(vehicle: v));
}

class VehicleRecordSheet extends StatelessWidget {
  const VehicleRecordSheet({super.key, required this.vehicle});
  final VehicleRecord vehicle;

  @override
  Widget build(BuildContext context) {
    final v = vehicle;
    final today = directoryToday();
    final sinceService = v.kmSinceService;
    return Column(
      key: const Key('vehicle-sheet'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SheetHeader(
          leading: const Text('🚗', style: TextStyle(fontSize: 34)),
          title: v.registration,
          subtitle: vehicleSubtitle(v).isEmpty ? null : vehicleSubtitle(v),
          tags: [statusTag(context, v.status)],
        ),
        const SizedBox(height: 18),
        const MSectionLabel('Details'),
        MCard(
          child: Column(
            children: [
              DetailRow('Driver', v.driverName ?? 'Not assigned'),
              if (v.fuelType != null) DetailRow('Fuel', titleCase(v.fuelType)),
              if (v.capacity != null) DetailRow('Seats', '${v.capacity}'),
              if (v.color != null) DetailRow('Colour', titleCase(v.color)),
              DetailRow(
                'Current km',
                v.currentKm == null
                    ? 'Not entered'
                    : '${_km.format(v.currentKm)} km',
              ),
              DetailRow(
                'Since service',
                sinceService == null
                    ? 'No service km entered'
                    : '${_km.format(sinceService)} km',
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const MSectionLabel('Documents'),
        MCard(
          child: Column(
            children: [
              ExpiryRow(
                label: 'Insurance',
                expiry: v.insuranceExpiry,
                today: today,
              ),
              ExpiryRow(
                label: 'Fitness (FC)',
                expiry: v.fitnessExpiry,
                today: today,
              ),
              ExpiryRow(
                label: 'Pollution (PUC)',
                expiry: v.pollutionExpiry,
                today: today,
              ),
              ExpiryRow(
                label: 'Registration',
                expiry: v.registrationExpiry,
                today: today,
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        OwnerTripsSection(
          owner: (kind: 'vehicle', id: v.id, name: v.registration),
        ),
        const SizedBox(height: 8),
        Text(
          'To edit this vehicle, use the web app.',
          style: TextStyle(
            fontSize: 12,
            color: Theme.of(context).home.textSecondary,
          ),
        ),
      ],
    );
  }
}
