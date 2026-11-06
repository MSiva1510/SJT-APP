// ─────────────────────────────────────────────────────────────────────────────
// manager_whatsapp_test.dart — WhatsApp inbox models: row parsing, merged
// thread order, the 24-hour reply window, phone formatting, list sort,
// filters, search and the list's time label.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/manager_whatsapp.dart';

void main() {
  group('WhatsAppConversation.fromMap', () {
    test('parses a full row', () {
      final c = WhatsAppConversation.fromMap(const {
        'phone': '917305581235',
        'contact_name': ' Ravi Kumar ',
        'state': 'idle',
        'data': {'step': 2},
        'bot_paused_until': '2026-10-30T12:00:00Z',
        'needs_staff': true,
        'unread': 3,
        'last_inbound_at': '2026-10-30T09:00:00Z',
        'last_outbound_at': '2026-10-30T09:01:00Z',
        'last_message_at': '2026-10-30T09:01:00Z',
        'created_at': '2026-10-01T00:00:00Z',
      });
      expect(c.phone, '917305581235');
      expect(c.contactName, 'Ravi Kumar');
      expect(c.displayName, 'Ravi Kumar');
      expect(c.needsStaff, isTrue);
      expect(c.unread, 3);
      expect(c.lastInboundAt, DateTime.utc(2026, 10, 30, 9).toLocal());
      expect(c.isBotPaused(DateTime.utc(2026, 10, 30, 11)), isTrue);
      expect(c.isBotPaused(DateTime.utc(2026, 10, 30, 13)), isFalse);
      expect(
        c.canResumeBot(DateTime.utc(2026, 10, 30, 13)),
        isTrue,
      ); // needs_staff
    });

    test('tolerates nulls: no name → formatted phone, unread 0', () {
      final c = WhatsAppConversation.fromMap(const {
        'phone': '917305581235',
        'contact_name': '',
        'needs_staff': null,
        'unread': null,
      });
      expect(c.contactName, isNull);
      expect(c.displayName, '+91 73055 81235');
      expect(c.needsStaff, isFalse);
      expect(c.unread, 0);
      expect(c.canResumeBot(DateTime.now()), isFalse);
      expect(c.canReply(DateTime.now()), isFalse);
    });
  });

  group('WhatsAppMessage', () {
    test('inbound media without text shows its type', () {
      final m = WhatsAppMessage.fromInbound(const {
        'id': 5,
        'from_phone': '917305581235',
        'message_type': 'image',
        'text_body': null,
        'received_at': '2026-10-30T09:00:00Z',
      });
      expect(m.inbound, isTrue);
      expect(m.id, 'in-5');
      expect(m.displayText, '[image]');
      expect(m.senderLabel, isNull);
    });

    test('outbound labels: Bot · Staff · Trip message', () {
      WhatsAppMessage out(String kind) => WhatsAppMessage.fromOutbound({
        'id': 1,
        'kind': kind,
        'body': 'hi',
        'status': 'sent',
        'created_at': '2026-10-30T09:00:00Z',
      });
      expect(out('bot').senderLabel, 'Bot');
      expect(out('staff').senderLabel, 'Staff');
      expect(out('customer_confirmed').senderLabel, 'Trip message');
      expect(out('customer_completed').senderLabel, 'Trip message');
      expect(out('customer_driver:abc').senderLabel, 'Trip message');
      expect(out('driver_trip:42').senderLabel, 'Trip message');
    });

    test('failed outbound keeps the error; template without body', () {
      final m = WhatsAppMessage.fromOutbound(const {
        'id': 7,
        'kind': 'customer_confirmed',
        'body': null,
        'template_name': 'booking_confirmed',
        'status': 'failed',
        'error': 'Recipient not on WhatsApp',
        'created_at': '2026-10-30T09:00:00Z',
      });
      expect(m.failed, isTrue);
      expect(m.error, 'Recipient not on WhatsApp');
      expect(m.displayText, '[template: booking_confirmed]');
    });
  });

  group('mergeWhatsAppMessages', () {
    WhatsAppMessage inb(int id, String at) => WhatsAppMessage.fromInbound({
      'id': id,
      'text_body': 'in$id',
      'received_at': at,
    });
    WhatsAppMessage outb(int id, String at) => WhatsAppMessage.fromOutbound({
      'id': id,
      'body': 'out$id',
      'created_at': at,
    });

    test('interleaves both tables oldest first', () {
      // Repository queries return newest first — merge must re-sort.
      final merged = mergeWhatsAppMessages(
        [inb(2, '2026-10-30T09:10:00Z'), inb(1, '2026-10-30T09:00:00Z')],
        [outb(2, '2026-10-30T09:11:00Z'), outb(1, '2026-10-30T09:01:00Z')],
      );
      expect(merged.map((m) => m.displayText), ['in1', 'out1', 'in2', 'out2']);
    });

    test('same instant: customer message before our reply', () {
      final merged = mergeWhatsAppMessages(
        [inb(1, '2026-10-30T09:00:00Z')],
        [outb(1, '2026-10-30T09:00:00Z')],
      );
      expect(merged.first.inbound, isTrue);
    });
  });

  group('24-hour reply window', () {
    final now = DateTime(2026, 10, 30, 12);

    test('open within 24 h', () {
      expect(
        withinReplyWindow(
          now.subtract(const Duration(hours: 23, minutes: 59)),
          now,
        ),
        isTrue,
      );
      expect(withinReplyWindow(now, now), isTrue);
    });

    test('closed at 24 h or more, or when the customer never wrote', () {
      expect(
        withinReplyWindow(now.subtract(const Duration(hours: 24)), now),
        isFalse,
      );
      expect(
        withinReplyWindow(now.subtract(const Duration(days: 3)), now),
        isFalse,
      );
      expect(withinReplyWindow(null, now), isFalse);
    });
  });

  group('formatWhatsAppPhone', () {
    test('Indian numbers', () {
      expect(formatWhatsAppPhone('917305581235'), '+91 73055 81235');
      expect(formatWhatsAppPhone('+91 73055-81235'), '+91 73055 81235');
      expect(formatWhatsAppPhone('7305581235'), '+91 73055 81235');
    });

    test('other numbers get a plus', () {
      expect(formatWhatsAppPhone('14155550100'), '+14155550100');
      expect(formatWhatsAppPhone(''), '');
    });
  });

  group('list helpers', () {
    WhatsAppConversation conv(
      String phone, {
      String? name,
      DateTime? last,
      int unread = 0,
      bool staff = false,
    }) => WhatsAppConversation(
      phone: phone,
      contactName: name,
      lastMessageAt: last,
      unread: unread,
      needsStaff: staff,
    );

    test('sort: newest last_message_at first, none last', () {
      final sorted = sortConversations([
        conv('1', last: DateTime(2026, 10, 1)),
        conv('2'),
        conv('3', last: DateTime(2026, 10, 30)),
      ]);
      expect(sorted.map((c) => c.phone), ['3', '1', '2']);
    });

    test('total unread, filters and search', () {
      final list = [
        conv('917305581235', name: 'Ravi', unread: 2, staff: true),
        conv('919500387595', name: 'Meena', unread: 1),
        conv('919000000000'),
      ];
      expect(totalUnread(list), 3);
      expect(list.where(WhatsAppFilter.needsStaff.matches).length, 1);
      expect(list.where(WhatsAppFilter.unread.matches).length, 2);
      expect(list.where(WhatsAppFilter.all.matches).length, 3);
      expect(list.where((c) => c.matches('mee')).single.contactName, 'Meena');
      expect(list.where((c) => c.matches('73055')).single.contactName, 'Ravi');
      expect(list.where((c) => c.matches('')).length, 3);
    });

    test('list time label', () {
      final now = DateTime(2026, 10, 30, 15);
      expect(whatsAppListTime(DateTime(2026, 10, 30, 9, 5), now), '9:05 AM');
      expect(whatsAppListTime(DateTime(2026, 10, 29, 22), now), 'Yesterday');
      expect(whatsAppListTime(DateTime(2026, 10, 27, 10), now), 'Tue');
      expect(whatsAppListTime(DateTime(2026, 9, 3), now), '3 Sep');
      expect(whatsAppListTime(DateTime(2025, 9, 3), now), '3 Sep 2025');
      expect(whatsAppListTime(null, now), '');
    });
  });
}
