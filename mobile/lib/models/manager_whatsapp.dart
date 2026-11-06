// ─────────────────────────────────────────────────────────────────────────────
// manager_whatsapp.dart — WhatsApp inbox for the manager mode.
//
// Rows of whatsapp_conversations (one per customer phone, e.g.
// '917305581235'), whatsapp_inbound_messages (from the customer) and
// whatsapp_outbound_messages (bot, staff and trip messages from us).
// Helpers: merge both message tables into one time-ordered thread, the
// WhatsApp 24-hour reply window, "+91 73055 81235" phone formatting and the
// list's time label.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:intl/intl.dart';

DateTime? _date(Object? v) =>
    v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

String? _text(Object? v) {
  final s = v?.toString().trim();
  return (s == null || s.isEmpty) ? null : s;
}

int _int(Object? v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;

/// WhatsApp lets a business send free text only within 24 h of the
/// customer's last message; after that only approved templates.
const whatsAppReplyWindow = Duration(hours: 24);

bool withinReplyWindow(DateTime? lastInboundAt, DateTime now) =>
    lastInboundAt != null &&
    now.difference(lastInboundAt) < whatsAppReplyWindow;

/// `917305581235` → `+91 73055 81235`; other numbers → `+` and the digits.
String formatWhatsAppPhone(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.isEmpty) return phone;
  if (d.length == 12 && d.startsWith('91')) {
    return '+91 ${d.substring(2, 7)} ${d.substring(7)}';
  }
  if (d.length == 10) return '+91 ${d.substring(0, 5)} ${d.substring(5)}';
  return '+$d';
}

/// List label: "9:41 AM" today, "Yesterday", "Mon" this week, else "3 Oct"
/// (with the year when it is not this year).
String whatsAppListTime(DateTime? at, DateTime now) {
  if (at == null) return '';
  final l = at.toLocal();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(l.year, l.month, l.day);
  final diff = today.difference(day).inDays;
  if (diff <= 0) return DateFormat('h:mm a').format(l);
  if (diff == 1) return 'Yesterday';
  if (diff < 7) return DateFormat('EEE').format(l);
  return DateFormat(l.year == now.year ? 'd MMM' : 'd MMM yyyy').format(l);
}

class WhatsAppConversation {
  const WhatsAppConversation({
    required this.phone,
    this.contactName,
    this.state,
    this.botPausedUntil,
    this.needsStaff = false,
    this.unread = 0,
    this.lastInboundAt,
    this.lastOutboundAt,
    this.lastMessageAt,
    this.createdAt,
  });

  static const columns =
      'phone, contact_name, state, bot_paused_until, needs_staff, unread, '
      'last_inbound_at, last_outbound_at, last_message_at, created_at';

  factory WhatsAppConversation.fromMap(Map<String, dynamic> m) =>
      WhatsAppConversation(
        phone: '${m['phone'] ?? ''}',
        contactName: _text(m['contact_name']),
        state: _text(m['state']),
        botPausedUntil: _date(m['bot_paused_until']),
        needsStaff: m['needs_staff'] == true,
        unread: _int(m['unread']),
        lastInboundAt: _date(m['last_inbound_at']),
        lastOutboundAt: _date(m['last_outbound_at']),
        lastMessageAt: _date(m['last_message_at']),
        createdAt: _date(m['created_at']),
      );

  final String phone;
  final String? contactName;
  final String? state;
  final DateTime? botPausedUntil;
  final bool needsStaff;
  final int unread;
  final DateTime? lastInboundAt;
  final DateTime? lastOutboundAt;
  final DateTime? lastMessageAt;
  final DateTime? createdAt;

  String get formattedPhone => formatWhatsAppPhone(phone);

  /// Contact name, else the formatted phone.
  String get displayName => contactName ?? formattedPhone;

  bool isBotPaused(DateTime now) =>
      botPausedUntil != null && botPausedUntil!.isAfter(now);

  /// "Resume bot" makes sense while the bot is paused or staff were asked.
  bool canResumeBot(DateTime now) => needsStaff || isBotPaused(now);

  bool canReply(DateTime now) => withinReplyWindow(lastInboundAt, now);

  /// Name contains [query] (any case), or the phone contains its digits.
  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    if ((contactName ?? '').toLowerCase().contains(q)) return true;
    final digits = q.replaceAll(RegExp(r'\D'), '');
    return digits.length >= 3 && phone.contains(digits);
  }

  WhatsAppConversation copyWith({int? unread}) => WhatsAppConversation(
    phone: phone,
    contactName: contactName,
    state: state,
    botPausedUntil: botPausedUntil,
    needsStaff: needsStaff,
    unread: unread ?? this.unread,
    lastInboundAt: lastInboundAt,
    lastOutboundAt: lastOutboundAt,
    lastMessageAt: lastMessageAt,
    createdAt: createdAt,
  );
}

/// Newest `last_message_at` first; conversations without one last.
List<WhatsAppConversation> sortConversations(List<WhatsAppConversation> list) {
  DateTime? at(WhatsAppConversation c) => c.lastMessageAt ?? c.createdAt;
  return [...list]..sort((a, b) {
    final x = at(a), y = at(b);
    if (x != null && y != null) return y.compareTo(x);
    if (x != null) return -1;
    if (y != null) return 1;
    return a.phone.compareTo(b.phone);
  });
}

int totalUnread(Iterable<WhatsAppConversation> list) =>
    list.fold(0, (sum, c) => sum + (c.unread > 0 ? c.unread : 0));

enum WhatsAppFilter { all, needsStaff, unread }

extension WhatsAppFilterX on WhatsAppFilter {
  String get label => switch (this) {
    WhatsAppFilter.all => 'All',
    WhatsAppFilter.needsStaff => 'Needs staff',
    WhatsAppFilter.unread => 'Unread',
  };

  bool matches(WhatsAppConversation c) => switch (this) {
    WhatsAppFilter.all => true,
    WhatsAppFilter.needsStaff => c.needsStaff,
    WhatsAppFilter.unread => c.unread > 0,
  };
}

/// One bubble: a customer message (inbound) or one of ours (outbound).
class WhatsAppMessage {
  const WhatsAppMessage({
    required this.id,
    required this.inbound,
    required this.at,
    this.text,
    this.messageType,
    this.kind,
    this.templateName,
    this.status,
    this.error,
    this.sentBy,
  });

  static const inboundColumns =
      'id, wamid, from_phone, contact_name, message_type, text_body, received_at';
  static const outboundColumns =
      'id, wamid, to_phone, kind, body, template_name, booking_id, status, '
      'error, sent_by, created_at';

  factory WhatsAppMessage.fromInbound(Map<String, dynamic> m) =>
      WhatsAppMessage(
        id: 'in-${m['id']}',
        inbound: true,
        at: _date(m['received_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        text: _text(m['text_body']),
        messageType: _text(m['message_type']),
      );

  factory WhatsAppMessage.fromOutbound(Map<String, dynamic> m) =>
      WhatsAppMessage(
        id: 'out-${m['id']}',
        inbound: false,
        at: _date(m['created_at']) ?? DateTime.fromMillisecondsSinceEpoch(0),
        text: _text(m['body']),
        kind: _text(m['kind']),
        templateName: _text(m['template_name']),
        status: _text(m['status']),
        error: _text(m['error']),
        sentBy: _text(m['sent_by']),
      );

  final String id;
  final bool inbound;
  final DateTime at;
  final String? text;

  /// Inbound only: text · image · audio · location …
  final String? messageType;

  /// Outbound only: `bot` · `staff` · `customer_confirmed` ·
  /// `customer_completed` · `customer_driver:<id>` · `driver_trip:<id>`.
  final String? kind;
  final String? templateName;

  /// Outbound only: queued · sent · delivered · read · failed.
  final String? status;
  final String? error;
  final String? sentBy;

  /// Bubble text: the message, "[image]" for media, the template name for a
  /// template sent without a body.
  String get displayText {
    if (text != null) return text!;
    if (inbound) return '[${messageType ?? 'message'}]';
    if (templateName != null) return '[template: $templateName]';
    return '[message]';
  }

  /// Outbound sender label: Bot · Staff · Trip message.
  String? get senderLabel {
    if (inbound) return null;
    return switch (kind) {
      'bot' => 'Bot',
      'staff' => 'Staff',
      null => null,
      _ => 'Trip message',
    };
  }

  bool get failed => status == 'failed';
}

/// Both tables as one thread, oldest first. Equal times keep the customer's
/// message before our reply.
List<WhatsAppMessage> mergeWhatsAppMessages(
  Iterable<WhatsAppMessage> inbound,
  Iterable<WhatsAppMessage> outbound,
) {
  return [...inbound, ...outbound]..sort((a, b) {
    final c = a.at.compareTo(b.at);
    if (c != 0) return c;
    if (a.inbound != b.inbound) return a.inbound ? -1 : 1;
    return a.id.compareTo(b.id);
  });
}

/// A chat: the fresh conversation row (null if it vanished) + its messages.
class WhatsAppThread {
  const WhatsAppThread({required this.conversation, required this.messages});
  final WhatsAppConversation? conversation;
  final List<WhatsAppMessage> messages;
}
