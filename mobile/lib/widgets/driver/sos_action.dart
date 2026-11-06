import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../navigation/app_router.dart';

/// Opens the full SOS flow, which handles location, confirmation, and alert
/// delivery through the fleet-alert backend.
class SosButton extends StatelessWidget {
  const SosButton({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final red = theme.colorScheme.error;

    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: () => context.push(AppRoutes.sosEmergency),
        style: FilledButton.styleFrom(
          backgroundColor: compact
              ? red
              : theme.colorScheme.surfaceContainerHighest,
          foregroundColor: compact ? Colors.white : red,
          elevation: 0,
          padding: EdgeInsets.symmetric(vertical: compact ? 14 : 18),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: const Text(
          'SOS',
          style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }
}
