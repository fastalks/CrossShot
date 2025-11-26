import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/device_provider.dart';
import '../services/mdns_service.dart';
import '../services/screenshot_service.dart';
import '../widgets/device_info_card.dart';
import '../widgets/screenshot_button.dart';
import '../widgets/server_list.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late MDNSService _mdnsService;
  late ScreenshotService _screenshotService;
  bool _isSearching = false;
  Map<String, String>? _selectedServer;
  bool _monitoring = false;

  @override
  void initState() {
    super.initState();
    _mdnsService = context.read<MDNSService>();
    _screenshotService = Provider.of<ScreenshotService>(context, listen: false);
    _initializeServices();
  }

  Future<void> _initializeServices() async {
    await _mdnsService.startDiscovery();
  }

  @override
  void dispose() {
    _mdnsService.stopDiscovery(notifyListenersOnClear: false);
    super.dispose();
  }

  Future<void> _captureAndUpload() async {
    final deviceProvider = Provider.of<DeviceProvider>(context, listen: false);
    
    if (_mdnsService.discoveredServers.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('未发现PC端服务，请确保PC端应用已启动')),
        );
      }
      return;
    }

    if (_selectedServer == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('请先选择一个PC端服务')),
        );
      }
      return;
    }

    setState(() => _isSearching = true);

    try {
      final screenshot = await _screenshotService.captureScreen();
      if (screenshot != null) {
        final server = _selectedServer!;
        final success = await _screenshotService.uploadScreenshot(
          screenshot,
          server['host']!,
          int.parse(server['port']!),
          deviceProvider.deviceInfo,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(success ? '截图上传成功！' : '截图上传失败'),
              backgroundColor: success ? Colors.green : Colors.red,
            ),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('错误: $e')),
        );
      }
    } finally {
      setState(() => _isSearching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final discoveredServers = context.watch<MDNSService>().discoveredServers;

    return Scaffold(
      appBar: AppBar(
        title: const Text('CrossShot Mobile'),
        elevation: 2,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const DeviceInfoCard(),
            const Divider(),
            Expanded(
              child: ServerList(
                servers: discoveredServers,
                onSelect: (server) async {
                  setState(() {
                    _selectedServer = server;
                  });

                  if (!_monitoring) {
                    final deviceProvider = Provider.of<DeviceProvider>(context, listen: false);

                    try {
                      await _screenshotService.startMonitoring(
                        host: server['host']!,
                        port: int.parse(server['port']!),
                        deviceInfo: deviceProvider.deviceInfo,
                      );
                      if (mounted) {
                        setState(() {
                          _monitoring = true;
                        });
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('开始监听截图并显示浮窗')),
                        );
                      }
                    } catch (e) {
                      if (mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('开启监听失败: $e')),
                        );
                      }
                    }
                  }
                },
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: ScreenshotButton(
        onPressed: _captureAndUpload,
        isLoading: _isSearching,
      ),
    );
  }
}
