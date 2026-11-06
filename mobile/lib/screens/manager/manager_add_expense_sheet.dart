// ─────────────────────────────────────────────────────────────────────────────
// manager_add_expense_sheet.dart — "Add expense" bottom sheet for the manager
// dashboard and the expenses screen. Type · amount · date · optional vehicle
// and driver · note. Saved straight as approved (see NewExpenseDraft) with
// the next EXP-YYMM-#### number; returns that number, or null if dismissed.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/expense_numbering.dart';
import '../../models/manager_models.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../core/theme/home_tokens.dart';

const _typeLabels = {
  'fuel': ('Fuel', Icons.local_gas_station_outlined),
  'toll': ('Toll', Icons.toll_outlined),
  'parking': ('Parking', Icons.local_parking_outlined),
  'vehicle': ('Vehicle / repair', Icons.build_outlined),
  'supplies': ('Supplies', Icons.inventory_2_outlined),
  'other': ('Other', Icons.receipt_long_outlined),
};

/// Opens the sheet; on save shows a snack and refreshes the dashboard.
Future<void> showAddExpenseSheet(BuildContext context, WidgetRef ref) async {
  final number = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const AddExpenseSheet(),
  );
  if (number == null || !context.mounted) return;
  ref.invalidate(managerDashboardProvider);
  ref.invalidate(managerPendingExpensesProvider);
  showManagerSnack(context, 'Expense $number saved');
}

class AddExpenseSheet extends ConsumerStatefulWidget {
  const AddExpenseSheet({super.key});

  @override
  ConsumerState<AddExpenseSheet> createState() => _AddExpenseSheetState();
}

class _AddExpenseSheetState extends ConsumerState<AddExpenseSheet> {
  final _amount = TextEditingController();
  final _note = TextEditingController();
  String _type = 'fuel';
  DateTime _date = DateTime.now();
  String? _vehicleId;
  String? _driverId;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(now.year - 1),
      lastDate: now,
    );
    if (d != null) setState(() => _date = d);
  }

  Future<void> _save(List<VehicleOption> vehicles, List<DriverOption> drivers) async {
    final vehicle = vehicles.where((v) => v.id == _vehicleId).firstOrNull;
    final driver = drivers.where((d) => d.id == _driverId).firstOrNull;
    final draft = NewExpenseDraft(
      type: _type,
      amount: double.tryParse(_amount.text.trim()) ?? 0,
      date: _date,
      description: _note.text,
      vehicleReg: vehicle?.registration,
      driverId: driver?.id,
      driverName: driver?.name,
    );
    final problem = draft.problem;
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final number = await ref
          .read(managerRepositoryProvider)
          .addExpense(draft, actorName: ref.read(managerActorProvider).name);
      if (mounted) Navigator.pop(context, number);
    } catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = managerErrorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final vehicles = ref.watch(managerVehiclesProvider).valueOrNull
            ?.where((v) => v.status != 'decommissioned')
            .toList() ??
        const <VehicleOption>[];
    final drivers = ref.watch(managerDriversProvider).valueOrNull
            ?.where((d) => d.status != 'inactive')
            .toList() ??
        const <DriverOption>[];

    TextStyle label() => TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w700,
          color: t.textPrimary,
        );

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.of(context).size.height * 0.88,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Add expense',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: t.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Saved as approved — you are recording it for the office.',
                  style: TextStyle(fontSize: 13, color: t.textSecondary),
                ),
                const SizedBox(height: 18),
                Text('Type', style: label()),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final e in _typeLabels.entries)
                      ChoiceChip(
                        key: Key('expense-type-${e.key}'),
                        avatar: Icon(e.value.$2, size: 18),
                        label: Text(e.value.$1),
                        selected: _type == e.key,
                        onSelected: (_) => setState(() => _type = e.key),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        key: const Key('expense-amount'),
                        controller: _amount,
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                        ],
                        decoration: const InputDecoration(
                          labelText: 'Amount',
                          prefixText: '₹ ',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 56),
                      ),
                      onPressed: _pickDate,
                      icon: const Icon(Icons.event_outlined, size: 18),
                      label: Text(DateFormat('d MMM').format(_date)),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                Text('Vehicle (optional)', style: label()),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final v in vehicles)
                      ChoiceChip(
                        label: Text(v.registration),
                        selected: _vehicleId == v.id,
                        onSelected: (on) =>
                            setState(() => _vehicleId = on ? v.id : null),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                Text('Driver (optional)', style: label()),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final d in drivers)
                      ChoiceChip(
                        label: Text(d.name),
                        selected: _driverId == d.id,
                        onSelected: (on) =>
                            setState(() => _driverId = on ? d.id : null),
                      ),
                  ],
                ),
                const SizedBox(height: 18),
                TextField(
                  key: const Key('expense-note'),
                  controller: _note,
                  maxLines: 2,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(
                    labelText: 'Note (optional)',
                    hintText: 'e.g. Diesel at HP bunk, Villupuram',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                      fontSize: 13.5,
                    )),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton(
                    key: const Key('expense-save'),
                    onPressed: _saving ? null : () => _save(vehicles, drivers),
                    child: _saving
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2.4),
                          )
                        : const Text('Save expense'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
