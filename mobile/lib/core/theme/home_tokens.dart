import 'package:flutter/material.dart';

/// Design tokens for the manager / wireframe UI.
class HomeTokens {
  const HomeTokens({
    this.canvas = const Color(0xFFF2F2F7),
    this.primary = const Color(0xFF007AFF),
    this.textPrimary = const Color(0xFF1C1C1E),
    this.textSecondary = const Color(0xFF3A3A3C),
    this.card = const Color(0xFFFFFFFF),
    this.cardBorder = const Color(0xFFE5E5EA),
    this.cardRadius = 14,
    this.neutralSurface = const Color(0xFFF2F2F7),
    this.outline = const Color(0xFFE5E5EA),
    this.outlineVariant = const Color(0xFFE5E5EA),
    this.success = const Color(0xFF34C759),
    this.warning = const Color(0xFFFF9500),
    this.danger = const Color(0xFFFF3B30),
    this.surface = const Color(0xFFFFFFFF),
  });

  final Color canvas;
  final Color primary;
  final Color textPrimary;
  final Color textSecondary;
  final Color card;
  final Color cardBorder;
  final double cardRadius;
  final Color neutralSurface;
  final Color outline;
  final Color outlineVariant;
  final Color success;
  final Color warning;
  final Color danger;
  final Color surface;

  static const dark = HomeTokens(
    canvas: Color(0xFF101318),
    primary: Color(0xFF69AFFF),
    textPrimary: Color(0xFFF1F3F6),
    textSecondary: Color(0xFFB5BCC8),
    card: Color(0xFF1A1F27),
    cardBorder: Color(0xFF303743),
    neutralSurface: Color(0xFF242B35),
    outline: Color(0xFF39414D),
    outlineVariant: Color(0xFF39414D),
    success: Color(0xFF4CD787),
    warning: Color(0xFFFFB74D),
    danger: Color(0xFFFF6B6B),
    surface: Color(0xFF1A1F27),
  );
}

extension HomeTokensTheme on ThemeData {
  HomeTokens get home =>
      brightness == Brightness.dark ? HomeTokens.dark : const HomeTokens();
}
