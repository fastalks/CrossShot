# Flutter 移动端快速启动指南

## 前置要求

确保已安装:
- Flutter SDK (>= 3.0.0)
- Android Studio 或 Xcode
- 连接的设备或模拟器

## 快速启动

### 1. 安装依赖

```bash
cd mobile_app
flutter pub get
```

### 2. 检查设备

```bash
flutter devices
```

### 3. 运行应用

#### Android
```bash
flutter run
```

#### iOS (仅 macOS)
```bash
flutter run -d ios
```

## 常见问题

### 依赖安装失败

```bash
flutter clean
flutter pub get
```

### Android 许可问题

```bash
flutter doctor --android-licenses
```

### iOS 签名问题

在 Xcode 中打开 `ios/Runner.xcworkspace`，配置开发团队。

## 开发模式

热重载: 按 `r`
完全重启: 按 `R`
查看日志: 按 `p`
退出: 按 `q`

## 更多信息

查看 [README.md](../README.md) 获取完整文档。
