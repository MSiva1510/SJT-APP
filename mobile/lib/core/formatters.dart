// ─────────────────────────────────────────────────────────────────────────────
// formatters.dart — shared number/date formatting helpers.
// Single source of truth for currency and date patterns used across screens.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:intl/intl.dart';

final NumberFormat inr =
    NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
