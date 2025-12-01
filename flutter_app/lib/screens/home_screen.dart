import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'qr_scanner_screen.dart';
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
          final sentInfo = Map<String, dynamic>.from(deviceProvider.deviceInfo);
          if (sentInfo.containsKey('identifierForVendor')) sentInfo.remove('identifierForVendor');
          _screenshotService.startMonitoring(
              host: first['host']!,
              port: int.parse(first['port']!),
              deviceInfo: sentInfo,
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
        title: const Text('CrossShot'),
        elevation: 2,
      ),
      body: SafeArea(
        child: Column(
          children: [
            const DeviceInfoCard(),
            const Divider(),
            // show connected PC info when monitoring
            Consumer<ScreenshotService>(builder: (context, ss, _) {
              if (ss.isMonitoring) {
                final host = ss.monitorHost ?? '';
                final port = ss.monitorPort?.toString() ?? '';
                final svc = ss.monitorServerInfo;
                return Card(
                  margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('已连接桌面', style: TextStyle(fontWeight: FontWeight.bold)),
                              const SizedBox(height: 6),
                              Text('地址：$host${port.isNotEmpty ? ':$port' : ''}'),
                              if (svc != null) ...[
                                const SizedBox(height: 4),
                                Text('服务：${svc['service'] ?? 'CrossShot Desktop'}'),
                                Text('版本：${svc['version'] ?? ''}'),
                              ],
                            ],
                          ),
                        ),
                        ElevatedButton(
                          onPressed: () async {
                            try {
                              await ss.stopMonitoring();
                              if (mounted) {
                                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已断开连接')));
                              }
                            } catch (e) {
                              if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('断开连接失败: $e')));
                            }
                          },
                          child: const Text('断开连接'),
                        ),
                      ],
                    ),
                  ),
                );
              }

              // otherwise show server list
              return Expanded(
                child: ServerList(
                  servers: discoveredServers,
                  onSelect: (server) async {
                    setState(() {
                      _selectedServer = server;
                    });

                    if (!_monitoring) {
                      final deviceProvider = Provider.of<DeviceProvider>(context, listen: false);

                      try {
                        final sentInfo = Map<String, dynamic>.from(deviceProvider.deviceInfo);
                        if (sentInfo.containsKey('identifierForVendor')) sentInfo.remove('identifierForVendor');
                        await _screenshotService.startMonitoring(
                          host: server['host']!,
                          port: int.parse(server['port']!),
                          deviceInfo: sentInfo,
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
              );
            }),
          ],
        ),
      ),
      // FAB: show on all platforms to allow QR pairing
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.qr_code_scanner),
        label: const Text('扫码配对'),
        onPressed: () async {
          final res = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => const QRScannerScreen()));
          if (res == true) {
            // user paired via QR
          }
        },
      ),
    );
  }
}


