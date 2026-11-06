// ─────────────────────────────────────────────────────────────────────────────
// driver_alert.dart — an SOS or vehicle-issue report raised by the driver.
// Sent through the Supabase RPC public.driver_raise_alert, which stores it in
// public.fleet_alerts (web dashboard) and notifies admins/managers. The server
// resolves the driver from the session and derives vehicle + trip number from
// the booking, so the app only sends what the driver actually entered.
// ─────────────────────────────────────────────────────────────────────────────

import 'gps_position.dart';

enum DriverAlertType {
  sos('sos'),
  vehicleIssue('vehicle_issue');

  const DriverAlertType(this.wire);
  final String wire;
}

class DriverAlertRequest {
  const DriverAlertRequest({
    required this.type,
    this.category,
    this.description,
    this.bookingId,
    this.location,
    this.photoUrl,
  });

  /// Server-side cap on description length (see migration).
  static const maxDescriptionLength = 2000;

  final DriverAlertType type;
  final String? category;
  final String? description;

  /// bookings.id of the active trip, when there is one.
  final String? bookingId;
  final GpsPosition? location;
  final String? photoUrl;

  /// Parameters for `rpc('driver_raise_alert', params: …)`.
  Map<String, dynamic> toRpcParams() {
    String? clean(String? s) {
      final t = s?.trim() ?? '';
      return t.isEmpty ? null : t;
    }

    var desc = clean(description);
    if (desc != null && desc.length > maxDescriptionLength) {
      desc = desc.substring(0, maxDescriptionLength);
    }
    final loc = location;
    return {
      'p_alert_type': type.wire,
      'p_category': clean(category),
      'p_description': desc,
      'p_booking_id': clean(bookingId),
      'p_latitude': loc?.latitude,
      'p_longitude': loc?.longitude,
      'p_accuracy': loc?.accuracy,
      'p_photo_url': clean(photoUrl),
    };
  }
}
