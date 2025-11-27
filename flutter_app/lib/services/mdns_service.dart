import 'dart:io';
import 'dart:convert';
import 'dart:async';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:nsd/nsd.dart' as nsd;
import 'package:permission_handler/permission_handler.dart';

class MDNSService extends ChangeNotifier {
  final String _serviceType = '_crossshot._tcp';
  nsd.Discovery? _discovery;
  final List<Map<String, String>> _discoveredServers = [];
  Timer? _reconcileTimer;
  final Map<String, DateTime> _lastSeen = {};
  // Expected token returned by CrossShot desktop /health endpoint.
  static const String _expectedHealthToken = 'crossshot-health-v1';

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

      // Start a periodic reconciliation to remove services that disappeared
      _reconcileTimer?.cancel();
      _reconcileTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        _reconcileDiscoveredServers();
      });
    } catch (e) {
      debugPrint('mDNS discovery error: $e');
    }
  }

  Future<void> _reconcileDiscoveredServers() async {
    if (_discovery == null) return;

    final currentSet = <String>{};
    try {
      for (final service in _discovery!.services) {
        final host = _resolveHost(service);
        final port = service.port?.toString() ?? '8080';
        currentSet.add('$host:$port');
      }

      debugPrint('mDNS reconcile: currentSet=$currentSet');
      debugPrint('mDNS reconcile: before=${_discoveredServers.map((e) => '${e['host']}:${e['port']}').toList()}');

      // Decide which entries need active probing. If discovery reports the
      // service but our last successful confirmation is recent, we trust it.
      // If discovery reports it but our lastSeen is stale, probe `/health`.
      // Also probe entries that aren't currently in discovery (stale mDNS).
      final now = DateTime.now();
      var changed = false;
      const probeTimeout = Duration(seconds: 2);
      const probeIfOlderThan = Duration(seconds: 5);

      final entriesToCheck = <String>[];

      for (final key in currentSet) {
        final last = _lastSeen[key];
        if (last == null || now.difference(last) > probeIfOlderThan) {
          // need to actively verify this host
          entriesToCheck.add(key);
        } else {
          // recent confirmation exists; ensure UI shows online
          final idx = _discoveredServers.indexWhere((e) => '${e['host']}:${e['port']}' == key);
          if (idx >= 0 && _discoveredServers[idx]['online'] != 'true') {
            _discoveredServers[idx]['online'] = 'true';
            changed = true;
          }
        }
      }

      // Add entries that are known in our list but missing from discovery
      entriesToCheck.addAll(_discoveredServers
          .map((e) => '${e['host']}:${e['port']}')
          .where((k) => !currentSet.contains(k)));

      final httpClient = HttpClient();
      for (final key in entriesToCheck) {
        final parts = key.split(':');
        final host = parts.sublist(0, parts.length - 1).join(':');
        final port = int.tryParse(parts.last) ?? 8080;

        if (host == 'Unknown' || host.isEmpty) {
          debugPrint('mDNS health: skip unknown host for $key');
          continue;
        }

        final uri = Uri.parse('http://${host}:${port}/health');
        try {
          final reqFuture = httpClient.getUrl(uri).then((req) => req.close());
          final resp = await reqFuture.timeout(probeTimeout);
          if (resp.statusCode == 200) {
            try {
              final body = await resp.transform(utf8.decoder).join();
              final Map<String, dynamic> parsed = json.decode(body);
              final token = parsed['token'] as String?;
              final idx = _discoveredServers.indexWhere((e) => '${e['host']}:${e['port']}' == key);
              if (token == _expectedHealthToken) {
                _lastSeen[key] = now;
                if (idx >= 0 && _discoveredServers[idx]['online'] != 'true') {
                  _discoveredServers[idx]['online'] = 'true';
                  changed = true;
                }
                debugPrint('mDNS health: $key OK (token matched)');
              } else {
                if (idx >= 0 && _discoveredServers[idx]['online'] != 'false') {
                  _discoveredServers[idx]['online'] = 'false';
                  changed = true;
                }
                debugPrint('mDNS health: $key token mismatch (${token ?? 'null'})');
              }
            } catch (e) {
              final idx = _discoveredServers.indexWhere((e) => '${e['host']}:${e['port']}' == key);
              if (idx >= 0 && _discoveredServers[idx]['online'] != 'false') {
                _discoveredServers[idx]['online'] = 'false';
                changed = true;
              }
              debugPrint('mDNS health: $key invalid body ($e)');
            }
          } else {
            final idx = _discoveredServers.indexWhere((e) => '${e['host']}:${e['port']}' == key);
            if (idx >= 0 && _discoveredServers[idx]['online'] != 'false') {
              _discoveredServers[idx]['online'] = 'false';
              changed = true;
            }
            debugPrint('mDNS health: $key status=${resp.statusCode}');
          }
        } catch (e) {
          // mark unreachable hosts as offline so UI updates immediately
          final idx = _discoveredServers.indexWhere((e2) => '${e2['host']}:${e2['port']}' == key);
          if (idx >= 0 && _discoveredServers[idx]['online'] != 'false') {
            _discoveredServers[idx]['online'] = 'false';
            changed = true;
          }
          debugPrint('mDNS health: $key unreachable ($e)');
        }
      }
      try {
        httpClient.close(force: true);
      } catch (_) {}

      // Remove entries that haven't been seen recently
      const timeout = Duration(seconds: 12);
      final previousLength = _discoveredServers.length;
      _discoveredServers.removeWhere((entry) {
        final key = '${entry['host']}:${entry['port']}';
        final last = _lastSeen[key];
        if (currentSet.contains(key)) return false;
        if (last == null) return true;
        final remove = now.difference(last) > timeout;
        if (remove) {
          debugPrint('mDNS reconcile: removing $key due to timeout (lastSeen=$last)');
        }
        return remove;
      });

      debugPrint('mDNS reconcile: after=${_discoveredServers.map((e) => '${e['host']}:${e['port']}').toList()}');
      if (_discoveredServers.length != previousLength) {
        debugPrint('mDNS reconcile: removed ${previousLength - _discoveredServers.length} entries');
        changed = true;
      }
      if (changed) {
        _notifyListeners();
      }
    } catch (e) {
      debugPrint('mDNS reconcile error: $e');
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
      // mark as online when first discovered
      'online': 'true',
    };

    final exists = _discoveredServers.any(
      (entry) => entry['host'] == serverInfo['host'] && entry['port'] == serverInfo['port'],
    );

    if (!exists) {
      _discoveredServers.add(serverInfo);
      debugPrint('发现服务: ${serverInfo['name']} at ${serverInfo['host']}:${serverInfo['port']}');
      debugPrint('当前已记录服务数: ${_discoveredServers.length}');
      // record last-seen timestamp
      final key = '${serverInfo['host']}:${serverInfo['port']}';
      _lastSeen[key] = DateTime.now();
      _notifyListeners();
    } else {
      // update last-seen when rediscovered
      final key = '${serverInfo['host']}:${serverInfo['port']}';
      _lastSeen[key] = DateTime.now();
      debugPrint('服务再次被发现，更新 lastSeen: $key');
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
      debugPrint('服务丢失: ${service.name} at $host:$port; 剩余 ${_discoveredServers.length} 个');
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

    // Cancel reconcile timer if running
    _reconcileTimer?.cancel();
    _reconcileTimer = null;

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
