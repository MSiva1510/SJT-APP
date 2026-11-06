import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../widgets/manager/manager_ui.dart';
import '../../../../core/theme/home_tokens.dart';

class ManagerMaintenanceScreen extends ConsumerWidget {
  const ManagerMaintenanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context).home;
    return Scaffold(
      backgroundColor: t.canvas,
      appBar: AppBar(title: const Text('Maintenance Tracking')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const MEmpty(
            icon: Icons.build_outlined,
            title: 'No maintenance records',
            message: 'Add service/repair entries for vehicles.',
          ),
        ],
      ),
    );
  }
}
