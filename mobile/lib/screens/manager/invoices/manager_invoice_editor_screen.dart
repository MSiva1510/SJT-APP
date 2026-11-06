import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../models/manager_invoice.dart';
import '../../../providers/manager_provider.dart';
import '../../../widgets/manager/manager_ui.dart';
import '../../../../core/theme/home_tokens.dart';

class ManagerInvoiceEditorScreen extends ConsumerStatefulWidget {
  const ManagerInvoiceEditorScreen({
    super.key,
    required this.invoice,
    this.create = false,
  });

  final InvoiceRecord invoice;
  final bool create;

  @override
  ConsumerState<ManagerInvoiceEditorScreen> createState() =>
      _ManagerInvoiceEditorScreenState();
}

class _ManagerInvoiceEditorScreenState
    extends ConsumerState<ManagerInvoiceEditorScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _fare = TextEditingController(text: _format(widget.invoice.fare));
  late final _toll = TextEditingController(text: _format(widget.invoice.toll));
  late final _bata = TextEditingController(text: _format(widget.invoice.bata));
  late final _fuel = TextEditingController(text: _format(widget.invoice.fuel));
  late final _parking = TextEditingController(
    text: _format(widget.invoice.parking),
  );
  late final _extras = TextEditingController(
    text: _format(widget.invoice.extras),
  );
  late final _customer = TextEditingController(text: widget.invoice.customer);
  late final _contact = TextEditingController(
    text: widget.invoice.contact ?? '',
  );
  late final _description = TextEditingController(
    text: widget.invoice.description ?? '',
  );
  late DateTime _invoiceDate = widget.invoice.tripDate ?? DateTime.now();
  bool _saving = false;

  static String _format(double amount) => amount == 0
      ? ''
      : amount.toStringAsFixed(amount == amount.roundToDouble() ? 0 : 2);

  @override
  void dispose() {
    _fare.dispose();
    _toll.dispose();
    _bata.dispose();
    _fuel.dispose();
    _parking.dispose();
    _extras.dispose();
    _customer.dispose();
    _contact.dispose();
    _description.dispose();
    super.dispose();
  }

  String? _validateAmount(String? value, {bool required = false}) {
    final text = value?.trim() ?? '';
    if (text.isEmpty && !required) return null;
    final amount = double.tryParse(text.replaceAll(',', ''));
    if (amount == null || !amount.isFinite || amount < 0) {
      return 'Enter a valid non-negative amount';
    }
    return null;
  }

  double _amount(TextEditingController controller) =>
      double.tryParse(controller.text.trim().replaceAll(',', '')) ?? 0;

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    final updated = InvoiceRecord(
      id: widget.invoice.id,
      number: widget.invoice.number,
      customer: widget.invoice.isStandalone
          ? _customer.text.trim()
          : widget.invoice.customer,
      status: widget.invoice.status,
      contact: widget.invoice.isStandalone
          ? _contact.text.trim()
          : widget.invoice.contact,
      pickup: widget.invoice.pickup,
      drop: widget.invoice.drop,
      tripDate: widget.invoice.isStandalone
          ? _invoiceDate
          : widget.invoice.tripDate,
      tripType: widget.invoice.tripType,
      km: widget.invoice.km,
      startKm: widget.invoice.startKm,
      endKm: widget.invoice.endKm,
      fare: _amount(_fare),
      toll: _amount(_toll),
      bata: _amount(_bata),
      fuel: _amount(_fuel),
      parking: _amount(_parking),
      extras: _amount(_extras),
      driver: widget.invoice.driver,
      driverMobile: widget.invoice.driverMobile,
      vehicle: widget.invoice.vehicle,
      leadSource: widget.invoice.leadSource,
      isStandalone: widget.invoice.isStandalone,
      description: widget.invoice.isStandalone
          ? _description.text.trim()
          : widget.invoice.description,
    );
    try {
      final saved = await ref
          .read(managerRepositoryProvider)
          .saveInvoice(updated);
      ref.invalidate(managerInvoicesProvider);
      ref.invalidate(managerBookingsProvider);
      ref.invalidate(managerDashboardProvider);
      if (!mounted) return;
      showManagerSnack(
        context,
        widget.create ? 'Invoice created' : 'Invoice saved',
      );
      context.pop(saved);
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final biz =
        ref.watch(managerInvoiceBusinessProvider).valueOrNull ??
        const InvoiceBusiness();
    return Scaffold(
      key: const Key('invoice-editor-screen'),
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: Text(widget.create ? 'Create invoice' : 'Edit invoice'),
        actions: [
          IconButton(
            tooltip: 'Close',
            onPressed: _saving ? null : () => context.pop(),
            icon: const Icon(Icons.close),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            MCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.invoice.number,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: t.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.invoice.isStandalone
                        ? 'Non-trip invoice'
                        : '${widget.invoice.customer} · ${widget.invoice.route}',
                    style: TextStyle(color: t.textSecondary),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${biz.name} · ${biz.phone}',
                    style: TextStyle(color: t.textSecondary),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            MCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Invoice amounts',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: t.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (widget.invoice.isStandalone) ...[
                    _textField('Customer name', _customer, required: true),
                    _textField(
                      'Customer phone',
                      _contact,
                      keyboardType: TextInputType.phone,
                    ),
                    _textField(
                      'Service description',
                      _description,
                      required: true,
                    ),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: OutlinedButton.icon(
                        key: const Key('invoice-date'),
                        onPressed: _saving ? null : _selectInvoiceDate,
                        icon: const Icon(Icons.calendar_today_outlined),
                        label: Text(
                          'Invoice date: ${_invoiceDate.year}-${_invoiceDate.month.toString().padLeft(2, '0')}-${_invoiceDate.day.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                  ],
                  _field(
                    t,
                    widget.invoice.isStandalone ? 'Service amount' : 'Fare',
                    _fare,
                    required: true,
                  ),
                  _field(t, 'Toll', _toll),
                  _field(t, 'Driver bata', _bata),
                  _field(t, 'Fuel / petrol', _fuel),
                  _field(t, 'Parking', _parking),
                  _field(t, 'Other charges', _extras),
                  const SizedBox(height: 4),
                  Text(
                    'Total amount due: ${biz.money(_amount(_fare))}',
                    key: const Key('invoice-editor-total'),
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: t.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  key: const Key('invoice-editor-save'),
                  onPressed: _saving ? null : _save,
                  icon: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.check),
                  label: Text(
                    widget.create ? 'Create invoice' : 'Save invoice',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _selectInvoiceDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _invoiceDate,
      firstDate: DateTime(2000),
      lastDate: DateTime(2100),
    );
    if (picked != null && mounted) setState(() => _invoiceDate = picked);
  }

  Widget _textField(
    String label,
    TextEditingController controller, {
    bool required = false,
    TextInputType? keyboardType,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        keyboardType: keyboardType,
        decoration: InputDecoration(labelText: label),
        validator: (value) =>
            required && (value?.trim().isEmpty ?? true) ? 'Enter $label' : null,
      ),
    );
  }

  Widget _field(
    HomeTokens t,
    String label,
    TextEditingController controller, {
    bool required = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        key: Key(
          'invoice-${label.toLowerCase().replaceAll(RegExp(r'[^a-z]+'), '-')}',
        ),
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        style: TextStyle(color: t.textPrimary),
        decoration: InputDecoration(
          labelText: label,
          filled: true,
          fillColor: t.neutralSurface,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide.none,
          ),
        ),
        validator: (value) => _validateAmount(value, required: required),
      ),
    );
  }
}
