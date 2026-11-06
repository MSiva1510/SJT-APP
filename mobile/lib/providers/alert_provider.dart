// ─────────────────────────────────────────────────────────────────────────────
// alert_provider.dart — SOS / vehicle-issue delivery to the office.
// ─────────────────────────────────────────────────────────────────────────────

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../repositories/alert_repository.dart';
import 'auth_provider.dart';

final alertRepositoryProvider = Provider<AlertRepository>((ref) {
  return AlertRepository(ref.watch(supabaseClientProvider));
});
