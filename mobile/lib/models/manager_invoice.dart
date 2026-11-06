// ─────────────────────────────────────────────────────────────────────────────
// manager_invoice.dart — trip invoices and standalone non-trip invoices:
//   • line items: trip fare, then toll / driver bata / fuel / parking / other
//     charges when above zero;
//   • "Total amount due" is the booking's fare (total_fare), as on the web;
//   • business name, phone, address and footer come from the `settings` row
//     key 'company_settings' (biz + invoice), with the web defaults.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:intl/intl.dart';

const invoiceStatuses = ['completed', 'closed'];

double _num(Object? v) =>
    v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;

double _invoiceAmount(
  Map<String, dynamic> row,
  Map<String, dynamic> extra,
  String invoiceKey,
  List<String> keys,
) {
  if (extra[invoiceKey] != null) return _num(extra[invoiceKey]);
  return _num(_pick(row, extra, keys));
}

String? _str(Object? v) {
  final s = v?.toString().trim();
  return s == null || s.isEmpty ? null : s;
}

DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse('$v');

/// Odometer reading as "1,59,351" (type_data stores 159351.0).
String? _odo(Object? v) {
  final n = v is num ? v : num.tryParse('${v ?? ''}');
  return n == null || n <= 0
      ? null
      : NumberFormat.decimalPattern('en_IN').format(n.round());
}

/// First non-empty value among [keys] in the row, then in its type_data.
Object? _pick(
  Map<String, dynamic> row,
  Map<String, dynamic> extra,
  List<String> keys,
) {
  for (final k in keys) {
    final v = row[k];
    if (v != null && '$v'.trim().isNotEmpty) return v;
  }
  for (final k in keys) {
    final v = extra[k];
    if (v != null && '$v'.trim().isNotEmpty) return v;
  }
  return null;
}

class InvoiceLine {
  const InvoiceLine(this.label, this.amount);
  final String label;
  final double amount;
}

class InvoiceRecord {
  const InvoiceRecord({
    required this.id,
    required this.number,
    required this.customer,
    required this.status,
    this.contact,
    this.pickup,
    this.drop,
    this.tripDate,
    this.tripType,
    this.km = 0,
    this.startKm,
    this.endKm,
    this.fare = 0,
    this.toll = 0,
    this.bata = 0,
    this.fuel = 0,
    this.parking = 0,
    this.extras = 0,
    this.driver,
    this.driverMobile,
    this.vehicle,
    this.leadSource,
    this.isStandalone = false,
    this.description,
  });

  final String id;
  final String number;
  final String customer;
  final String status;
  final String? contact;
  final String? pickup;
  final String? drop;
  final DateTime? tripDate;
  final String? tripType;
  final double km;
  final String? startKm;
  final String? endKm;
  final double fare;
  final double toll;
  final double bata;
  final double fuel;
  final double parking;
  final double extras;
  final String? driver;
  final String? driverMobile;
  final String? vehicle;
  final String? leadSource;
  final bool isStandalone;
  final String? description;

  /// From a `bookings` row read with select('*'): charge columns may be
  /// missing on older projects, so every field falls back like the web's
  /// normalizeBooking.
  factory InvoiceRecord.fromMap(Map<String, dynamic> m) {
    final td = m['type_data'] is Map
        ? Map<String, dynamic>.from(m['type_data'] as Map)
        : <String, dynamic>{};
    final id = '${m['id'] ?? m['booking_id'] ?? ''}';
    return InvoiceRecord(
      id: id,
      number: _str(_pick(m, td, ['booking_number', 'booking_id'])) ?? id,
      customer: _str(_pick(m, td, ['customer_name', 'customer'])) ?? 'Customer',
      status: _str(m['status']) ?? 'completed',
      contact: _str(_pick(m, td, ['customer_contact', 'contact'])),
      pickup: _str(_pick(m, td, ['pickup_location', 'pickup'])),
      drop: _str(_pick(m, td, ['drop_location', 'drop'])),
      tripDate: _date(m['start_date']),
      tripType: _str(m['type']),
      km: _num(_pick(m, td, ['total_km', 'km'])),
      startKm: _odo(_pick(m, td, ['start_km', 'startKm'])),
      endKm: _odo(_pick(m, td, ['end_km', 'endKm'])),
      fare: _num(_pick(m, td, ['total_fare', 'fare', 'base_fare'])),
      toll: _invoiceAmount(m, td, 'invoice_toll', ['toll', 'toll_charges']),
      bata: _invoiceAmount(m, td, 'invoice_bata', ['bata', 'driver_bata']),
      fuel: _invoiceAmount(m, td, 'invoice_fuel', [
        'petrol',
        'fuel_amount',
        'fuel',
      ]),
      parking: _invoiceAmount(m, td, 'invoice_parking', [
        'parking',
        'parking_charges',
      ]),
      extras: _invoiceAmount(m, td, 'invoice_extras', [
        'extras',
        'other_charges',
      ]),
      driver: _str(_pick(m, td, ['driver_name', 'driver'])),
      driverMobile: _str(
        _pick(m, td, ['driver_contact', 'driverMobile', 'driver_mobile']),
      ),
      vehicle: _str(
        _pick(m, td, ['vehicle_reg', 'vehicle_registration', 'vehicle']),
      ),
      leadSource: _str(_pick(m, td, ['lead_source', 'leadSource', 'source'])),
    );
  }

  factory InvoiceRecord.fromStandaloneMap(Map<String, dynamic> m) =>
      InvoiceRecord(
        id: 'nontrip:${m['id']}',
        number: '${m['invoice_number']}',
        customer: '${m['customer_name']}',
        status: 'issued',
        contact: _str(m['customer_contact']),
        tripDate: _date(m['invoice_date']),
        tripType: 'non_trip',
        fare: _num(m['total_fare']),
        toll: _num(m['invoice_toll']),
        bata: _num(m['invoice_bata']),
        fuel: _num(m['invoice_fuel']),
        parking: _num(m['invoice_parking']),
        extras: _num(m['invoice_extras']),
        isStandalone: true,
        description: _str(m['description']),
      );

  factory InvoiceRecord.newStandalone({DateTime? date}) => InvoiceRecord(
    id: '',
    number: 'New invoice',
    customer: '',
    status: 'draft',
    tripDate: date ?? DateTime.now(),
    tripType: 'non_trip',
    isStandalone: true,
  );

  String get route => isStandalone
      ? (description ?? 'Non-trip service')
      : '${pickup ?? '—'} → ${drop ?? '—'}';

  String get kmText =>
      km > 0 ? '${NumberFormat.decimalPattern('en_IN').format(km)} km' : '—';

  List<InvoiceLine> get lines => [
    InvoiceLine(
      isStandalone
          ? (description ?? 'Non-trip service')
          : 'Trip fare — ${pickup ?? '—'} to ${drop ?? '—'}${km > 0 ? ' (${km.round()} km)' : ''}',
      fare,
    ),
    if (toll > 0) InvoiceLine('Toll charges', toll),
    if (bata > 0) InvoiceLine('Driver bata', bata),
    if (fuel > 0) InvoiceLine('Fuel / petrol', fuel),
    if (parking > 0) InvoiceLine('Parking', parking),
    if (extras > 0) InvoiceLine('Other charges', extras),
  ];

  /// The web shows the booking fare as the amount due.
  double get total => fare;

  bool matches(String query) {
    final q = query.trim().toLowerCase();
    if (q.isEmpty) return true;
    return [
      number,
      customer,
      contact,
      pickup,
      drop,
      vehicle,
      driver,
      description,
    ].whereType<String>().any((s) => s.toLowerCase().contains(q));
  }
}

/// Business details printed on the invoice (settings.company_settings).
class InvoiceBusiness {
  const InvoiceBusiness({
    this.name = 'Sri Jayam Travels',
    this.phone = '+91 94423 37470',
    this.email = 'srijayamtravels1255@gmail.com',
    this.website = 'www.srijayamtravels.in',
    this.address =
        'No.4 Subburaya Pillai Street, Ariyakuppam, Puducherry – 605007',
    this.gstin,
    this.showGstin = false,
    this.currency = 'Rs.',
    this.footerText = 'Thank you for choosing Sri Jayam Travels!',
  });

  final String name;
  final String phone;
  final String email;
  final String website;
  final String address;
  final String? gstin;
  final bool showGstin;
  final String currency;
  final String footerText;

  /// [value] is the settings row's JSON; missing keys keep the defaults.
  factory InvoiceBusiness.fromSettings(Map<String, dynamic>? value) {
    const d = InvoiceBusiness();
    final biz = value?['biz'] is Map
        ? Map<String, dynamic>.from(value!['biz'] as Map)
        : const {};
    final inv = value?['invoice'] is Map
        ? Map<String, dynamic>.from(value!['invoice'] as Map)
        : const {};
    return InvoiceBusiness(
      name: _str(biz['name']) ?? d.name,
      phone: _str(biz['phone']) ?? d.phone,
      email: _str(biz['email']) ?? d.email,
      website: _str(biz['website']) ?? d.website,
      address: _str(biz['address']) ?? d.address,
      gstin: _str(biz['gstin']),
      showGstin: inv['showGSTIN'] == true,
      currency: _str(inv['currency']) ?? d.currency,
      footerText: _str(inv['footerText']) ?? d.footerText,
    );
  }

  String money(double amount) =>
      '$currency ${NumberFormat.decimalPattern('en_IN').format(amount.round())}';
}

/// The WhatsApp message the web sends from the invoice ("*Name*\nInvoice: …").
String invoiceShareText(InvoiceRecord i, InvoiceBusiness biz) {
  final date = i.tripDate == null
      ? '—'
      : DateFormat('d MMMM y').format(i.tripDate!);
  return '*${biz.name}*\n'
      'Invoice: ${i.number}\n'
      'Customer: ${i.customer}\n'
      'Date: $date\n'
      '${i.isStandalone ? i.description ?? 'Service' : '${i.pickup ?? '—'} → ${i.drop ?? '—'}'}\n'
      '${i.isStandalone ? '' : 'Distance: ${i.km > 0 ? i.km.round() : '—'} km\n'}'
      'Fare: ${biz.money(i.fare)}\n\n'
      '${biz.footerText}\n'
      '${biz.phone}';
}

// ── Amount in words (Indian system: crore / lakh / thousand) ────────────────
const _ones = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const _tens = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

String _two(int n) => n < 20
    ? _ones[n]
    : _tens[n ~/ 10] + (n % 10 > 0 ? ' ${_ones[n % 10]}' : '');

String _three(int n) {
  final h = n ~/ 100, r = n % 100;
  return (h > 0 ? '${_ones[h]} Hundred${r > 0 ? ' ' : ''}' : '') +
      (r > 0 ? _two(r) : '');
}

String amountInWords(num amount) {
  final n = amount.round();
  if (n <= 0) return 'Zero Rupees Only';
  final parts = [
    if (n ~/ 10000000 > 0) '${_three(n ~/ 10000000)} Crore',
    if (n % 10000000 ~/ 100000 > 0) '${_two(n % 10000000 ~/ 100000)} Lakh',
    if (n % 100000 ~/ 1000 > 0) '${_two(n % 100000 ~/ 1000)} Thousand',
    if (n % 1000 > 0) _three(n % 1000),
  ];
  return '${parts.join(' ')} Rupees Only';
}

/// Header cards on the list: same four numbers as the web.
class InvoiceSummary {
  const InvoiceSummary({
    required this.total,
    required this.count,
    required this.thisMonth,
  });
  final double total;
  final int count;
  final double thisMonth;
  double get average => count == 0 ? 0 : total / count;
}

InvoiceSummary summarizeInvoices(List<InvoiceRecord> list, DateTime now) {
  var total = 0.0, month = 0.0;
  for (final i in list) {
    total += i.fare;
    final d = i.tripDate;
    if (d != null && d.year == now.year && d.month == now.month) {
      month += i.fare;
    }
  }
  return InvoiceSummary(total: total, count: list.length, thisMonth: month);
}
