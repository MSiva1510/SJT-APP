// ─────────────────────────────────────────────────────────────────────────────
// directory_ui.dart — pieces shared by the manager Documents, Vehicles,
// Drivers and Customers screens: search field, Call / WhatsApp buttons,
// expiry colours and rows, label/value rows, and a "Recent trips" section.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/manager_directory.dart';
import '../../models/new_booking.dart' show normalizeIndianMobile;
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import 'manager_ui.dart';
import '../../core/theme/home_tokens.dart';

final directoryDate = DateFormat('d MMM yyyy');

DateTime directoryToday() {
  final n = DateTime.now();
  return DateTime(n.year, n.month, n.day);
}

Color expiryColor(ExpiryState s, HomeTokens t, Brightness b) => switch (s) {
      ExpiryState.expired =>
        b == Brightness.dark ? const Color(0xFFF87171) : const Color(0xFFDC2626),
      ExpiryState.soon => t.warning,
      ExpiryState.ok => t.success,
    };

/// `tel:` / WhatsApp links; WhatsApp needs the 91 country code.
Uri? phoneUri(String? phone) {
  final p = phone?.replaceAll(RegExp(r'[^\d+]'), '');
  return (p == null || p.length < 6) ? null : Uri(scheme: 'tel', path: p);
}

Uri? whatsAppUri(String? phone) {
  final ten = normalizeIndianMobile(phone ?? '');
  return ten == null ? null : Uri.parse('https://wa.me/91$ten');
}

/// WhatsApp with [text] ready to send: to [phone] when it is a valid mobile,
/// else WhatsApp asks who to send it to.
Uri whatsAppMessageUri(String? phone, String text) {
  final ten = normalizeIndianMobile(phone ?? '');
  return Uri.https('wa.me', ten == null ? '/' : '/91$ten', {'text': text});
}

Future<void> openExternal(BuildContext context, Uri uri, String what) async {
  try {
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      showManagerSnack(context, 'Could not open $what', error: true);
    }
  } catch (_) {
    if (context.mounted) showManagerSnack(context, 'Could not open $what', error: true);
  }
}

class DirectorySearchField extends StatelessWidget {
  const DirectorySearchField({
    super.key,
    required this.hint,
    required this.onChanged,
  });

  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final border = OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: t.cardBorder),
    );
    return TextField(
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search_rounded),
        isDense: true,
        filled: true,
        fillColor: t.card,
        border: border,
        enabledBorder: border,
      ),
    );
  }
}

/// Call + WhatsApp side by side; hidden when there is no usable number.
class ContactButtons extends StatelessWidget {
  const ContactButtons({super.key, required this.phone, this.keyPrefix = 'contact'});

  final String? phone;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    final call = phoneUri(phone);
    final wa = whatsAppUri(phone);
    if (call == null && wa == null) {
      return const MInfoLine(icon: Icons.phone_disabled_outlined, text: 'No phone number saved');
    }
    return Row(
      children: [
        if (call != null)
          Expanded(
            child: FilledButton.icon(
              key: Key('$keyPrefix-call'),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: () => openExternal(context, call, 'the dialer'),
              icon: const Icon(Icons.call_rounded, size: 19),
              label: const Text('Call'),
            ),
          ),
        if (call != null && wa != null) const SizedBox(width: 10),
        if (wa != null)
          Expanded(
            child: OutlinedButton.icon(
              key: Key('$keyPrefix-whatsapp'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(46)),
              onPressed: () => openExternal(context, wa, 'WhatsApp'),
              icon: const Icon(Icons.chat_outlined, size: 19),
              label: const Text('WhatsApp'),
            ),
          ),
      ],
    );
  }
}

/// Round "call" icon for list rows.
class CallIconButton extends StatelessWidget {
  const CallIconButton({super.key, required this.phone});
  final String? phone;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final uri = phoneUri(phone);
    if (uri == null) return const SizedBox.shrink();
    return IconButton(
      tooltip: 'Call',
      onPressed: () => openExternal(context, uri, 'the dialer'),
      style: IconButton.styleFrom(backgroundColor: t.primary.withValues(alpha: 0.12)),
      icon: Icon(Icons.call_rounded, size: 19, color: t.primary),
    );
  }
}

/// Label on the left, value on the right.
class DetailRow extends StatelessWidget {
  const DetailRow(this.label, this.value, {super.key, this.valueColor});
  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 118,
            child: Text(label, style: TextStyle(fontSize: 13, color: t.textSecondary)),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: valueColor ?? t.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Insurance · 30 Nov 2026 · Expires in 31 days" coloured by state.
class ExpiryRow extends StatelessWidget {
  const ExpiryRow({super.key, required this.label, required this.expiry, required this.today});
  final String label;
  final DateTime? expiry;
  final DateTime today;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    if (expiry == null) return DetailRow(label, 'Not entered', valueColor: t.textSecondary);
    final c = expiryColor(expiryStateOf(expiry!, today), t, Theme.of(context).brightness);
    return DetailRow(
      label,
      '${directoryDate.format(expiry!)} · ${expiryPhrase(expiry!, today)}',
      valueColor: expiryStateOf(expiry!, today) == ExpiryState.ok ? null : c,
    );
  }
}

/// Small tag for a list row: worst state among [dates] (null when all fine).
Widget? worstExpiryTag(BuildContext context, Iterable<DateTime?> dates, DateTime today) {
  final t = Theme.of(context).home;
  ExpiryState? worst;
  for (final d in dates.whereType<DateTime>()) {
    final s = expiryStateOf(d, today);
    if (s == ExpiryState.expired) {
      worst = s;
      break;
    }
    if (s == ExpiryState.soon) worst = s;
  }
  if (worst == null) return null;
  return MTag(
    label: worst == ExpiryState.expired ? 'Document expired' : 'Expiring soon',
    color: expiryColor(worst, t, Theme.of(context).brightness),
    icon: Icons.warning_amber_rounded,
  );
}

/// Newest trips of a driver / vehicle / customer, each opening the trip.
class OwnerTripsSection extends ConsumerWidget {
  const OwnerTripsSection({super.key, required this.owner});
  final TripOwner owner;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerOwnerTripsProvider(owner));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const MSectionLabel('Recent trips'),
        async.when(
          loading: () => const MLoading(height: 80),
          error: (e, _) => MError(
            error: e,
            onRetry: () => ref.invalidate(managerOwnerTripsProvider(owner)),
          ),
          data: (list) => list.isEmpty
              ? Text('No trips yet.', style: TextStyle(fontSize: 13, color: t.textSecondary))
              : Column(
                  children: [
                    for (final b in list)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        onTap: () => context.push(AppRoutes.managerTripDetail(b.id)),
                        title: Text(
                          '${b.bookingNumber ?? 'Trip'} · ${titleCase(b.status)}',
                          style: TextStyle(fontWeight: FontWeight.w600, color: t.textPrimary),
                        ),
                        subtitle: Text(
                          [
                            if (b.startDate != null) directoryDate.format(b.startDate!),
                            [b.pickup, b.drop].whereType<String>().join(' → '),
                          ].where((s) => s.isNotEmpty).join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Icon(Icons.chevron_right, color: t.textSecondary),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// Bottom sheet frame used by the detail sheets (scrolls, safe area).
Future<void> showDirectorySheet(BuildContext context, WidgetBuilder builder) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    useRootNavigator: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (ctx, scroll) => SingleChildScrollView(
        controller: scroll,
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
        child: SafeArea(top: false, child: builder(ctx)),
      ),
    ),
  );
}

/// Bold title + optional subtitle at the top of a detail sheet.
class SheetHeader extends StatelessWidget {
  const SheetHeader({super.key, required this.title, this.subtitle, this.leading, this.tags = const []});
  final String title;
  final String? subtitle;
  final Widget? leading;
  final List<Widget> tags;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      children: [
        if (leading != null) ...[leading!, const SizedBox(width: 14)],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, color: t.textPrimary),
              ),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(subtitle!, style: TextStyle(fontSize: 13, color: t.textSecondary)),
                ),
              if (tags.isNotEmpty) ...[
                const SizedBox(height: 6),
                Wrap(spacing: 6, runSpacing: 6, children: tags),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// Circle with initials (drivers, customers).
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.name, {super.key, this.size = 44});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final initials = parts.isEmpty
        ? '?'
        : (parts.length == 1 ? parts.first.substring(0, 1) : '${parts.first[0]}${parts.last[0]}')
            .toUpperCase();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: t.primary.withValues(alpha: 0.14), shape: BoxShape.circle),
      child: Text(
        initials,
        style: TextStyle(fontSize: size * 0.36, fontWeight: FontWeight.w800, color: t.primary),
      ),
    );
  }
}

/// Active · Inactive · On leave … tag.
Widget statusTag(BuildContext context, String status) {
  final t = Theme.of(context).home;
  final good = status == 'active';
  return MTag(label: titleCase(status), color: good ? t.success : t.textSecondary);
}
