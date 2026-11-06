// ─────────────────────────────────────────────────────────────────────────────
// manager_customers_screen.dart — read-only Customers list for the manager
// (web: /customers). Search by name / phone / city / code; most recent
// customer first. Row: trips + last trip, call button. Tap → detail sheet:
// Call / WhatsApp, "New booking" (opens the booking form with this customer
// filled in), trip count + revenue, details, recent trips.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/formatters.dart';
import '../../models/manager_directory.dart';
import '../../models/new_booking.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../widgets/manager/manager_record_editor.dart';
import '../../../core/theme/home_tokens.dart';

/// Customers with a recent trip first, then by name.
List<CustomerRecord> sortCustomers(List<CustomerRecord> list) =>
    [...list]..sort((a, b) {
      if (a.lastTrip != null && b.lastTrip != null) {
        return b.lastTrip!.compareTo(a.lastTrip!);
      }
      if (a.lastTrip != null) {
        return -1;
      }
      if (b.lastTrip != null) {
        return 1;
      }
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });

String customerTripsLine(CustomerRecord c) {
  if (c.trips == 0) return 'No trips yet';
  final last = c.lastTrip == null
      ? ''
      : ' · last ${directoryDate.format(c.lastTrip!)}';
  return '${c.trips} ${c.trips == 1 ? 'trip' : 'trips'}$last';
}

class ManagerCustomersScreen extends ConsumerStatefulWidget {
  const ManagerCustomersScreen({super.key});

  @override
  ConsumerState<ManagerCustomersScreen> createState() =>
      _ManagerCustomersScreenState();
}

class _ManagerCustomersScreenState
    extends ConsumerState<ManagerCustomersScreen> {
  String _query = '';

  Future<void> _editCustomer([CustomerRecord? customer]) async {
    final values = await showDirectoryRecordEditor(
      context,
      title: customer == null ? 'Add customer' : 'Edit customer',
      fields: [
        DirectoryEditorField(
          'name',
          'Name',
          initialValue: customer?.name,
          required: true,
        ),
        DirectoryEditorField(
          'type',
          'Type',
          initialValue: customer?.type ?? 'individual',
          required: true,
          options: const {
            'individual': 'Individual',
            'corporate': 'Corporate',
            'agent': 'Agent',
          },
        ),
        DirectoryEditorField(
          'phone',
          'Phone',
          initialValue: customer?.phone,
          keyboardType: TextInputType.phone,
        ),
        DirectoryEditorField(
          'alt_mobile',
          'Alternate phone',
          initialValue: customer?.altPhone,
          keyboardType: TextInputType.phone,
        ),
        DirectoryEditorField(
          'email',
          'Email',
          initialValue: customer?.email,
          keyboardType: TextInputType.emailAddress,
        ),
        DirectoryEditorField(
          'company_name',
          'Company',
          initialValue: customer?.company,
        ),
        DirectoryEditorField('city', 'City', initialValue: customer?.city),
        DirectoryEditorField(
          'address',
          'Address',
          initialValue: customer?.address,
        ),
        DirectoryEditorField('gstin', 'GSTIN', initialValue: customer?.gst),
        DirectoryEditorField('notes', 'Notes', initialValue: customer?.notes),
      ],
    );
    if (values == null || !mounted) return;
    try {
      await ref
          .read(managerRepositoryProvider)
          .saveCustomer(id: customer?.id, values: values);
      ref.invalidate(managerCustomerRecordsProvider);
      if (mounted) {
        showManagerSnack(
          context,
          customer == null ? 'Customer added' : 'Customer saved',
        );
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  Future<void> _deleteCustomer(CustomerRecord customer) async {
    final confirmed = await confirmDirectoryDelete(
      context,
      title: 'Delete customer?',
      message:
          'Delete ${customer.name}? Existing booking history may prevent deletion.',
    );
    if (!confirmed || !mounted) return;
    try {
      await ref.read(managerRepositoryProvider).deleteCustomer(customer.id);
      ref.invalidate(managerCustomerRecordsProvider);
      if (mounted) showManagerSnack(context, 'Customer deleted');
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerCustomerRecordsProvider);

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: Text(
          async.hasValue ? 'Customers · ${async.value!.length}' : 'Customers',
        ),
        actions: [
          IconButton(
            key: const Key('manager-customer-add'),
            tooltip: 'Add customer',
            onPressed: () => _editCustomer(),
            icon: const Icon(Icons.person_add_alt_1_outlined),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () async {
          ref.invalidate(managerCustomerRecordsProvider);
          await ref
              .read(managerCustomerRecordsProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            DirectorySearchField(
              hint: 'Search name, phone, city or code',
              onChanged: (q) => setState(() => _query = q),
            ),
            const SizedBox(height: 14),
            ...async.when(
              skipLoadingOnRefresh: true,
              loading: () => const [MLoading(height: 240)],
              error: (e, _) => [
                MError(
                  error: e,
                  onRetry: () => ref.invalidate(managerCustomerRecordsProvider),
                ),
              ],
              data: (all) {
                final list = sortCustomers(
                  all.where((c) => c.matches(_query)).toList(),
                );
                if (list.isEmpty) {
                  return [
                    MEmpty(
                      icon: Icons.people_outline,
                      title: all.isEmpty ? 'No customers yet' : 'No match',
                      message: all.isEmpty
                          ? 'Customers added on the web app show up here.'
                          : 'Try another name or number.',
                    ),
                  ];
                }
                return [
                  for (final c in list) ...[
                    _CustomerTile(
                      customer: c,
                      onEdit: () => _editCustomer(c),
                      onDelete: () => _deleteCustomer(c),
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

class _CustomerTile extends StatelessWidget {
  const _CustomerTile({
    required this.customer,
    required this.onEdit,
    required this.onDelete,
  });
  final CustomerRecord customer;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final c = customer;
    return MCard(
      key: Key('customer-${c.id}'),
      onTap: () => showCustomerRecordSheet(context, c),
      child: Row(
        children: [
          InitialsAvatar(c.name),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  c.company == null ? c.name : '${c.name} · ${c.company}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: t.textPrimary,
                  ),
                ),
                if (c.phone != null)
                  Text(
                    c.phone!,
                    style: TextStyle(fontSize: 13, color: t.textSecondary),
                  ),
                const SizedBox(height: 4),
                MInfoLine(
                  icon: Icons.route_outlined,
                  text: customerTripsLine(c),
                ),
              ],
            ),
          ),
          CallIconButton(phone: c.phone),
          PopupMenuButton<String>(
            tooltip: 'Customer actions',
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

Future<void> showCustomerRecordSheet(BuildContext context, CustomerRecord c) {
  return showDirectorySheet(context, (ctx) => CustomerRecordSheet(customer: c));
}

class CustomerRecordSheet extends StatelessWidget {
  const CustomerRecordSheet({super.key, required this.customer});
  final CustomerRecord customer;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final c = customer;
    return Column(
      key: const Key('customer-sheet'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SheetHeader(
          leading: InitialsAvatar(c.name, size: 52),
          title: c.name,
          subtitle: [c.phone, c.code].whereType<String>().join(' · '),
          tags: [MTag(label: titleCase(c.type), color: t.primary)],
        ),
        const SizedBox(height: 16),
        ContactButtons(phone: c.phone, keyPrefix: 'customer'),
        const SizedBox(height: 10),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            key: const Key('customer-new-booking'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(46),
            ),
            onPressed: () {
              final router = GoRouter.of(context);
              Navigator.of(context).pop();
              router.push(
                AppRoutes.managerNewBooking,
                extra: CustomerOption(
                  name: c.name,
                  contact: normalizeIndianMobile(c.phone ?? ''),
                  customerId: c.id,
                ),
              );
            },
            icon: const Icon(Icons.add_rounded),
            label: const Text('New booking for this customer'),
          ),
        ),
        const SizedBox(height: 18),
        Row(
          children: [
            _Stat(label: 'Trips', value: '${c.trips}'),
            const SizedBox(width: 10),
            _Stat(label: 'Completed', value: '${c.completedTrips}'),
            const SizedBox(width: 10),
            _Stat(label: 'Revenue', value: inr.format(c.revenue)),
          ],
        ),
        const SizedBox(height: 18),
        const MSectionLabel('Details'),
        MCard(
          child: Column(
            children: [
              if (c.altPhone != null) DetailRow('Other phone', c.altPhone!),
              if (c.email != null) DetailRow('Email', c.email!),
              if (c.city != null) DetailRow('City', c.city!),
              if (c.address != null) DetailRow('Address', c.address!),
              if (c.company != null) DetailRow('Company', c.company!),
              if (c.gst != null) DetailRow('GST', c.gst!),
              if (c.notes != null) DetailRow('Notes', c.notes!),
              DetailRow(
                'Last trip',
                c.lastTrip == null
                    ? 'None yet'
                    : directoryDate.format(c.lastTrip!),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        OwnerTripsSection(owner: (kind: 'customer', id: c.id, name: c.name)),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Expanded(
      child: MCard(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 17,
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
