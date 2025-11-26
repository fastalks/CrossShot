import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(name: "crossshot/screenshot", binaryMessenger: controller.binaryMessenger)
      channel.setMethodCallHandler { [weak controller] call, result in
        guard call.method == "capture" else {
          result(FlutterMethodNotImplemented)
          return
        }

        guard let viewController = controller, let view = viewController.view else {
          result(FlutterError(code: "no-view", message: "无法访问当前视图", details: nil))
          return
        }

        DispatchQueue.main.async {
          let renderer = UIGraphicsImageRenderer(bounds: view.bounds)
          let image = renderer.image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
          }

          guard let data = image.pngData() else {
            result(FlutterError(code: "encode-failed", message: "PNG 编码失败", details: nil))
            return
          }

          let timestamp = Int(Date().timeIntervalSince1970 * 1000)
          let filename = "crossshot_\(timestamp).png"
          let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(filename)

          do {
            try data.write(to: url, options: .atomic)
            result(url.path)
          } catch {
            result(FlutterError(code: "write-failed", message: "写入临时文件失败", details: error.localizedDescription))
          }
        }
      }
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
