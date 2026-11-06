// ─────────────────────────────────────────────────────────────────────────────
// supabase_config.dart
// Single place for all Supabase connection constants.
// The anon key is intentionally a client-side publishable key — not a secret.
// Never put the service-role key here.
// ─────────────────────────────────────────────────────────────────────────────

class SupabaseConfig {
  SupabaseConfig._();

  static const String url = 'https://qxirmjvbufxxlkogelfj.supabase.co';

  /// Anon / publishable key. Safe to embed in mobile apps.
  /// Rotate this at: Supabase Dashboard → Settings → API → anon key.
  static const String anonKey =
      'sb_publishable_GwZ25Lwj--A-MtKRaxEbrg_De5mz6eE'; // replace after rotating

  // Table names — avoids magic strings scattered across the codebase
  static const String profilesTable = 'profiles';
  static const String driversTable = 'drivers';
  static const String bookingsTable = 'bookings';
  static const String tripsTable = 'trips';
  static const String attendanceTable = 'attendance';
  static const String tripPayslipsTable = 'trip_payslips';
  static const String settlementsTable = 'settlements';

  // GPS — shared with Web ERP (Day 47)
  static const String gpsTrackingTable = 'gps_tracking';

  // Driver documents — shared with Web ERP (Day 48)
  static const String documentsTable = 'documents';

  // Notifications — shared with Web ERP (user_id keyed)
  static const String notificationsTable = 'notifications';

  // Storage buckets
  static const String avatarsBucket = 'avatars';
  static const String documentsBucket = 'documents';
}
