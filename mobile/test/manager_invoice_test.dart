// Invoice from a booking row, line items, amount in words, summary, share text.

import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/models/manager_invoice.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/directory_ui.dart';

void main() {
  test('booking row → invoice, with type_data and missing charge columns', () {
    final i = InvoiceRecord.fromMap(const {
      'id': 'b1',
      'booking_number': 'BK-2610-0042',
      'status': 'completed',
      'customer_name': 'Mani',
      'customer_contact': '7305581235',
      'pickup_location': 'Puducherry',
      'drop_location': 'Chennai',
      'start_date': '2026-10-20',
      'total_km': 320,
      'total_fare': '5400',
      'toll': 300,
      'bata': 0,
      'type_data': {
        'start_km': 159351.0,
        'end_km': 159401,
        'parking_charges': 50,
        'toll_cost': 200,
      },
    });

    expect(i.number, 'BK-2610-0042');
    expect((i.startKm, i.endKm), ('1,59,351', '1,59,401'));
    // toll_cost / petrol_cost in type_data are company costs, not charges.
    expect(i.lines.map((l) => '${l.label}=${l.amount}'), [
      'Trip fare — Puducherry to Chennai (320 km)=5400.0',
      'Toll charges=300.0',
      'Parking=50.0',
    ]);
    expect(i.total, 5400); // as on the web: the fare is the amount due
    expect(i.matches('chennai'), isTrue);
    expect(i.matches('gopal'), isFalse);

    final bare = InvoiceRecord.fromMap(const {'id': 'b2', 'status': 'closed'});
    expect((bare.number, bare.customer, bare.total), ('b2', 'Customer', 0.0));
    expect(bare.lines.single.label, 'Trip fare — — to —');
  });

  test('saved invoice charges override legacy booking charge values', () {
    final invoice = InvoiceRecord.fromMap(const {
      'id': 'b1',
      'status': 'completed',
      'total_fare': 6000,
      'toll': 300,
      'type_data': {
        'invoice_toll': 350,
        'invoice_bata': 500,
        'invoice_fuel': 200,
        'invoice_parking': 50,
        'invoice_extras': 100,
      },
    });

    expect(
      (
        invoice.fare,
        invoice.toll,
        invoice.bata,
        invoice.fuel,
        invoice.parking,
        invoice.extras,
      ),
      (6000.0, 350.0, 500.0, 200.0, 50.0, 100.0),
    );
  });

  test('standalone non-trip invoice maps and renders without trip details', () {
    final invoice = InvoiceRecord.fromStandaloneMap(const {
      'id': 'nontrip-1',
      'invoice_number': 'SJT-2611-A1B2C3D4',
      'customer_name': 'Meena',
      'customer_contact': '9876543210',
      'invoice_date': '2026-11-05',
      'description': 'Airport transfer service',
      'total_fare': 4500,
      'invoice_toll': 200,
    });

    expect(invoice.isStandalone, isTrue);
    expect(invoice.id, 'nontrip:nontrip-1');
    expect(invoice.number, 'SJT-2611-A1B2C3D4');
    expect(invoice.route, 'Airport transfer service');
    expect(invoice.total, 4500);
    expect(invoice.lines.first.label, 'Airport transfer service');
    expect(
      invoiceShareText(invoice, const InvoiceBusiness()),
      contains('Airport transfer service\nFare: Rs. 4,500'),
    );
    expect(InvoiceRecord.newStandalone().isStandalone, isTrue);
  });

  test('amount in words (Indian system)', () {
    expect(amountInWords(0), 'Zero Rupees Only');
    expect(amountInWords(2700), 'Two Thousand Seven Hundred Rupees Only');
    expect(amountInWords(15), 'Fifteen Rupees Only');
    expect(amountInWords(125000), 'One Lakh Twenty Five Thousand Rupees Only');
    expect(amountInWords(30000001), 'Three Crore One Rupees Only');
  });

  test('summary: total, this month, average', () {
    final list = [
      InvoiceRecord.fromMap(const {
        'id': 'a',
        'total_fare': 3000,
        'start_date': '2026-10-02',
      }),
      InvoiceRecord.fromMap(const {
        'id': 'b',
        'total_fare': 1000,
        'start_date': '2026-09-28',
      }),
    ];
    final s = summarizeInvoices(list, DateTime(2026, 10, 30));
    expect(
      (s.total, s.count, s.thisMonth, s.average),
      (4000.0, 2, 3000.0, 2000.0),
    );
    expect(summarizeInvoices(const [], DateTime(2026)).average, 0);
  });

  test('business settings, share text and WhatsApp link', () {
    final biz = InvoiceBusiness.fromSettings(const {
      'biz': {'name': 'SJT', 'phone': '+91 1'},
      'invoice': {'currency': '₹'},
    });
    expect(
      (biz.name, biz.email, biz.currency),
      ('SJT', 'srijayamtravels1255@gmail.com', '₹'),
    );
    expect(InvoiceBusiness.fromSettings(null).name, 'Sri Jayam Travels');

    final i = InvoiceRecord.fromMap(const {
      'id': 'b1',
      'booking_number': 'BK-1',
      'customer_name': 'Mani',
      'pickup_location': 'A',
      'drop_location': 'B',
      'start_date': '2026-10-20',
      'total_km': 12,
      'total_fare': 2700,
    });
    expect(
      invoiceShareText(i, biz),
      '*SJT*\nInvoice: BK-1\nCustomer: Mani\nDate: 20 October 2026\nA → B\n'
      'Distance: 12 km\nFare: ₹ 2,700\n\nThank you for choosing Sri Jayam Travels!\n+91 1',
    );
    expect(
      whatsAppMessageUri('+91 73055 81235', 'hi there').toString(),
      'https://wa.me/917305581235?text=hi+there',
    );
    expect(whatsAppMessageUri(null, 'x').toString(), 'https://wa.me/?text=x');
  });
}
