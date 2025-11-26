import 'package:flutter/foundation.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

class DeviceProvider extends ChangeNotifier {
  Map<String, dynamic> _deviceInfo = {};

  Map<String, dynamic> get deviceInfo => _deviceInfo;

  DeviceProvider() {
    _loadDeviceInfo();
  }

  Future<void> _loadDeviceInfo() async {
    final deviceInfoPlugin = DeviceInfoPlugin();

    try {
      if (Platform.isAndroid) {
        final androidInfo = await deviceInfoPlugin.androidInfo;
        _deviceInfo = {
          'platform': 'Android',
          'model': androidInfo.model,
          'manufacturer': androidInfo.manufacturer,
          'version': androidInfo.version.release,
          'sdkInt': androidInfo.version.sdkInt,
          'brand': androidInfo.brand,
          'device': androidInfo.device,
        };
      } else if (Platform.isIOS) {
        final iosInfo = await deviceInfoPlugin.iosInfo;
        _deviceInfo = {
          'platform': 'iOS',
          'model': iosInfo.model,
          'name': iosInfo.name,
          'systemVersion': iosInfo.systemVersion,
          'identifierForVendor': iosInfo.identifierForVendor,
        };
      }
      notifyListeners();
    } catch (e) {
      print('获取设备信息失败: $e');
    }
  }

  String get deviceName {
    if (_deviceInfo['platform'] == 'Android') {
      return '${_deviceInfo['manufacturer']} ${_deviceInfo['model']}';
    } else if (_deviceInfo['platform'] == 'iOS') {
      return _deviceInfo['name'] ?? 'iOS Device';
    }
    return 'Unknown Device';
  }

  String get platformVersion {
    if (_deviceInfo['platform'] == 'Android') {
      return 'Android ${_deviceInfo['version']}';
    } else if (_deviceInfo['platform'] == 'iOS') {
      return 'iOS ${_deviceInfo['systemVersion']}';
    }
    return 'Unknown';
  }
}
