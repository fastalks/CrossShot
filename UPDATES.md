# 更新日志 / UPDATES

## 2025-12-01 — QR 配对与依赖更新

中文（简要）

- 新增：二维码（QR）配对流程。桌面端会在配对界面展示一个二维码（包含可达地址与 token），移动端扫描后会先向 `GET /health` 验证可达性与 token，再调用 `POST /api/announce` 完成配对并在移动端启动心跳（`/api/heartbeat`）。
- 新增 HTTP 控制接口：`POST /api/announce`、`POST /api/heartbeat`、`POST /api/announce/stop`。
- 隐私：移动端不再在 `deviceInfo` 中上报 `identifierForVendor`（iOS UUID），桌面端 UI 优先显示设备友好名称。
- 持久化：桌面端将截图存入 `userData/screenshots`，并支持清空操作。
- 依赖：将 `mobile_scanner` 升级至 `^7.1.3`（修复 Android 构建中需要声明 `namespace` 的问题）。
- 说明：iOS 原生变更（`AppDelegate`）增加了 MethodChannel/EventChannel 与截图转发，修改后需要重装 pods 并完整 rebuild。

English (summary)

- Added: QR pairing flow. The desktop shows a QR (contains reachable address + token). Mobile scans it, verifies with `GET /health`, then calls `POST /api/announce` to complete pairing and starts heartbeats via `/api/heartbeat`.
- Added HTTP control endpoints: `POST /api/announce`, `POST /api/heartbeat`, `POST /api/announce/stop`.
- Privacy: mobile no longer uploads `identifierForVendor` in `deviceInfo`; desktop UI prefers friendly device name.
- Persistence: desktop persists screenshots under `userData/screenshots` and provides a clear-all action.
- Dependency: `mobile_scanner` upgraded to `^7.1.3` to address Android/AGP `namespace` requirement.
- Note: iOS native additions in `AppDelegate` require `pod install` and a full rebuild to take effect.
