// ─────────────────────────────────────────────────────────────────────────────
// manager_whatsapp_screen.dart — WhatsApp inbox for staff (More → WhatsApp).
// A server bot answers customers; "Talk to staff" pauses it and flags the
// chat `needs_staff`.
//
// ManagerWhatsAppScreen: chats newest first, search (name / phone), chips
// All · Needs staff · Unread, unread badge, "Needs staff" / "Bot paused"
// tags, pull to refresh.
// ManagerWhatsAppChatScreen: customer messages left, ours right (Bot /
// Staff / Trip message, status tick, failure reason), Call, "Resume bot",
// reply bar — disabled once 24 h have passed since the customer last wrote
// (WhatsApp then allows only templates). Opening marks the chat read.
//
// Live: Supabase realtime on the three whatsapp_* tables, plus a 30 s
// refresh while a chat is open (realtime may be off server-side).
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/manager_whatsapp.dart';
import '../../navigation/app_router.dart';
import '../../providers/manager_provider.dart';
import '../../widgets/manager/directory_ui.dart';
import '../../widgets/manager/manager_ui.dart';
import '../../../core/theme/home_tokens.dart';

const whatsAppWindowClosedNote =
    'More than 24 hours since the customer wrote — WhatsApp allows only '
    'template messages now.';

/// Holds a realtime subscription for a State; [close] is safe before the
/// subscription has finished opening.
class _Live {
  Future<void> Function()? _close;
  bool _closed = false;
  Timer? _debounce;

  void open(Future<Future<void> Function()> Function() subscribe) {
    subscribe().then((close) {
      if (_closed) {
        close();
      } else {
        _close = close;
      }
    }, onError: (_) {});
  }

  /// Coalesces bursts (a reply touches two tables) into one refresh.
  void debounce(void Function() fn) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), fn);
  }

  void close() {
    _closed = true;
    _debounce?.cancel();
    _close?.call();
    _close = null;
  }
}

// ── Conversation list ────────────────────────────────────────────────────────

class ManagerWhatsAppScreen extends ConsumerStatefulWidget {
  const ManagerWhatsAppScreen({super.key});

  @override
  ConsumerState<ManagerWhatsAppScreen> createState() =>
      _ManagerWhatsAppScreenState();
}

class _ManagerWhatsAppScreenState extends ConsumerState<ManagerWhatsAppScreen> {
  String _query = '';
  WhatsAppFilter _filter = WhatsAppFilter.all;
  final _live = _Live();

  @override
  void initState() {
    super.initState();
    final repo = ref.read(managerRepositoryProvider);
    _live.open(
      () => repo.subscribeWhatsApp(
        onChange: () => _live.debounce(() {
          if (mounted) ref.invalidate(managerWhatsAppConversationsProvider);
        }),
      ),
    );
  }

  @override
  void dispose() {
    _live.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final async = ref.watch(managerWhatsAppConversationsProvider);
    final all = async.valueOrNull ?? const <WhatsAppConversation>[];
    final now = DateTime.now();

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        title: const Text('WhatsApp'),
      ),
      body: RefreshIndicator(
        color: t.primary,
        onRefresh: () async {
          ref.invalidate(managerWhatsAppConversationsProvider);
          await ref
              .read(managerWhatsAppConversationsProvider.future)
              .then((_) {}, onError: (_) {});
        },
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 32),
          children: [
            MCard(
              key: const Key('wa-daily-limit'),
              child: Row(
                children: [
                  Icon(Icons.speed_outlined, color: t.primary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Daily limit: 10 outgoing WhatsApp messages, shared '
                      'across managers and admins.',
                      style: TextStyle(color: t.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            DirectorySearchField(
              hint: 'Search name or phone',
              onChanged: (q) => setState(() => _query = q),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                for (final f in WhatsAppFilter.values)
                  ChoiceChip(
                    key: Key('wa-filter-${f.name}'),
                    label: Text(
                      async.hasValue
                          ? '${f.label} · ${all.where(f.matches).length}'
                          : f.label,
                    ),
                    selected: _filter == f,
                    showCheckmark: false,
                    onSelected: (_) => setState(() => _filter = f),
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
                  onRetry: () =>
                      ref.invalidate(managerWhatsAppConversationsProvider),
                ),
              ],
              data: (all) {
                final list = sortConversations(
                  all
                      .where((c) => _filter.matches(c) && c.matches(_query))
                      .toList(),
                );
                if (list.isEmpty) {
                  return [
                    MEmpty(
                      icon: Icons.chat_outlined,
                      title: all.isEmpty ? 'No WhatsApp chats yet' : 'No match',
                      message: all.isEmpty
                          ? 'Messages customers send to the business number show up here.'
                          : 'Try another name, number or filter.',
                    ),
                  ];
                }
                return [
                  for (final c in list) ...[
                    _ConversationTile(conversation: c, now: now),
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

List<Widget> _stateTags(
  BuildContext context,
  WhatsAppConversation c,
  DateTime now,
) {
  final t = Theme.of(context).home;
  return [
    if (c.needsStaff)
      MTag(
        label: 'Needs staff',
        color: t.warning,
        icon: Icons.support_agent_outlined,
      ),
    if (c.isBotPaused(now))
      MTag(
        label: 'Bot paused',
        color: t.textSecondary,
        icon: Icons.pause_circle_outline,
      ),
  ];
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.now});
  final WhatsAppConversation conversation;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final c = conversation;
    final tags = _stateTags(context, c, now);
    final unread = c.unread > 0;
    return MCard(
      key: Key('wa-${c.phone}'),
      onTap: () => context.push(AppRoutes.managerWhatsAppChat, extra: c),
      child: Row(
        children: [
          InitialsAvatar(c.contactName ?? '?'),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        c.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: unread
                              ? FontWeight.w800
                              : FontWeight.w700,
                          color: t.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      whatsAppListTime(c.lastMessageAt, now),
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                        color: unread ? t.primary : t.textSecondary,
                      ),
                    ),
                  ],
                ),
                if (c.contactName != null)
                  Text(
                    c.formattedPhone,
                    style: TextStyle(fontSize: 13, color: t.textSecondary),
                  ),
                if (tags.isNotEmpty || unread) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Wrap(spacing: 6, runSpacing: 4, children: tags),
                      ),
                      if (unread)
                        Badge(
                          key: Key('wa-unread-${c.phone}'),
                          label: Text(c.unread > 99 ? '99+' : '${c.unread}'),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

class ManagerWhatsAppChatScreen extends ConsumerStatefulWidget {
  const ManagerWhatsAppChatScreen({super.key, required this.conversation});

  /// The row tapped in the list; the thread's fresh row replaces it once
  /// loaded.
  final WhatsAppConversation conversation;

  @override
  ConsumerState<ManagerWhatsAppChatScreen> createState() =>
      _ManagerWhatsAppChatScreenState();
}

class _ManagerWhatsAppChatScreenState
    extends ConsumerState<ManagerWhatsAppChatScreen> {
  final _text = TextEditingController();
  final _live = _Live();
  Timer? _poll;
  bool _sending = false;
  bool _resuming = false;
  bool _marking = false;

  String get _phone => widget.conversation.phone;

  @override
  void initState() {
    super.initState();
    final repo = ref.read(managerRepositoryProvider);
    _live.open(
      () => repo.subscribeWhatsApp(
        phone: _phone,
        onChange: () => _live.debounce(_refresh),
      ),
    );
    _poll = Timer.periodic(const Duration(seconds: 30), (_) => _refresh());
    _markRead(widget.conversation.unread);
  }

  @override
  void dispose() {
    _live.close();
    _poll?.cancel();
    _text.dispose();
    super.dispose();
  }

  void _refresh() {
    if (!mounted) return;
    ref.invalidate(managerWhatsAppThreadProvider(_phone));
    ref.invalidate(managerWhatsAppConversationsProvider);
  }

  void _markRead(int unread) {
    if (unread <= 0 || _marking) return;
    _marking = true;
    ref
        .read(managerRepositoryProvider)
        .markWhatsAppRead(_phone)
        .then((_) {
          if (mounted) ref.invalidate(managerWhatsAppConversationsProvider);
        }, onError: (_) {})
        .whenComplete(() => _marking = false);
  }

  Future<void> _send() async {
    final text = _text.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref.read(managerRepositoryProvider).sendWhatsAppReply(_phone, text);
      if (!mounted) return;
      _text.clear();
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
      _refresh();
    }
  }

  Future<void> _resumeBot() async {
    if (_resuming) return;
    setState(() => _resuming = true);
    try {
      await ref.read(managerRepositoryProvider).resumeWhatsAppBot(_phone);
      if (mounted) {
        showManagerSnack(
          context,
          'Bot resumed — it will answer this customer again.',
        );
      }
    } catch (e) {
      if (mounted) showManagerSnack(context, managerErrorText(e), error: true);
    } finally {
      if (mounted) setState(() => _resuming = false);
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final provider = managerWhatsAppThreadProvider(_phone);
    ref.listen(provider, (_, next) {
      final c = next.valueOrNull?.conversation;
      if (c != null) _markRead(c.unread);
    });
    final async = ref.watch(provider);
    final conv = async.valueOrNull?.conversation ?? widget.conversation;
    final now = DateTime.now();
    final canReply = conv.canReply(now);
    final tags = _stateTags(context, conv, now);

    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(
        backgroundColor: t.canvas,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              conv.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: t.textPrimary,
              ),
            ),
            if (conv.contactName != null)
              Text(
                conv.formattedPhone,
                maxLines: 1,
                style: TextStyle(fontSize: 12.5, color: t.textSecondary),
              ),
          ],
        ),
        actions: [
          if (conv.canResumeBot(now))
            TextButton.icon(
              key: const Key('wa-resume-bot'),
              onPressed: _resuming ? null : _resumeBot,
              icon: _resuming
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.smart_toy_outlined, size: 18),
              label: const Text('Resume bot'),
            ),
          CallIconButton(phone: conv.formattedPhone),
          const SizedBox(width: 8),
        ],
      ),
      body: Column(
        children: [
          if (tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Wrap(spacing: 6, runSpacing: 4, children: tags),
              ),
            ),
          Divider(height: 1, color: t.cardBorder),
          Expanded(
            child: async.when(
              skipLoadingOnRefresh: true,
              loading: () => const MLoading(height: 240),
              error: (e, _) => ListView(
                padding: const EdgeInsets.all(16),
                children: [MError(error: e, onRetry: _refresh)],
              ),
              data: (thread) => thread.messages.isEmpty
                  ? ListView(
                      padding: const EdgeInsets.all(16),
                      children: const [
                        MEmpty(
                          icon: Icons.chat_bubble_outline,
                          title: 'No messages yet',
                        ),
                      ],
                    )
                  : _MessageList(messages: thread.messages, now: now),
            ),
          ),
          _ReplyBar(
            controller: _text,
            enabled: canReply,
            sending: _sending,
            onSend: _send,
          ),
        ],
      ),
    );
  }
}

/// Messages newest at the bottom (reverse list), a day chip when the day
/// changes.
class _MessageList extends StatelessWidget {
  const _MessageList({required this.messages, required this.now});
  final List<WhatsAppMessage> messages;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final items = <Object>[]; // DateTime (day chip) or WhatsAppMessage
    DateTime? lastDay;
    for (final m in messages) {
      final l = m.at.toLocal();
      final day = DateTime(l.year, l.month, l.day);
      if (day != lastDay) items.add(day);
      lastDay = day;
      items.add(m);
    }
    final shown = items.reversed.toList();
    return ListView.builder(
      key: const Key('wa-messages'),
      reverse: true,
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      itemCount: shown.length,
      itemBuilder: (context, i) {
        final item = shown[i];
        return item is WhatsAppMessage
            ? _Bubble(message: item)
            : _DayChip(day: item as DateTime, now: now);
      },
    );
  }
}

class _DayChip extends StatelessWidget {
  const _DayChip({required this.day, required this.now});
  final DateTime day;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final today = DateTime(now.year, now.month, now.day);
    final diff = today.difference(day).inDays;
    final label = switch (diff) {
      0 => 'Today',
      1 => 'Yesterday',
      _ => DateFormat(
        day.year == now.year ? 'EEE d MMM' : 'd MMM yyyy',
      ).format(day),
    };
    return Center(
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 10),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: t.neutralSurface,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w600,
            color: t.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final WhatsAppMessage message;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    final error = Theme.of(context).colorScheme.error;
    final m = message;
    final ours = !m.inbound;
    final maxWidth = MediaQuery.sizeOf(context).width * 0.78;
    final (IconData tick, Color tickColor) = switch (m.status) {
      'queued' => (Icons.schedule_rounded, t.textSecondary),
      'delivered' => (Icons.done_all_rounded, t.textSecondary),
      'read' => (Icons.done_all_rounded, t.primary),
      'failed' => (Icons.error_outline_rounded, error),
      _ => (Icons.check_rounded, t.textSecondary),
    };
    final meta = [
      if (m.senderLabel != null) m.senderLabel!,
      DateFormat('h:mm a').format(m.at.toLocal()),
    ].join(' · ');

    return Align(
      alignment: ours ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        key: Key('wa-msg-${m.id}'),
        constraints: BoxConstraints(maxWidth: maxWidth),
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: ours ? t.primary.withValues(alpha: 0.13) : t.card,
          border: Border.all(
            color: m.failed
                ? error.withValues(alpha: 0.6)
                : (ours ? Colors.transparent : t.cardBorder),
          ),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(ours ? 14 : 4),
            bottomRight: Radius.circular(ours ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: ours
              ? CrossAxisAlignment.end
              : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              m.displayText,
              style: TextStyle(
                fontSize: 14.5,
                height: 1.3,
                color: t.textPrimary,
                fontStyle: m.text == null ? FontStyle.italic : FontStyle.normal,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    meta,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 11, color: t.textSecondary),
                  ),
                ),
                if (ours) ...[
                  const SizedBox(width: 4),
                  Tooltip(
                    message: titleCase(m.status ?? 'sent'),
                    child: Icon(tick, size: 14, color: tickColor),
                  ),
                ],
              ],
            ),
            if (m.failed)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  'Not delivered${m.error == null ? '' : ': ${m.error}'}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: error,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ReplyBar extends StatelessWidget {
  const _ReplyBar({
    required this.controller,
    required this.enabled,
    required this.sending,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool enabled;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).home;
    return Material(
      color: t.card,
      child: SafeArea(
        top: false,
        child: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: t.cardBorder)),
          ),
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!enabled)
                Padding(
                  padding: const EdgeInsets.fromLTRB(4, 0, 4, 8),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.schedule_rounded, size: 16, color: t.warning),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          whatsAppWindowClosedNote,
                          key: const Key('wa-window-closed'),
                          style: TextStyle(
                            fontSize: 12.5,
                            color: t.textSecondary,
                            height: 1.3,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('wa-reply-field'),
                      controller: controller,
                      enabled: enabled && !sending,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: InputDecoration(
                        hintText: enabled
                            ? 'Reply as staff'
                            : 'Replies are closed',
                        isDense: true,
                        filled: true,
                        fillColor: t.neutralSurface,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(22),
                          borderSide: BorderSide.none,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    key: const Key('wa-send'),
                    tooltip: 'Send',
                    onPressed: enabled && !sending ? onSend : null,
                    icon: sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send_rounded, size: 20),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
