// ─────────────────────────────────────────────────────────────────────────────
// auth_state.dart
// Sealed class covering every step of the auth lifecycle.
// Keep this PURE DATA — no UI, no service calls.
// ─────────────────────────────────────────────────────────────────────────────

import '../../models/user_profile.dart';
import '../../models/driver_profile.dart';

sealed class AuthState {
  const AuthState();
}

/// App just launched — checking for an existing session.
class AuthInitializing extends AuthState {
  const AuthInitializing();
}

/// No session / user has logged out.
class AuthUnauthenticated extends AuthState {
  const AuthUnauthenticated();
}

/// Credentials submitted, waiting for Supabase response.
class AuthAuthenticating extends AuthState {
  const AuthAuthenticating();
}

/// Supabase auth succeeded — now fetching profile + driver record.
class AuthLoadingProfile extends AuthState {
  const AuthLoadingProfile();
}

/// Fully authenticated with profile and (optionally) driver record loaded.
class AuthAuthenticated extends AuthState {
  final UserProfile  profile;
  final DriverProfile? driverProfile;

  const AuthAuthenticated({
    required this.profile,
    this.driverProfile,
  });

  AuthAuthenticated copyWith({
    UserProfile?   profile,
    DriverProfile? driverProfile,
  }) =>
      AuthAuthenticated(
        profile:       profile       ?? this.profile,
        driverProfile: driverProfile ?? this.driverProfile,
      );
}

/// Something went wrong. [message] is user-friendly (no raw Supabase errors).
class AuthError extends AuthState {
  final String message;
  final AuthErrorCode code;

  const AuthError({
    required this.message,
    this.code = AuthErrorCode.unknown,
  });
}

enum AuthErrorCode {
  invalidCredentials,
  emailNotConfirmed,
  networkUnavailable,
  sessionExpired,
  profileNotFound,
  driverNotFound,
  unauthorizedRole,
  unknown,
}