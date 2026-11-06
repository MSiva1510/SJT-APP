// ─────────────────────────────────────────────────────────────────────────────
// wireframe_theme.dart — shared light and dark themes for the mobile app.
// iOS-style light surfaces with a coordinated dark palette for all themes.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter/material.dart';

/// Wireframe blue (buttons, links, active tab).
const kWireBlue = Color(0xFF007AFF);

/// Hero gradient (NEW TRIP / earnings cards).
const kHeroGradient = LinearGradient(
  begin: Alignment.topLeft,
  end:   Alignment.bottomRight,
  colors: [Color(0xFF2F8BFF), Color(0xFF0A4FD6)],
);

ThemeData buildWireframeLightTheme() {
  return _buildWireframeTheme(Brightness.light);
}

ThemeData buildWireframeDarkTheme() {
  return _buildWireframeTheme(Brightness.dark);
}

ThemeData _buildWireframeTheme(Brightness brightness) {
  const seed = kWireBlue;
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    brightness: brightness,
  ).copyWith(
    surface: brightness == Brightness.light
        ? const Color(0xFFF2F2F7)
        : const Color(0xFF101318),
    surfaceContainerLowest: brightness == Brightness.light
        ? Colors.white
        : const Color(0xFF1A1F27),
    surfaceContainerLow: brightness == Brightness.light
        ? const Color(0xFFFAFAFC)
        : const Color(0xFF1A1F27),
    surfaceContainerHigh: brightness == Brightness.light
        ? const Color(0xFFE9EFFA)
        : const Color(0xFF242B35),
    primary: brightness == Brightness.light
        ? seed
        : const Color(0xFF69AFFF),
    onPrimary: brightness == Brightness.light
        ? Colors.white
        : const Color(0xFF081321),
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      scrolledUnderElevation: 0,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.4,
        color: scheme.onSurface,
      ),
      iconTheme: IconThemeData(color: scheme.onSurface),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: scheme.surfaceContainerLowest,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(50),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
        textStyle: const TextStyle(
          fontSize: 15.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerHigh,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.5),
      ),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    chipTheme: const ChipThemeData(
      shape: StadiumBorder(),
    ),
  );
}
