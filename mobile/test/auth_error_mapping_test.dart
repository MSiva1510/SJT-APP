// ─────────────────────────────────────────────────────────────────────────────
// auth_error_mapping_test.dart
// Verifies friendly error mapping: network failures must NEVER be reported
// as "session expired" (the Day 46 regression), and true token expiry must be.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_test/flutter_test.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/core/auth/auth_state.dart';
import 'package:sri_jayam_travels_mobile/core/errors/auth_errors.dart';

void main() {
  group('AuthErrorMapper — network vs session (Day 46 regression guard)', () {
    test('socket failure maps to networkUnavailable, NOT sessionExpired', () {
      final r = AuthErrorMapper.fromException(
        Exception('SocketException: Failed host lookup (errno = 101)'),
      );
      expect(r.code, AuthErrorCode.networkUnavailable);
      expect(r.message.toLowerCase(), contains('internet'));
    });

    test('timeout maps to networkUnavailable', () {
      final r = AuthErrorMapper.fromException(Exception('Connection timeout'));
      expect(r.code, AuthErrorCode.networkUnavailable);
    });

    test('generic message containing the word "session" stays unknown', () {
      // A DB/policy error mentioning "session" must not become expiry.
      final r = AuthErrorMapper.fromException(
        Exception('new row violates row-level security policy for "sessions"'),
      );
      expect(r.code, isNot(AuthErrorCode.sessionExpired));
    });

    test('exact token expiry maps to sessionExpired', () {
      final r = AuthErrorMapper.fromException(
        AuthException('token has expired', statusCode: '400'),
      );
      expect(r.code, AuthErrorCode.sessionExpired);
    });

    test('refresh_token_not_found maps to sessionExpired', () {
      final r = AuthErrorMapper.fromException(
        const AuthException('Invalid refresh_token_not_found grant'),
      );
      expect(r.code, AuthErrorCode.sessionExpired);
    });

    test('invalid credentials map correctly', () {
      final r = AuthErrorMapper.fromException(
        const AuthException('Invalid login credentials'),
      );
      expect(r.code, AuthErrorCode.invalidCredentials);
    });
  });
}
