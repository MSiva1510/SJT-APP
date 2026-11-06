// ─────────────────────────────────────────────────────────────────────────────
// auth_service.dart
// Business-logic layer. No UI code. No Supabase imports.
//
// DAY 46 FIX — Session expiry bug:
//   OLD (broken): if (session == null || session.isExpired) → log out
//   NEW (correct): if (session == null || user == null) → log out
//
//   session.isExpired checks the ACCESS TOKEN expiry (1 hour).
//   But the REFRESH TOKEN (valid 7 days) is stored by the Supabase SDK.
//   The SDK refreshes the access token automatically when we make an API call.
//   Checking isExpired before any API call bypassed this refresh mechanism,
//   causing the app to log users out every hour unnecessarily.
// ─────────────────────────────────────────────────────────────────────────────

import '../repositories/auth_repository.dart';
import '../core/auth/auth_state.dart';
import '../core/errors/auth_errors.dart';
import '../models/user_profile.dart';
import '../models/driver_profile.dart';

/// Roles allowed in the mobile driver app.
const _allowedRoles = {'driver', 'admin', 'manager'};

class AuthService {
  AuthService(this._repo);

  final AuthRepository _repo;

  // ── Login ─────────────────────────────────────────────────────────────────

  Future<AuthState> login({
    required String email,
    required String password,
  }) async {
    try {
      final response = await _repo.signIn(email: email, password: password);
      final user = response.user;
      if (user == null) {
        return const AuthError(
          message: 'Login failed. Please try again.',
          code: AuthErrorCode.unknown,
        );
      }
      return await _loadProfileAndDriver(userId: user.id, email: email);
    } catch (e) {
      final mapped = AuthErrorMapper.fromException(e);
      return AuthError(message: mapped.message, code: mapped.code);
    }
  }

  // ── Session restore ────────────────────────────────────────────────────────

  /// Called on app startup to restore an existing session.
  ///
  /// CRITICAL: Do NOT check session.isExpired here.
  /// The access token expires in 1 hour, but the Supabase SDK automatically
  /// refreshes it using the stored refresh token (valid for 7 days) the next
  /// time we make an API call. Checking isExpired before the API call prevents
  /// this auto-refresh, causing unnecessary logouts every hour.
  ///
  /// The correct check: does a session (with a user) exist at all?
  Future<AuthState> restoreSession() async {
    // ── Phase 1: check local session ─────────────────────────────────────
    final session = _repo.currentSession;
    final user    = _repo.currentUser;

    if (session == null || user == null) {
      // No session stored — user has never logged in or has logged out.
      return const AuthUnauthenticated();
    }

    // ── Phase 2: load profile (SDK will auto-refresh token if needed) ──
    try {
      return await _loadProfileAndDriver(
        userId: user.id,
        email:  user.email ?? '',
      );
    } catch (e) {
      return _classifyRestoreError(e);
    }
  }

  /// Distinguishes network failures from true auth failures on session restore.
  AuthState _classifyRestoreError(Object e) {
    final msg = e.toString().toLowerCase();

    // Network/connectivity — session may still be valid; don't log out.
    if (msg.contains('network')     ||
        msg.contains('socket')      ||
        msg.contains('connection')  ||
        msg.contains('timeout')     ||
        msg.contains('host lookup') ||
        msg.contains('no route')    ||
        msg.contains('unreachable')) {
      return const AuthError(
        message:
            'No internet connection. Please check your network and try again.',
        code: AuthErrorCode.networkUnavailable,
      );
    }

    // True auth failure (refresh token expired, revoked, etc.) — log out.
    return const AuthUnauthenticated();
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  Future<void> logout() => _repo.signOut();

  // ── Password reset ────────────────────────────────────────────────────────

  Future<String?> sendPasswordReset(String email) async {
    try {
      await _repo.resetPassword(email);
      return null;
    } catch (e) {
      return AuthErrorMapper.fromException(e).message;
    }
  }

  // ── Profile refresh ───────────────────────────────────────────────────────

  Future<AuthState> refreshProfile({
    required String userId,
    required String email,
  }) =>
      _loadProfileAndDriver(userId: userId, email: email);

  // ── Internal ─────────────────────────────────────────────────────────────

  Future<AuthState> _loadProfileAndDriver({
    required String userId,
    required String email,
  }) async {
    final UserProfile? profile = await _repo.getUserProfile(userId);
    if (profile == null) {
      final err = AuthErrorMapper.profileNotFound();
      return AuthError(message: err.message, code: err.code);
    }

    if (!_allowedRoles.contains(profile.role)) {
      final err = AuthErrorMapper.unauthorizedRole(profile.role);
      return AuthError(message: err.message, code: err.code);
    }

    final DriverProfile? driver = await _repo.getDriverProfile(
      userId: userId,
      email:  profile.email,
    );
    if (driver == null) {
      final err = AuthErrorMapper.driverNotFound();
      return AuthError(message: err.message, code: err.code);
    }

    return AuthAuthenticated(profile: profile, driverProfile: driver);
  }

  bool get hasSession => _repo.currentSession != null;
}
