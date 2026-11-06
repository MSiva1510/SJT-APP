import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/theme_provider.dart';

class AppThemeToggle extends ConsumerWidget {
  const AppThemeToggle({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(themeControllerProvider);
    final dark =
        mode == AppThemeMode.dark ||
        (mode == AppThemeMode.system &&
            Theme.of(context).brightness == Brightness.dark);
    return IconButton(
      tooltip: dark ? 'Switch to light mode' : 'Switch to dark mode',
      onPressed: () => ref
          .read(themeControllerProvider.notifier)
          .setMode(dark ? AppThemeMode.light : AppThemeMode.dark),
      icon: Icon(dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
    );
  }
}
