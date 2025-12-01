// GENERATED: mdns stub v2
// QR-only deployment: mDNS discovery removed.
//
// Minimal, single-definition file — no duplicated content.

import 'package:flutter/foundation.dart';

class MDNSService extends ChangeNotifier {
  /// Empty list — discovery is handled by QR pairing in this build.
  List<Map<String, String>> get discoveredServers => const [];

  /// No-op startDiscovery for QR-only flow.
  Future<void> startDiscovery() async {
    debugPrint('MDNS stub v2: mDNS disabled; use QR pairing');
  }

  /// No-op stopDiscovery.
  Future<void> stopDiscovery({bool notifyListenersOnClear = true}) async {}
}
