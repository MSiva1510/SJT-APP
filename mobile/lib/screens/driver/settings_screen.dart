// ─────────────────────────────────────────────────────────────────────────────
// settings_screen.dart
// Driver settings: appearance (theme mode), communication entry point,
// app info, and logout. Uses the existing auth logout flow — no duplicate
// session logic.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final currentMode = ref.watch(themeControllerProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Appearance ────────────────────────────────────────────────
          _SettingsSection(
            icon: Icons.palette_outlined,
            title: 'Appearance',
            children: [
              SegmentedButton<AppThemeMode>(
                segments: [
                  for (final mode in AppThemeMode.values)
                    ButtonSegment(
                      value: mode,
                      icon: Icon(switch (mode) {
                        AppThemeMode.system => Icons.brightness_auto_outlined,
                        AppThemeMode.light => Icons.light_mode_outlined,
                        AppThemeMode.dark => Icons.dark_mode_outlined,
                      }),
                      label: Text(mode.label),
                    ),
                ],
                selected: {currentMode},
                onSelectionChanged: (selection) {
                  final mode = selection.first;
                  ref.read(themeControllerProvider.notifier).setMode(mode);
                },
              ),
            ],
          ),
          const SizedBox(height: 12),

          // ── Notifications ─────────────────────────────────────────────
          Card(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: Icon(
                Icons.notifications_outlined,
                color: theme.colorScheme.primary,
              ),
              title: const Text('Notifications'),
              subtitle: const Text('Trip updates; WhatsApp is receive-only'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push(AppRoutes.driverNotifications),
            ),
          ),
          const SizedBox(height: 12),

          // ── About ──────────────────────────────────────────────────────
          _SettingsSection(
            icon: Icons.info_outline,
            title: 'About',
            children: [
              const _AboutRow('App', 'Sri Jayam Travels'),
              const _AboutRow('Version', '1.0.0'),
              const _AboutRow('Platform', 'Android'),
            ],
          ),
          const SizedBox(height: 24),

          // ── Logout ────────────────────────────────────────────────────
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context, ref),
              icon: const Icon(Icons.logout),
              label: const Text('Log Out'),
              style: OutlinedButton.styleFrom(
                foregroundColor: theme.colorScheme.error,
                side: BorderSide(color: theme.colorScheme.error),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log Out?'),
        content: const Text('You will return to the login screen.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log Out'),
          ),
        ],
      ),
    );
    if (ok == true) await ref.read(authProvider.notifier).logout();
  }
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

class _SettingsSection extends StatelessWidget {
  const _SettingsSection({
    required this.icon,
    required this.title,
    required this.children,
  });

  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: theme.colorScheme.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            ...children,
          ],
        ),
      ),
    );
  }
}

class _AboutRow extends StatelessWidget {
  const _AboutRow(this.label, this.value);
  final String label, value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(child: Text(value)),
        ],
      ),
    );
  }
}
