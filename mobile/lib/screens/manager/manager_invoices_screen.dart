// ─────────────────────────────────────────────────────────────────────────────
// Manager invoices include completed trips and standalone non-trip invoices.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/formatters.dart';
import '../../models/manager_invoice.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../../core/theme/home_tokens.dart';

String _tripTypeLabel(String? t) => switch (t) {
  null => '—',
  'one_way' => 'One way',
  'round_trip' => 'Round trip',
  'multi_loc' => 'Multi location',
  'local_visit' => 'Local visit',
  'multi_day' => 'Multi day',
  'self_drive' => 'Self drive',
  _ => titleCase(t),
};

class ManagerInvoicesScreen extends ConsumerStatefulWidget {
  const ManagerInvoicesScreen({super.key, this.now});

  /// Injected clock for tests.
  final DateTime? now;

  @override
  ConsumerState<ManagerInvoicesScreen> createState() =>
      _ManagerInvoicesScreenState();
}

class _ManagerInvoicesScreenState extends ConsumerState<ManagerInvoicesScreen> {
  String _query = '';
  int _page = 0;
  int? _pageSize;

  int _defaultPageSize(double width) => width < 380 ? 5 : width < 650 ? 8 : 12;

  Future<void> _createInvoice() async {
    try {
      final invoices = await ref.read(managerInvoicesProvider.future);
      final nonTripAvailable = ref
          .read(managerRepositoryProvider)
          .nonTripInvoicesAvailable;
      if (!mounted) return;
      final selected = await showModalBottomSheet<InvoiceRecord>(
        context: context,
        showDragHandle: true,
        builder: (context) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
            children: [
              const MScreenTitle('Create invoice'),
              const SizedBox(height: 12),
              ListTile(
                key: const Key('invoice-create-non-trip'),
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('Create non-trip invoice'),
                subtitle: Text(
                  nonTripAvailable
                      ? 'For a service without a trip booking'
                      : 'For a service without a trip booking · database setup required',
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.pop(
                  context,
                  InvoiceRecord.newStandalone(date: widget.now),
                ),
              ),
              const Divider(),
              if (invoices.isEmpty)
                const MEmpty(
                  icon: Icons.directions_car_outlined,
                  title: 'No completed trips',
                  message: 'You can still create a non-trip invoice above.',
                )
              else
                for (final invoice in invoices)
                  ListTile(
                    key: Key('invoice-create-${invoice.id}'),
                    title: Text(invoice.customer),
                    subtitle: Text('${invoice.number} · ${invoice.route}'),
                    trailing: Text(inr.format(invoice.fare)),
                    onTap: () => Navigator.pop(context, invoice),
                  ),
            ],
          ),
        ),
      );
      if (selected == null || !mounted) return;
      await context.push(
        AppRoutes.managerInvoiceEditorFor(
          selected.id.isEmpty ? 'new' : selected.id,
          create: true,
        ),
        extra: selected,
      );
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final size = MediaQuery.sizeOf(context);
    final pageSize = _pageSize ?? _defaultPageSize(size.width);
    final async = ref.watch(managerInvoicesProvider);
    final nonTripInvoicesAvailable = ref
        .watch(managerRepositoryProvider)
        .nonTripInvoicesAvailable;

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('Invoices'),
        actions: [
          IconButton(
            key: const Key('create-invoice'),
            tooltip: 'Create invoice',
            onPressed: _createInvoice,
            icon: const Icon(Icons.add),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () async {
          ref.invalidate(managerInvoicesProvider);
          await ref
              .read(managerInvoicesProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            ...async.when(
              skipLoadingOnRefresh: true,
              loading: () => const [MLoading(height: 240)],
              error: (e, _) => [
                MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerInvoicesProvider),
                ),
              ],
              data: (all) {
                final s = summarizeInvoices(all, widget.now ?? DateTime.now());
                final list = all.where((i) => i.matches(_query)).toList();
                final pageCount = (list.length / pageSize).ceil();
                final currentPage = pageCount == 0
                    ? 0
                    : _page.clamp(0, pageCount - 1);
                final start = currentPage * pageSize;
                final pageItems = list.skip(start).take(pageSize).toList();
                final end = (start + pageItems.length);
                return [
                  if (!nonTripInvoicesAvailable) ...[
                    MCard(
                      child: Text(
                        'Trip invoices are available. Non-trip invoices need the manager invoice database migration before they can be created or displayed.',
                        style: TextStyle(color: t.textSecondary),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                  Row(
                    children: [
                      _Stat(
                        key: const Key('inv-total'),
                        label: 'Total fare',
                        value: inr.format(s.total),
                      ),
                      const SizedBox(width: 10),
                      _Stat(label: 'Invoices', value: '${s.count}'),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _Stat(
                        label: 'This month',
                        value: inr.format(s.thisMonth),
                      ),
                      const SizedBox(width: 10),
                      _Stat(
                        label: 'Avg bill',
                        value: inr.format(s.average.round()),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  DirectorySearchField(
                    hint: 'Search customer, invoice no., place or car',
                    onChanged: (q) => setState(() {
                      _query = q;
                      _page = 0;
                    }),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          list.isEmpty
                              ? '0 invoices'
                              : 'Showing ${start + 1}–$end of ${list.length}',
                          style: TextStyle(
                            fontSize: 12,
                            color: t.textSecondary,
                          ),
                        ),
                      ),
                      const Text('Per page'),
                      const SizedBox(width: 8),
                      DropdownButton<int>(
                        key: const Key('invoice-page-size'),
                        value: pageSize,
                        items: [
                          for (final count in [5, 8, 12, 20])
                            DropdownMenuItem(
                              value: count,
                              child: Text('$count'),
                            ),
                        ],
                        onChanged: (value) => setState(() {
                          _pageSize = value;
                          _page = 0;
                        }),
                      ),
                    ],
                  ),
                  if (list.isEmpty)
                    MEmpty(
                      icon: Icons.receipt_long_outlined,
                      title: all.isEmpty ? 'No invoices yet' : 'No match',
                      message: all.isEmpty
                          ? 'A trip shows here as an invoice once it is completed.'
                          : 'Try another name, number or place.',
                    )
                  else
                    for (final i in pageItems) ...[
                      _InvoiceTile(invoice: i),
                      const SizedBox(height: 10),
                    ],
                  if (pageCount > 1)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        IconButton(
                          tooltip: 'Previous page',
                          onPressed: currentPage == 0
                              ? null
                              : () => setState(() => _page = currentPage - 1),
                          icon: const Icon(Icons.chevron_left),
                        ),
                        Text('${currentPage + 1} / $pageCount'),
                        IconButton(
                          tooltip: 'Next page',
                          onPressed: currentPage >= pageCount - 1
                              ? null
                              : () => setState(() => _page = currentPage + 1),
                          icon: const Icon(Icons.chevron_right),
                        ),
                      ],
                    ),
                ];
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Expanded(
      child: MCard(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: t.textPrimary,
                ),
              ),
            ),
            Text(label, style: TextStyle(fontSize: 12, color: t.textSecondary)),
          ],
        ),
      ),
    );
  }
}

class _InvoiceTile extends StatelessWidget {
  const _InvoiceTile({required this.invoice});
  final InvoiceRecord invoice;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final i = invoice;
    return MCard(
      key: Key('invoice-${i.id}'),
      onTap: () => context.push(AppRoutes.managerInvoiceFor(i.id), extra: i),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  i.customer,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                Text(
                  [
                    i.number,
                    if (i.tripDate != null) directoryDate.format(i.tripDate!),
                  ].join(' · '),
                  style: TextStyle(fontSize: 13, color: t.textSecondary),
                ),
                const SizedBox(height: 4),
                MInfoLine(icon: Icons.route_outlined, text: i.route),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            inr.format(i.total),
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: t.primary,
            ),
          ),
        ],
      ),
    );
  }
}

/// One invoice, laid out like the web's printable invoice.
class ManagerInvoiceScreen extends ConsumerStatefulWidget {
  const ManagerInvoiceScreen({super.key, required this.invoice});
  final InvoiceRecord invoice;

  @override
  ConsumerState<ManagerInvoiceScreen> createState() =>
      _ManagerInvoiceScreenState();
}

class _ManagerInvoiceScreenState extends ConsumerState<ManagerInvoiceScreen> {
  late InvoiceRecord _invoice = widget.invoice;
  bool _sending = false;

  Future<void> _editInvoice() async {
    final updated = await context.push<InvoiceRecord>(
      AppRoutes.managerInvoiceEditorFor(_invoice.id),
      extra: _invoice,
    );
    if (updated != null && mounted) setState(() => _invoice = updated);
  }

  Future<void> _sendInvoice(
    InvoiceRecord invoice,
    InvoiceBusiness business,
  ) async {
    final phone = invoice.contact?.trim();
    if (phone == null || phone.isEmpty) {
      showManagerSnack(context, 'Add a customer phone number to send the invoice.');
      return;
    }
    setState(() => _sending = true);
    try {
      await ref
          .read(managerRepositoryProvider)
          .sendManagerWhatsApp(
            action: 'invoice',
            phone: phone,
            text: invoiceShareText(invoice, business),
          );
      if (mounted) showManagerSnack(context, 'Invoice sent on WhatsApp');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final i = _invoice;
    final biz =
        ref.watch(managerInvoiceBusinessProvider).valueOrNull ??
        const InvoiceBusiness();
    final tripDate = i.tripDate == null
        ? '—'
        : DateFormat('dd/MM/yyyy').format(i.tripDate!);
    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: Text(
          'Invoice ${i.number}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            key: const Key('invoice-edit'),
            tooltip: 'Edit invoice',
            onPressed: _editInvoice,
            icon: const Icon(Icons.edit_outlined),
          ),
        ],
      ),
      body: ListView(
        key: const Key('invoice-view'),
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        children: [
          MCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            biz.name,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: t.textPrimary,
                            ),
                          ),
                          Text(
                            biz.phone,
                            style: TextStyle(
                              fontSize: 12,
                              color: t.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    MTag(label: 'Invoice', color: t.primary),
                  ],
                ),
                Divider(height: 24, color: t.cardBorder),
                Text('BILL TO', style: _caps(t)),
                const SizedBox(height: 2),
                Text(
                  i.customer,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                if (i.contact != null)
                  Text(
                    i.contact!,
                    style: TextStyle(fontSize: 13, color: t.textSecondary),
                  ),
                const SizedBox(height: 12),
                DetailRow('Invoice no.', i.number),
                DetailRow(
                  i.isStandalone ? 'Invoice date' : 'Trip date',
                  tripDate,
                ),
                if (i.isStandalone)
                  DetailRow('Service', i.route)
                else ...[
                  DetailRow('Trip type', _tripTypeLabel(i.tripType)),
                  DetailRow('Route', i.route),
                ],
                if (i.leadSource != null)
                  DetailRow('Lead source', titleCase(i.leadSource)),
              ],
            ),
          ),
          if (!i.isStandalone) ...[
            const SizedBox(height: 12),
            Row(
              children: [
                _Stat(label: 'Start km', value: i.startKm ?? '—'),
                const SizedBox(width: 10),
                _Stat(label: 'End km', value: i.endKm ?? '—'),
                const SizedBox(width: 10),
                _Stat(label: 'Distance', value: i.kmText),
              ],
            ),
          ],
          const SizedBox(height: 18),
          const MSectionLabel('Fare breakdown'),
          MCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final l in i.lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            l.label,
                            style: TextStyle(
                              fontSize: 14,
                              color: t.textPrimary,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          biz.money(l.amount),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: t.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                Container(
                  key: const Key('invoice-total'),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: t.primary,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Total amount due',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                      Text(
                        biz.money(i.total),
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'In words: ${amountInWords(i.total)}',
                  style: TextStyle(
                    fontSize: 12,
                    fontStyle: FontStyle.italic,
                    color: t.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          if (!i.isStandalone) ...[
            const SizedBox(height: 18),
            const MSectionLabel('Driver and vehicle'),
            MCard(
              child: Column(
                children: [
                  DetailRow('Driver', i.driver ?? '—'),
                  DetailRow('Driver mobile', i.driverMobile ?? '—'),
                  DetailRow('Vehicle no.', i.vehicle ?? '—'),
                ],
              ),
            ),
          ],
          const SizedBox(height: 18),
          Text(
            biz.name,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
          Text(
            [
              biz.address,
              'Tel: ${biz.phone} | ${biz.email}',
              if (biz.showGstin && biz.gstin != null) 'GSTIN: ${biz.gstin}',
            ].join('\n'),
            style: TextStyle(fontSize: 12, height: 1.4, color: t.textSecondary),
          ),
          const SizedBox(height: 6),
          Text(
            'Use the web app when you need to print this invoice.',
            style: TextStyle(fontSize: 12, color: t.textSecondary),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  key: const Key('invoice-whatsapp'),
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                    backgroundColor: const Color(0xFF128C4B),
                  ),
                  onPressed: _sending || i.contact?.trim().isNotEmpty != true
                      ? null
                      : () => _sendInvoice(i, biz),
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                  label: Text(
                    _sending
                        ? 'Sending…'
                        : i.contact?.trim().isNotEmpty != true
                        ? 'Add customer phone to send'
                        : 'Send to ${i.customer.split(' ').first}',
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  TextStyle _caps(HomeTokens t) => TextStyle(
    fontSize: 11,
    fontWeight: FontWeight.w700,
    letterSpacing: 0.8,
    color: t.textSecondary,
  );
}
