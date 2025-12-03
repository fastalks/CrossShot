import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../services/screenshot_service.dart';

class GalleryPickerScreen extends StatefulWidget {
  const GalleryPickerScreen({super.key});

  @override
  State<GalleryPickerScreen> createState() => _GalleryPickerScreenState();
}

class _GalleryPickerScreenState extends State<GalleryPickerScreen> {
  final ImagePicker _picker = ImagePicker();
  List<XFile>? _picked;
  bool _sending = false;

  Future<void> _pickImages() async {
    try {
      final images = await _picker.pickMultiImage(imageQuality: 90);
      if (mounted) {
        setState(() {
          _picked = images;
        });
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('选择图片失败: $e')));
    }
  }

  Future<void> _sendAll() async {
    final ss = Provider.of<ScreenshotService>(context, listen: false);
    final host = ss.monitorHost;
    final port = ss.monitorPort;
    if (host == null || port == null) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('未连接到桌面，请先连接后重试')));
      return;
    }

    if (_picked == null || _picked!.isEmpty) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请先选择至少一张图片')));
      return;
    }

    setState(() => _sending = true);
    int success = 0;
    for (final x in _picked!) {
      try {
        final file = File(x.path);
        final info = (ss.monitorDeviceInfo != null && ss.monitorDeviceInfo!.isNotEmpty)
            ? Map<String, dynamic>.from(ss.monitorDeviceInfo!)
            : <String, dynamic>{'platform': Platform.isIOS ? 'ios' : 'android'};
        if (ss.monitorDeviceInfo == null || ss.monitorDeviceInfo!.isEmpty) {
          // Help debugging: log when monitorDeviceInfo is missing or empty
          print('[GalleryPicker] monitorDeviceInfo missing; using fallback: $info');
        } else {
          print('[GalleryPicker] monitorDeviceInfo: $info');
        }
        final ok = await ss.uploadScreenshot(file, host, port, info);
        if (ok) success++;
      } catch (e) {
        // ignore individual failures
      }
    }
    setState(() => _sending = false);
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已发送 $success/${_picked!.length} 张图片')));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('选择相册图片'),
        actions: [
          IconButton(
            icon: const Icon(Icons.photo_library),
            tooltip: '选择图片',
            onPressed: _pickImages,
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _picked == null
                ? Center(
                    child: TextButton.icon(
                      icon: const Icon(Icons.photo),
                      label: const Text('打开相册以选择图片'),
                      onPressed: _pickImages,
                    ),
                  )
                : GridView.builder(
                    padding: const EdgeInsets.all(8),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      mainAxisSpacing: 8,
                      crossAxisSpacing: 8,
                    ),
                    itemCount: _picked!.length,
                    itemBuilder: (context, idx) {
                      final x = _picked![idx];
                      return GestureDetector(
                        onTap: () {
                          setState(() {
                            // toggle selection by removing/adding to list; simpler UX: tap to preview instead
                          });
                        },
                        child: Image.file(File(x.path), fit: BoxFit.cover),
                      );
                    },
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(12.0),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    icon: _sending ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(Icons.send),
                    label: Text(_sending ? '发送中...' : '发送到桌面'),
                    onPressed: _sending ? null : _sendAll,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
