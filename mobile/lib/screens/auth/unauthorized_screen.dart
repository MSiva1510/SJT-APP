// ─────────────────────────────────────────────────────────────────────────────
// unauthorized_screen.dart
// Shown when a non-driver account logs in, or role check fails.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/auth_provider.dart';
import '../../core/auth/auth_state.dart';

class UnauthorizedScreen extends ConsumerWidget {
  const UnauthorizedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final theme     = Theme.of(context);

    final detail = authState is AuthAuthenticated
        ? 'You are signed in as ${authState.profile.fullName} '
          '(${authState.profile.role}). '
          'This app is for drivers only.'
        : authState is AuthError
            ? authState.message
            : 'You do not have permission to access this app.';

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.no_accounts_rounded,
                  size:  80,
                  color: theme.colorScheme.error,
                ),
                const SizedBox(height: 24),
                Text(
                  'Access Denied',
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color:      theme.colorScheme.error,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  detail,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Please contact your administrator if you believe '
                  'this is a mistake.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 40),
                FilledButton.icon(
                  onPressed: () =>
                      ref.read(authProvider.notifier).logout(),
                  icon:  const Icon(Icons.logout),
                  label: const Text('Log Out'),
                  style: FilledButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                    foregroundColor: theme.colorScheme.onError,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 32, vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}