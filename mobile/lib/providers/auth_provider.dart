// ─────────────────────────────────────────────────────────────────────────────
// auth_provider.dart  — Day 46 (improved session restore + event handling)
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import '../core/auth/auth_state.dart';
import '../core/demo/demo_session.dart';
import '../repositories/auth_repository.dart';
import '../services/auth_service.dart';

// ── Singleton providers ───────────────────────────────────────────────────────

final supabaseClientProvider = Provider<SupabaseClient>(
  (ref) => Supabase.instance.client,
);

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(supabaseClientProvider)),
);

final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(ref.watch(authRepositoryProvider)),
);

// ── Auth notifier ─────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._service, this._repo) : super(const AuthInitializing()) {
    _init();
  }

  final AuthService    _service;
  final AuthRepository _repo;
  StreamSubscription<AuthChangeEvent>? _authSub;

  // ── Startup ──────────────────────────────────────────────────────────────

  Future<void> _init() async {
    // Set up listener BEFORE checking session to avoid missing events
    _authSub = _repo.rawAuthEvents.listen(_onAuthEvent);

    // Restore existing session (fixed: no longer checks session.isExpired)
    state = const AuthLoadingProfile();
    state = await _service.restoreSession();
  }

  void _onAuthEvent(AuthChangeEvent event) {
    switch (event) {
      case AuthChangeEvent.tokenRefreshed:
        // SDK refreshed the access token — no action needed; state is valid
        break;

      case AuthChangeEvent.signedOut:
        // Externally signed out (another device / token revoked by server)
        if (state is! AuthUnauthenticated) {
          state = const AuthUnauthenticated();
        }
        break;

      case AuthChangeEvent.signedIn:
        // Fired after a successful sign-in or session restore by the SDK.
        // We handle this via restoreSession() on startup, so no action here
        // unless we're currently in an error state.
        if (state is AuthError) {
          final err = state as AuthError;
          if (err.code == AuthErrorCode.networkUnavailable) {
            // Network came back — retry restoring session
            _retryRestore();
          }
        }
        break;

      default:
        break;
    }
  }

  Future<void> _retryRestore() async {
    state = const AuthLoadingProfile();
    state = await _service.restoreSession();
  }

  // ── Public actions ────────────────────────────────────────────────────────

  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = const AuthAuthenticating();
    final next = await _service.login(email: email, password: password);
    state = next;
  }

  /// Internal offline demo session with in-memory fixtures and no network.
  /// The production login screen does not expose demo data.
  Future<void> loginDemo() async {
    state = const AuthAuthenticating();
    await Future.delayed(const Duration(milliseconds: 500));
    DemoSession.enter();
    state = AuthAuthenticated(
      profile: DemoSession.profile,
      driverProfile: DemoSession.driver,
    );
  }

  Future<void> logout() async {
    DemoSession.exit();
    try {
      await _service.logout();
    } catch (_) {
      // Always navigate to login even if the sign-out API call fails
    }
    state = const AuthUnauthenticated();
  }

  Future<void> refreshProfile() async {
    final current = state;
    if (current is! AuthAuthenticated) return;
    state = const AuthLoadingProfile();
    state = await _service.refreshProfile(
      userId: current.profile.id,
      email:  current.profile.email,
    );
  }

  /// Called from the "Retry" button on the no-connection screen.
  Future<void> retryConnection() => _retryRestore();

  // ── Dispose ───────────────────────────────────────────────────────────────

  @override
  void dispose() {
    _authSub?.cancel();
    super.dispose();
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(
    ref.watch(authServiceProvider),
    ref.watch(authRepositoryProvider),
  );
});

// ── Convenience selectors ─────────────────────────────────────────────────────

final isAuthenticatedProvider = Provider<bool>(
  (ref) => ref.watch(authProvider) is AuthAuthenticated,
);

final currentProfileProvider = Provider((ref) {
  final s = ref.watch(authProvider);
  return s is AuthAuthenticated ? s.profile : null;
});

final currentDriverProvider = Provider((ref) {
  final s = ref.watch(authProvider);
  return s is AuthAuthenticated ? s.driverProfile : null;
});
