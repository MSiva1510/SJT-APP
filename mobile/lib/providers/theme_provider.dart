// ─────────────────────────────────────────────────────────────────────────────
// theme_provider.dart
// App-wide theme mode (system / light / dark) persisted with
// SharedPreferences. Single source of truth consumed by MaterialApp in
// main.dart — no second theme system.
// ─────────────────────────────────────────────────────────────────────────────

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppThemeMode { system, light, dark }

const String _prefsKey = 'sjt_theme_mode';

class ThemeController extends StateNotifier<AppThemeMode> {
  ThemeController() : super(AppThemeMode.system) {
    _restore();
  }

  Future<void> _restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefsKey);
      if (!mounted || saved == null) return;
      state = switch (saved) {
        'light' => AppThemeMode.light,
        'dark' => AppThemeMode.dark,
        _ => AppThemeMode.system,
      };
    } catch (_) {
      // Persistence unavailable — keep system default.
    }
  }

  Future<void> setMode(AppThemeMode mode) async {
    state = mode;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, mode.name);
    } catch (_) {
      // In-memory value still applies for this session.
    }
  }
}

final themeControllerProvider =
    StateNotifierProvider<ThemeController, AppThemeMode>(
  (ref) => ThemeController(),
);

extension AppThemeModeX on AppThemeMode {
  ThemeMode get materialThemeMode => switch (this) {
        AppThemeMode.system => ThemeMode.system,
        AppThemeMode.light => ThemeMode.light,
        AppThemeMode.dark => ThemeMode.dark,
      };

  String get label => switch (this) {
        AppThemeMode.system => 'System default',
        AppThemeMode.light => 'Light',
        AppThemeMode.dark => 'Dark',
      };
}
