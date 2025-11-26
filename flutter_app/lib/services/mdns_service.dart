import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:nsd/nsd.dart' as nsd;
import 'package:permission_handler/permission_handler.dart';

class MDNSService extends ChangeNotifier {
  final String _serviceType = '_crossshot._tcp';
  nsd.Discovery? _discovery;
  final List<Map<String, String>> _discoveredServers = [];

  List<Map<String, String>> get discoveredServers => List.unmodifiable(_discoveredServers);

  Future<void> startDiscovery() async {
    await stopDiscovery(notifyListenersOnClear: false);

    try {
      final hasPermissions = await _ensurePermissions();
      if (!hasPermissions) {
        debugPrint('mDNS discovery skipped: required permissions not granted');
        _notifyListeners();
        return;
      }

      _discovery = await nsd.startDiscovery(_serviceType);

      // Seed any already discovered services.
      for (final service in _discovery!.services) {
        _handleServiceUpdate(service, nsd.ServiceStatus.found);
      }

      _discovery?.addServiceListener((service, status) {
        _handleServiceUpdate(service, status);
      });
    } catch (e) {
      debugPrint('mDNS discovery error: $e');
    }
  }

  void _handleServiceUpdate(nsd.Service service, nsd.ServiceStatus status) {
    switch (status) {
      case nsd.ServiceStatus.found:
        _handleServiceFound(service);
        break;
      case nsd.ServiceStatus.lost:
        _handleServiceLost(service);
        break;
    }
  }

  String _resolveHost(nsd.Service service) {
    if (service.host != null && service.host!.isNotEmpty) {
      return service.host!;
    }

    if (service.addresses != null && service.addresses!.isNotEmpty) {
      return service.addresses!.first.address;
    }

    return 'Unknown';
  }

  void _handleServiceFound(nsd.Service service) {
    final host = _resolveHost(service);
    final serverInfo = {
      'name': service.name ?? 'Unknown',
      'host': host,
      'port': service.port?.toString() ?? '8080',
    };

    final exists = _discoveredServers.any(
      (entry) => entry['host'] == serverInfo['host'] && entry['port'] == serverInfo['port'],
    );

    if (!exists) {
      _discoveredServers.add(serverInfo);
      debugPrint('发现服务: ${serverInfo['name']} at ${serverInfo['host']}:${serverInfo['port']}');
      _notifyListeners();
    }
  }

  void _handleServiceLost(nsd.Service service) {
    final host = _resolveHost(service);
    final port = service.port?.toString();

    final previousLength = _discoveredServers.length;
    _discoveredServers.removeWhere((entry) {
      final hostMatches = entry['host'] == host;
      final portMatches = port == null || entry['port'] == port;
      final nameMatches = service.name != null && entry['name'] == service.name;

      return (hostMatches && portMatches) || nameMatches;
    });

    if (_discoveredServers.length != previousLength) {
      _notifyListeners();
    }
  }

  Future<bool> _ensurePermissions() async {
    if (!Platform.isAndroid) {
      return true;
    }

    final androidInfo = await DeviceInfoPlugin().androidInfo;
    final sdkInt = androidInfo.version.sdkInt;

    final permissionsToRequest = <Permission>{};

    if (sdkInt >= 33) {
      permissionsToRequest.add(Permission.nearbyWifiDevices);
    } else {
      permissionsToRequest.add(Permission.locationWhenInUse);
    }

    if (permissionsToRequest.isEmpty) {
      return true;
    }

    final results = <Permission, PermissionStatus>{};

    for (final permission in permissionsToRequest) {
      results[permission] = await permission.request();
    }

    for (final entry in results.entries) {
      final granted = entry.value == PermissionStatus.granted || entry.value == PermissionStatus.limited;
      if (!granted) {
        debugPrint('Permission ${entry.key} denied with status ${entry.value}');
        return false;
      }
    }

    return true;
  }

  Future<void> stopDiscovery({bool notifyListenersOnClear = true}) async {
    if (_discovery != null) {
      try {
        await nsd.stopDiscovery(_discovery!);
      } catch (e) {
        debugPrint('Failed to stop discovery: $e');
      }
      _discovery = null;
    }

    final hadEntries = _discoveredServers.isNotEmpty;
    if (hadEntries) {
      _discoveredServers.clear();
    }

    if (notifyListenersOnClear && hadEntries) {
      _notifyListeners();
    }
  }

  void _notifyListeners() {
    if (!hasListeners) {
      return;
    }

    final scheduler = SchedulerBinding.instance;

    if (scheduler.schedulerPhase == SchedulerPhase.idle ||
        scheduler.schedulerPhase == SchedulerPhase.postFrameCallbacks) {
      notifyListeners();
    } else {
      scheduler.addPostFrameCallback((_) {
        if (hasListeners) {
          notifyListeners();
        }
      });
    }
  }
}
