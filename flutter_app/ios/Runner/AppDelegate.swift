import Flutter
import UIKit
import Photos

@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)
    if let controller = window?.rootViewController as? FlutterViewController {
      let channel = FlutterMethodChannel(name: "crossshot/screenshot", binaryMessenger: controller.binaryMessenger)
      // support multiple method names used by Android implementation
      channel.setMethodCallHandler { [weak controller] call, result in
        let method = call.method
        if method == "capture" {
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
          return
        }

        // iOS: provide stubs for monitor controls used on Android. These do not implement
        // a persistent background monitor on iOS but prevent MissingPluginException and
        // allow the Flutter flow to proceed. Implement platform-specific behavior here if
        // you require real background monitoring on iOS.
        switch method {
        case "startMonitor":
          // no-op on iOS for now
          result(true)
        case "stopMonitor":
          result(true)
        case "canDrawOverlays":
          // iOS does not support system overlay in the same way as Android
          result(false)
        case "openOverlaySettings":
          // open app settings as a best-effort
          if let settingsUrl = URL(string: UIApplication.openSettingsURLString) {
            DispatchQueue.main.async {
              UIApplication.shared.open(settingsUrl, options: [:], completionHandler: nil)
            }
          }
          result(true)
        default:
          result(FlutterMethodNotImplemented)
        }
      }

      // Event channel for screenshot events (stubbed). Android sets events from service.
      class ScreenshotStreamHandler: NSObject, FlutterStreamHandler {
        static var sink: FlutterEventSink?
        func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
          ScreenshotStreamHandler.sink = events
          return nil
        }
        func onCancel(withArguments arguments: Any?) -> FlutterError? {
          ScreenshotStreamHandler.sink = nil
          return nil
        }
      }

      let eventChannel = FlutterEventChannel(name: "crossshot/screenshot_events", binaryMessenger: controller.binaryMessenger)
      eventChannel.setStreamHandler(ScreenshotStreamHandler())
      // Listen for system screenshot notifications and forward the latest image to Flutter
      NotificationCenter.default.addObserver(forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main) { _ in
        // Request photo library access if needed
        PHPhotoLibrary.requestAuthorization { status in
          if #available(iOS 14, *) {
            guard status == .authorized || status == .limited else {
              return
            }
          } else {
            guard status == .authorized else {
              return
            }
          }

          let fetchOptions = PHFetchOptions()
          fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
          fetchOptions.fetchLimit = 1
          let assets = PHAsset.fetchAssets(with: .image, options: fetchOptions)
          guard let asset = assets.firstObject else { return }

          let imageOptions = PHImageRequestOptions()
          imageOptions.isSynchronous = false
          imageOptions.deliveryMode = .highQualityFormat

          PHImageManager.default().requestImageDataAndOrientation(for: asset, options: imageOptions) { data, dataUTI, orientation, info in
            guard let data = data else { return }
            let filename = "crossshot_ios_screenshot_\(Int(Date().timeIntervalSince1970 * 1000)).png"
            let tmpUrl = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(filename)
            do {
              try data.write(to: tmpUrl)
              DispatchQueue.main.async {
                ScreenshotStreamHandler.sink?( ["type": "systemScreenshot", "path": tmpUrl.path] )
              }
            } catch {
              // ignore write errors
            }
          }
        }
      }
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
