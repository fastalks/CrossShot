import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import 'package:dio/dio.dart';
import '../providers/device_provider.dart';
import '../services/screenshot_service.dart';

class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  bool _processing = false;
  final MobileScannerController _controller = MobileScannerController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleBarcode(String raw) async {
    if (_processing) return;
    setState(() => _processing = true);
    var paired = false;

    String baseUrl = raw.trim();
    if (!baseUrl.startsWith('http')) {
      // try to add http if user scanned just host:port
      baseUrl = 'http://$baseUrl';
    }

    // remove trailing slash
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.substring(0, baseUrl.length - 1);

    final dio = Dio();
    Map<String, dynamic>? serverInfo;
    try {
      final healthResp = await dio.get(
        '$baseUrl/health',
        options: Options(receiveTimeout: const Duration(milliseconds: 2000), sendTimeout: const Duration(milliseconds: 2000)),
      );
        if (healthResp.statusCode == 200) {
        // capture server info from /health
        try {
          serverInfo = (healthResp.data is Map) ? Map<String, dynamic>.from(healthResp.data) : null;
        } catch (_) {
          serverInfo = null;
        }
        // success, announce
        final deviceProvider = Provider.of<DeviceProvider>(context, listen: false);
        final info = deviceProvider.deviceInfo;
        // do not send identifierForVendor (UUID) as part of deviceInfo displayed on desktop
        final sentInfo = Map<String, dynamic>.from(info);

        String deviceId = 'ios-${DateTime.now().millisecondsSinceEpoch}';
        if (info['identifierForVendor'] != null) deviceId = info['identifierForVendor'];

        final body = {'platform': 'ios', 'deviceId': deviceId, 'deviceInfo': sentInfo};
        try {
          final announceResp = await dio.post('$baseUrl/api/announce', data: body);
          if (announceResp.statusCode == 200) {
              // Start local monitoring so mobile UI shows connected state and heartbeats begin
              try {
                final uri = Uri.parse(baseUrl);
                final host = uri.host;
                final port = uri.hasPort ? uri.port : 80;
                final screenshotService = Provider.of<ScreenshotService>(context, listen: false);
                await screenshotService.startMonitoring(host: host, port: port, deviceInfo: sentInfo, serverInfo: serverInfo, deviceId: deviceId);
              } catch (e) {
                // ignore startMonitoring errors but still consider pairing successful
                print('startMonitoring failed after announce: $e');
              }

              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('配对成功，已通知桌面并开始本机监听')));
              paired = true;
              Navigator.of(context).pop(true);
              return;
          }
        } catch (e) {
          // announce may still succeed but return other code
          print('announce error: $e');
        }
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('无法连接到该服务或验证失败')));
    } catch (e) {
      print('health check failed: $e');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('无法连接到该服务或验证失败')));
    } finally {
      if (mounted && !paired) setState(() => _processing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('扫描二维码配对')),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              try {
                final barcodes = capture.barcodes;
                if (barcodes.isEmpty) return;
                final raw = barcodes.first.rawValue ?? '';
                if (raw.isNotEmpty) _handleBarcode(raw);
              } catch (e) {
                // ignore
              }
            },
          ),
          if (_processing)
            const Positioned.fill(
              child: ColoredBox(
                color: Colors.black54,
                child: Center(child: CircularProgressIndicator()),
              ),
            ),
        ],
      ),
    );
  }
}
