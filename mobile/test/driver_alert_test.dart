// ─────────────────────────────────────────────────────────────────────────────
// driver_alert_test.dart — SOS + vehicle-issue delivery to the office.
// Unit: DriverAlertRequest → RPC params. Widget: both screens hand the right
// request to AlertRepository, confirm only on success, and keep the driver
// on the screen (with CALL OPS for SOS) when delivery fails.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState;

import 'package:sri_jayam_travels_mobile/main.dart';
import 'package:sri_jayam_travels_mobile/models/driver_alert.dart';
import 'package:sri_jayam_travels_mobile/models/gps_position.dart';
import 'package:sri_jayam_travels_mobile/navigation/app_router.dart';
import 'package:sri_jayam_travels_mobile/providers/alert_provider.dart';
import 'package:sri_jayam_travels_mobile/providers/auth_provider.dart';
import 'package:sri_jayam_travels_mobile/repositories/alert_repository.dart';
import 'package:sri_jayam_travels_mobile/widgets/driver/sos_action.dart';

class FakeAlertRepository implements AlertRepository {
  final requests = <DriverAlertRequest>[];
  final uploads = <String>[];
  AlertException? failWith;

  @override
  Future<String> raiseAlert(DriverAlertRequest request) async {
    requests.add(request);
    if (failWith != null) throw failWith!;
    return 'alert-${requests.length}';
  }

  @override
  Future<String?> uploadIssuePhoto(String localPath) async {
    uploads.add(localPath);
    return null;
  }
}

Future<void> _pumpFor(WidgetTester tester, Duration total) async {
  const step = Duration(milliseconds: 100);
  for (var t = Duration.zero; t < total; t += step) {
    await tester.pump(step);
  }
}

/// Boots the real app in demo mode with [repo] in place of Supabase delivery.
Future<GoRouterLike> _bootDemo(
  WidgetTester tester,
  FakeAlertRepository repo,
) async {
  tester.view.physicalSize = const Size(1080, 2340);
  tester.view.devicePixelRatio = 3.0;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [alertRepositoryProvider.overrideWithValue(repo)],
      child: const SriJayamApp(),
    ),
  );
  await _pumpFor(tester, const Duration(seconds: 2));
  final container = ProviderScope.containerOf(
    tester.element(find.byType(MaterialApp)),
  );
  final login = container.read(authProvider.notifier).loginDemo();
  await _pumpFor(tester, const Duration(milliseconds: 600));
  await login;
  await _pumpFor(tester, const Duration(seconds: 3));

  return GoRouterLike(container.read(routerProvider));
}

/// Thin wrapper so tests read naturally.
class GoRouterLike {
  GoRouterLike(this._router);
  final dynamic _router;
  void go(String route) => _router.go(route);
  void push(String route) => _router.push(route);
}

final _dialogSendSos = find.descendant(
  of: find.byType(AlertDialog),
  matching: find.text('SEND SOS'),
);

Future<void> _holdSos(WidgetTester tester) async {
  final gesture = await tester.startGesture(
    tester.getCenter(find.text('Hold 3s')),
  );
  await _pumpFor(tester, const Duration(milliseconds: 3600));
  await gesture.up();
  await _pumpFor(tester, const Duration(milliseconds: 400));
}

void main() {
  group('DriverAlertRequest.toRpcParams', () {
    test('SOS sends type + location, nulls for blanks', () {
      final p = DriverAlertRequest(
        type: DriverAlertType.sos,
        bookingId: '  ',
        location: GpsPosition(
          latitude: 13.0827,
          longitude: 80.2707,
          accuracy: 9,
          speed: 0,
          timestamp: DateTime(2026, 10, 27),
        ),
      ).toRpcParams();

      expect(p['p_alert_type'], 'sos');
      expect(p['p_booking_id'], isNull);
      expect(p['p_category'], isNull);
      expect(p['p_latitude'], 13.0827);
      expect(p['p_longitude'], 80.2707);
      expect(p['p_accuracy'], 9);
      expect(
        p.keys,
        containsAll(<String>[
          'p_alert_type',
          'p_category',
          'p_description',
          'p_booking_id',
          'p_latitude',
          'p_longitude',
          'p_accuracy',
          'p_photo_url',
        ]),
      );
    });

    test('vehicle issue trims text and caps description length', () {
      final p = DriverAlertRequest(
        type: DriverAlertType.vehicleIssue,
        category: ' Flat Tire / Puncture ',
        description: ' ${'x' * 2500} ',
        bookingId: ' bk-1 ',
        photoUrl: '',
      ).toRpcParams();

      expect(p['p_alert_type'], 'vehicle_issue');
      expect(p['p_category'], 'Flat Tire / Puncture');
      expect(
        (p['p_description'] as String).length,
        DriverAlertRequest.maxDescriptionLength,
      );
      expect(p['p_booking_id'], 'bk-1');
      expect(p['p_photo_url'], isNull);
      expect(p['p_latitude'], isNull);
    });
  });

  group('screens deliver through AlertRepository', () {
    setUpAll(() async {
      TestWidgetsFlutterBinding.ensureInitialized();
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
        authOptions: const FlutterAuthClientOptions(autoRefreshToken: false),
      );
    });

    testWidgets('home SOS button opens the full emergency flow', (
      tester,
    ) async {
      final router = GoRouter(
        routes: [
          GoRoute(
            path: '/',
            builder: (_, __) => const Scaffold(body: SosButton()),
          ),
          GoRoute(
            path: AppRoutes.sosEmergency,
            builder: (_, __) => const Scaffold(body: Text('SOS Emergency')),
          ),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));

      await tester.tap(find.widgetWithText(FilledButton, 'SOS'));
      await tester.pumpAndSettle();

      expect(find.text('SOS Emergency'), findsOneWidget);
    });

    testWidgets('SOS: hold + confirm raises an sos alert', (tester) async {
      final repo = FakeAlertRepository();
      final router = await _bootDemo(tester, repo);
      router.push('/driver/sos');
      await _pumpFor(tester, const Duration(seconds: 1));

      await _holdSos(tester);
      expect(find.text('Confirm Emergency'), findsOneWidget);
      await tester.tap(_dialogSendSos);
      await _pumpFor(tester, const Duration(milliseconds: 500));

      expect(repo.requests, hasLength(1));
      expect(repo.requests.single.type, DriverAlertType.sos);
      expect(find.textContaining('SOS not actually sent'), findsOneWidget);
    });

    testWidgets('SOS: delivery failure offers CALL OPS', (tester) async {
      final repo = FakeAlertRepository()
        ..failWith = const AlertException('Could not reach the office.');
      final router = await _bootDemo(tester, repo);
      router.push('/driver/sos');
      await _pumpFor(tester, const Duration(seconds: 1));

      await _holdSos(tester);
      await tester.tap(_dialogSendSos);
      await _pumpFor(tester, const Duration(milliseconds: 500));

      expect(repo.requests, hasLength(1));
      expect(
        find.textContaining('Could not reach the office.'),
        findsOneWidget,
      );
      expect(find.widgetWithText(SnackBarAction, 'CALL OPS'), findsOneWidget);
    });

    testWidgets('Report issue: sends category, description and trip', (
      tester,
    ) async {
      final repo = FakeAlertRepository();
      final router = await _bootDemo(tester, repo);
      router.push(
        AppRoutes.reportIssueFor(
          tripId: 'demo-trip-1024',
          vehicleReg: 'TN 09 AB 1234',
        ),
      );
      await _pumpFor(tester, const Duration(seconds: 1));

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await _pumpFor(tester, const Duration(milliseconds: 500));
      await tester.tap(find.text('Flat Tire / Puncture').last);
      await _pumpFor(tester, const Duration(milliseconds: 500));
      await tester.enterText(find.byType(TextField).first, 'Rear left tyre');
      await tester.ensureVisible(find.text('SUBMIT REPORT'));
      await tester.tap(find.text('SUBMIT REPORT'));
      await _pumpFor(tester, const Duration(milliseconds: 800));

      expect(repo.requests, hasLength(1));
      final r = repo.requests.single;
      expect(r.type, DriverAlertType.vehicleIssue);
      expect(r.category, 'Flat Tire / Puncture');
      expect(r.description, 'Rear left tyre');
      expect(r.bookingId, 'demo-trip-1024');
      expect(find.text('Report Issue'), findsNothing);
    });

    testWidgets('Report issue: failure keeps the form open', (tester) async {
      final repo = FakeAlertRepository()
        ..failWith = const AlertException('The alert was NOT sent.');
      final router = await _bootDemo(tester, repo);
      router.push(AppRoutes.reportIssue);
      await _pumpFor(tester, const Duration(seconds: 1));

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await _pumpFor(tester, const Duration(milliseconds: 500));
      await tester.tap(find.text('Other').last);
      await _pumpFor(tester, const Duration(milliseconds: 500));
      await tester.ensureVisible(find.text('SUBMIT REPORT'));
      await tester.tap(find.text('SUBMIT REPORT'));
      await _pumpFor(tester, const Duration(milliseconds: 800));

      expect(repo.requests, hasLength(1));
      expect(find.text('The alert was NOT sent.'), findsOneWidget);
      expect(find.text('Report Issue'), findsOneWidget);
      expect(find.text('SUBMIT REPORT'), findsOneWidget);
    });
  });
}
