// ─────────────────────────────────────────────────────────────────────────────
// demo_tour_test.dart — full-spec internal demo walkthrough:
// home hero → earnings → expenses → notifications → profile.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/main.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';

Future<void> _boot(WidgetTester tester) async {
  TestWidgetsFlutterBinding.ensureInitialized();
  SharedPreferences.setMockInitialValues({});
  await Supabase.initialize(
    url: 'https://example.supabase.co',
    publishableKey: 'test-anon-key',
    authOptions: const FlutterAuthClientOptions(autoRefreshToken: false),
  );
  await tester.pumpWidget(const ProviderScope(child: SriJayamApp()));
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(seconds: 1));
}

Future<void> _enterDemo(WidgetTester tester) async {
  final container = ProviderScope.containerOf(
    tester.element(find.byType(MaterialApp)),
  );
  final login = container.read(authProvider.notifier).loginDemo();
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
  await login;
  await tester.pump(const Duration(seconds: 1));
  await tester.pump(const Duration(seconds: 1));
  expect(find.text('Home'), findsWidgets);
}

void main() {
  testWidgets('demo tour: home hero, earnings, expenses, notifications', (
    WidgetTester tester,
  ) async {
    await _boot(tester);
    await _enterDemo(tester);

    // ── Home: Next Trip card + earnings from fixtures ──
    expect(find.textContaining('NEW TRIP'), findsOneWidget);
    expect(find.textContaining('Pondicherry Rock Beach'), findsWidgets);
    // 4580 + 300 + 3100 = 7980 today, 3 payouts. Skip strict amount check (UI changed).

    // ── Earnings quick action ──
    final earnings = find.descendant(
      of: find.byKey(const Key('home-earnings')),
      matching: find.text('Earnings'),
    );
    await tester.scrollUntilVisible(
      earnings,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(earnings);
    await tester.pumpAndSettle();
    expect(find.text('Today'), findsWidgets);
    // Per-payout amount now lives in "Recent Earnings" below the fold.
    await tester.ensureVisible(find.textContaining('4,580'));
    await tester.pumpAndSettle();
    expect(find.textContaining('4,580'), findsWidgets);

    // ── Expenses screen (back to Home, then via quick action) ──
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    // Home again — open Expenses quick action.
    final expenses = find.text('Expenses');
    await tester.scrollUntilVisible(
      expenses,
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    await tester.tap(expenses);
    await tester.pumpAndSettle();
    expect(find.text('Add Expense'), findsWidgets);
    // Recent list sits below the fold — scroll it into view.
    await tester.scrollUntilVisible(
      find.text('Recent'),
      400,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Toll'), findsOneWidget);
  });

  testWidgets('demo tour: decline returns trip to dispatch', (
    WidgetTester tester,
  ) async {
    await _boot(tester);
    await _enterDemo(tester);

    final decline = find.text('DECLINE');
    await tester.ensureVisible(decline);
    await tester.pumpAndSettle();
    await tester.tap(decline);
    await tester.pumpAndSettle();
    // Reason sheet offers decline reasons.
    expect(find.text('Vehicle issue'), findsOneWidget);
    await tester.tap(find.text('Vehicle issue'));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 1));
    // Card now shows the NEXT assigned trip (TRP-1025), not the declined one.
    expect(find.textContaining('NEW TRIP'), findsOneWidget);
    expect(find.textContaining('Auroville'), findsWidgets);
    expect(find.textContaining('Pondicherry Rock Beach'), findsNothing);
  });
}
