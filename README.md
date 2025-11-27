# CrossShot · 跨平台 UI 截图采集与对比

English version: `README_EN.md`

📱 **移动端硬件截图捕获** + 💻 **桌面端像素级对比** + 🔗 **零配置网络发现**

---

## 🧭 目录

1. [项目概览](#项目概览)
2. [核心能力](#核心能力)
3. [仓库结构](#仓库结构)
4. [快速上手](#快速上手)
5. [运行流程](#运行流程)
6. [技术架构](#技术架构)
7. [HTTP API](#http-api)
8. [调试与打包](#调试与打包)
9. [常见问题](#常见问题)
10. [贡献 & 许可证](#贡献--许可证)

## 项目概览

CrossShot 面向移动端 UI 自动化测试场景：Android 前台服务实时监听系统截图事件，通过 mDNS 自动发现桌面端 Electron 应用，上传原始图片并在桌面侧完成像素级 diff、标注和批量管理，帮助测试团队快速判断 UI 回归风险。

## 核心能力

- **移动端 (Flutter)**
  - Android 前台服务监听 MediaStore 截图 & 浮窗按钮手动触发
  - mDNS (NSD) 自动发现局域网内的桌面端服务
  - 多重重试+PNG 重新编码，确保系统截图写入完成后再上传
  - Dio 上传 + 权限、网络状态自动处理

- **桌面端 (Electron + React)**
  - Bonjour 广播 + Express HTTP 服务 (默认 18733)
  - Multer 管理 `userData/screenshots` 目录上的原图存储
  - Pixelmatch + pngjs 生成差异图、统计差异比 & 像素
  - React Renderer 通过 IPC 流化读取截图，规避 `file://` 访问限制
  - 批量选择、删除、时间轴视图

- **通信链路**
  - mDNS 服务名：`_crossshot._tcp`
  - HTTP REST 上传/列表/删除接口
  - 跨平台零配置：同网段即可互通

## 仓库结构

```
CrossShot/
├── electron_app/          # Electron + React 桌面端
│   ├── src/
│   │   ├── index.ts      # 主进程：HTTP、mDNS、IPC、文件管理
│   │   ├── preload.ts    # Renderer Bridge
│   │   └── renderer/     # React UI (截图列表、对比面板)
│   └── package.json
├── flutter_app/           # Flutter 移动端
│   ├── lib/
│   │   ├── services/     # mDNS、截图监控、上传逻辑
│   │   ├── screens/      # 连接、设备、上传 UI
│   │   └── widgets/
│   ├── android/          # 前台服务 + 浮窗（Kotlin）
│   └── pubspec.yaml
├── shared/                # 协议、类型说明等
└── README.md
```

## 快速上手

### 1. 环境要求

| 模块 | 依赖 |
| --- | --- |
| 桌面端 | Node.js ≥ 18、npm 或 pnpm、Electron Forge |
| 移动端 | Flutter ≥ 3.16、Android Studio、(可选)iOS/macOS | 

### 2. 安装 & 运行

```bash
# 桌面端
cd electron_app
npm install
npm run dev           # 启动 Electron + Express + mDNS

# 移动端
cd ../flutter_app
flutter pub get
flutter run           # Android 需真机以获取系统截图
```

> 建议保持两端处于同一 Wi-Fi，首次启动允许所需系统权限（本地网络、通知、悬浮窗、媒体库等）。

## 运行流程

1. **启动桌面端**：Electron 主进程会自动启动 HTTP 服务器、注册 mDNS、监听 IPC。
2. **启动移动端**：Flutter APP 通过 nsd 发现 `CrossShot Desktop`，展示可连接服务。
3. **授权 & 监听**：Android 端申请截图/存储/悬浮窗/前台服务权限，后台监听 MediaStore 截图或浮窗按钮触发。
4. **上传**：检测到新截图 → PNG 重新编码 (确保完整) → 通过 `POST /api/upload` 上传。
5. **展示 & 对比**：Electron 将新截图写入 `userData/screenshots`，React 渲染列表、选择任意两张触发 pixelmatch 对比并展示差异图、差异比统计。

## 技术架构

```
┌─────────────┐ mDNS  ┌─────────────┐
│ Flutter App │◄──────►│ Electron   │
│ Foreground  │ HTTP   │ + Express  │
│ Service     │───────►│ + React    │
└─────────────┘        └─────────────┘
        ▲                     ▼
 MediaStore 监听        IPC 流式读取、像素对比
```

- **移动端栈**：Flutter · Dio · nsd · permission_handler · Kotlin 前台服务 + ContentObserver。
- **桌面端栈**：Electron Forge · React 18 · TypeScript · Express · Multer · Pixelmatch · pngjs。
- **数据流**：PNG/Base64 → HTTP 上传 → 本地文件 → IPC → React Data URL。

## HTTP API

### `POST /api/upload`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `screenshot` | File | 图片（PNG/JPEG，最终以 PNG 统一存储） |
| `deviceInfo` | String | 设备信息字符串 |
| `timestamp` | String | ISO 时间戳 |

响应示例：

```json
{
  "success": true,
  "data": {
    "id": "1700892345123",
    "filename": "screenshot_20231125_101500.png",
    "path": "/Users/.../screenshots/...png",
    "deviceInfo": "Pixel 7 Pro / Android 14",
    "timestamp": "2023-11-25T10:15:00.123Z",
    "size": 1048576
  }
}
```

### `GET /api/screenshots`

返回当前存储的截图元数据数组。

### `DELETE /api/screenshots/:id`

删除对应文件及元数据，返回 `{ "success": true }`。

## 调试与打包

- **Flutter**：`flutter run` 热重载、`flutter logs` 查看服务日志、`flutter clean` 清缓存。
- **Electron**：`npm run dev` 带调试工具、Renderer 日志通过 DevTools、主进程日志在终端。
- **打包**：
  - 移动端：`flutter build apk` / `flutter build appbundle`
  - 桌面端：`npm run make` 或 `npm run package`（Forge 默认配置）

## 常见问题

- **无法发现服务**：确认同一网段、桌面端已启动、macOS 允许本地网络、Android 已授予本地网络权限。
- **上传 0 字节或损坏**：确保 Android 允许文件读写，等待系统 `IS_PENDING=0` 后再上传（已内置重试，仍失败请查看移动端日志）。
- **Electron 无法展示图片**：Renderer 已通过 IPC 获取 Data URL，如仍失败请检查 `userData/screenshots` 是否存在文件以及 IPC 权限。
- **对比结果异常**：确保两张截图分辨率一致，可在设置中调整 Pixelmatch 阈值。

## 贡献 & 许可证

- 欢迎通过 Issue、Pull Request 提交功能需求或缺陷修复。
- 项目采用 [MIT License](LICENSE)。

---

Made with ❤️ for mobile QA teams.
