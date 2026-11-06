// ─────────────────────────────────────────────────────────────────────────────
// ui_audit_test.dart — programmatic UI audit.
// Renders every driver route in demo mode at a realistic phone size and
// collects framework errors (RenderFlex overflows etc.) via
// tester.takeException() instead of failing on the first one.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/main.dart';
import 'package:sri_jayam_travels_mobile/navigation/app_router.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';

const _routes = <String>[
  '/driver',
  '/driver/trips',
  '/driver/trips/demo-trip-1024',
  '/driver/trips/demo-trip-1024/map',
  '/driver/trips/demo-trip-1024/checklist',
  '/driver/trips/demo-trip-1019',
  '/driver/documents',
  '/driver/profile',
  '/driver/bookings',
  '/driver/bookings/FY26-APR-0006',
  '/driver/attendance',
  '/driver/attendance/history',
  '/driver/notifications',
  '/driver/messages',
  '/driver/settings',
  '/driver/earnings',
  '/driver/earnings/pending',
  '/driver/earnings/payouts',
  '/driver/expenses',
  '/driver/report-issue',
  '/driver/sos',
];

Future<void> _settle(
  WidgetTester tester, {
  String? route,
  List<String>? into,
}) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 150));
    if (route != null && into != null) _drain(tester, route, into);
  }
}

/// Drain every pending framework exception into [into].
void _drain(WidgetTester tester, String route, List<String> into) {
  for (var i = 0; i < 20; i++) {
    final ex = tester.takeException();
    if (ex == null) break;
    final lines = ex.toString().split('\n');
    final head = lines.first.trim();
    final locs = lines
        .where((line) => line.contains('.dart:'))
        .map((line) => line.trim())
        .take(3)
        .join(' , ');
    into.add('[$route] $head || $locs');
  }
}

const _w = int.fromEnvironment('AUDIT_W', defaultValue: 360);
const _h = int.fromEnvironment('AUDIT_H', defaultValue: 780);

void main() {
  testWidgets('UI audit: all driver routes @ ${_w}x$_h', (tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    tester.view.physicalSize = Size(_w * 3.0, _h * 3.0);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({});
    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
      authOptions: const FlutterAuthClientOptions(autoRefreshToken: false),
    );

    final collected = <String>[];

    await tester.pumpWidget(const ProviderScope(child: SriJayamApp()));
    await _settle(tester, route: '<boot>', into: collected);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(MaterialApp)),
    );
    final demoLogin = container.read(authProvider.notifier).loginDemo();
    await _settle(tester, route: '<demo-login>', into: collected);
    await demoLogin;
    final router = container.read(routerProvider);

    for (final route in _routes) {
      router.go(route);
      await _settle(tester, route: route, into: collected);
    }

    // ignore: avoid_print
    print('===RENDER-AUDIT-START===');
    if (collected.isEmpty) {
      // ignore: avoid_print
      print('CLEAN: no render errors across ${_routes.length} routes');
    } else {
      for (final e in collected) {
        // ignore: avoid_print
        print(e);
      }
    }
    // ignore: avoid_print
    print('===RENDER-AUDIT-END===');

    expect(
      collected,
      isEmpty,
      reason: 'Render errors found:\n${collected.join('\n')}',
    );
  });
}
