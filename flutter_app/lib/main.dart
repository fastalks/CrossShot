import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'screens/home_screen.dart';
import 'services/mdns_service.dart';
import 'services/screenshot_service.dart';
import 'providers/device_provider.dart';

void main() {
  runApp(const CrossShotApp());
}

class CrossShotApp extends StatelessWidget {
  const CrossShotApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => DeviceProvider()),
        ChangeNotifierProvider(create: (_) => MDNSService()),
        ChangeNotifierProvider(create: (_) => ScreenshotService()),
      ],
      child: MaterialApp(
        title: 'CrossShot Mobile',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          useMaterial3: true,
        ),
        home: const HomeScreen(),
      ),
    );
  }
}
