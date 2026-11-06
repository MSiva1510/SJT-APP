// ─────────────────────────────────────────────────────────────────────────────
// driver_expense_screen.dart — Add Expense + recent submissions.
// Submits into public.expenses as status 'pending' for dispatch approval.
// Receipt photos upload to the `expense-receipts` bucket when available;
// the expense is still saved (without photo) when upload fails.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../models/driver_expense.dart';
import '../../models/trip.dart';
import '../../providers/auth_provider.dart';
import '../../providers/expense_provider.dart';
import '../../providers/trip_provider.dart';
import '../../repositories/expense_repository.dart';
import '../../services/receipt_ocr_service.dart';

final _inr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

class DriverExpenseScreen extends ConsumerStatefulWidget {
  const DriverExpenseScreen({super.key});

  @override
  ConsumerState<DriverExpenseScreen> createState() =>
      _DriverExpenseScreenState();
}

class _DriverExpenseScreenState extends ConsumerState<DriverExpenseScreen> {
  String _category = 'Fuel';
  final _amountCtrl = TextEditingController();
  String? _tripId;
  String _paidBy = 'Driver cash';
  XFile? _receipt;
  bool _saving = false;
  bool _readingReceipt = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickReceipt() async {
    try {
      final img = await ImagePicker().pickImage(
        source: ImageSource.camera,
        maxWidth: 1600,
      );
      if (img == null || !mounted) return;
      setState(() {
        _receipt = img;
        _readingReceipt = true;
      });
      final amount = await const ReceiptOcrService().readTotalAmount(img.path);
      if (!mounted) return;
      if (amount == null) {
        _snack('Receipt saved. Could not read a total; enter the amount manually.');
      } else {
        _amountCtrl.text = amount.toStringAsFixed(2);
        _snack('Amount detected. Review it before saving.');
      }
    } catch (e) {
      _snack('Could not scan receipt: $e');
    } finally {
      if (mounted) setState(() => _readingReceipt = false);
    }
  }

  Future<void> _save() async {
    final amount = double.tryParse(_amountCtrl.text.trim()) ?? 0;
    if (amount <= 0) {
      _snack('Enter a valid amount.');
      return;
    }
    final driver = ref.read(currentDriverProvider);
    if (driver == null) {
      _snack('Sign in again to submit expenses.');
      return;
    }
    setState(() => _saving = true);
    try {
      String receiptNote = '';
      var receiptUploadFailed = false;
      if (_receipt != null) {
        final url = await ref
            .read(expenseRepositoryProvider)
            .uploadReceipt(_receipt!.path);
        receiptUploadFailed = url == null;
        receiptNote = url == null
            ? 'Receipt photo could not be uploaded (${_receipt!.name})'
            : 'Receipt: $url';
      }
      await ref
          .read(expenseRepositoryProvider)
          .submitExpense(
            driverId: driver.id,
            driverName: driver.name,
            expense: DriverExpense(
              tripId: _tripId,
              category: _category,
              amount: amount,
              paidBy: _paidBy,
              receiptNote: receiptNote,
              expenseDate: DateTime.now(),
            ),
          );
      if (!mounted) return;
      _amountCtrl.clear();
      setState(() => _receipt = null);
      ref.invalidate(myExpensesProvider);
      _snack(
        receiptUploadFailed
            ? 'Expense saved, but the receipt was not uploaded. Pending dispatch approval.'
            : 'Expense saved — pending dispatch approval.',
      );
    } on ExpenseException catch (e) {
      _snack(e.message);
    } catch (_) {
      _snack('Could not save the expense. Try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tripsAsync = ref.watch(todayTripsProvider);
    final recentAsync = ref.watch(myExpensesProvider);

    final trips = tripsAsync is TripListLoaded
        ? tripsAsync.trips
        : <TripModel>[];

    return Scaffold(
      appBar: AppBar(title: const Text('Add Expense')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          Text('Category', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: DriverExpense.categories.map((c) {
              final on = c == _category;
              return ChoiceChip(
                label: Text(c),
                selected: on,
                onSelected: (_) => setState(() => _category = c),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          Text('Amount', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          TextField(
            controller: _amountCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              prefixText: '₹ ',
              hintText: '380',
              helperText: 'Receipt scan may fill this in. Check and edit it.',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          Text('Trip (optional)', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          DropdownButtonFormField<String?>(
            initialValue: _tripId,
            isExpanded: true,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem<String?>(
                value: null,
                child: Text('General (no trip)'),
              ),
              for (final t in trips)
                DropdownMenuItem<String?>(
                  value: t.id,
                  child: Text(
                    '${t.pickupLocation ?? 'Trip'} → ${t.dropLocation ?? ''}',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
            ],
            onChanged: (v) => setState(() => _tripId = v),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Text('Receipt photo', style: theme.textTheme.labelLarge),
              ),
              TextButton.icon(
                onPressed: _readingReceipt ? null : _pickReceipt,
                icon: _readingReceipt
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.add_a_photo_outlined, size: 18),
                label: Text(
                  _readingReceipt
                      ? 'Scanning…'
                      : _receipt == null
                      ? 'Add'
                      : _receipt!.name.length > 18
                      ? '${_receipt!.name.substring(0, 18)}…'
                      : _receipt!.name,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text('Paid by', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _paidBy,
            isExpanded: true,
            decoration: const InputDecoration(border: OutlineInputBorder()),
            items: const [
              'Driver cash',
              'Company advance',
              'UPI',
            ].map((p) => DropdownMenuItem(value: p, child: Text(p))).toList(),
            onChanged: (v) => setState(() => _paidBy = v ?? 'Driver cash'),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _save,
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
            ),
            child: Text(
              _saving ? 'SAVING…' : 'SAVE EXPENSE',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(height: 24),
          Text('Recent', style: theme.textTheme.titleSmall),
          const SizedBox(height: 8),
          recentAsync.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (_, __) => const Text('Could not load recent expenses.'),
            data: (items) => items.isEmpty
                ? Text(
                    'No expenses submitted yet.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  )
                : Card(
                    margin: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (var i = 0; i < items.length && i < 8; i++) ...[
                          ListTile(
                            title: Text(
                              '${items[i].category} · ${_inr.format(items[i].amount)}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            subtitle: items[i].expenseDate == null
                                ? null
                                : Text(
                                    DateFormat(
                                      'd MMM, h:mm a',
                                    ).format(items[i].expenseDate!.toLocal()),
                                  ),
                            trailing: Text(
                              items[i].status.isEmpty
                                  ? 'Pending'
                                  : items[i].status,
                              style: TextStyle(
                                fontSize: 12,
                                color:
                                    items[i].status.toLowerCase() == 'approved'
                                    ? Colors.green.shade700
                                    : theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ),
                          if (i != items.length - 1 && i != 7)
                            const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
