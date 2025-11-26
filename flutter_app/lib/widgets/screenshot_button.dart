import 'package:flutter/material.dart';

class ScreenshotButton extends StatelessWidget {
  final VoidCallback onPressed;
  final bool isLoading;

  const ScreenshotButton({
    super.key,
    required this.onPressed,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      onPressed: isLoading ? null : onPressed,
      icon: isLoading
          ? const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            )
          : const Icon(Icons.camera_alt),
      label: Text(isLoading ? '处理中...' : '截图上传'),
    );
  }
}
