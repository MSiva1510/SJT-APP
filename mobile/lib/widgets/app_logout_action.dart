import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';

class AppLogoutAction extends ConsumerWidget {
  const AppLogoutAction({super.key, this.compact = false});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return IconButton(
      tooltip: 'Log out',
      onPressed: () async {
        final confirmed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Row(
              children: [
                const Expanded(child: Text('Log out?')),
                IconButton(
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context, false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            content: const Text('You will need to sign in again.'),
            actions: [
              FilledButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Log out'),
              ),
            ],
          ),
        );
        if (confirmed == true) {
          await ref.read(authProvider.notifier).logout();
        }
      },
      icon: Icon(compact ? Icons.logout_outlined : Icons.logout),
    );
  }
}
