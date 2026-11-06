import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/services/receipt_ocr_service.dart';

void main() {
  test('parses a total amount with Indian digit grouping', () {
    expect(
      parseReceiptAmount(
        'Sub Total ₹ 1,234.50\nGrand Total\n₹ 1,23,456.50',
      ),
      123456.5,
    );
  });

  test('returns null when no labeled amount is present', () {
    expect(parseReceiptAmount('Date 01/05/2026\nPump 42'), isNull);
  });
}
