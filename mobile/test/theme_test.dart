import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:sri_jayam_travels_mobile/core/theme/home_tokens.dart';
import 'package:sri_jayam_travels_mobile/core/theme/wireframe_theme.dart';
import 'package:sri_jayam_travels_mobile/widgets/manager/manager_ui.dart';

void main() {
  testWidgets('dark theme uses dark manager surfaces and readable text', (
    tester,
  ) async {
    late HomeTokens tokens;
    await tester.pumpWidget(
      MaterialApp(
        theme: buildWireframeLightTheme(),
        darkTheme: buildWireframeDarkTheme(),
        themeMode: ThemeMode.dark,
        home: Builder(
          builder: (context) {
            tokens = Theme.of(context).home;
            return Scaffold(
              body: MCard(
                child: Text(
                  'Dark card',
                  style: TextStyle(color: tokens.textPrimary),
                ),
              ),
            );
          },
        ),
      ),
    );

    expect(Theme.of(tester.element(find.text('Dark card'))).brightness,
        Brightness.dark);
    expect(tokens.canvas, const Color(0xFF101318));
    expect(tokens.card, const Color(0xFF1A1F27));
    expect(tokens.textPrimary, const Color(0xFFF1F3F6));
    final card = tester.widget<Material>(
      find.descendant(
        of: find.byType(MCard),
        matching: find.byType(Material),
      ),
    );
    expect(card.color, tokens.card);
  });
}
