// ─────────────────────────────────────────────────────────────────────────────
// driver_profile_screen.dart
// Displays all available driver fields from the live Supabase schema.
// No fake/hardcoded data — empty fields show a placeholder.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../models/driver_profile.dart';
import '../../navigation/app_router.dart';
import '../../providers/auth_provider.dart';
import '../../providers/trip_provider.dart';

class DriverProfileScreen extends ConsumerWidget {
  const DriverProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final driver = ref.watch(currentDriverProvider);
    final profile = ref.watch(currentProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My Profile')),
      body: driver == null
          ? _buildEmpty(context, profile?.fullName)
          : _buildProfile(context, ref, driver),
    );
  }

  // ── Profile loaded ────────────────────────────────────────────────────────

  Widget _buildProfile(BuildContext context, WidgetRef ref, DriverProfile d) {
    return RefreshIndicator(
      onRefresh: () => ref.read(authProvider.notifier).refreshProfile(),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Wireframe header: avatar, name, online pill, stats ───
          _ProfileHero(driver: d, ref: ref),
          const SizedBox(height: 12),

          // ── Wireframe menu ───────────────────────────────────────
          _MenuCard(
            icon: Icons.savings_outlined,
            label: 'My earnings',
            onTap: () => context.push(AppRoutes.driverEarnings),
          ),
          _MenuCard(
            icon: Icons.folder_outlined,
            label: 'Documents',
            onTap: () => context.push(AppRoutes.driverDocuments),
          ),
          const SizedBox(height: 20),

          // ── Personal info ────────────────────────────────────────
          _Section(
            title: 'Personal Information',
            icon: Icons.person_outline,
            children: [
              _Field(label: 'Full Name', value: d.name),
              _Field(label: 'Email', value: d.email),
              _Field(label: 'Phone', value: d.phone),
              _Field(label: 'Driver ID', value: d.driverId),
              _Field(label: 'Address', value: d.address),
              _Field(label: 'City', value: d.city),
              _Field(
                label: 'Date of Birth',
                value: d.dateOfBirth != null ? _fmt(d.dateOfBirth!) : null,
              ),
              _Field(
                label: 'Joined',
                value: d.joinedDate != null ? _fmt(d.joinedDate!) : null,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ── License ──────────────────────────────────────────────────────
          _Section(
            title: 'License',
            icon: Icons.badge_outlined,
            children: [
              _Field(label: 'License No.', value: d.licenseNumber),
              _Field(
                label: 'Expiry',
                value: d.licenseExpiry != null ? _fmt(d.licenseExpiry!) : null,
                warning: d.isLicenseExpired
                    ? 'EXPIRED'
                    : d.isLicenseExpiringSoon
                    ? 'Expires soon'
                    : null,
              ),
              _Field(label: 'Aadhar No.', value: d.aadharNumber),
            ],
          ),
          const SizedBox(height: 16),

          // ── Emergency contact ─────────────────────────────────────────────
          _Section(
            title: 'Emergency Contact',
            icon: Icons.emergency_outlined,
            children: [
              _Field(label: 'Name', value: d.emergencyContact),
              _Field(label: 'Phone', value: d.emergencyPhone),
            ],
          ),
          const SizedBox(height: 16),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  Widget _buildEmpty(BuildContext context, String? name) {
    final theme = Theme.of(context);
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.person_off_outlined,
            size: 64,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(height: 16),
          Text(
            name != null ? 'Hello, $name' : 'Profile',
            style: theme.textTheme.headlineSmall,
          ),
          const SizedBox(height: 8),
          Text(
            'No driver record is linked to your account.\n'
            'Please contact your administrator.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  static String _fmt(DateTime dt) => DateFormat('dd MMM yyyy').format(dt);
}

// ── Sub-widgets ───────────────────────────────────────────────────────────────

// ── Sub-widgets ───────────────────────────────────────────────────────────────

// ── Wireframe hero: avatar, name, online pill, live stats ─────────────
class _ProfileHero extends ConsumerWidget {
  const _ProfileHero({required this.driver, required this.ref});
  final DriverProfile driver;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final tripsAsync = ref.watch(allDriverTripsProvider);
    final tripCount = switch (tripsAsync) {
      TripListLoaded(:final trips) => '${trips.length}',
      _ => '–',
    };
    var years = '–';
    if (driver.joinedDate != null) {
      final y = DateTime.now().difference(driver.joinedDate!).inDays ~/ 365;
      years = y <= 0 ? '<1 yr' : '$y yr${y == 1 ? '' : 's'}';
    }
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
        child: Column(
          children: [
            CircleAvatar(
              radius: 36,
              backgroundColor: theme.colorScheme.primary,
              child: driver.displayPhotoUrl == null
                  ? Text(
                      driver.initials,
                      style: const TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    )
                  : ClipOval(
                      child: Image.network(
                        driver.displayPhotoUrl!,
                        width: 72,
                        height: 72,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Center(
                          child: Text(
                            driver.initials,
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ),
                    ),
            ),
            const SizedBox(height: 10),
            Text(
              driver.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              driver.driverId != null
                  ? 'Driver · ID ${driver.driverId}'
                  : 'Driver',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.green.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    driver.status == 'active'
                        ? 'Online'
                        : (driver.status ?? 'Online'),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.green.shade800,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _HeroStat(
                    value:
                        (driver.status ?? 'Active')[0].toUpperCase() +
                        (driver.status ?? 'Active').substring(1),
                    label: 'Status',
                  ),
                ),
                Expanded(
                  child: _HeroStat(value: tripCount, label: 'Trips'),
                ),
                Expanded(
                  child: _HeroStat(value: years, label: 'With us'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroStat extends StatelessWidget {
  const _HeroStat({required this.value, required this.label});
  final String value, label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              value,
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: theme.colorScheme.primary,
              ),
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

// ── Wireframe menu card ───────────────────────────────────────────────
class _MenuCard extends StatelessWidget {
  const _MenuCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon, color: theme.colorScheme.primary),
        title: Center(
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
        ),
        trailing: Icon(
          Icons.chevron_right,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        onTap: onTap,
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.icon,
    required this.children,
  });
  final String title;
  final IconData icon;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    // Filter out fields with no value
    final visible = children
        .whereType<_Field>()
        .where((f) => f.value != null || f.warning != null)
        .toList();

    if (visible.isEmpty) return const SizedBox.shrink();

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
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: theme.colorScheme.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            ...visible,
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.value, this.warning});
  final String label;
  final String? value;
  final String? warning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 88,
            child: Text(
              label,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value ?? '—',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (warning != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.errorContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                warning!,
                style: TextStyle(
                  fontSize: 11,
                  color: theme.colorScheme.onErrorContainer,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
