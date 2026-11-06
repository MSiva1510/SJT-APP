// ─────────────────────────────────────────────────────────────────────────────
// demo_mode_test.dart — internal offline demo flow:
// fixture session → Home hero → ACCEPT → trip details.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/main.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';

void main() {
  testWidgets('demo mode: login, hero, accept navigation',
      (WidgetTester tester) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});

    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
      authOptions: const FlutterAuthClientOptions(
        autoRefreshToken: false,
      ),
    );

    await tester.pumpWidget(
      const ProviderScope(child: SriJayamApp()),
    );
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    expect(find.text('Explore demo (fake data)'), findsNothing);

    final container = ProviderScope.containerOf(
      tester.element(find.byType(MaterialApp)),
    );
    final login = container.read(authProvider.notifier).loginDemo();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
    await login;
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    // Home: greeting + NEW TRIP hero + earnings from fixtures.
    expect(find.text('Home'), findsWidgets);
    expect(find.textContaining('NEW TRIP'), findsOneWidget);
    expect(find.textContaining('Pondicherry Rock Beach'), findsWidgets);

    // ACCEPT → trip details screen for TRP-1024.
    await tester.tap(find.text('ACCEPT'));
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));
    expect(find.textContaining('Arun Kumar'), findsWidgets);
  });
}
