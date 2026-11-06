// ─────────────────────────────────────────────────────────────────────────────
// auth_repository.dart
// ONLY layer that touches Supabase directly for auth + profiles.
// No UI code. No business logic. Returns raw data or throws.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../core/config/supabase_config.dart';
import '../models/user_profile.dart';
import '../models/driver_profile.dart';

class AuthRepository {
  AuthRepository(this._supabase);

  final SupabaseClient _supabase;

  // ── Auth ──────────────────────────────────────────────────────────────────

  /// Sign in with email + password.
  Future<AuthResponse> signIn({
    required String email,
    required String password,
  }) =>
      _supabase.auth.signInWithPassword(
        email:    email.trim().toLowerCase(),
        password: password,
      );

  /// Sign out from Supabase.
  Future<void> signOut() => _supabase.auth.signOut();

  /// Current Supabase session (null if not logged in).
  Session? get currentSession => _supabase.auth.currentSession;

  /// Current Supabase user (null if not logged in).
  User? get currentUser => _supabase.auth.currentUser;

  /// Low-level stream of auth change events (token refresh, sign-out, etc.)
  Stream<AuthChangeEvent> get rawAuthEvents =>
      _supabase.auth.onAuthStateChange.map((e) => e.event);

  /// Send a password-reset email.
  Future<void> resetPassword(String email) =>
      _supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());

  // ── Profiles ──────────────────────────────────────────────────────────────

  /// Fetch the `profiles` row for [userId] (= auth.uid()).
  Future<UserProfile?> getUserProfile(String userId) async {
    final data = await _supabase
        .from(SupabaseConfig.profilesTable)
        .select('id, email, full_name, role')
        .eq('id', userId)
        .maybeSingle();

    if (data == null) return null;
    return UserProfile.fromMap(data);
  }

  // ── Drivers ───────────────────────────────────────────────────────────────

  /// Fetch the `drivers` row for the logged-in user.
  ///
  /// 1. Fast path  — profile_id FK (added in Day 42 migration)
  /// 2. Fallback   — email match (for legacy rows)
  Future<DriverProfile?> getDriverProfile({
    required String userId,
    required String email,
  }) async {
    // Fast path via profile_id
    final byProfileId = await _supabase
        .from(SupabaseConfig.driversTable)
        .select()
        .eq('profile_id', userId)
        .maybeSingle();

    if (byProfileId != null) return DriverProfile.fromMap(byProfileId);

    // Fallback via email
    final byEmail = await _supabase
        .from(SupabaseConfig.driversTable)
        .select()
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

    if (byEmail != null) {
      _backFillProfileId(
        driverId: byEmail['id'] as String,
        userId:   userId,
      );
      return DriverProfile.fromMap(byEmail);
    }

    return null;
  }

  /// Silently write profile_id — fire-and-forget.
  void _backFillProfileId({
    required String driverId,
    required String userId,
  }) {
    _supabase
        .from(SupabaseConfig.driversTable)
        .update({'profile_id': userId})
        .eq('id', driverId)
        .then((_) {})
        .catchError((_) {});
  }
}