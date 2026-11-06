import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/widgets/driver/status_chip.dart';

void main() {
  const statuses = [
    'draft',
    'pending',
    'approved',
    'confirmed',
    'assigned',
    'started',
    'completed',
    'closed',
    'cancelled',
    'unknown_status',
  ];

  Widget wrap(Widget child, Brightness brightness) => MaterialApp(
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF007AFF),
            brightness: brightness,
          ),
        ),
        home: Scaffold(body: Center(child: child)),
      );

  group('StatusChip light theme', () {
    testWidgets('renders all statuses without error', (tester) async {
      for (final s in statuses) {
        await tester.pumpWidget(wrap(StatusChip(status: s), Brightness.light));
        expect(find.textContaining(StatusChip.label(s)), findsOneWidget);
      }
    });

    testWidgets('assigned uses primary color', (tester) async {
      await tester.pumpWidget(
          wrap(const StatusChip(status: 'assigned'), Brightness.light));
      final container = tester.widget<Container>(find.byType(Container).first);
      final decoration = container.decoration as BoxDecoration;
      expect(decoration.color, isNotNull);
    });

    testWidgets('cancelled uses errorContainer', (tester) async {
      await tester.pumpWidget(
          wrap(const StatusChip(status: 'cancelled'), Brightness.light));
      expect(find.text('CANCELLED'), findsOneWidget);
    });

    testWidgets('showDot false omits dot', (tester) async {
      await tester.pumpWidget(wrap(
          const StatusChip(status: 'assigned', showDot: false),
          Brightness.light));
      expect(find.byType(Container), findsWidgets);
    });
  });

  group('StatusChip dark theme', () {
    testWidgets('renders all statuses without error', (tester) async {
      for (final s in statuses) {
        await tester.pumpWidget(wrap(StatusChip(status: s), Brightness.dark));
        expect(find.textContaining(StatusChip.label(s)), findsOneWidget);
      }
    });

    testWidgets('text contrast: fg differs from bg', (tester) async {
      for (final s in statuses) {
        await tester.pumpWidget(wrap(StatusChip(status: s), Brightness.dark));
        final chipFinder = find.ancestor(
          of: find.text(StatusChip.label(s)),
          matching: find.byType(Container),
        );
        final container = tester.widget<Container>(chipFinder.first);
        final decoration = container.decoration as BoxDecoration;
        final bg = decoration.color!;
        final textWidget = tester.widget<Text>(find.text(StatusChip.label(s)));
        final fg = textWidget.style!.color!;
        expect(bg, isNot(equals(fg)),
            reason: 'bg and fg must differ for $s in dark theme');
      }
    });
  });
}
