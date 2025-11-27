import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/device_provider.dart';
import '../services/mdns_service.dart';
import '../services/screenshot_service.dart';
import '../widgets/device_info_card.dart';
// screenshot button removed; uploads handled via overlay/service
import '../widgets/server_list.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  late MDNSService _mdnsService;
  late ScreenshotService _screenshotService;
  
  Map<String, String>? _selectedServer;
  bool _monitoring = false;

  @override
  void initState() {
    super.initState();
    _mdnsService = context.read<MDNSService>();
    _screenshotService = Provider.of<ScreenshotService>(context, listen: false);
    _initializeServices();
    // Listen for discovered servers updates to auto-select the first one
    _mdnsService.addListener(_handleMdnsUpdates);
  }

  void _handleMdnsUpdates() {
    if (!mounted) return;
    final discovered = _mdnsService.discoveredServers;
    // If user hasn't selected a server yet and discovery found at least one, auto-select first
    if (!_monitoring && _selectedServer == null && discovered.isNotEmpty) {
      final first = discovered.first;
      setState(() {
        _selectedServer = first;
      });

      // If there is only one discovered server, auto-start monitoring
      if (discovered.length == 1) {
        final deviceProvider = Provider.of<DeviceProvider>(context, listen: false);
        try {
          _screenshotService.startMonitoring(
            host: first['host']!,
            port: int.parse(first['port']!),
            deviceInfo: deviceProvider.deviceInfo,
          ).then((_) {
            if (mounted) {
              setState(() {
                _monitoring = true;
              });
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('已自动开始监听（仅发现一个服务）')),
              );
            }
          }).catchError((e) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('自动开始监听失败: $e')),
              );
            }
          });
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('自动开始监听失败: $e')),
            );
          }
        }
      }
    }
  }

  Future<void> _initializeServices() async {
    await _mdnsService.startDiscovery();
  }

  @override
  void dispose() {
    _mdnsService.removeListener(_handleMdnsUpdates);
    _mdnsService.stopDiscovery(notifyListenersOnClear: false);
    super.dispose();
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
      // screenshot floating button removed for auto-listen flow
    );
  }
}
