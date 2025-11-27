import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:web_socket_channel/io.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:path/path.dart' as path;
import 'package:flutter/services.dart';
import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';
import 'package:permission_handler/permission_handler.dart';

class ScreenshotService {
  final Dio _dio = Dio();
  static const MethodChannel _methodChannel = MethodChannel('crossshot/screenshot');
  static const EventChannel _eventChannel = EventChannel('crossshot/screenshot_events');

  StreamSubscription<dynamic>? _eventSubscription;
  String? _monitorHost;
  int? _monitorPort;
  Map<String, dynamic>? _monitorDeviceInfo;
  String? _monitorDeviceId;
  Timer? _heartbeatTimer;
  bool _monitoring = false;

  /// 捕获屏幕截图
  Future<File?> captureScreen() async {
    try {
      final path = await _methodChannel.invokeMethod<String>('capture');
      if (path != null && path.isNotEmpty) {
        final file = File(path);
        if (await file.exists()) {
          return file;
        }
      }
      // Native capture failed or returned empty path, fall back to placeholder.
      return _generatePlaceholder();
    } catch (e) {
      print('截图失败: $e');
      return _generatePlaceholder();
    }
  }

  Future<File?> _generatePlaceholder() async {
    try {
      final directory = await getTemporaryDirectory();
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final filePath = '${directory.path}/screenshot_$timestamp.png';

      final placeholder = img.Image(width: 1080, height: 1920);
      img.fill(placeholder, color: img.ColorRgba8(15, 23, 42, 255));
      img.drawString(
        placeholder,
        'CrossShot Placeholder',
        font: img.arial24,
        x: 48,
        y: 64,
        color: img.ColorRgba8(226, 232, 240, 255),
      );
      img.drawString(
        placeholder,
        'Timestamp: ${DateTime.now().toIso8601String()}',
        font: img.arial14,
        x: 48,
        y: 120,
        color: img.ColorRgba8(148, 163, 184, 255),
      );

      final pngBytes = img.encodePng(placeholder);
      final file = File(filePath);
      await file.writeAsBytes(pngBytes, flush: true);
      return file;
    } catch (e) {
      print('占位图生成失败: $e');
      return null;
    }
  }

  Future<bool> ensureOverlayPermission() async {
    if (!Platform.isAndroid) {
      return true;
    }

    var status = await Permission.systemAlertWindow.status;
    if (status.isGranted) {
      return true;
    }

    status = await Permission.systemAlertWindow.request();
    if (status.isGranted) {
      return true;
    }

    await _methodChannel.invokeMethod('openOverlaySettings');
    return false;
  }

  Future<bool> ensureMediaPermission() async {
    if (!Platform.isAndroid) {
      return true;
    }

    if (await _requestAndroidMediaPermission()) {
      return true;
    }

    print('用户拒绝了媒体读取权限');
    return false;
  }

  Future<void> startMonitoring({
    required String host,
    required int port,
    required Map<String, dynamic> deviceInfo,
  }) async {
    _monitorHost = host;
    _monitorPort = port;
    _monitorDeviceInfo = Map<String, dynamic>.from(deviceInfo)
      ..putIfAbsent('platform', () => 'Android');

    if (_monitoring) {
      return;
    }

    try {
      final overlayGranted = await ensureOverlayPermission();
      if (!overlayGranted) {
        print('[CrossShot] Overlay permission denied');
        throw PlatformException(code: 'overlay-denied', message: '未授予悬浮窗权限');
      }

      final mediaGranted = await ensureMediaPermission();
      if (!mediaGranted) {
        print('[CrossShot] Media permission denied');
        throw PlatformException(code: 'media-denied', message: '未授予读取媒体权限');
      }

      await _ensureNotificationPermission();

      print('[CrossShot] Starting monitor service for $host:$port');
      await _methodChannel.invokeMethod('startMonitor');
      _eventSubscription ??= _eventChannel.receiveBroadcastStream().listen(
        _handleMonitorEvent,
        onError: (error) => print('监听事件失败: $error'),
      );
      _monitoring = true;

      // announce to desktop so it can show device connected immediately
      unawaited(_announceDevice(host, port));
      // start heartbeat timer (every 5s)
      try {
        _heartbeatTimer?.cancel();
        _heartbeatTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
          await _sendHeartbeat();
        });
      } catch (e) {
        print('Failed to start heartbeat timer: $e');
      }
    } catch (e) {
      print('启动监听服务失败: $e');
      rethrow;
    }
  }

  Future<bool> _requestAndroidMediaPermission() async {
    if (await Permission.photos.status.isGranted) {
      return true;
    }

    var status = await Permission.photos.request();
    if (status.isGranted) {
      return true;
    }

    // Photos 权限在部分设备上不可用时尝试存储权限。
    status = await Permission.storage.request();
    if (status.isGranted) {
      return true;
    }

    return false;
  }

  Future<void> _ensureNotificationPermission() async {
    if (!Platform.isAndroid) {
      return;
    }

    final status = await Permission.notification.status;
    if (status.isGranted || status.isLimited) {
      return;
    }

    await Permission.notification.request();
  }

  Future<void> stopMonitoring() async {
    if (!_monitoring) {
      return;
    }
    try {
      await _methodChannel.invokeMethod('stopMonitor');
    } catch (e) {
      print('停止监听服务失败: $e');
    }
    await _eventSubscription?.cancel();
    _eventSubscription = null;
    // stop heartbeat timer, then notify desktop that we stopped monitoring
    try {
      _heartbeatTimer?.cancel();
      _heartbeatTimer = null;
    } catch (_) {}
    unawaited(_announceStop());
    _monitoring = false;
  }

  Future<void> _handleMonitorEvent(dynamic event) async {
    if (_monitorHost == null || _monitorPort == null || _monitorDeviceInfo == null) {
      return;
    }

    if (event is! Map) {
      return;
    }

    final type = event['type']?.toString();

    switch (type) {
      case 'overlayTap':
        print('[CrossShot] overlayTap received');
        final file = await captureScreen();
        if (file != null) {
          final info = Map<String, dynamic>.from(_monitorDeviceInfo!)
            ..['source'] = 'overlay';
          final success = await uploadScreenshot(file, _monitorHost!, _monitorPort!, info);
          if (success) {
            unawaited(Future(() async {
              try {
                await file.delete();
              } catch (_) {}
            }));
          }
        }
        break;
      case 'systemScreenshot':
        print('[CrossShot] systemScreenshot event: $event');
        final path = event['path']?.toString();
        if (path == null || path.isEmpty) {
          return;
        }
        final file = File(path);
        if (!await file.exists()) {
          return;
        }
        final info = Map<String, dynamic>.from(_monitorDeviceInfo!)
          ..['source'] = 'system';
        final success = await uploadScreenshot(file, _monitorHost!, _monitorPort!, info);
        if (success) {
          // 删除缓存副本，节省存储
          unawaited(Future(() async {
            try {
              await file.delete();
            } catch (_) {}
          }));
        }
        break;
      default:
        break;
    }
  }

  /// 上传截图到PC端
  Future<bool> uploadScreenshot(
    File screenshot,
    String host,
    int port,
    Map<String, dynamic> deviceInfo,
  ) async {
    try {
      // If a proxy is configured in preferences, send via WebSocket to proxy
      final prefs = await SharedPreferences.getInstance();
      final proxyHost = prefs.getString('proxy_host');
      final proxyPort = prefs.getInt('proxy_port');

      if (proxyHost != null && proxyPort != null) {
        final uri = Uri.parse('ws://$proxyHost:$proxyPort/proxy-upload');
        final channel = IOWebSocketChannel.connect(uri.toString());

        final header = {
          'filename': path.basename(screenshot.path),
          'deviceInfo': deviceInfo,
          'timestamp': DateTime.now().toIso8601String(),
          // optional: targetPeerId could be provided by user in UI
        };

        final bytes = await screenshot.readAsBytes();
        final payload = <int>[];
        payload.addAll(headerToBytes(header));
        payload.addAll([0x0a]); // newline separator
        payload.addAll(bytes);

        channel.sink.add(Uint8List.fromList(payload));
        // wait for a response (optional)
        final future = channel.stream.first.timeout(const Duration(seconds: 8));
        try {
          await future;
          // ignore response content for now
        } catch (_) {}
        await channel.sink.close();
        return true;
      }

      final formData = FormData.fromMap({
        'screenshot': await MultipartFile.fromFile(
          screenshot.path,
          filename: 'screenshot_${DateTime.now().millisecondsSinceEpoch}.png',
        ),
        'deviceInfo': deviceInfo.toString(),
        'timestamp': DateTime.now().toIso8601String(),
      });

      final response = await _dio.post(
        'http://$host:$port/api/upload',
        data: formData,
        options: Options(
          headers: {'Content-Type': 'multipart/form-data'},
        ),
      );

      return response.statusCode == 200;
    } catch (e) {
      print('上传失败: $e');
      return false;
    }
  }

  Future<void> _announceDevice(String host, int port) async {
    try {
      // try to build a stable device id from available info
      String deviceId = 'unknown-${DateTime.now().millisecondsSinceEpoch}';
      if (_monitorDeviceInfo != null) {
        if (_monitorDeviceInfo!['device'] != null) {
          deviceId = _monitorDeviceInfo!['device'].toString();
        } else if (_monitorDeviceInfo!['identifierForVendor'] != null) {
          deviceId = _monitorDeviceInfo!['identifierForVendor'].toString();
        } else if (_monitorDeviceInfo!['model'] != null) {
          deviceId = '${_monitorDeviceInfo!['model']}-${_monitorDeviceInfo!['sdkInt'] ?? ''}';
        }
      }

      // persist computed device id for later stop notifications
      _monitorDeviceId = deviceId;

      final body = {
        'platform': 'android',
        'deviceId': deviceId,
        'deviceInfo': _monitorDeviceInfo,
      };

      await _dio.post('http://$host:$port/api/announce', data: body);
      print('[CrossShot] Announced device to $host:$port');
    } catch (e) {
      print('[CrossShot] Announce failed: $e');
    }
  }

  Future<void> _announceStop() async {
    try {
      if (_monitorHost == null || _monitorPort == null) return;
      final deviceId = _monitorDeviceId ?? 'unknown';
      final body = {'platform': 'android', 'deviceId': deviceId};
      await _dio.post('http://${_monitorHost!}:${_monitorPort!}/api/announce/stop', data: body);
      print('[CrossShot] Announce stop to ${_monitorHost}:${_monitorPort}');
    } catch (e) {
      print('[CrossShot] Announce stop failed: $e');
    }
  }

  Future<void> _sendHeartbeat() async {
    try {
      if (_monitorHost == null || _monitorPort == null) return;
      final deviceId = _monitorDeviceId ?? 'unknown';
      final body = {'platform': 'android', 'deviceId': deviceId, 'deviceInfo': _monitorDeviceInfo};
      await _dio.post('http://${_monitorHost!}:${_monitorPort!}/api/heartbeat', data: body);
      // debug
      // print('[CrossShot] Heartbeat sent to ${_monitorHost}:${_monitorPort}');
    } catch (e) {
      print('[CrossShot] Heartbeat failed: $e');
    }
  }

  Uint8List headerToBytes(Map<String, dynamic> header) {
    final json = jsonEncode(header);
    return Uint8List.fromList(utf8.encode(json));
  }

  Future<void> setUploadProxy(String host, int port) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('proxy_host', host);
    await prefs.setInt('proxy_port', port);
  }
}
