// ─────────────────────────────────────────────────────────────────────────────
// manager_ui.dart — small shared building blocks for the manager screens:
// card surface, section label, loading / empty / error states, snackbars and
// date helpers. Everything reads HomeTokens so light and dark stay in sync.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/manager_models.dart';
import '../../repositories/manager_repository.dart';
import '../../core/theme/home_tokens.dart';

/// User-facing text for any error a manager provider / write can throw.
String managerErrorText(Object e) => e is ManagerException
    ? e.message
    : 'Something went wrong. Please try again.';

void showManagerSnack(
  BuildContext context,
  String message, {
  bool error = false,
}) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  if (messenger == null) return;
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: error ? Theme.of(context).colorScheme.error : null,
      ),
    );
}

String managerClock(String? hhmmss) {
  if (hhmmss == null || hhmmss.isEmpty) return '';
  try {
    final p = hhmmss.split(':');
    return DateFormat(
      'h:mm a',
    ).format(DateTime(2020, 1, 1, int.parse(p[0]), int.parse(p[1])));
  } catch (_) {
    return hhmmss;
  }
}

/// "Today, 9:30 AM" · "Tomorrow" · "Fri 31 Oct, 6:00 AM".
String managerWhen(ManagerBooking b, {DateTime? now}) {
  final d = b.startDate;
  if (d == null) return 'Date not set';
  final n = now ?? DateTime.now();
  final today = DateTime(n.year, n.month, n.day);
  final day = DateTime(d.year, d.month, d.day);
  final diff = day.difference(today).inDays;
  final datePart = switch (diff) {
    0 => 'Today',
    1 => 'Tomorrow',
    -1 => 'Yesterday',
    _ => DateFormat(
      day.year == n.year ? 'EEE d MMM' : 'd MMM yyyy',
    ).format(day),
  };
  final time = managerClock(b.startTime);
  return time.isEmpty ? datePart : '$datePart, $time';
}

String managerAgo(DateTime? at, {DateTime? now}) {
  if (at == null) return 'never';
  final d = (now ?? DateTime.now()).difference(at.toLocal());
  if (d.inSeconds < 60) return 'just now';
  if (d.inMinutes < 60) return '${d.inMinutes} min ago';
  if (d.inHours < 24) return '${d.inHours} h ago';
  if (d.inDays < 7) return '${d.inDays} d ago';
  return DateFormat('d MMM').format(at.toLocal());
}

String titleCase(String? s) {
  if (s == null || s.isEmpty) return '';
  return s
      .replaceAll('_', ' ')
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => '${w[0].toUpperCase()}${w.substring(1)}')
      .join(' ');
}

// ── Surfaces ─────────────────────────────────────────────────────────────────

class MCard extends StatelessWidget {
  const MCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
    this.borderColor,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final radius = BorderRadius.circular(t.cardRadius - 4);
    return Material(
      color: color ?? t.card,
      shape: RoundedRectangleBorder(
        borderRadius: radius,
        side: BorderSide(color: borderColor ?? t.cardBorder),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

class MSectionLabel extends StatelessWidget {
  const MSectionLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.2,
                color: t.textPrimary,
              ),
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

/// Large screen title used by the tab roots (matches driver screens).
class MScreenTitle extends StatelessWidget {
  const MScreenTitle(this.text, {super.key, this.subtitle, this.trailing});
  final String text;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                  color: t.textPrimary,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 13, color: t.textSecondary),
                ),
            ],
          ),
        ),
        if (trailing != null) trailing!,
      ],
    );
  }
}

// ── States ───────────────────────────────────────────────────────────────────

class MLoading extends StatelessWidget {
  const MLoading({super.key, this.height = 160});
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: Center(
        child: CircularProgressIndicator(color: Theme.of(context).home.primary),
      ),
    );
  }
}

class MEmpty extends StatelessWidget {
  const MEmpty({
    super.key,
    required this.icon,
    required this.title,
    this.message,
  });

  final IconData icon;
  final String title;
  final String? message;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return MCard(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: t.neutralSurface,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: t.textSecondary, size: 26),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: t.textPrimary,
            ),
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(
              message!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: t.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class MError extends StatelessWidget {
  const MError({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return MCard(
      child: Row(
        children: [
          Icon(
            Icons.cloud_off_outlined,
            color: Theme.of(context).colorScheme.error,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              managerErrorText(error),
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: t.textPrimary,
              ),
            ),
          ),
          TextButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    );
  }
}

/// Small rounded tag (e.g. "Unassigned", "Moving").
class MTag extends StatelessWidget {
  const MTag({super.key, required this.label, required this.color, this.icon});
  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.13),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          // Flexible + ellipsis: a tag squeezed by a wide neighbour (e.g. a
          // big fare in a trip tile) shrinks instead of overflowing.
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Icon + text line used inside cards.
class MInfoLine extends StatelessWidget {
  const MInfoLine({
    super.key,
    required this.icon,
    required this.text,
    this.maxLines = 1,
  });
  final IconData icon;
  final String text;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 15, color: t.textSecondary),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            maxLines: maxLines,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 13, color: t.textSecondary, height: 1.3),
          ),
        ),
      ],
    );
  }
}

/// Optional-text prompt (remarks, rejection reason). Returns null on cancel,
/// '' when confirmed without text.
Future<String?> promptManagerText(
  BuildContext context, {
  required String title,
  required String confirmLabel,
  String hint = 'Remarks (optional)',
  bool destructive = false,
}) {
  return showDialog<String>(
    context: context,
    builder: (_) => _TextPromptDialog(
      title: title,
      confirmLabel: confirmLabel,
      hint: hint,
      destructive: destructive,
    ),
  );
}

class _TextPromptDialog extends StatefulWidget {
  const _TextPromptDialog({
    required this.title,
    required this.confirmLabel,
    required this.hint,
    required this.destructive,
  });

  final String title;
  final String confirmLabel;
  final String hint;
  final bool destructive;

  @override
  State<_TextPromptDialog> createState() => _TextPromptDialogState();
}

class _TextPromptDialogState extends State<_TextPromptDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        minLines: 1,
        maxLines: 4,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(hintText: widget.hint),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Back'),
        ),
        FilledButton(
          style: widget.destructive
              ? FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                )
              : null,
          onPressed: () => Navigator.pop(context, _controller.text.trim()),
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}
