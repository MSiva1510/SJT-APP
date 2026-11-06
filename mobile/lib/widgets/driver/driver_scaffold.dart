// ─────────────────────────────────────────────────────────────────────────────
// driver_scaffold.dart — bottom tab frame for the driver screens.
// Tabs: Home · Trips · Earnings · Docs · Profile.
// Detail/pushed screens (trip details, expenses, attendance…) render above
// the tabs, without the bar — also per wireframe.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../navigation/app_router.dart';

class DriverTabScaffold extends StatelessWidget {
  const DriverTabScaffold({
    super.key,
    required this.child,
    required this.location,
  });

  final Widget child;
  final String location;

  static const _tabs = [
    (
      route: AppRoutes.driverHome,
      label: 'Home',
      icon: Icons.home_outlined,
      activeIcon: Icons.home,
    ),
    (
      route: AppRoutes.driverTrips,
      label: 'Trips',
      icon: Icons.route_outlined,
      activeIcon: Icons.route,
    ),
    (
      route: AppRoutes.driverDocuments,
      label: 'Docs',
      icon: Icons.description_outlined,
      activeIcon: Icons.description,
    ),
    (
      route: AppRoutes.driverProfile,
      label: 'Profile',
      icon: Icons.person_outline,
      activeIcon: Icons.person,
    ),
  ];

  int _indexFor(String loc) {
    // Longest-prefix match so future nested tab routes keep their tab lit.
    var best = 0;
    var bestLen = -1;
    for (var i = 0; i < _tabs.length; i++) {
      final r = _tabs[i].route;
      if ((loc == r || loc.startsWith('$r/')) && r.length > bestLen) {
        best = i;
        bestLen = r.length;
      }
    }
    return best;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final current = _indexFor(location);
    final active = theme.colorScheme.primary;
    final idle = theme.colorScheme.onSurfaceVariant;
    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerLowest.withValues(
            alpha: 0.94,
          ),
          border: Border(
            top: BorderSide(
              color: theme.colorScheme.outlineVariant,
              width: 0.5,
            ),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 8, 6, 8),
            child: Row(
              children: [
                for (var i = 0; i < _tabs.length; i++)
                  Expanded(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(10),
                      onTap: () {
                        if (i != current) context.go(_tabs[i].route);
                      },
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              i == current
                                  ? _tabs[i].activeIcon
                                  : _tabs[i].icon,
                              color: i == current ? active : idle,
                              size: 24,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _tabs[i].label,
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w500,
                                color: i == current ? active : idle,
                              ),
                            ),
                          ],
                        ),
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
