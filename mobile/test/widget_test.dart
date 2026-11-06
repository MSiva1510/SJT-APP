// ─────────────────────────────────────────────────────────────────────────────
// widget_test.dart
// Day 47 fix — the old test pumped SriJayamApp without a ProviderScope and
// without Supabase initialization, so it could never pass.
//
// With no stored session, restoreSession() returns AuthUnauthenticated and
// the router lands on LoginScreen with the app's branding.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/main.dart';

void main() {
  testWidgets('Sri Jayam Travels app starts and reaches the login screen', (
    WidgetTester tester,
  ) async {
    TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});

    await Supabase.initialize(
      url: 'https://example.supabase.co',
      publishableKey: 'test-anon-key',
      // Prevents GoTrue's periodic token-refresh Timer, which would stay
      // pending after tree disposal and fail the test invariant.
      authOptions: const FlutterAuthClientOptions(autoRefreshToken: false),
    );

    await tester.pumpWidget(const ProviderScope(child: SriJayamApp()));

    // Let session restore finish (no real network involved).
    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 1));

    expect(find.byKey(const ValueKey('brand-logo')), findsOneWidget);
    expect(find.text('Manager & Driver Portal'), findsOneWidget);
    expect(find.text('Explore demo (fake data)'), findsNothing);
  });
}
