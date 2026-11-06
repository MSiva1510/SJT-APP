// ─────────────────────────────────────────────────────────────────────────────
// auth_errors.dart
// Translates raw Supabase / network exceptions into user-friendly messages.
//
// DAY 46 FIX: The "session/token/expired" keyword match was too broad —
// many generic Supabase error messages contain these words even for network
// failures, causing "Your session has expired" to appear when the real
// problem was "No internet connection".
// ─────────────────────────────────────────────────────────────────────────────

import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;
import '../auth/auth_state.dart';

class AuthErrorMapper {
  AuthErrorMapper._();

  static ({String message, AuthErrorCode code}) fromException(Object e) {
    if (e is AuthException) {
      return _fromAuthException(e);
    }

    final msg = e.toString().toLowerCase();

    // Network / connectivity — check before anything else.
    if (msg.contains('network')     ||
        msg.contains('socket')      ||
        msg.contains('connection')  ||
        msg.contains('timeout')     ||
        msg.contains('host lookup') ||
        msg.contains('no route')    ||
        msg.contains('unreachable') ||
        msg.contains('errno = 101') ||
        msg.contains('errno = 111')) {
      return (
        message: 'No internet connection. Please check your network.',
        code: AuthErrorCode.networkUnavailable,
      );
    }

    return (
      message: 'Something went wrong. Please try again.',
      code: AuthErrorCode.unknown,
    );
  }

  static ({String message, AuthErrorCode code}) _fromAuthException(
    AuthException e,
  ) {
    final msg = e.message.toLowerCase();

    if (msg.contains('invalid login') ||
        msg.contains('invalid credentials') ||
        msg.contains('wrong password') ||
        msg.contains('email not found') ||
        msg.contains('user not found')) {
      return (
        message: 'Incorrect email or password. Please try again.',
        code: AuthErrorCode.invalidCredentials,
      );
    }

    if (msg.contains('email not confirmed')) {
      return (
        message: 'Your email address has not been verified. '
            'Please check your inbox.',
        code: AuthErrorCode.emailNotConfirmed,
      );
    }

    // Only report "session expired" for SPECIFIC auth token expiry errors,
    // not for any message that merely contains the word "session" or "token".
    // This prevents network failures from being misreported as session expiry.
    if (msg == 'token has expired' ||
        msg == 'session has expired' ||
        msg.contains('refresh_token_not_found') ||
        msg.contains('jwt expired') ||
        (msg.contains('refresh') && msg.contains('expired'))) {
      return (
        message: 'Your session has expired. Please log in again.',
        code: AuthErrorCode.sessionExpired,
      );
    }

    if (msg.contains('network') || msg.contains('connection')) {
      return (
        message: 'Network error. Please check your connection.',
        code: AuthErrorCode.networkUnavailable,
      );
    }

    return (
      message: 'Authentication failed. Please try again.',
      code: AuthErrorCode.unknown,
    );
  }

  // ── Business-level errors ─────────────────────────────────────────────────

  static ({String message, AuthErrorCode code}) profileNotFound() => (
        message: 'Your account profile could not be found. '
            'Please contact your administrator.',
        code: AuthErrorCode.profileNotFound,
      );

  static ({String message, AuthErrorCode code}) driverNotFound() => (
        message: 'No driver record is linked to your account. '
            'Please contact your administrator.',
        code: AuthErrorCode.driverNotFound,
      );

  static ({String message, AuthErrorCode code}) unauthorizedRole(
      String role) => (
        message:
            'Access denied. This app is for drivers only. Your role is "$role".',
        code: AuthErrorCode.unauthorizedRole,
      );
}
