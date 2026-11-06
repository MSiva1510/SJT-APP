// ─────────────────────────────────────────────────────────────────────────────
// manager_scaffold.dart — bottom tab frame for the manager mode
// (admin / manager accounts). Tabs: Home · Trips · Fleet · More.
// Same bar styling as DriverTabScaffold so both modes feel like one app.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../navigation/app_router.dart';

class ManagerTabScaffold extends StatelessWidget {
  const ManagerTabScaffold({
    super.key,
    required this.child,
    required this.location,
  });

  final Widget child;
  final String location;

  static const _tabs = [
    (
      route: AppRoutes.managerHome,
      label: 'Home',
      icon: Icons.space_dashboard_outlined,
      activeIcon: Icons.space_dashboard,
    ),
    (
      route: AppRoutes.managerTrips,
      label: 'Trips',
      icon: Icons.route_outlined,
      activeIcon: Icons.route,
    ),
    (
      route: AppRoutes.managerFleet,
      label: 'Fleet',
      icon: Icons.map_outlined,
      activeIcon: Icons.map,
    ),
    (
      route: AppRoutes.managerMore,
      label: 'More',
      icon: Icons.more_horiz,
      activeIcon: Icons.more_horiz,
    ),
  ];

  int _indexFor(String loc) {
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
                    child: Semantics(
                      selected: i == current,
                      button: true,
                      label: _tabs[i].label,
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
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                  color: i == current ? active : idle,
                                ),
                              ),
                            ],
                          ),
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
