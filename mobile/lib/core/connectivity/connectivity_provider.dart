import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final connectivityProvider = StreamProvider<bool>((ref) {
  final controller = StreamController<bool>();
  final connectivity = Connectivity();

  Future<void> check() async {
    final results = await connectivity.checkConnectivity();
    final online = !results.contains(ConnectivityResult.none);
    controller.add(online);
  }

  check();
  final sub = connectivity.onConnectivityChanged.listen((_) => check());
  ref.onDispose(() {
    sub.cancel();
    controller.close();
  });
  return controller.stream;
});
